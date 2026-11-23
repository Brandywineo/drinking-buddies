import { createFileRoute,Link } from '@tanstack/react-router'
import { useEffect,useState } from 'react'
export const Route=createFileRoute('/admin')({component:AdminDashboard})
type Counts={users:number;reports:number;pendingReports:number}
function AdminDashboard(){
 const [counts,setCounts]=useState<Counts|null>(null),[error,setError]=useState('')
 useEffect(()=>{
  Promise.all([
   fetch('/api/admin/users',{credentials:'include'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error?.message??'Admin access required');return j.data.users as unknown[]}),
   fetch('/api/admin/reports',{credentials:'include'}).then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error?.message??'Could not load reports');return j.data.reports as {status:string}[]})
  ]).then(([users,reports])=>setCounts({users:users.length,reports:reports.length,pendingReports:reports.filter(r=>r.status==='open'||r.status==='reviewing').length}))
   .catch(e=>setError(e instanceof Error?e.message:'Could not load admin overview'))
 },[])
 const links=[{to:'/admin/users',title:'User management',desc:'Review accounts and suspend or reactivate users.'},{to:'/admin/moderation',title:'Moderation',desc:'Review member reports and record outcomes.'},{to:'/admin/settings',title:'Platform settings',desc:'Control email verification and registration policy.'},{to:'/admin/finance',title:'Finance',desc:'Marketplace fees, payouts, refunds and reconciliation.'}] as const
 return <main className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 text-[var(--text-primary,#f5f5f5)]">
  <header><p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">Drinking Buddies operations</p><h1 className="mt-2 text-3xl font-semibold">Admin dashboard</h1><p className="mt-2 text-sm opacity-70">Manage members, safety, platform policy and marketplace operations.</p></header>
  {error&&<div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm">{error}</div>}
  <section className="grid gap-4 sm:grid-cols-3">{[{label:'Registered users',value:counts?.users},{label:'Reports',value:counts?.reports},{label:'Needs moderation',value:counts?.pendingReports}].map(x=><div key={x.label} className="rounded-2xl border border-white/10 p-5"><p className="text-sm opacity-60">{x.label}</p><p className="mt-2 text-3xl font-semibold">{x.value??'—'}</p></div>)}</section>
  <section className="grid gap-4 sm:grid-cols-2">{links.map(item=><Link key={item.to} to={item.to} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-lime-300/50"><h2 className="text-lg font-semibold">{item.title}</h2><p className="mt-2 text-sm opacity-65">{item.desc}</p><span className="mt-4 inline-block text-sm font-semibold text-lime-300">Open section →</span></Link>)}</section>
 </main>
}
