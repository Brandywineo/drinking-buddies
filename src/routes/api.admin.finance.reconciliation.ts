import { createFileRoute } from '@tanstack/react-router'
import { desc, isNotNull, isNull, or } from 'drizzle-orm'
import { getDb } from '../db'
import { paymentWebhookEvents } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/admin/finance/reconciliation')({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!await getAdminUserId(request)) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      const events = await getDb().select({
        id: paymentWebhookEvents.id,
        provider: paymentWebhookEvents.provider,
        providerEventId: paymentWebhookEvents.providerEventId,
        eventType: paymentWebhookEvents.eventType,
        processedAt: paymentWebhookEvents.processedAt,
        processingError: paymentWebhookEvents.processingError,
        createdAt: paymentWebhookEvents.createdAt,
      }).from(paymentWebhookEvents)
        .where(or(isNull(paymentWebhookEvents.processedAt), isNotNull(paymentWebhookEvents.processingError)))
        .orderBy(desc(paymentWebhookEvents.createdAt)).limit(100)
      return jsonOk({ events })
    },
  } },
})
