import { createFileRoute } from '@tanstack/react-router'
import { and, count, eq, exists, gt, or } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { goOutPlanMembers, goOutPlans, profiles } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const createSchema = z.object({
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().max(500).nullable().optional(),
  area: z.string().trim().min(2).max(160),
  venueName: z.string().trim().max(160).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().min(2).max(50).default(8),
  visibility: z.enum(['public', 'private']).default('public'),
}).strict()

export const Route = createFileRoute('/api/go-out')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        const db = getDb()
        const access = userId
          ? or(
              eq(goOutPlans.visibility, 'public'),
              eq(goOutPlans.creatorId, userId),
              exists(db.select({ id: goOutPlanMembers.id }).from(goOutPlanMembers).where(and(
                eq(goOutPlanMembers.planId, goOutPlans.id),
                eq(goOutPlanMembers.userId, userId),
                eq(goOutPlanMembers.status, 'going'),
              ))),
            )
          : eq(goOutPlans.visibility, 'public')
        const rows = await db.select({
          id: goOutPlans.id, creatorId: goOutPlans.creatorId, title: goOutPlans.title,
          description: goOutPlans.description, area: goOutPlans.area, venueName: goOutPlans.venueName,
          startsAt: goOutPlans.startsAt, capacity: goOutPlans.capacity, visibility: goOutPlans.visibility,
          creatorName: profiles.displayName,
        }).from(goOutPlans).leftJoin(profiles, eq(profiles.userId, goOutPlans.creatorId))
          .where(and(eq(goOutPlans.status, 'open'), gt(goOutPlans.startsAt, new Date()), access))
          .orderBy(goOutPlans.startsAt).limit(100)
        const plans = await Promise.all(rows.map(async (row) => {
          const [memberCount] = await db.select({ value: count() }).from(goOutPlanMembers)
            .where(and(eq(goOutPlanMembers.planId, row.id), eq(goOutPlanMembers.status, 'going')))
          const [mine] = userId ? await db.select({ status: goOutPlanMembers.status }).from(goOutPlanMembers)
            .where(and(eq(goOutPlanMembers.planId, row.id), eq(goOutPlanMembers.userId, userId))).limit(1) : []
          return { ...row, creatorName: row.creatorName ?? 'Community member', goingCount: memberCount?.value ?? 0, myStatus: mine?.status ?? null }
        }))
        return jsonOk({ plans })
      } catch (error) {
        console.error('Go Out listing failed', error)
        return jsonError('We could not load going-out plans.', 500, 'GO_OUT_LIST_FAILED')
      }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to create a plan.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = createSchema.safeParse(raw)
        if (!parsed.success) return jsonError('Check the plan details and try again.', 400, 'INVALID_PLAN')
        const startsAt = new Date(parsed.data.startsAt)
        if (startsAt <= new Date()) return jsonError('Choose a future date and time.', 400, 'INVALID_PLAN_TIME')
        const db = getDb()
        const created = await db.transaction(async (tx) => {
          const [plan] = await tx.insert(goOutPlans).values({
            creatorId: userId, title: parsed.data.title, description: parsed.data.description ?? null,
            area: parsed.data.area, venueName: parsed.data.venueName ?? null, startsAt,
            capacity: parsed.data.capacity, visibility: parsed.data.visibility,
          }).returning()
          await tx.insert(goOutPlanMembers).values({ planId: plan.id, userId, status: 'going' })
          return plan
        })
        return jsonOk({ plan: created }, 201)
      } catch (error) {
        console.error('Go Out creation failed', error)
        return jsonError('We could not create this plan.', 500, 'GO_OUT_CREATE_FAILED')
      }
    },
  } },
})
