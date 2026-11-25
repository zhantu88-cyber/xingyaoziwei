-- 003: 管理员标记 + 后台充值流水
-- 用于「人工收款 + 后台一键充值」模式：管理员收款后直接在 /admin 给用户加额度。

ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;

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
