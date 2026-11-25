/**
 * 套餐配置（唯一价格来源）。
 *
 * 价格可随时改这里，前端 /pay 与后台 /admin 都读同一份，无需改数据库。
 * 采用低门槛冲量价：3次6.9 / 10次19.9 / 30次49.9 / 7天不限问59.9。
 */

export type PackageKind = 'credits' | 'time';

export interface Package {
  id: string;
  name: string;
  kind: PackageKind;
  /** 次数包：发放的问答次数 */
  credits?: number;
  /** 时间包：不限问天数 */
  days?: number;
  /** 售价（元） */
  price: number;
  /** 一句话卖点 */
  desc: string;
  /** 角标，如「最受欢迎」 */
  badge?: string;
}

export const PACKAGES: Package[] = [
  {
    id: 'c3',
    name: '3 次体验包',
    kind: 'credits',
    credits: 3,
    price: 6.9,
    desc: '先试 3 次，问完再决定',
  },
  {
    id: 'c10',
    name: '10 次标准包',
    kind: 'credits',
    credits: 10,
    price: 19.9,
    desc: '日常使用，平均每次不到 2 元',
    badge: '最受欢迎',
  },
  {
    id: 'c30',
    name: '30 次深度包',
    kind: 'credits',
    credits: 30,
    price: 49.9,
    desc: '长期慢慢用，180 天有效',
  },
  {
    id: 't7',
    name: '7 天不限问',
    kind: 'time',
    days: 7,
    price: 59.9,
    desc: '7 天内想问多少问多少',
  },
];

export function findPackage(id: string): Package | undefined {
  return PACKAGES.find((p) => p.id === id);
}

/** 单次均价（仅次数包），用于展示。 */
export function perChatPrice(p: Package): string | null {
  if (p.kind !== 'credits' || !p.credits) return null;
  return (p.price / p.credits).toFixed(2);
}
