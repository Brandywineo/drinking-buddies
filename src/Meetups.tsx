import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { ArrowRight, CalendarDays, Check, Clock, MapPin, Plus, ShieldCheck, Users, X } from 'lucide-react'

type PendingRequest = { userId: string; displayName: string }
type Meetup = {
  id: string
  title: string
  description: string | null
  coverImageUrl: string | null
  startsAt: string
  endsAt: string | null
  area: string
  capacity: number
  pricingType: 'free' | 'paid'
  priceMinor: number
  currency: string
  visibility: 'public' | 'approval_required'
  hostId: string
  hostName: string
  approvedCount: number
  membershipStatus: 'requested' | 'approved' | 'declined' | 'left' | 'removed' | null
  conversationId: string | null
  pendingRequests: PendingRequest[]
}

type Props = {
  currentUserId: string | null
  signedIn: boolean
  onSignIn: () => void
  onOpenMessages: () => void
}

export function Meetups({ currentUserId, signedIn, onSignIn, onOpenMessages }: Props) {
  const [items, setItems] = useState<Meetup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [formError, setFormError] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [area, setArea] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [capacity, setCapacity] = useState('8')
  const [visibility, setVisibility] = useState<'public' | 'approval_required'>('approval_required')
  const [pricingType, setPricingType] = useState<'free' | 'paid'>('free')
  const [priceKes, setPriceKes] = useState('')
  const [refundBeforeHours, setRefundBeforeHours] = useState('24')
  const [refundPercentage, setRefundPercentage] = useState('100')
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState('')
  const [bookingMeetup, setBookingMeetup] = useState<Meetup | null>(null)
  const [mpesaPhone, setMpesaPhone] = useState('')
  const [pendingBooking, setPendingBooking] = useState<{ meetupId: string; bookingId: string } | null>(null)
  const [paymentState, setPaymentState] = useState<'pending' | 'confirmed' | 'failed' | 'review'>('pending')
  const [paymentMessage, setPaymentMessage] = useState('')
  const [checkingPayment, setCheckingPayment] = useState(false)

  const loadMeetups = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/meetups')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not load meetups.')
      setItems(Array.isArray(result.data?.meetups) ? result.data.meetups : [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load meetups.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadMeetups() }, [loadMeetups])

  useEffect(() => {
    if (!pendingBooking || paymentState !== 'pending') return
    let active = true
    const check = async () => {
      if (!active) return
      setCheckingPayment(true)
      try {
        const response = await fetch('/api/meetups/' + pendingBooking.meetupId + '/bookings/' + pendingBooking.bookingId)
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message ?? 'Could not check payment status.')
        if (!active) return
        if (result.data?.payment?.status === 'succeeded' && result.data?.payment?.metadata?.latePaymentReview === true) {
          setPaymentState('review')
          setPaymentMessage('Safaricom confirmed your payment after the ticket reservation expired. Do not pay again; our team needs to review the transaction.')
        } else if (result.data?.booking?.status === 'confirmed') {
          setPaymentState('confirmed')
          setPaymentMessage('Payment confirmed. Your place is secured!')
          void loadMeetups()
        } else if (result.data?.payment?.status === 'failed' || result.data?.booking?.status === 'expired') {
          setPaymentState('failed')
          setPaymentMessage(result.data?.booking?.status === 'expired' ? 'This ticket reservation expired.' : 'M-Pesa did not complete this payment. You can try again.')
        }
      } catch (cause) {
        if (active) setPaymentMessage(cause instanceof Error ? cause.message : 'Payment is still being checked.')
      } finally {
        if (active) setCheckingPayment(false)
      }
    }
    void check()
    const timer = window.setInterval(() => { void check() }, 5000)
    return () => { active = false; window.clearInterval(timer) }
  }, [pendingBooking, paymentState, loadMeetups])

  const createMeetup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!signedIn) { onSignIn(); return }
    setFormError('')
    setBusyId('create')
    try {
      let coverImageUrl: string | null = null
      if (coverFile) {
        const upload = new FormData()
        upload.append('file', coverFile)
        const uploadResponse = await fetch('/api/meetups/cover', { method: 'POST', body: upload })
        const uploadResult = await uploadResponse.json()
        if (!uploadResponse.ok) throw new Error(uploadResult.error?.message ?? 'Could not upload meetup cover.')
        coverImageUrl = uploadResult.data.url as string
      }
      const response = await fetch('/api/meetups', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description: description || null, coverImageUrl, area,
          startsAt: new Date(startsAt).toISOString(),
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          capacity: Number(capacity), visibility, pricingType,
          priceMinor: pricingType === 'paid' ? Math.round(Number(priceKes) * 100) : 0,
          currency: 'KES',
          refundPolicy: { kind: 'host_policy', refundBeforeHours: Number(refundBeforeHours), refundPercentage: Number(refundPercentage) },
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not create meetup.')
      setShowForm(false)
      setTitle(''); setDescription(''); setArea(''); setStartsAt(''); setEndsAt(''); setCapacity('8')
      setCoverFile(null); setCoverPreview('')
      await loadMeetups()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not create meetup.')
    } finally {
      setBusyId('')
    }
  }

  const joinMeetup = async (meetup: Meetup) => {
    if (!signedIn) { onSignIn(); return }
    setBusyId(meetup.id)
    try {
      const response = await fetch(`/api/meetups/${meetup.id}/join`, { method: 'POST' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not join meetup.')
      await loadMeetups()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not join meetup.')
    } finally { setBusyId('') }
  }

  const startPaidBooking = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!bookingMeetup) return
    setBusyId(bookingMeetup.id)
    setFormError('')
    try {
      const response = await fetch('/api/meetups/' + bookingMeetup.id + '/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity: 1, phone: mpesaPhone, idempotencyKey: crypto.randomUUID() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not start M-Pesa payment.')
      setPendingBooking({ meetupId: bookingMeetup.id, bookingId: result.data.booking.id })
      setPaymentState('pending')
      setPaymentMessage(result.data.message ?? 'Check your phone for the M-Pesa prompt.')
      setBookingMeetup(null)
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Could not start M-Pesa payment.')
    } finally {
      setBusyId('')
    }
  }

  const closePaymentStatus = () => {
    setPendingBooking(null)
    setPaymentState('pending')
    setPaymentMessage('')
    setMpesaPhone('')
    void loadMeetups()
  }

  const leaveMeetup = async (meetup: Meetup) => {
    setBusyId(meetup.id)
    try {
      const response = await fetch(`/api/meetups/${meetup.id}/join`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not leave meetup.')
      await loadMeetups()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not leave meetup.')
    } finally { setBusyId('') }
  }

  const reviewRequest = async (meetup: Meetup, userId: string, status: 'approved' | 'declined') => {
    setBusyId(userId)
    try {
      const response = await fetch(`/api/meetups/${meetup.id}/members/${userId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not update join request.')
      await loadMeetups()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update join request.')
    } finally { setBusyId('') }
  }

  return <section className="live-meetups">
    <div className="section-heading">
      <div><div className="eyebrow">MAKE A PLAN</div><h2>Meetups around you</h2><p>Create a real plan, manage who joins, and meet in a public place.</p></div>
      <button className="primary-button" onClick={() => signedIn ? setShowForm(true) : onSignIn()}><Plus size={17} /> Create meetup</button>
    </div>
    {error && <div className="meetup-alert" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={14} /></button></div>}
    {loading ? <div className="empty-state"><b>Loading community meetups…</b></div> : items.length === 0 ? <div className="empty-state"><CalendarDays size={28} /><h2>No upcoming meetups yet</h2><p>Start the first one. Choose a public meeting area and invite the community.</p><button className="primary-button" onClick={() => signedIn ? setShowForm(true) : onSignIn()}><Plus size={16} /> Create the first meetup</button></div> : <div className="meetup-grid">
      {items.map((meetup) => {
        const isHost = meetup.hostId === currentUserId
        const full = meetup.approvedCount >= meetup.capacity
        const date = new Date(meetup.startsAt)
        return <article className="meetup-card live-meetup-card" key={meetup.id}>
          <div className="meetup-image live-meetup-image">
            {meetup.coverImageUrl && <img src={meetup.coverImageUrl} alt={meetup.title + ' cover'} loading="lazy" />}
            <span className="meetup-area"><MapPin size={13} /> {meetup.area}</span><span className="meetup-privacy">{meetup.visibility === 'public' ? 'Open join' : 'Approval required'}</span>
          </div>
          <div className="meetup-content">
            <span className="eyebrow">COMMUNITY MEETUP · HOSTED BY {meetup.hostName.toUpperCase()}</span>
            <h3>{meetup.title}</h3>
            <p>{meetup.description || 'A community meetup. Message the group after your place is confirmed.'}</p>
            <div className="meetup-meta">{meetup.pricingType === 'paid' && <span><strong>KES {(meetup.priceMinor / 100).toLocaleString()}</strong> per person</span>}<span><CalendarDays size={14} /> {date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span><span><Clock size={14} /> {date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</span></div>
            <div className="meetup-footer"><span><Users size={14} /> {meetup.approvedCount}/{meetup.capacity} joined</span>
              {isHost ? <span className="meetup-status">You host this</span> :
                meetup.membershipStatus === 'approved' ? <span className="meetup-action-group"><span className="meetup-status"><Check size={13} /> Joined</span><button onClick={() => leaveMeetup(meetup)} disabled={busyId === meetup.id}>Leave</button></span> :
                meetup.membershipStatus === 'requested' ? <span className="meetup-status">Request pending</span> :
                <button onClick={() => meetup.pricingType === 'paid' ? (signedIn ? setBookingMeetup(meetup) : onSignIn()) : joinMeetup(meetup)} disabled={busyId === meetup.id || full}>{busyId === meetup.id ? 'Please wait…' : full ? 'Full' : meetup.pricingType === 'paid' ? 'Book with M-Pesa' : meetup.visibility === 'public' ? 'Join meetup' : 'Request to join'} <ArrowRight size={14} /></button>}
            </div>
            {isHost && meetup.pendingRequests.length > 0 && <div className="meetup-requests"><b>Join requests ({meetup.pendingRequests.length})</b>{meetup.pendingRequests.map((request) => <div className="meetup-request" key={request.userId}><span>{request.displayName}</span><div><button disabled={busyId === request.userId} onClick={() => reviewRequest(meetup, request.userId, 'approved')}>Approve</button><button className="decline" disabled={busyId === request.userId} onClick={() => reviewRequest(meetup, request.userId, 'declined')}>Decline</button></div></div>)}</div>}
            {meetup.conversationId && <button className="meetup-chat-link" onClick={onOpenMessages}>Open group chat <ArrowRight size={14} /></button>}
          </div>
        </article>
      })}
    </div>}
    {showForm && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowForm(false) }}><div className="modal">
      <div className="modal-head"><div><span className="eyebrow">BRING PEOPLE TOGETHER</span><h2>Create a meetup</h2></div><button className="icon-button" onClick={() => setShowForm(false)} aria-label="Close"><X size={19} /></button></div>
      <form onSubmit={createMeetup}>
        <label>Meetup name<input required minLength={4} maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday after-work unwind" /></label>
        <label>Area or public meeting place<input required minLength={2} maxLength={160} value={area} onChange={(e) => setArea(e.target.value)} placeholder="e.g. Westlands, Nairobi" /></label>
        <div className="form-row"><label>Starts<input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label><label>Ends (optional)<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label></div>
        <div className="form-row"><label>Maximum people<input type="number" min="2" max="100" required value={capacity} onChange={(e) => setCapacity(e.target.value)} /></label><label>Joining<select value={visibility} disabled={pricingType === 'paid'} onChange={(e) => setVisibility(e.target.value as typeof visibility)}><option value="approval_required">Host approval</option><option value="public">Open joining</option></select></label></div>
        <label>Meetup type<select value={pricingType} onChange={(e) => { const value = e.target.value as typeof pricingType; setPricingType(value); if (value === 'paid') setVisibility('public') }}><option value="free">Free meetup</option><option value="paid">Paid meetup / tickets</option></select></label>
        {pricingType === 'paid' && <><label>Ticket price (KES)<input type="number" min="1" max="1000000" step="1" required value={priceKes} onChange={(e) => setPriceKes(e.target.value)} placeholder="e.g. 1500" /></label><div className="form-row"><label>Refund until (hours before)<input type="number" min="0" max="720" required value={refundBeforeHours} onChange={(e) => setRefundBeforeHours(e.target.value)} /></label><label>Refund percentage<input type="number" min="0" max="100" required value={refundPercentage} onChange={(e) => setRefundPercentage(e.target.value)} /></label></div><p className="form-note">Paid meetup publishing starts with your premium host free trial. Payments will only be enabled after provider approval and testing.</p></>}
        <label>Cover photo (optional)<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.target.files?.[0] ?? null
          setCoverFile(file)
          setCoverPreview(file ? URL.createObjectURL(file) : '')
        }} /></label>
        {coverPreview && <img src={coverPreview} alt="Meetup cover preview" className="meetup-cover-preview" />}
        <label>What's the plan?<textarea rows={3} maxLength={1200} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell people what kind of meetup you're planning…" /></label>
        {formError && <p className="meetup-form-error" role="alert">{formError}</p>}
        <button className="primary-button modal-submit" type="submit" disabled={busyId === 'create'}>{busyId === 'create' ? 'Creating…' : 'Publish meetup'}</button>
        <p className="form-note"><ShieldCheck size={14} /> Share a public meeting area, not a private home address. Hosts are responsible for reviewing requests and keeping plans welcoming.</p>
      </form>
    </div></div>}
    {bookingMeetup && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setBookingMeetup(null) }}><div className="modal">
      <div className="modal-head"><div><span className="eyebrow">SECURE YOUR PLACE</span><h2>Pay with M-Pesa</h2></div><button className="icon-button" onClick={() => setBookingMeetup(null)} aria-label="Close"><X size={19} /></button></div>
      <p className="form-note">{bookingMeetup.title} · KES {(bookingMeetup.priceMinor / 100).toLocaleString()} for one ticket.</p>
      <form onSubmit={startPaidBooking}>
        <label>M-Pesa phone number<input required inputMode="tel" autoComplete="tel" value={mpesaPhone} onChange={(event) => setMpesaPhone(event.target.value)} placeholder="0712 345 678" /></label>
        {formError && <p className="meetup-form-error" role="alert">{formError}</p>}
        <button className="primary-button modal-submit" type="submit" disabled={busyId === bookingMeetup.id}>{busyId === bookingMeetup.id ? 'Requesting payment…' : 'Send STK Push'}</button>
        <p className="form-note">You'll receive a prompt on your phone. Your place is confirmed only after Safaricom verifies the payment.</p>
      </form>
    </div></div>}
    {pendingBooking && <div className="modal-backdrop"><div className="modal">
      <div className="modal-head"><div><span className="eyebrow">M-PESA CHECKOUT</span><h2>{paymentState === 'confirmed' ? 'You’re in!' : paymentState === 'failed' ? 'Payment not completed' : paymentState === 'review' ? 'Payment needs review' : 'Waiting for payment'}</h2></div></div>
      <p className="form-note">{paymentMessage || 'Check your phone and enter your M-Pesa PIN to complete payment.'}</p>
      {paymentState === 'pending' && <p className="form-note">{checkingPayment ? 'Checking with the server…' : 'We are waiting for Safaricom’s confirmation.'}</p>}
      <button className="primary-button modal-submit" onClick={closePaymentStatus}>{paymentState === 'pending' ? 'Close — check later' : 'Done'}</button>
    </div></div>}
  </section>
}
