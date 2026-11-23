CREATE TABLE memory_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  meetup_id uuid REFERENCES meetups(id) ON DELETE CASCADE,
  squad_id uuid REFERENCES squads(id) ON DELETE CASCADE,
  title varchar(100) NOT NULL,
  description varchar(500),
  visibility varchar(16) NOT NULL DEFAULT 'members' CHECK (visibility IN ('public','members','private')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (meetup_id IS NULL OR squad_id IS NULL)
);
CREATE INDEX memory_albums_creator_idx ON memory_albums(creator_id, created_at);
CREATE INDEX memory_albums_meetup_idx ON memory_albums(meetup_id);
CREATE INDEX memory_albums_squad_idx ON memory_albums(squad_id);

CREATE TABLE memory_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id uuid NOT NULL REFERENCES memory_albums(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key varchar(180) NOT NULL UNIQUE,
  mime_type varchar(80) NOT NULL,
  media_kind varchar(12) NOT NULL CHECK (media_kind IN ('image','video')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  caption varchar(500),
  moderation_status varchar(16) NOT NULL DEFAULT 'approved' CHECK (moderation_status IN ('pending','approved','rejected')),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX memory_media_album_created_idx ON memory_media(album_id, created_at);
CREATE INDEX memory_media_uploader_idx ON memory_media(uploader_id, created_at);
CREATE INDEX memory_media_moderation_idx ON memory_media(moderation_status, created_at);

CREATE TABLE memory_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  media_id uuid NOT NULL REFERENCES memory_media(id) ON DELETE CASCADE,
  tagged_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tagged_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(media_id, tagged_user_id)
);
CREATE INDEX memory_tags_user_status_idx ON memory_tags(tagged_user_id, status);

CREATE TABLE venue_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL DEFAULT 'staff' CHECK (role IN ('manager','staff')),
  status varchar(16) NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','removed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(venue_id, user_id)
);
CREATE INDEX venue_staff_user_idx ON venue_staff(user_id);

CREATE TABLE venue_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  uploaded_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  storage_key varchar(180) NOT NULL UNIQUE,
  mime_type varchar(80) NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes > 0),
  caption varchar(240),
  status varchar(16) NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venue_photos_venue_created_idx ON venue_photos(venue_id, created_at);

CREATE TABLE venue_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  created_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(120) NOT NULL,
  description varchar(1000) NOT NULL,
  deal_type varchar(24) NOT NULL CHECK (deal_type IN ('happy_hour','group','birthday','vip','general')),
  discount_label varchar(60),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  status varchar(16) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','paused','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX venue_deals_venue_status_idx ON venue_deals(venue_id, status, starts_at);
CREATE INDEX venue_deals_ends_idx ON venue_deals(ends_at);

CREATE TABLE venue_deal_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES venue_deals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claim_code varchar(24) NOT NULL UNIQUE,
  status varchar(16) NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed','redeemed','cancelled')),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_at timestamptz,
  UNIQUE(deal_id, user_id)
);
CREATE INDEX venue_deal_claims_user_idx ON venue_deal_claims(user_id, claimed_at);

CREATE TABLE venue_enquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  name varchar(100) NOT NULL,
  email varchar(320) NOT NULL,
  phone varchar(24),
  subject varchar(120) NOT NULL,
  message varchar(2000) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venue_enquiries_venue_status_idx ON venue_enquiries(venue_id, status, created_at);

CREATE TABLE venue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  event_type varchar(24) NOT NULL CHECK (event_type IN ('view','deal_view','deal_claim','enquiry','website_click')),
  reference_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX venue_events_venue_type_created_idx ON venue_events(venue_id, event_type, created_at);

CREATE TABLE venue_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  requested_by_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title varchar(120) NOT NULL,
  placement varchar(24) NOT NULL CHECK (placement IN ('featured','promoted_deal','promoted_event')),
  budget_minor integer NOT NULL CHECK (budget_minor >= 10000),
  currency varchar(3) NOT NULL DEFAULT 'KES' CHECK (currency = 'KES'),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','completed')),
  reviewed_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX venue_promotions_status_idx ON venue_promotions(status, created_at);
CREATE INDEX venue_promotions_venue_idx ON venue_promotions(venue_id);
