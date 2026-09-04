# Menu Extractor to Google Sheets

Chrome Extension (Manifest V3) that captures restaurant menu APIs from the current page and exports them into a Google Spreadsheet through a bound Google Apps Script Web App.

Supported providers:

- Grab
- DeliveryK

## Export flow

The extension does **not** capture network traffic continuously.

1. Open a supported restaurant page.
2. Choose the locale/language you want on that website.
3. Open the extension popup.
4. Click **Export**.
5. The background service worker attaches `chrome.debugger` to the current tab and reloads it once.
6. The first supported menu API response is parsed and normalized.
7. The extension reads page metadata such as store name and locale.
8. Network capture stops immediately after the menu is found.
9. The normalized rows are POSTed to the configured Apps Script Web App.
10. Apps Script writes the rows into the Google Sheet that owns the script.

If no supported menu response is detected within 30 seconds, capture is stopped automatically and the popup shows an error.

## Locale-aware sheet names

Each store/locale gets deterministic worksheet names based on:

```text
web-storeName-locale-restaurantId
```

Example:

```text
Grab-Pho 24-vi-VN-merchant-123
Grab-Pho 24-vi-VN-merchant-123-toppings
```

If the same restaurant is exported again with the same locale, those two tabs are cleared and rewritten.

If the website is switched to another locale and exported again, another pair of tabs is created, for example:

```text
Grab-Pho 24-en-US-merchant-123
Grab-Pho 24-en-US-merchant-123-toppings
```

This allows one bound spreadsheet to keep multiple locale versions for the same restaurant without overwriting each other.

Google Sheets worksheet names are sanitized and truncated to the 100-character limit when necessary.

## Development

```bash
npm install
npm test
npm run build
```

The production extension is generated in `dist/`.

## Load the extension locally

1. Run `npm run build`.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `dist` directory.

No Google OAuth client ID or Google Cloud billing setup is required.

## Google Apps Script setup

Use a container-bound Apps Script so exports are written directly into the Google Sheet you want.

1. Open the target Google Spreadsheet.
2. Open **Extensions → Apps Script**.
3. Replace the Apps Script code with `apps-script/Code.gs` from this repository.
4. Open **Project Settings → Script Properties**.
5. Add:

```text
MENU_EXPORT_SECRET = your-long-random-secret
```

6. Choose **Deploy → New deployment → Web app**.
7. Set **Execute as** to yourself.
8. Set access so the extension can POST to the Web App.
9. Deploy and copy the URL ending in `/exec`.
10. Paste the Web App URL and the same secret into the extension popup.

The Apps Script uses:

```js
SpreadsheetApp.getActiveSpreadsheet()
```

so no spreadsheet ID is required when the script is created from the target Google Sheet.

## Capture behavior

### DeliveryK

Matches shop-page responses similar to:

```text
https://api.deliveryk.com/api/shop-page/{restaurantId}/index
```

### Grab

Grab endpoints can change, so the parser does not depend on one hard-coded API path. For JSON responses on `*.grab.com`, it searches nested response data for category arrays containing menu items and normalizes Grab fields such as `ID`, `priceInMinorUnit`, `modifierGroups`, and `modifiers`.

## Store name and locale detection

Before reloading the page, the extension captures page metadata through Chrome DevTools Protocol:

- store name: page `h1`, then Open Graph title, then document title
- locale: API/page URL locale parameter or locale path segment when available, then `<html lang>`, then browser language
- restaurant ID: provider API URL

The detected metadata is attached to the normalized menu before export.

## Price behavior

Prices are exported exactly as numeric values supplied by the provider API. Grab's `priceInMinorUnit` is intentionally kept raw, matching the original Google Apps Script behavior.

## Permissions

- `debugger`: read menu response bodies and page metadata after the user clicks Export.
- `activeTab`: operate on the current restaurant tab.
- `storage`: persist Apps Script configuration and export progress.
- `alarms`: stop a capture automatically after 30 seconds if no menu is found.

Chrome displays a strong warning for the `debugger` permission. The extension attaches only after the user clicks **Export** and detaches immediately after a menu is found, an error occurs, or the timeout expires.

## Project structure

```text
apps-script/
  Code.gs             Bound Apps Script Web App writer
src/
  background.ts       One-click capture + page metadata workflow
  appsScript.ts       Apps Script Web App client
  flatten.ts          Sheet row generation
  parsers/
    deliveryk.ts
    grab.ts
  App.tsx             Popup configuration + Export button
```
