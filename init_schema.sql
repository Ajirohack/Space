-- Invitations Table
CREATE TABLE IF NOT EXISTS invitations (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  pin TEXT NOT NULL,
  invited_name TEXT,
  status TEXT DEFAULT 'pending'
);

-- Onboarding Table
CREATE TABLE IF NOT EXISTS onboarding (
  id SERIAL PRIMARY KEY,
  invitation_code TEXT REFERENCES invitations(code),
  voice_consent BOOLEAN,
  responses TEXT[]
);

-- Memberships Table
CREATE TABLE IF NOT EXISTS memberships (
  id SERIAL PRIMARY KEY,
  invitation_code TEXT REFERENCES invitations(code),
  membership_code TEXT UNIQUE,
  membership_key TEXT UNIQUE,
  issued_to TEXT,
  active BOOLEAN DEFAULT TRUE,
  issued_at TIMESTAMPTZ DEFAULT now()
);