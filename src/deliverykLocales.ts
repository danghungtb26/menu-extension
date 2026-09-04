import { parseDeliveryK } from './parsers/deliveryk'
import type { ParsedMenu } from './types'

export const DELIVERYK_LOCALES = ['vi', 'en', 'ko', 'ja', 'zh', 'th'] as const

export type DeliveryKLocale = (typeof DELIVERYK_LOCALES)[number]

export const isDeliveryKShopPageUrl = (value: string): boolean => {
  try {
    const url = new URL(value)
    return /(^|\.)deliveryk\.com$/i.test(url.hostname) &&
      /\/api\/shop-page\/[^/]+\/index(?:\/|$)/i.test(url.pathname)
  } catch {
    return false
  }
}

export const findLatestDeliveryKShopPageUrl = (urls: string[]): string | undefined =>
  [...urls].reverse().find(isDeliveryKShopPageUrl)

export const getDeliveryKRestaurantIdFromPageUrl = (value: string): string | undefined => {
  try {
    const url = new URL(value)
    if (!/(^|\.)deliveryk\.com$/i.test(url.hostname)) return undefined
    return url.pathname.match(/^\/shops\/([^/?#]+)/i)?.[1]
  } catch {
    return undefined
  }
}

export const buildDeliveryKShopPageApiUrl = (restaurantId: string): string =>
  `https://api.deliveryk.com/api/shop-page/${encodeURIComponent(restaurantId)}/index?width=1825`

export const fetchDeliveryKLocaleMenus = async (
  sourceUrl: string,
  storeName: string,
): Promise<ParsedMenu[]> => {
  const menus: ParsedMenu[] = []

  for (const locale of DELIVERYK_LOCALES) {
    const response = await fetch(sourceUrl, {
      method: 'GET',
      headers: { locale },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`DeliveryK ${locale} request failed with HTTP ${response.status}.`)
    }

    const payload = await response.json()
    const parsed = parseDeliveryK(sourceUrl, payload)

    if (!parsed || parsed.categories.length === 0) {
      throw new Error(`DeliveryK ${locale} response did not contain menu data.`)
    }

    menus.push({
      ...parsed,
      storeName,
      locale,
    })
  }

  return menus
}
