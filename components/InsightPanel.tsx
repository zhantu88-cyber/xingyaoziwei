'use client';

import { Children, cloneElement, isValidElement, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ZiweiChart } from '@/lib/ziwei/types';

// 右侧「命理档案」分栏：与原始 UI 一致，默认从「总论」开始。
// 每个 Tab 对应 /api/reading 返回的一个维度字段。
const DIMENSIONS = [
  { key: 'overview', label: '总论' },
  { key: 'personality', label: '性格' },
  { key: 'love', label: '感情' },
  { key: 'career', label: '事业' },
  { key: 'wealth', label: '财富' },
  { key: 'health', label: '健康' },
  { key: 'family', label: '家庭/兄弟' },
  { key: 'children', label: '子女' },
  { key: 'move', label: '迁移' },
  { key: 'friends', label: '交友' },
  { key: 'home', label: '田宅' },
  { key: 'spirit', label: '福德' },
  { key: 'parents', label: '父母' },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]['key'];
type Reading = Record<string, string>;

// 宫位名 → 维度：点左边命盘的格子时，右侧自动跳到对应 Tab。
// 命宫主「性格」，所以命宫映射到 personality；「总论」是进入时的默认首页，不绑定格子。
export const PALACE_TO_DIMENSION: Record<string, DimensionKey> = {
  '命': 'personality', '命宫': 'personality',
  '兄弟': 'family', '兄弟宫': 'family',
  '夫妻': 'love', '夫妻宫': 'love',
  '子女': 'children', '子女宫': 'children',
  '财帛': 'wealth', '财帛宫': 'wealth',
  '疾厄': 'health', '疾厄宫': 'health',
  '迁移': 'move', '迁移宫': 'move',
  '交友': 'friends', '交友宫': 'friends', '仆役': 'friends', '仆役宫': 'friends',
  '官禄': 'career', '官禄宫': 'career', '事业': 'career', '事业宫': 'career',
  '田宅': 'home', '田宅宫': 'home',
  '福德': 'spirit', '福德宫': 'spirit',
  '父母': 'parents', '父母宫': 'parents',
};

function palaceToDimension(name: unknown): DimensionKey | null {
  if (typeof name !== 'string') return null;
  const value = name.trim();
  if (!value) return null;
  return PALACE_TO_DIMENSION[value] ?? null;
}

export interface InsightPanelProps {
  /** 选中的宫位（来自 ChartBoard 的 onPalaceSelect），用于自动切换 Tab */
  selectedPalace?: { name?: string } | null;
  /** 命理正文的 key（来自 page.tsx） */
  readingKey?: string;
  /** 兼容旧调用：也可直接传 k */
  k?: string;
  /** 实时排盘数据：用于校验静态文本中"坐命"表述是否与命盘一致 */
  chart?: ZiweiChart;
  className?: string;
  style?: CSSProperties;
}

/**
 * 静态解读库对「命宫空宫」的盘，常用「天同天梁坐命」这类简化说法（实际是借对宫星论命），
 * 普通人看到自己命宫是空的、文字却说 XX 坐命，容易误解为解读错误。
 * 这里在渲染前把「一句话定调」里的坐命表述改成准确的「命宫无主星，借对宫 XX 论命」。
 * 只改这一处定调句；正文里本就写对的「命宫空宫、借对宫」段落保持不动。
 */
/**
 * 术语/古籍友好化（只改显示文案，不动内容库）：
 *  1) 每个 Tab 首次出现「庙旺/入庙/落陷/陷地」时补一句白话注解，避免黑话劝退；
 *  2) 古籍引用里出现「下贱/孤寡/夭折」等极端词时，在该行末尾加温和提示，
 *     明确这是古籍文学化表述、非现实预言，避免吓到用户。
 */
const TERM_NOTES: Record<string, string> = {
  庙旺: '庙旺＝星曜力量强、发挥正面特质',
  入庙: '入庙＝星曜处在最有利的位置，力量强',
  落陷: '落陷＝星曜力量弱、正面特质打折',
  陷地: '陷地＝星曜处在不利位置，力量弱',
};
const HARSH_WORDS = ['下贱', '孤寡', '夭折', '横死', '必死'];
const HARSH_NOTE = '（上述为古籍文学化表述，非现实预言，供参考不必对号入座）';

function annotateText(text: string): string {
  if (!text) return text;
  let out = text;

  // 1) 术语首次出现加注（每个 Tab 一段文本，只标第一次）
  //    原文若已在术语后自带括注（如「入庙（力量强）」），跳过避免重复。
  const seen = new Set<string>();
  out = out.replace(/(庙旺|入庙|落陷|陷地)(\s*[（(])?/g, (full, term: string, bracket: string | undefined) => {
    if (seen.has(term)) return full;
    // 已自带括注 → 只记录、不重复加
    if (bracket) { seen.add(term); return full; }
    seen.add(term);
    return `${term}（${TERM_NOTES[term]}）`;
  });

  // 2) 含极端词的行，若该行还没类似提示，就在行末加温和说明
  out = out.split('\n').map(line => {
    if (!HARSH_WORDS.some(w => line.includes(w))) return line;
    if (/文学化表述|非现实预言|不必对号入座/.test(line)) return line;
    return line + HARSH_NOTE;
  }).join('\n');

  return out;
}

function fixEmptyMingWording(text: string, chart: ZiweiChart | undefined): string {
  if (!chart) return text;
  const ming = chart.palaces.find(p => p.name === '命宫');
  const mingMajor = (ming?.stars || []).filter(s => s.type === 'major');
  if (mingMajor.length > 0) return text; // 命宫有主星，无需修正

  // 命宫空宫：取对宫（迁移）主星，作为借星依据
  const dui = chart.palaces.find(p => p.name === '迁移');
  const duiStars = (dui?.stars || []).filter(s => s.type === 'major').map(s => s.name);
  if (duiStars.length === 0) return text;

  // 匹配【一句话定调】段（到下一个空行或下一个【】标题为止）
  return text.replace(
    /(\*\*【一句话定调】\*\*\s*\n\s*)([\s\S]*?)(?=\n\s*\n|\n\s*\*\*【|$)/,
    (full, head: string, body: string) => {
      // 只在这句确实声称"XX坐命"时才改，避免动已经正确的表述
      if (!/坐命|坐守命宫|坐命宫/.test(body)) return full;
      // 去掉原句里的"XX坐命"前缀部分，保留后半句的具体建议（善良厚道有贵人…）
      const advice = body
        .replace(/^[\s\S]*?(?:坐命宫|坐守命宫|坐命)[，,、]?\s*/, '')
        .trim();
      const joined = advice ? `：${advice}` : '';
      return `${head}命宫无主星，借对宫${duiStars.join('、')}论命${joined}`;
    },
  );
}

const ACCENT = '#b8860b';

// Markdown 排版，避免长文本挤成一坨。
const mdComponents = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 10px', color: ACCENT }}>{children}</h3>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h3 style={{ fontSize: 15, fontWeight: 700, margin: '16px 0 8px', color: ACCENT }}>{children}</h3>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h4 style={{ fontSize: 14, fontWeight: 700, margin: '14px 0 6px' }}>{children}</h4>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p style={{ margin: '0 0 12px' }}>{children}</p>
  ),
  strong: ({ children }: { children?: ReactNode }) => (
    <strong style={{ color: ACCENT, fontWeight: 700 }}>{children}</strong>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol style={{ margin: '0 0 12px', paddingLeft: 20 }}>{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => (
    <li style={{ marginBottom: 4 }}>{children}</li>
  ),
};

export default function InsightPanel({
  selectedPalace,
  readingKey,
  k,
  chart,
  className = '',
  style,
}: InsightPanelProps) {
  const fetchKey = readingKey || k || '';
  const [reading, setReading] = useState<Reading | null>(null);
  const [active, setActive] = useState<DimensionKey>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);

  // 点左边宫位 → 自动跳到对应 Tab
  useEffect(() => {
    const target = palaceToDimension(selectedPalace?.name);
    if (target) setActive(target);
  }, [selectedPalace?.name]);

  // 切换 Tab / 正文变化后：正文滚动条回到顶部 + Tab 栏自动横向滚到选中项。
  // 这样点左侧格子或右侧标签时，视图会「自动跳转」到新内容开头，不用手动拖滚动条。
  useEffect(() => {
    if (contentRef.current) contentRef.current.scrollTop = 0;

    const container = tabListRef.current;
    const el = container?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (container && el) {
      const left = el.offsetLeft - container.offsetLeft;
      const right = left + el.offsetWidth;
      if (left < container.scrollLeft) {
        container.scrollLeft = left;
      } else if (right > container.scrollLeft + container.clientWidth) {
        container.scrollLeft = right - container.clientWidth;
      }
    }
  }, [active, reading]);

  const load = useCallback(async (key: string, signal: AbortSignal) => {
    setLoading(true);
    setError(null);
    setReading(null);

    try {
      const res = await fetch(`/api/reading?k=${encodeURIComponent(key)}`, { signal });
      if (!res.ok) {
        let detail = '';
        try {
          detail = await res.text();
        } catch (textError) {
          console.error('[InsightPanel] 读取错误响应体失败:', textError);
        }
        const message = `HTTP ${res.status} ${res.statusText}${detail ? ` · ${detail.slice(0, 300)}` : ''}`;
        console.error('[InsightPanel] /api/reading 返回错误:', message);
        setError(message);
        return;
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch (jsonError) {
        console.error('[InsightPanel] JSON 解析失败:', jsonError);
        setError(`JSON 解析失败：${jsonError instanceof Error ? jsonError.message : String(jsonError)}`);
        return;
      }

      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        console.error('[InsightPanel] API 返回值不是正文对象:', json);
        setError('API 返回值不是正文对象');
        return;
      }
      setReading(json as Reading);
    } catch (fetchError) {
      if (signal.aborted) return;
      console.error('[InsightPanel] fetch /api/reading 失败:', fetchError);
      setError(`请求失败：${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!fetchKey) {
      console.error('[InsightPanel] 缺少 readingKey/k 参数，无法加载命盘解读');
      setError('缺少命盘 key（readingKey）');
      setReading(null);
      return;
    }
    const controller = new AbortController();
    void load(fetchKey, controller.signal);
    return () => controller.abort();
  }, [fetchKey, load]);

  const panelStyle: CSSProperties = {
    background: '#fff',
    border: '1px solid #eee',
    borderRadius: 12,
    padding: '16px 16px 8px',
    display: 'flex',
    flexDirection: 'column',
    // 面板自身限高，内容区内部滚动，避免把整页撑得老长。
    maxHeight: 'calc(100vh - 120px)',
    overflow: 'hidden',
    ...style,
  };

  if (loading) {
    return <aside className={className} style={panelStyle}>解读加载中…</aside>;
  }
  if (error) {
    return (
      <aside className={className} style={panelStyle} role="alert">
        <div style={{ fontWeight: 700, color: ACCENT, marginBottom: 12 }}>命理档案</div>
        <div style={{ color: '#b91c1c', whiteSpace: 'pre-wrap', fontSize: 13 }}>解读加载失败：{error}</div>
      </aside>
    );
  }

  const current = DIMENSIONS.find((d) => d.key === active) ?? DIMENSIONS[0];
  const rawText = reading?.[current.key];
  const text = typeof rawText === 'string'
    ? annotateText(fixEmptyMingWording(rawText, chart))
    : rawText;
  const hasText = typeof text === 'string' && text.trim().length > 0;

  return (
    <aside className={className} style={panelStyle}>
      <div style={{ fontSize: 15, fontWeight: 700, color: ACCENT, marginBottom: 12, letterSpacing: 1 }}>
        命理档案
      </div>

      <div
        ref={tabListRef}
        role="tablist"
        style={{
          display: 'flex',
          gap: 14,
          borderBottom: '1px solid #f0f0f0',
          overflowX: 'auto',
          marginBottom: 14,
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {DIMENSIONS.map((d) => {
          const selected = d.key === active;
          return (
            <button
              key={d.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(d.key)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '8px 2px',
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                color: selected ? ACCENT : '#888',
                fontWeight: selected ? 700 : 400,
                borderBottom: `2px solid ${selected ? ACCENT : 'transparent'}`,
              }}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      {/* 正文区独立滚动：minHeight:0 是 flex 子项出现滚动条的关键 */}
      <div
        ref={contentRef}
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          WebkitOverflowScrolling: 'touch',
          fontSize: 13.5,
          lineHeight: 1.8,
          color: '#333',
        }}
      >
        {hasText ? (
          <ReactMarkdown components={mdComponents}>{text as string}</ReactMarkdown>
        ) : (
          <div style={{ color: '#999', textAlign: 'center', padding: '40px 0' }}>暂无任何内容。</div>
        )}
      </div>
    </aside>
  );
}
