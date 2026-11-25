'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

/** 找回密码第二步：通过邮件里的链接进入，设置新密码。 */

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 8, fontSize: 14,
    border: '1px solid rgba(0,0,0,0.12)', background: 'transparent', color: 'inherit',
    boxSizing: 'border-box',
  };
  const btnStyle: React.CSSProperties = {
    width: '100%', padding: '10px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: '#8a6a1f', color: '#fff', fontSize: 14,
  };

  const handleSubmit = async () => {
    if (password !== confirm) {
      setMsg({ type: 'err', text: '两次输入的密码不一致' });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? '重置失败，请重试' });
        return;
      }
      setMsg({ type: 'ok', text: data.message ?? '密码已重置' });
    } catch {
      setMsg({ type: 'err', text: '网络错误，请稍后重试' });
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div style={{ fontSize: 13, color: '#b91c1c', lineHeight: 1.7 }}>
        链接缺少重置令牌，请从邮件中的完整链接进入。
        <div style={{ marginTop: 12 }}><Link href="/forgot" style={{ color: '#8a6a1f' }}>重新发起找回</Link></div>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <input style={inputStyle} type="password" placeholder="新密码（至少 8 位）" value={password}
        onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
      <input style={inputStyle} type="password" placeholder="再次输入新密码确认" value={confirm}
        onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password"
        onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit(); }} />
      <button type="button" style={btnStyle} disabled={busy || !password || !confirm}
        onClick={() => void handleSubmit()}>
        {busy ? '提交中…' : '重置密码'}
      </button>
      {msg && (
        <div style={{
          padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.7,
          background: msg.type === 'ok' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
          color: msg.type === 'ok' ? '#166534' : '#b91c1c',
        }}>
          {msg.text}
          {msg.type === 'ok' && (
            <div style={{ marginTop: 8 }}>
              <Link href="/redeem" style={{ color: '#8a6a1f' }}>去登录</Link>
            </div>
          )}
        </div>
      )}
      {msg?.type === 'err' && (
        <div style={{ fontSize: 12, color: '#888' }}>
          <Link href="/forgot" style={{ color: '#8a6a1f' }}>重新发起找回</Link>
        </div>
      )}
    </div>
  );
}

export default function ResetPage() {
  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 24 }}>
        <h1 style={{ fontSize: 18, margin: '0 0 18px' }}>设置新密码</h1>
        <Suspense fallback={<div style={{ fontSize: 13, color: '#888' }}>加载中…</div>}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
