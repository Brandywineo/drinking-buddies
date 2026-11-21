import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../src/db'
import { hostWalletAccounts, hostWalletTransactions, meetupBookings, platformSettings } from '../src/db/schema'

async function main() {
  const db = getDb()
  const [setting] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, 'payout_settings')).limit(1)
  const config = setting?.value && typeof setting.value === 'object' ? setting.value as Record<string, unknown> : {}
  const configuredHours = Number(config.releaseHours ?? 24)
  const releaseHours = Number.isInteger(configuredHours) ? Math.min(168, Math.max(1, configuredHours)) : 24
  const eligible = await db.select({ id: meetupBookings.id }).from(meetupBookings)
    .innerJoin(sql`meetups`, sql`meetups.id = ${meetupBookings.meetupId}`)
    .where(and(
      eq(meetupBookings.status, 'confirmed'),
      sql`coalesce(meetups.ends_at, meetups.starts_at + interval '3 hours') <= now() - make_interval(hours => ${releaseHours})`,
    )).limit(500)

  let released = 0
  for (const item of eligible) {
    await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT id FROM meetup_bookings WHERE id = ${item.id} FOR UPDATE`)
      const [booking] = await tx.select().from(meetupBookings).where(eq(meetupBookings.id, item.id)).limit(1)
      if (!booking || booking.status !== 'confirmed') return
      const [wallet] = await tx.select().from(hostWalletAccounts).where(and(
        eq(hostWalletAccounts.userId, booking.hostId), eq(hostWalletAccounts.currency, booking.currency),
      )).limit(1)
      if (!wallet) throw new Error(`Host wallet missing for booking ${booking.id}`)
      const [entry] = await tx.insert(hostWalletTransactions).values({
        walletId: wallet.id, kind: 'booking_release', amountMinor: booking.hostNetMinor,
        currency: booking.currency, referenceType: 'meetup_booking', referenceId: booking.id,
        idempotencyKey: `booking-release:${booking.id}`,
        metadata: { releaseHours, releasedAt: new Date().toISOString() },
      }).onConflictDoNothing().returning()
      if (!entry) return
      const updated = await tx.update(hostWalletAccounts).set({
        pendingMinor: sql`${hostWalletAccounts.pendingMinor} - ${booking.hostNetMinor}`,
        availableMinor: sql`${hostWalletAccounts.availableMinor} + ${booking.hostNetMinor}`,
        updatedAt: new Date(),
      }).where(and(
        eq(hostWalletAccounts.id, wallet.id),
        sql`${hostWalletAccounts.pendingMinor} >= ${booking.hostNetMinor}`,
      )).returning({ id: hostWalletAccounts.id })
      if (!updated.length) throw new Error(`Host pending balance mismatch for booking ${booking.id}`)
      released += 1
    })
  }
  console.info(`Marketplace release worker completed: ${released} host credits released`)
}

main().catch((error) => {
  console.error('Marketplace release worker failed', error)
  process.exitCode = 1
})
