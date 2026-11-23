ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url varchar(500);
CREATE INDEX IF NOT EXISTS users_created_at_idx ON users (created_at);
CREATE INDEX IF NOT EXISTS payments_status_created_idx ON payments (status, created_at);
