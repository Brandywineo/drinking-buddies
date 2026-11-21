import { createFileRoute } from '@tanstack/react-router'
import { and, count, eq, gt, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { meetupBookings, meetupMembers, meetups, platformSettings } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

const paramsSchema = z.object({ meetupId: z.string().uuid() })
const bodySchema = z.object({
  quantity: z.number().int().min(1).max(20).default(1),
  idempotencyKey: z.string().trim().min(8).max(120),
}).strict()

const RESERVATION_MINUTES = 15

export const Route = createFileRoute('/api/meetups/$meetupId/bookings')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const attendeeId = await getAuthenticatedUserId(request)
        if (!attendeeId) return jsonError('Sign in to book this meetup.', 401, 'UNAUTHENTICATED')
        const parsedParams = paramsSchema.safeParse(params)
        if (!parsedParams.success) return jsonError('Invalid meetup.', 400, 'INVALID_MEETUP')
        let rawBody: unknown
        try { rawBody = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsedBody = bodySchema.safeParse(rawBody)
        if (!parsedBody.success) return jsonError('Check the booking quantity and idempotency key.', 400, 'INVALID_BOOKING')

        const db = getDb()
        const result = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM meetups WHERE id = ${parsedParams.data.meetupId} FOR UPDATE`)
          const [meetup] = await tx.select().from(meetups).where(eq(meetups.id, parsedParams.data.meetupId)).limit(1)
          if (!meetup || meetup.status !== 'published' || meetup.startsAt <= new Date()) return { error: 'NOT_FOUND' as const }
          if (meetup.hostId === attendeeId) return { error: 'HOST' as const }
          if (meetup.pricingType !== 'paid' || meetup.priceMinor <= 0) return { error: 'NOT_PAID' as const }
          if (meetup.visibility !== 'public') return { error: 'APPROVAL_REQUIRED' as const }

          const [existing] = await tx.select().from(meetupBookings)
            .where(eq(meetupBookings.idempotencyKey, parsedBody.data.idempotencyKey)).limit(1)
          if (existing) {
            if (existing.attendeeId !== attendeeId || existing.meetupId !== meetup.id) return { error: 'IDEMPOTENCY_CONFLICT' as const }
            return { booking: existing, reused: true }
          }

          const now = new Date()
          const [approvedMembers] = await tx.select({ value: count() }).from(meetupMembers).where(and(
            eq(meetupMembers.meetupId, meetup.id),
            eq(meetupMembers.status, 'approved'),
          ))
          const [occupied] = await tx.select({ value: sql<number>`coalesce(sum(quantity), 0)::int` }).from(meetupBookings).where(and(
            eq(meetupBookings.meetupId, meetup.id),
            or(
              eq(meetupBookings.status, 'confirmed'),
              and(eq(meetupBookings.status, 'pending_payment'), gt(meetupBookings.expiresAt, now)),
            ),
          ))
          if ((approvedMembers?.value ?? 0) + (occupied?.value ?? 0) + parsedBody.data.quantity > meetup.capacity) return { error: 'FULL' as const }

          const [setting] = await tx.select({ value: platformSettings.value }).from(platformSettings)
            .where(eq(platformSettings.key, 'marketplace_fees')).limit(1)
          const config = setting?.value && typeof setting.value === 'object'
            ? setting.value as Record<string, unknown> : {}
          const configuredBps = Number(config.commissionBps ?? 1000)
          const commissionBps = Number.isInteger(configuredBps) ? Math.min(5000, Math.max(0, configuredBps)) : 1000
          const grossAmountMinor = meetup.priceMinor * parsedBody.data.quantity
          const platformFeeMinor = Math.round(grossAmountMinor * commissionBps / 10000)
          const hostNetMinor = grossAmountMinor - platformFeeMinor
          const expiresAt = new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000)
          const [booking] = await tx.insert(meetupBookings).values({
            meetupId: meetup.id,
            attendeeId,
            hostId: meetup.hostId,
            quantity: parsedBody.data.quantity,
            unitPriceMinor: meetup.priceMinor,
            grossAmountMinor,
            currency: meetup.currency,
            commissionBps,
            platformFeeMinor,
            processorFeeMinor: 0,
            hostNetMinor,
            status: 'pending_payment',
            idempotencyKey: parsedBody.data.idempotencyKey,
            refundPolicySnapshot: meetup.refundPolicy,
            expiresAt,
          }).returning()
          return { booking, reused: false }
        })

        if ('error' in result) {
          if (result.error === 'NOT_FOUND') return jsonError('This meetup is unavailable.', 404, 'MEETUP_NOT_FOUND')
          if (result.error === 'HOST') return jsonError('You cannot book your own meetup.', 409, 'HOST_CANNOT_BOOK')
          if (result.error === 'NOT_PAID') return jsonError('This booking endpoint is only for paid meetups.', 409, 'MEETUP_NOT_PAID')
          if (result.error === 'APPROVAL_REQUIRED') return jsonError('Paid bookings are not open for approval-required meetups yet.', 409, 'MEETUP_REQUIRES_APPROVAL')
          if (result.error === 'IDEMPOTENCY_CONFLICT') return jsonError('That idempotency key is already in use.', 409, 'IDEMPOTENCY_CONFLICT')
          return jsonError('There are not enough tickets remaining.', 409, 'MEETUP_CAPACITY_REACHED')
        }

        return jsonOk({
          booking: result.booking,
          reused: result.reused,
          payment: { enabled: false, reason: 'PAYMENT_PROVIDER_APPROVAL_PENDING' },
        }, result.reused ? 200 : 201)
      } catch (error) {
        console.error('Paid meetup booking reservation failed', error)
        return jsonError('We could not reserve these tickets.', 500, 'BOOKING_RESERVATION_FAILED')
      }
    },
  } },
})
