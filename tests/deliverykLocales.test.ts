import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DELIVERYK_LOCALES,
  buildDeliveryKShopPageApiUrl,
  fetchDeliveryKLocaleMenus,
  findLatestDeliveryKShopPageUrl,
  getDeliveryKRestaurantIdFromPageUrl,
} from '../src/deliverykLocales'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('DeliveryK locale export', () => {
  it('extracts restaurant id from a direct shop page', () => {
    expect(getDeliveryKRestaurantIdFromPageUrl('https://www.deliveryk.com/shops/14512')).toBe('14512')
    expect(buildDeliveryKShopPageApiUrl('14512')).toBe(
      'https://api.deliveryk.com/api/shop-page/14512/index?width=1825',
    )
  })

  it('does not treat category pages as direct shop pages', () => {
    expect(
      getDeliveryKRestaurantIdFromPageUrl(
        'https://www.deliveryk.com/category-shops?shopCategoryId=21',
      ),
    ).toBeUndefined()
  })

  it('finds the latest previously loaded shop-page API', () => {
    const latest = findLatestDeliveryKShopPageUrl([
      'https://api.deliveryk.com/api/shop-page/10/index?width=1825',
      'https://api.deliveryk.com/api/categories',
      'https://api.deliveryk.com/api/shop-page/42/index?width=1825',
    ])

    expect(latest).toBe('https://api.deliveryk.com/api/shop-page/42/index?width=1825')
  })

  it('fetches the same menu endpoint with every locale header', async () => {
    const headers: string[] = []

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      headers.push(new Headers(init?.headers).get('locale') || '')
      return new Response(JSON.stringify({
        product_categories_data: {
          product_categories: [{
            id: 1,
            name: 'Menu',
            products: [{ id: 2, name: 'Item', price: 100 }],
          }],
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    })

    const url = 'https://api.deliveryk.com/api/shop-page/42/index?width=1825'
    const menus = await fetchDeliveryKLocaleMenus(url, 'Test Store')

    expect(headers).toEqual([...DELIVERYK_LOCALES])
    expect(menus.map(menu => menu.locale)).toEqual([...DELIVERYK_LOCALES])
    expect(menus.every(menu => menu.restaurantId === '42')).toBe(true)
    expect(menus.every(menu => menu.storeName === 'Test Store')).toBe(true)
  })
})
