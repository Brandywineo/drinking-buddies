ALTER TABLE profiles
  ADD COLUMN display_popularity_score boolean NOT NULL DEFAULT false,
  ADD COLUMN display_reputation_score boolean NOT NULL DEFAULT false;
