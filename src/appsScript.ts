import { flattenToppingsSheet } from './flatten'
import type { AppsScriptConfig, ParsedMenu } from './types'

interface AppsScriptResponse {
  success?: boolean
  spreadsheetUrl?: string
  error?: string
}

export interface ExportIdentity {
  site: string
  storeName: string
  locale: string
  restaurantId: string
}

const normalizeEndpoint = (endpoint: string): string => endpoint.trim()

export const validateAppsScriptConfig = (config: AppsScriptConfig) => {
  const endpoint = normalizeEndpoint(config.endpoint)
  if (!endpoint) throw new Error('Apps Script Web App URL is required.')

  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new Error('Apps Script Web App URL is invalid.')
  }

  const isAppsScriptHost = url.hostname === 'script.google.com'
  const isWebAppPath = /^\/macros\/s\/[^/]+\/(exec|dev)$/.test(url.pathname)
  if (!isAppsScriptHost || !isWebAppPath) {
    throw new Error('Use a deployed Apps Script Web App URL ending in /exec or /dev.')
  }

  if (!config.secret.trim()) throw new Error('Apps Script secret is required.')
}

export const getExportIdentity = (menu: ParsedMenu): ExportIdentity => ({
  site: menu.provider === 'grab' ? 'Grab' : 'DeliveryK',
  storeName: menu.storeName?.trim() || 'restaurant',
  locale: menu.locale?.trim() || 'default',
  restaurantId: menu.restaurantId?.trim() || 'unknown',
})

export const exportMenuViaAppsScript = async (
  menu: ParsedMenu,
  config: AppsScriptConfig,
): Promise<{ spreadsheetUrl: string }> => {
  validateAppsScriptConfig(config)
  const identity = getExportIdentity(menu)
  const rows = flattenToppingsSheet(menu)

  const response = await fetch(normalizeEndpoint(config.endpoint), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify({
      secret: config.secret,
      ...identity,
      sourceUrl: menu.sourceUrl,
      // Keep the deployed Apps Script contract unchanged. The extension now
      // always sends the full topping-aware schema as the main menu payload.
      // Products without toppings still produce one row with empty topping columns.
      menu: rows,
      toppings: [],
    }),
  })

  if (!response.ok) {
    throw new Error(`Apps Script export failed with HTTP ${response.status}.`)
  }

  const text = await response.text()
  let result: AppsScriptResponse
  try {
    result = JSON.parse(text) as AppsScriptResponse
  } catch {
    throw new Error(`Apps Script returned an invalid response: ${text.slice(0, 160)}`)
  }

  if (!result.success) throw new Error(result.error || 'Apps Script export failed.')
  if (!result.spreadsheetUrl) throw new Error('Apps Script did not return spreadsheetUrl.')

  return { spreadsheetUrl: result.spreadsheetUrl }
}
