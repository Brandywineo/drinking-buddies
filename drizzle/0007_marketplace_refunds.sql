CREATE TYPE marketplace_refund_status AS ENUM ('requested', 'processing', 'succeeded', 'failed', 'rejected');
--> statement-breakpoint
ALTER TYPE wallet_entry_kind ADD VALUE IF NOT EXISTS 'refund_reserve';
--> statement-breakpoint
ALTER TYPE wallet_entry_kind ADD VALUE IF NOT EXISTS 'refund_release';
--> statement-breakpoint
CREATE TABLE marketplace_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES meetup_bookings(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
  attendee_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  host_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  refund_amount_minor integer NOT NULL CHECK (refund_amount_minor > 0),
  host_debit_minor integer NOT NULL DEFAULT 0 CHECK (host_debit_minor >= 0),
  currency varchar(3) NOT NULL,
  status marketplace_refund_status NOT NULL DEFAULT 'requested',
  idempotency_key varchar(140) NOT NULL UNIQUE,
  provider_reference varchar(180),
  failure_reason varchar(1000),
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  processed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX marketplace_refunds_booking_idx ON marketplace_refunds(booking_id);
--> statement-breakpoint
CREATE INDEX marketplace_refunds_status_created_idx ON marketplace_refunds(status, created_at);
