import { createFileRoute } from '@tanstack/react-router'
import { and, count, desc, eq, isNull } from 'drizzle-orm'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getDb } from '../db'
import {
  memoryAlbums, memoryAlbumMembers, memoryAlbumInvites, memoryAlbumSaves, memoryMedia,
  memoryMediaSaves, memoryComments, memoryReactions, memoryShareLinks, memoryNotifications,
  memoryTags, profiles,
} from '../db/schema'
import { canAccessMemoryAlbum } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const inputSchema = z.union([
  z.object({ action: z.literal('save_album'), albumId: z.string().uuid(), saved: z.boolean() }),
  z.object({ action: z.literal('save_media'), mediaId: z.string().uuid(), saved: z.boolean() }),
  z.object({ action: z.literal('comment'), albumId: z.string().uuid().optional(), mediaId: z.string().uuid().optional(), parentId: z.string().uuid().optional(), body: z.string().trim().min(1).max(1200) }).refine(v => Boolean(v.albumId) !== Boolean(v.mediaId)),
  z.object({ action: z.literal('react'), albumId: z.string().uuid().optional(), mediaId: z.string().uuid().optional(), reaction: z.enum(['like','love','laugh','fire','cheers']) }).refine(v => Boolean(v.albumId) !== Boolean(v.mediaId)),
  z.object({ action: z.literal('invite'), albumId: z.string().uuid(), userId: z.string().uuid() }),
  z.object({ action: z.literal('respond_invite'), inviteId: z.string().uuid(), accept: z.boolean() }),
  z.object({ action: z.literal('tag'), mediaId: z.string().uuid(), userId: z.string().uuid() }),
  z.object({ action: z.literal('remove_tag'), tagId: z.string().uuid() }),
  z.object({ action: z.literal('share'), albumId: z.string().uuid(), expiresInDays: z.number().int().min(1).max(90).optional() }),
  z.object({ action: z.literal('revoke_share'), shareId: z.string().uuid() }),
])

export const Route = createFileRoute('/api/memories/social')({
  server: { handlers: {
    GET: async ({ request }) => {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to view saved memories.', 401, 'UNAUTHENTICATED')
      const db = getDb()
      const albumId = new URL(request.url).searchParams.get('albumId')
      const communityFeed = new URL(request.url).searchParams.get('feed') === 'community'
      if (albumId && !z.string().uuid().safeParse(albumId).success) return jsonError('Invalid album.', 400, 'INVALID_ALBUM')
      if (albumId && !await canAccessMemoryAlbum(albumId, userId)) return jsonError('Album not found or private.', 404, 'ALBUM_NOT_FOUND')
      const [albums, media, notifications, invites, comments, communityAlbums] = await Promise.all([
        db.select({ id: memoryAlbumSaves.id, albumId: memoryAlbumSaves.albumId, title: memoryAlbums.title, createdAt: memoryAlbumSaves.createdAt })
          .from(memoryAlbumSaves).innerJoin(memoryAlbums, eq(memoryAlbums.id, memoryAlbumSaves.albumId))
          .where(eq(memoryAlbumSaves.userId, userId)).orderBy(desc(memoryAlbumSaves.createdAt)).limit(100),
        db.select({ id: memoryMediaSaves.id, mediaId: memoryMediaSaves.mediaId, albumId: memoryMedia.albumId, caption: memoryMedia.caption, createdAt: memoryMediaSaves.createdAt })
          .from(memoryMediaSaves).innerJoin(memoryMedia, eq(memoryMedia.id, memoryMediaSaves.mediaId))
          .where(and(eq(memoryMediaSaves.userId, userId), isNull(memoryMedia.deletedAt))).orderBy(desc(memoryMediaSaves.createdAt)).limit(100),
        db.select().from(memoryNotifications).where(eq(memoryNotifications.userId, userId)).orderBy(desc(memoryNotifications.createdAt)).limit(50),
        db.select({ id: memoryAlbumInvites.id, albumId: memoryAlbumInvites.albumId, title: memoryAlbums.title, createdAt: memoryAlbumInvites.createdAt })
          .from(memoryAlbumInvites).innerJoin(memoryAlbums, eq(memoryAlbums.id, memoryAlbumInvites.albumId))
          .where(and(eq(memoryAlbumInvites.invitedUserId, userId), eq(memoryAlbumInvites.status, 'pending'))).orderBy(desc(memoryAlbumInvites.createdAt)).limit(50),
        albumId ? db.select({ id: memoryComments.id, albumId: memoryComments.albumId, mediaId: memoryComments.mediaId, parentId: memoryComments.parentId, body: memoryComments.body, createdAt: memoryComments.createdAt, userId: memoryComments.userId, displayName: profiles.displayName }).from(memoryComments).leftJoin(profiles, eq(profiles.userId, memoryComments.userId)).where(and(eq(memoryComments.albumId, albumId), isNull(memoryComments.deletedAt))).orderBy(desc(memoryComments.createdAt)).limit(200) : Promise.resolve([]),
        communityFeed ? db.select({ id: memoryAlbums.id, title: memoryAlbums.title, description: memoryAlbums.description, createdAt: memoryAlbums.createdAt, creatorId: memoryAlbums.creatorId, displayName: profiles.displayName }).from(memoryAlbums).leftJoin(profiles, eq(profiles.userId, memoryAlbums.creatorId)).where(eq(memoryAlbums.visibility, 'public')).orderBy(desc(memoryAlbums.createdAt)).limit(100) : Promise.resolve([]),
      ])
      const communityWithCovers = await Promise.all(communityAlbums.map(async (album) => {
        const [mediaCount] = await db.select({ value: count() }).from(memoryMedia).where(and(
          eq(memoryMedia.albumId, album.id), eq(memoryMedia.moderationStatus, 'approved'), isNull(memoryMedia.deletedAt),
        ))
        const [cover] = await db.select({ id: memoryMedia.id }).from(memoryMedia).where(and(
          eq(memoryMedia.albumId, album.id), eq(memoryMedia.moderationStatus, 'approved'), isNull(memoryMedia.deletedAt),
        )).orderBy(desc(memoryMedia.createdAt)).limit(1)
        return { ...album, mediaCount: mediaCount?.value ?? 0, coverUrl: cover?.id ? '/api/memories/media/' + cover.id : null }
      }))
      return jsonOk({ savedAlbums: albums, savedMedia: media, notifications, invitations: invites, comments, communityAlbums: communityWithCovers })
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to interact with memories.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = inputSchema.safeParse(raw)
        if (!parsed.success) return jsonError('Invalid Memories action.', 400, 'INVALID_ACTION')
        const v = parsed.data
        const db = getDb()
        const notify = async (targetUserId: string, kind: string, albumId: string, mediaId?: string) => {
          if (targetUserId === userId) return
          await db.insert(memoryNotifications).values({ userId: targetUserId, actorId: userId, albumId, mediaId: mediaId ?? null, kind })
        }
        if ('albumId' in v && v.albumId && v.action !== 'invite' && v.action !== 'share') {
          if (!await canAccessMemoryAlbum(v.albumId, userId)) return jsonError('Album not found or private.', 404, 'ALBUM_NOT_FOUND')
        }
        if (v.action === 'save_album') {
          if (!await canAccessMemoryAlbum(v.albumId, userId)) return jsonError('Album not found or private.', 404, 'ALBUM_NOT_FOUND')
          if (v.saved) await db.insert(memoryAlbumSaves).values({ albumId: v.albumId, userId }).onConflictDoNothing()
          else await db.delete(memoryAlbumSaves).where(and(eq(memoryAlbumSaves.albumId, v.albumId), eq(memoryAlbumSaves.userId, userId)))
          return jsonOk({ saved: v.saved })
        }
        if (v.action === 'save_media') {
          const [item] = await db.select().from(memoryMedia).where(and(eq(memoryMedia.id, v.mediaId), isNull(memoryMedia.deletedAt))).limit(1)
          if (!item || !await canAccessMemoryAlbum(item.albumId, userId)) return jsonError('Media not found.', 404, 'MEDIA_NOT_FOUND')
          if (v.saved) await db.insert(memoryMediaSaves).values({ mediaId: v.mediaId, userId }).onConflictDoNothing()
          else await db.delete(memoryMediaSaves).where(and(eq(memoryMediaSaves.mediaId, v.mediaId), eq(memoryMediaSaves.userId, userId)))
          return jsonOk({ saved: v.saved })
        }
        if (v.action === 'comment') {
          const albumId = v.albumId ?? (await db.select({ albumId: memoryMedia.albumId }).from(memoryMedia).where(eq(memoryMedia.id, v.mediaId!)).limit(1))[0]?.albumId
          if (!albumId || !await canAccessMemoryAlbum(albumId, userId)) return jsonError('Memory not found.', 404, 'MEMORY_NOT_FOUND')
          if (v.parentId) {
            const [parent] = await db.select().from(memoryComments).where(and(eq(memoryComments.id, v.parentId), isNull(memoryComments.deletedAt))).limit(1)
            if (!parent || parent.albumId !== (v.albumId ?? null) || parent.mediaId !== (v.mediaId ?? null)) return jsonError('Reply target must belong to the same album or media item.', 404, 'COMMENT_NOT_FOUND')
          }
          const [comment] = await db.insert(memoryComments).values({ albumId: v.albumId ?? null, mediaId: v.mediaId ?? null, userId, parentId: v.parentId ?? null, body: v.body }).returning()
          return jsonOk({ comment }, 201)
        }
        if (v.action === 'react') {
          const albumId = v.albumId ?? (await db.select({ albumId: memoryMedia.albumId }).from(memoryMedia).where(eq(memoryMedia.id, v.mediaId!)).limit(1))[0]?.albumId
          if (!albumId || !await canAccessMemoryAlbum(albumId, userId)) return jsonError('Memory not found.', 404, 'MEMORY_NOT_FOUND')
          if (v.albumId) {
            await db.insert(memoryReactions).values({ albumId: v.albumId, userId, reaction: v.reaction }).onConflictDoUpdate({ target: [memoryReactions.albumId, memoryReactions.userId], set: { reaction: v.reaction } })
          } else {
            await db.insert(memoryReactions).values({ mediaId: v.mediaId!, userId, reaction: v.reaction }).onConflictDoUpdate({ target: [memoryReactions.mediaId, memoryReactions.userId], set: { reaction: v.reaction } })
          }
          return jsonOk({ reaction: v.reaction })
        }
        if (v.action === 'invite') {
          const [album] = await db.select().from(memoryAlbums).where(eq(memoryAlbums.id, v.albumId)).limit(1)
          if (!album || album.creatorId !== userId) return jsonError('Only the album owner can invite collaborators.', 403, 'INVITE_DENIED')
          await db.insert(memoryAlbumInvites).values({ albumId: v.albumId, invitedUserId: v.userId, invitedById: userId }).onConflictDoUpdate({ target: [memoryAlbumInvites.albumId, memoryAlbumInvites.invitedUserId], set: { status: 'pending', invitedById: userId } })
          await db.insert(memoryAlbumMembers).values({ albumId: v.albumId, userId: v.userId, invitedById: userId, role: 'contributor', status: 'invited' }).onConflictDoNothing()
          await notify(v.userId, 'invitation', v.albumId)
          return jsonOk({ invited: true }, 201)
        }
        if (v.action === 'respond_invite') {
          const [invite] = await db.update(memoryAlbumInvites).set({ status: v.accept ? 'accepted' : 'declined' }).where(and(eq(memoryAlbumInvites.id, v.inviteId), eq(memoryAlbumInvites.invitedUserId, userId), eq(memoryAlbumInvites.status, 'pending'))).returning()
          if (!invite) return jsonError('Invitation not found.', 404, 'INVITE_NOT_FOUND')
          await db.update(memoryAlbumMembers).set({ status: v.accept ? 'accepted' : 'declined', updatedAt: new Date() }).where(and(eq(memoryAlbumMembers.albumId, invite.albumId), eq(memoryAlbumMembers.userId, userId)))
          return jsonOk({ accepted: v.accept })
        }
        if (v.action === 'tag') {
          const [item] = await db.select().from(memoryMedia).where(and(eq(memoryMedia.id, v.mediaId), isNull(memoryMedia.deletedAt))).limit(1)
          if (!item || !await canAccessMemoryAlbum(item.albumId, userId)) return jsonError('Media not found.', 404, 'MEDIA_NOT_FOUND')
          const [album] = await db.select({ creatorId: memoryAlbums.creatorId }).from(memoryAlbums).where(eq(memoryAlbums.id, item.albumId)).limit(1)
          const [member] = await db.select({ id: memoryAlbumMembers.id }).from(memoryAlbumMembers).where(and(eq(memoryAlbumMembers.albumId, item.albumId), eq(memoryAlbumMembers.userId, userId), eq(memoryAlbumMembers.status, 'accepted'))).limit(1)
          if (item.uploaderId !== userId && album?.creatorId !== userId && !member) return jsonError('Only an album owner, contributor or the uploader can tag people.', 403, 'TAG_DENIED')
          if (v.userId === userId) return jsonError('You cannot tag yourself.', 400, 'INVALID_TAG')
          const [tag] = await db.insert(memoryTags).values({ mediaId: v.mediaId, taggedUserId: v.userId, taggedById: userId, status: 'accepted' }).onConflictDoUpdate({ target: [memoryTags.mediaId, memoryTags.taggedUserId], set: { status: 'accepted', taggedById: userId } }).returning()
          await notify(v.userId, 'mention', item.albumId, v.mediaId)
          return jsonOk({ tag }, 201)
        }
        if (v.action === 'remove_tag') {
          const [tag] = await db.delete(memoryTags).where(and(eq(memoryTags.id, v.tagId), eq(memoryTags.taggedUserId, userId))).returning({ id: memoryTags.id })
          if (!tag) return jsonError('Tag not found.', 404, 'TAG_NOT_FOUND')
          return jsonOk({ removed: true })
        }
        if (v.action === 'share') {
          const [album] = await db.select().from(memoryAlbums).where(eq(memoryAlbums.id, v.albumId)).limit(1)
          if (!album || album.creatorId !== userId) return jsonError('Only the album owner can create share links.', 403, 'SHARE_DENIED')
          const token = randomBytes(32).toString('base64url')
          const tokenHash = createHash('sha256').update(token).digest('hex')
          const expiresAt = v.expiresInDays ? new Date(Date.now() + v.expiresInDays * 86400000) : null
          const [link] = await db.insert(memoryShareLinks).values({ albumId: v.albumId, tokenHash, createdById: userId, expiresAt }).returning({ id: memoryShareLinks.id })
          return jsonOk({ shareId: link.id, token, expiresAt }, 201)
        }
        if (v.action === 'revoke_share') {
          const [link] = await db.update(memoryShareLinks).set({ revokedAt: new Date() }).where(and(eq(memoryShareLinks.id, v.shareId), eq(memoryShareLinks.createdById, userId))).returning({ id: memoryShareLinks.id })
          if (!link) return jsonError('Share link not found.', 404, 'SHARE_NOT_FOUND')
          return jsonOk({ revoked: true })
        }
        return jsonError('Unsupported Memories action.', 400, 'INVALID_ACTION')
      } catch (error) {
        console.error('Memories social action failed', error)
        return jsonError('We could not complete this Memories action.', 500, 'MEMORIES_SOCIAL_FAILED')
      }
    },
  } },
})
