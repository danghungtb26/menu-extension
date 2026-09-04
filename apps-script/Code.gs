const SECRET_PROPERTY = 'MENU_EXPORT_SECRET'

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

    const title = String(payload.title || 'Restaurant Menu').trim() || 'Restaurant Menu'
    const spreadsheet = SpreadsheetApp.create(title)

    writeRows(spreadsheet, 'Menu', payload.menu)
    writeRows(spreadsheet, 'Menu + Toppings', payload.toppings)

    const defaultSheet = spreadsheet.getSheets()[0]
    if (defaultSheet && !['Menu', 'Menu + Toppings'].includes(defaultSheet.getName())) {
      spreadsheet.deleteSheet(defaultSheet)
    }

    return jsonResponse({
      success: true,
      spreadsheetId: spreadsheet.getId(),
      spreadsheetUrl: spreadsheet.getUrl(),
    })
  } catch (error) {
    return jsonResponse({
      success: false,
      error: error && error.message ? error.message : String(error),
    })
  }
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
