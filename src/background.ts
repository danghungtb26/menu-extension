import { parseMenuResponse, isSupportedDomain } from './parsers'
import type { CaptureState, RuntimeRequest, RuntimeResponse } from './types'

const STORAGE_KEY = 'captureState'
const DEBUGGER_VERSION = '1.3'

const emptyState = (): CaptureState => ({ capturing: false })

const getState = async (): Promise<CaptureState> => {
  const result = await chrome.storage.local.get(STORAGE_KEY)
  return (result[STORAGE_KEY] as CaptureState | undefined) ?? emptyState()
}

const setState = async (state: CaptureState) => {
  await chrome.storage.local.set({ [STORAGE_KEY]: state })
  try {
    await chrome.runtime.sendMessage({ type: 'CAPTURE_UPDATED', state })
  } catch {
    // Popup may be closed. Persisted state is the source of truth.
  }
}

const detach = async (tabId?: number) => {
  if (tabId === undefined) return
  try {
    await chrome.debugger.detach({ tabId })
  } catch {
    // Already detached.
  }
}

const startCapture = async (tabId: number): Promise<CaptureState> => {
  const previous = await getState()
  if (previous.capturing && previous.tabId !== tabId) await detach(previous.tabId)
  if (previous.capturing && previous.tabId === tabId) return previous

  try {
    await chrome.debugger.attach({ tabId }, DEBUGGER_VERSION)
    await chrome.debugger.sendCommand({ tabId }, 'Network.enable')
    const next: CaptureState = {
      capturing: true,
      tabId,
      lastCapture: previous.lastCapture,
    }
    await setState(next)
    return next
  } catch (error) {
    const next: CaptureState = {
      capturing: false,
      lastCapture: previous.lastCapture,
      error: error instanceof Error ? error.message : String(error),
    }
    await setState(next)
    return next
  }
}

const stopCapture = async (): Promise<CaptureState> => {
  const previous = await getState()
  await detach(previous.tabId)
  const next: CaptureState = {
    capturing: false,
    lastCapture: previous.lastCapture,
  }
  await setState(next)
  return next
}

const decodeBody = (body: string, base64Encoded?: boolean): string => {
  if (!base64Encoded) return body
  const binary = atob(body)
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

const handleResponse = async (source: chrome.debugger.Debuggee, params: any) => {
  if (source.tabId === undefined) return

  const state = await getState()
  if (!state.capturing || state.tabId !== source.tabId) return

  const responseUrl = params?.response?.url as string | undefined
  if (!responseUrl || !isSupportedDomain(responseUrl)) return

  const mimeType = String(params?.response?.mimeType ?? '').toLowerCase()
  const resourceType = String(params?.type ?? '').toLowerCase()
  const mightBeJson = mimeType.includes('json') || resourceType === 'xhr' || resourceType === 'fetch'
  if (!mightBeJson) return

  try {
    const result = await chrome.debugger.sendCommand(
      { tabId: source.tabId },
      'Network.getResponseBody',
      { requestId: params.requestId },
    ) as { body?: string; base64Encoded?: boolean }

    if (!result?.body) return
    const payload = JSON.parse(decodeBody(result.body, result.base64Encoded))
    const parsed = parseMenuResponse(responseUrl, payload)
    if (!parsed || parsed.categories.length === 0) return

    await setState({
      capturing: true,
      tabId: source.tabId,
      lastCapture: parsed,
    })
  } catch {
    // Most responses are unrelated to menus or may have expired bodies.
  }
}

chrome.debugger.onEvent.addListener((source, method, params) => {
  if (method === 'Network.responseReceived') void handleResponse(source, params)
})

chrome.debugger.onDetach.addListener(source => {
  void (async () => {
    const state = await getState()
    if (source.tabId === state.tabId && state.capturing) {
      await setState({
        capturing: false,
        lastCapture: state.lastCapture,
      })
    }
  })()
})

chrome.runtime.onMessage.addListener((request: RuntimeRequest, _sender, sendResponse) => {
  void (async () => {
    try {
      if (request.type === 'GET_STATE') {
        sendResponse({ ok: true, state: await getState() } satisfies RuntimeResponse)
        return
      }

      if (request.type === 'START_CAPTURE') {
        sendResponse({ ok: true, state: await startCapture(request.tabId) } satisfies RuntimeResponse)
        return
      }

      if (request.type === 'STOP_CAPTURE') {
        sendResponse({ ok: true, state: await stopCapture() } satisfies RuntimeResponse)
        return
      }

      if (request.type === 'CLEAR_CAPTURE') {
        const current = await getState()
        const state: CaptureState = { capturing: current.capturing, tabId: current.tabId }
        await setState(state)
        sendResponse({ ok: true, state } satisfies RuntimeResponse)
        return
      }

      sendResponse({ ok: false, error: 'Unknown request' } satisfies RuntimeResponse)
    } catch (error) {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies RuntimeResponse)
    }
  })()

  return true
})
