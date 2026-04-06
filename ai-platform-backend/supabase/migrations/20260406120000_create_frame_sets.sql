-- generated_frame_sets: groups of 5 frames for video generation
CREATE TABLE generated_frame_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  brand_id uuid NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  content_type_id uuid REFERENCES content_types(id) ON DELETE SET NULL,
  prompt text NOT NULL,
  full_prompt text NOT NULL,
  aspect_ratio text NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('1:1', '9:16')),
  status text NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'complete', 'failed')),
  frame_count int NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- generated_frames: individual frames within a set
CREATE TABLE generated_frames (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  frame_set_id uuid NOT NULL REFERENCES generated_frame_sets(id) ON DELETE CASCADE,
  frame_number int NOT NULL CHECK (frame_number BETWEEN 1 AND 5),
  storage_path text NOT NULL,
  url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (frame_set_id, frame_number)
);

-- RLS
ALTER TABLE generated_frame_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_frames ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users own frame sets" ON generated_frame_sets
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "users own frames" ON generated_frames
  FOR ALL USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_frame_sets_user ON generated_frame_sets(user_id);
CREATE INDEX idx_frame_sets_brand ON generated_frame_sets(brand_id);
CREATE INDEX idx_frame_sets_created ON generated_frame_sets(created_at DESC);
CREATE INDEX idx_frames_set ON generated_frames(frame_set_id);
