import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { hostPayouts, hostWalletAccounts, hostWalletTransactions } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'
import { initiateB2CPayout } from '../lib/daraja'

const paramsSchema = z.object({ payoutId: z.string().uuid() })
const bodySchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() }).strict()

export const Route = createFileRoute('/api/admin/finance/payouts/$payoutId/decision')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const adminId = await getAdminUserId(request)
      if (!adminId) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      const parsedParams = paramsSchema.safeParse(params)
      if (!parsedParams.success) return jsonError('Invalid payout.', 400, 'INVALID_PAYOUT')
      let raw: unknown
      try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = bodySchema.safeParse(raw)
      if (!parsed.success) return jsonError('Choose approve or reject.', 400, 'INVALID_DECISION')
      const db = getDb()
      const [payout] = await db.select().from(hostPayouts).where(eq(hostPayouts.id, parsedParams.data.payoutId)).limit(1)
      if (!payout) return jsonError('Payout not found.', 404, 'PAYOUT_NOT_FOUND')
      if (payout.status !== 'requested') return jsonError('This payout has already been reviewed or submitted.', 409, 'PAYOUT_ALREADY_REVIEWED')

      if (parsed.data.decision === 'reject') {
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM host_payouts WHERE id = ${payout.id} FOR UPDATE`)
          const [locked] = await tx.select().from(hostPayouts).where(eq(hostPayouts.id, payout.id)).limit(1)
          if (!locked || locked.status !== 'requested') throw new Error('Payout is no longer awaiting review')
          await tx.update(hostPayouts).set({
            status: 'rejected', failureReason: parsed.data.reason ?? 'Rejected by admin',
            reviewedBy: adminId, reviewedAt: new Date(), processedAt: new Date(), updatedAt: new Date(),
          }).where(eq(hostPayouts.id, payout.id))
          await tx.update(hostWalletAccounts).set({
            reservedMinor: sql`${hostWalletAccounts.reservedMinor} - ${locked.amountMinor}`,
            availableMinor: sql`${hostWalletAccounts.availableMinor} + ${locked.amountMinor}`,
            updatedAt: new Date(),
          }).where(eq(hostWalletAccounts.id, locked.walletId))
          await tx.insert(hostWalletTransactions).values({
            walletId: locked.walletId, kind: 'payout_release', amountMinor: locked.amountMinor,
            currency: locked.currency, referenceType: 'host_payout', referenceId: locked.id,
            idempotencyKey: `payout-release:${locked.id}`, metadata: { reason: parsed.data.reason ?? 'Admin rejection' },
          }).onConflictDoNothing()
        })
        return jsonOk({ payoutId: payout.id, status: 'rejected' })
      }

      const claimed = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM host_payouts WHERE id = ${payout.id} FOR UPDATE`)
        const [locked] = await tx.select().from(hostPayouts).where(eq(hostPayouts.id, payout.id)).limit(1)
        if (!locked || locked.status !== 'requested') return false
        await tx.update(hostPayouts).set({
          status: 'processing', reviewedBy: adminId, reviewedAt: new Date(),
          metadata: { ...locked.metadata, submissionStartedAt: new Date().toISOString() }, updatedAt: new Date(),
        }).where(eq(hostPayouts.id, payout.id))
        return true
      })
      if (!claimed) return jsonError('This payout has already been reviewed or submitted.', 409, 'PAYOUT_ALREADY_REVIEWED')
      try {
        const result = await initiateB2CPayout({
          phone: payout.destinationReference ?? '',
          amountMinor: payout.amountMinor,
          reference: `payout-${payout.id}`,
        })
        await db.update(hostPayouts).set({
          providerReference: result.conversationId,
          metadata: { ...payout.metadata, originatorConversationId: result.originatorConversationId, responseDescription: result.responseDescription },
          updatedAt: new Date(),
        }).where(eq(hostPayouts.id, payout.id))
        return jsonOk({ payoutId: payout.id, status: 'processing', message: 'Daraja accepted the B2C request; awaiting its result callback.' })
      } catch (error) {
        // Keep funds reserved: a network timeout can happen after Safaricom accepted the request.
        await db.update(hostPayouts).set({
          metadata: { ...payout.metadata, submissionUnknown: true, submissionError: error instanceof Error ? error.message.slice(0, 500) : 'B2C submission outcome unknown' },
          updatedAt: new Date(),
        }).where(eq(hostPayouts.id, payout.id))
        return jsonError('B2C submission outcome is uncertain. Funds remain reserved pending reconciliation; do not retry automatically.', 502, 'PAYOUT_SUBMISSION_UNCERTAIN')
      }
    },
  } },
})
