import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venuePhotos, venues } from '../db/schema'
import { canManageVenue, storeCommunityFile } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/venues/$venueId/photos')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      let storageKey: string | null = null
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to upload venue photos.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const access = await canManageVenue(id.data, userId)
        if (!access.role || !['owner','manager','staff'].includes(access.role)) return jsonError('Only venue team members can upload photos.', 403, 'VENUE_FORBIDDEN')
        const [venue] = await getDb().select({ approvalStatus: venues.approvalStatus }).from(venues).where(eq(venues.id, id.data)).limit(1)
        if (venue?.approvalStatus !== 'approved') return jsonError('Venue must be approved before uploading public photos.', 409, 'VENUE_NOT_APPROVED')
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return jsonError('Choose a JPG, PNG or WebP photo.', 400, 'PHOTO_REQUIRED')
        const stored = await storeCommunityFile(file, false)
        storageKey = stored.key
        const [photo] = await getDb().insert(venuePhotos).values({
          venueId: id.data, uploadedById: userId, storageKey: stored.key, mimeType: stored.mimeType,
          sizeBytes: stored.sizeBytes, caption: String(form.get('caption') ?? '').trim().slice(0,240) || null,
        }).returning({ id: venuePhotos.id, caption: venuePhotos.caption, createdAt: venuePhotos.createdAt })
        return jsonOk({ photo: { ...photo, url: '/api/venue-photos/' + photo.id } }, 201)
      } catch (error) {
        console.error('Venue photo upload failed', error)
        return jsonError(error instanceof Error && /Use JPG|smaller|does not match/.test(error.message) ? error.message : 'We could not upload this photo.', 500, 'VENUE_PHOTO_UPLOAD_FAILED')
      }
    },
  } },
})
