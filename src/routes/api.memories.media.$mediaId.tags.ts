import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryMedia, memoryTags, users } from '../db/schema'
import { canAccessMemoryAlbum } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const schema = z.object({ userId: z.string().uuid() }).strict()

export const Route = createFileRoute('/api/memories/media/$mediaId/tags')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const actorId = await getAuthenticatedUserId(request)
        if (!actorId) return jsonError('Sign in to tag someone.', 401, 'UNAUTHENTICATED')
        const mediaId = z.string().uuid().safeParse(params.mediaId)
        if (!mediaId.success) return jsonError('Invalid media.', 400, 'INVALID_MEDIA')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = schema.safeParse(raw)
        if (!parsed.success || parsed.data.userId === actorId) return jsonError('Choose another valid member to tag.', 400, 'INVALID_TAG')
        const db = getDb()
        const [media] = await db.select().from(memoryMedia).where(and(
          eq(memoryMedia.id, mediaId.data), eq(memoryMedia.moderationStatus, 'approved'),
        )).limit(1)
        if (!media || !await canAccessMemoryAlbum(media.albumId, actorId)) return jsonError('Media not found.', 404, 'MEDIA_NOT_FOUND')
        if (!await canAccessMemoryAlbum(media.albumId, parsed.data.userId)) return jsonError('That person cannot access this album.', 400, 'TAG_USER_NOT_IN_ALBUM')
        const [target] = await db.select({ id: users.id }).from(users).where(and(
          eq(users.id, parsed.data.userId), eq(users.status, 'active'),
        )).limit(1)
        if (!target) return jsonError('That account is unavailable.', 404, 'USER_NOT_FOUND')
        const [tag] = await db.insert(memoryTags).values({
          mediaId: media.id, taggedUserId: target.id, taggedById: actorId, status: 'pending',
        }).onConflictDoNothing().returning({ id: memoryTags.id, status: memoryTags.status })
        if (!tag) return jsonError('A tag request already exists for this person.', 409, 'TAG_EXISTS')
        return jsonOk({ tag, message: 'Tag request sent. Their name appears only if they accept.' }, 201)
      } catch (error) {
        console.error('Memory tag request failed', error)
        return jsonError('We could not send this tag request.', 500, 'TAG_CREATE_FAILED')
      }
    },
  } },
})
