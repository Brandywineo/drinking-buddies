import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../db'
import { profiles, squadMembers, squadMessages } from '../../../db/schema'
import { getAuthenticatedUserId } from '../../../lib/session'
import { jsonError, jsonOk } from '../../../lib/http'

const paramsSchema = z.object({ squadId: z.string().uuid() })
const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) }).strict()

async function canReadSquad(squadId: string, userId: string) {
  const [member] = await getDb().select({ id: squadMembers.id }).from(squadMembers).where(and(
    eq(squadMembers.squadId, squadId), eq(squadMembers.userId, userId), eq(squadMembers.status, 'active'),
  )).limit(1)
  return Boolean(member)
}

export const Route = createFileRoute('/api/squads/$squadId/messages')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to view squad discussions.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid squad.', 400, 'INVALID_SQUAD')
        if (!await canReadSquad(parsed.data.squadId, userId)) return jsonError('Join this squad to view its discussion.', 403, 'SQUAD_MEMBERSHIP_REQUIRED')
        const rows = await getDb().select({
          id: squadMessages.id, senderId: squadMessages.senderId, body: squadMessages.body,
          createdAt: squadMessages.createdAt, senderName: profiles.displayName,
        }).from(squadMessages).leftJoin(profiles, eq(profiles.userId, squadMessages.senderId))
          .where(eq(squadMessages.squadId, parsed.data.squadId)).orderBy(desc(squadMessages.createdAt)).limit(60)
        return jsonOk({ messages: rows.reverse() })
      } catch (error) {
        console.error('Squad messages lookup failed', error)
        return jsonError('We could not load squad discussion.', 500, 'SQUAD_MESSAGES_FAILED')
      }
    },
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to post in a squad.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid squad.', 400, 'INVALID_SQUAD')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const body = messageSchema.safeParse(raw)
        if (!body.success) return jsonError('Message must contain 1–2000 characters.', 400, 'INVALID_MESSAGE')
        if (!await canReadSquad(parsed.data.squadId, userId)) return jsonError('Join this squad to post.', 403, 'SQUAD_MEMBERSHIP_REQUIRED')
        const [message] = await getDb().insert(squadMessages).values({
          squadId: parsed.data.squadId, senderId: userId, body: body.data.body,
        }).returning()
        return jsonOk({ message }, 201)
      } catch (error) {
        console.error('Squad message send failed', error)
        return jsonError('We could not send your message.', 500, 'SQUAD_MESSAGE_SEND_FAILED')
      }
    },
  } },
})
