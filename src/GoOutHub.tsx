import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CalendarDays, Clock, MapPin, MessageCircle, Plus, RefreshCw, Users, X } from 'lucide-react'

type Props = { currentUserId: string | null; signedIn: boolean; onSignIn: () => void }
type Plan = {
  id: string; creatorId: string; title: string; description: string | null; area: string
  venueName: string | null; startsAt: string; capacity: number; visibility: 'public' | 'private'
  creatorName: string; goingCount: number; myStatus: 'going' | 'left' | null
}
type Squad = {
  id: string; ownerId: string; name: string; description: string | null; area: string | null
  visibility: 'public' | 'private'; ownerName: string; memberCount: number
  myRole: 'owner' | 'admin' | 'member' | null; myStatus: 'active' | 'invited' | 'left' | null
}
type SquadMessage = { id: string; senderId: string; body: string; createdAt: string; senderName: string | null }
type CalendarMeetup = { id: string; title: string; area: string; startsAt: string }

export function GoOutHub({ currentUserId, signedIn, onSignIn }: Props) {
  const [section, setSection] = useState<'plans' | 'squads' | 'calendar'>('plans')
  const [plans, setPlans] = useState<Plan[]>([])
  const [squads, setSquads] = useState<Squad[]>([])
  const [meetups, setMeetups] = useState<CalendarMeetup[]>([])
  const [activeSquad, setActiveSquad] = useState<Squad | null>(null)
  const [messages, setMessages] = useState<SquadMessage[]>([])
  const [messageBody, setMessageBody] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPlanForm, setShowPlanForm] = useState(false)
  const [showSquadForm, setShowSquadForm] = useState(false)
  const [planTitle, setPlanTitle] = useState('')
  const [planDescription, setPlanDescription] = useState('')
  const [planArea, setPlanArea] = useState('')
  const [planVenue, setPlanVenue] = useState('')
  const [planTime, setPlanTime] = useState('')
  const [planCapacity, setPlanCapacity] = useState('8')
  const [planVisibility, setPlanVisibility] = useState<'public' | 'private'>('public')
  const [squadName, setSquadName] = useState('')
  const [squadDescription, setSquadDescription] = useState('')
  const [squadArea, setSquadArea] = useState('')
  const [squadVisibility, setSquadVisibility] = useState<'public' | 'private'>('public')

  async function loadPlans() {
    const response = await fetch('/api/go-out')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'Could not load plans.')
    setPlans(result.data?.plans ?? [])
  }
  async function loadSquads() {
    const response = await fetch('/api/squads')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'Could not load squads.')
    setSquads(result.data?.squads ?? [])
  }
  async function loadMeetups() {
    const response = await fetch('/api/meetups')
    if (!response.ok) return
    const result = await response.json()
    setMeetups((result.data?.meetups ?? []).map((item: CalendarMeetup) => ({ id: item.id, title: item.title, area: item.area, startsAt: item.startsAt })))
  }
  async function refresh() {
    setError('')
    try { await Promise.all([loadPlans(), loadSquads(), loadMeetups()]) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not refresh the community.') }
  }

  useEffect(() => { void refresh() }, [])
  useEffect(() => {
    if (!activeSquad || !signedIn) { setMessages([]); return }
    let alive = true
    const load = async () => {
      try {
        const response = await fetch('/api/squads/' + activeSquad.id + '/messages')
        const result = await response.json()
        if (alive && response.ok) setMessages(result.data?.messages ?? [])
      } catch { /* Keep the last loaded discussion visible during a transient network error. */ }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, 8000)
    return () => { alive = false; window.clearInterval(timer) }
  }, [activeSquad?.id, signedIn])

  const calendar = useMemo(() => [
    ...plans.filter((plan) => plan.myStatus === 'going' || plan.creatorId === currentUserId).map((plan) => ({
      id: 'plan-' + plan.id, title: plan.title, area: plan.area, startsAt: plan.startsAt, kind: 'Going-out plan',
    })),
    ...meetups.map((meetup) => ({ id: 'meetup-' + meetup.id, title: meetup.title, area: meetup.area, startsAt: meetup.startsAt, kind: 'Community meetup' })),
  ].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()), [plans, meetups, currentUserId])

  const createPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!signedIn) { onSignIn(); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/go-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        title: planTitle, description: planDescription || null, area: planArea, venueName: planVenue || null,
        startsAt: new Date(planTime).toISOString(), capacity: Number(planCapacity), visibility: planVisibility,
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not create your plan.')
      setShowPlanForm(false); setPlanTitle(''); setPlanDescription(''); setPlanArea(''); setPlanVenue(''); setPlanTime('')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create your plan.') }
    finally { setBusy(false) }
  }

  const joinPlan = async (plan: Plan) => {
    if (!signedIn) { onSignIn(); return }
    setBusy(true); setError('')
    try {
      const method = plan.myStatus === 'going' ? 'DELETE' : 'POST'
      const response = await fetch('/api/go-out/' + plan.id + '/join', { method })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not update your plan.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update your plan.') }
    finally { setBusy(false) }
  }

  const createSquad = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!signedIn) { onSignIn(); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/squads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        name: squadName, description: squadDescription || null, area: squadArea || null, visibility: squadVisibility,
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not create your squad.')
      setShowSquadForm(false); setSquadName(''); setSquadDescription(''); setSquadArea('')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not create your squad.') }
    finally { setBusy(false) }
  }

  const joinSquad = async (squad: Squad) => {
    if (!signedIn) { onSignIn(); return }
    setBusy(true); setError('')
    try {
      const method = squad.myStatus === 'active' ? 'DELETE' : 'POST'
      const response = await fetch('/api/squads/' + squad.id + '/join', { method })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not update squad membership.')
      await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not update squad membership.') }
    finally { setBusy(false) }
  }

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeSquad || !messageBody.trim()) return
    setBusy(true)
    try {
      const response = await fetch('/api/squads/' + activeSquad.id + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: messageBody }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not send message.')
      setMessageBody('')
      setMessages((current) => [...current, result.data.message])
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not send message.') }
    finally { setBusy(false) }
  }

  const inviteMember = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!activeSquad || !inviteEmail.trim()) return
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/squads/' + activeSquad.id + '/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: inviteEmail }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not invite this member.')
      setInviteEmail('')
      await refresh()
      setError('Invitation created. The member can accept it from their squads list.')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not invite this member.') }
    finally { setBusy(false) }
  }

  const dateLabel = (value: string) => new Date(value).toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

  return <section className="goout-hub">
    <div className="section-heading"><div><div className="eyebrow">MAKE IT HAPPEN</div><h2>Who's going out?</h2><p>Make spontaneous plans, find company and keep your people close.</p></div><button className="filter-button" onClick={() => void refresh()}><RefreshCw size={15} /> Refresh</button></div>
    {error && <div className="goout-alert" role="status">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}
    <div className="goout-tabs"><button className={section === 'plans' ? 'active' : ''} onClick={() => setSection('plans')}>Let's Go Out</button><button className={section === 'squads' ? 'active' : ''} onClick={() => setSection('squads')}>My squads</button><button className={section === 'calendar' ? 'active' : ''} onClick={() => setSection('calendar')}>Social calendar</button></div>

    {section === 'plans' && <>
      <div className="goout-hero"><div><span className="banner-kicker">SPONTANEOUS PLANS. GOOD COMPANY.</span><h2>Don't go out alone.</h2><p>Post a plan, invite the community and find people heading to the same place.</p></div><button className="primary-button" onClick={() => signedIn ? setShowPlanForm((value) => !value) : onSignIn()}><Plus size={16} /> Create a plan</button></div>
      {showPlanForm && <form className="goout-form" onSubmit={createPlan}><label>What's the plan?<input required minLength={4} maxLength={100} value={planTitle} onChange={(event) => setPlanTitle(event.target.value)} placeholder="e.g. Rooftop drinks after work" /></label><label>Details<textarea maxLength={500} rows={2} value={planDescription} onChange={(event) => setPlanDescription(event.target.value)} placeholder="What should people know?" /></label><div className="goout-form-grid"><label>Area<input required value={planArea} onChange={(event) => setPlanArea(event.target.value)} placeholder="Westlands, Nairobi" /></label><label>Venue (optional)<input value={planVenue} onChange={(event) => setPlanVenue(event.target.value)} placeholder="Venue or undecided" /></label><label>Date and time<input required type="datetime-local" value={planTime} onChange={(event) => setPlanTime(event.target.value)} /></label><label>Maximum people<input required type="number" min="2" max="50" value={planCapacity} onChange={(event) => setPlanCapacity(event.target.value)} /></label></div><label>Visibility<select value={planVisibility} onChange={(event) => setPlanVisibility(event.target.value as 'public' | 'private')}><option value="public">Public — discoverable by the community</option><option value="private">Private — only me</option></select></label><button className="primary-button" disabled={busy}>{busy ? 'Publishing…' : 'Publish going-out plan'}</button></form>}
      <div className="goout-card-grid">{plans.map((plan) => <article className="goout-card" key={plan.id}><div className="goout-card-top"><span className="intent-pill">{plan.goingCount} / {plan.capacity} going</span><span className="goout-visibility">{plan.visibility}</span></div><h3>{plan.title}</h3><p>{plan.description || 'A community plan. Join if this sounds like your kind of night.'}</p><div className="goout-meta"><span><MapPin size={14} />{plan.area}</span><span><Clock size={14} />{dateLabel(plan.startsAt)}</span>{plan.venueName && <span><MapPin size={14} />{plan.venueName}</span>}</div><div className="goout-card-footer"><small>Started by {plan.creatorName}</small>{plan.creatorId !== currentUserId && <button className="interest-button" disabled={busy || plan.goingCount >= plan.capacity && plan.myStatus !== 'going'} onClick={() => void joinPlan(plan)}>{plan.myStatus === 'going' ? 'Leave plan' : 'I’m going'}</button>}</div></article>)}</div>
      {plans.length === 0 && <div className="empty-state"><CalendarDays size={25} /><h2>No open plans yet</h2><p>Start the first one and see who wants to join.</p></div>}
    </>}

    {section === 'squads' && <>
      <div className="goout-hero"><div><span className="banner-kicker">YOUR PEOPLE, YOUR COMMUNITY</span><h2>Build your own crew.</h2><p>Create a permanent squad for friends, shared interests and regular outings.</p></div><button className="primary-button" onClick={() => signedIn ? setShowSquadForm((value) => !value) : onSignIn()}><Plus size={16} /> Create a squad</button></div>
      {showSquadForm && <form className="goout-form" onSubmit={createSquad}><label>Squad name<input required minLength={3} maxLength={80} value={squadName} onChange={(event) => setSquadName(event.target.value)} placeholder="Friday Night Crew" /></label><label>Description<textarea rows={2} maxLength={500} value={squadDescription} onChange={(event) => setSquadDescription(event.target.value)} placeholder="What brings your squad together?" /></label><div className="goout-form-grid"><label>Area<input value={squadArea} onChange={(event) => setSquadArea(event.target.value)} placeholder="Nairobi" /></label><label>Privacy<select value={squadVisibility} onChange={(event) => setSquadVisibility(event.target.value as 'public' | 'private')}><option value="public">Public — anyone can join</option><option value="private">Private — invite only</option></select></label></div><button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create squad'}</button></form>}
      <div className="squad-layout"><div className="squad-grid">{squads.map((squad) => <article className={'squad-card ' + (activeSquad?.id === squad.id ? 'selected' : '')} key={squad.id}><button className="squad-card-main" onClick={() => squad.myStatus === 'active' ? setActiveSquad(squad) : undefined}><span className="squad-icon"><Users size={20} /></span><span><b>{squad.name}</b><small>{squad.area || 'Kenya'} · {squad.memberCount} members</small></span></button><p>{squad.description || 'A community for people who enjoy getting together.'}</p><div className="squad-card-footer"><span>{squad.visibility === 'private' ? 'Invite only' : 'Public squad'}</span>{squad.myStatus === 'active' ? <button onClick={() => setActiveSquad(squad)}>Open squad</button> : squad.myStatus === 'invited' ? <button onClick={() => void joinSquad(squad)}>Accept invite</button> : squad.visibility === 'public' ? <button onClick={() => void joinSquad(squad)}>Join squad</button> : <span>Private</span>}</div></article>)}</div>
      {activeSquad && <div className="squad-discussion"><div className="squad-discussion-head"><div><span className="eyebrow">SQUAD DISCUSSION</span><h3>{activeSquad.name}</h3></div><button className="icon-button" onClick={() => setActiveSquad(null)}><X size={16} /></button></div><div className="squad-messages">{messages.map((message) => <div className={'squad-message ' + (message.senderId === currentUserId ? 'mine' : '')} key={message.id}><b>{message.senderName || 'Member'}</b><p>{message.body}</p><small>{new Date(message.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</small></div>)}</div><form className="squad-compose" onSubmit={sendMessage}><input value={messageBody} onChange={(event) => setMessageBody(event.target.value)} maxLength={2000} placeholder="Message your squad…" /><button className="primary-button" disabled={busy || !messageBody.trim()}><MessageCircle size={15} /> Send</button></form>{(activeSquad.myRole === 'owner' || activeSquad.myRole === 'admin') && <form className="squad-invite" onSubmit={inviteMember}><input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Invite by account email" /><button className="filter-button" disabled={busy}>Invite member</button></form>}</div>}</div>
      {squads.length === 0 && <div className="empty-state"><Users size={25} /><h2>Your next crew starts here</h2><p>Create a squad or join a public community.</p></div>}
    </>}

    {section === 'calendar' && <>
      <div className="section-heading"><div><div className="eyebrow">YOUR SOCIAL LIFE</div><h2>Social calendar</h2><p>Upcoming plans you joined and community meetups.</p></div></div>
      <div className="calendar-list">{calendar.map((item) => <article className="calendar-item" key={item.id}><span className="calendar-icon"><CalendarDays size={18} /></span><div><b>{item.title}</b><small>{item.kind} · {item.area}</small></div><time>{dateLabel(item.startsAt)}</time></article>)}</div>
      {calendar.length === 0 && <div className="empty-state"><CalendarDays size={25} /><h2>Your calendar is clear</h2><p>Join a plan or meetup and it will appear here.</p></div>}
    </>}
  </section>
}
