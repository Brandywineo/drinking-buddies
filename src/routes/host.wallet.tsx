import { createFileRoute } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type FormEvent } from 'react'

type Wallet = { id?: string; currency: string; pendingMinor: number; availableMinor: number; reservedMinor: number }
type Transaction = { id: string; kind: string; amountMinor: number; currency: string; createdAt: string; referenceType: string }
type Payout = { id: string; amountMinor: number; currency: string; status: string; destinationReference: string | null; requestedAt: string; failureReason: string | null }

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'include', ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error?.message ?? 'Request failed')
  return result.data as T
}
const formatMoney = (minor: number, currency = 'KES') => new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(minor / 100)

function HostWalletPage() {
  const [wallet, setWallet] = useState<Wallet>({ currency: 'KES', pendingMinor: 0, availableMinor: 0, reservedMinor: 0 })
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [payouts, setPayouts] = useState<Payout[]>([])
  const [amount, setAmount] = useState('')
  const [phone, setPhone] = useState('')
  const [plan, setPlan] = useState<'premium_monthly' | 'premium_annual'>('premium_monthly')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const data = await request<{ wallet: Wallet; transactions: Transaction[]; payouts: Payout[] }>('/api/host/wallet')
      setWallet(data.wallet); setTransactions(data.transactions); setPayouts(data.payouts)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not load your wallet.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const submitPayout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const amountMinor = Math.round(Number(amount) * 100)
      await request('/api/host/payouts', { method: 'POST', body: JSON.stringify({ amountMinor }) })
      setAmount(''); setNotice('Payout request submitted for admin approval.'); await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not request payout.') }
    finally { setBusy(false) }
  }

  const payMembership = async () => {
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await request<{ customerMessage?: string }>('/api/host/subscription/checkout', {
        method: 'POST', body: JSON.stringify({ plan, phone }),
      })
      setNotice(result.customerMessage ?? 'Check your phone to complete the M-PESA membership payment.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not start membership payment.') }
    finally { setBusy(false) }
  }

  return <main className="mx-auto grid w-full max-w-5xl gap-8 px-5 py-10 text-[var(--text-primary,#f5f5f5)]">
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Host tools</p><h1 className="mt-2 text-3xl font-semibold">Your earnings</h1><p className="mt-2 text-sm opacity-70">Track ticket revenue, request M-PESA payouts and manage your premium host membership.</p></header>
    {error && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-lime-300/30 bg-lime-300/10 p-3 text-sm">{notice}</div>}
    <section className="grid gap-3 sm:grid-cols-3">
      {[['Pending earnings', wallet.pendingMinor], ['Available to withdraw', wallet.availableMinor], ['Reserved for payouts', wallet.reservedMinor]].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"><p className="text-sm opacity-60">{label}</p><p className="mt-2 text-2xl font-semibold">{formatMoney(Number(value), wallet.currency)}</p></article>)}
    </section>
    <section className="grid gap-5 lg:grid-cols-2">
      <form onSubmit={submitPayout} className="grid content-start gap-3 rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-semibold">Request a payout</h2>
        <p className="text-sm opacity-65">Earnings become withdrawable 24 hours after the meetup ends. Every payout is reviewed by an admin and sent to your verified M-PESA number.</p>
        <label className="grid gap-1 text-sm">Amount (KES)<input required type="number" min="100" step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="rounded-lg border border-white/15 bg-black/20 px-3 py-2" /></label>
        <button disabled={busy || !amount} className="rounded-lg bg-lime-300 px-4 py-2.5 font-semibold text-black disabled:opacity-50">{busy ? 'Submitting…' : 'Request payout'}</button>
      </form>
      <div className="grid content-start gap-3 rounded-2xl border border-white/10 p-5">
        <h2 className="text-xl font-semibold">Premium host membership</h2>
        <p className="text-sm opacity-65">Renew or upgrade your membership using M-PESA. Your membership activates only after Daraja confirms payment.</p>
        <label className="grid gap-1 text-sm">Plan<select value={plan} onChange={(event) => setPlan(event.target.value as typeof plan)} className="rounded-lg border border-white/15 bg-black/20 px-3 py-2"><option value="premium_monthly">Monthly</option><option value="premium_annual">Annual</option></select></label>
        <label className="grid gap-1 text-sm">Verified M-PESA phone<input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="2547XXXXXXXX" className="rounded-lg border border-white/15 bg-black/20 px-3 py-2" /></label>
        <button disabled={busy || !phone.trim()} onClick={() => void payMembership()} className="rounded-lg border border-lime-300/50 px-4 py-2.5 font-semibold disabled:opacity-50">{busy ? 'Starting…' : 'Pay membership with M-PESA'}</button>
      </div>
    </section>
    <section className="grid gap-3"><h2 className="text-xl font-semibold">Payout history</h2>{loading ? <p className="text-sm opacity-60">Loading…</p> : payouts.length === 0 ? <p className="rounded-xl border border-white/10 p-4 text-sm opacity-60">No payout requests yet.</p> : payouts.map((payout) => <article key={payout.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/10 p-4"><div><b>{formatMoney(payout.amountMinor, payout.currency)}</b><p className="text-xs opacity-60">{payout.destinationReference ?? 'M-PESA wallet'} · {new Date(payout.requestedAt).toLocaleString()}</p>{payout.failureReason && <p className="text-xs text-amber-300">{payout.failureReason}</p>}</div><span className="text-sm capitalize">{payout.status}</span></article>)}</section>
    <section className="grid gap-3"><h2 className="text-xl font-semibold">Wallet activity</h2>{transactions.length === 0 ? <p className="rounded-xl border border-white/10 p-4 text-sm opacity-60">No wallet activity yet.</p> : transactions.map((entry) => <article key={entry.id} className="flex flex-wrap justify-between gap-3 rounded-xl border border-white/10 p-4"><div><b className="capitalize">{entry.kind.replaceAll('_', ' ')}</b><p className="text-xs opacity-60">{entry.referenceType} · {new Date(entry.createdAt).toLocaleString()}</p></div><span className={entry.amountMinor < 0 ? 'text-red-300' : 'text-lime-300'}>{formatMoney(entry.amountMinor, entry.currency)}</span></article>)}</section>
    <footer className="text-xs opacity-50">M-PESA transactions are sandbox-only until Safaricom approves the live marketplace funds flow.</footer>
  </main>
}

export const Route = createFileRoute('/host/wallet')({ component: HostWalletPage })
