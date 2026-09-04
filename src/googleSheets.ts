import { flattenMenuSheet, flattenToppingsSheet } from './flatten'
import type { ParsedMenu } from './types'

interface TokenResult {
  token?: string
}

const getToken = async (): Promise<string> => {
  const result = await chrome.identity.getAuthToken({ interactive: true }) as TokenResult | string
  const token = typeof result === 'string' ? result : result?.token
  if (!token) throw new Error('Google authentication did not return an access token.')
  return token
}

const sheetsFetch = async <T>(token: string, url: string, init: RequestInit): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Google Sheets API ${response.status}: ${message}`)
  }

  return response.json() as Promise<T>
}

export const exportMenuToNewSpreadsheet = async (
  menu: ParsedMenu,
  title: string,
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  const token = await getToken()
  const safeTitle = title.trim() || `Menu ${menu.provider} ${new Date().toISOString().slice(0, 10)}`

  const spreadsheet = await sheetsFetch<{ spreadsheetId: string; spreadsheetUrl?: string }>(
    token,
    'https://sheets.googleapis.com/v4/spreadsheets',
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title: safeTitle },
        sheets: [
          { properties: { title: 'Menu' } },
          { properties: { title: 'Menu + Toppings' } },
        ],
      }),
    },
  )

  await sheetsFetch(
    token,
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheet.spreadsheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: [
          { range: "'Menu'!A1", majorDimension: 'ROWS', values: flattenMenuSheet(menu) },
          { range: "'Menu + Toppings'!A1", majorDimension: 'ROWS', values: flattenToppingsSheet(menu) },
        ],
      }),
    },
  )

  return {
    spreadsheetId: spreadsheet.spreadsheetId,
    spreadsheetUrl:
      spreadsheet.spreadsheetUrl ??
      `https://docs.google.com/spreadsheets/d/${spreadsheet.spreadsheetId}`,
  }
}
