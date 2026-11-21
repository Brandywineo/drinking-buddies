import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import {
  hostSubscriptions, hostWalletAccounts, hostWalletTransactions, meetupBookings, paymentWebhookEvents, payments,
} from '../db/schema'
import { queryStkPush } from '../lib/daraja'

type CallbackItem = { Name?: string; Value?: string | number }
type StkCallback = {
  CheckoutRequestID?: string
  MerchantRequestID?: string
  ResultCode?: number
  ResultDesc?: string
  CallbackMetadata?: { Item?: CallbackItem[] }
}

function metadataValue(items: CallbackItem[], name: string) {
  return items.find((item) => item.Name === name)?.Value
}

export const Route = createFileRoute('/api/webhooks/daraja')({
  server: { handlers: {
    POST: async ({ request }) => {
      let payload: unknown
      try { payload = await request.json() } catch { return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' }) }
      const callback = (payload as { Body?: { stkCallback?: StkCallback } })?.Body?.stkCallback
      const checkoutId = callback?.CheckoutRequestID
      if (!checkoutId || !callback) return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      const db = getDb()
      const eventId = `stk:${checkoutId}:${callback.ResultCode ?? 'unknown'}`
      const [insertedEvent] = await db.insert(paymentWebhookEvents).values({
        provider: 'daraja', providerEventId: eventId, eventType: 'stk_callback',
        payload: payload as Record<string, unknown>,
      }).onConflictDoNothing().returning()
      const [event] = insertedEvent ? [insertedEvent] : await db.select().from(paymentWebhookEvents).where(and(
        eq(paymentWebhookEvents.provider, 'daraja'), eq(paymentWebhookEvents.providerEventId, eventId),
      )).limit(1)
      if (!event || event.processedAt) return Response.json({ ResultCode: 0, ResultDesc: 'Duplicate callback accepted' })

      try {
        const [payment] = await db.select().from(payments).where(and(
          eq(payments.provider, 'daraja'), eq(payments.providerReference, checkoutId),
        )).limit(1)
        if (!payment || payment.status !== 'pending' || (!payment.bookingId && !payment.hostSubscriptionId)) {
          await db.update(paymentWebhookEvents).set({ processedAt: new Date(), processingError: payment ? 'Payment is not pending or has no supported owner' : 'Unknown checkout request' }).where(eq(paymentWebhookEvents.id, event.id))
          return Response.json({ ResultCode: 0, ResultDesc: 'Accepted for reconciliation' })
        }
        if (Number(callback.ResultCode) !== 0) {
          await db.update(payments).set({ status: 'failed', metadata: { ...payment.metadata, resultCode: callback.ResultCode, resultDescription: callback.ResultDesc }, updatedAt: new Date() }).where(eq(payments.id, payment.id))
          await db.update(paymentWebhookEvents).set({ processedAt: new Date() }).where(eq(paymentWebhookEvents.id, event.id))
          return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
        }

        const query = await queryStkPush(checkoutId)
        if (String(query.ResultCode) !== '0' || String(query.CheckoutRequestID ?? checkoutId) !== checkoutId) {
          await db.update(paymentWebhookEvents).set({ processingError: 'STK query did not confirm successful payment' }).where(eq(paymentWebhookEvents.id, event.id))
          return Response.json({ ResultCode: 0, ResultDesc: 'Accepted for reconciliation' })
        }
        const items = callback.CallbackMetadata?.Item ?? []
        const amount = Number(metadataValue(items, 'Amount'))
        const receipt = metadataValue(items, 'MpesaReceiptNumber')
        const phone = String(metadataValue(items, 'PhoneNumber') ?? '')
        if (!Number.isFinite(amount) || amount * 100 !== payment.amountMinor || typeof receipt !== 'string' || !receipt || !phone) {
          await db.update(paymentWebhookEvents).set({ processingError: 'Callback amount, receipt or payer details did not match payment' }).where(eq(paymentWebhookEvents.id, event.id))
          return Response.json({ ResultCode: 0, ResultDesc: 'Accepted for reconciliation' })
        }

        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM payments WHERE id = ${payment.id} FOR UPDATE`)
          const [lockedPayment] = await tx.select().from(payments).where(eq(payments.id, payment.id)).limit(1)
          if (!lockedPayment || lockedPayment.status !== 'pending') return
          const now = new Date()
          await tx.update(payments).set({
            status: 'succeeded', paidAt: now,
            metadata: { ...lockedPayment.metadata, receipt, payerPhone: phone, resultCode: 0 },
            updatedAt: now,
          }).where(eq(payments.id, lockedPayment.id))

          if (lockedPayment.bookingId) {
            const [booking] = await tx.select().from(meetupBookings).where(eq(meetupBookings.id, lockedPayment.bookingId)).limit(1)
            if (!booking) throw new Error('Payment booking no longer exists')
            const late = booking.status !== 'pending_payment' || booking.expiresAt <= now
            await tx.update(payments).set({ metadata: { ...lockedPayment.metadata, receipt, payerPhone: phone, resultCode: 0, latePaymentReview: late }, updatedAt: now }).where(eq(payments.id, lockedPayment.id))
            if (!late) {
              await tx.update(meetupBookings).set({ status: 'confirmed', confirmedAt: now, updatedAt: now })
                .where(and(eq(meetupBookings.id, booking.id), eq(meetupBookings.status, 'pending_payment')))
              const [wallet] = await tx.insert(hostWalletAccounts).values({ userId: booking.hostId, currency: booking.currency })
                .onConflictDoNothing().returning()
              const [account] = wallet ? [wallet] : await tx.select().from(hostWalletAccounts).where(and(
                eq(hostWalletAccounts.userId, booking.hostId), eq(hostWalletAccounts.currency, booking.currency),
              )).limit(1)
              if (!account) throw new Error('Could not create host wallet')
              const [ledgerEntry] = await tx.insert(hostWalletTransactions).values({
                walletId: account.id, kind: 'booking_credit', amountMinor: booking.hostNetMinor,
                currency: booking.currency, referenceType: 'meetup_booking', referenceId: booking.id,
                idempotencyKey: `booking-credit:${booking.id}`, metadata: { paymentId: payment.id, receipt },
              }).onConflictDoNothing().returning()
              if (ledgerEntry) await tx.update(hostWalletAccounts).set({
                pendingMinor: sql`${hostWalletAccounts.pendingMinor} + ${booking.hostNetMinor}`, updatedAt: now,
              }).where(eq(hostWalletAccounts.id, account.id))
            }
          } else if (lockedPayment.hostSubscriptionId) {
            const [subscription] = await tx.select().from(hostSubscriptions).where(eq(hostSubscriptions.id, lockedPayment.hostSubscriptionId)).limit(1)
            if (!subscription) throw new Error('Host membership record no longer exists')
            const interval = lockedPayment.metadata.billingInterval === 'year' ? 'year' : 'month'
            const end = new Date(now)
            if (interval === 'year') end.setFullYear(end.getFullYear() + 1)
            else end.setMonth(end.getMonth() + 1)
            await tx.update(hostSubscriptions).set({
              plan: interval === 'year' ? 'premium_annual' : 'premium_monthly',
              status: 'active', lockedPriceMinor: lockedPayment.amountMinor, currency: 'KES',
              billingInterval: interval, currentPeriodStart: now, currentPeriodEnd: end,
              cancelAtPeriodEnd: false, provider: 'daraja', providerSubscriptionReference: checkoutId,
              updatedAt: now,
            }).where(eq(hostSubscriptions.id, subscription.id))
          }
          await tx.update(paymentWebhookEvents).set({ processedAt: now }).where(eq(paymentWebhookEvents.id, event.id))
        })
        return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      } catch (error) {
        console.error('Daraja callback processing failed', error)
        await db.update(paymentWebhookEvents).set({ processingError: error instanceof Error ? error.message.slice(0, 900) : 'Callback processing failed' }).where(eq(paymentWebhookEvents.id, event.id))
        return Response.json({ ResultCode: 0, ResultDesc: 'Accepted for reconciliation' })
      }
    },
  } },
})
