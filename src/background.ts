import { exportMenuViaAppsScript, validateAppsScriptConfig } from './appsScript'
import { isSupportedDomain, parseMenuResponse } from './parsers'
import type { AppsScriptConfig, CaptureState, ParsedMenu, RuntimeRequest, RuntimeResponse } from './types'

const STORAGE_KEY = 'captureState'
const APPS_SCRIPT_CONFIG_KEY = 'appsScriptConfig'
const DEBUGGER_VERSION = '1.3'
const EXPORT_TIMEOUT_ALARM = 'menu-export-timeout'
const EXPORT_TIMEOUT_MINUTES = 0.5

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

const getSpreadsheetTitle = (menu: ParsedMenu) => {
  const provider = menu.provider === 'grab' ? 'Grab' : 'DeliveryK'
  const restaurant = menu.restaurantId ? ` ${menu.restaurantId}` : ''
  return `${provider}${restaurant} Menu`
}

const failExport = async (state: CaptureState, error: unknown) => {
  await chrome.alarms.clear(EXPORT_TIMEOUT_ALARM)
  const next: CaptureState = {
    capturing: false,
    exporting: false,
    phase: 'error',
    lastCapture: state.lastCapture,
    lastSheetUrl: state.lastSheetUrl,
    error: formatError(error),
  }
  await setState(next)
  await detach(state.tabId)
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
      error: formatError(error),
    }
    await setState(next)
    return compactState(next)
  }

  if (previous.capturing) await detach(previous.tabId)

  try {
    await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION)
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable')

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

    await chrome.alarms.clear(EXPORT_TIMEOUT_ALARM)
    await setState({
      capturing: false,
      exporting: true,
      phase: 'writing',
      tabId: source.tabId,
      lastCapture: parsed,
    })
    await detach(source.tabId)

    try {
      const config = await getAppsScriptConfig()
      const resultSheet = await exportMenuViaAppsScript(parsed, getSpreadsheetTitle(parsed), config)
      const doneState: CaptureState = {
        capturing: false,
        exporting: false,
        phase: 'done',
        lastCapture: parsed,
        lastSheetUrl: resultSheet.spreadsheetUrl,
      }
      await setState(doneState)
      await chrome.tabs.create({ url: resultSheet.spreadsheetUrl })
    } catch (error) {
      await failExport({
        capturing: false,
        exporting: true,
        phase: 'writing',
        lastCapture: parsed,
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
      await setState({
        capturing: false,
        exporting: false,
        phase: 'error',
        lastCapture: state.lastCapture,
        lastSheetUrl: state.lastSheetUrl,
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
