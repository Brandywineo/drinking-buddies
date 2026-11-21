import { createFileRoute } from '@tanstack/react-router'
import { and, count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { meetupMembers, meetups } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ meetupId: z.string().uuid() })

export const Route = createFileRoute('/api/meetups/$meetupId/join')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to join a meetup.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid meetup.', 400, 'INVALID_MEETUP')
        const db = getDb()
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM meetups WHERE id = ${parsed.data.meetupId} FOR UPDATE`)
          const [meetup] = await tx.select().from(meetups).where(eq(meetups.id, parsed.data.meetupId)).limit(1)
          if (!meetup || meetup.status !== 'published' || meetup.startsAt <= new Date()) return { error: 'NOT_FOUND' as const }
          if (meetup.hostId === userId) return { error: 'HOST' as const }
          const [existing] = await tx.select().from(meetupMembers).where(and(
            eq(meetupMembers.meetupId, meetup.id), eq(meetupMembers.userId, userId),
          )).limit(1)
          if (existing?.status === 'approved' || existing?.status === 'requested') return { status: existing.status }
          const [members] = await tx.select({ value: count() }).from(meetupMembers).where(and(
            eq(meetupMembers.meetupId, meetup.id), eq(meetupMembers.status, 'approved'),
          ))
          if ((members?.value ?? 0) >= meetup.capacity) return { error: 'FULL' as const }
          const status = meetup.visibility === 'public' ? 'approved' as const : 'requested' as const
          if (existing) {
            await tx.update(meetupMembers).set({ status, joinedAt: status === 'approved' ? new Date() : null, updatedAt: new Date() })
              .where(eq(meetupMembers.id, existing.id))
          } else {
            await tx.insert(meetupMembers).values({ meetupId: meetup.id, userId, status, joinedAt: status === 'approved' ? new Date() : null })
          }
          return { status }
        })
        if ('error' in result) {
          if (result.error === 'NOT_FOUND') return jsonError('This meetup is unavailable.', 404, 'MEETUP_NOT_FOUND')
          if (result.error === 'HOST') return jsonError('You are already hosting this meetup.', 409, 'ALREADY_HOST')
          return jsonError('This meetup has reached capacity.', 409, 'MEETUP_FULL')
        }
        return jsonOk({ membershipStatus: result.status })
      } catch (error) {
        console.error('Meetup join failed', error)
        return jsonError('We could not process your request.', 500, 'MEETUP_JOIN_FAILED')
      }
    },
    DELETE: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to leave a meetup.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid meetup.', 400, 'INVALID_MEETUP')
        const db = getDb()
        const [meetup] = await db.select({ hostId: meetups.hostId }).from(meetups).where(eq(meetups.id, parsed.data.meetupId)).limit(1)
        if (!meetup) return jsonError('Meetup not found.', 404, 'MEETUP_NOT_FOUND')
        if (meetup.hostId === userId) return jsonError('Hosts cannot leave their own meetup.', 409, 'HOST_CANNOT_LEAVE')
        await db.update(meetupMembers).set({ status: 'left', joinedAt: null, updatedAt: new Date() })
          .where(and(eq(meetupMembers.meetupId, parsed.data.meetupId), eq(meetupMembers.userId, userId)))
        return jsonOk({ membershipStatus: 'left' })
      } catch (error) {
        console.error('Meetup leave failed', error)
        return jsonError('We could not leave this meetup.', 500, 'MEETUP_LEAVE_FAILED')
      }
    },
  } },
})
