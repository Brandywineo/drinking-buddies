import { createFileRoute } from '@tanstack/react-router'
import { and, desc, eq } from 'drizzle-orm'
import { getDb } from '../db'
import { hostPayouts, hostWalletAccounts, hostWalletTransactions } from '../db/schema'
import { getAuthenticatedUserId } from '../lib/session'
import { jsonError, jsonOk } from '../lib/http'

export const Route = createFileRoute('/api/host/wallet')({
  server: { handlers: {
    GET: async ({ request }) => {
      const userId = await getAuthenticatedUserId(request)
      if (!userId) return jsonError('Sign in to view your wallet.', 401, 'UNAUTHENTICATED')
      const db = getDb()
      const [wallet] = await db.select().from(hostWalletAccounts).where(and(
        eq(hostWalletAccounts.userId, userId), eq(hostWalletAccounts.currency, 'KES'),
      )).limit(1)
      if (!wallet) return jsonOk({ wallet: { pendingMinor: 0, availableMinor: 0, reservedMinor: 0, currency: 'KES' }, transactions: [], payouts: [] })
      const [transactions, payouts] = await Promise.all([
        db.select().from(hostWalletTransactions).where(eq(hostWalletTransactions.walletId, wallet.id))
          .orderBy(desc(hostWalletTransactions.createdAt)).limit(50),
        db.select().from(hostPayouts).where(eq(hostPayouts.userId, userId))
          .orderBy(desc(hostPayouts.createdAt)).limit(25),
      ])
      return jsonOk({
        wallet: { id: wallet.id, currency: wallet.currency, pendingMinor: wallet.pendingMinor, availableMinor: wallet.availableMinor, reservedMinor: wallet.reservedMinor },
        transactions, payouts,
      })
    },
  } },
})
