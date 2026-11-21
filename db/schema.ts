// Initial relational model outline. This is a planning schema, not yet wired to migrations.
// Use PostgreSQL + PostGIS for privacy-aware proximity queries.
export const plannedTables = {
  users: ['id', 'email', 'phone', 'google_subject', 'created_at', 'status'],
  profiles: ['user_id', 'display_name', 'birth_date', 'bio', 'gender', 'discoverability', 'location_visibility'],
  profile_interests: ['profile_id', 'interest'],
  matches: ['id', 'user_a_id', 'user_b_id', 'matched_at', 'status'],
  conversations: ['id', 'match_id', 'created_at'],
  messages: ['id', 'conversation_id', 'sender_id', 'body', 'created_at', 'read_at'],
  meetups: ['id', 'host_id', 'title', 'description', 'starts_at', 'area', 'venue_id', 'visibility', 'capacity', 'status'],
  meetup_members: ['meetup_id', 'user_id', 'status', 'joined_at'],
  venues: ['id', 'owner_id', 'name', 'description', 'address', 'location', 'approval_status', 'status'],
  venue_packages: ['id', 'name', 'price_minor', 'currency', 'billing_interval', 'features', 'is_active'],
  venue_subscriptions: ['id', 'venue_id', 'package_id', 'price_locked_minor', 'currency', 'status', 'period_start', 'period_end'],
  payments: ['id', 'payer_id', 'venue_id', 'provider', 'provider_reference', 'amount_minor', 'currency', 'status'],
  reports: ['id', 'reporter_id', 'reported_user_id', 'reported_content_type', 'reported_content_id', 'reason', 'status'],
  email_outbox: ['id', 'recipient', 'template_key', 'payload', 'status', 'attempts', 'next_attempt_at', 'sent_at'],
  platform_settings: ['key', 'value', 'updated_by', 'updated_at'],
} as const