import { useEffect, useState, type FormEvent } from 'react'
import { ArrowLeft, MessageCircle, Send, RefreshCw } from 'lucide-react'

type Conversation = {
  id: string
  kind: 'match' | 'meetup'
  peer?: { id: string; displayName: string }
  meetup?: { id: string; title: string; area: string }
  lastMessage?: { body: string; createdAt: string; senderId: string } | null
  lastActivityAt?: string
}
type ChatMessage = { id: string; senderId: string; body: string; createdAt: string }

export function Messaging({ currentUserId }: { currentUserId: string }) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  async function loadConversations() {
    const response = await fetch('/api/conversations')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'Could not load conversations.')
    const items = (result.data?.conversations ?? []) as Conversation[]
    setConversations(items)
    setActiveId((current) => current && items.some((item) => item.id === current) ? current : (items[0]?.id ?? ''))
  }

  async function loadMessages(id: string) {
    const response = await fetch('/api/conversations/' + id + '/messages')
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message ?? 'Could not load messages.')
    setMessages((result.data?.messages ?? []) as ChatMessage[])
  }

  useEffect(() => {
    let live = true
    async function refresh() {
      try {
        await loadConversations()
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : 'Could not load conversations.')
      } finally {
        if (live) setLoading(false)
      }
    }
    void refresh()
    const timer = window.setInterval(() => { if (live) void refresh() }, 10000)
    return () => { live = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => {
    if (!activeId) { setMessages([]); return }
    let live = true
    const refresh = async () => {
      try {
        const response = await fetch('/api/conversations/' + activeId + '/messages')
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message ?? 'Could not load messages.')
        if (live) setMessages((result.data?.messages ?? []) as ChatMessage[])
      } catch (cause) {
        if (live) setError(cause instanceof Error ? cause.message : 'Could not load messages.')
      }
    }
    void refresh()
    const timer = window.setInterval(() => { if (live) void refresh() }, 4000)
    return () => { live = false; window.clearInterval(timer) }
  }, [activeId])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!activeId || !draft.trim() || sending) return
    setSending(true)
    setError('')
    try {
      const response = await fetch('/api/conversations/' + activeId + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft.trim() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not send message.')
      setDraft('')
      await loadMessages(activeId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send message.')
    } finally {
      setSending(false)
    }
  }

  return <section className="messages-workspace">
    <div className="section-heading"><div><div className="eyebrow">YOUR CONNECTIONS</div><h2>Messages</h2><p>Direct chats unlock after a mutual match. New messages refresh automatically.</p></div><button className="filter-button" onClick={() => { void loadConversations().catch((cause) => setError(cause.message)) }}><RefreshCw size={15} /> Refresh</button></div>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <div className="chat-layout">
      <aside className={'chat-list ' + (showChat ? 'mobile-hidden' : '')}>
        {conversations.map((item) => <button key={item.id} className={'chat-list-item ' + (activeId === item.id ? 'selected' : '')} onClick={() => { setActiveId(item.id); setShowChat(true) }}>
          <span className="avatar">{(item.peer?.displayName ?? item.meetup?.title ?? 'M').slice(0, 1).toUpperCase()}</span>
          <span className="chat-list-copy"><b>{item.peer?.displayName ?? item.meetup?.title ?? 'Meetup chat'}</b><small>{item.lastMessage?.body ?? (item.kind === 'match' ? 'Matched connection — say hello' : item.meetup?.area ?? 'Group meetup')}</small></span>{item.lastActivityAt && <time className="chat-list-time">{new Date(item.lastActivityAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>}
        </button>)}
        {!loading && conversations.length === 0 && <div className="chat-list-empty"><MessageCircle size={22} /><b>No conversations yet</b><span>When someone you liked likes you back, your private chat will appear here.</span></div>}
        {loading && <p className="chat-hint">Loading conversations…</p>}
      </aside>
      <div className={'chat-panel ' + (showChat ? 'mobile-open' : '')}>
        {activeId ? <>
          <div className="chat-panel-head"><button className="chat-back" onClick={() => setShowChat(false)} aria-label="Back to conversations"><ArrowLeft size={18} /></button><div><b>{conversations.find((item) => item.id === activeId)?.peer?.displayName ?? conversations.find((item) => item.id === activeId)?.meetup?.title ?? 'Conversation'}</b><small>Meet kindly. Stay safe.</small></div></div>
          <div className="chat-history">
            {messages.length === 0 ? <p className="chat-hint">No messages yet. Say hello!</p> : messages.map((message) => <div key={message.id} className={'chat-bubble ' + (message.senderId === currentUserId ? 'mine' : '')}><p>{message.body}</p><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>)}
          </div>
          <form className="chat-compose" onSubmit={send}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder="Write a message…" aria-label="Message" /><button className="primary-button" type="submit" disabled={sending || !draft.trim()}><Send size={15} /> {sending ? 'Sending…' : 'Send'}</button></form>
        </> : <div className="chat-hint">Choose a conversation to start chatting.</div>}
      </div>
    </div>
  </section>
}
