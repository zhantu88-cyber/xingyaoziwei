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
-- 收费模型：额度制为主 + 一档时间包。
--   expires_at          时间包（7 天不限问）到期时间，NULL 表示无时间包。
--   credits             剩余问答额度（次数）。注册送 1 次。
--   credits_expires_at  额度有效期；NULL=永久（注册赠送），购买次数包后为 180 天。
--   last_chat_at        上次问答时间，用于最小间隔限流。
--   free_used           旧版"是否已用免费次数"，保留兼容，新逻辑用 credits。
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  expires_at TEXT,
  credits INTEGER NOT NULL DEFAULT 0,
  credits_expires_at TEXT,
  last_chat_at TEXT,
  signup_ip TEXT,
  free_used INTEGER NOT NULL DEFAULT 0,
  -- 管理员标记：1 = 可进 /admin 后台一键充值；普通用户为 0。
  is_admin INTEGER NOT NULL DEFAULT 0,
  -- 找回密码用；老用户为 NULL，可登录后在账号页补绑。
  email TEXT,
  created_at TEXT
);
-- 注册 IP 与时间戳的索引：支撑"同 IP 24h 内注册数"统计与按 IP 限免费额度。
CREATE INDEX IF NOT EXISTS idx_users_signup_ip_created ON users(signup_ip, created_at);

-- 兑换码：kind = time（时间包，duration_days 天不限问）/ credits（次数包，credit_amount 次）。
-- status = unused / used。used_by 关联 users.id。
CREATE TABLE IF NOT EXISTS redeem_codes (
  code TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'time',
  duration_days INTEGER NOT NULL DEFAULT 0,
  credit_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unused',
  used_by INTEGER,
  used_at TEXT
);

-- 每日用量：成本层（每日上限）与监控层（超阈值告警）的数据基础。
-- day 为 UTC 日期 YYYY-MM-DD。alerted 标记当日是否已发过告警，避免重复打扰。
CREATE TABLE IF NOT EXISTS usage_daily (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  alerted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- 后台充值流水：管理员在 /admin 给用户手动充值（收款后）时记录，便于对账与追溯。
-- kind = credits（次数包）/ time（时间包）。price 为成交价（元），仅作账目参考。
CREATE TABLE IF NOT EXISTS recharge_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER NOT NULL,
  admin_name TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  package_id TEXT NOT NULL,
  package_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  credits INTEGER,
  days INTEGER,
  price REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_recharge_logs_user ON recharge_logs(user_id, created_at);

-- 找回密码：用户邮箱 + 重置令牌（令牌只存哈希）。
CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash);
