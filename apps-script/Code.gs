const SECRET_PROPERTY = 'MENU_EXPORT_SECRET'
const MAX_SHEET_NAME_LENGTH = 100
const LEGACY_TOPPINGS_SUFFIX = '-toppings'

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents || '{}')
    const expectedSecret = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY)

    if (!expectedSecret) {
      throw new Error(`Missing Script Property: ${SECRET_PROPERTY}`)
    }

    if (payload.secret !== expectedSecret) {
      return jsonResponse({ success: false, error: 'Unauthorized' })
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet()
    if (!spreadsheet) {
      throw new Error('This Apps Script must be bound to the target Google Spreadsheet.')
    }

    const sheetName = buildBaseSheetName(payload)
    writeRows(spreadsheet, sheetName, payload.rows)
    removeLegacyToppingsSheet(spreadsheet, sheetName)

    return jsonResponse({
      success: true,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
      sheet: sheetName,
    })
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error && error.message ? error.message : String(error),
    })
  }
}

function buildBaseSheetName(payload) {
  const parts = [
    payload.site || 'Web',
    payload.storeName || 'restaurant',
    payload.locale || 'default',
    payload.restaurantId || 'unknown',
  ]

  return sanitizeSheetName(parts.join('-'), MAX_SHEET_NAME_LENGTH)
}

function removeLegacyToppingsSheet(spreadsheet, baseName) {
  const legacyName = makeSheetName(baseName, LEGACY_TOPPINGS_SUFFIX)
  const legacySheet = spreadsheet.getSheetByName(legacyName)

  if (legacySheet) {
    spreadsheet.deleteSheet(legacySheet)
  }
}

function makeSheetName(baseName, suffix) {
  const safeSuffix = String(suffix || '')
  const baseLimit = Math.max(1, MAX_SHEET_NAME_LENGTH - safeSuffix.length)
  const safeBase = sanitizeSheetName(baseName, baseLimit)
  return `${safeBase}${safeSuffix}`
}

function sanitizeSheetName(value, maxLength) {
  const limit = Math.max(1, Number(maxLength) || MAX_SHEET_NAME_LENGTH)
  let name = String(value || '')
    .replace(/[\\/?*\[\]:]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .trim()

  if (!name) {
    name = 'Menu'
  }

  return name.slice(0, limit).replace(/[-\s]+$/g, '') || 'Menu'
}

function writeRows(spreadsheet, sheetName, rows) {
  const values = Array.isArray(rows) ? rows : []
  let sheet = spreadsheet.getSheetByName(sheetName)

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName)
  }

  sheet.clearContents()

  if (values.length === 0) {
    return
  }

  const width = Math.max(...values.map(row => Array.isArray(row) ? row.length : 0))
  if (width === 0) {
    return
  }

  const normalized = values.map(row => {
    const current = Array.isArray(row) ? row.slice(0, width) : []
    while (current.length < width) current.push('')
    return current
  })

  sheet.getRange(1, 1, normalized.length, width).setValues(normalized)
  sheet.setFrozenRows(1)
}

function jsonResponse(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON)
}
