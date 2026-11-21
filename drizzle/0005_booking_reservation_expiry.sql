ALTER TABLE meetup_bookings
  ADD COLUMN expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes');
--> statement-breakpoint
CREATE INDEX meetup_bookings_active_reservations_idx
  ON meetup_bookings(meetup_id, expires_at)
  WHERE status = 'pending_payment';
