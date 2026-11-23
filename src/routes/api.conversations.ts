import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { getDb } from '../db'
import { conversations, matches, meetupMembers, meetups, messages, profiles, userBlocks } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/conversations')({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to view conversations.', 401, 'UNAUTHENTICATED')
      const db = getDb()
      const matchRows = await db.select({
        id: conversations.id, kind: conversations.kind, createdAt: conversations.createdAt,
        matchId: matches.id, userLowId: matches.userLowId, userHighId: matches.userHighId,
      }).from(conversations).innerJoin(matches, eq(matches.id, conversations.matchId))
        .where(and(
          eq(conversations.kind, 'match'), isNull(matches.endedAt),
          or(eq(matches.userLowId, userId), eq(matches.userHighId, userId)),
        ))
      const visibleMatches = []
      for (const row of matchRows) {
        const peerId = row.userLowId === userId ? row.userHighId : row.userLowId
        const [blocked] = await db.select({ id: userBlocks.id }).from(userBlocks).where(or(
          and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, peerId)),
          and(eq(userBlocks.blockerId, peerId), eq(userBlocks.blockedId, userId)),
        )).limit(1)
        if (blocked) continue
        const [peer] = await db.select({ id: profiles.userId, displayName: profiles.displayName })
          .from(profiles).where(eq(profiles.userId, peerId)).limit(1)
        if (peer) visibleMatches.push({ id: row.id, kind: row.kind, createdAt: row.createdAt, peer })
      }
      const meetupRows = await db.select({
        id: conversations.id, createdAt: conversations.createdAt, meetupId: meetups.id,
        title: meetups.title, area: meetups.area, hostId: meetups.hostId,
      }).from(conversations).innerJoin(meetups, eq(meetups.id, conversations.meetupId))
        .leftJoin(meetupMembers, and(eq(meetupMembers.meetupId, meetups.id), eq(meetupMembers.userId, userId)))
        .where(and(eq(conversations.kind, 'meetup'), or(
          eq(meetups.hostId, userId), eq(meetupMembers.status, 'approved'),
        )))
      const items = [
        ...visibleMatches,
        ...meetupRows.map((row) => ({ id: row.id, kind: 'meetup' as const, createdAt: row.createdAt, meetup: { id: row.meetupId, title: row.title, area: row.area } })),
      ]
      const withActivity = await Promise.all(items.map(async (item) => {
        const [lastMessage] = await db.select({
          body: messages.body, createdAt: messages.createdAt, senderId: messages.senderId,
        }).from(messages).where(eq(messages.conversationId, item.id))
          .orderBy(desc(messages.createdAt)).limit(1)
        return { ...item, lastMessage: lastMessage ?? null, lastActivityAt: lastMessage?.createdAt ?? item.createdAt }
      }))
      withActivity.sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
      return jsonOk({ conversations: withActivity })
    } catch (error) {
      console.error('Conversation list failed', error)
      return jsonError('We could not load your conversations.', 500, 'CONVERSATIONS_FAILED')
    }
  } } },
})
