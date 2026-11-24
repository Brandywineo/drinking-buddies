import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { profiles } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { getProfileStats } from '../lib/profile-stats'
import { jsonError, jsonOk } from '../lib/http'

const profileSchema = z.object({
  displayName: z.string().trim().min(2).max(48),
  bio: z.string().trim().max(500).nullable().optional(),
  gender: z.string().trim().max(32).nullable().optional(),
  discoverable: z.boolean().optional(),
  displayPopularityScore: z.boolean().optional(),
  displayReputationScore: z.boolean().optional(),
  locationVisibility: z.enum(['private', 'matches', 'public']).optional(),
  preferredGenders: z.array(z.string().trim().min(1).max(32)).max(10).optional(),
  connectionIntents: z.array(z.enum(['drinking_buddies', 'friendship', 'social_and_dating', 'group_outings'])).max(4).optional(),
  interests: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
  preferredDrinks: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  homeArea: z.string().trim().max(120).nullable().optional(),
}).strict()

export const Route = createFileRoute('/api/profile')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to view your profile.', 401, 'UNAUTHENTICATED')
        const [profile] = await getDb().select().from(profiles).where(eq(profiles.userId, userId)).limit(1)
        const stats = profile ? await getProfileStats(userId) : null
        return jsonOk({ profile: profile ? { ...profile, avatarUrl: profile.avatarUrl ? `/api/profile/photo/${userId}` : null } : null, stats })
      } catch (error) {
        console.error('Profile lookup failed', error)
        return jsonError('We could not load your profile.', 500, 'PROFILE_LOOKUP_FAILED')
      }
    },
    PUT: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to update your profile.', 401, 'UNAUTHENTICATED')
        let body: unknown
        try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = profileSchema.safeParse(body)
        if (!parsed.success) return jsonError('Please check your profile details and try again.', 400, 'INVALID_PROFILE')
        const [profile] = await getDb().insert(profiles).values({ userId, ...parsed.data })
          .onConflictDoUpdate({ target: profiles.userId, set: { ...parsed.data, updatedAt: new Date() } })
          .returning()
        const stats = await getProfileStats(userId)
        return jsonOk({ profile: profile ? { ...profile, avatarUrl: profile.avatarUrl ? `/api/profile/photo/${userId}` : null } : null, stats })
      } catch (error) {
        console.error('Profile update failed', error)
        return jsonError('We could not save your profile.', 500, 'PROFILE_UPDATE_FAILED')
      }
    },
  } },
})
