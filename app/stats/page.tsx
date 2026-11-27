'use client';

import { fetchAuth } from '@/lib/auth-client';

import { useEffect, useState } from 'react';

type Stats = {
  users: {
    total: number; newToday: number; newWeek: number;
    recent: { username: string; created_at: string | null }[];
  };
  ai: {
    totalChats: number; totalTokens: number; chatUsers: number;
    dailyTrend: { day: string; count: number }[];
    topUsers: { username: string; n: number; tokens: number }[];
  };
  redeem: {
    usedTotal: number; unusedTotal: number;
    byPackage: Record<string, number>;
    recent: { username: string; package: string; usedAt: string | null }[];
  };
  generatedAt: string;
};

const card: React.CSSProperties = {
  background: 'var(--bg-card)', border: '1px solid var(--bdr)',
  borderRadius: 12, padding: '20px 22px',
};
const label: React.CSSProperties = { fontSize: 12, color: 'var(--tx-3)', marginBottom: 6 };
const num: React.CSSProperties = { fontSize: 30, fontWeight: 600, color: 'var(--ac)', lineHeight: 1.2 };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: 'var(--tx-0)', margin: '0 0 16px' };
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--tx-3)' };

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function StatsPage() {
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAuth('/api/stats', { cache: 'no-store' })
      .then(async r => {
        const d = await r.json().catch(() => ({})) as Stats & { error?: string };
        if (!r.ok) throw new Error(d.error ?? '加载失败');
        setData(d);
      })
      .catch(e => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ maxWidth: 960, margin: '60px auto', textAlign: 'center', color: 'var(--tx-3)' }}>加载中…</div>;
  if (error) return (
    <div style={{ maxWidth: 560, margin: '60px auto', padding: 24, ...card }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>站点数据</h1>
      <p style={{ color: '#b91c1c', fontSize: 14 }}>{error}</p>
      <p style={{ ...muted, marginTop: 12 }}>本页仅站长可访问，请用你的账号登录后查看。</p>
    </div>
  );
  if (!data) return null;

  const maxTrend = Math.max(1, ...data.ai.dailyTrend.map(d => d.count));

  return (
    <main style={{ maxWidth: 960, margin: '0 auto', padding: '40px 20px 80px' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: 'var(--tx-0)', marginBottom: 6 }}>站点数据</h1>
        <p style={{ ...muted, lineHeight: 1.7 }}>
          更新于 {fmtDate(data.generatedAt)} · 仅站长可见 · 数据来自网站数据库，微店订单请在微店后台查看
        </p>
      </div>

      {/* 核心数字 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 28 }}>
        <div style={card}><div style={label}>注册用户</div><div style={num}>{data.users.total}</div><div style={{ ...muted, marginTop: 6 }}>今日 +{data.users.newToday} · 7日 +{data.users.newWeek}</div></div>
        <div style={card}><div style={label}>AI 问答总次数</div><div style={num}>{data.ai.totalChats}</div><div style={{ ...muted, marginTop: 6 }}>{data.ai.chatUsers} 人用过</div></div>
        <div style={card}><div style={label}>兑换码已使用</div><div style={num}>{data.redeem.usedTotal}</div><div style={{ ...muted, marginTop: 6 }}>库存剩余 {data.redeem.unusedTotal}</div></div>
        <div style={card}><div style={label}>AI 消耗 token</div><div style={num}>{(data.ai.totalTokens / 1000).toFixed(1)}k</div><div style={{ ...muted, marginTop: 6 }}>累计</div></div>
      </div>

      {/* 近 7 日问答趋势 */}
      <div style={{ ...card, marginBottom: 20 }}>
        <h2 style={h2}>近 7 日 AI 问答</h2>
        {data.ai.dailyTrend.length === 0 ? (
          <p style={muted}>暂无数据</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 150 }}>
            {data.ai.dailyTrend.map(d => (
              <div key={d.day} style={{ flex: 1, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 4 }}>
                <div style={{ fontSize: 11, color: 'var(--tx-2)' }}>{d.count || ''}</div>
                <div style={{
                  height: `${Math.max(4, (d.count / maxTrend) * 110)}px`,
                  background: 'var(--ac)', borderRadius: '5px 5px 0 0', opacity: 0.85,
                }} />
                <div style={{ ...muted, fontSize: 10 }}>{d.day.slice(5)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
        {/* 最活跃用户 */}
        <div style={card}>
          <h2 style={h2}>问答最多</h2>
          {data.ai.topUsers.length === 0 ? <p style={muted}>暂无数据</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {data.ai.topUsers.map((u, i) => (
                <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--tx-2)' }}>
                  <span>{i + 1}. {u.username}</span>
                  <span style={{ color: 'var(--ac)' }}>{u.n} 次</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 兑换分布 */}
        <div style={card}>
          <h2 style={h2}>兑换档位分布</h2>
          {Object.keys(data.redeem.byPackage).length === 0 ? <p style={muted}>暂无兑换</p> : (
            <div style={{ display: 'grid', gap: 10 }}>
              {Object.entries(data.redeem.byPackage).map(([name, n]) => (
                <div key={name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--tx-2)' }}>
                  <span>{name}</span><span style={{ color: 'var(--ac)' }}>{n} 个</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 兑换明细 */}
      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={h2}>最近兑换</h2>
        {data.redeem.recent.length === 0 ? <p style={muted}>暂无兑换记录</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.redeem.recent.map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--tx-2)', paddingBottom: 8, borderBottom: '1px solid var(--bdr)' }}>
                <span>{r.username} · {r.package}</span>
                <span style={muted}>{fmtDate(r.usedAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 最近注册 */}
      <div style={{ ...card, marginTop: 20 }}>
        <h2 style={h2}>最近注册</h2>
        {data.users.recent.length === 0 ? <p style={muted}>暂无用户</p> : (
          <div style={{ display: 'grid', gap: 8 }}>
            {data.users.recent.map(u => (
              <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--tx-2)' }}>
                <span>{u.username}</span><span style={muted}>{fmtDate(u.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 访问量说明 */}
      <div style={{ ...card, marginTop: 20, background: 'var(--ac-bg)', borderColor: 'var(--ac-bdr)' }}>
        <h2 style={h2}>访问量怎么看</h2>
        <p style={{ fontSize: 13, color: 'var(--tx-2)', lineHeight: 1.9, margin: 0 }}>
          网站跑在 Cloudflare 上，访问量不用在网站里埋点，直接在 Cloudflare 后台看，免费且保护隐私：
        </p>
        <ol style={{ fontSize: 13, color: 'var(--tx-2)', lineHeight: 2, paddingLeft: 22, margin: '10px 0 0' }}>
          <li>打开 <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer" style={{ color: 'var(--ac)' }}>Cloudflare 后台</a> → 选中域名 <strong>xingyaoziwei.com</strong></li>
          <li>左侧菜单 <strong>分析 / Analytics → Web Analytics</strong>（或 Traffic / 流量）</li>
          <li>点「添加站点」，选你的域名，Cloudflare 会自动开启统计，无需改代码</li>
        </ol>
        <p style={{ ...muted, marginTop: 12, lineHeight: 1.7 }}>
          开启后能看到独立访客、页面浏览量、流量来源。数据有 1-2 小时延迟，第二天看最准。
        </p>
      </div>

      <p style={{ ...muted, textAlign: 'center', marginTop: 28 }}>
        <a href="/" style={{ color: 'var(--ac)', textDecoration: 'underline' }}>返回首页</a>
      </p>
    </main>
  );
}
