import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { hostPayouts, hostWalletAccounts, hostWalletTransactions, paymentWebhookEvents } from '../db/schema'

type ResultParam = { Key?: string; Value?: string | number }
type B2CResult = {
  OriginatorConversationID?: string
  ConversationID?: string
  ResultCode?: number
  ResultDesc?: string
  ResultParameters?: { ResultParameter?: ResultParam[] }
}

export const Route = createFileRoute('/api/webhooks/daraja/b2c')({
  server: { handlers: {
    POST: async ({ request }) => {
      let payload: unknown
      try { payload = await request.json() } catch { return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' }) }
      const result = (payload as { Result?: B2CResult })?.Result
      const originatorId = result?.OriginatorConversationID
      const conversationId = result?.ConversationID
      if (!originatorId || !result) return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      const db = getDb()
      const eventId = `b2c:${originatorId}:${result.ResultCode ?? 'unknown'}`
      const [inserted] = await db.insert(paymentWebhookEvents).values({
        provider: 'daraja', providerEventId: eventId, eventType: 'b2c_result',
        payload: payload as Record<string, unknown>,
      }).onConflictDoNothing().returning()
      const [event] = inserted ? [inserted] : await db.select().from(paymentWebhookEvents).where(and(
        eq(paymentWebhookEvents.provider, 'daraja'), eq(paymentWebhookEvents.providerEventId, eventId),
      )).limit(1)
      if (!event || event.processedAt) return Response.json({ ResultCode: 0, ResultDesc: 'Duplicate accepted' })
      try {
        await db.transaction(async (tx) => {
          const [payout] = await tx.select().from(hostPayouts).where(sql`${hostPayouts.metadata}->>'originatorConversationId' = ${originatorId}`).limit(1)
          if (!payout || payout.status !== 'processing') {
            await tx.update(paymentWebhookEvents).set({ processedAt: new Date(), processingError: 'No matching processing payout' }).where(eq(paymentWebhookEvents.id, event.id))
            return
          }
          await tx.execute(sql`SELECT id FROM host_payouts WHERE id = ${payout.id} FOR UPDATE`)
          const [locked] = await tx.select().from(hostPayouts).where(eq(hostPayouts.id, payout.id)).limit(1)
          if (!locked || locked.status !== 'processing') return
          const now = new Date()
          const resultParams = result.ResultParameters?.ResultParameter ?? []
          const receipt = resultParams.find((item) => item.Key === 'TransactionReceipt')?.Value
          const amount = Number(resultParams.find((item) => item.Key === 'TransactionAmount')?.Value)
          const receiver = String(resultParams.find((item) => item.Key === 'ReceiverPartyPublicName')?.Value ?? '')
          const expectedPhone = locked.destinationReference ?? ''
          const successCode = Number(result.ResultCode) === 0
          const detailsMatch = typeof receipt === 'string' && receipt.length > 0
            && amount * 100 === locked.amountMinor
            && receiver.startsWith(expectedPhone)
          if (successCode && !detailsMatch) {
            await tx.update(paymentWebhookEvents).set({ processingError: 'B2C success callback did not match expected amount, receipt and destination; payout remains reserved' }).where(eq(paymentWebhookEvents.id, event.id))
            return
          }
          if (successCode) {
            await tx.update(hostPayouts).set({
              status: 'paid', providerReference: conversationId ?? locked.providerReference,
              processedAt: now, metadata: { ...locked.metadata, transactionId: receipt, resultDescription: result.ResultDesc, resultAmount: amount, receiver },
              updatedAt: now,
            }).where(eq(hostPayouts.id, locked.id))
            await tx.update(hostWalletAccounts).set({
              reservedMinor: sql`${hostWalletAccounts.reservedMinor} - ${locked.amountMinor}`,
              updatedAt: now,
            }).where(eq(hostWalletAccounts.id, locked.walletId))
            await tx.insert(hostWalletTransactions).values({
              walletId: locked.walletId, kind: 'payout_debit', amountMinor: -locked.amountMinor,
              currency: locked.currency, referenceType: 'host_payout', referenceId: locked.id,
              idempotencyKey: `payout-debit:${locked.id}`,
              metadata: { transactionId: receipt, conversationId, receiver },
            }).onConflictDoNothing()
          } else {
            await tx.update(hostPayouts).set({
              status: 'failed', failureReason: result.ResultDesc ?? 'Daraja B2C payout failed',
              processedAt: now, updatedAt: now,
            }).where(eq(hostPayouts.id, locked.id))
            await tx.update(hostWalletAccounts).set({
              reservedMinor: sql`${hostWalletAccounts.reservedMinor} - ${locked.amountMinor}`,
              availableMinor: sql`${hostWalletAccounts.availableMinor} + ${locked.amountMinor}`,
              updatedAt: now,
            }).where(eq(hostWalletAccounts.id, locked.walletId))
            await tx.insert(hostWalletTransactions).values({
              walletId: locked.walletId, kind: 'payout_release', amountMinor: locked.amountMinor,
              currency: locked.currency, referenceType: 'host_payout', referenceId: locked.id,
              idempotencyKey: `payout-release:${locked.id}`,
              metadata: { failure: result.ResultDesc ?? 'Daraja B2C payout failed' },
            }).onConflictDoNothing()
          }
          await tx.update(paymentWebhookEvents).set({ processedAt: now }).where(eq(paymentWebhookEvents.id, event.id))
        })
        return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      } catch (error) {
        console.error('Daraja B2C result processing failed', error)
        await db.update(paymentWebhookEvents).set({ processingError: error instanceof Error ? error.message.slice(0, 900) : 'B2C result processing failed' }).where(eq(paymentWebhookEvents.id, event.id))
        return Response.json({ ResultCode: 0, ResultDesc: 'Accepted for reconciliation' })
      }
    },
  } },
})
