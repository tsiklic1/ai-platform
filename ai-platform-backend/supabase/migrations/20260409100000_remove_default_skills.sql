-- Remove default skills feature entirely.
-- Delete the seeded default skill rows, drop RLS policies that reference
-- is_default, drop the column + index, then recreate simple RLS policies.

-- 1. Delete all default skill rows
DELETE FROM skills WHERE is_default = true;

-- 2. Drop RLS policies that depend on is_default (must happen before column drop)
DROP POLICY IF EXISTS "read own or default skills" ON skills;
DROP POLICY IF EXISTS "insert own skills" ON skills;
DROP POLICY IF EXISTS "update own non-default skills" ON skills;
DROP POLICY IF EXISTS "delete own non-default skills" ON skills;

-- 3. Drop the index
DROP INDEX IF EXISTS idx_skills_is_default;

-- 4. Drop the column
ALTER TABLE skills DROP COLUMN IF EXISTS is_default;

-- 5. Recreate simple user-owns-only RLS policies
CREATE POLICY "read own skills" ON skills
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "insert own skills" ON skills
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "update own skills" ON skills
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "delete own skills" ON skills
  FOR DELETE USING (user_id = auth.uid());
