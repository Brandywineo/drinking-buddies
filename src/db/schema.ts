import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  geometry,
} from 'drizzle-orm/pg-core'

export const accountStatus = pgEnum('account_status', ['pending_verification', 'active', 'suspended', 'deleted'])
export const connectionIntent = pgEnum('connection_intent', ['drinking_buddies', 'friendship', 'social_and_dating', 'group_outings'])
export const locationVisibility = pgEnum('location_visibility', ['private', 'matches', 'public'])
export const meetupVisibility = pgEnum('meetup_visibility', ['public', 'approval_required', 'private'])
export const meetupMemberStatus = pgEnum('meetup_member_status', ['requested', 'approved', 'declined', 'left', 'removed'])
export const venueApprovalStatus = pgEnum('venue_approval_status', ['pending', 'approved', 'rejected', 'suspended'])
export const subscriptionStatus = pgEnum('subscription_status', ['trialing', 'active', 'past_due', 'cancelled', 'expired'])
export const paymentStatus = pgEnum('payment_status', ['pending', 'succeeded', 'failed', 'reversed'])
export const outboxStatus = pgEnum('outbox_status', ['queued', 'processing', 'sent', 'failed'])
export const conversationKind = pgEnum('conversation_kind', ['match', 'meetup'])
export const reportStatus = pgEnum('report_status', ['open', 'reviewing', 'resolved', 'dismissed'])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: varchar('email', { length: 320 }).notNull(),
  emailNormalized: varchar('email_normalized', { length: 320 }).notNull(),
  phoneE164: varchar('phone_e164', { length: 20 }),
  passwordHash: text('password_hash'),
  status: accountStatus('status').notNull().default('pending_verification'),
  ageAcknowledgedAt: timestamp('age_acknowledged_at', { withTimezone: true }).notNull(),
  ageGateVersion: varchar('age_gate_version', { length: 32 }).notNull(),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('users_email_normalized_uq').on(table.emailNormalized),
  uniqueIndex('users_phone_e164_uq').on(table.phoneE164),
  index('users_status_idx').on(table.status),
])

export const profiles = pgTable('profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  displayName: varchar('display_name', { length: 48 }).notNull(),
  bio: varchar('bio', { length: 500 }),
  gender: varchar('gender', { length: 32 }),
  discoverable: boolean('discoverable').notNull().default(true),
  locationVisibility: locationVisibility('location_visibility').notNull().default('private'),
  preferredGenders: jsonb('preferred_genders').$type<string[]>().notNull().default([]),
  connectionIntents: jsonb('connection_intents').$type<string[]>().notNull().default([]),
  interests: jsonb('interests').$type<string[]>().notNull().default([]),
  homeArea: varchar('home_area', { length: 120 }),
  ...timestamps,
}, (table) => [
  uniqueIndex('profiles_user_id_uq').on(table.userId),
  index('profiles_discoverable_idx').on(table.discoverable),
])

export const authIdentities = pgTable('auth_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex('auth_identities_provider_account_uq').on(table.provider, table.providerAccountId),
  index('auth_identities_user_idx').on(table.userId),
])

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  ...timestamps,
}, (table) => [
  uniqueIndex('auth_sessions_token_hash_uq').on(table.tokenHash),
  index('auth_sessions_user_idx').on(table.userId),
  index('auth_sessions_expires_idx').on(table.expiresAt),
])

export const emailVerifications = pgTable('email_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('email_verifications_token_hash_uq').on(table.tokenHash),
  index('email_verifications_user_idx').on(table.userId),
])

export const matches = pgTable('matches', {
  id: uuid('id').defaultRandom().primaryKey(),
  userLowId: uuid('user_low_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  userHighId: uuid('user_high_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  matchedAt: timestamp('matched_at', { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('matches_pair_uq').on(table.userLowId, table.userHighId),
  index('matches_user_low_idx').on(table.userLowId),
  index('matches_user_high_idx').on(table.userHighId),
])

export const meetups = pgTable('meetups', {
  id: uuid('id').defaultRandom().primaryKey(),
  hostId: uuid('host_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  description: varchar('description', { length: 1200 }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  area: varchar('area', { length: 160 }).notNull(),
  venueId: uuid('venue_id'),
  location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
  visibility: meetupVisibility('visibility').notNull().default('approval_required'),
  capacity: integer('capacity').notNull().default(8),
  status: varchar('status', { length: 24 }).notNull().default('published'),
  ...timestamps,
}, (table) => [
  index('meetups_starts_at_idx').on(table.startsAt),
  index('meetups_host_idx').on(table.hostId),
  index('meetups_location_gist_idx').using('gist', table.location),
])

export const meetupMembers = pgTable('meetup_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  meetupId: uuid('meetup_id').notNull().references(() => meetups.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: meetupMemberStatus('status').notNull().default('requested'),
  joinedAt: timestamp('joined_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('meetup_members_meetup_user_uq').on(table.meetupId, table.userId),
  index('meetup_members_user_idx').on(table.userId),
])

export const venues = pgTable('venues', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 140 }).notNull(),
  description: varchar('description', { length: 1200 }),
  category: varchar('category', { length: 60 }).notNull(),
  address: varchar('address', { length: 300 }).notNull(),
  area: varchar('area', { length: 120 }).notNull(),
  city: varchar('city', { length: 120 }).notNull(),
  countryCode: varchar('country_code', { length: 2 }).notNull().default('KE'),
  location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
  approvalStatus: venueApprovalStatus('approval_status').notNull().default('pending'),
  isPublished: boolean('is_published').notNull().default(false),
  websiteUrl: varchar('website_url', { length: 500 }),
  contactEmail: varchar('contact_email', { length: 320 }),
  ...timestamps,
}, (table) => [
  index('venues_owner_idx').on(table.ownerId),
  index('venues_approval_idx').on(table.approvalStatus),
  index('venues_location_gist_idx').using('gist', table.location),
])

export const venuePackages = pgTable('venue_packages', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 80 }).notNull(),
  description: varchar('description', { length: 500 }),
  priceMinor: integer('price_minor').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('KES'),
  billingInterval: varchar('billing_interval', { length: 16 }).notNull().default('month'),
  features: jsonb('features').$type<Record<string, boolean | number | string>>().notNull().default({}),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
}, (table) => [index('venue_packages_active_idx').on(table.isActive, table.sortOrder)])

export const venueSubscriptions = pgTable('venue_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  packageId: uuid('package_id').notNull().references(() => venuePackages.id, { onDelete: 'restrict' }),
  status: subscriptionStatus('status').notNull().default('trialing'),
  lockedPriceMinor: integer('locked_price_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  billingInterval: varchar('billing_interval', { length: 16 }).notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  ...timestamps,
}, (table) => [
  index('venue_subscriptions_venue_idx').on(table.venueId),
  index('venue_subscriptions_status_idx').on(table.status),
])

export const payments = pgTable('payments', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
  subscriptionId: uuid('subscription_id').references(() => venueSubscriptions.id, { onDelete: 'set null' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerReference: varchar('provider_reference', { length: 180 }),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: paymentStatus('status').notNull().default('pending'),
  idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  uniqueIndex('payments_idempotency_key_uq').on(table.idempotencyKey),
  uniqueIndex('payments_provider_reference_uq').on(table.provider, table.providerReference),
  index('payments_user_idx').on(table.userId),
])

export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 120 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps,
})

export const emailOutbox = pgTable('email_outbox', {
  id: uuid('id').defaultRandom().primaryKey(),
  recipient: varchar('recipient', { length: 320 }).notNull(),
  templateKey: varchar('template_key', { length: 100 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  status: outboxStatus('status').notNull().default('queued'),
  attempts: integer('attempts').notNull().default(0),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  lastError: varchar('last_error', { length: 1000 }),
  ...timestamps,
}, (table) => [
  index('email_outbox_status_next_idx').on(table.status, table.nextAttemptAt),
])


export const profileLikes = pgTable('profile_likes', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('profile_likes_pair_uq').on(table.fromUserId, table.toUserId),
  index('profile_likes_to_user_idx').on(table.toUserId),
])

export const conversations = pgTable('conversations', {
  id: uuid('id').defaultRandom().primaryKey(),
  kind: conversationKind('kind').notNull(),
  matchId: uuid('match_id').references(() => matches.id, { onDelete: 'cascade' }),
  meetupId: uuid('meetup_id').references(() => meetups.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('conversations_match_id_uq').on(table.matchId),
  uniqueIndex('conversations_meetup_id_uq').on(table.meetupId),
])

export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  conversationId: uuid('conversation_id').notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: varchar('body', { length: 4000 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  editedAt: timestamp('edited_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
}, (table) => [
  index('messages_conversation_created_idx').on(table.conversationId, table.createdAt),
  index('messages_sender_idx').on(table.senderId),
])

export const userBlocks = pgTable('user_blocks', {
  id: uuid('id').defaultRandom().primaryKey(),
  blockerId: uuid('blocker_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  blockedId: uuid('blocked_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('user_blocks_pair_uq').on(table.blockerId, table.blockedId),
])

export const userReports = pgTable('user_reports', {
  id: uuid('id').defaultRandom().primaryKey(),
  reporterId: uuid('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reportedUserId: uuid('reported_user_id').references(() => users.id, { onDelete: 'set null' }),
  contentType: varchar('content_type', { length: 32 }).notNull(),
  contentId: uuid('content_id'),
  reason: varchar('reason', { length: 100 }).notNull(),
  details: varchar('details', { length: 2000 }),
  status: reportStatus('status').notNull().default('open'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('user_reports_status_created_idx').on(table.status, table.createdAt),
  index('user_reports_reporter_idx').on(table.reporterId),
])
