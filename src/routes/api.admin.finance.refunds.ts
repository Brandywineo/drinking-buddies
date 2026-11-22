import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { marketplaceRefunds, profiles, users } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/admin/finance/refunds')({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!await getAdminUserId(request)) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      const refunds = await getDb().select({
        id: marketplaceRefunds.id, bookingId: marketplaceRefunds.bookingId,
        attendeeId: marketplaceRefunds.attendeeId, attendeeEmail: users.email,
        attendeeName: profiles.displayName, hostId: marketplaceRefunds.hostId,
        amountMinor: marketplaceRefunds.refundAmountMinor, hostDebitMinor: marketplaceRefunds.hostDebitMinor,
        currency: marketplaceRefunds.currency, status: marketplaceRefunds.status,
        failureReason: marketplaceRefunds.failureReason, requestedAt: marketplaceRefunds.createdAt,
        reviewedAt: marketplaceRefunds.reviewedAt, processedAt: marketplaceRefunds.processedAt,
      }).from(marketplaceRefunds)
        .innerJoin(users, eq(users.id, marketplaceRefunds.attendeeId))
        .leftJoin(profiles, eq(profiles.userId, marketplaceRefunds.attendeeId))
        .orderBy(desc(marketplaceRefunds.createdAt)).limit(100)
      return jsonOk({ refunds })
    },
  } },
})
