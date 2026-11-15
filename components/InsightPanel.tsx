'use client';

import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Palace } from '@/lib/ziwei/types';

interface InsightPanelProps {
  selectedPalace?: Palace | null;
  readingKey: string;
}

const DIMENSIONS = [
  ['overview', '总览', 'text_overview'],
  ['personality', '性格', 'text_personality'],
  ['love', '感情', 'text_love'],
  ['career', '事业', 'text_career'],
  ['wealth', '财富', 'text_wealth'],
  ['health', '健康', 'text_health'],
  ['family', '家庭', 'text_family'],
  ['children', '子女', 'text_children'],
  ['move', '出行/变动', 'text_move'],
  ['friends', '人际', 'text_friends'],
  ['home', '居所', 'text_home'],
  ['spirit', '内在', 'text_spirit'],
  ['parents', '父母', 'text_parents'],
] as const;

type DimensionField = (typeof DIMENSIONS)[number][2];
type Reading = { k: string } & Record<DimensionField, string | null>;

const PALACE_DIMENSION: Record<string, DimensionField> = {
  '命宫': 'text_personality',
  '夫妻宫': 'text_love',
  '官禄宫': 'text_career',
  '财帛宫': 'text_wealth',
  '疾厄宫': 'text_health',
  '田宅宫': 'text_family',
  '子女宫': 'text_children',
  '迁移宫': 'text_move',
  '交友宫': 'text_friends',
  '福德宫': 'text_spirit',
  '父母宫': 'text_parents',
};

export default function InsightPanel({ readingKey, selectedPalace }: InsightPanelProps) {
  const [reading, setReading] = useState<Reading | null>(null);
  const [activeTab, setActiveTab] = useState<DimensionField>('text_overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setActiveTab(selectedPalace ? PALACE_DIMENSION[selectedPalace.name] ?? 'text_overview' : 'text_overview');
  }, [selectedPalace]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadReading() {
      setLoading(true);
      setError(false);
      setReading(null);
      setActiveTab('text_overview');

      try {
        const response = await fetch(`/api/reading?k=${encodeURIComponent(readingKey)}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!response.ok) throw new Error(`Reading request failed (${response.status})`);

        const data = (await response.json()) as Reading;
        setReading(data);
      } catch (cause) {
        if (!controller.signal.aborted) {
          console.error('Unable to load reading:', cause);
          setError(true);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadReading();
    return () => controller.abort();
  }, [readingKey]);

  const activeDimension = DIMENSIONS.find(([, , field]) => field === activeTab);
  const activeText = reading?.[activeTab];

  return (
    <aside className="card-glass min-w-0 rounded-xl px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--ac)' }}>
          命理档案
        </h3>
        {reading && (
          <span className="truncate text-[10px]" style={{ color: 'var(--tx-3)' }}>
            {reading.k}
          </span>
        )}
      </div>

      {reading && (
        <div className="mb-3 flex gap-1 overflow-x-auto border-b pb-2" style={{ borderColor: 'var(--bdr)' }}>
          {DIMENSIONS.map(([key, label, field]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(field)}
              aria-pressed={activeTab === field}
              className="shrink-0 rounded-md px-2.5 py-1.5 text-xs transition-colors"
              style={{
                color: activeTab === field ? 'var(--ac)' : 'var(--tx-3)',
                background: activeTab === field ? 'rgba(180, 120, 20, 0.1)' : 'transparent',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="max-h-[600px] min-h-[220px] overflow-y-auto pr-2">
        {loading ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 text-center">
            <span
              className="h-6 w-6 animate-spin rounded-full border-2 border-current border-r-transparent"
              style={{ color: 'var(--ac)' }}
              aria-hidden="true"
            />
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>
              古籍库查阅中，请稍候...
            </p>
          </div>
        ) : error ? (
          <div className="flex min-h-[220px] items-center justify-center px-3 text-center">
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>
              暂时无法读取命理档案，请稍后重试。
            </p>
          </div>
        ) : activeText ? (
          <article className="reading-markdown text-sm leading-7" style={{ color: 'var(--tx-1)' }}>
            <h2 className="mb-3 text-base font-semibold" style={{ color: 'var(--ac)' }}>
              {activeDimension?.[1]}
            </h2>
            <ReactMarkdown
              components={{
                h1: ({ children }) => <h1 className="mb-3 mt-5 text-lg font-semibold">{children}</h1>,
                h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-semibold">{children}</h2>,
                h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold" style={{ color: 'var(--ac)' }}>{children}</h3>,
                p: ({ children }) => <p className="mb-3 whitespace-pre-wrap">{children}</p>,
                ul: ({ children }) => <ul className="mb-3 list-disc space-y-1 pl-5">{children}</ul>,
                ol: ({ children }) => <ol className="mb-3 list-decimal space-y-1 pl-5">{children}</ol>,
                li: ({ children }) => <li>{children}</li>,
                strong: ({ children }) => <strong className="font-semibold" style={{ color: 'var(--ac)' }}>{children}</strong>,
                blockquote: ({ children }) => <blockquote className="my-3 border-l-2 pl-3 opacity-80" style={{ borderColor: 'var(--ac)' }}>{children}</blockquote>,
                hr: () => <hr className="my-4" style={{ borderColor: 'var(--bdr)' }} />,
              }}
            >
              {activeText}
            </ReactMarkdown>
          </article>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center px-3 text-center">
            <p className="text-xs" style={{ color: 'var(--tx-3)' }}>
              暂无{activeDimension?.[1] ?? '该维度'}内容。
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
