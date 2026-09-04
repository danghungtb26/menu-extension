import { describe, expect, it } from 'vitest'
import { parseDeliveryK } from '../src/parsers/deliveryk'
import { parseGrab } from '../src/parsers/grab'
import { flattenToppingsSheet, getCaptureSummary } from '../src/flatten'

describe('menu parsers', () => {
  it('parses DeliveryK products and option sets', () => {
    const parsed = parseDeliveryK('https://api.deliveryk.com/api/shop-page/42/index?width=1825', {
      product_categories_data: {
        product_categories: [{
          id: 1,
          name: 'Pizza',
          products: [{
            id: 10,
            name: 'Margherita',
            price: 120000,
            thumb_url: 'https://image.test/pizza.jpg',
            option_sets: [{ id: 20, name: 'Size', type: 'single', options: [{ id: 30, name: 'Large', price: 20000 }] }],
          }],
        }],
      },
    })

    expect(parsed?.restaurantId).toBe('42')
    expect(parsed?.categories[0].items[0].modifierGroups[0].modifiers[0].name).toBe('Large')
  })

  it('parses the real Grab category/item/modifier shape', () => {
    const parsed = parseGrab('https://portal.grab.com/foodweb/guest/v2/menu', [{
      name: 'Dành cho bạn',
      available: true,
      items: [{
        ID: 'VNITE20260411153412026620',
        name: 'Pancakes (3 Stacks)',
        available: true,
        priceInMinorUnit: 159500,
        imgHref: 'https://image.test/photo.webp',
        description: 'Comes only with butter and maple syrup on the side',
        merchantID: '5-C7LCTB4GR7A1EN',
        modifierGroups: [{
          ID: 'VNMOD20250804064122275387',
          name: 'add-a-side',
          selectionType: 1,
          modifiers: [{
            ID: 'VNMOD20260514141204071372',
            name: 'Extra Beef Pattie',
            priceInMinorUnit: 88000,
            priceV2: { amountInMinor: 88000, amountDisplay: '88.000' },
          }],
        }],
        thumbImages: ['https://image.test/thumb.webp'],
        images: ['https://image.test/detail.webp'],
        imgHrefFallback: 'https://image.test/fallback.jpg',
      }],
    }])

    expect(parsed?.restaurantId).toBe('5-C7LCTB4GR7A1EN')
    expect(parsed?.categories[0].name).toBe('Dành cho bạn')
    expect(parsed?.categories[0].items[0]).toMatchObject({
      id: 'VNITE20260411153412026620',
      name: 'Pancakes (3 Stacks)',
      price: 159500,
      description: 'Comes only with butter and maple syrup on the side',
      imageUrl: 'https://image.test/photo.webp',
    })
    expect(parsed?.categories[0].items[0].modifierGroups[0]).toMatchObject({
      id: 'VNMOD20250804064122275387',
      name: 'add-a-side',
      type: '1',
    })
    expect(parsed?.categories[0].items[0].modifierGroups[0].modifiers[0]).toEqual({
      id: 'VNMOD20260514141204071372',
      name: 'Extra Beef Pattie',
      price: 88000,
    })
  })

  it('falls back to Grab priceV2 and image variants when primary fields are missing', () => {
    const parsed = parseGrab('https://portal.grab.com/foodweb/guest/v2/merchants/5-C24WJZLFEJ6HBE', [{
      name: 'Drinks',
      items: [{
        ID: 'i1',
        name: 'Coffee',
        priceV2: { amountInMinor: 45000 },
        thumbImages: ['https://image.test/thumb.jpg'],
        modifierGroups: [{
          ID: 'g1',
          name: 'Ice',
          modifiers: [{ ID: 'm1', name: 'Less ice', priceV2: { amountInMinor: 5000 } }],
        }],
      }],
    }])

    expect(parsed?.restaurantId).toBe('5-C24WJZLFEJ6HBE')
    expect(parsed?.categories[0].items[0].price).toBe(45000)
    expect(parsed?.categories[0].items[0].imageUrl).toBe('https://image.test/thumb.jpg')
    expect(parsed?.categories[0].items[0].modifierGroups[0].modifiers[0].price).toBe(5000)
    expect(getCaptureSummary(parsed!).toppings).toBe(1)
  })

  it('flattens topping rows with readable repeated-field suppression', () => {
    const parsed = parseGrab('https://portal.grab.com/foodweb/guest/v2/merchants/x', [{
      ID: 'c',
      name: 'Category',
      items: [{
        ID: 'i',
        name: 'Item',
        priceInMinorUnit: 100,
        modifierGroups: [{ ID: 'g', name: 'Group', modifiers: [
          { ID: 'a', name: 'A', priceInMinorUnit: 10 },
          { ID: 'b', name: 'B', priceInMinorUnit: 20 },
        ] }],
      }],
    }])!

    const rows = flattenToppingsSheet(parsed)
    expect(rows).toHaveLength(3)
    expect(rows[1][3]).toBe('i')
    expect(rows[2][3]).toBe('')
    expect(rows[2][11]).toBe('b')
  })

  it('keeps the full topping schema when a product has no toppings', () => {
    const parsed = parseDeliveryK('https://api.deliveryk.com/api/shop-page/42/index?width=1825', {
      product_categories_data: {
        product_categories: [{
          id: 1,
          name: 'Rice',
          products: [{
            id: 10,
            name: 'Plain rice',
            price: 30000,
            option_sets: [],
          }],
        }],
      },
    })!

    const rows = flattenToppingsSheet(parsed)

    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveLength(14)
    expect(rows[1]).toHaveLength(14)
    expect(rows[1].slice(8)).toEqual(['', '', '', '', '', ''])
  })
})
