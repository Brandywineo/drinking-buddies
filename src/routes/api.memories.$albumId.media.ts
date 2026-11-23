import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryMedia } from '../db/schema'
import { canAccessMemoryAlbum, storeCommunityFile } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/memories/$albumId/media')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to upload memories.', 401, 'UNAUTHENTICATED')
        const parsed = z.string().uuid().safeParse(params.albumId)
        if (!parsed.success) return jsonError('Invalid album.', 400, 'INVALID_ALBUM')
        const album = await canAccessMemoryAlbum(parsed.data, userId)
        if (!album) return jsonError('Album not found or private.', 404, 'ALBUM_NOT_FOUND')
        const form = await request.formData()
        const file = form.get('file')
        if (!(file instanceof File)) return jsonError('Choose a photo or MP4 video.', 400, 'MEDIA_REQUIRED')
        const stored = await storeCommunityFile(file, true)
        const caption = String(form.get('caption') ?? '').trim().slice(0, 500) || null
        const [media] = await getDb().insert(memoryMedia).values({
          albumId: album.id, uploaderId: userId, storageKey: stored.key, mimeType: stored.mimeType,
          mediaKind: stored.mediaKind, sizeBytes: stored.sizeBytes, caption,
        }).returning({ id: memoryMedia.id, mediaKind: memoryMedia.mediaKind, createdAt: memoryMedia.createdAt })
        return jsonOk({ media: { ...media, url: '/api/memories/media/' + media.id } }, 201)
      } catch (error) {
        console.error('Memory upload failed', error)
        return jsonError(error instanceof Error && /Use JPG|MP4|smaller|valid MP4|does not match/.test(error.message) ? error.message : 'We could not upload this memory.', 500, 'MEMORY_UPLOAD_FAILED')
      }
    },
  } },
})
