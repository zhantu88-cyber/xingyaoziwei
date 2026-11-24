/**
 * 流年推算（纯本地计算，不依赖任何外部数据源）。
 *
 * 紫微斗数的流年规则：
 *   1. 流年干支：由公历年份推得。年干 = (year-4)%10，年支 = (year-4)%12。
 *   2. 流年命宫：即流年地支所在的宫位（太岁宫）。例如 2027 丁未年，未宫即流年命宫。
 *   3. 流年十二宫：以流年命宫为起点，按逆时针（地支递减）依次为
 *      命宫 → 兄弟 → 夫妻 → 子女 → 财帛 → 疾厄 → 迁移 → 交友 → 官禄 → 田宅 → 福德 → 父母。
 *      故某宫的流年宫名由 (流年地支 - 该宫地支 + 12) % 12 的偏移量决定。
 *   4. 流年四化：按流年天干查四化表（与生年四化同一张表）。
 */

import { BRANCHES, SI_HUA_TABLE, STEMS } from './constants';
import type { ZiweiChart } from './types';

/** 流年十二宫名，自流年命宫起按逆时针（地支递减）排列 */
export const LIUNIAN_PALACE_ORDER = [
  '命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄',
  '迁移', '交友', '官禄', '田宅', '福德', '父母',
] as const;

/** 公历年份 → 年干索引 0-9（甲=0 … 癸=9） */
export function yearStemIndex(year: number): number {
  return ((year - 4) % 10 + 10) % 10;
}

/** 公历年份 → 年支索引 0-11（子=0 … 亥=11） */
export function yearBranchIndex(year: number): number {
  return ((year - 4) % 12 + 12) % 12;
}

export interface LiunianPalace {
  /** 该宫地支 */
  branch: number;
  /** 本命宫名 */
  natalName: string;
  /** 流年宫名 */
  liunianName: string;
  /** 该宫主星名（用于简短提示） */
  majorStars: string[];
}

export interface LiunianInfo {
  year: number;
  stemIndex: number;
  branchIndex: number;
  stemName: string;
  branchName: string;
  /** 流年命宫所在的地支索引 */
  mingGongBranch: number;
  /** 流年命宫对应的本命宫名 */
  mingGongNatalName: string;
  /** 十二宫的流年宫名映射（按地支 0-11 排序，与本命 palaces 同序） */
  palaces: LiunianPalace[];
  /** 流年四化 */
  siHua: { lu: string; quan: string; ke: string; ji: string };
}

/** 计算指定年份的流年信息（流年命宫 / 十二宫映射 / 四化）。 */
export function computeLiunian(chart: ZiweiChart, year: number): LiunianInfo {
  const stemIndex = yearStemIndex(year);
  const branchIndex = yearBranchIndex(year);
  const table = SI_HUA_TABLE[stemIndex] ?? ['', '', '', ''];

  const palaces: LiunianPalace[] = chart.palaces.map((p) => {
    const offset = ((branchIndex - p.branch) % 12 + 12) % 12;
    return {
      branch: p.branch,
      natalName: p.name,
      liunianName: LIUNIAN_PALACE_ORDER[offset],
      majorStars: p.stars.filter((s) => s.type === 'major').map((s) => s.name),
    };
  });

  const mingPalace = palaces.find((p) => p.branch === branchIndex);

  return {
    year,
    stemIndex,
    branchIndex,
    stemName: STEMS[stemIndex] ?? '',
    branchName: BRANCHES[branchIndex] ?? '',
    mingGongBranch: branchIndex,
    mingGongNatalName: mingPalace?.natalName ?? '',
    palaces,
    siHua: { lu: table[0], quan: table[1], ke: table[2], ji: table[3] },
  };
}

/** 取某流年宫名所在的宫（如"官禄"）。 */
export function findLiunianPalace(info: LiunianInfo, name: string): LiunianPalace | undefined {
  return info.palaces.find((p) => p.liunianName === name);
}
