-- 迁移：额度制 + 用量表（在已有数据库上执行一次）
-- 用法：wrangler d1 execute xingyaoziwei-db --remote --file=./migrations/001_entitlement.sql
-- 注意：SQLite 的 ALTER TABLE ADD COLUMN 不支持 IF NOT EXISTS，
--       本文件只能在未跑过的库上执行一次；重复执行会因"列已存在"报错（可忽略后续）。
-- schema.sql 已同步为最新结构，全新部署无需跑本文件。

ALTER TABLE users ADD COLUMN credits INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN credits_expires_at TEXT;
ALTER TABLE users ADD COLUMN last_chat_at TEXT;

ALTER TABLE redeem_codes ADD COLUMN kind TEXT NOT NULL DEFAULT 'time';
ALTER TABLE redeem_codes ADD COLUMN credit_amount INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  alerted INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

-- 旧数据兼容：此前生成的兑换码 duration_days=30，属于时间包。
-- 新方案只保留"7 天不限问"一档时间包，把这批旧码统一改为 7 天，
-- 避免有人用旧码兑出 30 天不限问、绕过额度制。
UPDATE redeem_codes SET kind = 'time', duration_days = 7 WHERE kind = 'time' AND duration_days <> 7;
