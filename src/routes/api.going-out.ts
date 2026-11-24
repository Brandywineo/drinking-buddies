import { createFileRoute } from '@tanstack/react-router'
import { and, eq, gt, lt } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { goingOutPlans } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const drinks = ['Beer','KC','Mzinga','Muratina','Whisky','Vodka','Gin','Cocktails','Wine','Cider','Non-alcoholic'] as const
const planSchema = z.object({
  venueName: z.string().trim().max(160).nullable().optional(),
  area: z.string().trim().max(120).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  drinks: z.array(z.enum(drinks)).max(8).default([]),
  drinkQuantity: z.string().trim().max(80).nullable().optional(),
  intention: z.enum(['company','buddy','friends','open']).default('company'),
  note: z.string().trim().max(300).nullable().optional(),
}).strict()

export const Route = createFileRoute('/api/going-out')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to view going-out plans.', 401, 'UNAUTHENTICATED')
        const db = getDb(), now = new Date()
        await db.update(goingOutPlans).set({ status: 'expired', updatedAt: now }).where(and(eq(goingOutPlans.status, 'active'), lt(goingOutPlans.endsAt, now)))
        const [plan] = await db.select().from(goingOutPlans).where(and(eq(goingOutPlans.userId, userId), eq(goingOutPlans.status, 'active'), gt(goingOutPlans.endsAt, now))).limit(1)
        return jsonOk({ plan: plan ?? null })
      } catch (error) { console.error('Going-out plan lookup failed', error); return jsonError('Could not load your going-out plan.', 500, 'GOING_OUT_LOOKUP_FAILED') }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to publish an outing.', 401, 'UNAUTHENTICATED')
        let raw: unknown; try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = planSchema.safeParse(raw)
        if (!parsed.success) return jsonError('Check your outing details and try again.', 400, 'INVALID_GOING_OUT_PLAN')
        const startsAt = new Date(parsed.data.startsAt), endsAt = new Date(parsed.data.endsAt), now = new Date()
        if (startsAt <= now || endsAt <= startsAt || endsAt.getTime() - startsAt.getTime() > 24*60*60*1000) return jsonError('Choose a future start and an end time within 24 hours of the start.', 400, 'INVALID_GOING_OUT_TIME')
        const db = getDb()
        const [plan] = await db.insert(goingOutPlans).values({ userId, ...parsed.data, startsAt, endsAt, venueName: parsed.data.venueName ?? null, area: parsed.data.area ?? null, drinkQuantity: parsed.data.drinkQuantity ?? null, note: parsed.data.note ?? null })
          .onConflictDoUpdate({ target: goingOutPlans.userId, set: { ...parsed.data, startsAt, endsAt, venueName: parsed.data.venueName ?? null, area: parsed.data.area ?? null, drinkQuantity: parsed.data.drinkQuantity ?? null, note: parsed.data.note ?? null, status: 'active', updatedAt: now } }).returning()
        return jsonOk({ plan }, 201)
      } catch (error) { console.error('Going-out plan create failed', error); return jsonError('Could not publish your outing.', 500, 'GOING_OUT_CREATE_FAILED') }
    },
    DELETE: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to cancel your outing.', 401, 'UNAUTHENTICATED')
        await getDb().update(goingOutPlans).set({ status: 'cancelled', updatedAt: new Date() }).where(and(eq(goingOutPlans.userId,userId),eq(goingOutPlans.status,'active')))
        return jsonOk({ cancelled: true })
      } catch (error) { console.error('Going-out plan cancel failed', error); return jsonError('Could not cancel your outing.', 500, 'GOING_OUT_CANCEL_FAILED') }
    },
  } },
})
