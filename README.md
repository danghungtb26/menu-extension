# Menu Extractor to Google Sheets

Chrome Extension (Manifest V3) that exports restaurant menu data from the current website to a new Google Spreadsheet through a Google Apps Script Web App.

Supported providers:

- Grab
- DeliveryK

No Google Cloud OAuth client or Google Sheets API setup is required.

## One-click export flow

The extension does **not** capture network traffic continuously.

1. Open a supported restaurant page.
2. Open the extension popup.
3. Configure the Apps Script Web App URL and secret once.
4. Click **Export**.
5. The background service worker attaches `chrome.debugger` to the current tab and reloads it once.
6. The first supported menu API response is parsed and normalized.
7. Network capture is stopped immediately after the menu is found.
8. The normalized rows are POSTed to your Apps Script Web App.
9. Apps Script creates a new Google Spreadsheet and writes the data.
10. The generated spreadsheet opens in a new tab.

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

## Apps Script Web App setup

The server-side script is included in:

```text
apps-script/Code.gs
```

### 1. Create the Apps Script project

1. Open Google Apps Script.
2. Create a new project.
3. Replace the default code with `apps-script/Code.gs` from this repository.

### 2. Configure the secret

In the Apps Script project:

1. Open **Project Settings**.
2. Under **Script Properties**, add:

```text
Property: MENU_EXPORT_SECRET
Value:    choose-a-long-random-secret
```

Use the same value in the extension popup's **Secret** field.

The secret is stored locally by the extension in `chrome.storage.local`. It is not committed to this repository.

### 3. Deploy as a Web App

1. Click **Deploy → New deployment**.
2. Select **Web app**.
3. Set **Execute as** to yourself.
4. Set access so the extension can call the endpoint without an interactive Google login (normally **Anyone** for a personal deployment; Workspace policy may restrict this option).
5. Deploy and authorize the script.
6. Copy the generated URL ending in `/exec`.

Example:

```text
https://script.google.com/macros/s/AKfycb.../exec
```

### 4. Configure the extension

Open the extension popup and enter:

- **Web App URL**: the `/exec` URL from the deployment.
- **Secret**: the same `MENU_EXPORT_SECRET` value.

The values are saved locally, so this is normally a one-time setup.

## Apps Script payload

The extension sends a JSON payload containing:

```text
secret
provider
restaurantId
sourceUrl
title
menu
toppings
```

`menu` and `toppings` are already flattened two-dimensional arrays. Apps Script only creates the spreadsheet and writes the rows.

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
- `storage`: persist export progress plus Apps Script URL/secret.
- `alarms`: stop a capture automatically after 30 seconds if no menu is found.
- Host access to `script.google.com` and `script.googleusercontent.com`: POST the exported rows to the configured Apps Script Web App.

The extension no longer requests Chrome `identity`, Google OAuth, or direct Google Sheets API access.

Chrome displays a strong warning for the `debugger` permission. The extension attaches only after the user clicks **Export** and detaches immediately after a menu is found, an error occurs, or the timeout expires.

## Project structure

```text
apps-script/
  Code.gs             Apps Script Web App endpoint
src/
  appsScript.ts       Apps Script HTTP client
  background.ts       One-click capture + export workflow
  flatten.ts          Sheet row generation
  parsers/
    deliveryk.ts
    grab.ts
  App.tsx             Popup config + single Export button
```
