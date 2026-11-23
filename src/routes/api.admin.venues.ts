import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { profiles, users, venuePhotos, venues } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'

const updateSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('venue'), venueId: z.string().uuid(), status: z.enum(['approved', 'rejected', 'suspended']) }).strict(),
  z.object({ kind: z.literal('photo'), photoId: z.string().uuid(), status: z.enum(['approved', 'rejected', 'removed']) }).strict(),
])

export const Route = createFileRoute('/api/admin/venues')({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!await getAdminUserId(request)) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      try {
        const db = getDb()
        const [venueRows, photoRows] = await Promise.all([
          db.select({
            id: venues.id, name: venues.name, description: venues.description, category: venues.category,
            address: venues.address, area: venues.area, city: venues.city, approvalStatus: venues.approvalStatus,
            isPublished: venues.isPublished, createdAt: venues.createdAt, ownerId: venues.ownerId,
            ownerEmail: users.email, ownerName: profiles.displayName,
          }).from(venues).innerJoin(users, eq(users.id, venues.ownerId))
            .leftJoin(profiles, eq(profiles.userId, venues.ownerId)).orderBy(desc(venues.createdAt)).limit(250),
          db.select({
            id: venuePhotos.id, venueId: venuePhotos.venueId, venueName: venues.name,
            caption: venuePhotos.caption, mimeType: venuePhotos.mimeType, status: venuePhotos.status,
            createdAt: venuePhotos.createdAt,
          }).from(venuePhotos).innerJoin(venues, eq(venues.id, venuePhotos.venueId))
            .orderBy(desc(venuePhotos.createdAt)).limit(500),
        ])
        return jsonOk({
          venues: venueRows,
          photos: photoRows.map(photo => ({ ...photo, url: photo.status === 'approved' && photoRows.length >= 0 ? '/api/venue-photos/' + photo.id : null })),
        })
      } catch (error) {
        console.error('Admin venue queue failed', error)
        return jsonError('Could not load venue applications.', 500, 'ADMIN_VENUES_FAILED')
      }
    },
    PATCH: async ({ request }) => {
      const adminId = await getAdminUserId(request)
      if (!adminId) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      let raw: unknown
      try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = updateSchema.safeParse(raw)
      if (!parsed.success) return jsonError('Invalid moderation action.', 400, 'INVALID_MODERATION_ACTION')
      try {
        const db = getDb()
        if (parsed.data.kind === 'venue') {
          const publish = parsed.data.status === 'approved'
          const [venue] = await db.update(venues).set({
            approvalStatus: parsed.data.status,
            isPublished: publish,
            updatedAt: new Date(),
          }).where(eq(venues.id, parsed.data.venueId)).returning({ id: venues.id, approvalStatus: venues.approvalStatus, isPublished: venues.isPublished })
          if (!venue) return jsonError('Venue not found.', 404, 'VENUE_NOT_FOUND')
          return jsonOk({ venue })
        }
        const [photo] = await db.update(venuePhotos).set({ status: parsed.data.status, }).where(eq(venuePhotos.id, parsed.data.photoId)).returning({ id: venuePhotos.id, status: venuePhotos.status })
        if (!photo) return jsonError('Photo not found.', 404, 'PHOTO_NOT_FOUND')
        return jsonOk({ photo })
      } catch (error) {
        console.error('Admin venue moderation failed', error)
        return jsonError('Could not save moderation decision.', 500, 'MODERATION_UPDATE_FAILED')
      }
    },
  } },
})
