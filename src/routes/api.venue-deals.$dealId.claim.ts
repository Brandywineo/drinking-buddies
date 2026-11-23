import { createFileRoute } from '@tanstack/react-router'
import { and, count, eq } from 'drizzle-orm'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { getDb } from '../db'
import { venueDealClaims, venueDeals, venueEvents, venues } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/venue-deals/$dealId/claim')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to claim this deal.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.dealId)
        if (!id.success) return jsonError('Invalid deal.', 400, 'INVALID_DEAL')
        const result = await getDb().transaction(async (tx) => {
          const [deal] = await tx.select().from(venueDeals).where(eq(venueDeals.id, id.data)).for('update').limit(1)
          if (!deal || deal.status !== 'published' || deal.startsAt > new Date() || deal.endsAt <= new Date()) return { error: 'This deal is not currently available.' }
          const [venue] = await tx.select({ id: venues.id, approvalStatus: venues.approvalStatus, isPublished: venues.isPublished }).from(venues).where(eq(venues.id, deal.venueId)).limit(1)
          if (!venue || venue.approvalStatus !== 'approved' || !venue.isPublished) return { error: 'This venue is not available.' }
          const [existing] = await tx.select({ id: venueDealClaims.id }).from(venueDealClaims).where(and(
            eq(venueDealClaims.dealId, deal.id), eq(venueDealClaims.userId, userId),
          )).limit(1)
          if (existing) return { error: 'You have already claimed this deal.' }
          if (deal.maxRedemptions !== null) {
            const [used] = await tx.select({ value: count() }).from(venueDealClaims).where(eq(venueDealClaims.dealId, deal.id))
            if ((used?.value ?? 0) >= deal.maxRedemptions) return { error: 'This deal has reached its claim limit.' }
          }
          const code = randomBytes(5).toString('hex').toUpperCase()
          const [claim] = await tx.insert(venueDealClaims).values({ dealId: deal.id, userId, claimCode: code }).returning({
            id: venueDealClaims.id, claimCode: venueDealClaims.claimCode, claimedAt: venueDealClaims.claimedAt,
          })
          await tx.insert(venueEvents).values({ venueId: deal.venueId, userId, eventType: 'deal_claim', referenceId: deal.id })
          return { claim }
        })
        if ('error' in result && result.error) return jsonError(result.error, 409, 'DEAL_CLAIM_UNAVAILABLE')
        if (!('claim' in result) || !result.claim) return jsonError('We could not create this claim.', 500, 'DEAL_CLAIM_FAILED')
        return jsonOk({ claim: result.claim }, 201)
      } catch (error) {
        console.error('Venue deal claim failed', error)
        return jsonError('We could not claim this deal.', 500, 'DEAL_CLAIM_FAILED')
      }
    },
  } },
})
