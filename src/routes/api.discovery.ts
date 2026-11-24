import { createFileRoute } from '@tanstack/react-router'
import { and, eq, ilike, ne, notExists, or, isNull, sql, inArray, gt } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { goingOutPlans, matches, profileLikes, profilePasses, profiles, userBlocks, users } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const querySchema = z.object({ area: z.string().trim().max(120).optional(), mode: z.enum(['social', 'friendship', 'dating']).default('social') })

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

      const intentFilter = parsed.data.mode === 'friendship' ? 'friendship' : parsed.data.mode === 'dating' ? 'social_and_dating' : null
      const candidates = await db.select({
        id: users.id, displayName: profiles.displayName, avatarUrl: sql<string | null>`CASE WHEN ${profiles.avatarUrl} IS NOT NULL THEN '/api/profile/photo/' || ${users.id}::text ELSE NULL END`, bio: profiles.bio, gender: profiles.gender,
        preferredGenders: profiles.preferredGenders, interests: profiles.interests, preferredDrinks: profiles.preferredDrinks,
        connectionIntents: profiles.connectionIntents, homeArea: profiles.homeArea,
        locationVisibility: profiles.locationVisibility,
        displayPopularityScore: profiles.displayPopularityScore,
        displayReputationScore: profiles.displayReputationScore,
        popularityScore: sql<number>`(SELECT COUNT(*)::int * 5 FROM profile_likes WHERE to_user_id = ${users.id}) + (SELECT COUNT(*)::int * 3 FROM matches WHERE ended_at IS NULL AND (user_low_id = ${users.id} OR user_high_id = ${users.id}))`,
        reputationScore: sql<number>`(SELECT COUNT(*)::int * 10 FROM meetup_bookings WHERE attendee_id = ${users.id} AND status = 'attended') + (SELECT COUNT(*)::int * 5 FROM meetups WHERE host_id = ${users.id})`,
      }).from(profiles).innerJoin(users, eq(users.id, profiles.userId))
        .where(and(
          eq(users.status, 'active'), eq(profiles.discoverable, true), ne(users.id, userId),
          ...(intentFilter ? [sql`${profiles.connectionIntents} @> ${JSON.stringify([intentFilter])}::jsonb`] : []),
          ...(parsed.data.area ? [eq(profiles.locationVisibility, 'public'), ilike(profiles.homeArea, `%${parsed.data.area}%`)] : []),
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

      const candidateIds = candidates.map((candidate) => candidate.id)
      const activePlans = candidateIds.length ? await db.select().from(goingOutPlans).where(and(inArray(goingOutPlans.userId, candidateIds), eq(goingOutPlans.status, 'active'), gt(goingOutPlans.endsAt, new Date()))) : []
      const planByUser = new Map(activePlans.map((plan) => [plan.userId, plan]))
      const viewerPrefs = Array.isArray(viewer.preferredGenders) ? viewer.preferredGenders : []
      const compatible = candidates.filter((candidate) => {
        const candidatePrefs = Array.isArray(candidate.preferredGenders) ? candidate.preferredGenders : []
        const viewerGenderOk = viewerPrefs.length === 0 || (candidate.gender ? viewerPrefs.includes(candidate.gender) : false)
        const candidateGenderOk = candidatePrefs.length === 0 || (viewer.gender ? candidatePrefs.includes(viewer.gender) : false)
        return viewerGenderOk && candidateGenderOk
      }).sort((a, b) => Number(planByUser.has(b.id)) - Number(planByUser.has(a.id)) || (planByUser.get(a.id)?.startsAt.getTime() ?? Number.MAX_SAFE_INTEGER) - (planByUser.get(b.id)?.startsAt.getTime() ?? Number.MAX_SAFE_INTEGER)).slice(0, 30)
      return jsonOk({ profiles: compatible.map(({ preferredGenders: _privatePreferences, locationVisibility, displayPopularityScore, displayReputationScore, popularityScore, reputationScore, ...profile }) => ({
        ...profile,
        goingOut: planByUser.has(profile.id) ? { venueName: planByUser.get(profile.id)!.venueName, area: planByUser.get(profile.id)!.area, startsAt: planByUser.get(profile.id)!.startsAt, endsAt: planByUser.get(profile.id)!.endsAt, drinks: planByUser.get(profile.id)!.drinks, drinkQuantity: planByUser.get(profile.id)!.drinkQuantity, intention: planByUser.get(profile.id)!.intention, note: planByUser.get(profile.id)!.note } : null,
        homeArea: locationVisibility === 'public' ? profile.homeArea : null,
        ...(displayPopularityScore ? { popularityScore: Number(popularityScore ?? 0) } : {}),
        ...(displayReputationScore ? { reputationScore: Number(reputationScore ?? 0) } : {}),
      })) })
    } catch (error) {
      console.error('Discovery failed', error)
      return jsonError('We could not load discovery right now.', 500, 'DISCOVERY_FAILED')
    }
  } } },
})
