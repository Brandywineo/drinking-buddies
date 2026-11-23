import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../../../db'
import { squadMembers, squads } from '../../../db/schema'
import { getAuthenticatedUserId } from '../../../lib/session'
import { jsonError, jsonOk } from '../../../lib/http'

const paramsSchema = z.object({ squadId: z.string().uuid() })

export const Route = createFileRoute('/api/squads/$squadId/join')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to join a squad.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid squad.', 400, 'INVALID_SQUAD')
        const db = getDb()
        const [squad] = await db.select().from(squads).where(eq(squads.id, parsed.data.squadId)).limit(1)
        if (!squad) return jsonError('Squad not found.', 404, 'SQUAD_NOT_FOUND')
        const [existing] = await db.select().from(squadMembers).where(and(
          eq(squadMembers.squadId, squad.id), eq(squadMembers.userId, userId),
        )).limit(1)
        if (existing?.status === 'active') return jsonOk({ membershipStatus: 'active' })
        if (squad.visibility === 'private' && existing?.status !== 'invited') return jsonError('This squad is invite-only.', 403, 'SQUAD_PRIVATE')
        if (existing) {
          await db.update(squadMembers).set({ status: 'active', role: 'member' }).where(eq(squadMembers.id, existing.id))
        } else {
          await db.insert(squadMembers).values({ squadId: squad.id, userId, role: 'member', status: 'active' })
        }
        return jsonOk({ membershipStatus: 'active' })
      } catch (error) {
        console.error('Squad join failed', error)
        return jsonError('We could not join this squad.', 500, 'SQUAD_JOIN_FAILED')
      }
    },
    DELETE: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to leave a squad.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid squad.', 400, 'INVALID_SQUAD')
        const db = getDb()
        const [squad] = await db.select({ ownerId: squads.ownerId }).from(squads).where(eq(squads.id, parsed.data.squadId)).limit(1)
        if (!squad) return jsonError('Squad not found.', 404, 'SQUAD_NOT_FOUND')
        if (squad.ownerId === userId) return jsonError('The squad owner cannot leave. Transfer ownership or delete the squad.', 409, 'SQUAD_OWNER')
        await db.update(squadMembers).set({ status: 'left' }).where(and(
          eq(squadMembers.squadId, parsed.data.squadId), eq(squadMembers.userId, userId),
        ))
        return jsonOk({ membershipStatus: 'left' })
      } catch (error) {
        console.error('Squad leave failed', error)
        return jsonError('We could not leave this squad.', 500, 'SQUAD_LEAVE_FAILED')
      }
    },
  } },
})
