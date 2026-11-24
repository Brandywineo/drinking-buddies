import { createFileRoute } from '@tanstack/react-router'
import { and, createHash, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryAlbums, memoryMedia, memoryShareLinks, profiles } from '../db/schema'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/memories/share/$token')({
  server: { handlers: {
    GET: async ({ params }) => {
      try {
        const token = z.string().min(32).max(128).safeParse(params.token)
        if (!token.success) return jsonError('Share link not found.',404,'SHARE_NOT_FOUND')
        const tokenHash = createHash('sha256').update(token.data).digest('hex')
        const db = getDb()
        const [link] = await db.select().from(memoryShareLinks).where(and(eq(memoryShareLinks.tokenHash,tokenHash),isNull(memoryShareLinks.revokedAt),or(isNull(memoryShareLinks.expiresAt),gt(memoryShareLinks.expiresAt,new Date())))).limit(1)
        if (!link) return jsonError('This share link has expired or been revoked.',404,'SHARE_NOT_FOUND')
        const [album] = await db.select({id:memoryAlbums.id,title:memoryAlbums.title,description:memoryAlbums.description,createdAt:memoryAlbums.createdAt,creatorName:profiles.displayName}).from(memoryAlbums).leftJoin(profiles,eq(profiles.userId,memoryAlbums.creatorId)).where(eq(memoryAlbums.id,link.albumId)).limit(1)
        if (!album) return jsonError('Album not found.',404,'SHARE_NOT_FOUND')
        const media = await db.select({id:memoryMedia.id,mediaKind:memoryMedia.mediaKind,mimeType:memoryMedia.mimeType,caption:memoryMedia.caption,createdAt:memoryMedia.createdAt}).from(memoryMedia).where(and(eq(memoryMedia.albumId,link.albumId),eq(memoryMedia.moderationStatus,'approved'),isNull(memoryMedia.deletedAt))).orderBy(desc(memoryMedia.createdAt)).limit(200)
        return jsonOk({album,media:media.map(item=>({...item,url:'/api/memories/share/'+params.token+'/media/'+item.id}))})
      } catch (error) {
        console.error('Memory share lookup failed',error)
        return jsonError('We could not open this shared album.',500,'SHARE_LOOKUP_FAILED')
      }
    },
  } },
})
