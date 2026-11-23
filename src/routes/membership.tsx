import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

export const Route = createFileRoute('/membership')({ component: Membership })
type Plan = { monthlyPriceMinor: number; annualPriceMinor: number }
type VenuePackage = { id: string; name: string; description: string | null; priceMinor: number; billingInterval: string }
type Data = {
  hostMembership: { status: string; currentPeriodEnd: string } | null
  hostPlans: Plan
  consumerMembership: { status: string; currentPeriodEnd: string } | null
  consumerPlans: Plan
  venuePackages: VenuePackage[]
  ownedVenues: { venue: { id: string; name: string; approvalStatus: string }; status: string }[]
  paymentHistory: { id: string; amountMinor: number; currency: string; status: string; createdAt: string }[]
}
function Membership() {
  const [data, setData] = useState<Data | null>(null)
  const [phone, setPhone] = useState('')
  const [hostPlan, setHostPlan] = useState<'premium_monthly' | 'premium_annual'>('premium_monthly')
  const [consumerPlan, setConsumerPlan] = useState<'plus_monthly' | 'plus_annual'>('plus_monthly')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => {
    fetch('/api/membership', { credentials: 'include' }).then(async response => {
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Sign in to view plans')
      setData(result.data)
    }).catch(error => setMessage(error instanceof Error ? error.message : 'Could not load plans'))
  }, [])
  const money = (minor: number, currency = 'KES') => new Intl.NumberFormat('en-KE', { style: 'currency', currency }).format(minor / 100)
  async function pay(url: string, body: Record<string, string>) {
    setBusy(true); setMessage('')
    try {
      const response = await fetch(url, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...body, phone }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not start M-PESA checkout')
      setMessage(result.data?.customerMessage ?? 'M-PESA prompt sent. Complete payment on your phone.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Checkout failed') }
    finally { setBusy(false) }
  }
  return <main className="mx-auto grid w-full max-w-5xl gap-6 px-5 py-10 text-[var(--text-primary,#f5f5f5)]">
    <Link to="/" className="text-sm opacity-65">← Back to Drinking Buddies</Link>
    <header><p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Memberships</p><h1 className="mt-2 text-3xl font-semibold">More from your nights out.</h1><p className="mt-2 text-sm opacity-65">Kenya-first memberships with KES pricing and M-PESA checkout.</p></header>
    {message && <p role="status" className="rounded-xl border border-lime-300/30 bg-lime-300/10 p-3 text-sm">{message}</p>}
    <label className="grid max-w-sm gap-2 text-xs">Verified M-PESA phone<input className="rounded-lg border border-white/15 bg-black/30 p-3 text-sm" placeholder="07XX XXX XXX" value={phone} onChange={event => setPhone(event.target.value)} /></label>
    {data && <section className="grid gap-4 md:grid-cols-2">
      <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"><p className="text-xs font-semibold uppercase tracking-widest opacity-60">For members</p><h2 className="mt-2 text-xl font-semibold">Consumer Plus</h2><p className="mt-2 text-sm opacity-65">Membership for people who want more from their social experience.</p>
        <div className="mt-5 grid gap-2 text-sm"><label><input type="radio" checked={consumerPlan === 'plus_monthly'} onChange={() => setConsumerPlan('plus_monthly')} /> Monthly · {money(data.consumerPlans.monthlyPriceMinor)}</label><label><input type="radio" checked={consumerPlan === 'plus_annual'} onChange={() => setConsumerPlan('plus_annual')} /> Annual · {money(data.consumerPlans.annualPriceMinor)}</label></div>
        <button disabled={busy || !phone.trim() || (consumerPlan === 'plus_monthly' ? data.consumerPlans.monthlyPriceMinor : data.consumerPlans.annualPriceMinor) <= 0} onClick={() => void pay('/api/consumer/subscription/checkout', { plan: consumerPlan })} className="mt-4 rounded-lg bg-lime-300 px-4 py-3 text-sm font-semibold text-black disabled:opacity-40">Join Consumer Plus</button>
        {data.consumerMembership && <p className="mt-3 text-xs opacity-60">Status: {data.consumerMembership.status} · Ends {new Date(data.consumerMembership.currentPeriodEnd).toLocaleDateString()}</p>}
      </article>
      <article className="rounded-2xl border border-lime-300/40 bg-lime-300/[0.05] p-6"><p className="text-xs font-semibold uppercase tracking-widest text-lime-300">For meetup hosts</p><h2 className="mt-2 text-xl font-semibold">Host Plus</h2><p className="mt-2 text-sm opacity-65">Membership for people who regularly organise paid meetups.</p>
        <div className="mt-5 grid gap-2 text-sm"><label><input type="radio" checked={hostPlan === 'premium_monthly'} onChange={() => setHostPlan('premium_monthly')} /> Monthly · {money(data.hostPlans.monthlyPriceMinor)}</label><label><input type="radio" checked={hostPlan === 'premium_annual'} onChange={() => setHostPlan('premium_annual')} /> Annual · {money(data.hostPlans.annualPriceMinor)}</label></div>
        <button disabled={busy || !phone.trim() || (hostPlan === 'premium_monthly' ? data.hostPlans.monthlyPriceMinor : data.hostPlans.annualPriceMinor) <= 0} onClick={() => void pay('/api/host/subscription/checkout', { plan: hostPlan })} className="mt-4 rounded-lg bg-lime-300 px-4 py-3 text-sm font-semibold text-black disabled:opacity-40">Pay with M-PESA</button>
        {data.hostMembership && <p className="mt-3 text-xs opacity-60">Status: {data.hostMembership.status} · Ends {new Date(data.hostMembership.currentPeriodEnd).toLocaleDateString()}</p>}
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-widest opacity-60">For venue partners</p><h2 className="mt-2 text-xl font-semibold">Business packages</h2><p className="mt-2 text-sm opacity-65">Choose a package for one of your approved venues.</p>
        {data.venuePackages.map(pkg => <div key={pkg.id} className="mt-4 border-t border-white/10 pt-4"><div className="flex flex-wrap justify-between gap-3"><b>{pkg.name}</b><b>{money(pkg.priceMinor)} / {pkg.billingInterval}</b></div><p className="mt-1 text-xs opacity-60">{pkg.description}</p>{data.ownedVenues.filter(item => item.venue.approvalStatus === 'approved').map(item => <button key={item.venue.id} disabled={busy || !phone.trim()} onClick={() => void pay('/api/venue/subscription/checkout', { venueId: item.venue.id, packageId: pkg.id })} className="mt-2 mr-2 rounded-lg border border-white/15 px-3 py-2 text-xs">Buy for {item.venue.name}</button>)}</div>)}
        {!data.venuePackages.length && <p className="mt-4 text-sm opacity-55">Business packages will appear here when enabled.</p>}
      </article>
    </section>}
    {data && <section className="rounded-xl border border-white/10 p-5"><h2 className="font-semibold">Your venues</h2>{data.ownedVenues.map(item => <p key={item.venue.id} className="mt-3 flex justify-between gap-3 text-sm"><span>{item.venue.name} · {item.venue.approvalStatus}</span><span className="capitalize opacity-60">{item.status}</span></p>)}{!data.ownedVenues.length && <p className="mt-2 text-sm opacity-55">Register a venue in Places & events to see business plans here.</p>}</section>}
    {data && <section className="rounded-xl border border-white/10 p-5"><h2 className="font-semibold">Recent payments</h2>{data.paymentHistory.map(payment => <p key={payment.id} className="mt-2 flex justify-between gap-3 text-sm"><span>{new Date(payment.createdAt).toLocaleDateString()} · {payment.status}</span><span>{money(payment.amountMinor, payment.currency)}</span></p>)}{!data.paymentHistory.length && <p className="mt-2 text-sm opacity-55">No payments yet.</p>}</section>}
  </main>
}
