'use client';

import type { ZiweiChart, Palace } from '@/lib/ziwei/types';

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: 'mingpan' | 'daxian' | 'liunian';
}

interface InsightPanelProps {
  chart: ZiweiChart;
  selectedPalace?: Palace | null;
  selectedSiHua?: SelectedSiHua | null;
}

export default function InsightPanel(_props: InsightPanelProps) {
  return (
    <aside className="flex h-full min-h-[220px] items-center justify-center rounded-xl px-4 py-6 text-center card-glass">
      <p className="text-[11px]" style={{ color: 'var(--t-faint)' }}>
        深度命理解读功能正在紧张开发中，敬请期待……
      </p>
    </aside>
  );
}
