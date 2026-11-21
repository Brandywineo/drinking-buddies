import { useEffect, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, LoaderCircle, ShieldAlert, Wine } from 'lucide-react'

export const Route = createFileRoute('/verify-email')({ component: VerifyEmailPage })

function VerifyEmailPage() {
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('Verifying your email address…')

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token')
    if (!token) {
      setState('error'); setMessage('This verification link is missing its token.')
      return
    }
    fetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message ?? 'Verification failed.')
        setState('success'); setMessage('Your email is verified. You can now sign in.')
      })
      .catch((error: unknown) => {
        setState('error')
        setMessage(error instanceof Error ? error.message : 'Verification failed.')
      })
  }, [])

  return (
    <main className="auth-page">
      <div className="auth-card verify-card">
        <div className="auth-brand"><span className="brand-mark"><Wine size={20} /></span><b>drinking<span>buddies</span></b></div>
        {state === 'loading' && <LoaderCircle className="verify-icon spin" size={32} />}
        {state === 'success' && <CheckCircle2 className="verify-icon" size={32} />}
        {state === 'error' && <ShieldAlert className="verify-icon error-icon" size={32} />}
        <h1>{state === 'success' ? 'You’re verified.' : state === 'error' ? 'Link unavailable.' : 'One quick step.'}</h1>
        <p className="auth-copy">{message}</p>
        {state === 'success' && <Link className="primary-button auth-submit auth-link-button" to="/login">Continue to sign in</Link>}
        {state === 'error' && <Link className="auth-foot-link" to="/register">Back to registration</Link>}
      </div>
    </main>
  )
}