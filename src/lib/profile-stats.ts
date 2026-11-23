import { and, count, eq, isNull, or } from 'drizzle-orm'
import { getDb } from '../db'
import { matches, meetupBookings, meetupMembers, meetups, profileLikes } from '../db/schema'

export async function getProfileStats(userId: string) {
  const db = getDb()
  const [[hosted], [joined], [attended], [receivedLikes], [activeMatches]] = await Promise.all([
    db.select({ value: count() }).from(meetups).where(eq(meetups.hostId, userId)),
    db.select({ value: count() }).from(meetupMembers).where(and(
      eq(meetupMembers.userId, userId), eq(meetupMembers.status, 'approved'),
    )),
    db.select({ value: count() }).from(meetupBookings).where(and(
      eq(meetupBookings.attendeeId, userId), eq(meetupBookings.status, 'attended'),
    )),
    db.select({ value: count() }).from(profileLikes).where(eq(profileLikes.toUserId, userId)),
    db.select({ value: count() }).from(matches).where(and(
      isNull(matches.endedAt),
      or(eq(matches.userLowId, userId), eq(matches.userHighId, userId)),
    )),
  ])
  const stats = {
    hostedMeetups: Number(hosted?.value ?? 0),
    joinedMeetups: Number(joined?.value ?? 0),
    attendedMeetups: Number(attended?.value ?? 0),
    receivedLikes: Number(receivedLikes?.value ?? 0),
    activeMatches: Number(activeMatches?.value ?? 0),
  }
  // Transparent activity-based indicators; these are not reviews or identity verification.
  return {
    ...stats,
    popularityScore: stats.receivedLikes * 5 + stats.activeMatches * 3,
    reputationScore: stats.attendedMeetups * 10 + stats.hostedMeetups * 5,
  }
}
