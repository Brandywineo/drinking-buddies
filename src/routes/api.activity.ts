import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq, isNull, ne, notExists, or } from 'drizzle-orm'
import { getDb } from '../db'
import { conversations, matches, meetupMembers, meetups, memoryTags, messages, profileLikes, profiles, userBlocks } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/activity')({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to view your activity.', 401, 'UNAUTHENTICATED')
      const db = getDb()
      const [likes, tags, matchMessages, meetupMessages] = await Promise.all([
        db.select({ id: profileLikes.id, fromUserId: profileLikes.fromUserId, displayName: profiles.displayName, createdAt: profileLikes.createdAt })
          .from(profileLikes).innerJoin(profiles, eq(profiles.userId, profileLikes.fromUserId))
          .where(and(eq(profileLikes.toUserId, userId),
            notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, profileLikes.fromUserId)))),
            notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, profileLikes.fromUserId), eq(userBlocks.blockedId, userId)))),
          )).orderBy(desc(profileLikes.createdAt)).limit(20),
        db.select({ id: memoryTags.id, mediaId: memoryTags.mediaId, displayName: profiles.displayName, createdAt: memoryTags.createdAt })
          .from(memoryTags).innerJoin(profiles, eq(profiles.userId, memoryTags.taggedById))
          .where(and(eq(memoryTags.taggedUserId, userId), eq(memoryTags.status, 'pending')))
          .orderBy(desc(memoryTags.createdAt)).limit(20),
        db.select({ id: messages.id, conversationId: conversations.id, body: messages.body, senderName: profiles.displayName, createdAt: messages.createdAt })
          .from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .innerJoin(matches, eq(matches.id, conversations.matchId))
          .innerJoin(profiles, eq(profiles.userId, messages.senderId))
          .where(and(ne(messages.senderId, userId), isNull(messages.deletedAt), isNull(matches.endedAt), or(
            eq(matches.userLowId, userId), eq(matches.userHighId, userId),
          ),
            notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, messages.senderId)))),
            notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, messages.senderId), eq(userBlocks.blockedId, userId)))),
          )).orderBy(desc(messages.createdAt)).limit(20),
        db.select({ id: messages.id, conversationId: conversations.id, body: messages.body, senderName: profiles.displayName, meetupTitle: meetups.title, createdAt: messages.createdAt })
          .from(messages).innerJoin(conversations, eq(conversations.id, messages.conversationId))
          .innerJoin(meetups, eq(meetups.id, conversations.meetupId))
          .leftJoin(meetupMembers, and(eq(meetupMembers.meetupId, meetups.id), eq(meetupMembers.userId, userId)))
          .innerJoin(profiles, eq(profiles.userId, messages.senderId))
          .where(and(ne(messages.senderId, userId), isNull(messages.deletedAt), or(
            eq(meetups.hostId, userId), eq(meetupMembers.status, 'approved'),
          ),
            notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, messages.senderId)))),
            notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, messages.senderId), eq(userBlocks.blockedId, userId)))),
          )).orderBy(desc(messages.createdAt)).limit(20),
      ])
      return jsonOk({ likes, tags, messages: [...matchMessages, ...meetupMessages].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 30) })
    } catch (error) {
      console.error('Activity feed failed', error)
      return jsonError('We could not load your activity.', 500, 'ACTIVITY_FAILED')
    }
  } } },
})
