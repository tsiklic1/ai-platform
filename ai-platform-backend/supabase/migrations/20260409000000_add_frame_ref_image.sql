ALTER TABLE generated_frame_sets
  ADD COLUMN reference_image_url text,
  ADD COLUMN reference_frame_position int CHECK (reference_frame_position BETWEEN 1 AND 5);
