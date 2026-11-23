import { createFileRoute } from '@tanstack/react-router'
import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { favoriteProfiles, favoriteVenues, profiles, userBlocks, users, venues } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const favoriteSchema = z.object({
  type: z.enum(['person', 'venue']),
  targetId: z.string().uuid(),
}).strict()

export const Route = createFileRoute('/api/favorites')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to view your favourites.', 401, 'UNAUTHENTICATED')
        const db = getDb()
        const [people, places] = await Promise.all([
          db.select({
            id: favoriteProfiles.targetUserId,
            displayName: profiles.displayName,
            homeArea: profiles.homeArea,
            createdAt: favoriteProfiles.createdAt,
          }).from(favoriteProfiles).innerJoin(profiles, eq(profiles.userId, favoriteProfiles.targetUserId))
            .where(eq(favoriteProfiles.userId, userId)),
          db.select({
            id: favoriteVenues.venueId,
            name: venues.name,
            area: venues.area,
            city: venues.city,
            createdAt: favoriteVenues.createdAt,
          }).from(favoriteVenues).innerJoin(venues, eq(venues.id, favoriteVenues.venueId))
            .where(eq(favoriteVenues.userId, userId)),
        ])
        return jsonOk({ people, venues: places })
      } catch (error) {
        console.error('Favourites lookup failed', error)
        return jsonError('We could not load your favourites.', 500, 'FAVOURITES_FAILED')
      }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to save favourites.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = favoriteSchema.safeParse(raw)
        if (!parsed.success) return jsonError('Choose a valid person or venue.', 400, 'INVALID_FAVOURITE')
        const db = getDb()
        if (parsed.data.type === 'person') {
          if (parsed.data.targetId === userId) return jsonError('You cannot favourite your own profile.', 400, 'INVALID_FAVOURITE')
          const [target] = await db.select({ id: users.id }).from(users).innerJoin(profiles, eq(profiles.userId, users.id))
            .where(and(eq(users.id, parsed.data.targetId), eq(users.status, 'active'), eq(profiles.discoverable, true))).limit(1)
          if (!target) return jsonError('That profile is not available.', 404, 'PROFILE_NOT_FOUND')
          const [blocked] = await db.select({ id: userBlocks.id }).from(userBlocks).where(or(
            and(eq(userBlocks.blockerId, userId), eq(userBlocks.blockedId, parsed.data.targetId)),
            and(eq(userBlocks.blockerId, parsed.data.targetId), eq(userBlocks.blockedId, userId)),
          )).limit(1)
          if (blocked) return jsonError('That profile is not available.', 404, 'PROFILE_NOT_FOUND')
          await db.insert(favoriteProfiles).values({ userId, targetUserId: parsed.data.targetId }).onConflictDoNothing()
        } else {
          const [venue] = await db.select({ id: venues.id }).from(venues).where(and(
            eq(venues.id, parsed.data.targetId), eq(venues.approvalStatus, 'approved'), eq(venues.isPublished, true),
          )).limit(1)
          if (!venue) return jsonError('That venue is not available.', 404, 'VENUE_NOT_FOUND')
          await db.insert(favoriteVenues).values({ userId, venueId: parsed.data.targetId }).onConflictDoNothing()
        }
        return jsonOk({ saved: true })
      } catch (error) {
        console.error('Favourite save failed', error)
        return jsonError('We could not save that favourite.', 500, 'FAVOURITE_SAVE_FAILED')
      }
    },
    DELETE: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to manage favourites.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = favoriteSchema.safeParse(raw)
        if (!parsed.success) return jsonError('Choose a valid person or venue.', 400, 'INVALID_FAVOURITE')
        const db = getDb()
        if (parsed.data.type === 'person') {
          await db.delete(favoriteProfiles).where(and(
            eq(favoriteProfiles.userId, userId), eq(favoriteProfiles.targetUserId, parsed.data.targetId),
          ))
        } else {
          await db.delete(favoriteVenues).where(and(
            eq(favoriteVenues.userId, userId), eq(favoriteVenues.venueId, parsed.data.targetId),
          ))
        }
        return jsonOk({ removed: true })
      } catch (error) {
        console.error('Favourite removal failed', error)
        return jsonError('We could not remove that favourite.', 500, 'FAVOURITE_REMOVE_FAILED')
      }
    },
  } },
})
