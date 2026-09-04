import type { ParsedMenu } from '../types'
import { isDeliveryKUrl, parseDeliveryK } from './deliveryk'
import { isGrabUrl, parseGrab } from './grab'

export const isSupportedDomain = (url: string): boolean => {
  try {
    const hostname = new URL(url).hostname
    return [
      /(^|\.)grab\.com$/i,
      /(^|\.)deliveryk\.com$/i,
    ].some(pattern => pattern.test(hostname))
  } catch {
    return false
  }
}

export const parseMenuResponse = (url: string, payload: unknown): ParsedMenu | null => {
  try {
    if (isDeliveryKUrl(url)) return parseDeliveryK(url, payload)
    if (isGrabUrl(url)) return parseGrab(url, payload)
  } catch {
    return null
  }

  return null
}
