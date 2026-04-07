-- Default skills: system-managed, globally readable, not user-owned

-- Flag + allow NULL user_id for system-owned rows
ALTER TABLE skills ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;
ALTER TABLE skills ALTER COLUMN user_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_skills_is_default ON skills(is_default) WHERE is_default = true;

-- RLS: everyone reads defaults; owners still read/write their own
DROP POLICY IF EXISTS "users own skills" ON skills;
DROP POLICY IF EXISTS "read own or default skills" ON skills;
DROP POLICY IF EXISTS "insert own skills" ON skills;
DROP POLICY IF EXISTS "update own non-default skills" ON skills;
DROP POLICY IF EXISTS "delete own non-default skills" ON skills;

CREATE POLICY "read own or default skills" ON skills
  FOR SELECT USING (user_id = auth.uid() OR is_default = true);

CREATE POLICY "insert own skills" ON skills
  FOR INSERT WITH CHECK (user_id = auth.uid() AND is_default = false);

CREATE POLICY "update own non-default skills" ON skills
  FOR UPDATE USING (user_id = auth.uid() AND is_default = false);

CREATE POLICY "delete own non-default skills" ON skills
  FOR DELETE USING (user_id = auth.uid() AND is_default = false);

-- Seed placeholder default skills. Update content later via Supabase SQL editor
-- (service role bypasses RLS) or a follow-up migration.
INSERT INTO skills (user_id, name, description, content, actions, is_default) VALUES
  (
    NULL,
    'Default Image Guidelines',
    'Baseline instructions applied to every image and frame generation.',
    '# Default Image Guidelines

Placeholder content — replace with your brand''s default image generation rules, style notes, and constraints.',
    ARRAY['image', 'frames'],
    true
  ),
  (
    NULL,
    'Default Text Guidelines',
    'Baseline instructions applied to every caption and text generation.',
    '# Default Text Guidelines

Placeholder content — replace with your brand''s default voice, tone, and text generation rules.',
    ARRAY['text'],
    true
  );
