-- Add actions column to skills table for generation type mapping
ALTER TABLE skills
ADD COLUMN actions text[] NOT NULL DEFAULT '{}';

-- GIN index for fast array containment queries
CREATE INDEX idx_skills_actions ON skills USING GIN (actions);
