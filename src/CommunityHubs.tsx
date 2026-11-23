import { useEffect, useState, type FormEvent } from 'react'
import { Camera, MapPin, Plus, Upload, X } from 'lucide-react'

type Venue = { id: string; name: string; description: string | null; category: string; address: string; area: string; city: string; websiteUrl: string | null }
type Album = { id: string; title: string; description: string | null; visibility: string; mediaCount: number; creatorName: string | null }
type Media = { id: string; mediaKind: string; caption: string | null; url: string; uploaderName: string | null }

function Notice({ value }: { value: string }) { return value ? <p className="hub-notice" role="status">{value}</p> : null }

export function VenueHub({ signedIn }: { signedIn: boolean }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Venue | null>(null)
  const [notice, setNotice] = useState('')
  const [showApply, setShowApply] = useState(false)
  const [form, setForm] = useState({ name:'', description:'', category:'Bar', address:'', area:'', city:'Nairobi', websiteUrl:'', contactEmail:'' })
  const [dealForm, setDealForm] = useState({ title:'', description:'', dealType:'general', discountLabel:'', startsAt:'', endsAt:'' })
  const [dealNotice, setDealNotice] = useState('')
  const [deals, setDeals] = useState<{id:string;title:string;description:string;discountLabel:string|null}[]>([])
  const [photos, setPhotos] = useState<{id:string;url:string;caption:string|null}[]>([])
  async function load() {
    const response = await fetch('/api/venues' + (query ? '?q=' + encodeURIComponent(query) : ''))
    const result = await response.json()
    if (response.ok) setVenues(result.data?.venues ?? [])
  }
  useEffect(() => { void load() }, [])
  async function submitVenue(event: FormEvent) {
    event.preventDefault(); setNotice('')
    const response = await fetch('/api/venues', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
    const result = await response.json()
    setNotice(response.ok ? 'Venue submitted. It will appear after admin approval.' : result.error?.message ?? 'Could not submit venue.')
    if (response.ok) setShowApply(false)
  }
  async function openVenue(venue: Venue) {
    setSelected(venue); setDealNotice('')
    const response = await fetch('/api/venues/' + venue.id)
    const result = await response.json()
    if (response.ok) { setDeals(result.data?.deals ?? []); setPhotos(result.data?.photos ?? []) }
  }
  async function claimDeal(dealId:string) { const response=await fetch('/api/venue-deals/'+dealId+'/claim',{method:'POST'}); const result=await response.json(); setDealNotice(response.ok ? 'Deal claimed. Your code: '+result.data.claim.claimCode : result.error?.message ?? 'Could not claim deal.') }
  async function createDeal(event: FormEvent) {
    event.preventDefault(); if (!selected) return
    const response = await fetch('/api/venues/' + selected.id + '/deals', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...dealForm, startsAt:new Date(dealForm.startsAt).toISOString(), endsAt:new Date(dealForm.endsAt).toISOString() }) })
    const result = await response.json()
    setDealNotice(response.ok ? 'Deal published.' : result.error?.message ?? 'Could not publish deal.')
    if (response.ok) { setDealForm({title:'',description:'',dealType:'general',discountLabel:'',startsAt:'',endsAt:''}); void openVenue(selected) }
  }
  return <section className="community-hub">
    <div className="section-heading"><div><div className="eyebrow">EXPLORE YOUR CITY</div><h2>Places worth knowing</h2><p>Discover approved Kenyan venues and current offers.</p></div><button className="filter-button" onClick={() => setShowApply(v=>!v)}><Plus size={16}/> List your venue</button></div>
    <Notice value={notice}/>
    {showApply && <form className="hub-form" onSubmit={submitVenue}><h3>Register your venue</h3><div className="form-row"><label>Venue name<input required maxLength={140} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Category<input required maxLength={60} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label></div><label>Description<textarea maxLength={1200} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Street address<input required value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><div className="form-row"><label>Area<input required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label><label>City<input required value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label></div><div className="form-row"><label>Website<input type="url" value={form.websiteUrl} onChange={e=>setForm({...form,websiteUrl:e.target.value})}/></label><label>Contact email<input type="email" value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})}/></label></div><button className="primary-button" disabled={!signedIn}>Submit for approval</button>{!signedIn && <small>Sign in to register a venue.</small>}</form>}
    <div className="hub-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search venues, categories or areas"/><button className="filter-button" onClick={()=>void load()}>Search</button></div>
    {venues.length ? <div className="venue-grid">{venues.map(v=><article className="venue-card" key={v.id}><div className="venue-image venue-image-empty"><MapPin size={26}/></div><div className="venue-content"><span>{v.category}</span><h3>{v.name}</h3><p><MapPin size={14}/> {v.area}, {v.city}</p><button onClick={()=>void openVenue(v)}>Explore venue →</button></div></article>)}</div> : <div className="empty-state"><MapPin size={26}/><h3>No approved venues found yet</h3><p>Be among the first local businesses to join Drinking Buddies.</p></div>}
    {selected && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="modal"><div className="modal-head"><div><span className="eyebrow">{selected.category}</span><h2>{selected.name}</h2><p>{selected.address}, {selected.area}, {selected.city}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={18}/></button></div><p>{selected.description}</p>{photos.length>0&&<div className="memory-media-grid">{photos.map(photo=><div className="memory-media-card" key={photo.id}><img src={photo.url} alt={photo.caption??selected.name}/></div>)}</div>}<h3>Current offers</h3>{deals.map(d=><div className="hub-deal" key={d.id}><b>{d.title}</b><p>{d.description}</p>{d.discountLabel}{signedIn&&<button className="filter-button" onClick={()=>void claimDeal(d.id)}>Claim offer</button>}</div>)}<Notice value={dealNotice}/>{!deals.length && <p>No active offers at the moment.</p>}{signedIn && <form className="hub-form" onSubmit={createDeal}><h3>Venue team: publish an offer</h3><label>Offer title<input required value={dealForm.title} onChange={e=>setDealForm({...dealForm,title:e.target.value})}/></label><label>Description<textarea required value={dealForm.description} onChange={e=>setDealForm({...dealForm,description:e.target.value})}/></label><div className="form-row"><label>Type<select value={dealForm.dealType} onChange={e=>setDealForm({...dealForm,dealType:e.target.value})}><option value="general">General offer</option><option value="happy_hour">Happy hour</option><option value="group">Group offer</option><option value="birthday">Birthday</option><option value="vip">VIP</option></select></label><label>Discount label<input value={dealForm.discountLabel} onChange={e=>setDealForm({...dealForm,discountLabel:e.target.value})}/></label></div><div className="form-row"><label>Starts<input type="datetime-local" required value={dealForm.startsAt} onChange={e=>setDealForm({...dealForm,startsAt:e.target.value})}/></label><label>Ends<input type="datetime-local" required value={dealForm.endsAt} onChange={e=>setDealForm({...dealForm,endsAt:e.target.value})}/></label></div><Notice value={dealNotice}/><button className="primary-button">Publish offer</button></form>}</div></div>}
  </section>
}

export function MemoriesHub({ signedIn }: { signedIn: boolean }) {
  const [albums,setAlbums] = useState<Album[]>([])
  const [pendingTags,setPendingTags] = useState<{id:string;mediaId:string;createdAt:string}[]>([])
  const [active,setActive] = useState<Album|null>(null)
  const [media,setMedia] = useState<Media[]>([])
  const [notice,setNotice] = useState('')
  const [form,setForm] = useState({title:'',description:'',visibility:'private',meetupId:'',squadId:''})
  const [file,setFile] = useState<File|null>(null)
  const [caption,setCaption] = useState('')
  async function load() { const r=await fetch('/api/memories'); const j=await r.json(); if(r.ok){setAlbums(j.data?.albums??[]);setPendingTags(j.data?.pendingTags??[])} else setNotice(j.error?.message??'Sign in to view memories.') }
  useEffect(()=>{if(signedIn)void load()},[signedIn])
  async function createAlbum(event:FormEvent){event.preventDefault();const r=await fetch('/api/memories',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,meetupId:form.meetupId||null,squadId:form.squadId||null})});const j=await r.json();setNotice(r.ok?'Album created.':j.error?.message??'Could not create album.');if(r.ok){setForm({title:'',description:'',visibility:'private',meetupId:'',squadId:''});void load()}}
  async function decideTag(id:string,decision:'accept'|'decline'){const r=await fetch('/api/memories/tags/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision})});const j=await r.json();setNotice(r.ok?'Tag request '+decision+'ed.':j.error?.message??'Could not update tag.');if(r.ok)void load()}
  async function openAlbum(album:Album){setActive(album);const r=await fetch('/api/memories/'+album.id);const j=await r.json();if(r.ok)setMedia(j.data?.media??[]);else setNotice(j.error?.message??'Could not load album.')}
  async function upload(event:FormEvent){event.preventDefault();if(!active||!file)return;const body=new FormData();body.set('file',file);body.set('caption',caption);const r=await fetch('/api/memories/'+active.id+'/media',{method:'POST',body});const j=await r.json();setNotice(r.ok?'Memory uploaded.':j.error?.message??'Upload failed.');if(r.ok){setFile(null);setCaption('');void openAlbum(active)}}
  return <section className="community-hub"><div className="section-heading"><div><div className="eyebrow">PARTY MEMORIES</div><h2>Keep the good nights</h2><p>Shared albums for meetups, squads and your favourite moments.</p></div><Camera size={24}/></div>
    <Notice value={notice}/>{!signedIn?<div className="empty-state"><h3>Sign in to create and share memories.</h3></div>:<><form className="hub-form" onSubmit={createAlbum}><h3>Create an album</h3><div className="form-row"><label>Album title<input required minLength={3} maxLength={100} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label><label>Who can see it?<select value={form.visibility} onChange={e=>setForm({...form,visibility:e.target.value})}><option value="members">Members</option><option value="private">Only me</option><option value="public">Public</option></select></label></div><label>Description<textarea maxLength={500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><div className="form-row"><label>Meetup ID (optional)<input value={form.meetupId} onChange={e=>setForm({...form,meetupId:e.target.value,squadId:''})} placeholder="Link an approved meetup"/></label><label>Squad ID (optional)<input value={form.squadId} onChange={e=>setForm({...form,squadId:e.target.value,meetupId:''})} placeholder="Link a squad"/></label></div><button className="primary-button">Create album</button></form>{pendingTags.length>0&&<div className="hub-form"><h3>Tag requests waiting for you</h3>{pendingTags.map(tag=><div className="hub-deal" key={tag.id}><p>Someone requested to tag you in a memory.</p><button className="filter-button" onClick={()=>void decideTag(tag.id,'accept')}>Accept</button> <button className="filter-button" onClick={()=>void decideTag(tag.id,'decline')}>Decline</button></div>)}</div>}<div className="memory-album-grid">{albums.map(a=><button className="memory-album-card" key={a.id} onClick={()=>void openAlbum(a)}><Camera size={22}/><b>{a.title}</b><small>{a.mediaCount} memories · {a.visibility}</small></button>)}</div>{!albums.length&&<div className="empty-state"><p>Your albums will appear here.</p></div>}</>}
    {active&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setActive(null)}}><div className="modal"><div className="modal-head"><div><span className="eyebrow">PARTY MEMORIES</span><h2>{active.title}</h2></div><button className="icon-button" onClick={()=>setActive(null)}><X size={18}/></button></div><form className="hub-form" onSubmit={upload}><label>Add a photo or MP4 video<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={e=>setFile(e.target.files?.[0]??null)} required/></label><label>Caption<input value={caption} maxLength={500} onChange={e=>setCaption(e.target.value)}/></label><button className="primary-button" disabled={!file}><Upload size={16}/> Upload memory</button></form><div className="memory-media-grid">{media.map(m=><div key={m.id} className="memory-media-card">{m.mediaKind==='video'?<video src={m.url} controls/>:<img src={m.url} alt={m.caption??'Shared party memory'}/>}<small>{m.caption}</small></div>)}</div></div></div>}
  </section>
}
