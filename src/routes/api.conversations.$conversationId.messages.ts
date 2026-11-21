import { createFileRoute } from '@tanstack/react-router'
import { and, asc, desc, eq, gt, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { conversations, matches, meetupMembers, meetups, messages, userBlocks } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ conversationId: z.string().uuid() })
const querySchema = z.object({ before: z.string().datetime().optional() })
const messageSchema = z.object({ body: z.string().trim().min(1).max(4000) }).strict()

async function canAccessConversation(db: ReturnType<typeof getDb>, conversationId: string, userId: string) {
  const [conversation] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)
  if (!conversation) return false
  if (conversation.kind === 'match' && conversation.matchId) {
    const [match] = await db.select({ userLowId: matches.userLowId, userHighId: matches.userHighId })
      .from(matches).where(and(eq(matches.id, conversation.matchId), isNull(matches.endedAt),
        or(eq(matches.userLowId, userId), eq(matches.userHighId, userId)))).limit(1)
    if (!match) return false
    const peerId = match.userLowId === userId ? match.userHighId : match.userLowId
    const [blocked] = await db.select({ id: userBlocks.id }).from(userBlocks).where(or(
      and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, peerId)),
      and(eq(userBlocks.blockerId, peerId), eq(userBlocks.blockedId, userId)),
    )).limit(1)
    return !blocked
  }
  if (conversation.kind === 'meetup' && conversation.meetupId) {
    const [meetup] = await db.select({ hostId: meetups.hostId }).from(meetups)
      .leftJoin(meetupMembers, and(eq(meetupMembers.meetupId, meetups.id), eq(meetupMembers.userId, userId)))
      .where(and(eq(meetups.id, conversation.meetupId), or(
        eq(meetups.hostId, userId), eq(meetupMembers.status, 'approved'),
      ))).limit(1)
    return Boolean(meetup)
  }
  return false
}

export const Route = createFileRoute('/api/conversations/$conversationId/messages')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to read messages.', 401, 'UNAUTHENTICATED')
        const parsedParams = paramsSchema.safeParse(params)
        const parsedQuery = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
        if (!parsedParams.success || !parsedQuery.success) return jsonError('Invalid conversation request.', 400, 'INVALID_REQUEST')
        const db = getDb()
        if (!await canAccessConversation(db, parsedParams.data.conversationId, userId)) return jsonError('Conversation not found or access denied.', 404, 'CONVERSATION_NOT_FOUND')
        const conditions = [eq(messages.conversationId, parsedParams.data.conversationId), isNull(messages.deletedAt)]
        if (parsedQuery.data.before) conditions.push(gt(messages.createdAt, new Date(0)) as never)
        const rows = await db.select({
          id: messages.id, senderId: messages.senderId, body: messages.body,
          createdAt: messages.createdAt, editedAt: messages.editedAt,
        }).from(messages).where(and(...conditions))
          .orderBy(desc(messages.createdAt)).limit(50)
        return jsonOk({ messages: rows.reverse() })
      } catch (error) {
        console.error('Message history failed', error)
        return jsonError('We could not load messages.', 500, 'MESSAGES_FAILED')
      }
    },
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to send messages.', 401, 'UNAUTHENTICATED')
        const parsedParams = paramsSchema.safeParse(params)
        if (!parsedParams.success) return jsonError('Invalid conversation.', 400, 'INVALID_CONVERSATION')
        let body: unknown
        try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsedBody = messageSchema.safeParse(body)
        if (!parsedBody.success) return jsonError('Message must contain 1–4000 characters.', 400, 'INVALID_MESSAGE')
        const db = getDb()
        if (!await canAccessConversation(db, parsedParams.data.conversationId, userId)) return jsonError('Conversation not found or access denied.', 404, 'CONVERSATION_NOT_FOUND')
        const [message] = await db.insert(messages).values({
          conversationId: parsedParams.data.conversationId, senderId: userId, body: parsedBody.data.body,
        }).returning({ id: messages.id, senderId: messages.senderId, body: messages.body, createdAt: messages.createdAt })
        return jsonOk({ message }, 201)
      } catch (error) {
        console.error('Message send failed', error)
        return jsonError('We could not send that message.', 500, 'MESSAGE_SEND_FAILED')
      }
    },
  } },
})
