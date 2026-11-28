/** Normalize gender values accepted at UI/share-link boundaries. */
export function normalizeGenderInput(value: unknown): 'male' | 'female' | null {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (['male', 'm', 'man', '男', '男性', '1', 'true'].includes(normalized)) return 'male';
  if (['female', 'f', 'woman', '女', '女性', '0', 'false'].includes(normalized)) return 'female';
  return null;
}
