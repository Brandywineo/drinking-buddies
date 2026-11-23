import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../db'
import { squadMembers, squads, users } from '../../../db/schema'
import { getAuthenticatedUserId } from '../../../lib/session'
import { jsonError, jsonOk } from '../../../lib/http'

const paramsSchema = z.object({ squadId: z.string().uuid() })
const inviteSchema = z.object({ email: z.string().trim().email().max(320) }).strict()

export const Route = createFileRoute('/api/squads/$squadId/invitations')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to invite someone.', 401, 'UNAUTHENTICATED')
        const parsedParams = paramsSchema.safeParse(params)
        if (!parsedParams.success) return jsonError('Invalid squad.', 400, 'INVALID_SQUAD')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const body = inviteSchema.safeParse(raw)
        if (!body.success) return jsonError('Enter a valid email address.', 400, 'INVALID_EMAIL')
        const db = getDb()
        const [squad] = await db.select().from(squads).where(eq(squads.id, parsedParams.data.squadId)).limit(1)
        if (!squad) return jsonError('Squad not found.', 404, 'SQUAD_NOT_FOUND')
        const [actor] = await db.select({ role: squadMembers.role }).from(squadMembers).where(and(
          eq(squadMembers.squadId, squad.id), eq(squadMembers.userId, userId), eq(squadMembers.status, 'active'),
        )).limit(1)
        if (!actor || !['owner', 'admin'].includes(actor.role)) return jsonError('Only squad admins can invite members.', 403, 'SQUAD_ADMIN_REQUIRED')
        const [invitee] = await db.select({ id: users.id, status: users.status }).from(users)
          .where(eq(users.emailNormalized, body.data.email.toLowerCase())).limit(1)
        if (!invitee || invitee.status !== 'active') return jsonError('No active Drinking Buddies account uses that email.', 404, 'USER_NOT_FOUND')
        if (invitee.id === userId) return jsonError('You are already in this squad.', 409, 'ALREADY_MEMBER')
        const [existing] = await db.select().from(squadMembers).where(and(
          eq(squadMembers.squadId, squad.id), eq(squadMembers.userId, invitee.id),
        )).limit(1)
        if (existing?.status === 'active') return jsonError('That person is already a member.', 409, 'ALREADY_MEMBER')
        if (existing) {
          await db.update(squadMembers).set({ status: 'invited', role: 'member' }).where(eq(squadMembers.id, existing.id))
        } else {
          await db.insert(squadMembers).values({ squadId: squad.id, userId: invitee.id, role: 'member', status: 'invited' })
        }
        return jsonOk({ invited: true })
      } catch (error) {
        console.error('Squad invitation failed', error)
        return jsonError('We could not send that invitation.', 500, 'SQUAD_INVITE_FAILED')
      }
    },
  } },
})
