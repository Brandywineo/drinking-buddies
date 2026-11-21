CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE account_status AS ENUM ('pending_verification', 'active', 'suspended', 'deleted');
CREATE TYPE connection_intent AS ENUM ('drinking_buddies', 'friendship', 'social_and_dating', 'group_outings');
CREATE TYPE location_visibility AS ENUM ('private', 'matches', 'public');
CREATE TYPE meetup_visibility AS ENUM ('public', 'approval_required', 'private');
CREATE TYPE meetup_member_status AS ENUM ('requested', 'approved', 'declined', 'left', 'removed');
CREATE TYPE venue_approval_status AS ENUM ('pending', 'approved', 'rejected', 'suspended');
CREATE TYPE subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'expired');
CREATE TYPE payment_status AS ENUM ('pending', 'succeeded', 'failed', 'reversed');
CREATE TYPE outbox_status AS ENUM ('queued', 'processing', 'sent', 'failed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email varchar(320) NOT NULL,
  email_normalized varchar(320) NOT NULL,
  phone_e164 varchar(20),
  password_hash text,
  status account_status NOT NULL DEFAULT 'pending_verification',
  age_acknowledged_at timestamptz NOT NULL,
  age_gate_version varchar(32) NOT NULL,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_normalized_uq ON users(email_normalized);
CREATE UNIQUE INDEX users_phone_e164_uq ON users(phone_e164);
CREATE INDEX users_status_idx ON users(status);

CREATE TABLE profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name varchar(48) NOT NULL,
  bio varchar(500),
  gender varchar(32),
  discoverable boolean NOT NULL DEFAULT true,
  location_visibility location_visibility NOT NULL DEFAULT 'private',
  preferred_genders jsonb NOT NULL DEFAULT '[]'::jsonb,
  connection_intents jsonb NOT NULL DEFAULT '[]'::jsonb,
  interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  home_area varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX profiles_user_id_uq ON profiles(user_id);
CREATE INDEX profiles_discoverable_idx ON profiles(discoverable);

CREATE TABLE auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider varchar(32) NOT NULL,
  provider_account_id varchar(255) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_identities_provider_account_uq ON auth_identities(provider, provider_account_id);
CREATE INDEX auth_identities_user_idx ON auth_identities(user_id);

CREATE TABLE auth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_sessions_token_hash_uq ON auth_sessions(token_hash);
CREATE INDEX auth_sessions_user_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expires_idx ON auth_sessions(expires_at);

CREATE TABLE email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX email_verifications_token_hash_uq ON email_verifications(token_hash);
CREATE INDEX email_verifications_user_idx ON email_verifications(user_id);

CREATE TABLE matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_low_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_high_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  matched_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  CONSTRAINT matches_distinct_users_ck CHECK (user_low_id <> user_high_id)
);
CREATE UNIQUE INDEX matches_pair_uq ON matches(user_low_id, user_high_id);
CREATE INDEX matches_user_low_idx ON matches(user_low_id);
CREATE INDEX matches_user_high_idx ON matches(user_high_id);

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  name varchar(140) NOT NULL,
  description varchar(1200),
  category varchar(60) NOT NULL,
  address varchar(300) NOT NULL,
  area varchar(120) NOT NULL,
  city varchar(120) NOT NULL,
  country_code varchar(2) NOT NULL DEFAULT 'KE',
  location geometry(Point, 4326),
  approval_status venue_approval_status NOT NULL DEFAULT 'pending',
  is_published boolean NOT NULL DEFAULT false,
  website_url varchar(500),
  contact_email varchar(320),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venues_owner_idx ON venues(owner_id);
CREATE INDEX venues_approval_idx ON venues(approval_status);
CREATE INDEX venues_location_gist_idx ON venues USING gist(location);

CREATE TABLE meetups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(100) NOT NULL,
  description varchar(1200),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  area varchar(160) NOT NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  location geometry(Point, 4326),
  visibility meetup_visibility NOT NULL DEFAULT 'approval_required',
  capacity integer NOT NULL DEFAULT 8 CHECK (capacity BETWEEN 2 AND 100),
  status varchar(24) NOT NULL DEFAULT 'published',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetups_starts_at_idx ON meetups(starts_at);
CREATE INDEX meetups_host_idx ON meetups(host_id);
CREATE INDEX meetups_location_gist_idx ON meetups USING gist(location);

CREATE TABLE meetup_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES meetups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status meetup_member_status NOT NULL DEFAULT 'requested',
  joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX meetup_members_meetup_user_uq ON meetup_members(meetup_id, user_id);
CREATE INDEX meetup_members_user_idx ON meetup_members(user_id);

CREATE TABLE venue_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(80) NOT NULL,
  description varchar(500),
  price_minor integer NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency varchar(3) NOT NULL DEFAULT 'KES',
  billing_interval varchar(16) NOT NULL DEFAULT 'month',
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venue_packages_active_idx ON venue_packages(is_active, sort_order);

CREATE TABLE venue_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES venue_packages(id) ON DELETE RESTRICT,
  status subscription_status NOT NULL DEFAULT 'trialing',
  locked_price_minor integer NOT NULL CHECK (locked_price_minor >= 0),
  currency varchar(3) NOT NULL,
  billing_interval varchar(16) NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venue_subscriptions_venue_idx ON venue_subscriptions(venue_id);
CREATE INDEX venue_subscriptions_status_idx ON venue_subscriptions(status);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES venue_subscriptions(id) ON DELETE SET NULL,
  provider varchar(32) NOT NULL,
  provider_reference varchar(180),
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency varchar(3) NOT NULL,
  status payment_status NOT NULL DEFAULT 'pending',
  idempotency_key varchar(120) NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_idempotency_key_uq ON payments(idempotency_key);
CREATE UNIQUE INDEX payments_provider_reference_uq ON payments(provider, provider_reference);
CREATE INDEX payments_user_idx ON payments(user_id);

CREATE TABLE platform_settings (
  key varchar(120) PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient varchar(320) NOT NULL,
  template_key varchar(100) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status outbox_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  last_error varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_status_next_idx ON email_outbox(status, next_attempt_at);
