import { useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight, Bell, CalendarDays, Check, ChevronDown, Compass, Heart,
  MapPin, MessageCircle, Plus, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, Users, Wine, X,
} from 'lucide-react'
import { buddies, meetups, venues } from './data/demo'

type Tab = 'discover' | 'meetups' | 'places' | 'messages'

function App() {
  const [tab, setTab] = useState<Tab>('discover')
  const [liked, setLiked] = useState<string[]>([])
  const [passed, setPassed] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [area, setArea] = useState('All areas')
  const [showFilters, setShowFilters] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [toast, setToast] = useState('')

  const visibleBuddies = useMemo(() => buddies.filter((buddy) => {
    const matchesArea = area === 'All areas' || buddy.area === area
    const matchesQuery = `${buddy.name} ${buddy.area} ${buddy.interests.join(' ')}`.toLowerCase().includes(query.toLowerCase())
    return matchesArea && matchesQuery && !passed.includes(buddy.id)
  }), [area, query, passed])

  const notify = (message: string) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const like = (id: string) => {
    setLiked((current) => current.includes(id) ? current : [...current, id])
    notify('Interest sent. If they like you too, it’s a match!')
  }

  const pass = (id: string) => setPassed((current) => [...current, id])

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
          <NavButton active={tab === 'meetups'} onClick={() => setTab('meetups')} icon={<Users size={19} />} label="Meetups" count="8" />
          <NavButton active={tab === 'places'} onClick={() => setTab('places')} icon={<MapPin size={19} />} label="Places & events" />
          <NavButton active={tab === 'messages'} onClick={() => setTab('messages')} icon={<MessageCircle size={19} />} label="Messages" count="2" />
        </nav>
        <div className="sidebar-card">
          <div className="sidebar-card-icon"><Sparkles size={17} /></div>
          <strong>Make your night count.</strong>
          <p>Meet people who are up for the same kind of plans.</p>
          <button className="text-button" onClick={() => notify('Premium features are coming soon.')}>Explore premium <ArrowRight size={14} /></button>
        </div>
        <div className="sidebar-bottom">
          <div className="safety-note"><ShieldCheck size={16} /><span>18+ community<br /><small>Meet kindly. Stay safe.</small></span></div>
          <button className="profile-mini" onClick={() => window.location.assign('/login')}>
            <span className="avatar avatar-small">K</span><span><b>Your profile</b><small>Complete your profile</small></span><ChevronDown size={15} />
          </button>
        </div>
      </aside>

      <main className="main-area" id="top">
        <header className="topbar">
          <button className="mobile-brand" onClick={() => setTab('discover')}><span className="brand-mark"><Wine size={18} /></span> drinkingbuddies</button>
          <div className="location-pill"><MapPin size={15} /><span>Nairobi, Kenya</span><ChevronDown size={14} /></div>
          <div className="top-actions"><button className="signin-link" onClick={() => window.location.assign('/login')}>Sign in</button><button className="icon-button" aria-label="Notifications" onClick={() => notify('You’re all caught up.')}><Bell size={19} /><i /></button><button className="top-avatar" onClick={() => window.location.assign('/login')}>K</button></div>
        </header>

        <div className="content-wrap">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="live-dot" /> YOUR CITY, YOUR PEOPLE</div><h1>Good company is <em>closer</em> than you think.</h1><p className="welcome-copy">Find your people, make a plan, and see where the night takes you.</p></div>
            <button className="primary-button create-button" onClick={() => setShowCreate(true)}><Plus size={18} /> Create a meetup</button>
          </section>

          <section className="quick-stats">
            <div className="stat"><span className="stat-icon"><Users size={17} /></span><span><b>24</b><small>people nearby</small></span></div>
            <div className="stat"><span className="stat-icon"><CalendarDays size={17} /></span><span><b>8</b><small>meetups this week</small></span></div>
            <div className="stat"><span className="stat-icon"><MapPin size={17} /></span><span><b>12</b><small>places to explore</small></span></div>
            <div className="stat stat-note"><span className="online-avatars"><i>M</i><i>B</i><i>N</i></span><span><b>People are making plans</b><small>See what’s happening around you</small></span></div>
          </section>

          <div className="section-tabs" role="tablist" aria-label="Discovery sections">
            <button role="tab" aria-selected={tab === 'discover'} className={tab === 'discover' ? 'selected' : ''} onClick={() => setTab('discover')}>People <span>24</span></button>
            <button role="tab" aria-selected={tab === 'meetups'} className={tab === 'meetups' ? 'selected' : ''} onClick={() => setTab('meetups')}>Meetups <span>8</span></button>
            <button role="tab" aria-selected={tab === 'places'} className={tab === 'places' ? 'selected' : ''} onClick={() => setTab('places')}>Places & events</button>
          </div>

          {tab === 'discover' && <>
            <section className="tonight-banner">
              <div className="tonight-copy"><span className="banner-kicker">THE CITY IS YOURS</span><h2>Who's up for<br />tonight?</h2><p>Find people who are free, nearby and in the mood to connect.</p><button className="banner-button" onClick={() => setTab('meetups')}>Explore tonight’s meetups <ArrowRight size={15} /></button></div>
              <div className="banner-image"><div className="banner-image-overlay" /><div className="floating-tag"><span className="live-dot" /> 12 people looking tonight</div></div>
              <div className="banner-orb orb-one" /><div className="banner-orb orb-two" />
            </section>
            <div className="section-heading"><div><div className="eyebrow">YOUR NEXT CONNECTION</div><h2>People near you</h2><p>Say hello to someone new. Match first, then chat.</p></div><button className="filter-button" onClick={() => setShowFilters(!showFilters)}><SlidersHorizontal size={16} /> Filters</button></div>
            {showFilters && <div className="filter-panel"><label>Area<select value={area} onChange={(e) => setArea(e.target.value)}><option>All areas</option><option>Westlands</option><option>Kilimani</option><option>Lavington</option></select></label><label>Search<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, area or interest" /></label><button className="clear-button" onClick={() => { setArea('All areas'); setQuery('') }}>Clear</button></div>}
            <div className="people-grid">{visibleBuddies.map((buddy) => <article className="person-card" key={buddy.id}><div className="person-photo" style={{ backgroundImage: `url(${buddy.image})` }}><span className="availability"><i /> {buddy.available}</span><button className={`heart-button ${liked.includes(buddy.id) ? 'hearted' : ''}`} aria-label={`Like ${buddy.name}`} onClick={() => like(buddy.id)}><Heart size={18} fill={liked.includes(buddy.id) ? 'currentColor' : 'none'} /></button><div className="photo-gradient" /><div className="person-title"><h3>{buddy.name}, {buddy.age}</h3><span><MapPin size={13} /> {buddy.area} · {buddy.distance}</span></div></div><div className="person-info"><span className="intent-pill">{buddy.intent}</span><p>{buddy.bio}</p><div className="interest-tags">{buddy.interests.map((interest) => <span key={interest}>{interest}</span>)}</div><div className="card-actions"><button className="pass-button" onClick={() => pass(buddy.id)}><X size={16} /> Pass</button><button className="interest-button" onClick={() => like(buddy.id)}><Heart size={15} /> {liked.includes(buddy.id) ? 'Interested' : 'Say hello'}</button></div></div></article>)}</div>
            {visibleBuddies.length === 0 && <div className="empty-state"><Search size={24} /><b>No profiles found</b><span>Try another area or clear your search.</span></div>}
            <div className="privacy-strip"><ShieldCheck size={18} /><span><b>Your location stays yours.</b> People see only the area or meetup location you choose to share.</span><button onClick={() => notify('Location privacy settings will be available in your profile.')}>Privacy settings</button></div>
          </>}

          {tab === 'meetups' && <><div className="section-heading"><div><div className="eyebrow">MAKE A PLAN</div><h2>Meetups around you</h2><p>Join a group or start something of your own.</p></div><button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={17} /> New meetup</button></div><div className="meetup-grid">{meetups.map((meetup) => <article className="meetup-card" key={meetup.id}><div className="meetup-image" style={{ backgroundImage: `url(${meetup.image})` }}><span className="meetup-area"><MapPin size={13} /> {meetup.area}</span></div><div className="meetup-content"><span className="eyebrow">COMMUNITY MEETUP</span><h3>{meetup.title}</h3><p>{meetup.detail}</p><div className="meetup-meta"><span><CalendarDays size={14} /> {meetup.time}</span><span><Users size={14} /> {meetup.people}</span></div><div className="meetup-footer"><span>{meetup.spots}</span><button onClick={() => notify('Sign in to request to join this meetup.')}>View meetup <ArrowRight size={14} /></button></div></div></article>)}</div></>}

          {tab === 'places' && <><div className="section-heading"><div><div className="eyebrow">EXPLORE YOUR CITY</div><h2>Places worth knowing</h2><p>Discover local venues and community events.</p></div><button className="filter-button" onClick={() => notify('Venue submissions will open soon.')}>List your venue <ArrowRight size={15} /></button></div><div className="venue-grid">{venues.map((venue) => <article className="venue-card" key={venue.name}><div className="venue-image" style={{ backgroundImage: `url(${venue.image})` }} /><div className="venue-content"><span>{venue.type}</span><h3>{venue.name}</h3><p><MapPin size={14} /> {venue.area}, Nairobi</p><button onClick={() => notify('Venue details will be available soon.')}>Explore venue <ArrowRight size={14} /></button></div></article>)}</div><div className="venue-cta"><div><span className="eyebrow">FOR LOCAL BUSINESSES</span><h3>Bring your venue to the community.</h3><p>Get discovered by people looking for somewhere to meet.</p></div><button className="primary-button" onClick={() => notify('Venue registration is coming soon.')}>Register your venue <ArrowRight size={15} /></button></div></>}

          {tab === 'messages' && <div className="empty-state messages-empty"><MessageCircle size={28} /><h2>Your conversations start with a match.</h2><p>When you and another person both show interest, you can start chatting here.</p><button className="primary-button" onClick={() => setTab('discover')}>Discover people <ArrowRight size={15} /></button></div>}

          <footer className="footer"><span>© 2026 Drinking Buddies</span><span>18+ only · Meet kindly · Stay safe</span><span>Kenya first. Everywhere next.</span></footer>
        </div>
      </main>

      {showCreate && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowCreate(false) }}><div className="modal"><div className="modal-head"><div><span className="eyebrow">BRING PEOPLE TOGETHER</span><h2>Create a meetup</h2></div><button className="icon-button" onClick={() => setShowCreate(false)}><X size={19} /></button></div><form onSubmit={(e) => { e.preventDefault(); setShowCreate(false); notify('Meetup draft saved. Sign in to publish it.') }}><label>Meetup name<input required placeholder="e.g. Friday after-work unwind" /></label><label>Area or venue<input required placeholder="e.g. Westlands, Nairobi" /></label><div className="form-row"><label>Date<input type="date" required /></label><label>Time<input type="time" required /></label></div><label>Who can join<select><option>Anyone can request to join</option><option>Approval required</option></select></label><label>What’s the plan?<textarea rows={3} placeholder="Tell people what kind of meetup you're planning..." /></label><button className="primary-button modal-submit" type="submit">Continue <ArrowRight size={16} /></button><p className="form-note"><ShieldCheck size={14} /> Meetups should be public, consensual and welcoming. Never share someone's private location.</p></form></div></div>}
      {toast && <div className="toast"><Check size={16} /> {toast}</div>}
      <div className="mobile-nav"><button onClick={() => setTab('discover')} className={tab === 'discover' ? 'active' : ''}><Compass size={19} /><span>Discover</span></button><button onClick={() => setTab('meetups')} className={tab === 'meetups' ? 'active' : ''}><Users size={19} /><span>Meetups</span></button><button onClick={() => setTab('places')} className={tab === 'places' ? 'active' : ''}><MapPin size={19} /><span>Places</span></button><button onClick={() => setTab('messages')} className={tab === 'messages' ? 'active' : ''}><MessageCircle size={19} /><span>Chats</span></button></div>
    </div>
  )
}

function NavButton({ active, onClick, icon, label, count }: { active: boolean; onClick: () => void; icon: ReactNode; label: string; count?: string }) {
  return <button className={`nav-button ${active ? 'active' : ''}`} onClick={onClick}>{icon}<span>{label}</span>{count && <i>{count}</i>}</button>
}

export default App
