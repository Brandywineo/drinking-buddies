import { createFileRoute } from '@tanstack/react-router'
import { and, asc, count, desc, eq, gt } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { conversations, hostSubscriptions, meetupMembers, meetups, platformSettings, profiles } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const createSchema = z.object({
  title: z.string().trim().min(4).max(100),
  description: z.string().trim().max(1200).nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  area: z.string().trim().min(2).max(160),
  capacity: z.number().int().min(2).max(100).default(8),
  visibility: z.enum(['public', 'approval_required']).default('approval_required'),
  pricingType: z.enum(['free', 'paid']).default('free'),
  priceMinor: z.number().int().min(0).max(100000000).default(0),
  currency: z.string().regex(/^[A-Z]{3}$/).default('KES'),
  refundPolicy: z.object({
    kind: z.literal('host_policy'),
    refundBeforeHours: z.number().int().min(0).max(720),
    refundPercentage: z.number().int().min(0).max(100),
  }).strict().default({ kind: 'host_policy', refundBeforeHours: 24, refundPercentage: 100 }),
}).strict()

export const Route = createFileRoute('/api/meetups')({
  server: { handlers: {
    GET: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        const db = getDb()
        const rows = await db.select({
          id: meetups.id, title: meetups.title, description: meetups.description,
          startsAt: meetups.startsAt, endsAt: meetups.endsAt, area: meetups.area,
          capacity: meetups.capacity, visibility: meetups.visibility, hostId: meetups.hostId,
          hostName: profiles.displayName,
        }).from(meetups).leftJoin(profiles, eq(profiles.userId, meetups.hostId))
          .where(and(eq(meetups.status, 'published'), gt(meetups.startsAt, new Date())))
          .orderBy(asc(meetups.startsAt)).limit(100)
        const items = []
        for (const row of rows) {
          const [memberCount] = await db.select({ value: count() }).from(meetupMembers)
            .where(and(eq(meetupMembers.meetupId, row.id), eq(meetupMembers.status, 'approved')))
          const [mine] = userId ? await db.select({ status: meetupMembers.status }).from(meetupMembers)
            .where(and(eq(meetupMembers.meetupId, row.id), eq(meetupMembers.userId, userId))).limit(1) : []
          const [conversation] = userId && (row.hostId === userId || mine?.status === 'approved')
            ? await db.select({ id: conversations.id }).from(conversations)
              .where(and(eq(conversations.kind, 'meetup'), eq(conversations.meetupId, row.id))).limit(1)
            : []
          const pendingRequests = userId === row.hostId
            ? await db.select({ userId: meetupMembers.userId, displayName: profiles.displayName })
              .from(meetupMembers).innerJoin(profiles, eq(profiles.userId, meetupMembers.userId))
              .where(and(eq(meetupMembers.meetupId, row.id), eq(meetupMembers.status, 'requested')))
            : []
          items.push({ ...row, hostName: row.hostName ?? 'Community member', approvedCount: memberCount?.value ?? 0, membershipStatus: mine?.status ?? null, conversationId: conversation?.id ?? null, pendingRequests })
        }
        return jsonOk({ meetups: items })
      } catch (error) {
        console.error('Meetup listing failed', error)
        return jsonError('We could not load meetups.', 500, 'MEETUPS_FAILED')
      }
    },
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to create a meetup.', 401, 'UNAUTHENTICATED')
        let body: unknown
        try { body = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = createSchema.safeParse(body)
        if (!parsed.success) return jsonError('Check the meetup details and try again.', 400, 'INVALID_MEETUP')
        const startsAt = new Date(parsed.data.startsAt)
        const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : null
        if ((parsed.data.pricingType === 'free' && parsed.data.priceMinor !== 0) || (parsed.data.pricingType === 'paid' && parsed.data.priceMinor <= 0)) {
          return jsonError('Free meetups must have a zero price; paid meetups need a positive price.', 400, 'INVALID_MEETUP_PRICE')
        }
        if (startsAt <= new Date() || (endsAt && endsAt <= startsAt)) {
          return jsonError('Choose a future start time and an end time after it.', 400, 'INVALID_MEETUP_TIME')
        }
        const db = getDb()
        const created = await db.transaction(async (tx) => {
          if (parsed.data.pricingType === 'paid') {
            const [existing] = await tx.select().from(hostSubscriptions)
              .where(eq(hostSubscriptions.userId, userId)).orderBy(desc(hostSubscriptions.createdAt)).limit(1)
            const now = new Date()
            if (existing) {
              if (!['trialing', 'active'].includes(existing.status) || existing.currentPeriodEnd <= now) {
                if (existing.status === 'trialing' && existing.currentPeriodEnd <= now) {
                  await tx.update(hostSubscriptions).set({ status: 'expired', updatedAt: now }).where(eq(hostSubscriptions.id, existing.id))
                }
                return { error: 'PREMIUM_REQUIRED' as const }
              }
            } else {
              const [setting] = await tx.select({ value: platformSettings.value }).from(platformSettings)
                .where(eq(platformSettings.key, 'host_membership')).limit(1)
              const config = setting?.value && typeof setting.value === 'object' ? setting.value as Record<string, unknown> : {}
              const configuredDays = Number(config.trialDays ?? 14)
              const trialDays = Number.isInteger(configuredDays) ? Math.min(90, Math.max(1, configuredDays)) : 14
              const trialEndsAt = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
              const monthlyPriceMinor = Number(config.monthlyPriceMinor ?? 0)
              const lockedPriceMinor = Number.isInteger(monthlyPriceMinor) && monthlyPriceMinor >= 0 ? monthlyPriceMinor : 0
              const currency = typeof config.currency === 'string' && /^[A-Z]{3}$/.test(config.currency) ? config.currency : 'KES'
              const billingInterval = config.billingInterval === 'year' ? 'year' : 'month'
              await tx.insert(hostSubscriptions).values({
                userId, plan: 'free_trial', status: 'trialing', lockedPriceMinor, currency, billingInterval,
                trialStartedAt: now, trialEndsAt, currentPeriodStart: now, currentPeriodEnd: trialEndsAt,
              })
            }
          }
          const [meetup] = await tx.insert(meetups).values({
            hostId: userId, title: parsed.data.title, description: parsed.data.description ?? null,
            startsAt, endsAt, area: parsed.data.area, capacity: parsed.data.capacity,
            visibility: parsed.data.visibility, status: 'published',
            pricingType: parsed.data.pricingType, priceMinor: parsed.data.priceMinor,
            currency: parsed.data.currency, refundPolicy: parsed.data.refundPolicy,
          }).returning()
          await tx.insert(meetupMembers).values({ meetupId: meetup.id, userId, status: 'approved', joinedAt: new Date() })
          const [conversation] = await tx.insert(conversations).values({ kind: 'meetup', meetupId: meetup.id }).returning()
          return { ...meetup, conversationId: conversation.id, approvedCount: 1, membershipStatus: 'approved' as const }
        })
        if ('error' in created) return jsonError('An active premium host membership is required to publish paid meetups.', 403, 'PREMIUM_MEMBERSHIP_REQUIRED')
        return jsonOk({ meetup: created }, 201)
      } catch (error) {
        console.error('Meetup creation failed', error)
        return jsonError('We could not create this meetup.', 500, 'MEETUP_CREATE_FAILED')
      }
    },
  } },
})
