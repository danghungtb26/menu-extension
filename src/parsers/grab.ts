import type { MenuCategory, MenuModifierGroup, ParsedMenu } from '../types'
import { asNumber, extractIdFromUrl, findArray, firstString } from './helpers'

export const isGrabUrl = (url: string) => /(^|\.)grab\.com$/i.test(new URL(url).hostname)

const grabPrice = (value: any): number => asNumber(
  value?.priceInMinorUnit ??
  value?.priceV2?.amountInMinor ??
  value?.price,
)

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
            price: grabPrice(modifier),
          }))
        : [],
    }
  })
}

const hasGrabItems = (value: unknown): value is any[] =>
  Array.isArray(value) && value.some((entry: any) => Array.isArray(entry?.items))

const findCategories = (payload: unknown): any[] | undefined => {
  if (hasGrabItems(payload)) return payload

  if (payload && typeof payload === 'object') {
    const root = payload as Record<string, any>
    const candidates = [
      root.categories,
      root.menu?.categories,
      root.merchant?.menu?.categories,
      root.data?.categories,
      root.data?.menu?.categories,
      root.data?.merchant?.menu?.categories,
    ]

    for (const candidate of candidates) {
      if (hasGrabItems(candidate)) return candidate
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

const findMerchantId = (categories: any[]): string | undefined => {
  for (const category of categories) {
    if (!Array.isArray(category?.items)) continue
    for (const item of category.items) {
      const merchantId = firstString(item?.merchantID, item?.merchantId, item?.merchant_id)
      if (merchantId) return merchantId
    }
  }
  return undefined
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
          price: grabPrice(item),
          description: firstString(item?.description, item?.desc),
          imageUrl: firstString(
            item?.imgHref,
            item?.thumbImages?.[0],
            item?.images?.[0],
            item?.imgHrefFallback,
            item?.image,
            item?.imageUrl,
          ),
          modifierGroups: parseGroups(item),
        }))
      : [],
  }))

  return {
    provider: 'grab',
    restaurantId: extractIdFromUrl(url, /merchants\/([^/?]+)/i) ?? findMerchantId(rawCategories),
    sourceUrl: url,
    capturedAt: new Date().toISOString(),
    categories,
  }
}
