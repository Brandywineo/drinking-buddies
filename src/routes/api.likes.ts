import { createFileRoute } from '@tanstack/react-router'
import { and, eq, notExists } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { conversations, matches, profileLikes, profiles, userBlocks, users } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const actionSchema = z.object({ userId: z.string().uuid() }).strict()

export const Route = createFileRoute('/api/likes')({
  server: { handlers: { POST: async ({ request }) => {
    try {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to like a profile.', 401, 'UNAUTHENTICATED')
      let body: unknown
      try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = actionSchema.safeParse(body)
      if (!parsed.success || parsed.data.userId === userId) return jsonError('Choose a valid profile.', 400, 'INVALID_TARGET')
      const targetId = parsed.data.userId
      const db = getDb()
      const [target] = await db.select({ id: users.id }).from(users).innerJoin(profiles, eq(profiles.userId, users.id))
        .where(and(
          eq(users.id, targetId), eq(users.status, 'active'), eq(profiles.discoverable, true),
          notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, users.id)))),
          notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, users.id), eq(userBlocks.blockedId, userId)))),
        )).limit(1)
      if (!target) return jsonError('That profile is not available.', 404, 'PROFILE_NOT_FOUND')

      const result = await db.transaction(async (tx) => {
        await tx.insert(profileLikes).values({ fromUserId: userId, toUserId: targetId }).onConflictDoNothing()
        const [reverseLike] = await tx.select({ id: profileLikes.id }).from(profileLikes)
          .where(and(eq(profileLikes.fromUserId, targetId), eq(profileLikes.toUserId, userId))).limit(1)
        if (!reverseLike) return { matched: false as const }
        const [low, high] = [userId, targetId].sort()
        const [match] = await tx.insert(matches).values({ userLowId: low, userHighId: high })
          .onConflictDoNothing().returning({ id: matches.id })
        let matchId = match?.id
        if (!matchId) {
          const [existing] = await tx.select({ id: matches.id }).from(matches)
            .where(and(eq(matches.userLowId, low), eq(matches.userHighId, high))).limit(1)
          matchId = existing?.id
        }
        if (matchId) await tx.insert(conversations).values({ kind: 'match', matchId }).onConflictDoNothing()
        return { matched: true as const, matchId: matchId ?? null }
      })
      return jsonOk(result, 201)
    } catch (error) {
      console.error('Like action failed', error)
      return jsonError('We could not process that like.', 500, 'LIKE_FAILED')
    }
  } } },
})
