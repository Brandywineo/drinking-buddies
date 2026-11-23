import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'

type CredentialKey =
  | 'consumerKey' | 'consumerSecret' | 'shortcode' | 'passkey' | 'callbackUrl' | 'callbackToken'
  | 'b2cInitiatorName' | 'b2cSecurityCredential' | 'b2cResultUrl' | 'b2cTimeoutUrl'
  | 'reversalInitiatorName' | 'reversalSecurityCredential' | 'reversalReceiverParty'
  | 'reversalIdentifierType' | 'reversalResultUrl' | 'reversalTimeoutUrl'
type MpesaState = {
  enabled: boolean
  environment: 'sandbox' | 'production'
  ready: boolean
  encryptionReady: boolean
  checks: Record<string, boolean>
  configured: Record<CredentialKey, boolean>
}
const coreFields: { key: CredentialKey; label: string; hint: string; secret?: boolean }[] = [
  { key: 'consumerKey', label: 'Daraja consumer key', hint: 'From your Safaricom Daraja app' },
  { key: 'consumerSecret', label: 'Daraja consumer secret', hint: 'Stored encrypted; never displayed again', secret: true },
  { key: 'shortcode', label: 'Business shortcode', hint: 'Paybill or Till shortcode' },
  { key: 'passkey', label: 'STK Push passkey', hint: 'Daraja Lipa Na M-Pesa passkey', secret: true },
  { key: 'callbackUrl', label: 'STK callback URL', hint: 'HTTPS URL; defaults from the app URL' },
  { key: 'callbackToken', label: 'Callback security token', hint: 'Generated automatically if left blank', secret: true },
]
const payoutFields: typeof coreFields = [
  { key: 'b2cInitiatorName', label: 'B2C initiator name', hint: 'Safaricom-approved initiator' },
  { key: 'b2cSecurityCredential', label: 'B2C security credential', hint: 'Encrypted Daraja security credential', secret: true },
  { key: 'b2cResultUrl', label: 'B2C result URL', hint: 'HTTPS callback endpoint' },
  { key: 'b2cTimeoutUrl', label: 'B2C timeout URL', hint: 'HTTPS callback endpoint' },
  { key: 'reversalInitiatorName', label: 'Reversal initiator name', hint: 'Safaricom-approved initiator' },
  { key: 'reversalSecurityCredential', label: 'Reversal security credential', hint: 'Encrypted Daraja security credential', secret: true },
  { key: 'reversalReceiverParty', label: 'Reversal receiver party', hint: 'Safaricom-approved receiver party' },
  { key: 'reversalIdentifierType', label: 'Reversal identifier type', hint: 'Safaricom-approved identifier type' },
  { key: 'reversalResultUrl', label: 'Reversal result URL', hint: 'HTTPS callback endpoint' },
  { key: 'reversalTimeoutUrl', label: 'Reversal timeout URL', hint: 'HTTPS callback endpoint' },
]

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
  const [credentials, setCredentials] = useState<Partial<Record<CredentialKey, string>>>({})
  const [enabled, setEnabled] = useState(false)
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function load() {
    setLoading(true); setError('')
    try {
      const result = await request<MpesaState>()
      setState(result); setEnabled(result.enabled); setEnvironment(result.environment)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load M-Pesa settings.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function testConnection() {
    setTesting(true); setError(''); setNotice('')
    try {
      const result = await request<{ connected: boolean; environment: string }>('POST')
      setNotice(`Daraja OAuth connection successful (${result.environment}). No payment was initiated.`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Daraja connection test failed.')
    } finally { setTesting(false) }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true); setError(''); setNotice('')
    try {
      await request('PUT', { enabled, environment, credentials })
      setCredentials({})
      setNotice('M-Pesa configuration saved securely. Existing secrets were kept where fields were left blank.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save M-Pesa settings.')
    } finally { setSaving(false) }
  }

  function field(item: (typeof coreFields)[number]) {
    const configured = state?.configured[item.key]
    return <label key={item.key} className="grid gap-2 text-sm">
      <span className="font-medium">{item.label}<small className="mt-1 block text-xs opacity-55">{item.hint}</small></span>
      <input
        type={item.secret ? 'password' : 'text'}
        autoComplete="off"
        value={credentials[item.key] ?? ''}
        onChange={(event) => setCredentials((current) => ({ ...current, [item.key]: event.target.value }))}
        placeholder={configured ? 'Saved securely — enter only to replace' : 'Enter value'}
        className="min-w-0 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none focus:border-lime-300"
      />
      <span className={configured ? 'text-xs text-emerald-300' : 'text-xs text-amber-200'}>{configured ? 'Configured' : 'Not configured'}</span>
    </label>
  }

  return <main className="mx-auto grid w-full max-w-5xl gap-7 px-5 py-10 text-[var(--text-primary,#f5f5f5)]">
    <Link to="/admin" className="text-sm opacity-65">← Admin dashboard</Link>
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Kenya payments</p>
      <h1 className="mt-2 text-3xl font-semibold">M-Pesa settings</h1>
      <p className="mt-2 max-w-2xl text-sm opacity-70">The owner can configure Daraja directly here. Credentials are encrypted before they are saved and are never sent back to the browser.</p>
    </header>
    {error && <p role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm">{notice}</p>}
    {loading ? <p className="text-sm opacity-60">Checking M-Pesa configuration…</p> : state && <form onSubmit={save} className="grid gap-6">
      {!state.encryptionReady && <section role="alert" className="rounded-xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm">
        <b className="text-amber-100">One-time server security setup required</b>
        <p className="mt-2 opacity-80">Before saving payment credentials, the server administrator must add APP_ENCRYPTION_KEY to the server .env file. Generate it with: <code>openssl rand -base64 32</code>. This key stays on the server and is never entered in this form.</p>
      </section>}
      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="text-xl font-semibold">Checkout availability</h2><p className="mt-1 text-sm opacity-65">Environment: <b className="uppercase">{environment}</b>. This selection controls the Daraja API host used for new checkouts.</p></div>
          <span className={'rounded-full px-3 py-1 text-xs font-semibold ' + (enabled ? 'bg-emerald-400/15 text-emerald-300' : 'bg-amber-400/15 text-amber-200')}>{enabled ? 'Enabled' : 'Disabled'}</span>
        </div>
        <label className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
          <span><b className="block">Enable M-PESA payments</b><small className="opacity-60">Controls all new M-PESA STK checkout flows: meetup tickets, host memberships, venue packages and Consumer Plus.</small></span>
          <input type="checkbox" checked={enabled} disabled={saving || !state.encryptionReady || (!enabled && !state.ready)} onChange={(event) => setEnabled(event.target.checked)} className="h-5 w-5 accent-lime-300" />
        </label>
        <div className="mt-5 grid gap-2">
          <label className="text-sm font-medium">Daraja environment</label>
          <select value={environment} onChange={(event) => setEnvironment(event.target.value as 'sandbox' | 'production')} className="w-full rounded-lg border border-white/10 bg-black/20 px-3 py-3 text-white">
            <option value="sandbox">Sandbox — test payments</option>
            <option value="production">Live — real customer payments</option>
          </select>
          <small className="opacity-60">Sandbox and live Daraja apps use different credentials. Make sure the credentials above belong to the selected environment.</small>
        </div>
        {!state.ready && <p className="mt-3 text-sm text-amber-200">Complete all required Daraja settings below before enabling checkout.</p>}
        {environment === 'production' && <p className="mt-3 rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Live mode sends real payment prompts to customers and moves real money. Confirm Safaricom production approval, shortcode, passkey and live API credentials before enabling it.</p>}
      </section>
      <section className="rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-semibold">STK Push credentials</h2>
        <p className="mb-5 mt-1 text-sm opacity-65">Enter or replace credentials. Saved values are masked and cannot be retrieved from this screen.</p>
        <div className="grid gap-5 sm:grid-cols-2">{coreFields.map(field)}</div>
      </section>
      <details className="rounded-2xl border border-white/10 p-5">
        <summary className="cursor-pointer font-semibold">Advanced: payouts and reversals</summary>
        <p className="mb-5 mt-2 text-sm opacity-65">Optional Safaricom B2C payout and reversal credentials. These are also encrypted and never displayed after saving.</p>
        <div className="grid gap-5 sm:grid-cols-2">{payoutFields.map(field)}</div>
      </details>
      <section className="rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-4 text-sm">
        <b className="text-amber-100">Payment safety</b>
        <p className="mt-2 opacity-75">Checkout uses the selected Daraja environment. Payment confirmation is accepted only after authenticated Daraja callbacks and server-side STK verification. Never use screenshots or client-side success messages as proof of payment. B2C payouts and reversals remain sandbox-only and subject to admin review.</p>
      </section>
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={() => void testConnection()} disabled={testing || saving || !state.ready} className="rounded-lg border border-white/15 px-5 py-2.5 text-sm disabled:opacity-40">{testing ? 'Testing Daraja…' : 'Test connection'}</button>
        <button type="button" onClick={() => { setCredentials({}); void load() }} disabled={saving || testing} className="rounded-lg border border-white/15 px-5 py-2.5 text-sm">Discard changes</button>
        <button type="submit" disabled={saving || testing || !state.encryptionReady} className="rounded-lg bg-lime-300 px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-40">{saving ? 'Saving securely…' : 'Save M-Pesa configuration'}</button>
      </div>
    </form>}
  </main>
}

export const Route = createFileRoute('/admin/mpesa')({ component: MpesaAdminPage })
