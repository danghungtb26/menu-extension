import { useEffect, useMemo, useState } from 'react'
import { getCaptureSummary } from './flatten'
import type { CaptureState, RuntimeRequest, RuntimeResponse } from './types'

const initialState: CaptureState = {
  capturing: false,
  exporting: false,
  phase: 'idle',
}

const sendRequest = async (request: RuntimeRequest): Promise<RuntimeResponse> =>
  chrome.runtime.sendMessage(request) as Promise<RuntimeResponse>

const providerLabel: Record<string, string> = {
  grab: 'Grab',
  deliveryk: 'DeliveryK',
}

const phaseLabel: Record<CaptureState['phase'], string> = {
  idle: 'Ready',
  capturing: 'Reading menu API…',
  writing: 'Creating Google Sheet…',
  done: 'Export completed',
  error: 'Export failed',
}

export const App = () => {
  const [state, setState] = useState<CaptureState>(initialState)
  const [requestError, setRequestError] = useState('')

  useEffect(() => {
    void sendRequest({ type: 'GET_STATE' }).then(response => {
      if (response.state) setState(response.state)
    })

    const listener = (message: { type?: string; state?: CaptureState }) => {
      if (message.type === 'CAPTURE_UPDATED' && message.state) {
        setState(message.state)
      }
    }

    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const summary = useMemo(
    () => state.lastCapture ? getCaptureSummary(state.lastCapture) : null,
    [state.lastCapture],
  )

  const exportCurrentMenu = async () => {
    setRequestError('')

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      if (tab?.id === undefined) throw new Error('Cannot find the active tab.')

      const response = await sendRequest({ type: 'EXPORT_CURRENT_TAB', tabId: tab.id })
      if (!response.ok) throw new Error(response.error || 'Cannot start export.')
      if (response.state) setState(response.state)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error))
    }
  }

  const openLastSheet = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (state.lastSheetUrl) void chrome.tabs.create({ url: state.lastSheetUrl })
  }

  const currentError = requestError || state.error
  const provider = state.lastCapture ? providerLabel[state.lastCapture.provider] : undefined

  return (
    <main className="bg-slate-50 p-4">
      <header className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Menu Extractor</p>
        <h1 className="mt-1 text-xl font-bold text-slate-950">Export menu to Google Sheets</h1>
        <p className="mt-1 text-xs leading-5 text-slate-500">Grab · DeliveryK</p>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-slate-500">Status</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{phaseLabel[state.phase]}</p>
          </div>
          <span className={`h-2.5 w-2.5 rounded-full ${state.exporting ? 'animate-pulse bg-indigo-500' : state.phase === 'done' ? 'bg-emerald-500' : state.phase === 'error' ? 'bg-rose-500' : 'bg-slate-300'}`} />
        </div>

        <button
          disabled={state.exporting}
          onClick={exportCurrentMenu}
          className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.exporting ? 'Exporting…' : 'Export'}
        </button>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          Nothing is captured until you click Export. The current restaurant tab reloads once, the menu API is read, and the spreadsheet is created automatically.
        </p>
      </section>

      {currentError && (
        <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
          {currentError}
        </div>
      )}

      {state.lastCapture && summary && (
        <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">Last detected menu</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900">{provider}</p>
            </div>
            {state.lastCapture.restaurantId && (
              <code className="max-w-44 truncate rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600">
                {state.lastCapture.restaurantId}
              </code>
            )}
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
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

          {state.lastSheetUrl && (
            <a
              href={state.lastSheetUrl}
              onClick={openLastSheet}
              className="mt-3 block text-xs font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Open last exported spreadsheet ↗
            </a>
          )}
        </section>
      )}
    </main>
  )
}
