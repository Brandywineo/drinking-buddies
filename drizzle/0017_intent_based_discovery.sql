ALTER TABLE profiles ADD COLUMN IF NOT EXISTS preferred_drinks jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS going_out_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  venue_name varchar(160), area varchar(120), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  drinks jsonb NOT NULL DEFAULT '[]'::jsonb, drink_quantity varchar(80),
  intention varchar(32) NOT NULL DEFAULT 'company', note varchar(300),
  status varchar(16) NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT going_out_plans_time_check CHECK (ends_at > starts_at),
  CONSTRAINT going_out_plans_intention_check CHECK (intention IN ('company','buddy','friends','open'))
);
CREATE INDEX IF NOT EXISTS going_out_plans_active_window_idx ON going_out_plans(status, starts_at, ends_at);
