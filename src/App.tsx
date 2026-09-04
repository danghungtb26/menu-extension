import { useEffect, useMemo, useState } from 'react'
import { getCaptureSummary } from './flatten'
import { exportMenuToNewSpreadsheet } from './googleSheets'
import type { CaptureState, RuntimeRequest, RuntimeResponse } from './types'

const sendRequest = async (request: RuntimeRequest): Promise<RuntimeResponse> =>
  chrome.runtime.sendMessage(request) as Promise<RuntimeResponse>

const providerLabel: Record<string, string> = {
  grab: 'Grab',
  deliveryk: 'DeliveryK',
}

const formatError = (error: unknown) => error instanceof Error ? error.message : String(error)

export const App = () => {
  const [state, setState] = useState<CaptureState>({ capturing: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sheetTitle, setSheetTitle] = useState('Restaurant Menu')
  const [lastSheetUrl, setLastSheetUrl] = useState('')

  useEffect(() => {
    void sendRequest({ type: 'GET_STATE' }).then(response => {
      if (response.state) setState(response.state)
    })

    const listener = (message: { type?: string; state?: CaptureState }) => {
      if (message.type === 'CAPTURE_UPDATED' && message.state) setState(message.state)
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  useEffect(() => {
    if (!state.lastCapture) return
    const provider = providerLabel[state.lastCapture.provider] ?? state.lastCapture.provider
    const restaurant = state.lastCapture.restaurantId ? ` ${state.lastCapture.restaurantId}` : ''
    setSheetTitle(`${provider}${restaurant} Menu`)
  }, [state.lastCapture?.capturedAt])

  const summary = useMemo(
    () => state.lastCapture ? getCaptureSummary(state.lastCapture) : null,
    [state.lastCapture],
  )

  const previewRows = useMemo(() => {
    if (!state.lastCapture) return []
    return state.lastCapture.categories.flatMap(category =>
      category.items.map(item => ({ category: category.name, item })),
    ).slice(0, 8)
  }, [state.lastCapture])

  const startCapture = async () => {
    setBusy(true)
    setError('')
    setLastSheetUrl('')
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) throw new Error('Cannot find the active tab.')

      const response = await sendRequest({ type: 'START_CAPTURE', tabId: tab.id })
      if (!response.ok) throw new Error(response.error || 'Cannot start capture.')
      if (response.state?.error) throw new Error(response.state.error)
      if (response.state) setState(response.state)

      await chrome.tabs.reload(tab.id)
    } catch (captureError) {
      setError(formatError(captureError))
    } finally {
      setBusy(false)
    }
  }

  const stopCapture = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await sendRequest({ type: 'STOP_CAPTURE' })
      if (!response.ok) throw new Error(response.error || 'Cannot stop capture.')
      if (response.state) setState(response.state)
    } catch (captureError) {
      setError(formatError(captureError))
    } finally {
      setBusy(false)
    }
  }

  const clearCapture = async () => {
    setError('')
    setLastSheetUrl('')
    const response = await sendRequest({ type: 'CLEAR_CAPTURE' })
    if (response.state) setState(response.state)
  }

  const exportSheet = async () => {
    if (!state.lastCapture) return

    setBusy(true)
    setError('')
    try {
      const clientId = chrome.runtime.getManifest().oauth2?.client_id ?? ''
      if (!clientId || clientId.startsWith('REPLACE_ME')) {
        throw new Error('Google OAuth is not configured. Set oauth2.client_id in public/manifest.json, rebuild, then reload the extension.')
      }

      const result = await exportMenuToNewSpreadsheet(state.lastCapture, sheetTitle)
      setLastSheetUrl(result.spreadsheetUrl)
      await chrome.tabs.create({ url: result.spreadsheetUrl })
    } catch (exportError) {
      setError(formatError(exportError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="bg-slate-50 p-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Menu Extractor</p>
          <h1 className="mt-1 text-xl font-bold text-slate-950">Website → Google Sheets</h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">Grab · DeliveryK</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${state.capturing ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>
          {state.capturing ? 'Capturing' : 'Idle'}
        </span>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex gap-2">
          {state.capturing ? (
            <button disabled={busy} onClick={stopCapture} className="flex-1 rounded-xl bg-rose-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              Stop capture
            </button>
          ) : (
            <button disabled={busy} onClick={startCapture} className="flex-1 rounded-xl bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              Start capture + reload
            </button>
          )}
          {state.lastCapture && (
            <button disabled={busy} onClick={clearCapture} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-50">
              Clear
            </button>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          Start capture on a restaurant page. The tab reloads once so the extension can read the menu API response.
        </p>
      </section>

      {error && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {error}
        </div>
      )}

      {!state.lastCapture ? (
        <section className="mt-3 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <div className="text-3xl">📡</div>
          <p className="mt-2 text-sm font-semibold text-slate-700">No menu captured yet</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">Open a supported restaurant page, then start capture.</p>
        </section>
      ) : (
        <>
          <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Detected provider</p>
                <p className="text-base font-bold text-slate-900">{providerLabel[state.lastCapture.provider]}</p>
              </div>
              {state.lastCapture.restaurantId && (
                <code className="max-w-44 truncate rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">{state.lastCapture.restaurantId}</code>
              )}
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {summary && [
                ['Categories', summary.categories],
                ['Products', summary.products],
                ['Groups', summary.toppingGroups],
                ['Toppings', summary.toppings],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-slate-50 px-2 py-2 text-center">
                  <div className="text-base font-bold text-slate-900">{value}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">{label}</div>
                </div>
              ))}
            </div>

            <p className="mt-3 truncate text-[11px] text-slate-400" title={state.lastCapture.sourceUrl}>{state.lastCapture.sourceUrl}</p>
          </section>

          <section className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-3 py-2">
              <h2 className="text-sm font-semibold text-slate-800">Preview</h2>
            </div>
            <div className="max-h-48 overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Category</th>
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map(({ category, item }, index) => (
                    <tr key={`${item.id}-${index}`} className="border-t border-slate-100">
                      <td className="max-w-28 truncate px-3 py-2 text-slate-500">{category}</td>
                      <td className="max-w-40 truncate px-3 py-2 font-medium text-slate-800">{item.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-600">{item.price}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <label className="text-xs font-semibold text-slate-700" htmlFor="sheet-title">Spreadsheet title</label>
            <input
              id="sheet-title"
              value={sheetTitle}
              onChange={event => setSheetTitle(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
            <button disabled={busy} onClick={exportSheet} className="mt-2.5 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
              {busy ? 'Working…' : 'Export to new Google Sheet'}
            </button>
            {lastSheetUrl && (
              <button onClick={() => chrome.tabs.create({ url: lastSheetUrl })} className="mt-2 w-full text-xs font-semibold text-indigo-600">
                Open exported spreadsheet ↗
              </button>
            )}
            <p className="mt-2 text-[11px] leading-4 text-slate-400">Creates two tabs: Menu and Menu + Toppings.</p>
          </section>
        </>
      )}
    </main>
  )
}
