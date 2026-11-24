CREATE TABLE memory_album_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES memory_albums(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL DEFAULT 'contributor',
  status varchar(16) NOT NULL DEFAULT 'invited',
  invited_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX memory_album_members_album_user_uq ON memory_album_members(album_id,user_id);
--> statement-breakpoint
CREATE INDEX memory_album_members_user_status_idx ON memory_album_members(user_id,status);
--> statement-breakpoint
CREATE TABLE memory_album_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES memory_albums(id) ON DELETE CASCADE,
  invited_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX memory_album_invites_album_user_uq ON memory_album_invites(album_id,invited_user_id);
--> statement-breakpoint
CREATE INDEX memory_album_invites_user_status_idx ON memory_album_invites(invited_user_id,status);
--> statement-breakpoint
CREATE TABLE memory_album_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES memory_albums(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX memory_album_saves_user_album_uq ON memory_album_saves(user_id,album_id);
--> statement-breakpoint
CREATE INDEX memory_album_saves_user_created_idx ON memory_album_saves(user_id,created_at);
--> statement-breakpoint
CREATE TABLE memory_media_saves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES memory_media(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX memory_media_saves_user_media_uq ON memory_media_saves(user_id,media_id);
--> statement-breakpoint
CREATE INDEX memory_media_saves_user_created_idx ON memory_media_saves(user_id,created_at);
--> statement-breakpoint
CREATE TABLE memory_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid REFERENCES memory_albums(id) ON DELETE CASCADE,
  media_id uuid REFERENCES memory_media(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id uuid,
  body varchar(1200) NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_comments_target_ck CHECK ((album_id IS NOT NULL)::int + (media_id IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE INDEX memory_comments_album_created_idx ON memory_comments(album_id,created_at);
--> statement-breakpoint
CREATE INDEX memory_comments_media_created_idx ON memory_comments(media_id,created_at);
--> statement-breakpoint
CREATE INDEX memory_comments_parent_idx ON memory_comments(parent_id);
--> statement-breakpoint
CREATE TABLE memory_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid REFERENCES memory_albums(id) ON DELETE CASCADE,
  media_id uuid REFERENCES memory_media(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction varchar(24) NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_reactions_target_ck CHECK ((album_id IS NOT NULL)::int + (media_id IS NOT NULL)::int = 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX memory_reactions_album_user_uq ON memory_reactions(album_id,user_id) WHERE album_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX memory_reactions_media_user_uq ON memory_reactions(media_id,user_id) WHERE media_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX memory_reactions_album_idx ON memory_reactions(album_id);
--> statement-breakpoint
CREATE INDEX memory_reactions_media_idx ON memory_reactions(media_id);
--> statement-breakpoint
CREATE TABLE memory_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES memory_albums(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX memory_share_links_token_hash_uq ON memory_share_links(token_hash);
--> statement-breakpoint
CREATE INDEX memory_share_links_album_idx ON memory_share_links(album_id);
--> statement-breakpoint
CREATE TABLE memory_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  album_id uuid REFERENCES memory_albums(id) ON DELETE CASCADE,
  media_id uuid REFERENCES memory_media(id) ON DELETE CASCADE,
  kind varchar(32) NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX memory_notifications_user_created_idx ON memory_notifications(user_id,created_at);
--> statement-breakpoint
CREATE INDEX memory_notifications_user_read_idx ON memory_notifications(user_id,read_at);

--> statement-breakpoint
CREATE TABLE memory_followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX memory_followers_creator_follower_uq ON memory_followers(creator_id,follower_id);
--> statement-breakpoint
CREATE INDEX memory_followers_follower_idx ON memory_followers(follower_id);
