import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

export const Route = createFileRoute('/admin/users')({ component: AdminUsers })

type User = {
  id: string
  email: string
  displayName: string | null
  status: string
  emailVerifiedAt: string | null
  createdAt: string
}

function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users', { credentials: 'include' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not load users.')
      setUsers(result.data.users)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load users.')
    }
  }, [])

  useEffect(() => { void load() }, [load])

  async function updateUser(user: User, action: 'verify' | 'toggle-status') {
    setBusy(user.id)
    setError('')
    try {
      const body = action === 'verify'
        ? { userId: user.id, markEmailVerified: true }
        : { userId: user.id, status: user.status === 'suspended' ? 'active' : 'suspended' }
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Could not update user.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update user.')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 px-5 py-10 text-[var(--text-primary,#f5f5f5)]">
      <Link to="/admin" className="text-sm opacity-65">← Admin dashboard</Link>
      <header>
        <h1 className="text-3xl font-semibold">User management</h1>
        <p className="mt-2 text-sm opacity-65">Latest 200 accounts. Suspend or reactivate accounts when necessary.</p>
      </header>
      {error && <div role="alert" className="rounded-xl border border-red-400/40 bg-red-400/10 p-3 text-sm">{error}</div>}
      <section className="grid gap-3">
        {users.map((user) => (
          <article key={user.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/10 p-4">
            <div>
              <b>{user.displayName ?? 'Unnamed member'}</b>
              <p className="text-sm opacity-65">{user.email}</p>
              <p className="mt-1 text-xs opacity-50">
                Joined {new Date(user.createdAt).toLocaleDateString()} · {user.emailVerifiedAt ? 'Email verified' : 'Email not verified'} · <span className="capitalize">{user.status.replace('_', ' ')}</span>
              </p>
            </div>
            {user.status !== 'deleted' && (
              <div className="flex flex-wrap gap-2">
                {!user.emailVerifiedAt && (
                  <button disabled={busy === user.id} onClick={() => void updateUser(user, 'verify')} className="rounded-lg border border-white/20 px-3 py-2 text-sm">
                    Mark email verified
                  </button>
                )}
                <button disabled={busy === user.id} onClick={() => void updateUser(user, 'toggle-status')} className="rounded-lg border border-white/20 px-3 py-2 text-sm">
                  {busy === user.id ? 'Saving…' : user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                </button>
              </div>
            )}
          </article>
        ))}
        {users.length === 0 && <p className="rounded-xl border border-white/10 p-5 text-sm opacity-60">No accounts found.</p>}
      </section>
    </main>
  )
}
