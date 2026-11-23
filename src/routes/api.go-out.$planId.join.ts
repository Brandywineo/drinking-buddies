import { createFileRoute } from '@tanstack/react-router'
import { and, count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { goOutPlanMembers, goOutPlans } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ planId: z.string().uuid() })

export const Route = createFileRoute('/api/go-out/$planId/join')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to join this plan.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid plan.', 400, 'INVALID_PLAN')
        const db = getDb()
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM go_out_plans WHERE id = ${parsed.data.planId} FOR UPDATE`)
          const [plan] = await tx.select().from(goOutPlans).where(eq(goOutPlans.id, parsed.data.planId)).limit(1)
          if (!plan || plan.status !== 'open' || plan.startsAt <= new Date()) return { error: 'NOT_FOUND' as const }
          if (plan.visibility !== 'public' && plan.creatorId !== userId) return { error: 'PRIVATE' as const }
          if (plan.creatorId === userId) return { status: 'going' as const }
          const [existing] = await tx.select().from(goOutPlanMembers).where(and(
            eq(goOutPlanMembers.planId, plan.id), eq(goOutPlanMembers.userId, userId),
          )).limit(1)
          if (existing?.status === 'going') return { status: 'going' as const }
          const [members] = await tx.select({ value: count() }).from(goOutPlanMembers).where(and(
            eq(goOutPlanMembers.planId, plan.id), eq(goOutPlanMembers.status, 'going'),
          ))
          if ((members?.value ?? 0) >= plan.capacity) return { error: 'FULL' as const }
          if (existing) {
            await tx.update(goOutPlanMembers).set({ status: 'going', createdAt: new Date() }).where(eq(goOutPlanMembers.id, existing.id))
          } else {
            await tx.insert(goOutPlanMembers).values({ planId: plan.id, userId, status: 'going' })
          }
          return { status: 'going' as const }
        })
        if ('error' in result) {
          if (result.error === 'NOT_FOUND') return jsonError('This plan is no longer available.', 404, 'PLAN_NOT_FOUND')
          if (result.error === 'PRIVATE') return jsonError('This is a private plan.', 403, 'PLAN_PRIVATE')
          return jsonError('This plan is full.', 409, 'PLAN_FULL')
        }
        return jsonOk({ membershipStatus: result.status })
      } catch (error) {
        console.error('Go Out join failed', error)
        return jsonError('We could not join this plan.', 500, 'GO_OUT_JOIN_FAILED')
      }
    },
    DELETE: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to leave this plan.', 401, 'UNAUTHENTICATED')
        const parsed = paramsSchema.safeParse(params)
        if (!parsed.success) return jsonError('Invalid plan.', 400, 'INVALID_PLAN')
        const db = getDb()
        const [plan] = await db.select({ creatorId: goOutPlans.creatorId }).from(goOutPlans)
          .where(eq(goOutPlans.id, parsed.data.planId)).limit(1)
        if (!plan) return jsonError('Plan not found.', 404, 'PLAN_NOT_FOUND')
        if (plan.creatorId === userId) return jsonError('The creator cannot leave their own plan.', 409, 'PLAN_CREATOR')
        await db.update(goOutPlanMembers).set({ status: 'left' }).where(and(
          eq(goOutPlanMembers.planId, parsed.data.planId), eq(goOutPlanMembers.userId, userId),
        ))
        return jsonOk({ membershipStatus: 'left' })
      } catch (error) {
        console.error('Go Out leave failed', error)
        return jsonError('We could not leave this plan.', 500, 'GO_OUT_LEAVE_FAILED')
      }
    },
  } },
})
