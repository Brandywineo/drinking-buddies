import { createFileRoute } from '@tanstack/react-router'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { platformSettings } from '../db/schema'
import { getAdminUserId } from '../lib/admin'
import { jsonError, jsonOk } from '../lib/http'

const bodySchema = z.object({
  commissionBps: z.number().int().min(0).max(5000),
  minimumPayoutMinor: z.number().int().min(10000).max(100000000),
  payoutReleaseHours: z.number().int().min(1).max(168),
  hostTrialDays: z.number().int().min(1).max(90),
  hostMonthlyPriceMinor: z.number().int().min(0).max(100000000),
  hostAnnualPriceMinor: z.number().int().min(0).max(100000000),
}).strict()

export const Route = createFileRoute('/api/admin/finance/settings')({
  server: { handlers: {
    GET: async ({ request }) => {
      if (!await getAdminUserId(request)) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      const rows = await getDb().select().from(platformSettings)
      const values = Object.fromEntries(rows.map((row) => [row.key, row.value]))
      const fees = values.marketplace_fees && typeof values.marketplace_fees === 'object' ? values.marketplace_fees as Record<string, unknown> : {}
      const payouts = values.payout_settings && typeof values.payout_settings === 'object' ? values.payout_settings as Record<string, unknown> : {}
      const membership = values.host_membership && typeof values.host_membership === 'object' ? values.host_membership as Record<string, unknown> : {}
      return jsonOk({
        commissionBps: Number(fees.commissionBps ?? 1000),
        minimumPayoutMinor: Number(payouts.minimumAmountMinor ?? 10000),
        payoutReleaseHours: Number(payouts.releaseHours ?? 24),
        hostTrialDays: Number(membership.trialDays ?? 14),
        hostMonthlyPriceMinor: Number(membership.monthlyPriceMinor ?? 0),
        hostAnnualPriceMinor: Number(membership.annualPriceMinor ?? 0),
      })
    },
    PUT: async ({ request }) => {
      const adminId = await getAdminUserId(request)
      if (!adminId) return jsonError('Admin access required.', 403, 'ADMIN_REQUIRED')
      let raw: unknown
      try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
      const parsed = bodySchema.safeParse(raw)
      if (!parsed.success) return jsonError('One or more finance settings are invalid.', 400, 'INVALID_FINANCE_SETTINGS')
      const db = getDb()
      const values = [
        ['marketplace_fees', { commissionBps: parsed.data.commissionBps }],
        ['payout_settings', { minimumAmountMinor: parsed.data.minimumPayoutMinor, releaseHours: parsed.data.payoutReleaseHours, adminApprovalRequired: true }],
        ['host_membership', { trialDays: parsed.data.hostTrialDays, monthlyPriceMinor: parsed.data.hostMonthlyPriceMinor, annualPriceMinor: parsed.data.hostAnnualPriceMinor, currency: 'KES' }],
      ] as const
      await db.transaction(async (tx) => {
        for (const [key, value] of values) {
          await tx.insert(platformSettings).values({ key, value, updatedBy: adminId })
            .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedBy: adminId, updatedAt: new Date() } })
        }
      })
      return jsonOk({ saved: true })
    },
  } },
})
