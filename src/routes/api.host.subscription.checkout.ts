import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { hostSubscriptions, payments, platformSettings, users } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'
import { initiateStkPush, normalizeMpesaPhone } from '../lib/daraja'

const bodySchema = z.object({ plan: z.enum(['premium_monthly', 'premium_annual']), phone: z.string().min(9).max(20) }).strict()

export const Route = createFileRoute('/api/host/subscription/checkout')({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to manage host membership.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = bodySchema.safeParse(raw)
        if (!parsed.success) return jsonError('Choose a valid host membership plan.', 400, 'INVALID_PLAN')
        const phone = normalizeMpesaPhone(parsed.data.phone)
        const db = getDb()
        const [user] = await db.select({ phoneE164: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt })
          .from(users).where(eq(users.id, userId)).limit(1)
        if (!user?.phoneVerifiedAt || !user.phoneE164 || normalizeMpesaPhone(user.phoneE164) !== phone) {
          return jsonError('Use the M-PESA number verified on your account.', 403, 'VERIFIED_MPESA_NUMBER_REQUIRED')
        }
        const [subscription] = await db.select().from(hostSubscriptions).where(eq(hostSubscriptions.userId, userId)).limit(1)
        if (!subscription) return jsonError('Publish a paid meetup to start your one-time host trial before purchasing membership.', 409, 'HOST_SUBSCRIPTION_NOT_STARTED')
        const now = new Date()
        if (subscription.status === 'active' && subscription.currentPeriodEnd.getTime() > now.getTime() + 7 * 24 * 60 * 60 * 1000) {
          return jsonError('Your host membership is already active. Renewal checkout opens during the final 7 days.', 409, 'MEMBERSHIP_ALREADY_ACTIVE')
        }
        const [setting] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, 'host_membership')).limit(1)
        const config = setting?.value && typeof setting.value === 'object' ? setting.value as Record<string, unknown> : {}
        const interval = parsed.data.plan === 'premium_annual' ? 'year' : 'month'
        const amountMinor = Number(interval === 'year' ? config.annualPriceMinor : config.monthlyPriceMinor)
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || amountMinor % 100 !== 0) {
          return jsonError('This membership price is not configured for M-PESA checkout.', 409, 'MEMBERSHIP_PRICE_NOT_CONFIGURED')
        }
        const [existing] = await db.select().from(payments).where(and(
          eq(payments.hostSubscriptionId, subscription.id), eq(payments.provider, 'daraja'), eq(payments.status, 'pending'),
        )).limit(1)
        if (existing && typeof existing.metadata.checkoutRequestId === 'string') {
          return jsonOk({ paymentId: existing.id, status: existing.status, checkoutRequestId: existing.metadata.checkoutRequestId, reused: true })
        }
        const [payment] = await db.insert(payments).values({
          userId, hostSubscriptionId: subscription.id, provider: 'daraja', amountMinor, currency: 'KES',
          status: 'pending', idempotencyKey: `host-subscription:${subscription.id}:${crypto.randomUUID()}`,
          metadata: { purpose: 'host_subscription', phone, billingInterval: interval, plan: parsed.data.plan },
        }).returning()
        if (!payment) return jsonError('Could not create membership payment.', 500, 'PAYMENT_CREATE_FAILED')
        try {
          const stk = await initiateStkPush({
            phone, amountMinor, accountReference: `HOST${subscription.id.replace(/-/g, '').slice(0, 8)}`,
            description: 'Host membership',
          })
          await db.update(payments).set({
            providerReference: stk.checkoutRequestId,
            metadata: { purpose: 'host_subscription', phone, billingInterval: interval, plan: parsed.data.plan, checkoutRequestId: stk.checkoutRequestId, merchantRequestId: stk.merchantRequestId, initiatedAt: new Date().toISOString() },
            updatedAt: new Date(),
          }).where(eq(payments.id, payment.id))
          return jsonOk({ paymentId: payment.id, status: 'pending', checkoutRequestId: stk.checkoutRequestId, customerMessage: stk.customerMessage }, 201)
        } catch (error) {
          await db.update(payments).set({ status: 'failed', metadata: { ...payment.metadata, initiationError: error instanceof Error ? error.message.slice(0, 300) : 'Daraja request failed' }, updatedAt: new Date() }).where(eq(payments.id, payment.id))
          throw error
        }
      } catch (error) {
        console.error('Host membership checkout failed', error)
        return jsonError('We could not start membership checkout.', 502, 'MEMBERSHIP_CHECKOUT_FAILED')
      }
    },
  } },
})
