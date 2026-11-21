import { useState, type FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, ShieldCheck, Wine } from 'lucide-react'

export const Route = createFileRoute('/login')({ component: LoginPage })

function LoginPage() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Sign in failed.')
      window.location.assign('/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-back"><ArrowLeft size={15} /> Back to discovery</Link>
        <div className="auth-brand"><span className="brand-mark"><Wine size={20} /></span><b>drinking<span>buddies</span></b></div>
        <span className="eyebrow">WELCOME BACK</span>
        <h1>Good to see you.</h1>
        <p className="auth-copy">Sign in to pick up where your next connection begins.</p>
        {error && <div className="auth-error">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required placeholder="Your password" /></label>
          <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="auth-foot">New to Drinking Buddies? <Link to="/register">Create an account</Link></p>
        <div className="auth-safety"><ShieldCheck size={15} /> 18+ community. Meet kindly. Stay safe.</div>
      </div>
    </main>
  )
}