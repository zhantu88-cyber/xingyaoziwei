-- 迁移：注册 IP 记录（防养号：同 IP 24h 内前 N 个账号送免费额度）
-- 用法：wrangler d1 execute xingyaoziwei-db --remote --file=./migrations/002_signup_ip.sql
-- 只能执行一次（SQLite ALTER ADD COLUMN 不支持 IF NOT EXISTS）。

ALTER TABLE users ADD COLUMN signup_ip TEXT;
CREATE INDEX IF NOT EXISTS idx_users_signup_ip_created ON users(signup_ip, created_at);
