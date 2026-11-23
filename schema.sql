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

-- ─── 账号与权益（AI 付费问答系统） ───
-- 密码用 PBKDF2(Web Crypto) 哈希，salt 为 16 字节随机 hex；不使用 bcrypt/MD5/SHA1。
-- expires_at 为权益到期时间(ISO 8601)，NULL 表示未付费。
-- free_used 表示是否已用掉注册赠送的 1 次免费 AI 问答。
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at TEXT,
  free_used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);

-- 兑换码：status = unused / used。used_by 关联 users.id。
CREATE TABLE IF NOT EXISTS redeem_codes (
  code TEXT PRIMARY KEY,
  duration_days INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'unused',
  used_by INTEGER,
  used_at TEXT
);
