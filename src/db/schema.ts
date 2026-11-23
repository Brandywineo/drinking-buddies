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
export const meetupPricingType = pgEnum('meetup_pricing_type', ['free', 'paid'])
export const hostMembershipPlan = pgEnum('host_membership_plan', ['free_trial', 'premium_monthly', 'premium_annual'])
export const meetupBookingStatus = pgEnum('meetup_booking_status', ['pending_payment', 'confirmed', 'cancelled', 'refunded', 'attended', 'no_show'])
export const marketplaceRefundStatus = pgEnum('marketplace_refund_status', ['requested', 'processing', 'succeeded', 'failed', 'rejected'])
export const hostPayoutStatus = pgEnum('host_payout_status', ['requested', 'approved', 'processing', 'paid', 'failed', 'rejected'])
export const walletEntryKind = pgEnum('wallet_entry_kind', ['booking_credit', 'platform_fee', 'processor_fee', 'refund_debit', 'payout_debit', 'payout_reversal', 'payout_reserve', 'payout_release', 'booking_release', 'refund_reserve', 'refund_release', 'adjustment'])
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
  avatarUrl: varchar('avatar_url', { length: 500),
  bio: varchar('bio', { length: 500 }),
  gender: varchar('gender', { length: 32 }),
  discoverable: boolean('discoverable').notNull().default(true),
  displayPopularityScore: boolean('display_popularity_score').notNull().default(false),
  displayReputationScore: boolean('display_reputation_score').notNull().default(false),
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
  coverImageUrl: varchar('cover_image_url', { length: 500 }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }),
  area: varchar('area', { length: 160 }).notNull(),
  venueId: uuid('venue_id').references(() => venues.id, { onDelete: 'set null' }),
  location: geometry('location', { type: 'point', mode: 'xy', srid: 4326 }),
  visibility: meetupVisibility('visibility').notNull().default('approval_required'),
  capacity: integer('capacity').notNull().default(8),
  pricingType: meetupPricingType('pricing_type').notNull().default('free'),
  priceMinor: integer('price_minor').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('KES'),
  refundPolicy: jsonb('refund_policy').$type<Record<string, unknown>>().notNull().default({}),
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
  hostSubscriptionId: uuid('host_subscription_id').references(() => hostSubscriptions.id, { onDelete: 'set null' }),
  bookingId: uuid('booking_id').references(() => meetupBookings.id, { onDelete: 'set null' }),
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


export const profilePasses = pgTable('profile_passes', {
  id: uuid('id').defaultRandom().primaryKey(),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('profile_passes_pair_uq').on(table.fromUserId, table.toUserId),
  index('profile_passes_to_user_idx').on(table.toUserId),
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


export const hostSubscriptions = pgTable('host_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  plan: hostMembershipPlan('plan').notNull().default('free_trial'),
  status: subscriptionStatus('status').notNull().default('trialing'),
  lockedPriceMinor: integer('locked_price_minor').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull().default('KES'),
  billingInterval: varchar('billing_interval', { length: 16 }).notNull().default('month'),
  trialStartedAt: timestamp('trial_started_at', { withTimezone: true }).notNull(),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }).notNull(),
  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  provider: varchar('provider', { length: 32 }),
  providerCustomerReference: varchar('provider_customer_reference', { length: 180 }),
  providerSubscriptionReference: varchar('provider_subscription_reference', { length: 180 }),
  ...timestamps,
}, (table) => [
  uniqueIndex('host_subscriptions_user_uq').on(table.userId),
  index('host_subscriptions_status_period_idx').on(table.status, table.currentPeriodEnd),
])

export const meetupBookings = pgTable('meetup_bookings', {
  id: uuid('id').defaultRandom().primaryKey(),
  meetupId: uuid('meetup_id').notNull().references(() => meetups.id, { onDelete: 'restrict' }),
  attendeeId: uuid('attendee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  hostId: uuid('host_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  quantity: integer('quantity').notNull().default(1),
  unitPriceMinor: integer('unit_price_minor').notNull(),
  grossAmountMinor: integer('gross_amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  commissionBps: integer('commission_bps').notNull(),
  platformFeeMinor: integer('platform_fee_minor').notNull(),
  processorFeeMinor: integer('processor_fee_minor').notNull().default(0),
  hostNetMinor: integer('host_net_minor').notNull(),
  status: meetupBookingStatus('status').notNull().default('pending_payment'),
  idempotencyKey: varchar('idempotency_key', { length: 120 }).notNull(),
  refundPolicySnapshot: jsonb('refund_policy_snapshot').$type<Record<string, unknown>>().notNull().default({}),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps,
}, (table) => [
  uniqueIndex('meetup_bookings_idempotency_uq').on(table.idempotencyKey),
  index('meetup_bookings_meetup_status_idx').on(table.meetupId, table.status),
  index('meetup_bookings_attendee_idx').on(table.attendeeId, table.createdAt),
  index('meetup_bookings_host_idx').on(table.hostId, table.createdAt),
])

export const hostWalletAccounts = pgTable('host_wallet_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  currency: varchar('currency', { length: 3 }).notNull(),
  pendingMinor: integer('pending_minor').notNull().default(0),
  availableMinor: integer('available_minor').notNull().default(0),
  reservedMinor: integer('reserved_minor').notNull().default(0),
  ...timestamps,
}, (table) => [
  uniqueIndex('host_wallet_accounts_user_currency_uq').on(table.userId, table.currency),
])

export const hostWalletTransactions = pgTable('host_wallet_transactions', {
  id: uuid('id').defaultRandom().primaryKey(),
  walletId: uuid('wallet_id').notNull().references(() => hostWalletAccounts.id, { onDelete: 'restrict' }),
  kind: walletEntryKind('kind').notNull(),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  referenceType: varchar('reference_type', { length: 40 }).notNull(),
  referenceId: uuid('reference_id'),
  idempotencyKey: varchar('idempotency_key', { length: 140 }).notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('host_wallet_transactions_idempotency_uq').on(table.idempotencyKey),
  index('host_wallet_transactions_wallet_created_idx').on(table.walletId, table.createdAt),
])

export const hostPayouts = pgTable('host_payouts', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  walletId: uuid('wallet_id').notNull().references(() => hostWalletAccounts.id, { onDelete: 'restrict' }),
  amountMinor: integer('amount_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull(),
  destinationCountry: varchar('destination_country', { length: 2 }).notNull(),
  destinationType: varchar('destination_type', { length: 32 }).notNull(),
  destinationReference: varchar('destination_reference', { length: 180 }),
  provider: varchar('provider', { length: 32 }),
  providerReference: varchar('provider_reference', { length: 180 }),
  status: hostPayoutStatus('status').notNull().default('requested'),
  failureReason: varchar('failure_reason', { length: 1000 }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index('host_payouts_user_created_idx').on(table.userId, table.createdAt),
  index('host_payouts_status_created_idx').on(table.status, table.createdAt),
])

export const marketplaceRefunds = pgTable('marketplace_refunds', {
  id: uuid('id').defaultRandom().primaryKey(),
  bookingId: uuid('booking_id').notNull().references(() => meetupBookings.id, { onDelete: 'restrict' }),
  paymentId: uuid('payment_id').notNull().references(() => payments.id, { onDelete: 'restrict' }),
  attendeeId: uuid('attendee_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  hostId: uuid('host_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  refundAmountMinor: integer('refund_amount_minor').notNull(),
  hostDebitMinor: integer('host_debit_minor').notNull().default(0),
  currency: varchar('currency', { length: 3 }).notNull(),
  status: marketplaceRefundStatus('status').notNull().default('requested'),
  idempotencyKey: varchar('idempotency_key', { length: 140 }).notNull(),
  providerReference: varchar('provider_reference', { length: 180 }),
  failureReason: varchar('failure_reason', { length: 1000 }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
}, (table) => [
  uniqueIndex('marketplace_refunds_idempotency_uq').on(table.idempotencyKey),
  index('marketplace_refunds_booking_idx').on(table.bookingId),
  index('marketplace_refunds_status_created_idx').on(table.status, table.createdAt),
])

export const paymentWebhookEvents = pgTable('payment_webhook_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  provider: varchar('provider', { length: 32 }).notNull(),
  providerEventId: varchar('provider_event_id', { length: 200 }).notNull(),
  eventType: varchar('event_type', { length: 120 }).notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  processingError: varchar('processing_error', { length: 1000 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('payment_webhook_events_provider_event_uq').on(table.provider, table.providerEventId),
  index('payment_webhook_events_unprocessed_idx').on(table.processedAt, table.createdAt),
])


export const favoriteProfiles = pgTable('favorite_profiles', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  targetUserId: uuid('target_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('favorite_profiles_user_target_uq').on(table.userId, table.targetUserId),
  index('favorite_profiles_target_idx').on(table.targetUserId),
])

export const favoriteVenues = pgTable('favorite_venues', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('favorite_venues_user_venue_uq').on(table.userId, table.venueId),
  index('favorite_venues_venue_idx').on(table.venueId),
])


export const goOutPlans = pgTable('go_out_plans', {
  id: uuid('id').defaultRandom().primaryKey(),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }),
  area: varchar('area', { length: 160 }).notNull(),
  venueName: varchar('venue_name', { length: 160 }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  capacity: integer('capacity').notNull().default(8),
  visibility: varchar('visibility', { length: 16 }).notNull().default('public'),
  status: varchar('status', { length: 16 }).notNull().default('open'),
  ...timestamps,
}, (table) => [
  index('go_out_plans_starts_idx').on(table.startsAt),
  index('go_out_plans_creator_idx').on(table.creatorId),
  index('go_out_plans_visibility_status_idx').on(table.visibility, table.status),
])

export const goOutPlanMembers = pgTable('go_out_plan_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  planId: uuid('plan_id').notNull().references(() => goOutPlans.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('going'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('go_out_plan_members_plan_user_uq').on(table.planId, table.userId),
  index('go_out_plan_members_user_idx').on(table.userId),
])

export const squads = pgTable('squads', {
  id: uuid('id').defaultRandom().primaryKey(),
  ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 80 }).notNull(),
  description: varchar('description', { length: 500 }),
  area: varchar('area', { length: 160 }),
  visibility: varchar('visibility', { length: 16 }).notNull().default('public'),
  ...timestamps,
}, (table) => [
  index('squads_owner_idx').on(table.ownerId),
  index('squads_visibility_idx').on(table.visibility),
])

export const squadMembers = pgTable('squad_members', {
  id: uuid('id').defaultRandom().primaryKey(),
  squadId: uuid('squad_id').notNull().references(() => squads.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 16 }).notNull().default('member'),
  status: varchar('status', { length: 16 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('squad_members_squad_user_uq').on(table.squadId, table.userId),
  index('squad_members_user_idx').on(table.userId),
])

export const squadMessages = pgTable('squad_messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  squadId: uuid('squad_id').notNull().references(() => squads.id, { onDelete: 'cascade' }),
  senderId: uuid('sender_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  body: varchar('body', { length: 2000 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('squad_messages_squad_created_idx').on(table.squadId, table.createdAt),
])


// M5 — shared event memories and consent-based tagging.
export const memoryAlbums = pgTable('memory_albums', {
  id: uuid('id').defaultRandom().primaryKey(),
  creatorId: uuid('creator_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  meetupId: uuid('meetup_id').references(() => meetups.id, { onDelete: 'cascade' }),
  squadId: uuid('squad_id').references(() => squads.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 100 }).notNull(),
  description: varchar('description', { length: 500 }),
  visibility: varchar('visibility', { length: 16 }).notNull().default('members'),
  ...timestamps,
}, (table) => [
  index('memory_albums_creator_idx').on(table.creatorId, table.createdAt),
  index('memory_albums_meetup_idx').on(table.meetupId),
  index('memory_albums_squad_idx').on(table.squadId),
])

export const memoryMedia = pgTable('memory_media', {
  id: uuid('id').defaultRandom().primaryKey(),
  albumId: uuid('album_id').notNull().references(() => memoryAlbums.id, { onDelete: 'cascade' }),
  uploaderId: uuid('uploader_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storageKey: varchar('storage_key', { length: 180 }).notNull(),
  mimeType: varchar('mime_type', { length: 80 }).notNull(),
  mediaKind: varchar('media_kind', { length: 12 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  caption: varchar('caption', { length: 500 }),
  moderationStatus: varchar('moderation_status', { length: 16 }).notNull().default('approved'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('memory_media_storage_key_uq').on(table.storageKey),
  index('memory_media_album_created_idx').on(table.albumId, table.createdAt),
  index('memory_media_uploader_idx').on(table.uploaderId, table.createdAt),
  index('memory_media_moderation_idx').on(table.moderationStatus, table.createdAt),
])

export const memoryTags = pgTable('memory_tags', {
  id: uuid('id').defaultRandom().primaryKey(),
  mediaId: uuid('media_id').notNull().references(() => memoryMedia.id, { onDelete: 'cascade' }),
  taggedUserId: uuid('tagged_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  taggedById: uuid('tagged_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('memory_tags_media_user_uq').on(table.mediaId, table.taggedUserId),
  index('memory_tags_user_status_idx').on(table.taggedUserId, table.status),
])

// M6 — venue teams, offers, enquiries, promotions and measurable engagement.
export const venueStaff = pgTable('venue_staff', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 16 }).notNull().default('staff'),
  status: varchar('status', { length: 16 }).notNull().default('invited'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('venue_staff_venue_user_uq').on(table.venueId, table.userId),
  index('venue_staff_user_idx').on(table.userId),
])

export const venuePhotos = pgTable('venue_photos', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  uploadedById: uuid('uploaded_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  storageKey: varchar('storage_key', { length: 180 }).notNull(),
  mimeType: varchar('mime_type', { length: 80 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  caption: varchar('caption', { length: 240 }),
  status: varchar('status', { length: 16 }).notNull().default('approved'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('venue_photos_storage_key_uq').on(table.storageKey),
  index('venue_photos_venue_created_idx').on(table.venueId, table.createdAt),
])

export const venueDeals = pgTable('venue_deals', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  createdById: uuid('created_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 120 }).notNull(),
  description: varchar('description', { length: 1000 }).notNull(),
  dealType: varchar('deal_type', { length: 24 }).notNull(),
  discountLabel: varchar('discount_label', { length: 60 }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  maxRedemptions: integer('max_redemptions'),
  status: varchar('status', { length: 16 }).notNull().default('draft'),
  ...timestamps,
}, (table) => [
  index('venue_deals_venue_status_idx').on(table.venueId, table.status, table.startsAt),
  index('venue_deals_ends_idx').on(table.endsAt),
])

export const venueDealClaims = pgTable('venue_deal_claims', {
  id: uuid('id').defaultRandom().primaryKey(),
  dealId: uuid('deal_id').notNull().references(() => venueDeals.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  claimCode: varchar('claim_code', { length: 24 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('claimed'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
  redeemedAt: timestamp('redeemed_at', { withTimezone: true }),
}, (table) => [
  uniqueIndex('venue_deal_claims_deal_user_uq').on(table.dealId, table.userId),
  uniqueIndex('venue_deal_claims_code_uq').on(table.claimCode),
  index('venue_deal_claims_user_idx').on(table.userId, table.claimedAt),
])

export const venueEnquiries = pgTable('venue_enquiries', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 320 }).notNull(),
  phone: varchar('phone', { length: 24 }),
  subject: varchar('subject', { length: 120 }).notNull(),
  message: varchar('message', { length: 2000 }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('new'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('venue_enquiries_venue_status_idx').on(table.venueId, table.status, table.createdAt),
])

export const venueEvents = pgTable('venue_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  eventType: varchar('event_type', { length: 24 }).notNull(),
  referenceId: uuid('reference_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('venue_events_venue_type_created_idx').on(table.venueId, table.eventType, table.createdAt),
])

export const venuePromotions = pgTable('venue_promotions', {
  id: uuid('id').defaultRandom().primaryKey(),
  venueId: uuid('venue_id').notNull().references(() => venues.id, { onDelete: 'cascade' }),
  requestedById: uuid('requested_by_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 120 }).notNull(),
  placement: varchar('placement', { length: 24 }).notNull(),
  budgetMinor: integer('budget_minor').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('KES'),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  status: varchar('status', { length: 16 }).notNull().default('pending'),
  reviewedById: uuid('reviewed_by_id').references(() => users.id, { onDelete: 'set null' }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  ...timestamps,
}, (table) => [
  index('venue_promotions_status_idx').on(table.status, table.createdAt),
  index('venue_promotions_venue_idx').on(table.venueId),
])
