CREATE TABLE go_out_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(100) NOT NULL,
  description varchar(500),
  area varchar(160) NOT NULL,
  venue_name varchar(160),
  starts_at timestamptz NOT NULL,
  capacity integer NOT NULL DEFAULT 8 CHECK (capacity BETWEEN 2 AND 50),
  visibility varchar(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  status varchar(16) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cancelled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX go_out_plans_starts_idx ON go_out_plans(starts_at);
CREATE INDEX go_out_plans_creator_idx ON go_out_plans(creator_id);
CREATE INDEX go_out_plans_visibility_status_idx ON go_out_plans(visibility, status);

CREATE TABLE go_out_plan_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES go_out_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'going' CHECK (status IN ('going', 'left')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT go_out_plan_members_plan_user_uq UNIQUE (plan_id, user_id)
);
CREATE INDEX go_out_plan_members_user_idx ON go_out_plan_members(user_id);

CREATE TABLE squads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  description varchar(500),
  area varchar(160),
  visibility varchar(16) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX squads_owner_idx ON squads(owner_id);
CREATE INDEX squads_visibility_idx ON squads(visibility);

CREATE TABLE squad_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'left')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT squad_members_squad_user_uq UNIQUE (squad_id, user_id)
);
CREATE INDEX squad_members_user_idx ON squad_members(user_id);

CREATE TABLE squad_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  squad_id uuid NOT NULL REFERENCES squads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body varchar(2000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX squad_messages_squad_created_idx ON squad_messages(squad_id, created_at);
