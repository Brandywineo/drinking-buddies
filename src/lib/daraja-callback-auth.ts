import { timingSafeEqual } from 'node:crypto'

/** Daraja callbacks have no provider signature; require a high-entropy shared URL token. */
export function withDarajaCallbackToken(value: string) {
  const token = process.env.MPESA_CALLBACK_TOKEN?.trim()
  if (!token || token.length < 32) throw new Error('MPESA_CALLBACK_TOKEN must contain at least 32 characters')
  const url = new URL(value)
  url.searchParams.set('token', token)
  return url.toString()
}

export function isDarajaCallbackAuthorized(request: Request) {
  const expected = process.env.MPESA_CALLBACK_TOKEN?.trim()
  const supplied = new URL(request.url).searchParams.get('token') ?? ''
  if (!expected || expected.length < 32 || supplied.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}
