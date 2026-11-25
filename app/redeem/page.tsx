'use client';

import { useCallback, useEffect, useState } from 'react';
import Turnstile from '@/components/Turnstile';
import { PACKAGES } from '@/lib/packages';

type Me = {
  authenticated: boolean;
  user: null | {
    id: number;
    username: string;
    hasTimePass: boolean;
    expiresAt: string | null;
    credits: number;
    rawCredits: number;
    creditsExpiresAt: string | null;
    isPaid: boolean;
    freeUsed: number;
    isAdmin?: boolean;
    email?: string | null;
  };
};

type Mode = 'login' | 'signup';

export default function RedeemPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  // 账号安全（登录后）：改密码 / 绑定邮箱
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwdConfirm, setNewPwdConfirm] = useState('');
  const [bindEmail, setBindEmail] = useState('');
  const [bindPwd, setBindPwd] = useState('');
  const [acctMsg, setAcctMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
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
    if (mode === 'signup' && password !== passwordConfirm) {
      setMsg({ type: 'err', text: '两次输入的密码不一致' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const endpoint = mode === 'login' ? '/api/login' : '/api/signup';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login'
          ? { username, password, turnstileToken }
          : { username, password, email, turnstileToken }),
      });
      const data = (await res.json()) as { error?: string; freeCreditGranted?: boolean };
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? '操作失败' });
        return;
      }
      setPassword('');
      setPasswordConfirm('');
      if (mode === 'login') {
        setMsg({ type: 'ok', text: '登录成功' });
      } else if (data.freeCreditGranted === false) {
        setMsg({ type: 'ok', text: '注册成功，已自动登录。免费体验次数已被领取过，如需提问请使用兑换码。' });
      } else {
        setMsg({ type: 'ok', text: '注册成功，已自动登录（赠送 1 次免费问答）' });
      }
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
      const data = (await res.json()) as {
        error?: string; kind?: 'time' | 'credits';
        expiresAt?: string; durationDays?: number;
        creditAmount?: number; credits?: number; creditsExpiresAt?: string;
      };
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? '兑换失败' });
        return;
      }
      setCode('');
      if (data.kind === 'credits') {
        const until = data.creditsExpiresAt ? new Date(data.creditsExpiresAt).toLocaleDateString('zh-CN') : '';
        setMsg({ type: 'ok', text: `兑换成功，已充值 ${data.creditAmount} 次，当前共 ${data.credits} 次（有效期至 ${until}）` });
      } else {
        const until = data.expiresAt ? new Date(data.expiresAt).toLocaleString('zh-CN') : '';
        setMsg({ type: 'ok', text: `兑换成功，已开通 ${data.durationDays} 天不限问，有效期至 ${until}` });
      }
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

  const handleChangePassword = async () => {
    if (newPwd !== newPwdConfirm) {
      setAcctMsg({ type: 'err', text: '两次输入的新密码不一致' });
      return;
    }
    setAcctMsg(null);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: curPwd, newPassword: newPwd }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setAcctMsg({ type: 'err', text: data.error ?? '修改失败' });
        return;
      }
      setAcctMsg({ type: 'ok', text: data.message ?? '密码已修改' });
      setCurPwd(''); setNewPwd(''); setNewPwdConfirm('');
    } catch {
      setAcctMsg({ type: 'err', text: '网络错误，请稍后重试' });
    }
  };

  const handleBindEmail = async () => {
    setAcctMsg(null);
    try {
      const res = await fetch('/api/account/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: bindEmail, password: bindPwd }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setAcctMsg({ type: 'err', text: data.error ?? '绑定失败' });
        return;
      }
      setAcctMsg({ type: 'ok', text: data.message ?? '邮箱已绑定' });
      setBindEmail(''); setBindPwd('');
      await loadMe();
    } catch {
      setAcctMsg({ type: 'err', text: '网络错误，请稍后重试' });
    }
  };

  const cardStyle: React.CSSProperties = {
    background: 'var(--bg-card, #fff)',
    border: '1px solid rgba(0,0,0,0.08)',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1px solid rgba(0,0,0,0.15)', background: 'transparent',
    color: 'inherit', fontSize: 14, boxSizing: 'border-box',
  };
  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '11px 16px', borderRadius: 8, border: 'none',
    background: '#8a6a1f', color: '#fff', fontSize: 14,
    cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.6 : 1,
  };

  const u = me?.user;

  return (
    <main style={{ maxWidth: 460, margin: '48px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 24, marginBottom: 6 }}>账号与兑换</h1>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 24, lineHeight: 1.7 }}>
        注册即送 1 次免费问答。登录后输入兑换码即可充值次数或开通不限问。权益绑定账号，换设备重新登录即可恢复。
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
                key={m} type="button"
                onClick={() => { setMode(m); setMsg(null); setPasswordConfirm(''); }}
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
            <input style={inputStyle} placeholder="用户名" value={username}
              onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
            {mode === 'signup' && (
              <input style={inputStyle} type="email" placeholder="邮箱（用于找回密码）" value={email}
                onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
            )}
            <input style={inputStyle} type="password" placeholder="密码（至少 8 位）" value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleAuth(); }} />
            {mode === 'signup' && (
              <input style={inputStyle} type="password" placeholder="再次输入密码确认" value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
                onKeyDown={(e) => { if (e.key === 'Enter') void handleAuth(); }} />
            )}
            <Turnstile onVerify={setTurnstileToken} />
            <button type="button" style={btnStyle} disabled={busy} onClick={() => void handleAuth()}>
              {mode === 'login' ? '登录' : '注册并登录'}
            </button>
            {mode === 'login' && (
              <div style={{ fontSize: 12, color: '#888', textAlign: 'right' }}>
                <a href="/forgot" style={{ color: '#8a6a1f' }}>忘记密码？</a>
              </div>
            )}
          </div>
        </div>
      )}

      {me && me.authenticated && u && (
        <>
          <div style={{ ...cardStyle, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <div style={{ fontSize: 13, lineHeight: 2 }}>
              <div>当前账号：<strong>{u.username}</strong></div>
              <div>
                剩余额度：<strong style={{ color: '#8a6a1f' }}>{u.credits} 次</strong>
                {u.credits > 0 && u.creditsExpiresAt && (
                  <span style={{ color: '#888', fontSize: 12 }}>（有效期至 {new Date(u.creditsExpiresAt).toLocaleDateString('zh-CN')}）</span>
                )}
                {u.credits > 0 && !u.creditsExpiresAt && (
                  <span style={{ color: '#888', fontSize: 12 }}>（永久有效）</span>
                )}
              </div>
              {u.hasTimePass && u.expiresAt && (
                <div style={{ color: '#1a7a45' }}>
                  不限问生效中 · 至 {new Date(u.expiresAt).toLocaleString('zh-CN')}
                </div>
              )}
              <div style={{ color: '#888', fontSize: 12 }}>每日最多问答 100 次（防滥用）</div>
            </div>
            <button type="button" onClick={() => void handleLogout()} disabled={busy}
              style={{ marginTop: 12, fontSize: 12, background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', padding: 0 }}>
              退出登录
            </button>
          </div>

          <div style={{ ...cardStyle, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>账号安全</h2>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>
              绑定邮箱：
              {u.email
                ? <span style={{ color: 'var(--tx-1, inherit)' }}>{u.email}</span>
                : <span style={{ color: '#b45309' }}>未绑定（忘记密码将无法自助找回）</span>}
            </div>
            <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
              <input style={inputStyle} type="email" placeholder={u.email ? '更换邮箱' : '绑定邮箱（用于找回密码）'}
                value={bindEmail} onChange={(e) => setBindEmail(e.target.value)} autoComplete="email" />
              <input style={inputStyle} type="password" placeholder="输入密码确认" value={bindPwd}
                onChange={(e) => setBindPwd(e.target.value)} autoComplete="current-password" />
              <button type="button" style={{ ...btnStyle, background: '#6b7280' }} disabled={busy || !bindEmail || !bindPwd}
                onClick={() => void handleBindEmail()}>
                {u.email ? '更换邮箱' : '绑定邮箱'}
              </button>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <input style={inputStyle} type="password" placeholder="当前密码" value={curPwd}
                onChange={(e) => setCurPwd(e.target.value)} autoComplete="current-password" />
              <input style={inputStyle} type="password" placeholder="新密码（至少 8 位）" value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)} autoComplete="new-password" />
              <input style={inputStyle} type="password" placeholder="再次输入新密码" value={newPwdConfirm}
                onChange={(e) => setNewPwdConfirm(e.target.value)} autoComplete="new-password" />
              <button type="button" style={{ ...btnStyle, background: '#6b7280' }} disabled={busy || !curPwd || !newPwd || !newPwdConfirm}
                onClick={() => void handleChangePassword()}>
                修改密码
              </button>
            </div>
            {acctMsg && (
              <div style={{
                marginTop: 12, padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.7,
                background: acctMsg.type === 'ok' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
                color: acctMsg.type === 'ok' ? '#166534' : '#b91c1c',
              }}>
                {acctMsg.text}
              </div>
            )}
          </div>

          <div style={{ ...cardStyle, borderRadius: 12, padding: 20, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>输入兑换码</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              <input style={inputStyle} placeholder="如 CRED10-AB3D-7K9Q" value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleRedeem(); }} />
              <button type="button" style={btnStyle} disabled={busy} onClick={() => void handleRedeem()}>兑换</button>
            </div>
          </div>

          <div style={{ ...cardStyle, borderRadius: 12, padding: 20 }}>
            <h2 style={{ fontSize: 15, marginBottom: 12 }}>套餐档位</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {PACKAGES.map((p) => (
                <div key={p.id} style={{ border: '1px solid rgba(0,0,0,0.1)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                  <div style={{ fontSize: 16, color: '#8a6a1f', margin: '4px 0' }}>¥{p.price}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>{p.desc}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: '#888', marginTop: 12, lineHeight: 1.6 }}>
              次数包 180 天内有效，多次购买自动叠加顺延；7 天不限问期间不消耗次数。
            </p>
            <p style={{ fontSize: 12, marginTop: 10 }}>
              没有兑换码？<a href="/pay" style={{ color: '#8a6a1f', textDecoration: 'underline' }}>直接购买（扫码付款，站长开通）</a>
            </p>
          </div>
        </>
      )}
    </main>
  );
}
