import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venuePhotos, venues } from '../db/schema'
import { readCommunityFile } from '../lib/community-media'
import { jsonError } from '../lib/http'

export const Route = createFileRoute('/api/venue-photos/$photoId')({
  server: { handlers: {
    GET: async ({ params }) => {
      try {
        const id = z.string().uuid().safeParse(params.photoId)
        if (!id.success) return jsonError('Invalid photo.', 400, 'INVALID_PHOTO')
        const [photo] = await getDb().select({
          storageKey: venuePhotos.storageKey, mimeType: venuePhotos.mimeType,
        }).from(venuePhotos).innerJoin(venues, eq(venues.id, venuePhotos.venueId)).where(and(
          eq(venuePhotos.id, id.data), eq(venuePhotos.status, 'approved'),
          eq(venues.approvalStatus, 'approved'), eq(venues.isPublished, true),
        )).limit(1)
        if (!photo) return jsonError('Photo not found.', 404, 'PHOTO_NOT_FOUND')
        const bytes = await readCommunityFile(photo.storageKey)
        return new Response(bytes, { headers: {
          'Content-Type': photo.mimeType, 'Content-Length': String(bytes.byteLength),
          'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff',
        } })
      } catch (error) {
        console.error('Venue photo read failed', error)
        return jsonError('We could not load this photo.', 500, 'VENUE_PHOTO_READ_FAILED')
      }
    },
  } },
})
