'use client';
import { useState } from 'react';
import BirthForm from '@/components/BirthForm';
import ChartBoard from '@/components/ChartBoard';
import InsightPanel from '@/components/InsightPanel';
import ChatPanel from '@/components/ChatPanel';
import TimeNav, { type TimeView } from '@/components/TimeNav';
import { generateChart } from '@/lib/ziwei/algorithm';
import type { BirthInfo, ZiweiChart, Palace } from '@/lib/ziwei/types';

// 把实际小时(0-23)换算成时辰序号(0-11)：23 点与 0 点都算 0（子时），
// 1/2 点=1（丑），3/4 点=2（寅）……21/22 点=11（亥）。与 R2 key 第 4 段一致。
function hourToShichenIndex(hour: number): number {
  return Math.floor((Math.trunc(hour) + 1) / 2) % 12;
}

// 性别归一化：'男'/男性/1/male/m → male，'女'/女性/0/female/f → female。
// 兼容中英文大小写、数字与前后空格；无法识别时返回 null，避免拼出错误 key。
function normalizeGender(gender: unknown): 'male' | 'female' | null {
  const value = String(gender ?? '').trim().toLowerCase();
  if (['male', 'm', 'man', '男', '男性', '1', 'true'].includes(value)) return 'male';
  if (['female', 'f', 'woman', '女', '女性', '0', 'false'].includes(value)) return 'female';
  return null;
}

/**
 * 命盘页 —— 开源版「排盘引擎 Demo」
 *
 * 这是一个最小可运行示例：用本仓库的排盘引擎 generateChart() 配合基础 UI
 * 组件，渲染一张完整紫微命盘 + 基础解读，并支持本命 / 大限 / 流年切换。
 *
 * 说明：线上商业版的完整交互界面（重设计的新 UI、AI 流式解读、合盘、分享
 * 卡片等）不在开源范围内；但排盘内核——安星算法、四化、格局识别、古籍库——
 * 完全开放（见 lib/ziwei/*），可自由二次开发出你自己的界面。
 */
export default function ChartPage() {
  const [chart, setChart] = useState<ZiweiChart | null>(null);
  const [selectedPalace, setSelectedPalace] = useState<Palace | null>(null);
  const [view, setView] = useState<TimeView>('mingpan');
  const [liunianYear, setLiunianYear] = useState(() => new Date().getFullYear());
  // 右栏切换：命盘解读（静态）/ AI 问答（付费，按额度）
  const [rightTab, setRightTab] = useState<'reading' | 'chat'>('reading');

  const gender = normalizeGender(chart?.birthInfo.gender);
  const readingKey = chart && gender
    ? `${chart.birthInfo.year}-${String(chart.birthInfo.month).padStart(2, '0')}-${String(chart.birthInfo.day).padStart(2, '0')}-${hourToShichenIndex(chart.birthInfo.hour)}-${gender}`
    : null;

  // ── 未起盘：展示出生信息表单 ──
  if (!chart) {
    return (
      <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>星耀紫微 · 命盘解析</h1>
        <p style={{ color: '#888', marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
          输入出生信息，即可生成专属紫微命盘。
        </p>
        <BirthForm onSubmit={(info: BirthInfo) => setChart(generateChart(info))} />
      </main>
    );
  }

  // ── 已起盘：命盘 + 解读 ──
  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '24px 16px' }}>
      <button
        type="button"
        onClick={() => { setChart(null); setSelectedPalace(null); }}
        style={{
          marginBottom: 16, padding: '6px 14px', cursor: 'pointer',
          border: '1px solid #ccc', borderRadius: 8, background: 'transparent',
        }}
      >
        ← 重新起盘
      </button>

      <TimeNav
        chart={chart}
        view={view}
        liunianYear={liunianYear}
        onViewChange={setView}
        onYearChange={setLiunianYear}
      />

      <div
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]"
        style={{
          gap: 20, marginTop: 16, alignItems: 'start',
        }}
      >
        <ChartBoard chart={chart} onPalaceSelect={setSelectedPalace} />
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* 右栏切换：静态解读 / AI 问答。两者都保持挂载，切换不丢对话记录 */}
          <div className="tab-container" style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
            <button
              type="button"
              className={`tab-item ${rightTab === 'reading' ? 'active' : ''}`}
              onClick={() => setRightTab('reading')}
            >
              命盘解读
            </button>
            <button
              type="button"
              className={`tab-item ${rightTab === 'chat' ? 'active' : ''}`}
              onClick={() => setRightTab('chat')}
            >
              AI 问答
            </button>
          </div>
          <div style={{ display: rightTab === 'reading' ? 'block' : 'none' }}>
            <InsightPanel selectedPalace={selectedPalace} readingKey={readingKey ?? ''} />
          </div>
          <div
            style={{
              display: rightTab === 'chat' ? 'block' : 'none',
              height: 'min(72vh, 720px)',
              minHeight: 520,
            }}
          >
            <ChatPanel chart={chart} />
          </div>
        </div>
      </div>
    </main>
  );
}
