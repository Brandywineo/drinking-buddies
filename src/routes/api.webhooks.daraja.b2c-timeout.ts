import { isDarajaCallbackAuthorized } from '../lib/daraja-callback-auth'
import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../db'
import { hostPayouts, paymentWebhookEvents } from '../db/schema'

export const Route = createFileRoute('/api/webhooks/daraja/b2c-timeout')({
  server: { handlers: {
    POST: async ({ request }) => {
      if (!await isDarajaCallbackAuthorized(request)) return Response.json({ ResultCode: 1, ResultDesc: 'Unauthorized' }, { status: 401 })
      let payload: unknown
      try { payload = await request.json() } catch { return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' }) }
      const body = payload as Record<string, unknown>
      const originatorId = String(body.OriginatorConversationID ?? (body.Result as Record<string, unknown> | undefined)?.OriginatorConversationID ?? '')
      if (!originatorId) return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
      const db = getDb()
      const eventId = 'b2c-timeout:' + originatorId
      const [event] = await db.insert(paymentWebhookEvents).values({
        provider: 'daraja', providerEventId: eventId, eventType: 'b2c_timeout',
        payload: payload as Record<string, unknown>,
      }).onConflictDoNothing().returning()
      if (event) {
        const [payout] = await db.select().from(hostPayouts).where(sql`${hostPayouts.metadata}->>'originatorConversationId' = ${originatorId}`).limit(1)
        if (payout && payout.status === 'processing') {
          await db.update(hostPayouts).set({
            metadata: { ...payout.metadata, timeoutReceivedAt: new Date().toISOString(), timeoutPayload: payload },
            updatedAt: new Date(),
          }).where(and(eq(hostPayouts.id, payout.id), eq(hostPayouts.status, 'processing')))
        }
        await db.update(paymentWebhookEvents).set({ processedAt: new Date(), processingError: 'B2C timeout received; payout remains reserved pending transaction-status reconciliation' }).where(eq(paymentWebhookEvents.id, event.id))
      }
      return Response.json({ ResultCode: 0, ResultDesc: 'Accepted' })
    },
  } },
})
