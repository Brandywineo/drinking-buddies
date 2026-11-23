import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryMedia } from '../db/schema'
import { canAccessMemoryAlbum, readCommunityFile } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/memories/media/$mediaId')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to view this media.', 401, 'UNAUTHENTICATED')
        const parsed = z.string().uuid().safeParse(params.mediaId)
        if (!parsed.success) return jsonError('Invalid media.', 400, 'INVALID_MEDIA')
        const [media] = await getDb().select().from(memoryMedia).where(and(eq(memoryMedia.id, parsed.data), eq(memoryMedia.moderationStatus, 'approved'), eq(memoryMedia.deletedAt, null))).limit(1)
        if (!media || !await canAccessMemoryAlbum(media.albumId, userId)) return jsonError('Media not found.', 404, 'MEDIA_NOT_FOUND')
        const bytes = await readCommunityFile(media.storageKey)
        return new Response(bytes, { headers: { 'Content-Type': media.mimeType, 'Content-Length': String(bytes.byteLength), 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' } })
      } catch (error) {
        console.error('Memory media read failed', error)
        return jsonError('We could not load this media.', 500, 'MEDIA_READ_FAILED')
      }
    },
    DELETE: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to delete media.', 401, 'UNAUTHENTICATED')
        const parsed = z.string().uuid().safeParse(params.mediaId)
        if (!parsed.success) return jsonError('Invalid media.', 400, 'INVALID_MEDIA')
        const [media] = await getDb().select().from(memoryMedia).where(eq(memoryMedia.id, parsed.data)).limit(1)
        if (!media) return jsonError('Media not found.', 404, 'MEDIA_NOT_FOUND')
        const album = await canAccessMemoryAlbum(media.albumId, userId)
        if (!album || (media.uploaderId !== userId && album.creatorId !== userId)) return jsonError('Only the uploader or album creator can delete this media.', 403, 'MEDIA_DELETE_DENIED')
        await getDb().update(memoryMedia).set({ deletedAt: new Date() }).where(eq(memoryMedia.id, media.id))
        return jsonOk({ deleted: true })
      } catch (error) {
        console.error('Memory media delete failed', error)
        return jsonError('We could not delete this media.', 500, 'MEDIA_DELETE_FAILED')
      }
    },
  } },
})
