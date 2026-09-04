# Menu Extractor to Google Sheets

Chrome Extension (Manifest V3) that captures restaurant menu API responses directly from the current website and exports normalized menu data to a new Google Spreadsheet.

Supported providers in the first version:

- Grab
- DeliveryK

## What it does

1. Open a restaurant page in Chrome.
2. Open the extension and click **Start capture + reload**.
3. The extension attaches to the active tab through `chrome.debugger`, enables the Chrome DevTools Protocol Network domain, and reads matching JSON response bodies.
4. The response is normalized into Category → Product → Topping Group → Topping.
5. Review the detected counts and a small preview in the popup.
6. Click **Export to new Google Sheet**.
7. A new spreadsheet is created with two tabs:
   - `Menu`
   - `Menu + Toppings`

The captured menu is stored in `chrome.storage.local`, so closing the popup does not lose the latest result.

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
6. Note the generated extension ID. You need it for Google OAuth setup below.

## Google Sheets OAuth setup

Export requires your own Google OAuth client because Chrome extensions cannot safely ship a shared client secret/client configuration for arbitrary local installations.

1. Open Google Cloud Console and create/select a project.
2. Enable **Google Sheets API**.
3. Configure the OAuth consent screen. If the app is in Testing mode, add your Google account as a test user.
4. Create an OAuth client for a **Chrome Extension** using the extension ID shown in `chrome://extensions`.
5. Replace this placeholder in `public/manifest.json`:

```json
"client_id": "REPLACE_ME.apps.googleusercontent.com"
```

with the generated OAuth client ID.
6. Run `npm run build` again.
7. Click **Reload** on the extension in `chrome://extensions`.

The extension requests only this Google scope:

```text
https://www.googleapis.com/auth/spreadsheets
```

## Capture notes

### DeliveryK

Matches the shop-page API shape used by URLs similar to:

```text
https://api.deliveryk.com/api/shop-page/{restaurantId}/index
```

### Grab

Grab endpoints can change more often, so the parser intentionally does not depend on one hard-coded API path. For JSON responses on `*.grab.com`, it searches for a category array whose entries contain `items`, then normalizes the menu using Grab's `ID`, `priceInMinorUnit`, `modifierGroups`, and related fields.

This makes the extension more tolerant of nested response-wrapper changes while still restricting capture to supported domains.

## Price behavior

Prices are exported exactly as numeric values provided by each API. For example, Grab's `priceInMinorUnit` is intentionally kept raw rather than converted, matching the behavior of the original Google Apps Script.

## Permissions

- `debugger`: read response bodies from the active tab through Chrome DevTools Protocol.
- `activeTab`: operate on the tab where the user starts capture.
- `storage`: persist the latest captured menu.
- `identity`: authenticate the user for Google Sheets API.

Chrome shows a strong warning for the `debugger` permission. This extension uses it only after the user presses Start Capture and detaches when capture is stopped.

## Project structure

```text
src/
  background.ts       Network capture service worker
  googleSheets.ts     Google OAuth + Sheets API export
  flatten.ts          Sheet row generation
  parsers/
    deliveryk.ts
    grab.ts
  App.tsx             Extension popup
```

## Current scope

This first version creates a **new spreadsheet** for every export. Exporting into an existing spreadsheet can be added later without changing any parser because all providers already share one normalized menu model.
