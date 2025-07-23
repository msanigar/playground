-- Canvas Collaboration Schema for Supabase
-- Run this in Supabase SQL Editor: Dashboard > SQL Editor > New Query

-- Table for storing canvas strokes
CREATE TABLE canvas_strokes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_color TEXT NOT NULL,
  stroke_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Table for real-time cursor positions (ephemeral data)
CREATE TABLE canvas_cursors (
  user_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_color TEXT NOT NULL,
  x FLOAT NOT NULL,
  y FLOAT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  PRIMARY KEY (user_id, room_id)
);

-- Indexes for better performance
CREATE INDEX idx_canvas_strokes_room_id ON canvas_strokes(room_id);
CREATE INDEX idx_canvas_strokes_created_at ON canvas_strokes(created_at);
CREATE INDEX idx_canvas_cursors_room_id ON canvas_cursors(room_id);
CREATE INDEX idx_canvas_cursors_updated_at ON canvas_cursors(updated_at);

-- Enable Row Level Security (RLS)
ALTER TABLE canvas_strokes ENABLE ROW LEVEL SECURITY;
ALTER TABLE canvas_cursors ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (you can make these more restrictive later)
CREATE POLICY "Anyone can read canvas strokes" ON canvas_strokes FOR SELECT USING (true);
CREATE POLICY "Anyone can insert canvas strokes" ON canvas_strokes FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can delete their own strokes" ON canvas_strokes FOR DELETE USING (true);

CREATE POLICY "Anyone can read cursors" ON canvas_cursors FOR SELECT USING (true);
CREATE POLICY "Anyone can insert cursors" ON canvas_cursors FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update cursors" ON canvas_cursors FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete cursors" ON canvas_cursors FOR DELETE USING (true);

-- Enable real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE canvas_strokes;
ALTER PUBLICATION supabase_realtime ADD TABLE canvas_cursors;

-- Function to clean up old cursors (optional - runs every 5 minutes)
CREATE OR REPLACE FUNCTION cleanup_old_cursors()
RETURNS void AS $$
BEGIN
  DELETE FROM canvas_cursors 
  WHERE updated_at < now() - interval '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a scheduled job to clean up old cursors
-- You can enable this in Supabase Dashboard > Database > Extensions > pg_cron
-- SELECT cron.schedule('cleanup-cursors', '*/5 * * * *', 'SELECT cleanup_old_cursors();'); 