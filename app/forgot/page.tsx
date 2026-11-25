'use client';

import { useState } from 'react';
import Link from 'next/link';
import Turnstile from '@/components/Turnstile';

/** 找回密码：输入用户名 + 注册邮箱，验证通过后发送重置链接。 */

export default function ForgotPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
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
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/password/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, turnstileToken }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) {
        setMsg({ type: 'err', text: data.error ?? '发送失败，请稍后重试' });
        return;
      }
      setMsg({ type: 'ok', text: data.message ?? '重置链接已发送，请查收邮件。' });
    } catch {
      setMsg({ type: 'err', text: '网络错误，请稍后重试' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: '48px auto', padding: '0 16px' }}>
      <div style={{ background: 'var(--bg-card, #fff)', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 24 }}>
        <h1 style={{ fontSize: 18, margin: '0 0 4px' }}>找回密码</h1>
        <p style={{ fontSize: 12, color: '#888', margin: '0 0 18px', lineHeight: 1.7 }}>
          输入用户名和注册邮箱，我们会发送重置链接（30 分钟内有效）。
        </p>
        <div style={{ display: 'grid', gap: 12 }}>
          <input style={inputStyle} placeholder="用户名" value={username}
            onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          <input style={inputStyle} type="email" placeholder="注册邮箱" value={email}
            onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <Turnstile onVerify={setTurnstileToken} />
          <button type="button" style={btnStyle} disabled={busy || !username || !email}
            onClick={() => void handleSubmit()}>
            {busy ? '发送中…' : '发送重置邮件'}
          </button>
          {msg && (
            <div style={{
              padding: '10px 14px', borderRadius: 8, fontSize: 13, lineHeight: 1.7,
              background: msg.type === 'ok' ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)',
              color: msg.type === 'ok' ? '#166534' : '#b91c1c',
            }}>
              {msg.text}
            </div>
          )}
          <div style={{ fontSize: 12, color: '#888', lineHeight: 1.8 }}>
            注册时未填写邮箱？请联系站长人工处理。
            <div style={{ marginTop: 8 }}>
              <Link href="/redeem" style={{ color: '#8a6a1f' }}>返回登录 / 注册</Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
