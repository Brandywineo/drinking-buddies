import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, Bookmark, Camera, Heart, MapPin, Plus, Share2, Users, Upload, X } from 'lucide-react'

type Venue = { id: string; name: string; description: string | null; category: string; address: string; area: string; city: string; websiteUrl: string | null; coverPhotoUrl?: string | null }
type OwnedVenue = { id:string; name:string; approvalStatus:string; isPublished:boolean; area:string; city:string; createdAt:string }
type Album = { id: string; title: string; description: string | null; visibility: string; mediaCount: number; creatorName: string | null; coverUrl?: string | null }
type Media = { id: string; mediaKind: string; caption: string | null; url: string; uploaderName: string | null; moderationStatus?: string }
type PendingUpload = { id: string; file: File; previewUrl: string; progress: number; status: 'queued' | 'uploading' | 'uploaded' | 'failed'; error?: string }

function Notice({ value }: { value: string }) { return value ? <p className="hub-notice" role="status">{value}</p> : null }

export function VenueHub({ signedIn }: { signedIn: boolean }) {
  const [venues, setVenues] = useState<Venue[]>([])
  const [ownedVenues, setOwnedVenues] = useState<OwnedVenue[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Venue | null>(null)
  const [notice, setNotice] = useState('')
  const [showApply, setShowApply] = useState(false)
  const [applicationPhotos, setApplicationPhotos] = useState<File[]>([])
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
  useEffect(() => { void load(); if (signedIn) void loadOwned() }, [signedIn])
  async function loadOwned() { const response=await fetch('/api/venues/mine',{credentials:'include'}); const result=await response.json(); if(response.ok)setOwnedVenues(result.data?.venues??[]) }
  async function uploadVenuePhotos(venueId:string, files:FileList|null) { if(!files?.length)return; let failed=0; for(const file of Array.from(files).slice(0,12)){const body=new FormData();body.set('file',file);const response=await fetch('/api/venues/'+venueId+'/photos',{method:'POST',body});if(!response.ok)failed++} setNotice(failed?'Some photos could not be submitted. Please retry those files.':'Photos submitted for moderation. They appear publicly after approval.'); }
  async function submitVenue(event: FormEvent) {
    event.preventDefault(); setNotice('')
    const response = await fetch('/api/venues', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(form) })
    const result = await response.json()
    if (!response.ok) { setNotice(result.error?.message ?? 'Could not submit venue.'); return }
    const venueId = result.data?.venue?.id as string | undefined
    let failedPhotos = 0
    if (venueId) {
      for (const file of applicationPhotos) {
        const body = new FormData(); body.set('file', file)
        const upload = await fetch('/api/venues/' + venueId + '/photos', { method:'POST', body })
        if (!upload.ok) failedPhotos += 1
      }
    }
    setNotice(failedPhotos ? 'Venue submitted for review. ' + failedPhotos + ' photo(s) could not be uploaded; add them again from your venue dashboard.' : 'Venue and photos submitted. Your listing and photos will be published after approval.')
    setApplicationPhotos([])
    setShowApply(false)
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
    {showApply && <form className="hub-form" onSubmit={submitVenue}><h3>Register your venue</h3><div className="form-row"><label>Venue name<input required maxLength={140} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Category<input required maxLength={60} value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label></div><label>Description<textarea maxLength={1200} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>Street address<input required value={form.address} onChange={e=>setForm({...form,address:e.target.value})}/></label><div className="form-row"><label>Area<input required value={form.area} onChange={e=>setForm({...form,area:e.target.value})}/></label><label>City<input required value={form.city} onChange={e=>setForm({...form,city:e.target.value})}/></label></div><div className="form-row"><label>Website<input type="url" value={form.websiteUrl} onChange={e=>setForm({...form,websiteUrl:e.target.value})}/></label><label>Contact email<input type="email" value={form.contactEmail} onChange={e=>setForm({...form,contactEmail:e.target.value})}/></label></div><label>Venue photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>setApplicationPhotos(Array.from(e.target.files??[]).slice(0,12))}/><small>{applicationPhotos.length} photo(s) selected · JPG, PNG or WebP · up to 12 photos</small></label><button className="primary-button" disabled={!signedIn}>Submit venue and photos for approval</button>{!signedIn && <small>Sign in to register a venue.</small>}</form>}
    {signedIn && ownedVenues.length>0 && <section className="hub-form"><h3>Your venue listings</h3><p>Track review status and add more photos. New photos are moderated before public display.</p>{ownedVenues.map(v=><div className="hub-deal" key={v.id}><b>{v.name}</b><p>{v.area}, {v.city} · <span className="capitalize">{v.approvalStatus}</span>{v.isPublished?' · Public listing':''}</p><label>Add photos<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={e=>{void uploadVenuePhotos(v.id,e.target.files);e.currentTarget.value=''}}/><small>JPG, PNG or WebP · up to 12 photos per upload</small></label></div>)}</section>}
    <div className="hub-search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search venues, categories or areas"/><button className="filter-button" onClick={()=>void load()}>Search</button></div>
    {venues.length ? <div className="venue-grid">{venues.map(v=><article className="venue-card" key={v.id}><div className="venue-image">{v.coverPhotoUrl ? <img src={v.coverPhotoUrl} alt={v.name}/> : <MapPin size={26}/>}</div><div className="venue-content"><span>{v.category}</span><h3>{v.name}</h3><p><MapPin size={14}/> {v.area}, {v.city}</p><button onClick={()=>void openVenue(v)}>Explore venue →</button></div></article>)}</div> : <div className="empty-state"><MapPin size={26}/><h3>No approved venues found yet</h3><p>Be among the first local businesses to join Drinking Buddies.</p></div>}
    {selected && <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}><div className="modal"><div className="modal-head"><div><span className="eyebrow">{selected.category}</span><h2>{selected.name}</h2><p>{selected.address}, {selected.area}, {selected.city}</p></div><button className="icon-button" onClick={()=>setSelected(null)}><X size={18}/></button></div><p>{selected.description}</p>{photos.length>0&&<div className="memory-media-grid">{photos.map(photo=><div className="memory-media-card" key={photo.id}><img src={photo.url} alt={photo.caption??selected.name}/></div>)}</div>}<h3>Current offers</h3>{deals.map(d=><div className="hub-deal" key={d.id}><b>{d.title}</b><p>{d.description}</p>{d.discountLabel}{signedIn&&<button className="filter-button" onClick={()=>void claimDeal(d.id)}>Claim offer</button>}</div>)}<Notice value={dealNotice}/>{!deals.length && <p>No active offers at the moment.</p>}{signedIn && <form className="hub-form" onSubmit={createDeal}><h3>Venue team: publish an offer</h3><label>Offer title<input required value={dealForm.title} onChange={e=>setDealForm({...dealForm,title:e.target.value})}/></label><label>Description<textarea required value={dealForm.description} onChange={e=>setDealForm({...dealForm,description:e.target.value})}/></label><div className="form-row"><label>Type<select value={dealForm.dealType} onChange={e=>setDealForm({...dealForm,dealType:e.target.value})}><option value="general">General offer</option><option value="happy_hour">Happy hour</option><option value="group">Group offer</option><option value="birthday">Birthday</option><option value="vip">VIP</option></select></label><label>Discount label<input value={dealForm.discountLabel} onChange={e=>setDealForm({...dealForm,discountLabel:e.target.value})}/></label></div><div className="form-row"><label>Starts<input type="datetime-local" required value={dealForm.startsAt} onChange={e=>setDealForm({...dealForm,startsAt:e.target.value})}/></label><label>Ends<input type="datetime-local" required value={dealForm.endsAt} onChange={e=>setDealForm({...dealForm,endsAt:e.target.value})}/></label></div><Notice value={dealNotice}/><button className="primary-button">Publish offer</button></form>}</div></div>}
  </section>
}

export function MemoriesHub({ signedIn }: { signedIn: boolean }) {
  const [albums,setAlbums] = useState<Album[]>([])
  const [pendingTags,setPendingTags] = useState<{id:string;mediaId:string;createdAt:string}[]>([])
  const [active,setActive] = useState<Album|null>(null)
  const [media,setMedia] = useState<Media[]>([])
  const [notice,setNotice] = useState('')
  const [form,setForm] = useState({title:'',description:'',visibility:'members',meetupId:'',squadId:''})
  const [files,setFiles] = useState<File[]>([])
  const [caption,setCaption] = useState('')
  const [uploading,setUploading] = useState(false)
  const [pendingUploads,setPendingUploads] = useState<PendingUpload[]>([])
  const [loadingAlbum,setLoadingAlbum] = useState(false)
  const [showCreate,setShowCreate] = useState(false)
  const [showUpload,setShowUpload] = useState(false)
  const [showInvite,setShowInvite] = useState(false)
  const [savedAlbums,setSavedAlbums] = useState<string[]>([])
  const [savedMedia,setSavedMedia] = useState<string[]>([])
  const [comments,setComments] = useState<{id:string;body:string;displayName:string|null;userId:string;parentId:string|null}[]>([])
  const [commentBody,setCommentBody] = useState('')
  const [inviteUserId,setInviteUserId] = useState('')
  const [shareUrl,setShareUrl] = useState('')
  const [meetupOptions,setMeetupOptions] = useState<{id:string;title:string;area:string;startsAt:string}[]>([])
  const [squadOptions,setSquadOptions] = useState<{id:string;name:string;area:string|null}[]>([])
  const [communityAlbums,setCommunityAlbums] = useState<{id:string;title:string;description:string|null;displayName:string|null;createdAt:string;coverUrl:string|null;mediaCount:number}[]>([])
  const [feedMode,setFeedMode] = useState<'mine'|'community'>('mine')


  async function load() {
    const r=await fetch('/api/memories',{credentials:'include'})
    const j=await r.json()
    if(r.ok){setAlbums(j.data?.albums??[]);setPendingTags(j.data?.pendingTags??[])}
    else setNotice(j.error?.message??'Sign in to view memories.')
  }
  useEffect(()=>{if(signedIn){void load();void fetch('/api/memories/social',{credentials:'include'}).then(r=>r.json()).then(j=>{if(j.data){setSavedAlbums((j.data.savedAlbums??[]).map((x:{albumId:string})=>x.albumId));setSavedMedia((j.data.savedMedia??[]).map((x:{mediaId:string})=>x.mediaId))}}).catch(()=>{});void Promise.all([fetch('/api/meetups',{credentials:'include'}).then(r=>r.json()),fetch('/api/squads',{credentials:'include'}).then(r=>r.json()),fetch('/api/memories/social?feed=community',{credentials:'include'}).then(r=>r.json())]).then(([m,s,f])=>{setMeetupOptions((m.data?.meetups??[]).filter((x:{membershipStatus:string|null;hostId:string})=>x.membershipStatus==='approved'||Boolean(x.hostId)));setSquadOptions((s.data?.squads??[]).filter((x:{myStatus:string|null})=>x.myStatus==='active'));setCommunityAlbums(f.data?.communityAlbums??[])})}},[signedIn])
  async function toggleSaved(action:'save_album'|'save_media',id:string){
    const list=action==='save_album'?savedAlbums:savedMedia
    const saved=!list.includes(id)
    const response=await fetch('/api/memories/social',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='save_album'?{action,albumId:id,saved}:{action,mediaId:id,saved})})
    const result=await response.json()
    if(!response.ok){setNotice(result.error?.message??'Could not update saved memories.');return}
    if(action==='save_album')setSavedAlbums(current=>saved?[...current,id]:current.filter(x=>x!==id))
    else setSavedMedia(current=>saved?[...current,id]:current.filter(x=>x!==id))
    setNotice(saved?'Saved to your collection.':'Removed from your collection.')
  }

  async function createAlbum(event:FormEvent) {
    event.preventDefault()
    const r=await fetch('/api/memories',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,meetupId:form.meetupId||null,squadId:form.squadId||null})})
    const j=await r.json()
    setNotice(r.ok?'Album created. Add your first photos or videos below.':j.error?.message??'Could not create album.')
    if(r.ok){
      setForm({title:'',description:'',visibility:'members',meetupId:'',squadId:''})
      await load()
      if(j.data?.album) await openAlbum({...j.data.album,mediaCount:0,creatorName:null})
    }
  }
  async function decideTag(id:string,decision:'accept'|'decline') {
    const r=await fetch('/api/memories/tags/'+id,{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({decision})})
    const j=await r.json()
    setNotice(r.ok?'Tag request '+decision+'ed.':j.error?.message??'Could not update tag.')
    if(r.ok)void load()
  }
  async function openAlbum(album:Album) {
    setActive(album);setShowUpload(false);setShowInvite(false);setLoadingAlbum(true);setMedia([])
    const [r,socialResponse]=await Promise.all([fetch('/api/memories/'+album.id,{credentials:'include'}),fetch('/api/memories/social?albumId='+album.id,{credentials:'include'})])
    const [j,social]=await Promise.all([r.json(),socialResponse.json()])
    if(r.ok){setMedia(j.data?.media??[]);setActive(current=>current?{...current,mediaCount:(j.data?.media??[]).length,coverUrl:(j.data?.media??[]).find((item:Media)=>item.mediaKind!=='video')?.url??(j.data?.media??[])[0]?.url??current.coverUrl}:current)}
    if(socialResponse.ok)setComments(social.data?.comments??[])
    else setNotice(j.error?.message??'Could not load album.')
    setLoadingAlbum(false)
  }
  function uploadFile(file:File,albumId:string,onProgress:(progress:number)=>void):Promise<{ok:boolean;error?:string}> {
    return new Promise(resolve=>{
      const request=new XMLHttpRequest()
      request.open('POST','/api/memories/'+albumId+'/media')
      request.withCredentials=true
      request.upload.onprogress=event=>{if(event.lengthComputable)onProgress(Math.round(event.loaded/event.total*100))}
      request.onload=()=>{
        if(request.status>=200&&request.status<300)resolve({ok:true})
        else {let message='Upload failed. Please retry.';try{message=JSON.parse(request.responseText)?.error?.message??message}catch{}resolve({ok:false,error:message})}
      }
      request.onerror=()=>resolve({ok:false,error:'Network error. Check your connection and retry.'})
      const body=new FormData();body.set('file',file);body.set('caption',caption);request.send(body)
    })
  }
  async function upload(event:FormEvent) {
    event.preventDefault()
    if(!active||!files.length||uploading)return
    const selected=files.slice(0,20)
    const album=active
    const queued=selected.map(file=>({id:crypto.randomUUID(),file,previewUrl:URL.createObjectURL(file),progress:0,status:'queued' as const}))
    setPendingUploads(queued)
    setUploading(true);setShowUpload(false);setNotice('Your uploads are starting. Keep this album open while they finish.')
    let uploaded=0
    const failedFiles:File[]=[]
    for(const item of queued){
      setPendingUploads(current=>current.map(entry=>entry.id===item.id?{...entry,status:'uploading'}:entry))
      const result=await uploadFile(item.file,album.id,progress=>setPendingUploads(current=>current.map(entry=>entry.id===item.id?{...entry,progress}:entry)))
      if(result.ok){uploaded++;setPendingUploads(current=>current.map(entry=>entry.id===item.id?{...entry,status:'uploaded',progress:100}:entry))}
      else {failedFiles.push(item.file);setPendingUploads(current=>current.map(entry=>entry.id===item.id?{...entry,status:'failed',error:result.error}:entry));setNotice(result.error??'One or more uploads failed.')}
    }
    setFiles(failedFiles)
    if(uploaded&&failedFiles.length===0)setCaption('')
    setNotice(failedFiles.length?uploaded+' uploaded · '+failedFiles.length+' need retry.':uploaded+' memories uploaded successfully.')
    await openAlbum(album)
    await load()
    setPendingUploads(current=>{current.forEach(item=>URL.revokeObjectURL(item.previewUrl));return []})
    setUploading(false)
  }

  async function postComment(event:FormEvent) {
    event.preventDefault()
    if(!active||!commentBody.trim())return
    const response=await fetch('/api/memories/social',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'comment',albumId:active.id,body:commentBody.trim()})})
    const result=await response.json()
    if(!response.ok){setNotice(result.error?.message??'Could not post comment.');return}
    setCommentBody('')
    const refreshed=await fetch('/api/memories/social?albumId='+active.id,{credentials:'include'}).then(r=>r.json())
    setComments(refreshed.data?.comments??[])
  }
  async function reactToMemory(mediaId?:string) {
    if(!active)return
    const response=await fetch('/api/memories/social',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'react',...(mediaId?{mediaId}:{albumId:active.id}),reaction:'love'})})
    const result=await response.json()
    setNotice(response.ok?'Reaction added.':result.error?.message??'Could not react.')
  }

  async function createShareLink() {
    if(!active)return
    const response=await fetch('/api/memories/social',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'share',albumId:active.id,expiresInDays:30})})
    const result=await response.json()
    if(!response.ok){setNotice(result.error?.message??'Could not create share link.');return}
    const url=window.location.origin+'/api/memories/share/'+result.data.token
    setShareUrl(url)
    try{await navigator.clipboard.writeText(url);setNotice('Share link created and copied.')}catch{setNotice('Share link created. Copy it below.')}
  }

  async function inviteCollaborator(event:FormEvent) {
    event.preventDefault()
    if(!active||!inviteUserId.trim())return
    const response=await fetch('/api/memories/social',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'invite',albumId:active.id,userId:inviteUserId.trim()})})
    const result=await response.json()
    setNotice(response.ok?'Invitation sent.':result.error?.message??'Could not invite collaborator.')
    if(response.ok)setInviteUserId('')
  }

  async function deleteMedia(id:string) {
    const r=await fetch('/api/memories/media/'+id,{method:'DELETE',credentials:'include'})
    const j=await r.json()
    if(r.ok){setMedia(current=>current.filter(item=>item.id!==id));setNotice('Memory removed.')}
    else setNotice(j.error?.message??'Could not remove memory.')
  }

  return <section className="community-hub">
    {!active&&<div className="section-heading memory-home-heading"><div><div className="eyebrow">PARTY MEMORIES</div><h2>Keep the good nights</h2><p>Build a visual diary of meetups, squads and nights worth remembering.</p></div><button type="button" className="icon-button memory-camera-action" aria-label="Create album" onClick={()=>setShowCreate(v=>!v)}><Camera size={22}/></button></div>}
    <Notice value={notice}/>
    {!signedIn?<div className="empty-state"><h3>Sign in to create and share memories.</h3></div>:<>
      
      {!active&&showCreate&&<div className="memory-compose-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}><form className="hub-form memory-compose-sheet" onSubmit={createAlbum}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h3>Create a memory album</h3><span className="intent-pill">Photos + MP4 video</span></div>
        <div className="form-row"><label>Album title<input required minLength={3} maxLength={100} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="e.g. Friday at Westlands"/></label><label>Who can see it?<select value={form.visibility} onChange={e=>setForm({...form,visibility:e.target.value})}><option value="members">Meetup / squad members</option><option value="public">Everyone · public community feed</option><option value="followers">Followers</option><option value="meetup">Meetup attendees</option><option value="squad">Squad members</option><option value="invited">Invited people only</option><option value="private">Only me</option></select></label></div>
        <label>Description<textarea maxLength={500} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="What made this night memorable?"/></label>
        <div className="form-row"><label>Link a meetup (optional)<select value={form.meetupId} onChange={e=>setForm({...form,meetupId:e.target.value,squadId:''})}><option value="">No meetup</option>{meetupOptions.map(x=><option key={x.id} value={x.id}>{x.title} · {x.area}</option>)}</select></label><label>Link a squad (optional)<select value={form.squadId} onChange={e=>setForm({...form,squadId:e.target.value,meetupId:''})}><option value="">No squad</option>{squadOptions.map(x=><option key={x.id} value={x.id}>{x.name}{x.area?` · ${x.area}`:''}</option>)}</select></label></div>
        <div className="flex gap-2"><button type="button" className="filter-button" onClick={()=>setShowCreate(false)}>Cancel</button><button className="primary-button"><Plus size={16}/> Create album</button></div>
      </form></div>}
      {!active&&<>{pendingTags.length>0&&<div className="hub-form"><h3>Tag requests waiting for you</h3>{pendingTags.map(tag=><div className="hub-deal" key={tag.id}><p>Someone requested to tag you in a memory.</p><button className="filter-button" onClick={()=>void decideTag(tag.id,'accept')}>Accept</button> <button className="filter-button" onClick={()=>void decideTag(tag.id,'decline')}>Decline</button></div>)}</div>}
      <div className="flex flex-wrap items-center justify-between gap-3"><div className="section-heading"><div><div className="eyebrow">MEMORIES FEED</div><h3>{feedMode==='mine'?'Your albums':'Community memories'}</h3><p>{feedMode==='mine'?'Albums you own or can contribute to.':'Public moments shared by the community.'}</p></div></div><div className="flex gap-2"><button className="filter-button" onClick={()=>setFeedMode('mine')}>My collection</button><button className="filter-button" onClick={()=>setFeedMode('community')}>Community</button></div></div>
      {feedMode==='mine'?<div className="memory-album-grid">{albums.map(a=><article className="memory-album-card" key={a.id}><button className="memory-album-open" onClick={()=>void openAlbum(a)}>{a.coverUrl?<img className="memory-album-cover" src={a.coverUrl} alt=""/>:<div className="memory-album-cover memory-cover-empty"><Camera size={28}/></div>}<span className="memory-album-overlay"><b>{a.title}</b><small>{a.mediaCount} memories · {a.visibility}</small></span></button><button type="button" className="memory-bookmark" aria-label="Bookmark album" onClick={()=>void toggleSaved('save_album',a.id)}><Bookmark size={17} fill={savedAlbums.includes(a.id)?'currentColor':'none'}/></button></article>)}</div>:<div className="memory-album-grid">{communityAlbums.map(a=><article className="memory-album-card" key={a.id}><button className="memory-album-open" onClick={()=>void openAlbum({...a,creatorName:a.displayName,visibility:'public'} as Album)}>{a.coverUrl?<img className="memory-album-cover" src={a.coverUrl} alt=""/>:<div className="memory-album-cover memory-cover-empty"><Camera size={28}/></div>}<span className="memory-album-overlay"><b>{a.title}</b><small>{a.mediaCount} memories · Public</small><small>Shared by {a.displayName??'Community member'}</small></span></button><button type="button" className="memory-bookmark" aria-label="Bookmark album" onClick={()=>void toggleSaved('save_album',a.id)}><Bookmark size={17} fill={savedAlbums.includes(a.id)?'currentColor':'none'}/></button></article>)}</div>}
      {feedMode==='mine'&&!albums.length&&<div className="empty-state"><Camera size={26}/><b>No albums yet</b><p>Create your first album, then add photos and videos from your camera roll.</p></div>}
      </>}
    </>}
    {active&&<div className="memory-album-screen">
      <header className="memory-album-toolbar">
        <button className="icon-button" aria-label="Back to memories" disabled={uploading} onClick={()=>{setActive(null);setFiles([])}}><ArrowLeft size={20}/></button>
        <div className="memory-album-title"><h2>{active.title}</h2><small>{media.length} memories · {active.visibility}</small></div>
        <div className="memory-album-actions">
          <button className="icon-button" aria-label="Invite collaborators" onClick={()=>setShowInvite(v=>!v)}><Users size={18}/></button>
          <button className="icon-button" aria-label="Add memories" onClick={()=>setShowUpload(v=>!v)}><Camera size={19}/></button>
          <button className="icon-button" aria-label="Share album" onClick={()=>void createShareLink()}><Share2 size={18}/></button>
          <button className="icon-button" aria-label="Love album" onClick={()=>void reactToMemory()}><Heart size={18}/></button>
        </div>
      </header>
      {showInvite&&<form className="hub-form memory-inline-panel" onSubmit={inviteCollaborator}><div className="memory-panel-heading"><b>Invite collaborator</b><button type="button" className="icon-button" onClick={()=>setShowInvite(false)}><X size={16}/></button></div><label>Member user ID<input value={inviteUserId} onChange={e=>setInviteUserId(e.target.value)} placeholder="Paste member user ID"/></label><button className="primary-button" disabled={!inviteUserId.trim()}>Send invitation</button></form>}
      {showUpload&&<form className="hub-form memory-inline-panel" onSubmit={upload}><div className="memory-panel-heading"><b>Add to this album</b><button type="button" className="icon-button" onClick={()=>setShowUpload(false)}><X size={16}/></button></div><label className="memory-file-picker">Choose photos or videos<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" multiple onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,20))}/><small>Up to 20 files · JPG, PNG, WebP or MP4</small></label>{files.length>0&&<b>{files.length} files selected</b>}<label>Caption<input value={caption} maxLength={500} onChange={e=>setCaption(e.target.value)} placeholder="Add a note about these moments"/></label><button className="primary-button" disabled={!files.length||uploading}><Upload size={16}/>{uploading?'Uploading…':'Upload '+files.length+' memories'}</button></form>}
      {shareUrl&&<div className="memory-share-strip"><span>Album link copied</span><button className="text-button" onClick={()=>void navigator.clipboard.writeText(shareUrl)}>Copy link</button></div>}
      {pendingUploads.length>0&&<section className="memory-upload-queue" aria-live="polite"><div className="memory-panel-heading"><b>{uploading?'Uploading your memories':'Upload results'}</b><span>{pendingUploads.filter(item=>item.status==='uploaded').length}/{pendingUploads.length} complete</span></div><div className="memory-upload-grid">{pendingUploads.map(item=><article className="memory-upload-card" key={item.id}><div className="memory-upload-preview">{item.file.type.startsWith('video/')?<video src={item.previewUrl} muted/>:<img src={item.previewUrl} alt={item.file.name}/>}<span className={'memory-upload-state '+item.status}>{item.status==='uploading'?'Uploading':item.status==='uploaded'?'Uploaded':item.status==='failed'?'Needs retry':'Queued'}</span></div><div className="memory-upload-info"><b>{item.file.name}</b><div className="memory-upload-track"><i style={{width:item.progress+'%'}}/></div><small>{item.status==='failed'?(item.error??'Upload failed'):item.status==='uploaded'?'Ready in album':item.progress+'% uploaded'}</small></div></article>)}</div></section>}
      {loadingAlbum?<div className="empty-state">Loading memories…</div>:media.length>0?<div className="memory-gallery-grid">{media.map(item=><article key={item.id} className="memory-media-card">{item.mediaKind==='video'?<video src={item.url} controls preload="metadata"/>:<img src={item.url} alt={item.caption??'Shared party memory'}/>}<div className="memory-media-actions"><small>{item.caption||'A moment worth keeping'}</small><button type="button" className="text-button" aria-label="Save memory" onClick={()=>void toggleSaved('save_media',item.id)}><Bookmark size={15} fill={savedMedia.includes(item.id)?'currentColor':'none'}/></button><button type="button" className="text-button" aria-label="Love memory" onClick={()=>void reactToMemory(item.id)}><Heart size={15}/></button><button type="button" className="text-button" aria-label="Remove memory" onClick={()=>void deleteMedia(item.id)}><X size={15}/></button>{item.moderationStatus&&item.moderationStatus!=='approved'&&<small className="text-amber-200">Pending</small>}</div></article>)}</div>:<div className="memory-empty-gallery"><Camera size={30}/><b>No memories yet</b><span>Capture and add the moments that made this night.</span><button className="primary-button" onClick={()=>setShowUpload(true)}><Camera size={16}/> Add first memory</button></div>}
      <section className="memory-conversation"><div className="memory-panel-heading"><h3>Album conversation</h3><span>{comments.length}</span></div><form onSubmit={postComment}><input value={commentBody} onChange={e=>setCommentBody(e.target.value)} maxLength={1200} placeholder="Leave a comment…"/><button className="primary-button" disabled={!commentBody.trim()}>Post</button></form>{comments.map(comment=><div className="hub-deal" key={comment.id}><b>{comment.displayName??'Member'}</b><p>{comment.body}</p></div>)}</section>
    </div>}
  </section>
}
