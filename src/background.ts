import { exportMenuViaAppsScript, validateAppsScriptConfig } from './appsScript'
import { fetchDeliveryKLocaleMenus, findLatestDeliveryKShopPageUrl } from './deliverykLocales'
import { isSupportedDomain, parseMenuResponse } from './parsers'
import type { AppsScriptConfig, CaptureState, ParsedMenu, RuntimeRequest, RuntimeResponse } from './types'

const STORAGE_KEY = 'captureState'
const APPS_SCRIPT_CONFIG_KEY = 'appsScriptConfig'
const EXPORT_CONTEXT_KEY = 'exportPageContext'
const DEBUGGER_VERSION = '1.3'
const EXPORT_TIMEOUT_ALARM = 'menu-export-timeout'
const EXPORT_TIMEOUT_MINUTES = 0.5

interface ExportPageContext {
  storeName: string
  locale: string
  pageUrl: string
}

const emptyState = (): CaptureState => ({
  capturing: false,
  exporting: false,
  phase: 'idle',
})

const getState = async (): Promise<CaptureState> => {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as CaptureState | undefined) ?? emptyState()
}

const getAppsScriptConfig = async (): Promise<AppsScriptConfig> => {
  const result = await chrome.storage.local.get(APPS_SCRIPT_CONFIG_KEY)
  const config = result[APPS_SCRIPT_CONFIG_KEY] as AppsScriptConfig | undefined
  if (!config) throw new Error('Apps Script Web App is not configured.')
  validateAppsScriptConfig(config)
  return config
}

const getExportPageContext = async (): Promise<ExportPageContext> => {
  const result = await chrome.storage.local.get(EXPORT_CONTEXT_KEY)
  return (result[EXPORT_CONTEXT_KEY] as ExportPageContext | undefined) ?? {
    storeName: '',
    locale: '',
    pageUrl: '',
  }
}

const compactState = (state: CaptureState): CaptureState =>
  Object.fromEntries(Object.entries(state).filter(([, value]) => value !== undefined)) as unknown as CaptureState

const setState = async (state: CaptureState) => {
  const persistedState = compactState(state)
  await chrome.storage.local.set({ [STORAGE_KEY]: persistedState })
  try {
    await chrome.runtime.sendMessage({ type: 'CAPTURE_UPDATED', state: persistedState })
  } catch {
    // The popup may be closed. Persisted state is the source of truth.
  }
}

const detach = async (tabId?: number) => {
  if (tabId === undefined) return
  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    // Already detached.
  }
}

const formatError = (error: unknown) => error instanceof Error ? error.message : String(error)

const normalizeLocale = (value: string): string => {
  const normalized = value.trim().replace(/_/g, '-')
  if (!normalized) return ''

  const [language, region, ...rest] = normalized.split('-').filter(Boolean)
  if (!language) return ''

  return [
    language.toLowerCase(),
    region?.length === 2 ? region.toUpperCase() : region,
    ...rest,
  ].filter(Boolean).join('-')
}

const localeFromUrl = (value: string): string => {
  if (!value) return ''

  try {
    const url = new URL(value)
    for (const key of ['locale', 'lang', 'language', 'languageCode', 'localeCode']) {
      const locale = url.searchParams.get(key)
      if (locale) return normalizeLocale(locale)
    }

    const segment = url.pathname
      .split('/')
      .filter(Boolean)
      .find(part => /^[a-z]{2}(?:[-_][a-z]{2})?$/i.test(part))

    return segment ? normalizeLocale(segment) : ''
  } catch {
    return ''
  }
}

const resolveLocale = (context: ExportPageContext, responseUrl: string): string =>
  localeFromUrl(responseUrl) ||
  localeFromUrl(context.pageUrl) ||
  normalizeLocale(context.locale) ||
  'default'

const cleanStoreName = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return 'restaurant'

  const withoutProviderSuffix = trimmed.replace(
    /\s*(?:[-|·]\s*)(?:GrabFood|Grab|DeliveryK)(?:\s.*)?$/i,
    '',
  ).trim()

  return withoutProviderSuffix || trimmed
}

const isDeliveryKPage = (value: string): boolean => {
  try {
    return /(^|\.)deliveryk\.com$/i.test(new URL(value).hostname)
  } catch {
    return false
  }
}

const isDeliveryKCategoryPage = (value: string): boolean => {
  try {
    const url = new URL(value)
    return /(^|\.)deliveryk\.com$/i.test(url.hostname) && url.pathname.includes('/category-shops')
  } catch {
    return false
  }
}

const readPageContext = async (tabId: number): Promise<ExportPageContext> => {
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: `(() => {
          const text = value => typeof value === 'string' ? value.trim() : '';
          const h1 = text(document.querySelector('h1')?.textContent);
          const ogTitle = text(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));
          return {
            storeName: h1 || ogTitle || text(document.title),
            locale: text(document.documentElement.lang) || text(navigator.language),
            pageUrl: location.href,
          };
        })()`,
        returnByValue: true,
      },
    ) as { result?: { value?: ExportPageContext } }

    return result.result?.value ?? { storeName: '', locale: '', pageUrl: '' }
  } catch {
    return { storeName: '', locale: '', pageUrl: '' }
  }
}

const readLoadedResourceUrls = async (tabId: number): Promise<string[]> => {
  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: `performance.getEntriesByType('resource').map(entry => entry.name)`,
        returnByValue: true,
      },
    ) as { result?: { value?: unknown } }

    return Array.isArray(result.result?.value)
      ? result.result.value.filter((value): value is string => typeof value === 'string')
      : []
  } catch {
    return []
  }
}

const failExport = async (state: CaptureState, error: unknown) => {
  await chrome.alarms.clear(EXPORT_TIMEOUT_ALARM)
  await chrome.storage.local.remove(EXPORT_CONTEXT_KEY)
  const next: CaptureState = {
    capturing: false,
    exporting: false,
    phase: 'error',
    lastCapture: state.lastCapture,
    lastSheetUrl: state.lastSheetUrl,
    lastExportedLocales: state.lastExportedLocales,
    error: formatError(error),
  }
  await setState(next)
  await detach(state.tabId)
}

const exportMenus = async (
  menus: ParsedMenu[],
  preferredMenu: ParsedMenu,
  tabId: number,
): Promise<void> => {
  const config = await getAppsScriptConfig()
  let spreadsheetUrl = ''

  for (const menu of menus) {
    const result = await exportMenuViaAppsScript(menu, config)
    spreadsheetUrl = result.spreadsheetUrl
  }

  await chrome.storage.local.remove(EXPORT_CONTEXT_KEY)

  const doneState: CaptureState = {
    capturing: false,
    exporting: false,
    phase: 'done',
    lastCapture: preferredMenu,
    lastSheetUrl: spreadsheetUrl,
    lastExportedLocales: menus.map(menu => menu.locale || 'default'),
  }
  await setState(doneState)

  if (spreadsheetUrl) {
    await chrome.tabs.create({ url: spreadsheetUrl })
  }

  await detach(tabId)
}

const exportLoadedDeliveryKShop = async (
  tabId: number,
  sourceUrl: string,
  context: ExportPageContext,
): Promise<CaptureState> => {
  const storeName = cleanStoreName(context.storeName)
  const currentLocale = normalizeLocale(context.locale) || 'vi'

  const writingState: CaptureState = {
    capturing: false,
    exporting: true,
    phase: 'writing',
    tabId,
  }
  await setState(writingState)
  await detach(tabId)

  try {
    const menus = await fetchDeliveryKLocaleMenus(sourceUrl, storeName)
    const preferredLanguage = currentLocale.split('-')[0]
    const preferredMenu = menus.find(menu => menu.locale === preferredLanguage) ?? menus[0]
    await exportMenus(menus, preferredMenu, tabId)
    return await getState()
  } catch (error) {
    await failExport(writingState, error)
    return await getState()
  }
}

const startExport = async (tabId: number, config: AppsScriptConfig): Promise<CaptureState> => {
  const previous = await getState()
  if (previous.exporting) return previous

  try {
    validateAppsScriptConfig(config)
    await chrome.storage.local.set({ [APPS_SCRIPT_CONFIG_KEY]: config })
  } catch (error) {
    const next: CaptureState = {
      capturing: false,
      exporting: false,
      phase: 'error',
      lastCapture: previous.lastCapture,
      lastSheetUrl: previous.lastSheetUrl,
      lastExportedLocales: previous.lastExportedLocales,
      error: formatError(error),
    }
    await setState(next)
    return compactState(next)
  }

  if (previous.capturing) await detach(previous.tabId)

  try {
    await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION)
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable')

    const context = await readPageContext(tabId)
    await chrome.storage.local.set({ [EXPORT_CONTEXT_KEY]: context })

    if (isDeliveryKPage(context.pageUrl)) {
      const resourceUrls = await readLoadedResourceUrls(tabId)
      const loadedShopUrl = findLatestDeliveryKShopPageUrl(resourceUrls)

      if (loadedShopUrl) {
        return await exportLoadedDeliveryKShop(tabId, loadedShopUrl, context)
      }

      if (isDeliveryKCategoryPage(context.pageUrl)) {
        const next: CaptureState = {
          capturing: false,
          exporting: false,
          phase: 'error',
          lastCapture: previous.lastCapture,
          lastSheetUrl: previous.lastSheetUrl,
          lastExportedLocales: previous.lastExportedLocales,
          error: 'Open a DeliveryK restaurant from this list first, then click Export. No loaded shop-page API was found.',
        }
        await chrome.storage.local.remove(EXPORT_CONTEXT_KEY)
        await setState(next)
        await detach(tabId)
        return next
      }
    }

    const next: CaptureState = {
      capturing: true,
      exporting: true,
      phase: 'capturing',
      tabId,
    }
    await setState(next)

    await chrome.alarms.clear(EXPORT_TIMEOUT_ALARM)
    await chrome.alarms.create(EXPORT_TIMEOUT_ALARM, { delayInMinutes: EXPORT_TIMEOUT_MINUTES })
    await chrome.tabs.reload(tabId)

    return next
  } catch (error) {
    await chrome.storage.local.remove(EXPORT_CONTEXT_KEY)
    const next: CaptureState = {
      capturing: false,
      exporting: false,
      phase: 'error',
      error: formatError(error),
    }
    await setState(next)
    await detach(tabId)
    return next
  }
}

const decodeBody = (body: string, base64Encoded?: boolean): string => {
  if (!base64Encoded) return body
  const binary = atob(body)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const handleResponse = async (source: chrome.debugger.Debuggee, params: any) => {
  if (source.tabId === undefined) return

  const state = await getState()
  if (!state.capturing || !state.exporting || state.tabId !== source.tabId) return

  const responseUrl = params?.response?.url as string | undefined
  if (!responseUrl || !isSupportedDomain(responseUrl)) return

  const mimeType = String(params?.response?.mimeType ?? '').toLowerCase()
  const resourceType = String(params?.type ?? '').toLowerCase()
  const mightBeJson = mimeType.includes('json') || resourceType === 'xhr' || resourceType === 'fetch'
  if (!mightBeJson) return

  try {
    const result = await chrome.debugger.sendCommand(
      { tabId: source.tabId },
      'Network.getResponseBody',
      { requestId: params.requestId },
    ) as { body?: string; base64Encoded?: boolean }

    if (!result?.body) return

    const payload = JSON.parse(decodeBody(result.body, result.base64Encoded))
    const parsed = parseMenuResponse(responseUrl, payload)
    if (!parsed || parsed.categories.length === 0) return

    const context = await getExportPageContext()
    const storeName = cleanStoreName(context.storeName)
    const currentLocale = resolveLocale(context, responseUrl)
    const detected = {
      ...parsed,
      storeName,
      locale: currentLocale,
    }

    await chrome.alarms.clear(EXPORT_TIMEOUT_ALARM)
    await setState({
      capturing: false,
      exporting: true,
      phase: 'writing',
      tabId: source.tabId,
      lastCapture: detected,
    })
    await detach(source.tabId)

    try {
      if (parsed.provider === 'deliveryk') {
        const menus = await fetchDeliveryKLocaleMenus(responseUrl, storeName)
        const preferredLanguage = normalizeLocale(currentLocale).split('-')[0]
        const preferredMenu = menus.find(menu => menu.locale === preferredLanguage) ?? menus[0]
        await exportMenus(menus, preferredMenu, source.tabId)
        return
      }

      await exportMenus([detected], detected, source.tabId)
    } catch (error) {
      await failExport({
        capturing: false,
        exporting: true,
        phase: 'writing',
        lastCapture: detected,
        tabId: source.tabId,
      }, error)
    }
  } catch {
    // Most responses are unrelated to menus or may have expired bodies.
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Network.responseReceived') void handleResponse(source, params)
})

chrome.debugger.onDetach.addListener(source => {
  void (async () => {
    const state = await getState()
    if (source.tabId === state.tabId && state.capturing) {
      await chrome.alarms.clear(EXPORT_TIMEOUT_ALARM)
      await chrome.storage.local.remove(EXPORT_CONTEXT_KEY)
      await setState({
        capturing: false,
        exporting: false,
        phase: 'error',
        lastCapture: state.lastCapture,
        lastSheetUrl: state.lastSheetUrl,
        lastExportedLocales: state.lastExportedLocales,
        error: 'Network capture stopped before a menu response was found.',
      })
    }
  })()
})

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== EXPORT_TIMEOUT_ALARM) return

  void (async () => {
    const state = await getState()
    if (!state.exporting || !state.capturing || state.phase !== 'capturing') return

    await chrome.storage.local.remove(EXPORT_CONTEXT_KEY)
    const timeoutState: CaptureState = {
      capturing: false,
      exporting: false,
      phase: 'error',
      error: 'No supported menu API response was detected within 30 seconds.',
    }
    await setState(timeoutState)
    await detach(state.tabId)
  })()
})

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  void (async () => {
    try {
      if (request.type === 'GET_STATE') {
        sendResponse({ ok: true, state: await getState() } satisfies RuntimeResponse)
        return
      }

      if (request.type === 'EXPORT_CURRENT_TAB') {
        sendResponse({ ok: true, state: await startExport(request.tabId, request.config) } satisfies RuntimeResponse)
        return
      }

      sendResponse({ ok: false, error: 'Unknown request' } satisfies RuntimeResponse)
    } catch (error) {
      sendResponse({
        ok: false,
        error: formatError(error),
      } satisfies RuntimeResponse)
    }
  })()

  return true
})
