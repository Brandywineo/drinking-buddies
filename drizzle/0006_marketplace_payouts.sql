ALTER TYPE wallet_entry_kind ADD VALUE IF NOT EXISTS 'payout_reserve';
--> statement-breakpoint
ALTER TYPE wallet_entry_kind ADD VALUE IF NOT EXISTS 'payout_release';
--> statement-breakpoint
ALTER TYPE wallet_entry_kind ADD VALUE IF NOT EXISTS 'booking_release';
--> statement-breakpoint
ALTER TABLE host_payouts
  ADD COLUMN reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN reviewed_at timestamptz,
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
