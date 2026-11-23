import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venueStaff } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/venue-staff/$staffId/accept')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to accept this invitation.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.staffId)
        if (!id.success) return jsonError('Invalid invitation.', 400, 'INVALID_INVITATION')
        const [staff] = await getDb().update(venueStaff).set({ status: 'active' })
          .where(and(eq(venueStaff.id, id.data), eq(venueStaff.userId, userId), eq(venueStaff.status, 'invited')))
          .returning({ id: venueStaff.id, venueId: venueStaff.venueId, role: venueStaff.role })
        if (!staff) return jsonError('Invitation not found.', 404, 'INVITATION_NOT_FOUND')
        return jsonOk({ staff })
      } catch (error) {
        console.error('Venue invitation acceptance failed', error)
        return jsonError('We could not accept this invitation.', 500, 'INVITATION_ACCEPT_FAILED')
      }
    },
  } },
})
