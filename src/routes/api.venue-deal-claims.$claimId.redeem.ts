import { createFileRoute } from '@tanstack/react-router'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { venueDealClaims, venueDeals } from '../db/schema'
import { canManageVenue } from '../lib/community-media'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/venue-deal-claims/$claimId/redeem')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to redeem a deal.', 401, 'UNAUTHENTICATED')
        const id = z.string().uuid().safeParse(params.claimId)
        if (!id.success) return jsonError('Invalid claim.', 400, 'INVALID_CLAIM')
        const [claim] = await getDb().select({
          id: venueDealClaims.id, status: venueDealClaims.status, venueId: venueDeals.venueId,
        }).from(venueDealClaims).innerJoin(venueDeals, eq(venueDeals.id, venueDealClaims.dealId))
          .where(eq(venueDealClaims.id, id.data)).limit(1)
        if (!claim) return jsonError('Claim not found.', 404, 'CLAIM_NOT_FOUND')
        const access = await canManageVenue(claim.venueId, userId)
        if (!access.role || !['owner','manager','staff'].includes(access.role)) return jsonError('Only this venue team can redeem a claim.', 403, 'VENUE_FORBIDDEN')
        if (claim.status !== 'claimed') return jsonError('This claim has already been used or cancelled.', 409, 'CLAIM_NOT_REDEEMABLE')
        const [updated] = await getDb().update(venueDealClaims).set({ status: 'redeemed', redeemedAt: new Date() })
          .where(and(eq(venueDealClaims.id, id.data), eq(venueDealClaims.status, 'claimed')))
          .returning({ id: venueDealClaims.id, redeemedAt: venueDealClaims.redeemedAt })
        if (!updated) return jsonError('This claim has already been used.', 409, 'CLAIM_NOT_REDEEMABLE')
        return jsonOk({ claim: updated })
      } catch (error) {
        console.error('Venue claim redemption failed', error)
        return jsonError('We could not redeem this claim.', 500, 'CLAIM_REDEEM_FAILED')
      }
    },
  } },
})
