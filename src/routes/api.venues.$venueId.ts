import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venueDeals, venueEnquiries, venueEvents, venuePhotos, venues } from '../db/schema'
import { canManageVenue } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const updateSchema = z.object({
  name: z.string().trim().min(2).max(140).optional(),
  description: z.string().trim().max(1200).nullable().optional(),
  category: z.string().trim().min(2).max(60).optional(),
  address: z.string().trim().min(4).max(300).optional(),
  area: z.string().trim().min(2).max(120).optional(),
  city: z.string().trim().min(2).max(120).optional(),
  websiteUrl: z.string().url().max(500).nullable().optional(),
  contactEmail: z.string().email().max(320).nullable().optional(),
}).strict()

const enquirySchema = z.object({
  name: z.string().trim().min(2).max(100), email: z.string().email().max(320),
  phone: z.string().trim().max(24).optional(), subject: z.string().trim().min(2).max(120),
  message: z.string().trim().min(10).max(2000),
}).strict()

export const Route = createFileRoute('/api/venues/$venueId')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const db = getDb()
        const [venue] = await db.select().from(venues).where(and(
          eq(venues.id, id.data), eq(venues.approvalStatus, 'approved'), eq(venues.isPublished, true),
        )).limit(1)
        if (!venue) return jsonError('Venue not found.', 404, 'VENUE_NOT_FOUND')
        const [photos, deals] = await Promise.all([
          db.select({ id: venuePhotos.id, caption: venuePhotos.caption, createdAt: venuePhotos.createdAt })
            .from(venuePhotos).where(and(eq(venuePhotos.venueId, venue.id), eq(venuePhotos.status, 'approved'))).orderBy(desc(venuePhotos.createdAt)).limit(30),
          db.select({ id: venueDeals.id, title: venueDeals.title, description: venueDeals.description, dealType: venueDeals.dealType, discountLabel: venueDeals.discountLabel, startsAt: venueDeals.startsAt, endsAt: venueDeals.endsAt })
            .from(venueDeals).where(and(eq(venueDeals.venueId, venue.id), eq(venueDeals.status, 'published'))).orderBy(desc(venueDeals.createdAt)).limit(30),
        ])
        const userId = await getAuthenticatedUserId(request)
        if (userId) await db.insert(venueEvents).values({ venueId: venue.id, userId, eventType: 'view' })
        return jsonOk({ venue, photos, deals })
      } catch (error) {
        console.error('Venue detail failed', error)
        return jsonError('We could not load this venue.', 500, 'VENUE_DETAIL_FAILED')
      }
    },
    PATCH: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to manage this venue.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const access = await canManageVenue(id.data, userId)
        if (!access.venue || !['owner', 'manager'].includes(access.role ?? '')) return jsonError('Only venue owners or managers can update details.', 403, 'VENUE_FORBIDDEN')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = updateSchema.safeParse(raw)
        if (!parsed.success || Object.keys(parsed.data).length === 0) return jsonError('Provide valid venue fields to update.', 400, 'INVALID_VENUE_UPDATE')
        const [venue] = await getDb().update(venues).set({ ...parsed.data, updatedAt: new Date() }).where(eq(venues.id, id.data)).returning()
        return jsonOk({ venue })
      } catch (error) {
        console.error('Venue update failed', error)
        return jsonError('We could not update this venue.', 500, 'VENUE_UPDATE_FAILED')
      }
    },
    POST: async ({ request, params }) => {
      try {
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const [venue] = await getDb().select({ id: venues.id }).from(venues).where(and(
          eq(venues.id, id.data), eq(venues.approvalStatus, 'approved'), eq(venues.isPublished, true),
        )).limit(1)
        if (!venue) return jsonError('Venue not found.', 404, 'VENUE_NOT_FOUND')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = enquirySchema.safeParse(raw)
        if (!parsed.success) return jsonError('Check your contact details and message.', 400, 'INVALID_ENQUIRY')
        const userId = await getAuthenticatedUserId(request)
        const [enquiry] = await getDb().insert(venueEnquiries).values({
          venueId: venue.id, userId, name: parsed.data.name, email: parsed.data.email,
          phone: parsed.data.phone ?? null, subject: parsed.data.subject, message: parsed.data.message,
        }).returning({ id: venueEnquiries.id, createdAt: venueEnquiries.createdAt })
        await getDb().insert(venueEvents).values({ venueId: venue.id, userId, eventType: 'enquiry', referenceId: enquiry.id })
        return jsonOk({ enquiry }, 201)
      } catch (error) {
        console.error('Venue enquiry failed', error)
        return jsonError('We could not send this enquiry.', 500, 'VENUE_ENQUIRY_FAILED')
      }
    },
  } },
})
