import { createFileRoute } from '@tanstack/react-router'
import { desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { hostPayouts, profiles, users } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/admin/finance/payouts')({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!await getAdminUserId(request)) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      const payouts = await getDb().select({
        id: hostPayouts.id, userId: hostPayouts.userId, email: users.email,
        displayName: profiles.displayName, amountMinor: hostPayouts.amountMinor,
        currency: hostPayouts.currency, destinationReference: hostPayouts.destinationReference,
        status: hostPayouts.status, failureReason: hostPayouts.failureReason,
        requestedAt: hostPayouts.requestedAt, reviewedAt: hostPayouts.reviewedAt,
        processedAt: hostPayouts.processedAt, providerReference: hostPayouts.providerReference,
      }).from(hostPayouts)
        .innerJoin(users, eq(users.id, hostPayouts.userId))
        .leftJoin(profiles, eq(profiles.userId, hostPayouts.userId))
        .orderBy(desc(hostPayouts.createdAt)).limit(100)
      return jsonOk({ payouts })
    },
  } },
})
