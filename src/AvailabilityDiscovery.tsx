import { useEffect, useState, type FormEvent } from 'react'
import { Camera, Clock, MapPin, Plus, RefreshCw, Video } from 'lucide-react'

type Appearance = {
  id: string
  creatorId: string
  creatorName: string
  venueName: string | null
  area: string | null
  startsAt: string
  endsAt: string
  drinks: string[]
  drinkQuantity: string | null
  intention: string
  note: string | null
  availabilityMode: 'planned' | 'available' | 'open_to_company'
  mediaKind: 'image' | 'video'
  mediaUrl: string
}

type Props = { signedIn: boolean; onSignIn: () => void }

const localDateTime = (date: Date) => {
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}
const modeLabel = (mode: Appearance['availabilityMode']) => mode === 'open_to_company' ? 'Open to company now' : mode === 'available' ? 'Available to go out' : 'Going out'

export function AvailabilityDiscovery({ signedIn, onSignIn }: Props) {
  const [items, setItems] = useState<Appearance[]>([])
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showComposer, setShowComposer] = useState(false)
  const [error, setError] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [venue, setVenue] = useState('')
  const [area, setArea] = useState('')
  const [mode, setMode] = useState<Appearance['availabilityMode']>('open_to_company')
  const [note, setNote] = useState('')
  const [drinks, setDrinks] = useState<string[]>([])
  const [startsAt, setStartsAt] = useState(() => localDateTime(new Date()))
  const [endsAt, setEndsAt] = useState(() => localDateTime(new Date(Date.now() + 3 * 60 * 60 * 1000)))

  const load = async () => {
    setError('')
    try {
      const response = await fetch('/api/discovery')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not load availability.')
      setItems(result.data?.appearances ?? [])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load availability.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const chooseFile = (next: File | undefined) => {
    if (!next) return
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(next.type)
    const isVideo = ['video/mp4', 'video/quicktime'].includes(next.type)
    if (!isImage && !isVideo) { setError('Choose a JPG, PNG, WebP photo or MP4/MOV video.'); return }
    if (next.size > (isVideo ? 30 : 10) * 1024 * 1024) { setError(isVideo ? 'Videos must be 30 MB or smaller.' : 'Photos must be 10 MB or smaller.'); return }
    if (preview) URL.revokeObjectURL(preview)
    setFile(next)
    setPreview(URL.createObjectURL(next))
    setError('')
  }

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!signedIn) { onSignIn(); return }
    if (!file) { setError('Add a photo or video of what you are doing.'); return }
    if (new Date(endsAt) <= new Date(startsAt)) { setError('End time must be after start time.'); return }
    setBusy(true); setError('')
    try {
      const body = new FormData()
      body.set('photo', file)
      body.set('venueName', venue)
      body.set('area', area)
      body.set('startsAt', new Date(startsAt).toISOString())
      body.set('endsAt', new Date(endsAt).toISOString())
      body.set('drinks', JSON.stringify(drinks))
      body.set('intention', 'company')
      body.set('availabilityMode', mode)
      body.set('note', note)
      const response = await fetch('/api/going-out', { method: 'POST', body })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not publish your availability.')
      setShowComposer(false); setFile(null); setPreview(null); setVenue(''); setArea(''); setNote(''); setDrinks([])
      setStartsAt(localDateTime(new Date()))
      setEndsAt(localDateTime(new Date(Date.now() + 3 * 60 * 60 * 1000)))
      await load()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not publish your availability.') }
    finally { setBusy(false) }
  }

  const dateLabel = (value: string) => new Date(value).toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Nairobi' })
  const drinkOptions = ['Beer', 'KC', 'Mzinga', 'Muratina', 'Whisky', 'Cocktails', 'Wine', 'Non-alcoholic']

  return <section className="availability-discovery">
    <div className="section-heading availability-heading">
      <div><div className="eyebrow"><span className="live-dot" /> LIVE AROUND YOU</div><h2>Who's out right now?</h2><p>Discover what people are doing — the moment, the venue and the vibe.</p></div>
      <div className="availability-heading-actions"><button className="filter-button" onClick={() => void load()}><RefreshCw size={14}/> Refresh</button><button className="primary-button" onClick={() => signedIn ? setShowComposer((value) => !value) : onSignIn()}><Plus size={15}/> Share what I'm doing</button></div>
    </div>

    {showComposer && <form className="availability-composer" onSubmit={publish}>
      <div className="availability-composer-title"><div><b>Post your availability</b><small>Show people where you are and what the vibe is. Your post expires at the end time.</small></div><button type="button" className="filter-button" onClick={() => setShowComposer(false)}>Close</button></div>
      <div className="availability-media-picker">
        <div className="availability-media-preview">{preview ? (file?.type.startsWith('video/') ? <video src={preview} controls playsInline /> : <img src={preview} alt="Your availability preview" />) : <div><Camera size={25}/><b>Add a moment</b><small>Photo or short MP4 video</small></div>}</div>
        <div className="availability-media-actions">
          <label className="photo-upload-button"><Camera size={14}/> Take photo<input type="file" accept="image/*" capture="environment" onChange={(event) => { chooseFile(event.target.files?.[0]); event.currentTarget.value = '' }}/></label>
          <label className="photo-camera-button"><Video size={14}/> Record video<input type="file" accept="video/mp4,video/quicktime" capture="environment" onChange={(event) => { chooseFile(event.target.files?.[0]); event.currentTarget.value = '' }}/></label>
          <label className="photo-upload-button">Choose from gallery<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" onChange={(event) => { chooseFile(event.target.files?.[0]); event.currentTarget.value = '' }}/></label>
          <small>Photos up to 10 MB · MP4 videos up to 30 MB</small>
        </div>
      </div>
      <div className="availability-fields">
        <label>What's happening?<select value={mode} onChange={(event) => setMode(event.target.value as Appearance['availabilityMode'])}><option value="open_to_company">I'm here — open to company</option><option value="available">I'm available to go out</option><option value="planned">I'm heading out later</option></select></label>
        <label>Venue (optional)<input value={venue} onChange={(event) => setVenue(event.target.value)} maxLength={160} placeholder="e.g. K1, Alchemist, a local spot" /></label>
        <label>Area<input value={area} onChange={(event) => setArea(event.target.value)} maxLength={120} placeholder="e.g. Westlands, Kilimani" /></label>
        <label>Start<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)}/></label>
        <label>End / expiry<input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)}/></label>
        <label className="availability-note-field">Caption<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={2} placeholder="Having a few beers. Anyone around?" /></label>
      </div>
      <div className="availability-drinks"><b>What's on the table?</b><div>{drinkOptions.map((drink) => <label key={drink}><input type="checkbox" checked={drinks.includes(drink)} onChange={(event) => setDrinks((current) => event.target.checked ? [...current, drink] : current.filter((value) => value !== drink))}/>{drink}</label>)}</div></div>
      {error && <p className="availability-error" role="alert">{error}</p>}
      <button className="primary-button availability-publish" disabled={busy}>{busy ? 'Publishing…' : 'Publish availability'}</button>
    </form>}

    {error && !showComposer && <div className="goout-alert" role="alert">{error}</div>}
    {loading ? <div className="empty-state"><b>Finding live availability…</b></div> : items.length === 0 ? <div className="availability-empty"><Camera size={25}/><b>No live availability posts yet</b><span>Be the first to share a photo or video of where you're at.</span><button className="primary-button" onClick={() => signedIn ? setShowComposer(true) : onSignIn()}>Share your moment</button></div> : <div className="availability-grid">{items.map((item) => <article className="availability-card" key={item.id}>
      <div className="availability-card-media">{item.mediaKind === 'video' ? <video src={item.mediaUrl} controls playsInline preload="metadata" /> : <img src={item.mediaUrl} alt={item.note || 'Live availability'} loading="lazy"/>}<span className="availability-live-pill"><i/>{modeLabel(item.availabilityMode)}</span></div>
      <div className="availability-card-body"><div className="availability-card-author"><b>{item.creatorName}</b><small>Expires {dateLabel(item.endsAt)}</small></div>
        <h3>{item.note || (item.venueName ? 'At ' + item.venueName : 'Out and about')}</h3>
        <div className="availability-card-meta">{(item.venueName || item.area) && <span><MapPin size={13}/>{[item.venueName, item.area].filter(Boolean).join(' · ')}</span>}<span><Clock size={13}/>{dateLabel(item.startsAt)}</span></div>
        {item.drinks.length > 0 && <div className="interest-tags">{item.drinks.map((drink) => <span key={drink}>{drink}</span>)}</div>}
      </div>
    </article>)}</div>}
  </section>
}
