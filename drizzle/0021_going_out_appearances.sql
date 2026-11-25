ALTER TABLE going_out_plans
  ADD COLUMN IF NOT EXISTS appearance_photo_key varchar(255),
  ADD COLUMN IF NOT EXISTS availability_mode varchar(24) NOT NULL DEFAULT 'planned';

ALTER TABLE going_out_plans
  ADD CONSTRAINT going_out_plans_availability_mode_check
  CHECK (availability_mode IN ('planned', 'available', 'open_to_company'));

CREATE INDEX IF NOT EXISTS going_out_plans_discovery_idx
  ON going_out_plans(status, starts_at, ends_at, availability_mode);

CREATE TABLE IF NOT EXISTS squad_appearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  photo_key varchar(255) NOT NULL,
  caption varchar(300),
  venue_name varchar(160),
  area varchar(120),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  drinks jsonb NOT NULL DEFAULT '[]'::jsonb,
  intention varchar(32) NOT NULL DEFAULT 'company',
  status varchar(16) NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT squad_appearances_time_check CHECK (ends_at > starts_at),
  CONSTRAINT squad_appearances_intention_check CHECK (intention IN ('company','buddy','friends','open'))
);
CREATE INDEX IF NOT EXISTS squad_appearances_discovery_idx
  ON squad_appearances(status, starts_at, ends_at);
