CREATE TYPE conversation_kind AS ENUM ('match', 'meetup');
--> statement-breakpoint
CREATE TYPE report_status AS ENUM ('open', 'reviewing', 'resolved', 'dismissed');
--> statement-breakpoint

CREATE TABLE profile_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_likes_distinct_users_ck CHECK (from_user_id <> to_user_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX profile_likes_pair_uq ON profile_likes(from_user_id, to_user_id);
--> statement-breakpoint
CREATE INDEX profile_likes_to_user_idx ON profile_likes(to_user_id);
--> statement-breakpoint

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind conversation_kind NOT NULL,
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE,
  meetup_id uuid REFERENCES meetups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conversations_target_ck CHECK (
    (kind = 'match' AND match_id IS NOT NULL AND meetup_id IS NULL) OR
    (kind = 'meetup' AND meetup_id IS NOT NULL AND match_id IS NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX conversations_match_id_uq ON conversations(match_id);
--> statement-breakpoint
CREATE UNIQUE INDEX conversations_meetup_id_uq ON conversations(meetup_id);
--> statement-breakpoint

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body varchar(4000) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
--> statement-breakpoint
CREATE INDEX messages_conversation_created_idx ON messages(conversation_id, created_at);
--> statement-breakpoint
CREATE INDEX messages_sender_idx ON messages(sender_id);
--> statement-breakpoint

CREATE TABLE user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_distinct_users_ck CHECK (blocker_id <> blocked_id)
);
--> statement-breakpoint
CREATE UNIQUE INDEX user_blocks_pair_uq ON user_blocks(blocker_id, blocked_id);
--> statement-breakpoint

CREATE TABLE user_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  content_type varchar(32) NOT NULL,
  content_id uuid,
  reason varchar(100) NOT NULL,
  details varchar(2000),
  status report_status NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX user_reports_status_created_idx ON user_reports(status, created_at);
--> statement-breakpoint
CREATE INDEX user_reports_reporter_idx ON user_reports(reporter_id);
--> statement-breakpoint
