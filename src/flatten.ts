import type { CaptureSummary, ParsedMenu } from './types'

export const getCaptureSummary = (menu: ParsedMenu): CaptureSummary => {
  let products = 0
  let toppingGroups = 0
  let toppings = 0

  for (const category of menu.categories) {
    products += category.items.length
    for (const item of category.items) {
      toppingGroups += item.modifierGroups.length
      for (const group of item.modifierGroups) toppings += group.modifiers.length
    }
  }

  return {
    categories: menu.categories.length,
    products,
    toppingGroups,
    toppings,
  }
}

export const flattenMenuSheet = (menu: ParsedMenu): (string | number)[][] => {
  const rows: (string | number)[][] = [[
    'category_id',
    'category_name',
    'category_desc',
    'product_id',
    'product_name',
    'product_price',
    'product_desc',
    'product_thumb',
  ]]

  for (const category of menu.categories) {
    if (category.items.length === 0) {
      rows.push([category.id, category.name, category.description, '', '', '', '', ''])
      continue
    }

    for (const item of category.items) {
      rows.push([
        category.id,
        category.name,
        category.description,
        item.id,
        item.name,
        item.price,
        item.description,
        item.imageUrl,
      ])
    }
  }

  return rows
}

export const flattenToppingsSheet = (menu: ParsedMenu): (string | number)[][] => {
  const rows: (string | number)[][] = [[
    'category_id',
    'category_name',
    'category_desc',
    'product_id',
    'product_name',
    'product_price',
    'product_desc',
    'product_thumb',
    'topping_type_id',
    'topping_type_name',
    'topping_type_type',
    'topping_id',
    'topping_name',
    'topping_price',
  ]]

  for (const category of menu.categories) {
    let firstCategory = true

    if (category.items.length === 0) {
      rows.push([category.id, category.name, category.description, '', '', '', '', '', '', '', '', '', '', ''])
      continue
    }

    for (const item of category.items) {
      let firstItem = true

      if (item.modifierGroups.length === 0) {
        rows.push([
          firstCategory ? category.id : '',
          firstCategory ? category.name : '',
          firstCategory ? category.description : '',
          item.id,
          item.name,
          item.price,
          item.description,
          item.imageUrl,
          '', '', '', '', '', '',
        ])
        firstCategory = false
        continue
      }

      for (const group of item.modifierGroups) {
        let firstGroup = true

        if (group.modifiers.length === 0) {
          rows.push([
            firstCategory ? category.id : '',
            firstCategory ? category.name : '',
            firstCategory ? category.description : '',
            firstItem ? item.id : '',
            firstItem ? item.name : '',
            firstItem ? item.price : '',
            firstItem ? item.description : '',
            firstItem ? item.imageUrl : '',
            group.id,
            group.name,
            group.type,
            '', '', '',
          ])
          firstCategory = false
          firstItem = false
          continue
        }

        for (const modifier of group.modifiers) {
          rows.push([
            firstCategory ? category.id : '',
            firstCategory ? category.name : '',
            firstCategory ? category.description : '',
            firstItem ? item.id : '',
            firstItem ? item.name : '',
            firstItem ? item.price : '',
            firstItem ? item.description : '',
            firstItem ? item.imageUrl : '',
            firstGroup ? group.id : '',
            firstGroup ? group.name : '',
            firstGroup ? group.type : '',
            modifier.id,
            modifier.name,
            modifier.price,
          ])

          firstCategory = false
          firstItem = false
          firstGroup = false
        }
      }
    }
  }

  return rows
}
