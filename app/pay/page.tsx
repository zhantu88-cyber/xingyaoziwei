'use client';
import { useEffect, useState } from 'react';
import { PACKAGES, perChatPrice } from '@/lib/packages';

/**
 * 购买页：展示套餐与收款码。
 * 流程：用户扫码付款（备注填网站用户名）→ 站长在 /admin 一键充值 → 用户刷新即可用。
 */
export default function PayPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [hasTimePass, setHasTimePass] = useState(false);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    fetch('/api/me', { cache: 'no-store' })
      .then(r => r.json())
      .then((d: { authenticated?: boolean; user?: { username?: string; credits?: number; hasTimePass?: boolean } | null }) => {
        if (d.authenticated && d.user) {
          setUsername(d.user.username ?? null);
          setCredits(d.user.credits ?? 0);
          setHasTimePass(!!d.user.hasTimePass);
        }
      })
      .catch(() => { /* 忽略 */ });
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-0)' }}>
      <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, letterSpacing: '0.12em', color: 'var(--tx-0)', marginBottom: 10 }}>
            购买问答次数
          </h1>
          <p style={{ fontSize: 13, color: 'var(--tx-3)', lineHeight: 1.7 }}>
            注册即送 1 次免费体验。次数永久计入账户，次数包 180 天有效
          </p>
        </div>

        {/* 当前账号 */}
        <div className="card" style={{ padding: '14px 18px', marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          {username ? (
            <>
              <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>
                当前账号：<strong style={{ color: 'var(--ac)' }}>{username}</strong>
              </span>
              <span style={{ fontSize: 12, color: 'var(--tx-3)' }}>
                {hasTimePass ? '不限问 · 时间包生效中' : `剩余 ${credits ?? 0} 次`}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--tx-3)' }}>
                付款备注请填写此用户名
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>
              请先 <a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>登录或注册</a>，付款时需备注你的用户名
            </span>
          )}
        </div>

        {/* 套餐 */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 32 }}>
          {PACKAGES.map(p => {
            const per = perChatPrice(p);
            return (
              <div
                key={p.id}
                className="card"
                style={{
                  padding: '20px 18px',
                  position: 'relative',
                  border: p.badge ? '2px solid var(--ac)' : '1px solid var(--bdr)',
                }}
              >
                {p.badge && (
                  <span style={{
                    position: 'absolute', top: -10, left: 16,
                    background: 'var(--ac)', color: '#fff', fontSize: 10,
                    padding: '2px 8px', borderRadius: 999, letterSpacing: '0.08em',
                  }}>{p.badge}</span>
                )}
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--tx-0)', marginBottom: 6 }}>{p.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, color: 'var(--ac)' }}>¥</span>
                  <span style={{ fontSize: 26, fontWeight: 600, color: 'var(--ac)', lineHeight: 1 }}>{p.price}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.6, minHeight: 36 }}>{p.desc}</div>
                {per && (
                  <div style={{ fontSize: 11, color: 'var(--tx-3)', marginTop: 6 }}>约 ¥{per} / 次</div>
                )}
              </div>
            );
          })}
        </div>

        {/* 收款码 + 流程 */}
        <div className="card" style={{ padding: '28px 24px', display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) 1fr', gap: 28, alignItems: 'start' }} data-qr-block>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.2em', color: 'var(--tx-3)', marginBottom: 12 }}>扫码付款</div>
            {!qrError ? (
              // 站长把自己的收款码图片放到 public/receipt-qr.png 即自动显示
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/receipt-qr.png"
                alt="收款码"
                onError={() => setQrError(true)}
                style={{ width: '100%', maxWidth: 240, borderRadius: 12, border: '1px solid var(--bdr)' }}
              />
            ) : (
              <div style={{
                width: '100%', maxWidth: 240, height: 240, margin: '0 auto',
                border: '1px dashed var(--bdr-heavy)', borderRadius: 12,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.7, padding: 16,
              }}>
                收款码待上传<br />（站长放入 public/receipt-qr.png）
              </div>
            )}
          </div>

          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx-0)', marginBottom: 12 }}>购买步骤</div>
            <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13, lineHeight: 2, color: 'var(--tx-2)' }}>
              <li>扫码付款，<strong style={{ color: 'var(--ac)' }}>付款备注里填写你的网站用户名</strong>{username ? `（你的用户名：${username}）` : ''}</li>
              <li>付款后告知站长（或稍等片刻），站长会在后台为你开通</li>
              <li>开通后刷新页面，次数即刻到账，可直接在起盘 / 合盘页提问</li>
            </ol>
            <div style={{
              marginTop: 16, padding: '10px 14px', borderRadius: 10,
              background: 'var(--ac-bg)', border: '1px solid var(--ac-bdr)',
              fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.7,
            }}>
              忘记备注用户名？把付款截图和你的用户名发给站长即可，不影响开通。
            </div>
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--tx-3)' }}>
              已有兑换码？<a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>去兑换</a>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          [data-qr-block] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
