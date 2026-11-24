/**
 * 把 ZiweiChart 压缩成简洁的中文命盘文本，作为 AI 解读的上下文。
 * 目的：去掉冗余字段（索引、亮度枚举等），只保留对解读有用的信息，
 * 显著减少 prompt token，直接降低每次问答的 API 成本。
 */

import type { Palace, Star, ZiweiChart } from './types';

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

export function chartToContext(chart: ZiweiChart): string {
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
  return lines.join('\n');
}
