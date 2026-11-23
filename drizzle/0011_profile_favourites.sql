CREATE TABLE favorite_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_profiles_user_target_uq UNIQUE (user_id, target_user_id),
  CONSTRAINT favorite_profiles_not_self_ck CHECK (user_id <> target_user_id)
);
CREATE INDEX favorite_profiles_target_idx ON favorite_profiles(target_user_id);

CREATE TABLE favorite_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT favorite_venues_user_venue_uq UNIQUE (user_id, venue_id)
);
CREATE INDEX favorite_venues_venue_idx ON favorite_venues(venue_id);
