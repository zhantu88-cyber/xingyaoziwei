'use client';
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
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
  const [selectedPkg, setSelectedPkg] = useState('c10'); // 支付区默认选中的套餐

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

        {/* 双支付入口：选套餐 → 微信扫码 / 支付宝跳转 */}
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div className="card" style={{ padding: '24px 26px' }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--tx-0)', marginBottom: 4 }}>选择支付方式</div>
            <p style={{ fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.7, margin: '0 0 16px' }}>
              先选套餐，再按你方便的支付方式付款 · 付款后自动发兑换码
            </p>

            {/* 套餐切换 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
              {PACKAGES.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPkg(p.id)}
                  style={{
                    padding: '7px 13px', borderRadius: 999, fontSize: 12, cursor: 'pointer',
                    border: selectedPkg === p.id ? '1px solid var(--ac)' : '1px solid var(--bdr)',
                    background: selectedPkg === p.id ? 'var(--ac-bg)' : 'transparent',
                    color: selectedPkg === p.id ? 'var(--ac)' : 'var(--tx-2)',
                  }}
                >
                  {p.name} ¥{p.price}
                </button>
              ))}
            </div>

            {/* 两个支付入口并排 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
              {/* 微信扫码 */}
              <div style={{
                border: '1px solid var(--bdr)', borderRadius: 12, padding: '18px 16px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-0)' }}>微信支付 · 扫码</div>
                <div style={{ background: '#fff', padding: 10, borderRadius: 10, display: 'inline-block' }}>
                  <QRCodeSVG value={packageUrl(selectedPkg)} size={148} bgColor="#ffffff" fgColor="#1a1a1a" />
                </div>
                <div style={{ fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.7 }}>
                  用<strong style={{ color: 'var(--ac)' }}>微信扫一扫</strong><br />在微信内打开并付款
                </div>
              </div>

              {/* 支付宝 / 银行卡 */}
              <div style={{
                border: '1px solid var(--bdr)', borderRadius: 12, padding: '18px 16px',
                display: 'flex', flexDirection: 'column', gap: 12,
              }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--tx-0)', textAlign: 'center' }}>支付宝 / 银行卡</div>
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'var(--tx-2)', lineHeight: 1.8 }}>
                    在<strong style={{ color: 'var(--ac)' }}>手机浏览器</strong>打开微店<br />即可用支付宝或银行卡付款
                  </div>
                </div>
                <a
                  href={packageUrl(selectedPkg)}
                  style={{
                    display: 'block', textAlign: 'center', padding: '12px', borderRadius: 10,
                    background: 'var(--ac-bg)', border: '1px solid var(--ac-bdr)',
                    color: 'var(--ac)', fontSize: 14, textDecoration: 'none', fontWeight: 500,
                  }}
                >
                  支付宝 / 银行卡付款 →
                </a>
              </div>
            </div>

            {/* 购买流程 */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--bdr)' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--tx-0)', marginBottom: 8 }}>付款后怎么拿到次数</div>
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 12, lineHeight: 2, color: 'var(--tx-2)' }}>
                <li>付款后，兑换码<strong style={{ color: 'var(--ac)' }}>自动发到微店订单</strong>里，无需等待</li>
                <li>复制兑换码，回本站<a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>「账号与兑换」</a>输入，即刻到账</li>
              </ol>
            </div>

            <div style={{ marginTop: 14, fontSize: 12, color: 'var(--tx-3)', lineHeight: 1.7 }}>
              已有兑换码？<a href="/redeem" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>直接去兑换</a>
              {' · '}<a href={SHOP_URL} style={{ color: 'var(--ac)', textDecoration: 'underline' }}>微店店铺首页</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
