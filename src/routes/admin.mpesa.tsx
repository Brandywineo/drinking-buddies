import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type MpesaState = {
  enabled: boolean
  environment: string
  ready: boolean
  checks: Record<string, boolean>
}
const labels: Record<string, string> = {
  consumerKey: 'Daraja consumer key',
  consumerSecret: 'Daraja consumer secret',
  shortcode: 'Business shortcode',
  passkey: 'STK Push passkey',
  callbackUrl: 'HTTPS callback URL',
  callbackToken: 'Callback security token (32+ characters)',
}

async function request<T>(method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/admin/settings/mpesa', {
    method, credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? 'Could not update M-Pesa settings.')
  return result.data as T
}

function MpesaAdminPage() {
  const [state, setState] = useState<MpesaState | null>(null)
  const [enabled, setEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const result = await request<MpesaState>()
      setState(result); setEnabled(result.enabled)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load M-Pesa settings.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function save() {
    setSaving(true); setError(''); setNotice('')
    try {
      await request('PUT', { enabled })
      setNotice(enabled ? 'M-Pesa checkout enabled for sandbox testing.' : 'M-Pesa checkout disabled.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save M-Pesa settings.')
    } finally { setSaving(false) }
  }

  return <main className="mx-auto grid w-full max-w-5xl gap-7 px-5 py-10 text-[var(--text-primary,#f5f5f5)]">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Kenya payments</p>
      <h1 className="mt-2 text-3xl font-semibold">M-Pesa settings</h1>
      <p className="mt-2 max-w-2xl text-sm opacity-70">Configure Daraja credentials on the server, verify the callback setup, and control whether paid meetup checkout is available.</p>
    </header>
    {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm">{notice}</p>}
    {loading ? <p className="text-sm opacity-60">Checking M-Pesa configuration…</p> : state && <>
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Checkout availability</h2><p className="mt-1 text-sm opacity-65">The current environment is <b className="uppercase">{state.environment}</b>. Live payments are not enabled in this release.</p></div>
          <span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (enabled ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200')}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
          <span><b className="block">Allow paid meetup checkout</b><small className="opacity-60">Attendees can request an M-Pesa STK Push for paid KES meetups.</small></span>
          <input type="checkbox" checked={enabled} disabled={!state.ready || saving} onChange={(event) => setEnabled(event.target.checked)} className="h-5 w-5 accent-lime-300" />
        </label>
        {!state.ready && <p className="mt-3 text-sm text-amber-200">Complete every server configuration check below before enabling checkout.</p>}
        <div className="mt-4 flex justify-end"><button onClick={() => void save()} disabled={saving || enabled === state.enabled || (enabled && !state.ready)} className="rounded-lg bg-lime-300 px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{saving ? 'Saving…' : 'Save M-Pesa settings'}</button></div>
      </section>
      <section className="rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-semibold">Server configuration</h2>
        <p className="mb-4 mt-1 text-sm opacity-65">Secrets are read from the server environment only. They are never returned to this page or stored in browser-accessible settings.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.entries(labels).map(([key, label]) => <div key={key} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 p-3"><span className="text-sm">{label}</span><span className={state.checks[key] ? 'text-xs font-semibold text-emerald-300' : 'text-xs font-semibold text-amber-200'}>{state.checks[key] ? 'Configured' : 'Missing'}</span></div>)}
        </div>
        <div className="mt-5 rounded-xl bg-black/20 p-4 text-sm">
          <b>Required environment variables</b>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs leading-6 opacity-75">MPESA_ENV=sandbox
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
MPESA_CALLBACK_URL=https://waleviticus.wiki.gd/api/webhooks/daraja
MPESA_CALLBACK_TOKEN=generate-a-random-secret-of-at-least-32-characters</pre>
          <p className="mt-3 text-xs opacity-60">Add actual values to the server-side .env file, then restart the application. Never paste credentials into chat or commit them to GitHub.</p>
        </div>
      </section>
      <section className="rounded-2xl border border-amber-300/20 bg-amber-300/[0.04] p-5 text-sm">
        <b className="text-amber-100">Launch safety</b>
        <p className="mt-2 opacity-75">This integration is sandbox-only. Payment confirmation comes from the authenticated Daraja callback and server-side STK query. Do not accept screenshots or client-side success messages as proof of payment. Organizer payouts remain separately reviewed and are not automatically marked paid.</p>
      </section>
    </>}
  </main>
}

export const Route = createFileRoute('/admin/mpesa')({ component: MpesaAdminPage })
