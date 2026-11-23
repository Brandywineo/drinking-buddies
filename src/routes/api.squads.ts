import { createFileRoute } from '@tanstack/react-router'
import { and, count, eq, exists, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { profiles, squadMembers, squads } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const createSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  visibility: z.enum(['public', 'private']).default('public'),
}).strict()

export const Route = createFileRoute('/api/squads')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        const db = getDb()
        const access = userId
          ? or(
              eq(squads.visibility, 'public'),
              eq(squads.ownerId, userId),
              exists(db.select({ id: squadMembers.id }).from(squadMembers).where(and(
                eq(squadMembers.squadId, squads.id), eq(squadMembers.userId, userId),
                eq(squadMembers.status, 'active'),
              ))),
            )
          : eq(squads.visibility, 'public')
        const rows = await db.select({
          id: squads.id, ownerId: squads.ownerId, name: squads.name, description: squads.description,
          area: squads.area, visibility: squads.visibility, ownerName: profiles.displayName,
        }).from(squads).leftJoin(profiles, eq(profiles.userId, squads.ownerId)).where(access)
          .orderBy(squads.createdAt).limit(100)
        const items = await Promise.all(rows.map(async (row) => {
          const [memberCount] = await db.select({ value: count() }).from(squadMembers).where(and(
            eq(squadMembers.squadId, row.id), eq(squadMembers.status, 'active'),
          ))
          const [mine] = userId ? await db.select({ role: squadMembers.role, status: squadMembers.status }).from(squadMembers)
            .where(and(eq(squadMembers.squadId, row.id), eq(squadMembers.userId, userId))).limit(1) : []
          return { ...row, ownerName: row.ownerName ?? 'Community member', memberCount: memberCount?.value ?? 0, myRole: mine?.role ?? null, myStatus: mine?.status ?? null }
        }))
        return jsonOk({ squads: items })
      } catch (error) {
        console.error('Squad listing failed', error)
        return jsonError('We could not load squads.', 500, 'SQUADS_FAILED')
      }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to create a squad.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = createSchema.safeParse(raw)
        if (!parsed.success) return jsonError('Check your squad details and try again.', 400, 'INVALID_SQUAD')
        const db = getDb()
        const squad = await db.transaction(async (tx) => {
          const [created] = await tx.insert(squads).values({
            ownerId: userId, name: parsed.data.name, description: parsed.data.description ?? null,
            area: parsed.data.area ?? null, visibility: parsed.data.visibility,
          }).returning()
          await tx.insert(squadMembers).values({ squadId: created.id, userId, role: 'owner', status: 'active' })
          return created
        })
        return jsonOk({ squad }, 201)
      } catch (error) {
        console.error('Squad creation failed', error)
        return jsonError('We could not create this squad.', 500, 'SQUAD_CREATE_FAILED')
      }
    },
  } },
})
