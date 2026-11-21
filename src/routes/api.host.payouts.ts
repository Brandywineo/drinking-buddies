import { createFileRoute } from '@tanstack/react-router'
import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { getDb } from '../db'
import { hostPayouts, hostWalletAccounts, hostWalletTransactions, platformSettings, users } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'
import { normalizeMpesaPhone } from '../lib/daraja'

const bodySchema = z.object({ amountMinor: z.number().int().positive() }).strict()

export const Route = createFileRoute('/api/host/payouts')({
  server: { handlers: {
    POST: async ({ request }) => {
      try {
        const userId = await getAuthenticatedUserId(request)
        if (!userId) return jsonError('Sign in to request a payout.', 401, 'UNAUTHENTICATED')
        let raw: unknown
        try { raw = await request.json() } catch { return jsonError('Request body must be valid JSON.', 400, 'INVALID_JSON') }
        const parsed = bodySchema.safeParse(raw)
        if (!parsed.success) return jsonError('Enter a valid payout amount.', 400, 'INVALID_AMOUNT')
        const amountMinor = parsed.data.amountMinor
        if (amountMinor % 100 !== 0) return jsonError('Payouts must be in whole Kenyan shillings.', 400, 'INVALID_AMOUNT')
        const db = getDb()
        const [user] = await db.select({ phoneE164: users.phoneE164, phoneVerifiedAt: users.phoneVerifiedAt })
          .from(users).where(eq(users.id, userId)).limit(1)
        if (!user?.phoneVerifiedAt || !user.phoneE164) return jsonError('Verify your M-PESA phone number before requesting a payout.', 403, 'VERIFIED_MPESA_NUMBER_REQUIRED')
        const phone = normalizeMpesaPhone(user.phoneE164)
        const [settings] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, 'payout_settings')).limit(1)
        const config = settings?.value && typeof settings.value === 'object' ? settings.value as Record<string, unknown> : {}
        const minAmount = Number.isInteger(Number(config.minimumAmountMinor)) ? Math.max(100, Number(config.minimumAmountMinor)) : 10000
        if (amountMinor < minAmount) return jsonError('The requested amount is below the minimum payout.', 400, 'BELOW_MINIMUM_PAYOUT')

        const payout = await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT id FROM host_wallet_accounts WHERE user_id = ${userId} AND currency = 'KES' FOR UPDATE`)
          const [wallet] = await tx.select().from(hostWalletAccounts).where(and(
            eq(hostWalletAccounts.userId, userId), eq(hostWalletAccounts.currency, 'KES'),
          )).limit(1)
          if (!wallet || wallet.availableMinor < amountMinor) return { error: 'INSUFFICIENT_BALANCE' as const }
          const [created] = await tx.insert(hostPayouts).values({
            userId, walletId: wallet.id, amountMinor, currency: 'KES',
            destinationCountry: 'KE', destinationType: 'mpesa_wallet',
            destinationReference: phone, provider: 'daraja', status: 'requested',
          }).returning()
          if (!created) throw new Error('Payout record was not created')
          await tx.insert(hostWalletTransactions).values({
            walletId: wallet.id, kind: 'payout_reserve', amountMinor: -amountMinor,
            currency: 'KES', referenceType: 'host_payout', referenceId: created.id,
            idempotencyKey: `payout-reserve:${created.id}`,
            metadata: { destinationType: 'mpesa_wallet', destinationReference: phone },
          })
          await tx.update(hostWalletAccounts).set({
            availableMinor: sql`${hostWalletAccounts.availableMinor} - ${amountMinor}`,
            reservedMinor: sql`${hostWalletAccounts.reservedMinor} + ${amountMinor}`,
            updatedAt: new Date(),
          }).where(eq(hostWalletAccounts.id, wallet.id))
          return { payout: created }
        })
        if ('error' in payout) return jsonError('Your available wallet balance is insufficient.', 409, 'INSUFFICIENT_BALANCE')
        return jsonOk({ payout: payout.payout, message: 'Payout request submitted for admin approval.' }, 201)
      } catch (error) {
        console.error('Host payout request failed', error)
        return jsonError('We could not submit your payout request.', 500, 'PAYOUT_REQUEST_FAILED')
      }
    },
  } },
})
