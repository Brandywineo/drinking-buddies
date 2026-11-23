import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venueDeals, venues } from '../db/schema'
import { canManageVenue } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const schema = z.object({
  title: z.string().trim().min(3).max(120), description: z.string().trim().min(10).max(1000),
  dealType: z.enum(['happy_hour','group','birthday','vip','general']), discountLabel: z.string().trim().max(60).optional(),
  startsAt: z.string().datetime(), endsAt: z.string().datetime(), maxRedemptions: z.number().int().positive().max(100000).nullable().optional(),
}).strict().refine((v) => new Date(v.endsAt) > new Date(v.startsAt), 'End time must follow start time.')

export const Route = createFileRoute('/api/venues/$venueId/deals')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const userId = await getAuthenticatedUserId(request)
        const access = userId ? await canManageVenue(id.data, userId) : null
        const [venue] = await getDb().select({ id: venues.id, approvalStatus: venues.approvalStatus, isPublished: venues.isPublished }).from(venues).where(eq(venues.id, id.data)).limit(1)
        if (!venue || (!access?.role && (venue.approvalStatus !== 'approved' || !venue.isPublished))) return jsonError('Venue not found.', 404, 'VENUE_NOT_FOUND')
        const rows = await getDb().select().from(venueDeals).where(and(
          eq(venueDeals.venueId, id.data), ...(access?.role ? [] : [eq(venueDeals.status, 'published')]),
        )).orderBy(desc(venueDeals.createdAt)).limit(100)
        return jsonOk({ deals: rows })
      } catch (error) {
        console.error('Venue deals lookup failed', error)
        return jsonError('We could not load venue deals.', 500, 'VENUE_DEALS_FAILED')
      }
    },
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to create a deal.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const access = await canManageVenue(id.data, userId)
        if (!access.venue || !['owner','manager'].includes(access.role ?? '')) return jsonError('Only venue owners or managers can create deals.', 403, 'VENUE_FORBIDDEN')
        const [venue] = await getDb().select({ approvalStatus: venues.approvalStatus, isPublished: venues.isPublished }).from(venues).where(eq(venues.id, id.data)).limit(1)
        if (venue?.approvalStatus !== 'approved' || !venue.isPublished) return jsonError('Your venue must be approved and published first.', 409, 'VENUE_NOT_PUBLISHED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return jsonError('Check the deal details and dates.', 400, 'INVALID_DEAL')
        const [deal] = await getDb().insert(venueDeals).values({
          venueId: id.data, createdById: userId, ...parsed.data, discountLabel: parsed.data.discountLabel ?? null,
          maxRedemptions: parsed.data.maxRedemptions ?? null, status: 'published',
        }).returning()
        return jsonOk({ deal }, 201)
      } catch (error) {
        console.error('Venue deal creation failed', error)
        return jsonError('We could not create this deal.', 500, 'DEAL_CREATE_FAILED')
      }
    },
  } },
})
