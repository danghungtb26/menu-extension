export type Provider = 'grab' | 'deliveryk'
export type ExportPhase = 'idle' | 'capturing' | 'writing' | 'done' | 'error'

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
  storeName?: string
  locale?: string
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

export interface AppsScriptConfig {
  endpoint: string
  secret: string
}

export interface CaptureState {
  capturing: boolean
  exporting: boolean
  phase: ExportPhase
  tabId?: number
  lastCapture?: ParsedMenu
  lastSheetUrl?: string
  lastExportedLocales?: string[]
  error?: string
}

export type RuntimeRequest =
  | { type: 'GET_STATE' }
  | { type: 'EXPORT_CURRENT_TAB'; tabId: number; config: AppsScriptConfig }

export interface RuntimeResponse {
  ok: boolean
  state?: CaptureState
  error?: string
}
