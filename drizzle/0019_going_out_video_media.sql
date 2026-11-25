ALTER TABLE going_out_plans
  ADD COLUMN IF NOT EXISTS appearance_media_kind varchar(12) NOT NULL DEFAULT 'image';

DO $$ BEGIN
  ALTER TABLE going_out_plans
    ADD CONSTRAINT going_out_plans_appearance_media_kind_check
    CHECK (appearance_media_kind IN ('image', 'video'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
