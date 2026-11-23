import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

type FinanceSettings = {
  commissionBps: number
  minimumPayoutMinor: number
  payoutReleaseHours: number
  hostTrialDays: number
  hostMonthlyPriceMinor: number
  hostAnnualPriceMinor: number
  consumerMonthlyPriceMinor: number
  consumerAnnualPriceMinor: number
}
type Payout = { id: string; email: string; displayName: string | null; amountMinor: number; status: string; destinationReference: string | null; currency: string }
type ReconciliationEvent = { id: string; provider: string; providerEventId: string; eventType: string; processedAt: string | null; processingError: string | null; createdAt: string }
type Refund = { id: string; attendeeEmail: string; attendeeName: string | null; amountMinor: number; hostDebitMinor: number; currency: string; status: string; failureReason: string | null }

const defaults: FinanceSettings = {
  commissionBps: 1000, minimumPayoutMinor: 10000, payoutReleaseHours: 24,
  hostTrialDays: 14, hostMonthlyPriceMinor: 0, hostAnnualPriceMinor: 0, consumerMonthlyPriceMinor: 0, consumerAnnualPriceMinor: 0,
}
const money = (minor: number, currency = 'KES') => new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(minor / 100)

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? 'Request failed')
  return result.data as T
}

function AdminFinancePage() {
  const [settings, setSettings] = useState(defaults)
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [refunds, setRefunds] = useState<Refund[]>([])
  const [events, setEvents] = useState<ReconciliationEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [finance, payoutData, refundData, eventData] = await Promise.all([
        api<FinanceSettings>('/api/admin/finance/settings'),
        api<{ payouts: Payout[] }>('/api/admin/finance/payouts'),
        api<{ refunds: Refund[] }>('/api/admin/finance/refunds'),
        api<{ events: ReconciliationEvent[] }>('/api/admin/finance/reconciliation'),
      ])
      setSettings(finance)
      setPayouts(payoutData.payouts)
      setRefunds(refundData.refunds)
      setEvents(eventData.events)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load finance data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true); setNotice(''); setError('')
    try {
      await api('/api/admin/finance/settings', { method: 'PUT', body: JSON.stringify(settings) })
      setNotice('Finance settings saved.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save settings.')
    } finally { setSaving(false) }
  }

  const decide = async (kind: 'payouts' | 'refunds', id: string, decision: 'approve' | 'reject') => {
    setBusy(id); setNotice(''); setError('')
    try {
      const endpoint = kind === 'payouts' ? 'payouts' : 'refunds'
      await api('/api/admin/finance/' + endpoint + '/' + id + '/decision', {
        method: 'POST', body: JSON.stringify({ decision }),
      })
      setNotice((kind === 'payouts' ? 'Payout ' : 'Refund ') + decision + ' action submitted.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not process this decision.')
    } finally { setBusy('') }
  }

  const field = (label: string, key: keyof FinanceSettings, suffix = '') => (
    <label className="grid gap-1 text-sm font-medium">
      <span>{label}</span>
      <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/20 px-3 py-2">
        <input className="w-full bg-transparent outline-none" type="number" min="0" value={settings[key]}
          onChange={(event) => setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))} />
        {suffix && <span className="text-xs opacity-60">{suffix}</span>}
      </div>
    </label>
  )

  return <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 text-[var(--text-primary,#f5f5f5)]">
    <header>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Marketplace operations</p>
      <h1 className="mt-2 text-3xl font-semibold">Finance administration</h1>
      <p className="mt-2 max-w-2xl text-sm opacity-70">Manage marketplace fees, host release timing, membership pricing, payout approvals and attendee refunds.</p>
    </header>

    {error && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm">{notice}</div>}

    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-xl font-semibold">Marketplace settings</h2>
      <p className="mb-5 mt-1 text-sm opacity-60">Amounts are entered in minor units (KES cents). A 1,000 BPS commission equals 10%.</p>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {field('Commission', 'commissionBps', 'BPS')}
        {field('Minimum host payout', 'minimumPayoutMinor', 'minor units')}
        {field('Earnings release delay', 'payoutReleaseHours', 'hours')}
        {field('Host free trial', 'hostTrialDays', 'days')}
        {field('Monthly host membership', 'hostMonthlyPriceMinor', 'minor units')}
        {field('Annual host membership', 'hostAnnualPriceMinor', 'minor units')}
        {field('Monthly Consumer Plus', 'consumerMonthlyPriceMinor', 'minor units')}
        {field('Annual Consumer Plus', 'consumerAnnualPriceMinor', 'minor units')}
        <div className="sm:col-span-2 lg:col-span-3 flex justify-end">
          <button disabled={saving} className="rounded-lg bg-lime-300 px-5 py-2.5 font-semibold text-black disabled:opacity-50">{saving ? 'Saving…' : 'Save finance settings'}</button>
        </div>
      </form>
    </section>

    <section className="grid gap-4">
      <div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Host payout requests</h2><p className="text-sm opacity-60">Every payout requires manual approval. Approval sends a Daraja B2C request.</p></div><span className="text-sm opacity-60">{payouts.filter((p) => p.status === 'requested').length} awaiting review</span></div>
      {loading ? <p className="text-sm opacity-60">Loading payout queue…</p> : payouts.length === 0 ? <p className="rounded-xl border border-white/10 p-5 text-sm opacity-60">No payout requests.</p> : payouts.map((payout) => <article key={payout.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
        <div><b>{payout.displayName ?? payout.email}</b><p className="text-sm opacity-65">{payout.email} · {payout.destinationReference ?? 'No destination'}</p><p className="mt-1 text-sm">{money(payout.amountMinor, payout.currency)} · <span className="capitalize">{payout.status}</span></p></div>
        {payout.status === 'requested' && <div className="flex gap-2"><button disabled={busy === payout.id} onClick={() => void decide('payouts', payout.id, 'reject')} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Reject</button><button disabled={busy === payout.id} onClick={() => void decide('payouts', payout.id, 'approve')} className="rounded-lg bg-lime-300 px-3 py-2 text-sm font-semibold text-black">Approve & pay</button></div>}
      </article>)}
    </section>

    <section className="grid gap-4">
      <div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Refund requests</h2><p className="text-sm opacity-60">Approving a refund submits a Daraja reversal of the original M-PESA transaction.</p></div><span className="text-sm opacity-60">{refunds.filter((r) => r.status === 'requested').length} awaiting review</span></div>
      {loading ? <p className="text-sm opacity-60">Loading refund queue…</p> : refunds.length === 0 ? <p className="rounded-xl border border-white/10 p-5 text-sm opacity-60">No refund requests.</p> : refunds.map((refund) => <article key={refund.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
        <div><b>{refund.attendeeName ?? refund.attendeeEmail}</b><p className="text-sm opacity-65">{refund.attendeeEmail}</p><p className="mt-1 text-sm">{money(refund.amountMinor, refund.currency)} refund · host share {money(refund.hostDebitMinor, refund.currency)} · <span className="capitalize">{refund.status}</span></p>{refund.failureReason && <p className="mt-1 text-xs text-amber-300">{refund.failureReason}</p>}</div>
        {refund.status === 'requested' && <div className="flex gap-2"><button disabled={busy === refund.id} onClick={() => void decide('refunds', refund.id, 'reject')} className="rounded-lg border border-white/20 px-3 py-2 text-sm">Reject</button><button disabled={busy === refund.id} onClick={() => void decide('refunds', refund.id, 'approve')} className="rounded-lg bg-lime-300 px-3 py-2 text-sm font-semibold text-black">Approve reversal</button></div>}
      </article>)}
    </section>

    <section className="grid gap-3">
      <div><h2 className="text-xl font-semibold">Reconciliation exceptions</h2><p className="text-sm opacity-60">Unprocessed callbacks and provider events requiring manual investigation. Uncertain money movements remain reserved.</p></div>
      {events.length === 0 ? <p className="rounded-xl border border-white/10 p-4 text-sm opacity-60">No reconciliation exceptions.</p> : events.map((event) => <article key={event.id} className="rounded-xl border border-amber-300/20 p-4">
        <div className="flex flex-wrap justify-between gap-2"><b>{event.provider} · {event.eventType}</b><span className="text-xs opacity-60">{new Date(event.createdAt).toLocaleString()}</span></div>
        <p className="mt-1 break-all text-xs opacity-60">{event.providerEventId}</p>
        {event.processingError && <p className="mt-2 text-sm text-amber-200">{event.processingError}</p>}
        <p className="mt-1 text-xs opacity-50">{event.processedAt ? 'Processed' : 'Awaiting processing / reconciliation'}</p>
      </article>)}
    </section>
    <footer className="text-xs opacity-50">Daraja execution remains sandbox-only. Configure credentials and Safaricom callback permissions before running transaction tests.</footer>
  </main>
}

export const Route = createFileRoute('/admin/finance')({ component: AdminFinancePage })
