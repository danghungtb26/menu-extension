export type Provider = 'grab' | 'deliveryk' | 'capichi'

export interface MenuModifier {
  id: string
  name: string
  price: number
}

export interface MenuModifierGroup {
  id: string
  name: string
  type: string
  modifiers: MenuModifier[]
}

export interface MenuItem {
  id: string
  name: string
  price: number
  description: string
  imageUrl: string
  modifierGroups: MenuModifierGroup[]
}

export interface MenuCategory {
  id: string
  name: string
  description: string
  items: MenuItem[]
}

export interface ParsedMenu {
  provider: Provider
  restaurantId?: string
  sourceUrl: string
  capturedAt: string
  categories: MenuCategory[]
}

export interface CaptureSummary {
  categories: number
  products: number
  toppingGroups: number
  toppings: number
}

export interface CaptureState {
  capturing: boolean
  tabId?: number
  lastCapture?: ParsedMenu
  error?: string
}

export type RuntimeRequest =
  | { type: 'GET_STATE' }
  | { type: 'START_CAPTURE'; tabId: number }
  | { type: 'STOP_CAPTURE' }
  | { type: 'CLEAR_CAPTURE' }

export interface RuntimeResponse {
  ok: boolean
  state?: CaptureState
  error?: string
}
