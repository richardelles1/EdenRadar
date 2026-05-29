ALTER TABLE user_alerts ADD COLUMN IF NOT EXISTS cadence text NOT NULL DEFAULT 'weekly';
