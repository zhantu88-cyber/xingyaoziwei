'use client';

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import ReactMarkdown from 'react-markdown';

const DIMENSIONS = [
  { key: 'overview', label: '命宫总论' },
  { key: 'personality', label: '性格' },
  { key: 'love', label: '感情' },
  { key: 'career', label: '事业' },
  { key: 'wealth', label: '财运' },
  { key: 'health', label: '健康' },
  { key: 'family', label: '家庭' },
  { key: 'children', label: '子女' },
  { key: 'move', label: '迁移' },
  { key: 'friends', label: '交友' },
  { key: 'home', label: '田宅' },
  { key: 'spirit', label: '精神' },
  { key: 'parents', label: '父母' },
] as const;

// /api/reading 直接返回扁平正文对象：{ overview, personality, love, ... }
// 没有 data.c 这一层，所以取值必须是 data.personality，不能是 data.c.personality。
type Reading = Record<string, string>;

export interface InsightPanelProps {
  k?: string;
  className?: string;
  style?: CSSProperties;
}

export default function InsightPanel({ k, className = '', style }: InsightPanelProps) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      // 直接读取扁平字段（data.personality / data.love / ...）。
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
    if (!k) {
      console.error('[InsightPanel] 缺少 k 参数，无法加载命盘解读');
      setError('缺少命盘 key（k）');
      setReading(null);
      return;
    }
    const controller = new AbortController();
    void load(k, controller.signal);
    return () => controller.abort();
  }, [k, load]);

  if (loading) {
    return <aside className={className} style={style}>解读加载中…</aside>;
  }

  if (error) {
    return (
      <aside className={className} style={{ ...style, color: '#b91c1c', whiteSpace: 'pre-wrap' }} role="alert">
        解读加载失败：{error}
      </aside>
    );
  }

  const sections = DIMENSIONS
    .map(({ key, label }) => {
      // 扁平结构直接取 reading[key]，没有 reading.c 这一层。
      const text = reading?.[key];
      return typeof text === 'string' && text.trim().length > 0
        ? { key: String(key), label: String(label), text }
        : null;
    })
    .filter((item): item is { key: string; label: string; text: string } => item !== null);

  if (!sections.length) {
    // 仅在数据已拿到、但确实没有正文时才告警；首帧 reading 仍为 null 不误报。
    // 错误路径已经单独输出 console.error + 错误面板。
    if (reading) console.warn('[InsightPanel] API 返回成功，但 13 个维度都没有正文:', reading);
    return <aside className={className} style={style}>暂无任何内容</aside>;
  }

  return (
    <aside className={className} style={style}>
      {sections.map(({ key, label, text }) => (
        <section key={key} style={{ marginBottom: 24 }}>
          <h3>{label}</h3>
          {/* 正文是 Markdown 长文本，交给 react-markdown 渲染 ### / ** / - 等排版。 */}
          <ReactMarkdown>{text}</ReactMarkdown>
        </section>
      ))}
    </aside>
  );
}
