export const asString = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  return String(value)
}

export const asNumber = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const firstString = (...values: unknown[]): string => {
  for (const value of values) {
    const text = asString(value).trim()
    if (text) return text
  }
  return ''
}

export const extractIdFromUrl = (url: string, pattern: RegExp): string | undefined => {
  const match = url.match(pattern)
  return match?.[1]
}

export const findArray = (
  value: unknown,
  predicate: (array: unknown[]) => boolean,
  depth = 0,
): unknown[] | undefined => {
  if (depth > 7 || value === null || value === undefined) return undefined

  if (Array.isArray(value)) {
    if (predicate(value)) return value
    for (const child of value) {
      const found = findArray(child, predicate, depth + 1)
      if (found) return found
    }
    return undefined
  }

  if (typeof value === 'object') {
    for (const child of Object.values(value as Record<string, unknown>)) {
      const found = findArray(child, predicate, depth + 1)
      if (found) return found
    }
  }

  return undefined
}
