import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venuePhotos, venues } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const applicationSchema = z.object({
  name: z.string().trim().min(2).max(140),
  description: z.string().trim().max(1200).optional(),
  category: z.string().trim().min(2).max(60),
  address: z.string().trim().min(4).max(300),
  area: z.string().trim().min(2).max(120),
  city: z.string().trim().min(2).max(120),
  websiteUrl: z.string().url().max(500).optional().or(z.literal('')),
  contactEmail: z.string().email().max(320).optional().or(z.literal('')),
}).strict()

export const Route = createFileRoute('/api/venues')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const url = new URL(request.url)
        const q = url.searchParams.get('q')?.trim().slice(0, 80)
        const area = url.searchParams.get('area')?.trim().slice(0, 120)
        const db = getDb()
        const filters = [eq(venues.approvalStatus, 'approved'), eq(venues.isPublished, true)]
        if (q) filters.push(or(ilike(venues.name, `%${q}%`), ilike(venues.category, `%${q}%`), ilike(venues.area, `%${q}%`))!)
        if (area) filters.push(ilike(venues.area, `%${area}%`))
        const rows = await db.select({
          id: venues.id, name: venues.name, description: venues.description, category: venues.category,
          address: venues.address, area: venues.area, city: venues.city, websiteUrl: venues.websiteUrl,
          coverPhotoUrl: sql<string | null>`(SELECT '/api/venue-photos/' || ${venuePhotos.id}::text FROM venue_photos WHERE venue_id = ${venues.id} AND status = 'approved' ORDER BY created_at DESC LIMIT 1)`,
        }).from(venues).where(and(...filters)).orderBy(desc(venues.updatedAt)).limit(100)
        return jsonOk({ venues: rows })
      } catch (error) {
        console.error('Venue discovery failed', error)
        return jsonError('We could not load venues.', 500, 'VENUES_FAILED')
      }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to register a venue.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = applicationSchema.safeParse(raw)
        if (!parsed.success) return jsonError('Check the venue details and try again.', 400, 'INVALID_VENUE')
        const [venue] = await getDb().insert(venues).values({
          ownerId: userId, name: parsed.data.name, description: parsed.data.description ?? null,
          category: parsed.data.category, address: parsed.data.address, area: parsed.data.area,
          city: parsed.data.city, countryCode: 'KE', websiteUrl: parsed.data.websiteUrl || null,
          contactEmail: parsed.data.contactEmail || null, approvalStatus: 'pending', isPublished: false,
        }).returning({ id: venues.id, name: venues.name, approvalStatus: venues.approvalStatus })
        return jsonOk({ venue, message: 'Venue submitted for review. It will appear publicly after approval.' }, 201)
      } catch (error) {
        console.error('Venue application failed', error)
        return jsonError('We could not submit this venue.', 500, 'VENUE_CREATE_FAILED')
      }
    },
  } },
})
