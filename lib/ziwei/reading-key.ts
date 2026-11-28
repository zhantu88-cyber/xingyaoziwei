import { normalizeGenderInput } from './gender';
import type { BirthInfo } from './types';

/** Build the interpretation key from an already-normalized BirthInfo. */
export function buildReadingKey(birth: Pick<BirthInfo, 'year' | 'month' | 'day' | 'hour' | 'gender'> | null | undefined): string | null {
  if (!birth) return null;
  const { year, month, day, hour } = birth;
  const gender = normalizeGenderInput(birth.gender);
  if (
    !Number.isInteger(year) || year < 1
    || !Number.isInteger(month) || month < 1 || month > 12
    || !Number.isInteger(day) || day < 1 || day > 31
    || !Number.isInteger(hour) || hour < 0 || hour > 11
    || !gender
  ) return null;

  // hour is already a 0–11 branch index. Never convert it as a clock hour here.
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}-${hour}-${gender}`;
}
