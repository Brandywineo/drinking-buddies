import { createFileRoute } from '@tanstack/react-router'
import { and, count, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { memoryAlbums, memoryMedia, memoryTags, meetupMembers, meetups, profiles, squadMembers } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const schema = z.object({
  title: z.string().trim().min(3).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  meetupId: z.string().uuid().nullable().optional(),
  squadId: z.string().uuid().nullable().optional(),
  visibility: z.enum(['public','followers','meetup','squad','invited','private']).default('members'),
}).strict().refine((value) => !(value.meetupId && value.squadId), 'Choose either a meetup or a squad.')

export const Route = createFileRoute('/api/memories')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to view memories.', 401, 'UNAUTHENTICATED')
        const db = getDb()
        const albums = await db.select({
          id: memoryAlbums.id, creatorId: memoryAlbums.creatorId, title: memoryAlbums.title,
          description: memoryAlbums.description, meetupId: memoryAlbums.meetupId, squadId: memoryAlbums.squadId,
          visibility: memoryAlbums.visibility, createdAt: memoryAlbums.createdAt,
          creatorName: profiles.displayName,
        }).from(memoryAlbums).leftJoin(profiles, eq(profiles.userId, memoryAlbums.creatorId))
          .orderBy(desc(memoryAlbums.createdAt)).limit(100)
        const visible = []
        for (const album of albums) {
          let allowed = album.creatorId === userId || album.visibility === 'public'
          if (!allowed && album.visibility === 'private') continue
          if (!allowed && album.meetupId) {
            const [host] = await db.select({ id: meetups.id }).from(meetups).where(and(eq(meetups.id, album.meetupId), eq(meetups.hostId, userId))).limit(1)
            const [member] = await db.select({ id: meetupMembers.id }).from(meetupMembers).where(and(eq(meetupMembers.meetupId, album.meetupId), eq(meetupMembers.userId, userId), eq(meetupMembers.status, 'approved'))).limit(1)
            allowed = Boolean(host || member)
          }
          if (!allowed && album.squadId) {
            const [member] = await db.select({ id: squadMembers.id }).from(squadMembers).where(and(eq(squadMembers.squadId, album.squadId), eq(squadMembers.userId, userId), eq(squadMembers.status, 'active'))).limit(1)
            allowed = Boolean(member)
          }
          if (!allowed) continue
          const [mediaCount] = await db.select({ value: count() }).from(memoryMedia).where(and(eq(memoryMedia.albumId, album.id), eq(memoryMedia.moderationStatus, 'approved')))
          visible.push({ ...album, mediaCount: mediaCount?.value ?? 0 })
        }
        const tags = await db.select({
          id: memoryTags.id, status: memoryTags.status, mediaId: memoryTags.mediaId,
          createdAt: memoryTags.createdAt,
        }).from(memoryTags).where(and(eq(memoryTags.taggedUserId, userId), eq(memoryTags.status, 'pending'))).orderBy(desc(memoryTags.createdAt)).limit(50)
        return jsonOk({ albums: visible, pendingTags: tags })
      } catch (error) {
        console.error('Memories listing failed', error)
        return jsonError('We could not load memories.', 500, 'MEMORIES_FAILED')
      }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to create an album.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return jsonError('Check the album details and choose one event or squad.', 400, 'INVALID_ALBUM')
        const db = getDb()
        if (parsed.data.meetupId) {
          const [host] = await db.select({ id: meetups.id }).from(meetups).where(and(eq(meetups.id, parsed.data.meetupId), eq(meetups.hostId, userId))).limit(1)
          const [member] = await db.select({ id: meetupMembers.id }).from(meetupMembers).where(and(eq(meetupMembers.meetupId, parsed.data.meetupId), eq(meetupMembers.userId, userId), eq(meetupMembers.status, 'approved'))).limit(1)
          if (!host && !member) return jsonError('Only the meetup host or an approved attendee can create its album.', 403, 'ALBUM_ACCESS_DENIED')
        }
        if (parsed.data.squadId) {
          const [member] = await db.select({ id: squadMembers.id }).from(squadMembers).where(and(eq(squadMembers.squadId, parsed.data.squadId), eq(squadMembers.userId, userId), eq(squadMembers.status, 'active'))).limit(1)
          if (!member) return jsonError('Join the squad before creating its album.', 403, 'ALBUM_ACCESS_DENIED')
        }
        const [album] = await db.insert(memoryAlbums).values({
          creatorId: userId, title: parsed.data.title, description: parsed.data.description ?? null,
          meetupId: parsed.data.meetupId ?? null, squadId: parsed.data.squadId ?? null,
          visibility: parsed.data.visibility,
        }).returning()
        return jsonOk({ album }, 201)
      } catch (error) {
        console.error('Memory album create failed', error)
        return jsonError('We could not create this album.', 500, 'ALBUM_CREATE_FAILED')
      }
    },
  } },
})
