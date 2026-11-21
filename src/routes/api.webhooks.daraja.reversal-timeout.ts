import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { marketplaceRefunds, paymentWebhookEvents } from '../db/schema'

export const Route = createFileRoute('/api/webhooks/daraja/reversal-timeout')({
  server: { handlers: {
    POST: async ({ request }) => {
      let payload: unknown
      try { payload = await request.json() } catch { return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' }) }
      const body = payload as Record<string, unknown>
      const originatorId = String(body.OriginatorConversationID ?? (body.Result as Record<string, unknown> | undefined)?.OriginatorConversationID ?? '')
      if (!originatorId) return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      const db = getDb()
      const eventId = 'reversal-timeout:' + originatorId
      const [event] = await db.insert(paymentWebhookEvents).values({
        provider: 'daraja', providerEventId: eventId, eventType: 'reversal_timeout',
        payload: payload as Record<string, unknown>,
      }).onConflictDoNothing().returning()
      if (event) {
        const [refund] = await db.select().from(marketplaceRefunds).where(sql`${marketplaceRefunds.metadata}->>'originatorConversationId' = ${originatorId}`).limit(1)
        if (refund && refund.status === 'processing') {
          await db.update(marketplaceRefunds).set({
            metadata: { ...refund.metadata, timeoutReceivedAt: new Date().toISOString(), timeoutPayload: payload },
            updatedAt: new Date(),
          }).where(and(eq(marketplaceRefunds.id, refund.id), eq(marketplaceRefunds.status, 'processing')))
        }
        await db.update(paymentWebhookEvents).set({ processedAt: new Date(), processingError: 'Reversal timeout received; refund remains processing pending reconciliation' }).where(eq(paymentWebhookEvents.id, event.id))
      }
      return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    },
  } },
})
