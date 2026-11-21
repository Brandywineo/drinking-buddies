import { createFileRoute } from '@tanstack/react-router'
import { and, eq, ilike, ne, notExists, or, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { matches, profileLikes, profilePasses, profiles, userBlocks, users } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const querySchema = z.object({ area: z.string().trim().max(120).optional() })

export const Route = createFileRoute('/api/discovery')({
  server: { handlers: { GET: async ({ request }) => {
    try {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to discover people.', 401, 'UNAUTHENTICATED')
      const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
      if (!parsed.success) return jsonError('Invalid discovery filters.', 400, 'INVALID_FILTERS')
      const db = getDb()
      const [viewer] = await db.select({ gender: profiles.gender, preferredGenders: profiles.preferredGenders })
        .from(profiles).where(eq(profiles.userId, userId)).limit(1)
      if (!viewer) return jsonError('Complete your profile before discovering people.', 409, 'PROFILE_REQUIRED')

      const candidates = await db.select({
        id: users.id, displayName: profiles.displayName, bio: profiles.bio, gender: profiles.gender,
        preferredGenders: profiles.preferredGenders, interests: profiles.interests,
        connectionIntents: profiles.connectionIntents, homeArea: profiles.homeArea,
      }).from(profiles).innerJoin(users, eq(users.id, profiles.userId))
        .where(and(
          eq(users.status, 'active'), eq(profiles.discoverable, true), ne(users.id, userId),
          ...(parsed.data.area ? [ilike(profiles.homeArea, `%${parsed.data.area}%`)] : []),
          notExists(db.select({ id: profileLikes.id }).from(profileLikes).where(and(eq(profileLikes.fromUserId, userId), eq(profileLikes.toUserId, users.id)))),
          notExists(db.select({ id: profilePasses.id }).from(profilePasses).where(and(eq(profilePasses.fromUserId, userId), eq(profilePasses.toUserId, users.id)))),
          notExists(db.select({ id: matches.id }).from(matches).where(and(
            isNull(matches.endedAt),
            or(
              and(eq(matches.userLowId, userId), eq(matches.userHighId, users.id)),
              and(eq(matches.userLowId, users.id), eq(matches.userHighId, userId)),
            ),
          ))),
          notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, users.id)))),
          notExists(db.select({ id: userBlocks.id }).from(userBlocks).where(and(eq(userBlocks.blockerId, users.id), eq(userBlocks.blockedId, userId)))),
        )).limit(100)

      const viewerPrefs = Array.isArray(viewer.preferredGenders) ? viewer.preferredGenders : []
      const compatible = candidates.filter((candidate) => {
        const candidatePrefs = Array.isArray(candidate.preferredGenders) ? candidate.preferredGenders : []
        const viewerGenderOk = viewerPrefs.length === 0 || (candidate.gender ? viewerPrefs.includes(candidate.gender) : false)
        const candidateGenderOk = candidatePrefs.length === 0 || (viewer.gender ? candidatePrefs.includes(viewer.gender) : false)
        return viewerGenderOk && candidateGenderOk
      }).slice(0, 30)
      return jsonOk({ profiles: compatible })
    } catch (error) {
      console.error('Discovery failed', error)
      return jsonError('We could not load discovery right now.', 500, 'DISCOVERY_FAILED')
    }
  } } },
})
