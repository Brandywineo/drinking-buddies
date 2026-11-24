import { createFileRoute } from '@tanstack/react-router'
import { and, createHash, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryMedia, memoryShareLinks } from '../db/schema'
import { readCommunityFile } from '../lib/community-media'
import { jsonError } from '../lib/http'

export const Route = createFileRoute('/api/memories/share/$token/media/$mediaId')({
  server: { handlers: {
    GET: async ({ params }) => {
      try {
        const token = z.string().min(32).max(128).safeParse(params.token)
        const mediaId = z.string().uuid().safeParse(params.mediaId)
        if (!token.success || !mediaId.success) return jsonError('Shared media not found.',404,'SHARE_NOT_FOUND')
        const db = getDb()
        const tokenHash = createHash('sha256').update(token.data).digest('hex')
        const [link] = await db.select().from(memoryShareLinks).where(and(eq(memoryShareLinks.tokenHash,tokenHash),isNull(memoryShareLinks.revokedAt),or(isNull(memoryShareLinks.expiresAt),gt(memoryShareLinks.expiresAt,new Date())))).limit(1)
        if (!link) return jsonError('This share link has expired or been revoked.',404,'SHARE_NOT_FOUND')
        const [media] = await db.select().from(memoryMedia).where(and(eq(memoryMedia.id,mediaId.data),eq(memoryMedia.albumId,link.albumId),eq(memoryMedia.moderationStatus,'approved'),isNull(memoryMedia.deletedAt))).limit(1)
        if (!media) return jsonError('Shared media not found.',404,'MEDIA_NOT_FOUND')
        const bytes = await readCommunityFile(media.storageKey)
        return new Response(bytes,{headers:{'Content-Type':media.mimeType,'Content-Length':String(bytes.byteLength),'Cache-Control':'private, max-age=300','X-Content-Type-Options':'nosniff'}})
      } catch (error) {
        console.error('Shared memory read failed',error)
        return jsonError('We could not load shared media.',500,'MEDIA_READ_FAILED')
      }
    },
  } },
})
