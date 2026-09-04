import { describe, expect, it } from 'vitest'
import { getExportIdentity, validateAppsScriptConfig } from '../src/appsScript'
import type { ParsedMenu } from '../src/types'

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
