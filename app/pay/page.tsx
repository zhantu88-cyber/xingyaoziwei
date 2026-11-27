'use client';
import { useEffect, useState } from 'react';
import { PACKAGES, perChatPrice } from '@/lib/packages';

/**
 * 购买页：展示套餐，点击套餐卡片直达微店对应商品（微信/支付宝，付款自动发兑换码）。
 * 用户拿到兑换码后回本站「账号与兑换」输入，权益即刻到账。
 *
 * ★ 微店商品链接统一维护在这里（id → 商品链接）：
 *   拿到四个单品链接后，只改 PACKAGE_URLS 四个值即可，无需动页面代码。
 *   未填单品链接时回退到店铺首页 SHOP_URL。
 */
const SHOP_URL = 'https://k.youshop10.com/4LQnm89P';
const PACKAGE_URLS: Record<string, string> = {
  c3: 'https://weidian.com/item.html?itemID=7915377738',
  c10: 'https://weidian.com/item.html?itemID=7915437780',
  c30: 'https://weidian.com/item.html?itemID=7915400106',
  t7: 'https://weidian.com/item.html?itemID=7912398089',
};
const packageUrl = (id: string) => PACKAGE_URLS[id] || SHOP_URL;

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

        {/* 套餐：每张卡片即购买入口，点击直达微店对应商品 */}
        <div style={{ fontSize: 13, color: 'var(--tx-2)', textAlign: 'center', marginBottom: 14, lineHeight: 1.7 }}>
          点击想买的套餐卡片，将<strong style={{ color: 'var(--ac)' }}>前往微店付款</strong>（付款后自动发兑换码）
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 14 }}>
          {PACKAGES.map(p => {
            const per = perChatPrice(p);
            return (
              <a
                key={p.id}
                href={packageUrl(p.id)}
                className="card"
                style={{
                  padding: '20px 18px',
                  position: 'relative',
                  display: 'block',
                  textDecoration: 'none',
                  border: '1px solid var(--bdr)',
                  cursor: 'pointer',
                  transition: 'border-color .18s, transform .18s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ac)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bdr)'; e.currentTarget.style.transform = 'none'; }}
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
                <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ac)', fontWeight: 500 }}>
                  前往微店购买 →
                </div>
              </a>
            );
          })}
        </div>

        {/* 购买流程说明（不重复放购买按钮，避免用户困惑点哪个） */}
        <div style={{ maxWidth: 620, margin: '0 auto' }}>
          <div className="card" style={{ padding: '22px 26px' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-0)', marginBottom: 12 }}>购买流程</div>
            <ol style={{ margin: 0, paddingLeft: 22, fontSize: 13, lineHeight: 2.1, color: 'var(--tx-2)' }}>
              <li>点击上方想买的套餐卡片，进入微店（支持微信 / 支付宝）</li>
              <li>付款后，兑换码会<strong style={{ color: 'var(--ac)' }}>自动发到微店订单</strong>里，无需等待站长</li>
              <li>复制兑换码，回本站<a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>「账号与兑换」</a>输入，即刻到账</li>
            </ol>
            <div style={{ marginTop: 12, fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.7 }}>
              已有兑换码？<a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>直接去兑换</a>
              {' · '}微店付款遇到问题（如反复跳转），可<a href={SHOP_URL} style={{ color: 'var(--ac)', textDecoration: 'underline' }}>打开微店店铺首页</a>重试
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
