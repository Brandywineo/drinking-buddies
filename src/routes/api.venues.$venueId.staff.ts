import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { profiles, users, venueStaff } from '../db/schema'
import { canManageVenue } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const schema = z.object({ email: z.string().email().max(320), role: z.enum(['manager','staff']).default('staff') }).strict()

export const Route = createFileRoute('/api/venues/$venueId/staff')({
  server: { handlers: {
    GET: async ({ request, params }) => {
      try {
        const actorId = await getAuthenticatedUserId(request)
        if (!actorId) return jsonError('Sign in to view venue staff.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const access = await canManageVenue(id.data, actorId)
        if (!access.role || access.role === 'staff') return jsonError('Only owners and managers can view the team.', 403, 'VENUE_FORBIDDEN')
        const staff = await getDb().select({
          id: venueStaff.id, userId: venueStaff.userId, role: venueStaff.role, status: venueStaff.status,
          displayName: profiles.displayName, email: users.email,
        }).from(venueStaff).innerJoin(users, eq(users.id, venueStaff.userId))
          .leftJoin(profiles, eq(profiles.userId, users.id)).where(eq(venueStaff.venueId, id.data))
        return jsonOk({ staff })
      } catch (error) {
        console.error('Venue staff lookup failed', error)
        return jsonError('We could not load venue staff.', 500, 'VENUE_STAFF_FAILED')
      }
    },
    POST: async ({ request, params }) => {
      try {
        const actorId = await getAuthenticatedUserId(request)
        if (!actorId) return jsonError('Sign in to invite venue staff.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.venueId)
        if (!id.success) return jsonError('Invalid venue.', 400, 'INVALID_VENUE')
        const access = await canManageVenue(id.data, actorId)
        if (!access.role || access.role === 'staff') return jsonError('Only owners and managers can invite staff.', 403, 'VENUE_FORBIDDEN')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = schema.safeParse(raw)
        if (!parsed.success) return jsonError('Provide a valid email and role.', 400, 'INVALID_INVITE')
        const email = parsed.data.email.trim().toLowerCase()
        const [target] = await getDb().select({ id: users.id }).from(users).where(eq(users.emailNormalized, email)).limit(1)
        if (!target || target.id === actorId) return jsonError('That registered account could not be invited.', 404, 'USER_NOT_FOUND')
        const [staff] = await getDb().insert(venueStaff).values({
          venueId: id.data, userId: target.id, role: parsed.data.role, status: 'invited',
        }).onConflictDoUpdate({
          target: [venueStaff.venueId, venueStaff.userId],
          set: { role: parsed.data.role, status: 'invited' },
        }).returning({ id: venueStaff.id, role: venueStaff.role, status: venueStaff.status })
        return jsonOk({ staff, message: 'Invitation created. The invited account must accept it.' }, 201)
      } catch (error) {
        console.error('Venue staff invite failed', error)
        return jsonError('We could not invite this staff member.', 500, 'VENUE_INVITE_FAILED')
      }
    },
  } },
})
