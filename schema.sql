CREATE TABLE IF NOT EXISTS readings (
  k TEXT PRIMARY KEY,
  text_overview TEXT,
  text_personality TEXT,
  text_love TEXT,
  text_career TEXT,
  text_wealth TEXT,
  text_health TEXT,
  text_family TEXT,
  text_children TEXT,
  text_move TEXT,
  text_friends TEXT,
  text_home TEXT,
  text_spirit TEXT,
  text_parents TEXT
);

CREATE TABLE IF NOT EXISTS shard_index (
  year INTEGER PRIMARY KEY,
  bucket_binding TEXT NOT NULL CHECK (
    bucket_binding IN (
      'R2_BUCKET_1', 'R2_BUCKET_2', 'R2_BUCKET_3',
      'R2_BUCKET_4', 'R2_BUCKET_5', 'R2_BUCKET_6'
    )
  )
);
