'use client';

import { useCallback, useEffect, useState } from 'react';

type Me = {
  authenticated: boolean;
  user: null | {
    id: number;
    username: string;
    isPaid: boolean;
    expiresAt: string | null;
    freeUsed: number;
  };
};

type Mode = 'login' | 'signup';

export default function RedeemPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadMe = useCallback(async () => {
    try {
      const res = await fetch('/api/me', { cache: 'no-store' });
      setMe((await res.json()) as Me);
    } catch {
      setMe({ authenticated: false, user: null });
    }
  }, []);

  useEffect(() => { void loadMe(); }, [loadMe]);

  const handleAuth = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const endpoint = mode === 'login' ? '/api/login' : '/api/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? '操作失败' });
        return;
      }
      setPassword('');
      setMsg({ type: 'ok', text: mode === 'login' ? '登录成功' : '注册成功，已自动登录' });
      await loadMe();
    } catch {
      setMsg({ type: 'err', text: '网络错误，请稍后重试' });
    } finally {
      setBusy(false);
    }
  };

  const handleRedeem = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const data = (await res.json()) as { error?: string; expiresAt?: string; durationDays?: number };
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? '兑换失败' });
        return;
      }
      setCode('');
      const until = data.expiresAt ? new Date(data.expiresAt).toLocaleDateString('zh-CN') : '';
      setMsg({ type: 'ok', text: `兑换成功，权益已延长至 ${until}` });
      await loadMe();
    } catch {
      setMsg({ type: 'err', text: '网络错误，请稍后重试' });
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    setBusy(true);
    try {
      await fetch('/api/logout', { method: 'POST' });
      setMsg(null);
      await loadMe();
    } finally {
      setBusy(false);
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card, #fff)',
    border: '1px solid rgba(0,0,0,0.08)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.15)',
    background: 'transparent',
    color: 'inherit',
    fontSize: 14,
    boxSizing: 'border-box',
  };
  const btnStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 16px',
    borderRadius: 8,
    border: 'none',
    background: '#8a6a1f',
    color: '#fff',
    fontSize: 14,
    cursor: busy ? 'not-allowed' : 'pointer',
    opacity: busy ? 0.6 : 1,
  };

  return (
    <main style={{ maxWidth: 460, margin: '48px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>账号与兑换</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 1.7 }}>
        登录后输入兑换码即可开通权益。权益绑定账号，换设备重新登录即可恢复。
      </p>

      {msg && (
        <div style={{
          padding: '10px 12px', borderRadius: 8, marginBottom: 16, fontSize: 13,
          background: msg.type === 'ok' ? 'rgba(30,140,80,0.1)' : 'rgba(200,50,50,0.08)',
          color: msg.type === 'ok' ? '#1a7a45' : '#b3261e',
        }}>
          {msg.text}
        </div>
      )}

      {!me && <p style={{ fontSize: 13, color: '#888' }}>加载中…</p>}

      {me && !me.authenticated && (
        <div style={{ ...cardStyle, borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
            {(['login', 'signup'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setMsg(null); }}
                style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer', fontSize: 13,
                  border: '1px solid rgba(0,0,0,0.12)',
                  background: mode === m ? '#8a6a1f' : 'transparent',
                  color: mode === m ? '#fff' : 'inherit',
                }}
              >
                {m === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            <input
              style={inputStyle}
              placeholder="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
            <input
              style={inputStyle}
              type="password"
              placeholder="密码（至少 8 位）"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAuth(); }}
            />
            <button type="button" style={btnStyle} disabled={busy} onClick={() => void handleAuth()}>
              {mode === 'login' ? '登录' : '注册并登录'}
            </button>
          </div>
        </div>
      )}

      {me && me.authenticated && (
        <>
          <div style={{ ...cardStyle, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>当前账号：<strong>{me.user?.username}</strong></div>
              <div>权益状态：{me.user?.isPaid ? '已开通' : '未开通'}</div>
              {me.user?.expiresAt && (
                <div>到期时间：{new Date(me.user.expiresAt).toLocaleString('zh-CN')}</div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={busy}
              style={{ marginTop: 12, fontSize: 12, background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 0 }}
            >
              退出登录
            </button>
          </div>

          <div style={{ ...cardStyle, borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>输入兑换码</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <input
                style={inputStyle}
                placeholder="如 XYZW-AB3D-7K9Q"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleRedeem(); }}
              />
              <button type="button" style={btnStyle} disabled={busy} onClick={() => void handleRedeem()}>
                兑换
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
