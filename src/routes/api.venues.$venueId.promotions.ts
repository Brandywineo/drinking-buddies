import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venuePromotions } from '../db/schema'
import { canManageVenue } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const schema = z.object({
  title: z.string().trim().min(3).max(120),
  placement: z.enum(['featured','promoted_deal','promoted_event']),
  budgetMinor: z.number().int().min(10000).max(100000000),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).strict().refine(v => new Date(v.endsAt) > new Date(v.startsAt), 'End time must follow start time.')

export const Route = createFileRoute('/api/venues/$venueId/promotions')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to request promotion.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const access = await canManageVenue(id.data, userId)
        if (!access.role || !['owner','manager'].includes(access.role)) return jsonError('Only venue owners or managers can request promotion.', 403, 'VENUE_FORBIDDEN')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return jsonError('Promotion budget must be at least KES 100. Check the dates and placement.', 400, 'INVALID_PROMOTION')
        const [promotion] = await getDb().insert(venuePromotions).values({
          venueId: id.data, requestedById: userId, ...parsed.data, currency: 'KES', status: 'pending',
        }).returning({ id: venuePromotions.id, budgetMinor: venuePromotions.budgetMinor, currency: venuePromotions.currency, status: venuePromotions.status })
        return jsonOk({ promotion, message: 'Promotion request submitted for review. No payment has been taken.' }, 201)
      } catch (error) {
        console.error('Venue promotion request failed', error)
        return jsonError('We could not submit this promotion request.', 500, 'PROMOTION_CREATE_FAILED')
      }
    },
  } },
})
