-- 004: 邮箱找回密码
-- users 加 email（找回密码用；老用户为 NULL，可登录后在账号页补绑）
-- password_resets 存重置令牌（只存哈希，明文令牌只在邮件链接里出现一次）

ALTER TABLE users ADD COLUMN email TEXT;

CREATE TABLE IF NOT EXISTS password_resets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets(token_hash);
