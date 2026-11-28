import assert from 'node:assert/strict';
import { generateChart, resolveEffectiveLunarDate } from '../../lib/ziwei/algorithm';
import { normalizeGenderInput } from '../../lib/ziwei/gender';
import { lunarToSolar } from '../../lib/ziwei/lunar-solar';
import { buildReadingKey } from '../../lib/ziwei/reading-key';
import { formToBirthInfo, searchParamsToForm } from '../../lib/ziwei/share';
import { calculateTrueSolarTime, formatTrueSolarClock } from '../../lib/ziwei/true-solar-time';
import type { BirthFormState } from '../../components/BirthForm';

function formAt(
  year: number,
  month: number,
  day: number,
  clockHour: number,
  clockMinute: number,
  longitude: number,
  gender: unknown = 'male',
): BirthFormState {
  return {
    name: '', year: String(year), month: String(month), day: String(day),
    clockHour: String(clockHour), clockMinute: String(clockMinute),
    unknownTime: false, province: '测试', city: '测试', longitude,
    gender: gender as BirthFormState['gender'],
  };
}

function keyForBirth(birth: ReturnType<typeof formToBirthInfo>): string {
  const key = buildReadingKey(birth);
  assert.ok(key, 'valid birth data produces a reading key');
  return key;
}

console.log('① 子时与边界：使用真太阳时后的日期/时辰，晚子时按当前 next-day 口径');
// 2000-04-15 均时差接近 0 分钟，便于验证 23:00 / 01:00 边界。
const ziCases = [
  { h: 22, m: 59, date: '2000-04-15', hour: 11, label: '亥时末' },
  { h: 23, m: 0, date: '2000-04-16', hour: 0, label: '晚子时起点，按次日' },
  { h: 23, m: 59, date: '2000-04-16', hour: 0, label: '晚子时末，按次日' },
  { h: 0, m: 0, date: '2000-04-15', hour: 0, label: '早子时起点，当日' },
  { h: 0, m: 59, date: '2000-04-15', hour: 0, label: '早子时末，当日' },
  // 均时差在当地凌晨约为负数，民用钟表 01:00 仍可能未到真太阳时 01:00；
  // 此处用 01:10 确认校正后进入丑时，不把钟表边界误当真太阳边界。
  { h: 1, m: 10, date: '2000-04-15', hour: 1, label: '校正后进入丑时' },
];
for (const c of ziCases) {
  const birth = formToBirthInfo(formAt(2000, 4, 15, c.h, c.m, 120));
  const actualDate = `${birth.year}-${String(birth.month).padStart(2, '0')}-${String(birth.day).padStart(2, '0')}`;
  assert.equal(actualDate, c.date, c.label);
  assert.equal(birth.hour, c.hour, c.label);
  console.log(`  ${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')} → ${actualDate} ${birth.hour} (${c.label})`);
}

console.log('\n② 闰四月：农历转公历、默认 split 分界与安盘');
const leapDay15 = lunarToSolar(2020, 4, 15, true);
const leapDay16 = lunarToSolar(2020, 4, 16, true);
assert.ok(leapDay15 && leapDay16, '2020 年存在有效的闰四月十五、十六');
const effective15 = resolveEffectiveLunarDate(leapDay15.year, leapDay15.month, leapDay15.day, 'split');
const effective16 = resolveEffectiveLunarDate(leapDay16.year, leapDay16.month, leapDay16.day, 'split');
assert.equal(effective15.rawLunarMonth, -4, '农历库以负月标识闰四月');
assert.equal(effective15.lunarMonth, 4, '闰四月前半按四月');
assert.equal(effective16.lunarMonth, 5, '闰四月后半按五月');
const leapChart15 = generateChart({ ...leapDay15, hour: 4, gender: 'female' });
const leapChart16 = generateChart({ ...leapDay16, hour: 4, gender: 'female' });
assert.equal(leapChart15.lunarInfo.lunarMonth, 4);
assert.equal(leapChart16.lunarInfo.lunarMonth, 5);
assert.equal(leapChart15.palaces.length, 12, '闰月前半可完整安十二宫');
assert.equal(leapChart16.palaces.length, 12, '闰月后半可完整安十二宫');
const originLeapChart = generateChart({ ...leapDay15, hour: 4, gender: 'female' }, { leapMonth: 'origin-month' });
assert.equal(originLeapChart.lunarInfo.isLeapMonth, true, 'origin-month 保留闰月标记');
console.log(`  闰四月十五 ${JSON.stringify(leapDay15)} → split 四月，12 宫正常`);
console.log(`  闰四月十六 ${JSON.stringify(leapDay16)} → split 五月，12 宫正常`);
console.log('  origin-month 口径保留 isLeapMonth=true');

console.log('\n③ 极东/极西真太阳时与最终 k 日期/hour');
for (const place of [
  { name: '黑龙江佳木斯', longitude: 130.37, expectedHour: 1 },
  { name: '新疆喀什', longitude: 75.99, expectedHour: 0 },
]) {
  const form = formAt(2000, 10, 29, 2, 0, place.longitude);
  const solar = calculateTrueSolarTime({
    year: 2000, month: 10, day: 29, clockHour: 2, clockMinute: 0, longitude: place.longitude,
  });
  const birth = formToBirthInfo(form);
  assert.equal(birth.hour, place.expectedHour, `${place.name} 时辰索引`);
  const chart = generateChart(birth);
  assert.equal(chart.birthInfo.hour, place.expectedHour, `${place.name} 排盘核心保留索引`);
  assert.equal(chart.birthInfo.day, 29, `${place.name} 的子时次日规则应归回 10 月 29 日`);
  assert.equal(buildReadingKey(chart.birthInfo), keyForBirth(birth), '页面 key 保留 BirthInfo.hour 原索引');
  console.log(`  ${place.name} ${place.longitude}°：真太阳时 ${formatTrueSolarClock(solar)}，solar dayOffset=${solar.dayOffset} → hour=${birth.hour}，k=${keyForBirth(birth)}`);
}

// 用户举例：00:30 经度修正后为前一日 23:50。它属于前一太阳日的晚子时，
// 按 next-day 规则回到输入民用日期；若落到亥时，则日期确实退回前一天。
const nearZiForm = formAt(2000, 4, 15, 0, 30, 110);
const nearZiSolar = calculateTrueSolarTime({ year: 2000, month: 4, day: 15, clockHour: 0, clockMinute: 30, longitude: 110 });
const nearZiBirth = formToBirthInfo(nearZiForm);
assert.equal(nearZiSolar.dayOffset, -1);
assert.equal(nearZiSolar.branch, 0);
assert.equal(nearZiBirth.day, 15, '前日 23:50 晚子时按次日规则回到输入日期');
console.log(`  00:30 @110° → 前日 ${formatTrueSolarClock(nearZiSolar)} 子时，最终排盘日 ${nearZiBirth.year}-${nearZiBirth.month}-${nearZiBirth.day}`);
const haiForm = formAt(2000, 4, 15, 0, 30, 80);
const haiSolar = calculateTrueSolarTime({ year: 2000, month: 4, day: 15, clockHour: 0, clockMinute: 30, longitude: 80 });
const haiBirth = formToBirthInfo(haiForm);
assert.equal(haiSolar.branch, 11);
assert.equal(haiBirth.day, 14, '前日亥时按真太阳日期退回前一天');
console.log(`  00:30 @80° → 前日 ${formatTrueSolarClock(haiSolar)} 亥时，最终排盘日 ${haiBirth.year}-${haiBirth.month}-${haiBirth.day}`);

console.log('\n④ 性别输入路径：中文/英文/数字 → male 或 female，无 undefined');
for (const [input, expected] of [
  ['男', 'male'], ['男性', 'male'], ['male', 'male'], ['M', 'male'], ['1', 'male'],
  ['女', 'female'], ['女性', 'female'], ['female', 'female'], ['F', 'female'], ['0', 'female'],
] as const) {
  assert.equal(normalizeGenderInput(input), expected, `normalize ${input}`);
  const params = new URLSearchParams({ y: '2000', m: '1', d: '1', g: input });
  assert.equal(searchParamsToForm(params)?.gender, expected, `share-link gender ${input}`);
  const birth = formToBirthInfo(formAt(2000, 1, 1, 8, 0, 120, input));
  assert.equal(birth.gender, expected, `form gender ${input}`);
  assert.equal(
    buildReadingKey({ year: 2000, month: 1, day: 1, hour: 1, gender: input } as never),
    `2000-01-01-1-${expected}`,
    `page reading key gender ${input}`,
  );
  assert.ok(birth.gender === 'male' || birth.gender === 'female');
}
assert.equal(normalizeGenderInput('unknown'), null, 'unknown gender is not silently mapped');
assert.equal(searchParamsToForm(new URLSearchParams({ y: '2000', m: '1', d: '1', g: 'unknown' })), null);
console.log('  10 种输入均映射到规范值；未知值被拒绝，不会生成 undefined');

console.log('\nedge-case regressions passed');
