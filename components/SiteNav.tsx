'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; active: (path: string) => boolean };

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: '首页', active: (p) => p === '/' },
  { href: '/chart', label: '起盘', active: (p) => p.startsWith('/chart') },
  { href: '/heming', label: '合盘', active: (p) => p.startsWith('/heming') },
  { href: '/redeem', label: '账号与兑换', active: (p) => p.startsWith('/redeem') },
];

/** 站点级顶部导航：统一入口，当前页高亮。挂在 layout 里，全站可见。 */
export default function SiteNav() {
  const pathname = usePathname();

  return (
    <nav
      style={{
        borderBottom: '1px solid rgba(184,146,42,0.15)',
        background: 'var(--bg-page)',
      }}
    >
      <div
        style={{
          maxWidth: 960,
          margin: '0 auto',
          padding: '0 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          minHeight: 46,
        }}
      >
        <Link
          href="/"
          style={{
            fontSize: 13,
            letterSpacing: '0.25em',
            color: 'var(--ac)',
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          星耀紫微
        </Link>
        <div
          style={{
            display: 'flex',
            gap: 18,
            overflowX: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = item.active(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  fontSize: 12,
                  letterSpacing: '0.12em',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  padding: '14px 2px',
                  color: active ? 'var(--ac)' : 'var(--tx-3)',
                  borderBottom: active ? '2px solid var(--ac)' : '2px solid transparent',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
