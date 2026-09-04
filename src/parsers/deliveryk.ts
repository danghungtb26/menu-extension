import type { MenuCategory, ParsedMenu } from '../types'
import { asNumber, firstString, extractIdFromUrl } from './helpers'

export const isDeliveryKUrl = (url: string) =>
  /(^|\.)deliveryk\.com$/i.test(new URL(url).hostname) && url.includes('/api/shop-page/')

export const parseDeliveryK = (url: string, payload: unknown): ParsedMenu | null => {
  if (!payload || typeof payload !== 'object') return null

  const root = payload as Record<string, any>
  const rawCategories = root.product_categories_data?.product_categories
  if (!Array.isArray(rawCategories)) return null

  const categories: MenuCategory[] = rawCategories.map((menu: any) => ({
    id: firstString(menu?.id),
    name: firstString(menu?.name),
    description: firstString(menu?.desc),
    items: Array.isArray(menu?.products)
      ? menu.products.map((product: any) => ({
          id: firstString(product?.id),
          name: firstString(product?.name),
          price: asNumber(product?.price),
          description: firstString(product?.desc, product?.description),
          imageUrl: firstString(product?.thumb_url, product?.image),
          modifierGroups: Array.isArray(product?.option_sets)
            ? product.option_sets.map((group: any) => ({
                id: firstString(group?.id),
                name: firstString(group?.name),
                type: firstString(group?.type),
                modifiers: Array.isArray(group?.options)
                  ? group.options.map((option: any) => ({
                      id: firstString(option?.id),
                      name: firstString(option?.name),
                      price: asNumber(option?.price),
                    }))
                  : [],
              }))
            : [],
        }))
      : [],
  }))

  return {
    provider: 'deliveryk',
    restaurantId: extractIdFromUrl(url, /shop-page\/([^/]+)\/index/i),
    sourceUrl: url,
    capturedAt: new Date().toISOString(),
    categories,
  }
}
