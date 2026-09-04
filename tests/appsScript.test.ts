import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportMenuViaAppsScript, getExportIdentity, validateAppsScriptConfig } from '../src/appsScript'
import type { ParsedMenu } from '../src/types'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Apps Script config', () => {
  it('accepts a deployed Web App URL and secret', () => {
    expect(() => validateAppsScriptConfig({
      endpoint: 'https://script.google.com/macros/s/AKfycb-example/exec',
      secret: 'test-secret',
    })).not.toThrow()
  })

  it('rejects non Apps Script endpoints', () => {
    expect(() => validateAppsScriptConfig({
      endpoint: 'https://example.com/export',
      secret: 'test-secret',
    })).toThrow(/Apps Script Web App URL/)
  })

  it('requires a secret', () => {
    expect(() => validateAppsScriptConfig({
      endpoint: 'https://script.google.com/macros/s/AKfycb-example/exec',
      secret: '',
    })).toThrow(/secret/)
  })
})

describe('Apps Script export identity', () => {
  it('includes site, store, locale and restaurant id', () => {
    const menu: ParsedMenu = {
      provider: 'grab',
      restaurantId: 'merchant-123',
      storeName: 'Pho 24',
      locale: 'vi-VN',
      sourceUrl: 'https://food.grab.com/vn/en/restaurant/example',
      capturedAt: '2026-09-04T00:00:00.000Z',
      categories: [],
    }

    expect(getExportIdentity(menu)).toEqual({
      site: 'Grab',
      storeName: 'Pho 24',
      locale: 'vi-VN',
      restaurantId: 'merchant-123',
    })
  })

  it('uses stable fallbacks when metadata is missing', () => {
    const menu: ParsedMenu = {
      provider: 'deliveryk',
      sourceUrl: 'https://www.deliveryk.com/example',
      capturedAt: '2026-09-04T00:00:00.000Z',
      categories: [],
    }

    expect(getExportIdentity(menu)).toEqual({
      site: 'DeliveryK',
      storeName: 'restaurant',
      locale: 'default',
      restaurantId: 'unknown',
    })
  })
})

describe('Apps Script payload', () => {
  it('sends the full schema under payload.rows', async () => {
    let body: Record<string, unknown> | undefined

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(JSON.stringify({
        success: true,
        spreadsheetUrl: 'https://docs.google.com/spreadsheets/d/test',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const menu: ParsedMenu = {
      provider: 'grab',
      restaurantId: 'merchant-123',
      storeName: 'Pho 24',
      locale: 'vi-VN',
      sourceUrl: 'https://portal.grab.com/foodweb/guest/v2/merchants/merchant-123',
      capturedAt: '2026-09-04T00:00:00.000Z',
      categories: [{
        id: 'c1',
        name: 'Drinks',
        description: '',
        items: [{
          id: 'i1',
          name: 'Coffee',
          price: 45000,
          description: '',
          imageUrl: '',
          modifierGroups: [],
        }],
      }],
    }

    await exportMenuViaAppsScript(menu, {
      endpoint: 'https://script.google.com/macros/s/AKfycb-example/exec',
      secret: 'test-secret',
    })

    expect(body).toMatchObject({
      secret: 'test-secret',
      site: 'Grab',
      storeName: 'Pho 24',
      locale: 'vi-VN',
      restaurantId: 'merchant-123',
      sourceUrl: menu.sourceUrl,
    })
    expect(Array.isArray(body?.rows)).toBe(true)
    expect(body).not.toHaveProperty('menu')
    expect(body).not.toHaveProperty('toppings')
  })
})
