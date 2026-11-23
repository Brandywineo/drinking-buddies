import { useState, type FormEvent } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { ArrowLeft, CheckCircle2, ShieldCheck, Wine } from 'lucide-react'

export const Route = createFileRoute('/register')({ component: RegisterPage })

function RegisterPage() {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formElement = event.currentTarget
    setBusy(true); setError(''); setMessage('')
    const form = new FormData(event.currentTarget)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: form.get('displayName'),
          email: form.get('email'),
          password: form.get('password'),
          accepted18: form.get('accepted18') === 'on',
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error?.message ?? 'Registration failed.')
      if (result.data?.authenticated) {
        window.location.assign('/')
        return
      }
      setMessage('Your account is created. Check your inbox for the verification email before signing in.')
      formElement.reset()
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
        <span className="eyebrow">YOUR PEOPLE ARE OUT THERE</span>
        <h1>Create your account</h1>
        <p className="auth-copy">Meet new people, make plans and find your next good conversation.</p>
        {message && <div className="auth-success"><CheckCircle2 size={18} />{message}</div>}
        {error && <div className="auth-error">{error}</div>}
        <form className="auth-form" onSubmit={submit}>
          <label>Display name<input name="displayName" autoComplete="nickname" minLength={2} maxLength={48} required placeholder="How should people know you?" /></label>
          <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="you@example.com" /></label>
          <label>Password<input name="password" type="password" autoComplete="new-password" minLength={12} maxLength={72} required placeholder="At least 12 characters" /><small>Use at least 12 characters.</small></label>
          <label className="age-check"><input name="accepted18" type="checkbox" required /><span>I confirm that I am 18 years or older and agree to the community terms.</span></label>
          <button className="primary-button auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        </form>
        <div className="auth-divider"><span>MORE SIGN-IN OPTIONS</span></div>
        <button className="auth-provider" disabled title="Google sign-in will be enabled after OAuth credentials are configured">Continue with Google · coming soon</button>
        <button className="auth-provider" disabled title="Phone verification will be enabled after an SMS provider is configured">Continue with phone · coming soon</button>
        <p className="auth-foot">Already have an account? <Link to="/login">Sign in</Link></p>
        <div className="auth-safety"><ShieldCheck size={15} /> 18+ only. Share your location on your terms.</div>
      </div>
    </main>
  )
}