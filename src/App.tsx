import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowRight, Bell, CalendarDays, Camera, Check, ChevronDown, Compass, Heart, Star,
  MapPin, MessageCircle, Plus, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, Users, Wine, X,
} from 'lucide-react'
import { Meetups } from './Meetups'
import { Messaging } from './Messaging'
import { GoOutHub } from './GoOutHub'
import { MemoriesHub, VenueHub } from './CommunityHubs'

type Tab = 'discover' | 'meetups' | 'places' | 'messages' | 'community' | 'memories'

type MemberProfile = {
  id: string
  displayName: string
  bio: string | null
  gender: string | null
  interests: string[]
  connectionIntents: string[]
  homeArea: string | null
  avatarUrl?: string | null
  popularityScore?: number
  reputationScore?: number
}
type OwnProfile = {
  avatarUrl?: string | null
  displayName: string
  bio: string | null
  gender: string | null
  discoverable: boolean
  displayPopularityScore: boolean
  displayReputationScore: boolean
  locationVisibility: 'private' | 'matches' | 'public'
  preferredGenders: string[]
  connectionIntents: string[]
  interests: string[]
  homeArea: string | null
}
type SessionUser = { id: string; email: string; displayName: string | null }
type ProfileStats = { hostedMeetups: number; joinedMeetups: number; attendedMeetups: number; receivedLikes: number; activeMatches: number; favoriteHosts: number; favoritePlaces: number; popularityScore: number; reputationScore: number }
const KENYA_AREAS = ['Nairobi - Westlands','Nairobi - Kilimani','Nairobi - Lavington','Nairobi - CBD','Nairobi - Karen','Nairobi - Parklands','Nairobi - Kasarani','Nairobi - Rongai','Kiambu','Thika','Mombasa - Nyali','Mombasa - CBD','Kisumu','Nakuru','Eldoret','Naivasha','Nanyuki','Nyeri','Machakos','Kitengela','Malindi','Diani']
const intentLabels: Record<string, string> = {
  drinking_buddies: 'Drinking buddies', friendship: 'New friendships',
  social_and_dating: 'Social and dating', group_outings: 'Group outings',
}

function App() {
  const [tab, setTab] = useState<Tab>('discover')
  const [discoveryMode, setDiscoveryMode] = useState<'social' | 'friendship' | 'dating'>('social')
  const swipeStart = useRef<{ userId: string; x: number; y: number } | null>(null)
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('All areas')
  const [showFilters, setShowFilters] = useState(false)
  const [showProfileForm, setShowProfileForm] = useState(false)
  const [toast, setToast] = useState('')
  const [authStatus, setAuthStatus] = useState<'loading' | 'signed_out' | 'signed_in'>('loading')
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null)
  const [profile, setProfile] = useState<OwnProfile | null>(null)
  const [profileStats, setProfileStats] = useState<ProfileStats | null>(null)
  const [displayPopularityScore, setDisplayPopularityScore] = useState(false)
  const [displayReputationScore, setDisplayReputationScore] = useState(false)
  const [showAccountMenu, setShowAccountMenu] = useState(false)
  const [showLocationPicker, setShowLocationPicker] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)
  const [profiles, setProfiles] = useState<MemberProfile[]>([])
  const [favoritePeople, setFavoritePeople] = useState<string[]>([])
  const [favoritePeopleDetails, setFavoritePeopleDetails] = useState<{ id: string; displayName: string; homeArea: string | null }[]>([])
  const [favoriteVenues, setFavoriteVenues] = useState<{ id: string; name: string; area: string; city: string }[]>([])
  const [discoveryLoading, setDiscoveryLoading] = useState(false)
  const [discoveryError, setDiscoveryError] = useState('')
  const [profileBusy, setProfileBusy] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [profileName, setProfileName] = useState('')
  const [profilePhotoBusy, setProfilePhotoBusy] = useState(false)
  const [profilePhotoError, setProfilePhotoError] = useState('')
  const [profileBio, setProfileBio] = useState('')
  const [profileGender, setProfileGender] = useState('')
  const [profileArea, setProfileArea] = useState('')
  const [profileInterests, setProfileInterests] = useState('')
  const [profileIntents, setProfileIntents] = useState<string[]>(['drinking_buddies'])
  const [preferredGenders, setPreferredGenders] = useState<string[]>([])
  const [locationVisibility, setLocationVisibility] = useState<'private' | 'matches' | 'public'>('private')
  const [discoverable, setDiscoverable] = useState(true)

  async function loadFavorites() {
    const response = await fetch('/api/favorites')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'Could not load favourites.')
    setFavoritePeople((result.data?.people ?? []).map((person: { id: string }) => person.id))
    setFavoritePeopleDetails(result.data?.people ?? [])
    setFavoriteVenues(result.data?.venues ?? [])
  }

  async function loadDiscovery(selectedArea = area, selectedMode = discoveryMode) {
    setDiscoveryLoading(true)
    setDiscoveryError('')
    try {
      const params = new URLSearchParams()
      if (selectedArea !== 'All areas') params.set('area', selectedArea)
      params.set('mode', selectedMode)
      const response = await fetch('/api/discovery' + (params.size ? '?' + params.toString() : ''))
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not load people.')
      setProfiles(Array.isArray(result.data?.profiles) ? result.data.profiles : [])
    } catch (cause) {
      setDiscoveryError(cause instanceof Error ? cause.message : 'Could not load people.')
    } finally {
      setDiscoveryLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    async function bootstrap() {
      try {
        const sessionResponse = await fetch('/api/auth/me')
        if (!sessionResponse.ok) {
          if (active) setAuthStatus('signed_out')
          return
        }
        const sessionResult = await sessionResponse.json()
        const user = sessionResult.data?.user as SessionUser | undefined
        if (!user || !active) return
        setCurrentUser(user)
        setAuthStatus('signed_in')
        const profileResponse = await fetch('/api/profile')
        const profileResult = await profileResponse.json()
        if (!profileResponse.ok) throw new Error(profileResult.error?.message ?? 'Could not load your profile.')
        if (!active) return
        const ownProfile = profileResult.data?.profile as OwnProfile | null
        setProfile(ownProfile)
        setProfileStats(profileResult.data?.stats ?? null)
        if (ownProfile) {
          setDisplayPopularityScore(Boolean(ownProfile.displayPopularityScore))
          setDisplayReputationScore(Boolean(ownProfile.displayReputationScore))
          setProfileName(ownProfile.displayName)
          setProfileBio(ownProfile.bio ?? '')
          setProfileGender(ownProfile.gender ?? '')
          setProfileArea(ownProfile.homeArea ?? '')
          setProfileInterests(ownProfile.interests.join(', '))
          setProfileIntents(ownProfile.connectionIntents)
          setPreferredGenders(ownProfile.preferredGenders)
          setLocationVisibility(ownProfile.locationVisibility)
          setDiscoverable(ownProfile.discoverable)
          await Promise.all([loadDiscovery('All areas'), loadFavorites()])
        } else {
          setProfileName(user.displayName ?? '')
          setShowProfileForm(true)
        }
      } catch (cause) {
        if (active) setDiscoveryError(cause instanceof Error ? cause.message : 'Could not load your account.')
      }
    }
    void bootstrap()
    return () => { active = false }
  }, [])

  const visibleBuddies = useMemo(() => profiles.filter((person) => {
    const text = [person.displayName, person.homeArea ?? '', person.bio ?? '', ...person.interests].join(' ').toLowerCase()
    return text.includes(query.toLowerCase())
  }), [profiles, query])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const like = async (id: string) => {
    try {
      const response = await fetch('/api/likes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not send your interest.')
      notify(result.data?.matched ? 'It’s a match! You can now start a conversation.' : 'Interest sent. If they like you too, it’s a match!')
      await loadDiscovery()
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Could not send your interest.')
    }
  }

  const toggleFavorite = async (id: string) => {
    const saved = favoritePeople.includes(id)
    try {
      const response = await fetch('/api/favorites', { method: saved ? 'DELETE' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'person', targetId: id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not update your favourites.')
      setFavoritePeople((current) => saved ? current.filter((value) => value !== id) : [...current, id])
      await loadFavorites()
      notify(saved ? 'Removed from your favourite people.' : 'Saved to your favourite people.')
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Could not update your favourites.') }
  }

  const pass = async (id: string) => {
    try {
      const response = await fetch('/api/passes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not pass on this profile.')
      setProfiles((current) => current.filter((person) => person.id !== id))
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : 'Could not pass on this profile.')
    }
  }

  const uploadProfilePhoto = async (file: File) => {
    setProfilePhotoBusy(true); setProfilePhotoError('')
    try { const body = new FormData(); body.set('file', file); const response = await fetch('/api/profile/photo', { method: 'POST', body }); const result = await response.json(); if (!response.ok) throw new Error(result.error?.message ?? 'Could not upload your photo.'); setProfile((current) => current ? { ...current, avatarUrl: result.data.avatarUrl } : current); notify('Profile photo updated.') }
    catch (cause) { setProfilePhotoError(cause instanceof Error ? cause.message : 'Could not upload your photo.') }
    finally { setProfilePhotoBusy(false) }
  }

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileBusy(true)
    setProfileError('')
    try {
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profileName,
          bio: profileBio || null,
          gender: profileGender || null,
          homeArea: profileArea || null,
          interests: profileInterests.split(',').map((item) => item.trim()).filter(Boolean),
          connectionIntents: profileIntents,
          preferredGenders,
          discoverable,
          locationVisibility,
          displayPopularityScore,
          displayReputationScore,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not save your profile.')
      setProfile(result.data.profile)
      setProfileStats(result.data.stats ?? null)
      setShowProfileForm(false)
      notify('Your profile has been saved.')
      await loadDiscovery()
    } catch (cause) {
      setProfileError(cause instanceof Error ? cause.message : 'Could not save your profile.')
    } finally {
      setProfileBusy(false)
    }
  }

  const saveLocation = async (homeArea: string) => {
    if (!profile) { setShowProfileForm(true); setShowLocationPicker(false); return }
    setSavingLocation(true)
    try {
      const response = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        displayName: profile.displayName, bio: profile.bio, gender: profile.gender, homeArea: homeArea || null,
        interests: profile.interests, connectionIntents: profile.connectionIntents, preferredGenders: profile.preferredGenders,
        discoverable: profile.discoverable, locationVisibility: profile.locationVisibility,
        displayPopularityScore: profile.displayPopularityScore, displayReputationScore: profile.displayReputationScore,
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not update your location.')
      setProfile(result.data.profile); setProfileStats(result.data.stats ?? null); setShowLocationPicker(false)
      notify('Your location preference has been updated.')
    } catch (cause) { notify(cause instanceof Error ? cause.message : 'Could not update your location.') }
    finally { setSavingLocation(false) }
  }

  const signOut = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.assign('/')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="Drinking Buddies home">
          <span className="brand-mark"><Wine size={21} /></span>
          <span>drinking<span className="brand-light">buddies</span><small>GOOD DRINKS. GREAT COMPANY.</small></span>
        </a>
        <div className="sidebar-label">YOUR SPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          <NavButton active={tab === 'discover'} onClick={() => setTab('discover')} icon={<Compass size={19} />} label="Discover" />
          <NavButton active={tab === 'meetups'} onClick={() => setTab('meetups')} icon={<Users size={19} />} label="Meetups"  />
          <NavButton active={tab === 'community'} onClick={() => setTab('community')} icon={<CalendarDays size={19} />} label="Let's Go Out" />
          <NavButton active={tab === 'places'} onClick={() => setTab('places')} icon={<MapPin size={19} />} label="Places & events" />
          <NavButton active={tab === 'memories'} onClick={() => setTab('memories')} icon={<Camera size={19} />} label="Party Memories" />
          <NavButton active={tab === 'messages'} onClick={() => setTab('messages')} icon={<MessageCircle size={19} />} label="Messages" />
        </nav>
        <div className="sidebar-card">
          <div className="sidebar-card-icon"><Sparkles size={17} /></div>
          <strong>Make your night count.</strong>
          <p>Meet people who are up for the same kind of plans.</p>
          <button className="text-button" onClick={() => window.location.assign('/membership')}>Explore premium <ArrowRight size={14} /></button>
        </div>
        <div className="sidebar-bottom">
          <div className="safety-note"><ShieldCheck size={16} /><span>18+ community<br /><small>Meet kindly. Stay safe.</small></span></div>
          <button className="profile-mini" onClick={() => authStatus === 'signed_in' ? setShowProfileForm(true) : window.location.assign('/login')}>
            <span className="avatar avatar-small">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : (profile?.displayName ?? currentUser?.email ?? 'Y').slice(0, 1).toUpperCase()}</span><span><b>{profile?.displayName ?? 'Your profile'}</b><small>{profile ? 'Edit your profile' : 'Complete your profile'}</small></span><ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setTab('discover')}><span className="brand-mark"><Wine size={18} /></span> drinkingbuddies</button>
          <div className="location-control">
            <button className="location-pill" onClick={() => authStatus === 'signed_in' ? setShowLocationPicker((value) => !value) : window.location.assign('/login')} aria-expanded={showLocationPicker}><MapPin size={15} /><span>{profile?.homeArea ?? 'Set your area'}</span><ChevronDown size={14} /></button>
            {showLocationPicker && <div className="location-menu"><b>Choose your area</b><select value={profile?.homeArea ?? ''} disabled={savingLocation} onChange={(event) => void saveLocation(event.target.value)}><option value="">Not set</option>{profile?.homeArea && !KENYA_AREAS.includes(profile.homeArea) && <option value={profile.homeArea}>{profile.homeArea} (current)</option>}{KENYA_AREAS.map((place) => <option key={place} value={place}>{place}</option>)}</select><small>Only the area you choose is used for discovery. Exact GPS is not shared.</small></div>}
          </div>
          <div className="top-actions"><button className="icon-button" aria-label="Notifications" onClick={() => notify('You’re all caught up.')}><Bell size={19} /><i /></button><div className="account-menu-wrap"><button className="top-avatar" aria-label="Account menu" aria-expanded={showAccountMenu} onClick={() => authStatus === 'signed_in' ? setShowAccountMenu((value) => !value) : window.location.assign('/login')}>{(profile?.displayName ?? currentUser?.email ?? 'Y').slice(0, 1).toUpperCase()}</button>{showAccountMenu && <div className="account-menu"><b>{profile?.displayName ?? currentUser?.email}</b><button onClick={() => { setShowProfileForm(true); setShowAccountMenu(false) }}>My profile</button><button onClick={() => { setShowAccountMenu(false); void signOut() }}>Sign out</button></div>}</div></div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="live-dot" /> YOUR CITY, YOUR PEOPLE</div><h1>Good company is <em>closer</em> than you think.</h1><p className="welcome-copy">Find your people, make a plan, and see where the night takes you.</p></div>
            <button className="primary-button create-button" onClick={() => setTab('meetups')}><Plus size={18} /> Create a meetup</button>
          </section>

          <section className="quick-stats">
            <div className="stat"><span className="stat-icon"><Users size={17} /></span><span><b>{profiles.length}</b><small>people in your feed</small></span></div>
            <div className="stat"><span className="stat-icon"><CalendarDays size={17} /></span><span><b>Live</b><small>community meetups</small></span></div>
            <div className="stat"><span className="stat-icon"><MapPin size={17} /></span><span><b>Kenya</b><small>local venues</small></span></div>
            <div className="stat stat-note"><span className="online-avatars"><i>M</i><i>B</i><i>N</i></span><span><b>People are making plans</b><small>See what’s happening around you</small></span></div>
          </section>

          <div className="section-tabs" role="tablist" aria-label="Discovery sections">
            <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'selected' : ''} onClick={() => setTab('discover')}>People <span>{profiles.length}</span></button>
            <button role="tab" aria-selected={tab === 'meetups'} className={tab === 'meetups' ? 'selected' : ''} onClick={() => setTab('meetups')}>Meetups</button>
            <button role="tab" aria-selected={tab === 'places'} className={tab === 'places' ? 'selected' : ''} onClick={() => setTab('places')}>Places & events</button>
            <button role="tab" aria-selected={tab === 'memories'} className={tab === 'memories' ? 'selected' : ''} onClick={() => setTab('memories')}>Party Memories</button>
          </div>

          {tab === 'discover' && <>
            {authStatus === 'loading' ? <div className="empty-state"><b>Loading your account…</b></div> : authStatus === 'signed_out' ? <div className="empty-state"><ShieldCheck size={26} /><h2>Sign in to meet your people.</h2><p>Discover real community members, save your preferences and connect through mutual matches.</p><button className="primary-button" onClick={() => window.location.assign('/login')}>Sign in to discover <ArrowRight size={15} /></button><p>New here? <a href="/register">Create an account</a></p></div> : !profile ? <div className="empty-state"><b>Complete your profile to get started.</b><p>Tell the community a little about yourself and set your discovery preferences.</p><button className="primary-button" onClick={() => setShowProfileForm(true)}>Set up my profile <ArrowRight size={15} /></button></div> : <>
            <section className="tonight-banner">
              <div className="tonight-copy"><span className="banner-kicker">THE CITY IS YOURS</span><h2>Who's up for<br />tonight?</h2><p>Find people who are free, nearby and in the mood to connect.</p><button className="banner-button" onClick={() => setTab('meetups')}>Explore tonight’s meetups <ArrowRight size={15} /></button></div>
              <div className="banner-image"><div className="banner-image-overlay" /><div className="floating-tag"><span className="live-dot" /> Find your next connection</div></div>
              <div className="banner-orb orb-one" /><div className="banner-orb orb-two" />
            </section>
            <div className="discovery-modes" role="tablist" aria-label="Choose your discovery experience"><button className={discoveryMode === 'social' ? 'active' : ''} onClick={() => { setDiscoveryMode('social'); void loadDiscovery(area, 'social') }}>Social discovery</button><button className={discoveryMode === 'friendship' ? 'active' : ''} onClick={() => { setDiscoveryMode('friendship'); void loadDiscovery(area, 'friendship') }}>Friendship</button><button className={discoveryMode === 'dating' ? 'active' : ''} onClick={() => { setDiscoveryMode('dating'); void loadDiscovery(area, 'dating') }}>Dating</button></div>
            <div className="section-heading"><div><div className="eyebrow">YOUR NEXT CONNECTION</div><h2>{discoveryMode === 'dating' ? 'People open to dating' : discoveryMode === 'friendship' ? 'People looking for friendship' : 'People near you'}</h2><p>Say hello to someone new. Match first, then chat.</p></div><button className="filter-button" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={16} /> Filters</button></div>
            {showFilters && <div className="filter-panel"><label>Area<select value={area} onChange={(e) => { setArea(e.target.value); void loadDiscovery(e.target.value) }}><option>All areas</option><option>Westlands</option><option>Kilimani</option><option>Lavington</option><option>Riverside</option><option>Parklands</option></select></label><label>Search<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, area or interest" /></label><button className="clear-button" onClick={() => { setArea('All areas'); setQuery(''); void loadDiscovery('All areas') }}>Clear</button></div>}
            {discoveryLoading ? <div className="empty-state"><b>Finding people…</b></div> : discoveryError ? <div className="empty-state"><b>We couldn’t load discovery.</b><span>{discoveryError}</span><button className="primary-button" onClick={() => loadDiscovery()}>Try again</button></div> : <div className="people-grid">{visibleBuddies.map((person) => <article className="person-card" key={person.id} onTouchStart={(event) => { const touch = event.touches[0]; swipeStart.current = { userId: person.id, x: touch.clientX, y: touch.clientY } }} onTouchEnd={(event) => { const start = swipeStart.current; swipeStart.current = null; if (!start || start.userId !== person.id) return; const touch = event.changedTouches[0]; const dx = touch.clientX - start.x; const dy = touch.clientY - start.y; if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (dx > 0) void like(person.id); else void pass(person.id) } }}><div className="person-photo" style={{ backgroundImage: person.avatarUrl ? `linear-gradient(180deg, transparent, #11130fe8), url(${person.avatarUrl})` : 'linear-gradient(135deg, #414b2d, #171914)' }}><span className="availability"><i /> Community member</span><button className="heart-button" aria-label={'Like ' + person.displayName} onClick={() => void like(person.id)}><Heart size={18} /></button><button className={'favorite-profile-button ' + (favoritePeople.includes(person.id) ? 'saved' : '')} aria-label={favoritePeople.includes(person.id) ? 'Remove favourite ' + person.displayName : 'Favourite ' + person.displayName} onClick={() => void toggleFavorite(person.id)}><Star size={16} fill={favoritePeople.includes(person.id) ? 'currentColor' : 'none'} /></button><div className="photo-gradient" /><div className="person-title"><h3>{person.displayName}</h3><span><MapPin size={13} /> {person.homeArea ?? 'Area not shared'}</span></div></div><div className="person-info"><span className="intent-pill">{intentLabels[person.connectionIntents[0]] ?? 'Open to meeting'}</span>{person.popularityScore !== undefined && <span className="score-pill">Popularity {person.popularityScore}</span>}{person.reputationScore !== undefined && <span className="score-pill">Reputation {person.reputationScore}</span>}<p>{person.bio || 'Open to meeting good people and making new connections.'}</p><div className="interest-tags">{person.interests.map((interest) => <span key={interest}>{interest}</span>)}</div><div className="card-actions"><button className="pass-button" onClick={() => void pass(person.id)}><X size={16} /> Pass</button><button className="interest-button" onClick={() => void like(person.id)}><Heart size={15} /> Say hello</button></div></div></article>)}</div>}
            {!discoveryLoading && !discoveryError && visibleBuddies.length === 0 && <div className="empty-state"><Search size={24} /><b>No community profiles to show yet</b><span>Try another area, or check back as more people complete their profiles.</span></div>}
            <div className="privacy-strip"><ShieldCheck size={18} /><span><b>Your location stays yours.</b> People see only the area or meetup location you choose to share.</span><button onClick={() => setShowProfileForm(true)}>Privacy settings</button></div>
            </>}
          </>}

          {tab === 'meetups' && <Meetups currentUserId={currentUser?.id ?? null} signedIn={authStatus === 'signed_in'} onSignIn={() => window.location.assign('/login')} onOpenMessages={() => setTab('messages')} />}

          {tab === 'community' && <GoOutHub currentUserId={currentUser?.id ?? null} signedIn={authStatus === 'signed_in'} onSignIn={() => window.location.assign('/login')} />}

          {tab === 'places' && <VenueHub signedIn={authStatus === 'signed_in'} />}

          {tab === 'memories' && <MemoriesHub signedIn={authStatus === 'signed_in'} />}

          {tab === 'messages' && (authStatus === 'signed_in' ? <Messaging currentUserId={currentUser?.id ?? ''} /> : <div className="empty-state messages-empty"><MessageCircle size={28} /><h2>Sign in to view your messages.</h2><p>Your conversations are private and available after you sign in.</p><button className="primary-button" onClick={() => window.location.assign('/login')}>Sign in <ArrowRight size={15} /></button></div>)}

          <footer className="footer"><span>© 2026 Drinking Buddies</span><span>18+ only · Meet kindly · Stay safe</span><span>Kenya first. Everywhere next.</span></footer>
        </div>
      </main>

      {showProfileForm && authStatus === 'signed_in' && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && profile) setShowProfileForm(false) }}><div className="modal"><div className="modal-head"><div><span className="eyebrow">YOUR COMMUNITY PROFILE</span><h2>{profile ? 'Edit your profile' : 'Set up your profile'}</h2></div>{profile && <button className="icon-button" onClick={() => setShowProfileForm(false)}><X size={19} /></button>}</div>{profileError && <div className="auth-error">{profileError}</div>}<form onSubmit={saveProfile}>
        {(favoritePeopleDetails.length > 0 || favoriteVenues.length > 0) && <div className="profile-favourites-panel"><b>My favourites</b>{favoritePeopleDetails.length > 0 && <div><small>Favourite people and hosts</small><p>{favoritePeopleDetails.map((person) => person.displayName).join(' · ')}</p></div>}{favoriteVenues.length > 0 && <div><small>Favourite places</small><p>{favoriteVenues.map((venue) => venue.name).join(' · ')}</p></div>}</div>}
        {profileStats && <div className="profile-stats-panel"><b>Your community activity</b><div><span><strong>{profileStats.hostedMeetups}</strong><small>Hosted</small></span><span><strong>{profileStats.joinedMeetups}</strong><small>Joined</small></span><span><strong>{profileStats.attendedMeetups}</strong><small>Paid attended</small></span><span><strong>{profileStats.activeMatches}</strong><small>Matches</small></span><span><strong>{profileStats.favoriteHosts}</strong><small>Hosts saved</small></span><span><strong>{profileStats.favoritePlaces}</strong><small>Places saved</small></span></div><small>Popularity points: {profileStats.popularityScore} · Reputation points: {profileStats.reputationScore}. Reputation currently reflects hosted meetups and recorded paid attendance.</small></div>}
        <div className="profile-photo-editor"><div className="profile-photo-preview">{profile?.avatarUrl ? <img src={profile.avatarUrl} alt="Your profile" /> : <Camera size={26} />}</div><div><b>Profile photo</b><p>JPG, PNG or WebP · max 10 MB</p><label className="photo-upload-button">{profilePhotoBusy ? 'Uploading…' : 'Upload photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={profilePhotoBusy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadProfilePhoto(file); event.currentTarget.value = '' }} /></label>{profilePhotoError && <small role="alert">{profilePhotoError}</small>}</div></div>
        <label>Display name<input value={profileName} onChange={(e) => setProfileName(e.target.value)} minLength={2} maxLength={48} required placeholder="What should people call you?" /></label>
        <label>About you<textarea rows={3} value={profileBio} onChange={(e) => setProfileBio(e.target.value)} maxLength={500} placeholder="A little about the people and plans you enjoy…" /></label>
        <div className="form-row"><label>Gender<input value={profileGender} onChange={(e) => setProfileGender(e.target.value)} maxLength={32} placeholder="Optional" /></label><label>Home area<input value={profileArea} onChange={(e) => setProfileArea(e.target.value)} maxLength={120} placeholder="e.g. Westlands" /></label></div>
        <label>Interests<input value={profileInterests} onChange={(e) => setProfileInterests(e.target.value)} placeholder="Live music, food, football…" /><small>Separate interests with commas.</small></label>
        <label>What are you looking for?<select value={profileIntents[0] ?? 'drinking_buddies'} onChange={(e) => setProfileIntents([e.target.value])}><option value="drinking_buddies">Drinking buddies</option><option value="friendship">New friendships</option><option value="social_and_dating">Social and dating</option><option value="group_outings">Group outings</option></select></label>
        <label>Who would you like to discover?<input value={preferredGenders.join(', ')} onChange={(e) => setPreferredGenders(e.target.value.split(',').map((item) => item.trim()).filter(Boolean))} placeholder="Leave blank for everyone" /><small>Optional. Enter preferences separated by commas.</small></label>
        <label>Home area visibility<select value={locationVisibility} onChange={(e) => setLocationVisibility(e.target.value as 'private' | 'matches' | 'public')}><option value="private">Private — only used for filtering</option><option value="matches">Matches only</option><option value="public">Public — shown on my profile card</option></select></label>
        <div className="profile-score-settings"><b>Profile statistics visibility</b><small>Choose which activity scores other people may see. Both are hidden by default.</small><label><input type="checkbox" checked={displayPopularityScore} onChange={(event) => setDisplayPopularityScore(event.target.checked)} /> Show my popularity score</label><label><input type="checkbox" checked={displayReputationScore} onChange={(event) => setDisplayReputationScore(event.target.checked)} /> Show my community reputation score</label></div>
        <button className="primary-button modal-submit" type="submit" disabled={profileBusy}>{profileBusy ? 'Saving profile…' : 'Save profile'}</button>
        <p className="form-note"><ShieldCheck size={14} /> You control what you share. Exact GPS location is not collected by this profile form.</p>
      </form></div></div>}

      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
      <div className="mobile-nav"><button onClick={() => setTab('discover')} className={tab === 'discover' ? 'active' : ''}><Compass size={19} /><span>Discover</span></button><button onClick={() => setTab('meetups')} className={tab === 'meetups' ? 'active' : ''}><Users size={19} /><span>Meetups</span></button><button onClick={() => setTab('community')} className={tab === 'community' ? 'active' : ''}><CalendarDays size={19} /><span>Let's Go Out</span></button><button onClick={() => setTab('places')} className={tab === 'places' ? 'active' : ''}><MapPin size={19} /><span>Places</span></button><button onClick={() => setTab('memories')} className={tab === 'memories' ? 'active' : ''}><Camera size={19} /><span>Memories</span></button><button onClick={() => setTab('messages')} className={tab === 'messages' ? 'active' : ''}><MessageCircle size={19} /><span>Chats</span></button></div>
    </div>
  )
}

function NavButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count?: string }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{count && <i>{count}</i>}</button>
}

export default App
