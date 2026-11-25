'use client';
import { useCallback, useEffect, useState } from 'react';
import { PACKAGES } from '@/lib/packages';

/**
 * 管理后台（仅 is_admin=1 的账号可见）。
 * 用途：站长人工收款后，搜到用户 → 选套餐 → 一键充值，直接给账号加权益。
 */

type AdminUser = {
  id: number;
  username: string;
  credits: number;
  creditsExpiresAt: string | null;
  hasTimePass: boolean;
  expiresAt: string | null;
  createdAt: string | null;
  isAdmin: boolean;
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [q, setQ] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  // 每个用户当前选中的套餐 id
  const [picked, setPicked] = useState<Record<number, string>>({});

  const load = useCallback(async (keyword: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(keyword)}`, { cache: 'no-store' });
      if (res.status === 403) { setIsAdmin(false); return; }
      const data = (await res.json()) as { users?: AdminUser[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? '加载失败');
      setIsAdmin(true);
      setUsers(data.users ?? []);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : '加载失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次进入：确认权限并加载最近用户
  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { authenticated?: boolean; user?: { isAdmin?: boolean } | null }) => {
        const admin = !!(d.authenticated && d.user?.isAdmin);
        setIsAdmin(admin);
        if (admin) void load('');
      })
      .catch(() => setIsAdmin(false));
  }, [load]);

  const recharge = async (u: AdminUser) => {
    const packageId = picked[u.id];
    if (!packageId) {
      setMsg({ type: 'err', text: `请先为「${u.username}」选择套餐` });
      return;
    }
    setBusyId(u.id);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/recharge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u.username, packageId }),
      });
      const data = (await res.json()) as { ok?: boolean; packageName?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? '充值失败');
      setMsg({ type: 'ok', text: `已为「${u.username}」充值 ${data.packageName ?? ''}，请让用户刷新页面` });
      await load(q);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : '充值失败' });
    } finally {
      setBusyId(null);
    }
  };

  if (isAdmin === null) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--tx-3)', fontSize: 13 }}>加载中…</div>;
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '80px 20px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--tx-2)', marginBottom: 12 }}>该页面仅管理员可访问。</p>
        <a href="/redeem" style={{ fontSize: 13, color: 'var(--ac)', textDecoration: 'underline' }}>前往登录</a>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 20px 80px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 600, color: 'var(--tx-0)', marginBottom: 4 }}>充值后台</h1>
      <p style={{ fontSize: 12, color: 'var(--tx-3)', marginBottom: 24 }}>
        收到用户付款后，在此搜索用户名并选择套餐一键充值；用户刷新页面即可使用。
      </p>

      {/* 搜索 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <input
          className="input-base"
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void load(q); }}
          placeholder="输入用户名（支持模糊搜索），留空显示最近注册"
          style={{ flex: 1 }}
        />
        <button
          onClick={() => void load(q)}
          disabled={loading}
          style={{
            padding: '10px 20px', borderRadius: 'var(--r-sm)', border: 'none',
            background: 'var(--tx-0)', color: 'white', fontSize: 13,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '搜索中…' : '搜索'}
        </button>
      </div>

      {msg && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 10, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(45,122,74,0.08)' : 'rgba(168,50,40,0.06)',
          border: `1px solid ${msg.type === 'ok' ? 'rgba(45,122,74,0.25)' : 'rgba(168,50,40,0.25)'}`,
          color: msg.type === 'ok' ? '#2D7A4A' : '#A83228',
        }}>
          {msg.text}
        </div>
      )}

      {/* 用户列表 */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr 100px',
          gap: 12, padding: '12px 18px', fontSize: 11, letterSpacing: '0.08em',
          color: 'var(--tx-3)', borderBottom: '1px solid var(--bdr)', background: 'var(--bg-1)',
        }}>
          <span>用户名</span><span>剩余额度</span><span>额度有效期</span><span>充值套餐</span><span>操作</span>
        </div>

        {users.length === 0 && (
          <div style={{ padding: '32px 18px', textAlign: 'center', fontSize: 13, color: 'var(--tx-3)' }}>
            没有找到用户
          </div>
        )}

        {users.map(u => (
          <div
            key={u.id}
            style={{
              display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1.6fr 100px',
              gap: 12, padding: '12px 18px', alignItems: 'center',
              borderBottom: '1px solid var(--bdr)', fontSize: 13,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <span style={{ color: 'var(--tx-0)', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{u.username}</span>
              <span style={{ fontSize: 11, color: 'var(--tx-3)' }}>
                注册 {fmtDate(u.createdAt)}{u.isAdmin ? ' · 管理员' : ''}
              </span>
            </div>
            <div>
              <span style={{ color: u.credits > 0 ? 'var(--ac)' : 'var(--tx-3)' }}>{u.credits} 次</span>
              {u.hasTimePass && <div style={{ fontSize: 11, color: 'var(--ac)' }}>不限问至 {fmtDate(u.expiresAt)}</div>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--tx-2)' }}>{u.creditsExpiresAt ? fmtDate(u.creditsExpiresAt) : (u.credits > 0 ? '永久' : '—')}</div>
            <div>
              <select
                className="input-base"
                value={picked[u.id] ?? ''}
                onChange={e => setPicked(prev => ({ ...prev, [u.id]: e.target.value }))}
                style={{ fontSize: 12, padding: '7px 10px' }}
              >
                <option value="">选择套餐…</option>
                {PACKAGES.map(p => (
                  <option key={p.id} value={p.id}>{p.name} · ¥{p.price}</option>
                ))}
              </select>
            </div>
            <div>
              <button
                onClick={() => void recharge(u)}
                disabled={busyId === u.id}
                style={{
                  width: '100%', padding: '8px 0', borderRadius: 'var(--r-sm)', border: 'none',
                  background: busyId === u.id ? 'var(--bg-2)' : 'var(--ac)', color: 'white',
                  fontSize: 12, cursor: busyId === u.id ? 'not-allowed' : 'pointer',
                }}
              >
                {busyId === u.id ? '处理中' : '充值'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 14, lineHeight: 1.7 }}>
        提示：充值会按套餐叠加到用户账号；次数包有效期 180 天（旧额度已过期则从今天重新算），时间包在现有基础上顺延。
      </p>
    </div>
  );
}
