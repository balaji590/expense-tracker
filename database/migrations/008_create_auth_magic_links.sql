-- Magic links are keyed by email, not user_id: the user record is only
-- found-or-created at successful VERIFICATION time (proof of email
-- ownership), never at request time. This avoids creating phantom User rows
-- for emails that request a link but never click it.
CREATE TABLE auth_magic_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       CITEXT NOT NULL,
  token_hash  TEXT NOT NULL UNIQUE,   -- hash only — the raw token is never stored (exists only in the emailed URL)
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,             -- NULL = unused. Set atomically on verification (single-use enforcement).
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_magic_links_email ON auth_magic_links(email);
