import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { payments, users, venues, venuePackages, venueSubscriptions } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'
import { initiateStkPush, normalizeMpesaPhone } from '../lib/daraja'
const schema = z.object({ venueId: z.string().uuid(), packageId: z.string().uuid(), phone: z.string().min(9).max(20) }).strict()
export const Route = createFileRoute('/api/venue/subscription/checkout')({ server: { handlers: { POST: async ({ request }) => {
 try {
  const userId = await getAuthenticatedUserId(request)
  if (!userId) return jsonError('Sign in to manage venue membership.', 401, 'UNAUTHENTICATED')
  let raw: unknown
  try { raw = await request.json() } catch { return jsonError('Invalid JSON.', 400, 'INVALID_JSON') }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) return jsonError('Choose a venue and package.', 400, 'INVALID_PACKAGE')
  const db = getDb(), phone = normalizeMpesaPhone(parsed.data.phone)
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (!user?.phoneVerifiedAt || !user.phoneE164 || normalizeMpesaPhone(user.phoneE164) !== phone) return jsonError('Use the M-PESA number verified on your account.', 403, 'VERIFIED_MPESA_NUMBER_REQUIRED')
  const [venue] = await db.select().from(venues).where(and(eq(venues.id, parsed.data.venueId), eq(venues.ownerId, userId))).limit(1)
  if (!venue) return jsonError('Venue not found or not owned by your account.', 404, 'VENUE_NOT_FOUND')
  if (venue.approvalStatus !== 'approved' || !venue.isPublished) return jsonError('Your venue must be approved and published before purchasing a package.', 409, 'VENUE_NOT_APPROVED')
  const [pkg] = await db.select().from(venuePackages).where(and(eq(venuePackages.id, parsed.data.packageId), eq(venuePackages.isActive, true))).limit(1)
  if (!pkg || pkg.priceMinor <= 0 || pkg.currency !== 'KES') return jsonError('This package is not available for M-PESA checkout.', 409, 'PACKAGE_UNAVAILABLE')
  const now = new Date()
  let [sub] = await db.select().from(venueSubscriptions).where(eq(venueSubscriptions.venueId, venue.id)).limit(1)
  if (sub?.status === 'active' && sub.currentPeriodEnd.getTime() > now.getTime() + 7 * 86400000) return jsonError('This package is active. Renewal opens during the final 7 days.', 409, 'MEMBERSHIP_ACTIVE')
  if (!sub) {
   const end = new Date(now)
   if (pkg.billingInterval === 'year') end.setFullYear(end.getFullYear() + 1); else end.setMonth(end.getMonth() + 1)
   ;[sub] = await db.insert(venueSubscriptions).values({ venueId: venue.id, packageId: pkg.id, status: 'trialing', lockedPriceMinor: pkg.priceMinor, currency: pkg.currency, billingInterval: pkg.billingInterval, currentPeriodStart: now, currentPeriodEnd: end }).returning()
  } else {
   await db.update(venueSubscriptions).set({ packageId: pkg.id, lockedPriceMinor: pkg.priceMinor, currency: pkg.currency, billingInterval: pkg.billingInterval, updatedAt: now }).where(eq(venueSubscriptions.id, sub.id))
  }
  const [pending] = await db.select().from(payments).where(and(eq(payments.subscriptionId, sub.id), eq(payments.provider, 'daraja'), eq(payments.status, 'pending'))).limit(1)
  if (pending && typeof pending.metadata.checkoutRequestId === 'string') return jsonOk({ paymentId: pending.id, status: 'pending', checkoutRequestId: pending.metadata.checkoutRequestId, reused: true })
  const [payment] = await db.insert(payments).values({ userId, venueId: venue.id, subscriptionId: sub.id, provider: 'daraja', amountMinor: pkg.priceMinor, currency: pkg.currency, status: 'pending', idempotencyKey: 'venue-membership:' + sub.id + ':' + crypto.randomUUID(), metadata: { purpose: 'venue_subscription', phone, billingInterval: pkg.billingInterval, packageId: pkg.id } }).returning()
  if (!payment) return jsonError('Could not create payment.', 500, 'PAYMENT_CREATE_FAILED')
  const stk = await initiateStkPush({ phone, amountMinor: pkg.priceMinor, accountReference: 'DBVENUE' + sub.id.replace(/-/g, '').slice(0, 8), description: 'Venue package' })
  await db.update(payments).set({ providerReference: stk.checkoutRequestId, metadata: { purpose: 'venue_subscription', phone, billingInterval: pkg.billingInterval, packageId: pkg.id, checkoutRequestId: stk.checkoutRequestId, merchantRequestId: stk.merchantRequestId }, updatedAt: new Date() }).where(eq(payments.id, payment.id))
  return jsonOk({ paymentId: payment.id, status: 'pending', customerMessage: stk.customerMessage }, 201)
 } catch (error) {
  console.error('Venue package checkout failed', error)
  return jsonError('We could not start venue package checkout.', 502, 'MEMBERSHIP_CHECKOUT_FAILED')
 }
} } } })
