import { describe, expect, it } from 'vitest'
import { parseCapichi } from '../src/parsers/capichi'
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

  it('finds Grab categories inside a nested response', () => {
    const parsed = parseGrab('https://portal.grab.com/foodweb/guest/v2/merchants/5-C24WJZLFEJ6HBE', {
      data: {
        merchant: {
          menu: {
            categories: [{
              ID: 'c1',
              name: 'Drinks',
              items: [{
                ID: 'i1',
                name: 'Coffee',
                priceInMinorUnit: 45000,
                modifierGroups: [{
                  ID: 'g1',
                  name: 'Ice',
                  selectionType: 'SINGLE',
                  modifiers: [{ ID: 'm1', name: 'Less ice', priceInMinorUnit: 0 }],
                }],
              }],
            }],
          },
        },
      },
    })

    expect(parsed?.restaurantId).toBe('5-C24WJZLFEJ6HBE')
    expect(parsed?.categories[0].items[0].name).toBe('Coffee')
    expect(getCaptureSummary(parsed!).toppings).toBe(1)
  })

  it('parses Capichi and keeps empty categories', () => {
    const parsed = parseCapichi('https://store.capichiapp.com/api/v107/food_booking/restaurants/abc/food_categories?display_all_category=true', {
      data: [
        { id: 1, name: 'Lunch', food_items: [{ id: 2, name: 'Rice', price: 90000, image: 'rice.jpg' }] },
        { id: 3, name: 'Sold out', food_items: [] },
      ],
    })

    expect(parsed?.restaurantId).toBe('abc')
    expect(parsed?.categories).toHaveLength(2)
    expect(parsed?.categories[1].items).toHaveLength(0)
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
})
