import { useEffect, useState } from 'react'
import { Bell, Heart, MessageCircle, Camera, RefreshCw, X } from 'lucide-react'

type ActivityData = {
  likes: { id: string; displayName: string; createdAt: string }[]
  tags: { id: string; mediaId: string; displayName: string; createdAt: string }[]
  messages: { id: string; conversationId: string; body: string; senderName: string; meetupTitle?: string; createdAt: string }[]
}

export function ActivityCenter({ onClose, onOpenDiscover, onOpenMessages, onOpenMemories }: {
  onClose: () => void
  onOpenDiscover: () => void
  onOpenMessages: () => void
  onOpenMemories: () => void
}) {
  const [activity, setActivity] = useState<ActivityData>({ likes: [], tags: [], messages: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/activity')
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not load activity.')
      setActivity({ likes: result.data?.likes ?? [], tags: result.data?.tags ?? [], messages: result.data?.messages ?? [] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load activity.')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void load() }, [])
  const total = activity.likes.length + activity.tags.length + activity.messages.length
  return <div className="account-menu activity-menu" role="dialog" aria-label="Your activity">
    <div className="activity-menu-head"><div><b><Bell size={15}/> Your activity</b><small>Likes, conversations and memory tags</small></div><div className="flex gap-1"><button className="icon-button" aria-label="Refresh activity" onClick={() => void load()}><RefreshCw size={14}/></button><button className="icon-button" aria-label="Close activity" onClick={onClose}><X size={15}/></button></div></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    {loading ? <p className="chat-hint">Loading activity…</p> : total === 0 ? <div className="chat-list-empty"><Bell size={20}/><b>You’re all caught up</b><span>New likes, messages and tag requests will appear here.</span></div> : <div className="activity-items">
      {activity.likes.map((item) => <button key={'like-'+item.id} onClick={() => { onClose(); onOpenDiscover() }}><span className="activity-icon"><Heart size={16}/></span><span><b>{item.displayName}</b><small>Liked your profile · {new Date(item.createdAt).toLocaleString()}</small></span></button>)}
      {activity.messages.map((item) => <button key={'message-'+item.id} onClick={() => { onClose(); onOpenMessages() }}><span className="activity-icon"><MessageCircle size={16}/></span><span><b>{item.senderName}{item.meetupTitle ? ' · '+item.meetupTitle : ''}</b><small>{item.body.slice(0,90)} · {new Date(item.createdAt).toLocaleString()}</small></span></button>)}
      {activity.tags.map((item) => <button key={'tag-'+item.id} onClick={() => { onClose(); onOpenMemories() }}><span className="activity-icon"><Camera size={16}/></span><span><b>{item.displayName}</b><small>Requested to tag you in a memory · {new Date(item.createdAt).toLocaleString()}</small></span></button>)}
    </div>}
    <small className="activity-footnote">This feed shows recent activity. Tag requests still need your approval in Party Memories.</small>
  </div>
}
