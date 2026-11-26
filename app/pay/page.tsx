'use client';
import { useEffect, useState } from 'react';
import { PACKAGES, perChatPrice } from '@/lib/packages';

/**
 * 购买页：展示套餐，引导到微店购买（支持微信/支付宝，付款自动发兑换码）。
 * 用户拿到兑换码后回本站「账号与兑换」输入，权益即刻到账。
 * 微店店铺链接：https://k.youshop10.com/4LQnm89P（如需更换改下方 href 即可）
 */
export default function PayPage() {
  const [username, setUsername] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [hasTimePass, setHasTimePass] = useState(false);

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
                购买后兑换码计入当前登录账号
              </span>
            </>
          ) : (
            <span style={{ fontSize: 13, color: 'var(--tx-2)' }}>
              请先 <a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>登录或注册</a>，兑换码将充入登录账号
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

        {/* 购买方式：微店（支持微信/支付宝，自动发兑换码） */}
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <div className="card" style={{ padding: '28px 26px', display: 'flex', flexDirection: 'column', gap: 16, border: '2px solid var(--ac)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--tx-0)', marginBottom: 6 }}>微店购买 · 自动发货</div>
              <div style={{ fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.7 }}>
                支持 <strong style={{ color: 'var(--ac)' }}>微信支付</strong> 和 <strong style={{ color: 'var(--ac)' }}>支付宝</strong>
                ，付款后<strong style={{ color: 'var(--ac)' }}>秒收兑换码</strong>，无需等待
              </div>
            </div>
            <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, lineHeight: 2.1, color: 'var(--tx-2)' }}>
              <li>点击下方按钮进入微店，选择套餐付款</li>
              <li>付款后自动收到<strong style={{ color: 'var(--ac)' }}>兑换码</strong>（微店订单页查看）</li>
              <li>回本站<a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>「账号与兑换」</a>输入兑换码，次数即刻到账</li>
            </ol>
            <a
              href="https://k.youshop10.com/4LQnm89P"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: 'block', textAlign: 'center', padding: '13px', borderRadius: 10,
                background: 'var(--ac)', color: '#fff', fontSize: 15, fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              进入微店购买
            </a>
            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--tx-3)' }}>
              已有兑换码？<a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>直接去兑换</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
