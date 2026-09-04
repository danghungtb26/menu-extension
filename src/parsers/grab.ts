import type { MenuCategory, MenuModifierGroup, ParsedMenu } from '../types'
import { asNumber, firstString, findArray, extractIdFromUrl } from './helpers'

export const isGrabUrl = (url: string) => /(^|\.)grab\.com$/i.test(new URL(url).hostname)

const parseGroups = (item: any): MenuModifierGroup[] => {
  const groups = item?.modifierGroups ?? item?.modifier_groups ?? item?.optionSets ?? item?.option_sets
  if (!Array.isArray(groups)) return []

  return groups.map((group: any) => {
    const modifiers = group?.modifiers ?? group?.options ?? []
    return {
      id: firstString(group?.ID, group?.id),
      name: firstString(group?.name),
      type: firstString(group?.selectionType, group?.selection_type, group?.type),
      modifiers: Array.isArray(modifiers)
        ? modifiers.map((modifier: any) => ({
            id: firstString(modifier?.ID, modifier?.id),
            name: firstString(modifier?.name),
            price: asNumber(modifier?.priceInMinorUnit ?? modifier?.price),
          }))
        : [],
    }
  })
}

const findCategories = (payload: unknown): any[] | undefined => {
  if (Array.isArray(payload) && payload.some((entry: any) => Array.isArray(entry?.items))) {
    return payload
  }

  if (payload && typeof payload === 'object') {
    const root = payload as Record<string, any>
    const direct = root.categories ?? root.menu?.categories ?? root.data?.categories ?? root.data?.menu?.categories
    if (Array.isArray(direct) && direct.some((entry: any) => Array.isArray(entry?.items))) {
      return direct
    }
  }

  return findArray(payload, array =>
    array.length > 0 &&
    array.some((entry: any) =>
      entry &&
      typeof entry === 'object' &&
      Array.isArray(entry.items) &&
      (entry.ID !== undefined || entry.id !== undefined || entry.name !== undefined),
    ),
  ) as any[] | undefined
}

export const parseGrab = (url: string, payload: unknown): ParsedMenu | null => {
  const rawCategories = findCategories(payload)
  if (!rawCategories) return null

  const categories: MenuCategory[] = rawCategories.map((category: any) => ({
    id: firstString(category?.ID, category?.id),
    name: firstString(category?.name),
    description: firstString(category?.description, category?.desc),
    items: Array.isArray(category?.items)
      ? category.items.map((item: any) => ({
          id: firstString(item?.ID, item?.id),
          name: firstString(item?.name),
          price: asNumber(item?.priceInMinorUnit ?? item?.price),
          description: firstString(item?.description, item?.desc),
          imageUrl: firstString(item?.imgHref, item?.images?.[0], item?.image, item?.imageUrl),
          modifierGroups: parseGroups(item),
        }))
      : [],
  }))

  return {
    provider: 'grab',
    restaurantId: extractIdFromUrl(url, /merchants\/([^/?]+)/i),
    sourceUrl: url,
    capturedAt: new Date().toISOString(),
    categories,
  }
}
