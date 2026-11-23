import { timingSafeEqual } from 'node:crypto'
import { getMpesaSecrets } from './mpesa-secrets'

/** Daraja callbacks have no provider signature; require a high-entropy shared URL token. */
export async function withDarajaCallbackToken(value: string, suppliedToken?: string) {
  const token = suppliedToken ?? (await getMpesaSecrets()).callbackToken
  if (!token || token.length < 32) throw new Error('Configure a callback security token in Admin → M-Pesa settings')
  const url = new URL(value)
  url.searchParams.set('token', token)
  return url.toString()
}

export async function isDarajaCallbackAuthorized(request: Request) {
  const expected = (await getMpesaSecrets()).callbackToken
  const supplied = new URL(request.url).searchParams.get('token') ?? ''
  if (!expected || expected.length < 32 || supplied.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))
}
