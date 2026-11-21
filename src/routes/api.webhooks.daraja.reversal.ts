import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { hostWalletAccounts, hostWalletTransactions, marketplaceRefunds, meetupBookings, paymentWebhookEvents, payments } from '../db/schema'

type ReversalResult = { OriginatorConversationID?: string; ConversationID?: string; ResultCode?: number; ResultDesc?: string; TransactionID?: string }

export const Route = createFileRoute('/api/webhooks/daraja/reversal')({
  server: { handlers: {
    POST: async ({ request }) => {
      let payload: unknown
      try { payload = await request.json() } catch { return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' }) }
      const result = (payload as { Result?: ReversalResult })?.Result
      const originatorId = result?.OriginatorConversationID
      if (!originatorId || !result) return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      const db = getDb()
      const eventId = `reversal:${originatorId}:${result.ResultCode ?? 'unknown'}`
      const [inserted] = await db.insert(paymentWebhookEvents).values({
        provider: 'daraja', providerEventId: eventId, eventType: 'reversal_result',
        payload: payload as Record<string, unknown>,
      }).onConflictDoNothing().returning()
      const [event] = inserted ? [inserted] : await db.select().from(paymentWebhookEvents).where(and(
        eq(paymentWebhookEvents.provider, 'daraja'), eq(paymentWebhookEvents.providerEventId, eventId),
      )).limit(1)
      if (!event || event.processedAt) return Response.json({ ResultCode: 0, ResultDesc: 'Duplicate accepted' })
      try {
        await db.transaction(async (tx) => {
          const [refund] = await tx.select().from(marketplaceRefunds).where(sql`${marketplaceRefunds.metadata}->>'originatorConversationId' = ${originatorId}`).limit(1)
          if (!refund || refund.status !== 'processing') {
            await tx.update(paymentWebhookEvents).set({ processedAt: new Date(), processingError: 'No matching processing refund' }).where(eq(paymentWebhookEvents.id, event.id))
            return
          }
          await tx.execute(sql`SELECT id FROM marketplace_refunds WHERE id = ${refund.id} FOR UPDATE`)
          const [locked] = await tx.select().from(marketplaceRefunds).where(eq(marketplaceRefunds.id, refund.id)).limit(1)
          if (!locked || locked.status !== 'processing') return
          const now = new Date()
          const succeeded = Number(result.ResultCode) === 0
          const [payment] = await tx.select().from(payments).where(eq(payments.id, locked.paymentId)).limit(1)
          if (succeeded) {
            await tx.update(marketplaceRefunds).set({ status: 'succeeded', providerReference: result.ConversationID ?? locked.providerReference, processedAt: now, updatedAt: now }).where(eq(marketplaceRefunds.id, locked.id))
            await tx.update(meetupBookings).set({ status: 'refunded', updatedAt: now }).where(eq(meetupBookings.id, locked.bookingId))
            if (payment && locked.refundAmountMinor >= payment.amountMinor) {
              await tx.update(payments).set({ status: 'reversed', updatedAt: now }).where(eq(payments.id, payment.id))
            }
          } else {
            await tx.update(marketplaceRefunds).set({ status: 'failed', failureReason: result.ResultDesc ?? 'Daraja reversal failed', processedAt: now, updatedAt: now }).where(eq(marketplaceRefunds.id, locked.id))
          }

          if (locked.hostDebitMinor > 0) {
            const [wallet] = await tx.select().from(hostWalletAccounts).where(and(
              eq(hostWalletAccounts.userId, locked.hostId), eq(hostWalletAccounts.currency, locked.currency),
            )).limit(1)
            if (!wallet) throw new Error('Host wallet missing while settling refund')
            const pendingReserved = Number(locked.metadata.pendingReserved ?? 0)
            const availableReserved = Number(locked.metadata.availableReserved ?? 0)
            if (succeeded) {
              await tx.update(hostWalletAccounts).set({ reservedMinor: sql`${hostWalletAccounts.reservedMinor} - ${locked.hostDebitMinor}`, updatedAt: now }).where(eq(hostWalletAccounts.id, wallet.id))
              await tx.insert(hostWalletTransactions).values({
                walletId: wallet.id, kind: 'refund_debit', amountMinor: -locked.hostDebitMinor,
                currency: locked.currency, referenceType: 'marketplace_refund', referenceId: locked.id,
                idempotencyKey: `refund-debit:${locked.id}`, metadata: { transactionId: result.TransactionID ?? null },
              }).onConflictDoNothing()
            } else {
              await tx.update(hostWalletAccounts).set({
                reservedMinor: sql`${hostWalletAccounts.reservedMinor} - ${locked.hostDebitMinor}`,
                pendingMinor: sql`${hostWalletAccounts.pendingMinor} + ${pendingReserved}`,
                availableMinor: sql`${hostWalletAccounts.availableMinor} + ${availableReserved}`,
                updatedAt: now,
              }).where(eq(hostWalletAccounts.id, wallet.id))
              await tx.insert(hostWalletTransactions).values({
                walletId: wallet.id, kind: 'refund_release', amountMinor: locked.hostDebitMinor,
                currency: locked.currency, referenceType: 'marketplace_refund', referenceId: locked.id,
                idempotencyKey: `refund-release:${locked.id}`, metadata: { reason: result.ResultDesc ?? 'Reversal failed' },
              }).onConflictDoNothing()
            }
          }
          await tx.update(paymentWebhookEvents).set({ processedAt: now }).where(eq(paymentWebhookEvents.id, event.id))
        })
        return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      } catch (error) {
        console.error('Daraja reversal callback failed', error)
        await db.update(paymentWebhookEvents).set({ processingError: error instanceof Error ? error.message.slice(0, 900) : 'Reversal callback failed' }).where(eq(paymentWebhookEvents.id, event.id))
        return Response.json({ ResultCode: 0, ResultDesc: 'Accepted for reconciliation' })
      }
    },
  } },
})
