# Menu Extractor to Google Sheets

Chrome Extension (Manifest V3) that exports restaurant menu data from the current website directly to a new Google Spreadsheet.

Supported providers:

- Grab
- DeliveryK

## One-click export flow

The extension does **not** capture network traffic continuously.

1. Open a supported restaurant page.
2. Open the extension popup.
3. Click **Export**.
4. The background service worker attaches `chrome.debugger` to the current tab and reloads it once.
5. The first supported menu API response is parsed and normalized.
6. Network capture is stopped immediately after the menu is found.
7. The extension creates a Google Spreadsheet automatically.
8. The generated spreadsheet opens in a new tab.

If no supported menu response is detected within 30 seconds, capture is stopped automatically and the popup shows an error.

The generated spreadsheet contains:

- `Menu`
- `Menu + Toppings`

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
6. Note the generated extension ID for Google OAuth setup.

## Google Sheets OAuth setup

1. Open Google Cloud Console and create/select a project.
2. Enable **Google Sheets API**.
3. Configure the OAuth consent screen. If the app is in Testing mode, add your Google account as a test user.
4. Create an OAuth client for a **Chrome Extension** using the extension ID shown in `chrome://extensions`.
5. Replace this placeholder in `public/manifest.json`:

```json
"client_id": "REPLACE_ME.apps.googleusercontent.com"
```

6. Run `npm run build` again.
7. Reload the extension from `chrome://extensions`.

The extension requests this Google scope:

```text
https://www.googleapis.com/auth/spreadsheets
```

## Capture behavior

### DeliveryK

Matches shop-page responses similar to:

```text
https://api.deliveryk.com/api/shop-page/{restaurantId}/index
```

### Grab

Grab endpoints can change, so the parser does not depend on one hard-coded API path. For JSON responses on `*.grab.com`, it searches nested response data for category arrays containing menu items and normalizes Grab fields such as `ID`, `priceInMinorUnit`, `modifierGroups`, and `modifiers`.

## Price behavior

Prices are exported exactly as numeric values supplied by the provider API. Grab's `priceInMinorUnit` is intentionally kept raw, matching the original Google Apps Script behavior.

## Permissions

- `debugger`: read menu response bodies after the user clicks Export.
- `activeTab`: operate on the current restaurant tab.
- `storage`: persist export progress and the latest result.
- `identity`: authenticate with Google Sheets API.
- `alarms`: stop a capture automatically after 30 seconds if no menu is found.

Chrome displays a strong warning for the `debugger` permission. The extension attaches only after the user clicks **Export** and detaches immediately after a menu is found, an error occurs, or the timeout expires.

## Project structure

```text
src/
  background.ts       One-click capture + export workflow
  googleSheets.ts     Google OAuth + Sheets API export
  flatten.ts          Sheet row generation
  parsers/
    deliveryk.ts
    grab.ts
  App.tsx             Popup with a single Export button
```
