# Menu Extractor to Google Sheets

Chrome Extension (Manifest V3) that captures restaurant menu APIs from the current page and exports them into a Google Spreadsheet through a bound Google Apps Script Web App.

Supported providers:

- Grab
- DeliveryK

## Export flow

The extension does **not** capture network traffic continuously.

1. Open a supported restaurant page.
2. Open the extension popup.
3. Click **Export**.
4. The background service worker attaches `chrome.debugger` to the current tab and reloads it once.
5. The first supported menu API response is parsed and normalized.
6. The extension reads page metadata such as store name and locale.
7. Network capture stops immediately after the menu is found.
8. Provider-specific locale export runs.
9. The normalized rows are POSTed to the configured Apps Script Web App.
10. Apps Script writes the rows into the Google Sheet that owns the script.

If no supported menu response is detected within 30 seconds, capture is stopped automatically and the popup shows an error.

## DeliveryK: one-click all-locale export

DeliveryK uses the request header `locale` to select menu language. After the extension detects the shop-page API once, it calls the same endpoint directly for these locales:

```text
vi
en
ko
ja
zh
th
```

For example, the URL remains unchanged:

```text
https://api.deliveryk.com/api/shop-page/{restaurantId}/index?width=1825
```

and only the header changes:

```text
locale: vi
locale: en
locale: ko
locale: ja
locale: zh
locale: th
```

So a single **Export** click creates or updates all six locale tab pairs without changing the website language or reloading the page six times.

Grab currently exports the locale loaded by the website.

## Locale-aware sheet names

Each store/locale gets deterministic worksheet names based on:

```text
web-storeName-locale-restaurantId
```

Example for DeliveryK:

```text
DeliveryK-Pho 24-vi-123
DeliveryK-Pho 24-vi-123-toppings
DeliveryK-Pho 24-en-123
DeliveryK-Pho 24-en-123-toppings
DeliveryK-Pho 24-ko-123
DeliveryK-Pho 24-ko-123-toppings
```

If the same restaurant is exported again, the matching tabs are cleared and rewritten instead of duplicated.

This allows one bound spreadsheet to keep multiple locale versions for the same restaurant without overwriting other locales.

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

After detecting the endpoint, the extension directly fetches it once per supported locale using the `locale` request header.

### Grab

Grab endpoints can change, so the parser does not depend on one hard-coded API path. For JSON responses on `*.grab.com`, it searches nested response data for category arrays containing menu items and normalizes Grab fields such as `ID`, `priceInMinorUnit`, `modifierGroups`, and `modifiers`.

## Store name and locale detection

Before reloading the page, the extension captures page metadata through Chrome DevTools Protocol:

- store name: page `h1`, then Open Graph title, then document title
- Grab locale: API/page URL locale parameter or locale path segment when available, then `<html lang>`, then browser language
- DeliveryK locale: explicitly assigned from the `locale` request header for each generated export
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
  Code.gs                 Bound Apps Script Web App writer
src/
  background.ts           One-click capture + provider export workflow
  appsScript.ts           Apps Script Web App client
  deliverykLocales.ts     DeliveryK locale-header requests
  flatten.ts              Sheet row generation
  parsers/
    deliveryk.ts
    grab.ts
  App.tsx                 Popup configuration + Export button
```
