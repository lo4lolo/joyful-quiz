const KEYS = ['q', 'a', 'w1', 'w2', 'w3', 'ex'];
export const BACKUP_LIMIT = 5 * 1024 * 1024;
export function makeBackup(sets) {
  return { format: 'joyful-quiz-library', version: 1, exportedAt: new Date().toISOString(),
    sets: sets.map(s => ({ title: s.title, rows: s.rows, updatedAt: s.updatedAt })) };
}
export function parseBackup(text) {
  if (new TextEncoder().encode(text).length > BACKUP_LIMIT) throw new Error('5MB 이하의 보관함 파일을 골라 주세요.');
  let data; try { data = JSON.parse(text); } catch { throw new Error('JSON 파일을 읽을 수 없어요. 보관함 백업 파일인지 확인해 주세요.'); }
  if (data?.format !== 'joyful-quiz-library' || data.version !== 1 || !Array.isArray(data.sets)) throw new Error('즐거운 퀴즈의 보관함 백업 파일을 골라 주세요.');
  if (data.sets.length > 200) throw new Error('한 번에 세트 200개까지 가져올 수 있어요.');
  return data.sets.map((s, i) => {
    if (!s || typeof s.title !== 'string' || !Array.isArray(s.rows) || s.rows.length > 300) throw new Error(`${i + 1}번째 세트 형식을 확인해 주세요. (최대 300문항)`);
    const rows = s.rows.map((r, j) => {
      if (!r || KEYS.some(k => r[k] != null && typeof r[k] !== 'string')) throw new Error(`${i + 1}번째 세트 ${j + 1}번 문제를 확인해 주세요.`);
      const row = Object.fromEntries(KEYS.map(k => [k, (r[k] || '').trim()]));
      if (KEYS.some(k => row[k].length > (k === 'q' || k === 'ex' ? 300 : 80))) throw new Error(`${i + 1}번째 세트 ${j + 1}번 글이 너무 길어요.`);
      return row;
    }).filter(r => KEYS.some(k => r[k]));
    return { title: s.title.slice(0, 30), rows, updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : Date.now() };
  });
}
export function mergeBackup(existing, incoming, id = () => crypto.randomUUID()) {
  const signature = s => JSON.stringify([s.title, s.rows.map(r => KEYS.map(k => r[k] || ''))]);
  const seen = new Set(existing.map(signature));
  const merged = [...existing]; let added = 0;
  for (const s of incoming) {
    const sig = signature(s); if (seen.has(sig)) continue;
    seen.add(sig); merged.push({ ...s, id: id() }); added++;
  }
  return { sets: merged, added, skipped: incoming.length - added };
}
