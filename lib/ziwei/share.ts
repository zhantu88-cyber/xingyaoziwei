import type { BirthFormState } from '@/components/BirthForm';
import type { BirthInfo } from './types';
import { calculateTrueSolarTime, resolveZiweiDayOffset, shiftGregorianDate } from './true-solar-time';

function isValidLongitude(longitude: number): boolean {
  return longitude >= -180 && longitude <= 180;
}

/** 根据北京时间、经度与日期计算真太阳时时辰支 (0-11) */
export function calcTrueSolarBranch(
  clockHour: number,
  clockMinute: number,
  longitude: number,
  year?: number,
  month?: number,
  day?: number,
): number {
  const solar = calculateTrueSolarTime({
    year: year ?? 0,
    month: month ?? 0,
    day: day ?? 0,
    clockHour,
    clockMinute,
    longitude,
  });
  return solar.branch;
}

/** BirthFormState → BirthInfo
 *
 * 子时规则（先贤体系/三合派标准）：
 * · 23:00-23:59 = 晚子时，**按次日**排盘（日期 +1）
 * · 00:00-00:59 = 早子时，按本日排盘
 * 这与「时辰支同为子(0)」并不冲突——子时分早晚两段，需要在日期上区分。
 */
export function formToBirthInfo(form: BirthFormState): BirthInfo {
  let y = parseInt(form.year) || 0;
  let m = parseInt(form.month) || 0;
  let d = parseInt(form.day) || 0;
  let hour = 0;

  // 以出生日期、经度和均时差计算真太阳时。时辰与换日使用同一个结果，
  // 避免只做经度修正时在丑时边界附近产生一小时错位。
  if (!form.unknownTime) {
    const solar = calculateTrueSolarTime({
      year: y,
      month: m,
      day: d,
      clockHour: parseInt(form.clockHour) || 0,
      clockMinute: parseInt(form.clockMinute) || 0,
      // 表单默认经度为 120°；未选出生地时仍与表单预览使用相同的时辰口径。
      longitude: form.longitude,
    });
    hour = solar.branch;
    const dayOffset = resolveZiweiDayOffset(solar);
    if (dayOffset !== 0 && y > 0 && m > 0 && d > 0) {
      ({ year: y, month: m, day: d } = shiftGregorianDate({ year: y, month: m, day: d }, dayOffset));
    }
  }

  return {
    year: y, month: m, day: d,
    hour,
    gender: form.gender,
    name: form.name || undefined,
    province: form.province || undefined,
    city: form.city || undefined,
    longitude: form.province ? form.longitude : undefined,
  };
}

/** BirthFormState → URLSearchParams（用于分享链接） */
export function formToSearchParams(form: BirthFormState): URLSearchParams {
  const p = new URLSearchParams();
  if (form.name) p.set('n', form.name);
  p.set('y', form.year);
  p.set('m', form.month);
  p.set('d', form.day);
  if (form.unknownTime) {
    p.set('u', '1');
  } else {
    p.set('h', form.clockHour);
    p.set('mi', form.clockMinute);
  }
  if (form.province) p.set('p', form.province);
  if (form.city) p.set('c', form.city);
  if (form.longitude !== 120 && isValidLongitude(form.longitude)) p.set('lo', String(form.longitude));
  p.set('g', form.gender === 'male' ? 'm' : 'f');
  return p;
}

/** URLSearchParams → Partial<BirthFormState>，不完整时返回 null */
export function searchParamsToForm(params: URLSearchParams): Partial<BirthFormState> | null {
  const year = params.get('y');
  const month = params.get('m');
  const day = params.get('d');
  if (!year || !month || !day) return null;
  const rawLongitude = params.get('lo')?.trim();
  const longitude = rawLongitude ? Number(rawLongitude) : 120;
  return {
    name: params.get('n') || '',
    year,
    month,
    day,
    unknownTime: params.get('u') === '1',
    clockHour: params.get('h') || '8',
    clockMinute: params.get('mi') || '0',
    province: params.get('p') || '',
    city: params.get('c') || '',
    longitude: isValidLongitude(longitude) ? longitude : 120,
    gender: params.get('g') === 'f' ? 'female' : 'male',
  };
}
