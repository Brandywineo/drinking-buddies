import { createFileRoute } from '@tanstack/react-router'
import { and, asc, count, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { conversations, meetupMembers, meetups, profiles } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const createSchema = z.object({
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().max(1200).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  area: z.string().trim().min(2).max(160),
  capacity: z.number().int().min(2).max(100).default(8),
  visibility: z.enum(['public', 'approval_required']).default('approval_required'),
}).strict()

export const Route = createFileRoute('/api/meetups')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        const db = getDb()
        const rows = await db.select({
          id: meetups.id, title: meetups.title, description: meetups.description,
          startsAt: meetups.startsAt, endsAt: meetups.endsAt, area: meetups.area,
          capacity: meetups.capacity, visibility: meetups.visibility, hostId: meetups.hostId,
          hostName: profiles.displayName,
        }).from(meetups).innerJoin(profiles, eq(profiles.userId, meetups.hostId))
          .where(and(eq(meetups.status, 'published'), gt(meetups.startsAt, new Date())))
          .orderBy(asc(meetups.startsAt)).limit(100)
        const items = []
        for (const row of rows) {
          const [memberCount] = await db.select({ value: count() }).from(meetupMembers)
            .where(and(eq(meetupMembers.meetupId, row.id), eq(meetupMembers.status, 'approved')))
          const [mine] = userId ? await db.select({ status: meetupMembers.status }).from(meetupMembers)
            .where(and(eq(meetupMembers.meetupId, row.id), eq(meetupMembers.userId, userId))).limit(1) : []
          const [conversation] = userId && (row.hostId === userId || mine?.status === 'approved')
            ? await db.select({ id: conversations.id }).from(conversations)
              .where(and(eq(conversations.kind, 'meetup'), eq(conversations.meetupId, row.id))).limit(1)
            : []
          items.push({ ...row, approvedCount: memberCount?.value ?? 0, membershipStatus: mine?.status ?? null, conversationId: conversation?.id ?? null })
        }
        return jsonOk({ meetups: items })
      } catch (error) {
        console.error('Meetup listing failed', error)
        return jsonError('We could not load meetups.', 500, 'MEETUPS_FAILED')
      }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to create a meetup.', 401, 'UNAUTHENTICATED')
        let body: unknown
        try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = createSchema.safeParse(body)
        if (!parsed.success) return jsonError('Check the meetup details and try again.', 400, 'INVALID_MEETUP')
        const startsAt = new Date(parsed.data.startsAt)
        const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
        if (startsAt <= new Date() || (endsAt && endsAt <= startsAt)) {
          return jsonError('Choose a future start time and an end time after it.', 400, 'INVALID_MEETUP_TIME')
        }
        const db = getDb()
        const created = await db.transaction(async (tx) => {
          const [meetup] = await tx.insert(meetups).values({
            hostId: userId, title: parsed.data.title, description: parsed.data.description ?? null,
            startsAt, endsAt, area: parsed.data.area, capacity: parsed.data.capacity,
            visibility: parsed.data.visibility, status: 'published',
          }).returning()
          await tx.insert(meetupMembers).values({ meetupId: meetup.id, userId, status: 'approved', joinedAt: new Date() })
          const [conversation] = await tx.insert(conversations).values({ kind: 'meetup', meetupId: meetup.id }).returning()
          return { ...meetup, conversationId: conversation.id, approvedCount: 1, membershipStatus: 'approved' as const }
        })
        return jsonOk({ meetup: created }, 201)
      } catch (error) {
        console.error('Meetup creation failed', error)
        return jsonError('We could not create this meetup.', 500, 'MEETUP_CREATE_FAILED')
      }
    },
  } },
})
