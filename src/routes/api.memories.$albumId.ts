import { createFileRoute } from '@tanstack/react-router'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryMedia, memoryTags, profiles } from '../db/schema'
import { canAccessMemoryAlbum } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/memories/$albumId')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to view this album.', 401, 'UNAUTHENTICATED')
        const parsed = z.string().uuid().safeParse(params.albumId)
        if (!parsed.success) return jsonError('Invalid album.', 400, 'INVALID_ALBUM')
        const album = await canAccessMemoryAlbum(parsed.data, userId)
        if (!album) return jsonError('Album not found or private.', 404, 'ALBUM_NOT_FOUND')
        const db = getDb()
        const media = await db.select({
          id: memoryMedia.id, uploaderId: memoryMedia.uploaderId, mimeType: memoryMedia.mimeType,
          mediaKind: memoryMedia.mediaKind, caption: memoryMedia.caption, createdAt: memoryMedia.createdAt,
          uploaderName: profiles.displayName,
        }).from(memoryMedia).leftJoin(profiles, eq(profiles.userId, memoryMedia.uploaderId))
          .where(and(eq(memoryMedia.albumId, album.id), eq(memoryMedia.moderationStatus, 'approved'), isNull(memoryMedia.deletedAt)))
          .orderBy(asc(memoryMedia.createdAt)).limit(200)
        const tags = await db.select({
          id: memoryTags.id, mediaId: memoryTags.mediaId, taggedUserId: memoryTags.taggedUserId,
          status: memoryTags.status, displayName: profiles.displayName,
        }).from(memoryTags).innerJoin(profiles, eq(profiles.userId, memoryTags.taggedUserId))
          .innerJoin(memoryMedia, eq(memoryMedia.id, memoryTags.mediaId))
          .where(and(eq(memoryMedia.albumId, album.id), eq(memoryTags.status, 'accepted')))
        return jsonOk({ album, media: media.map(item => ({ ...item, url: '/api/memories/media/' + item.id })), tags })
      } catch (error) {
        console.error('Memory album lookup failed', error)
        return jsonError('We could not load this album.', 500, 'ALBUM_LOOKUP_FAILED')
      }
    },
  } },
})
