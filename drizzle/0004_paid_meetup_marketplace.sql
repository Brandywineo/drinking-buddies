CREATE TYPE meetup_pricing_type AS ENUM ('free', 'paid');
--> statement-breakpoint
CREATE TYPE meetup_booking_status AS ENUM ('pending_payment', 'confirmed', 'cancelled', 'refunded', 'attended', 'no_show');
--> statement-breakpoint
CREATE TYPE host_payout_status AS ENUM ('requested', 'approved', 'processing', 'paid', 'failed', 'rejected');
--> statement-breakpoint
CREATE TYPE wallet_entry_kind AS ENUM ('booking_credit', 'platform_fee', 'processor_fee', 'refund_debit', 'payout_debit', 'payout_reversal', 'adjustment');
--> statement-breakpoint
ALTER TABLE meetups
  ADD COLUMN pricing_type meetup_pricing_type NOT NULL DEFAULT 'free',
  ADD COLUMN price_minor integer NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  ADD COLUMN currency varchar(3) NOT NULL DEFAULT 'KES',
  ADD COLUMN refund_policy jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
CREATE TABLE host_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status subscription_status NOT NULL DEFAULT 'trialing',
  locked_price_minor integer NOT NULL DEFAULT 0 CHECK (locked_price_minor >= 0),
  currency varchar(3) NOT NULL DEFAULT 'KES',
  billing_interval varchar(16) NOT NULL DEFAULT 'month',
  trial_started_at timestamptz NOT NULL,
  trial_ends_at timestamptz NOT NULL,
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  provider varchar(32),
  provider_customer_reference varchar(180),
  provider_subscription_reference varchar(180),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT host_subscriptions_trial_dates_ck CHECK (trial_ends_at > trial_started_at),
  CONSTRAINT host_subscriptions_period_dates_ck CHECK (current_period_end > current_period_start)
);
--> statement-breakpoint
CREATE INDEX host_subscriptions_user_idx ON host_subscriptions(user_id);
--> statement-breakpoint
CREATE INDEX host_subscriptions_status_period_idx ON host_subscriptions(status, current_period_end);
--> statement-breakpoint
CREATE UNIQUE INDEX host_subscriptions_provider_ref_uq ON host_subscriptions(provider, provider_subscription_reference) WHERE provider_subscription_reference IS NOT NULL;
--> statement-breakpoint
CREATE TABLE meetup_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES meetups(id) ON DELETE RESTRICT,
  attendee_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  host_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),
  unit_price_minor integer NOT NULL CHECK (unit_price_minor > 0),
  gross_amount_minor integer NOT NULL CHECK (gross_amount_minor > 0),
  currency varchar(3) NOT NULL,
  commission_bps integer NOT NULL CHECK (commission_bps BETWEEN 0 AND 10000),
  platform_fee_minor integer NOT NULL CHECK (platform_fee_minor >= 0),
  processor_fee_minor integer NOT NULL DEFAULT 0 CHECK (processor_fee_minor >= 0),
  host_net_minor integer NOT NULL CHECK (host_net_minor >= 0),
  status meetup_booking_status NOT NULL DEFAULT 'pending_payment',
  idempotency_key varchar(120) NOT NULL UNIQUE,
  refund_policy_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX meetup_bookings_meetup_status_idx ON meetup_bookings(meetup_id, status);
--> statement-breakpoint
CREATE INDEX meetup_bookings_attendee_idx ON meetup_bookings(attendee_id, created_at);
--> statement-breakpoint
CREATE INDEX meetup_bookings_host_idx ON meetup_bookings(host_id, created_at);
--> statement-breakpoint
CREATE TABLE host_wallet_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  currency varchar(3) NOT NULL,
  pending_minor integer NOT NULL DEFAULT 0 CHECK (pending_minor >= 0),
  available_minor integer NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  reserved_minor integer NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency)
);
--> statement-breakpoint
CREATE TABLE host_wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL REFERENCES host_wallet_accounts(id) ON DELETE RESTRICT,
  kind wallet_entry_kind NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor <> 0),
  currency varchar(3) NOT NULL,
  reference_type varchar(40) NOT NULL,
  reference_id uuid,
  idempotency_key varchar(140) NOT NULL UNIQUE,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX host_wallet_transactions_wallet_created_idx ON host_wallet_transactions(wallet_id, created_at);
--> statement-breakpoint
CREATE TABLE host_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  wallet_id uuid NOT NULL REFERENCES host_wallet_accounts(id) ON DELETE RESTRICT,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency varchar(3) NOT NULL,
  destination_country varchar(2) NOT NULL,
  destination_type varchar(32) NOT NULL,
  destination_reference varchar(180),
  provider varchar(32),
  provider_reference varchar(180),
  status host_payout_status NOT NULL DEFAULT 'requested',
  failure_reason varchar(1000),
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX host_payouts_user_created_idx ON host_payouts(user_id, created_at);
--> statement-breakpoint
CREATE INDEX host_payouts_status_created_idx ON host_payouts(status, created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX host_payouts_provider_ref_uq ON host_payouts(provider, provider_reference) WHERE provider_reference IS NOT NULL;
--> statement-breakpoint
CREATE TABLE payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar(32) NOT NULL,
  provider_event_id varchar(200) NOT NULL,
  event_type varchar(120) NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  processing_error varchar(1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, provider_event_id)
);
--> statement-breakpoint
CREATE INDEX payment_webhook_events_unprocessed_idx ON payment_webhook_events(processed_at, created_at);
--> statement-breakpoint
ALTER TABLE payments
  ADD COLUMN host_subscription_id uuid REFERENCES host_subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN booking_id uuid REFERENCES meetup_bookings(id) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX payments_booking_idx ON payments(booking_id);
--> statement-breakpoint
CREATE INDEX payments_host_subscription_idx ON payments(host_subscription_id);
