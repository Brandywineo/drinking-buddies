import { createFileRoute } from '@tanstack/react-router'
import { and, count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { meetupMembers, meetups } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ meetupId: z.string().uuid(), userId: z.string().uuid() })
const bodySchema = z.object({ status: z.enum(['approved', 'declined']) }).strict()

export const Route = createFileRoute('/api/meetups/$meetupId/members/$userId')({
  server: { handlers: { PATCH: async ({ request, params }) => {
    try {
      const hostId = await getAuthenticatedUserId(request)
      if (!hostId) return jsonError('Sign in to manage meetup requests.', 401, 'UNAUTHENTICATED')
      const parsedParams = paramsSchema.safeParse(params)
      if (!parsedParams.success) return jsonError('Invalid meetup member.', 400, 'INVALID_MEMBER')
      let body: unknown
      try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsedBody = bodySchema.safeParse(body)
      if (!parsedBody.success) return jsonError('Choose approve or decline.', 400, 'INVALID_STATUS')
      const db = getDb()
      const [meetup] = await db.select({ hostId: meetups.hostId, capacity: meetups.capacity }).from(meetups)
        .where(eq(meetups.id, parsedParams.data.meetupId)).limit(1)
      if (!meetup) return jsonError('Meetup not found.', 404, 'MEETUP_NOT_FOUND')
      if (meetup.hostId !== hostId) return jsonError('Only the host can manage join requests.', 403, 'FORBIDDEN')
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM meetups WHERE id = ${parsedParams.data.meetupId} FOR UPDATE`)
        const [member] = await tx.select().from(meetupMembers).where(and(
          eq(meetupMembers.meetupId, parsedParams.data.meetupId),
          eq(meetupMembers.userId, parsedParams.data.userId),
        )).limit(1)
        if (!member || member.status !== 'requested') return { error: 'REQUEST_NOT_FOUND' as const }
        if (parsedBody.data.status === 'approved') {
          const [members] = await tx.select({ value: count() }).from(meetupMembers).where(and(
            eq(meetupMembers.meetupId, parsedParams.data.meetupId), eq(meetupMembers.status, 'approved'),
          ))
          if ((members?.value ?? 0) >= meetup.capacity) return { error: 'MEETUP_FULL' as const }
        }
        await tx.update(meetupMembers).set({
          status: parsedBody.data.status,
          joinedAt: parsedBody.data.status === 'approved' ? new Date() : null,
          updatedAt: new Date(),
        }).where(eq(meetupMembers.id, member.id))
        return { userId: member.userId, status: parsedBody.data.status }
      })
      if ('error' in result) {
        return result.error === 'MEETUP_FULL'
          ? jsonError('This meetup has reached capacity.', 409, 'MEETUP_FULL')
          : jsonError('No pending request was found.', 404, 'REQUEST_NOT_FOUND')
      }
      return jsonOk(result)
    } catch (error) {
      console.error('Meetup member update failed', error)
      return jsonError('We could not update this join request.', 500, 'MEETUP_MEMBER_UPDATE_FAILED')
    }
  } } },
})
