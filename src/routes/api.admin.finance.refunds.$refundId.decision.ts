import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { hostWalletAccounts, hostWalletTransactions, marketplaceRefunds, payments } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'
import { initiateReversal } from '../lib/daraja'

const paramsSchema = z.object({ refundId: z.string().uuid() })
const bodySchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(500).optional() }).strict()

export const Route = createFileRoute('/api/admin/finance/refunds/$refundId/decision')({
  server: { handlers: {
    POST: async ({ request, params }) => {
      const adminId = await getAdminUserId(request)
      if (!adminId) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      const p = paramsSchema.safeParse(params)
      if (!p.success) return jsonError('Invalid refund.', 400, 'INVALID_REFUND')
      let raw: unknown
      try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = bodySchema.safeParse(raw)
      if (!parsed.success) return jsonError('Choose approve or reject.', 400, 'INVALID_DECISION')
      const db = getDb()
      const [refund] = await db.select().from(marketplaceRefunds).where(eq(marketplaceRefunds.id, p.data.refundId)).limit(1)
      if (!refund) return jsonError('Refund not found.', 404, 'REFUND_NOT_FOUND')
      if (refund.status !== 'requested') return jsonError('Refund has already been reviewed.', 409, 'REFUND_ALREADY_REVIEWED')

      if (parsed.data.decision === 'reject') {
        await db.update(marketplaceRefunds).set({
          status: 'rejected', failureReason: parsed.data.reason ?? 'Rejected by admin',
          reviewedBy: adminId, reviewedAt: new Date(), processedAt: new Date(), updatedAt: new Date(),
        }).where(and(eq(marketplaceRefunds.id, refund.id), eq(marketplaceRefunds.status, 'requested')))
        return jsonOk({ refundId: refund.id, status: 'rejected' })
      }

      const [payment] = await db.select().from(payments).where(eq(payments.id, refund.paymentId)).limit(1)
      const receipt = payment?.metadata.receipt
      if (!payment || typeof receipt !== 'string' || !receipt) return jsonError('Original M-PESA receipt is unavailable; refund requires manual reconciliation.', 409, 'ORIGINAL_RECEIPT_MISSING')
      const reservation = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT id FROM marketplace_refunds WHERE id = ${refund.id} FOR UPDATE`)
        const [locked] = await tx.select().from(marketplaceRefunds).where(eq(marketplaceRefunds.id, refund.id)).limit(1)
        if (!locked || locked.status !== 'requested') return { error: 'ALREADY_REVIEWED' as const }
        await tx.execute(sql`SELECT id FROM host_wallet_accounts WHERE user_id = ${locked.hostId} AND currency = ${locked.currency} FOR UPDATE`)
        const [wallet] = await tx.select().from(hostWalletAccounts).where(and(
          eq(hostWalletAccounts.userId, locked.hostId), eq(hostWalletAccounts.currency, locked.currency),
        )).limit(1)
        if (!wallet || wallet.pendingMinor + wallet.availableMinor < locked.hostDebitMinor) return { error: 'HOST_BALANCE' as const }
        const pendingReserved = Math.min(wallet.pendingMinor, locked.hostDebitMinor)
        const availableReserved = locked.hostDebitMinor - pendingReserved
        if (locked.hostDebitMinor > 0) {
          await tx.update(hostWalletAccounts).set({
            pendingMinor: sql`${hostWalletAccounts.pendingMinor} - ${pendingReserved}`,
            availableMinor: sql`${hostWalletAccounts.availableMinor} - ${availableReserved}`,
            reservedMinor: sql`${hostWalletAccounts.reservedMinor} + ${locked.hostDebitMinor}`,
            updatedAt: new Date(),
          }).where(eq(hostWalletAccounts.id, wallet.id))
          await tx.insert(hostWalletTransactions).values({
            walletId: wallet.id, kind: 'refund_reserve', amountMinor: -locked.hostDebitMinor,
            currency: locked.currency, referenceType: 'marketplace_refund', referenceId: locked.id,
            idempotencyKey: `refund-reserve:${locked.id}`,
            metadata: { pendingReserved, availableReserved },
          })
        }
        await tx.update(marketplaceRefunds).set({
          status: 'processing', reviewedBy: adminId, reviewedAt: new Date(),
          metadata: { ...locked.metadata, pendingReserved, availableReserved, originalReceipt: receipt },
          updatedAt: new Date(),
        }).where(eq(marketplaceRefunds.id, locked.id))
        return { refund: locked }
      })
      if ('error' in reservation) return jsonError(
        reservation.error === 'HOST_BALANCE' ? 'Host wallet does not have enough unsettled/available earnings to cover its refund share.' : 'Refund has already been reviewed.',
        409, reservation.error ?? 'REFUND_RESERVATION_FAILED',
      )
      try {
        const result = await initiateReversal({
          transactionId: receipt,
          amountMinor: refund.refundAmountMinor,
          reference: refund.id,
        })
        await db.update(marketplaceRefunds).set({
          providerReference: result.conversationId,
          metadata: { ...refund.metadata, originatorConversationId: result.originatorConversationId },
          updatedAt: new Date(),
        }).where(eq(marketplaceRefunds.id, refund.id))
        return jsonOk({ refundId: refund.id, status: 'processing', message: 'Daraja accepted the reversal request; awaiting the result callback.' })
      } catch (error) {
        await db.update(marketplaceRefunds).set({
          failureReason: error instanceof Error ? error.message.slice(0, 500) : 'Reversal submission outcome unknown',
          metadata: { ...refund.metadata, submissionUnknown: true }, updatedAt: new Date(),
        }).where(eq(marketplaceRefunds.id, refund.id))
        return jsonError('Reversal submission outcome is uncertain. Reserved funds remain held for reconciliation; do not retry automatically.', 502, 'REVERSAL_SUBMISSION_UNCERTAIN')
      }
    },
  } },
})
