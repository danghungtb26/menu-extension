import { describe, expect, it } from 'vitest'
import { validateAppsScriptConfig } from '../src/appsScript'

describe('Apps Script config', () => {
  it('accepts a deployed Web App URL and secret', () => {
    expect(() => validateAppsScriptConfig({
      endpoint: 'https://script.google.com/macros/s/AKfycb-example/exec',
      secret: 'test-secret',
    })).not.toThrow()
  })

  it('rejects non Apps Script endpoints', () => {
    expect(() => validateAppsScriptConfig({
      endpoint: 'https://example.com/export',
      secret: 'test-secret',
    })).toThrow(/Apps Script Web App URL/)
  })

  it('requires a secret', () => {
    expect(() => validateAppsScriptConfig({
      endpoint: 'https://script.google.com/macros/s/AKfycb-example/exec',
      secret: '',
    })).toThrow(/secret/)
  })
})
