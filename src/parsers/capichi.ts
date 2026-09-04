import type { MenuCategory, MenuModifierGroup, ParsedMenu } from '../types'
import { asNumber, firstString, extractIdFromUrl } from './helpers'

export const isCapichiUrl = (url: string) =>
  /(^|\.)capichiapp\.com$/i.test(new URL(url).hostname) && url.includes('/food_categories')

const parseGroups = (product: any): MenuModifierGroup[] => {
  const groups = product?.option_sets ?? product?.modifier_groups ?? product?.modifierGroups
  if (!Array.isArray(groups)) return []

  return groups.map((group: any) => {
    const options = group?.options ?? group?.modifiers ?? []
    return {
      id: firstString(group?.id, group?.ID),
      name: firstString(group?.name),
      type: firstString(group?.type, group?.selection_type, group?.selectionType),
      modifiers: Array.isArray(options)
        ? options.map((option: any) => ({
            id: firstString(option?.id, option?.ID),
            name: firstString(option?.name),
            price: asNumber(option?.price ?? option?.priceInMinorUnit),
          }))
        : [],
    }
  })
}

export const parseCapichi = (url: string, payload: unknown): ParsedMenu | null => {
  if (!payload || typeof payload !== 'object') return null
  const rawCategories = (payload as Record<string, any>).data
  if (!Array.isArray(rawCategories)) return null

  const categories: MenuCategory[] = rawCategories.map((menu: any) => ({
    id: firstString(menu?.id),
    name: firstString(menu?.name),
    description: firstString(menu?.description, menu?.desc, menu?.open_time_csv),
    items: Array.isArray(menu?.food_items)
      ? menu.food_items.map((product: any) => ({
          id: firstString(product?.id),
          name: firstString(product?.name),
          price: asNumber(product?.price),
          description: firstString(product?.description, product?.desc),
          imageUrl: firstString(product?.image, product?.image_url, product?.thumb_url),
          modifierGroups: parseGroups(product),
        }))
      : [],
  }))

  return {
    provider: 'capichi',
    restaurantId: extractIdFromUrl(url, /restaurants\/([^/]+)\/food_categories/i),
    sourceUrl: url,
    capturedAt: new Date().toISOString(),
    categories,
  }
}
