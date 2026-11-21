import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm'
import { getDb } from '../src/db'
import { emailOutbox, hostSubscriptions, hostWalletAccounts, hostWalletTransactions, meetupBookings, meetups, platformSettings, profiles, users } from '../src/db/schema'

async function main() {
  const db = getDb()
  const [setting] = await db.select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, 'payout_settings')).limit(1)
  const config = setting?.value && typeof setting.value === 'object' ? setting.value as Record<string, unknown> : {}
  const configuredHours = Number(config.releaseHours ?? 24)
  const releaseHours = Number.isInteger(configuredHours) ? Math.min(168, Math.max(1, configuredHours)) : 24
  const eligible = await db.select({ id: meetupBookings.id }).from(meetupBookings)
     .innerJoin(meetups, eq(meetups.id, meetupBookings.meetupId))
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

  const now = new Date()
  await db.update(hostSubscriptions).set({ status: 'expired', updatedAt: now }).where(and(
    inArray(hostSubscriptions.status, ['trialing', 'active']),
    lte(hostSubscriptions.currentPeriodEnd, now),
  ))

  const reminderCutoff = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const due = await db.select({
    id: hostSubscriptions.id,
    email: users.email,
    displayName: profiles.displayName,
    currentPeriodEnd: hostSubscriptions.currentPeriodEnd,
  }).from(hostSubscriptions)
    .innerJoin(users, eq(users.id, hostSubscriptions.userId))
    .leftJoin(profiles, eq(profiles.userId, hostSubscriptions.userId))
    .where(and(
      inArray(hostSubscriptions.status, ['trialing', 'active']),
      gt(hostSubscriptions.currentPeriodEnd, now),
      lte(hostSubscriptions.currentPeriodEnd, reminderCutoff),
    ))
  for (const subscription of due) {
    await db.insert(emailOutbox).values({
      recipient: subscription.email,
      templateKey: 'host_membership_renewal',
      payload: { subscriptionId: subscription.id, displayName: subscription.displayName ?? 'there', renewsAt: subscription.currentPeriodEnd.toISOString() },
    }).onConflictDoNothing()
  }
}

main().catch((error) => {
  console.error('Marketplace release worker failed', error)
  process.exitCode = 1
})
