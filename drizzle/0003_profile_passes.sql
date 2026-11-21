CREATE TABLE profile_passes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_passes_distinct_users_ck CHECK (from_user_id <> to_user_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX profile_passes_pair_uq ON profile_passes(from_user_id, to_user_id);
--> statement-breakpoint
CREATE INDEX profile_passes_to_user_idx ON profile_passes(to_user_id);
