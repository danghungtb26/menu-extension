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
4. The background service worker captures or resolves the restaurant menu API.
5. The menu is parsed and normalized.
6. Provider-specific locale export runs.
7. A single full-schema row set is POSTed to the configured Apps Script Web App for each locale.
8. Apps Script writes one worksheet per store/locale into the Google Sheet that owns the script.

The export schema always includes product and topping columns.

If a product has no topping groups or toppings, the product is still exported and all topping columns are left blank. No separate menu-only worksheet is created.

## DeliveryK: one-click all-locale export

DeliveryK uses the request header `locale` to select menu language. The extension calls the same shop-page endpoint directly for these locales:

```text
vi
en
ko
ja
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
```

A direct DeliveryK shop page such as:

```text
https://www.deliveryk.com/shops/14512
```

provides the restaurant ID directly, so the extension can build the API URL without waiting for a network response.

Grab currently exports the locale loaded by the website.

## Locale-aware sheet names

Each store/locale gets exactly one deterministic worksheet name based on:

```text
web-storeName-locale-restaurantId
```

Example for DeliveryK:

```text
DeliveryK-Pho 24-vi-123
DeliveryK-Pho 24-en-123
DeliveryK-Pho 24-ko-123
DeliveryK-Pho 24-ja-123
```

Each worksheet always uses the full schema:

```text
category_id
category_name
category_desc
product_id
product_name
product_price
product_desc
product_thumb
product_thumb_preview
topping_type_id
topping_type_name
topping_type_type
topping_id
topping_name
topping_price
```

`product_thumb` keeps the original image URL. `product_thumb_preview` uses a Google Sheets `IMAGE(..., 1)` formula, so the image is rendered inside the cell while keeping its aspect ratio. If the image URL is empty or cannot be loaded, the preview cell stays blank.

If a product has no toppings, columns from `topping_type_id` through `topping_price` are blank.

If the same restaurant/locale is exported again, the matching worksheet is cleared and rewritten instead of duplicated.

For compatibility with older exports, Apps Script removes the old generated `-toppings` worksheet after successfully writing the new single worksheet.

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

When `Code.gs` changes, create a new deployment version so the `/exec` URL runs the latest code.

## Capture behavior

### DeliveryK

Direct shop pages are supported, for example:

```text
https://www.deliveryk.com/shops/14512
```

The API URL is built as:

```text
https://api.deliveryk.com/api/shop-page/14512/index?width=1825
```

The extension fetches it once per supported locale using the `locale` request header.

### Grab

Grab endpoints can change, so the parser does not depend on one hard-coded API path. For JSON responses on `*.grab.com`, it searches nested response data for category arrays containing menu items and normalizes Grab fields such as `ID`, `priceInMinorUnit`, `modifierGroups`, and `modifiers`.

## Store name and locale detection

- store name: page `h1`, then Open Graph title, then document title
- Grab locale: API/page URL locale parameter or locale path segment when available, then `<html lang>`, then browser language
- DeliveryK locale: explicitly assigned from the `locale` request header for each generated export
- restaurant ID: direct DeliveryK `/shops/{id}` URL or provider API URL

## Price behavior

Prices are exported exactly as numeric values supplied by the provider API. Grab's `priceInMinorUnit` is intentionally kept raw, matching the original Google Apps Script behavior.

## Permissions

- `debugger`: read menu response bodies and page metadata after the user clicks Export.
- `activeTab`: operate on the current restaurant tab.
- `storage`: persist Apps Script configuration and export progress.
- `alarms`: stop a capture automatically after 3 minutes if no menu is found.

Chrome displays a strong warning for the `debugger` permission. The extension attaches only after the user clicks **Export** and detaches as soon as the required data is available or an error occurs.

## Project structure

```text
apps-script/
  Code.gs                 Bound Apps Script Web App writer
src/
  background.ts           One-click capture + provider export workflow
  appsScript.ts           Apps Script Web App client
  deliverykLocales.ts     DeliveryK locale-header requests
  flatten.ts              Full product + topping row generation
  parsers/
    deliveryk.ts
    grab.ts
  App.tsx                 Popup configuration + Export button
```
