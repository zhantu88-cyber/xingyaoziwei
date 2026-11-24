/**
 * 把 ZiweiChart 压缩成简洁的中文命盘文本，作为 AI 解读的上下文。
 * 目的：去掉冗余字段（索引、亮度枚举等），只保留对解读有用的信息，
 * 显著减少 prompt token，直接降低每次问答的 API 成本。
 */

import type { Palace, Star, ZiweiChart } from './types';
import { computeLiunian, findLiunianPalace } from './liunian';

const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

function starLabel(star: Star): string {
  const parts = [star.name];
  if (star.brightnessRaw) parts.push(`(${star.brightnessRaw})`);
  if (star.siHua) parts.push(`化${star.siHua}`);
  return parts.join('');
}

function palaceLabel(p: Palace): string {
  const gz = `${STEMS[p.stem] ?? ''}${BRANCHES[p.branch] ?? ''}`;
  const major = p.stars.filter((s) => s.type === 'major').map(starLabel);
  const others = p.stars.filter((s) => s.type !== 'major').map(starLabel);
  const seg: string[] = [];
  if (major.length > 0) seg.push(`主星：${major.join('、')}`);
  else if (p.isEmpty) seg.push(`空宫${p.borrowedFromName ? `（借对宫${p.borrowedFromName}：${(p.borrowedStars ?? []).join('、')}）` : ''}`);
  if (others.length > 0) seg.push(`辅星：${others.join('、')}`);
  if (p.selfSihua && p.selfSihua.length > 0) {
    seg.push(`自化：${p.selfSihua.map((s) => `${s.starName}化${s.siHua}`).join('、')}`);
  }
  const marks = [p.isMingGong ? '命宫' : '', p.isShenGong ? '身宫' : ''].filter(Boolean).join('/');
  return `${p.name}（${gz}${marks ? '·' + marks : ''}）：${seg.join('；') || '无'}`;
}

/**
 * @param liunianYear 可选。传入时追加该年的流年命宫、关键宫位与流年四化，
 *   让 AI 能回答"明年/某年如何"这类时间相关的问题。
 */
export function chartToContext(chart: ZiweiChart, liunianYear?: number): string {
  const lines: string[] = [];
  const gender = chart.birthInfo.gender === 'male' ? '男' : '女';
  lines.push('【基本资料】');
  lines.push(
    `性别：${gender}${chart.yinYangGender ? `（${chart.yinYangGender}）` : ''}　五行局：${chart.wuxingJuName}　` +
      `命宫：${BRANCHES[chart.mingGongBranch] ?? ''}宫　身宫：${BRANCHES[chart.shenGongBranch] ?? ''}宫`,
  );
  if (chart.mingZhu || chart.shenZhu) {
    lines.push(`命主：${chart.mingZhu ?? '—'}　身主：${chart.shenZhu ?? '—'}`);
  }
  if (chart.lunarInfo.fourPillars) {
    lines.push(`四柱：${chart.lunarInfo.fourPillars.join('　')}`);
  }

  lines.push('\n【十二宫】');
  for (const p of chart.palaces) lines.push(palaceLabel(p));

  const cur = chart.daXians?.[chart.currentDaXianIndex];
  if (cur) {
    lines.push('\n【大限】');
    lines.push(
      `当前大限：${cur.startAge}-${cur.endAge} 岁，${cur.palaceName}（${BRANCHES[cur.palaceBranch] ?? ''}宫）` +
        (cur.siHua ? `，大限四化：禄=${cur.siHua.lu} 权=${cur.siHua.quan} 科=${cur.siHua.ke} 忌=${cur.siHua.ji}` : ''),
    );
  }

  // ── 流年（可选）：让 AI 能回答"今年/明年/某年"这类时间相关问题 ──
  // 同时给出所选年份及其下一年，覆盖"今年/明年"两种常见问法；
  // 并用当前公历年份标注相对关系，避免 AI 把年份认错。
  if (typeof liunianYear === 'number' && Number.isFinite(liunianYear)) {
    const thisYear = new Date().getFullYear();
    for (const y of [liunianYear, liunianYear + 1]) {
      const ln = computeLiunian(chart, y);
      const rel = y === thisYear ? '，今年' : y === thisYear + 1 ? '，明年' : '';
      lines.push('\n【流年】');
      lines.push(`流年：${ln.year} 年（${ln.stemName}${ln.branchName}年${rel}）`);
      lines.push(`流年命宫：${BRANCHES[ln.mingGongBranch] ?? ''}宫（本命${ln.mingGongNatalName}）`);
      for (const name of ['官禄', '财帛', '夫妻', '迁移']) {
        const p = findLiunianPalace(ln, name);
        if (!p) continue;
        const stars = p.majorStars.length > 0 ? `主星：${p.majorStars.join('、')}` : '空宫（借对宫）';
        lines.push(`流年${name}宫：${BRANCHES[p.branch] ?? ''}宫（本命${p.natalName}），${stars}`);
      }
      lines.push(`流年四化：禄=${ln.siHua.lu}　权=${ln.siHua.quan}　科=${ln.siHua.ke}　忌=${ln.siHua.ji}`);
    }
  }

  return lines.join('\n');
}
