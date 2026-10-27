// 기록 파일 만들기·저장·읽기 (교사 브라우저 전용, 서버로 보내지 않음)
// - 연결한 폴더(File System Access API)가 있으면 그 폴더에, 없으면 내려받기로 저장
// - 엑셀은 전역 XLSX(SheetJS, vendor/xlsx.full.min.js)를 쓴다
// - 게임 중 기록은 liveDraft 로 이 기기의 localStorage 에 임시 보관
import { analysisSheets } from './stats.js';

export const APP = 'joyful-quiz';
export const VERSION = 1;
const LIMIT = { questions: 500, players: 300, answers: 60000, ranking: 300, fileBytes: 25e6, str: 300, given: 120, name: 40 };

// ---------- 작은 도구 ----------
// 순위의 추가 정보: 숫자·짧은 글·참거짓만 남긴 작은 객체 (게임마다 다름: correct, kg, team …)
function cleanExtra(x) {
  if (typeof x === 'number' || typeof x === 'boolean') return x;
  if (!x || typeof x !== 'object') return clip(x, 80);
  const o = {};
  for (const [k, v] of Object.entries(x).slice(0, 20)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,24}$/.test(k)) continue;
    if (typeof v === 'number' && Number.isFinite(v)) o[k] = v;
    else if (typeof v === 'boolean' || v === null) o[k] = v;
    else if (typeof v === 'string') o[k] = clip(v, 60);
    else if (v && typeof v === 'object') o[k] = clip(Object.values(v).filter(t => typeof t !== 'object').join(' '), 60);
  }
  return o;
}
const clip = (s, n = LIMIT.str) => String(s ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, n);
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const iso = v => { if (v == null || v === '') return ''; const d = new Date(typeof v === 'number' ? v : String(v)); return isNaN(d) ? '' : d.toISOString(); };
export function randomId() {
  try { if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID(); } catch {}
  const b = new Uint8Array(16);
  try { globalThis.crypto.getRandomValues(b); } catch { for (let i = 0; i < 16; i++) b[i] = Math.random() * 256 | 0; }
  return [...b].map(x => x.toString(16).padStart(2, '0')).join('');
}
const cleanSettings = s => {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return {};
  const out = {};
  for (const [k, v] of Object.entries(s).slice(0, 40)) {
    const key = clip(k, 40); if (!key || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'string') out[key] = clip(v, 200);
  }
  return out;
};
const cleanQuestion = (q, i) => ({
  qid: q?.qid ?? i,
  q: clip(q?.q, 500),
  answers: (Array.isArray(q?.answers) ? q.answers : [q?.answers ?? q?.a ?? '']).map(a => clip(a, 120)).filter(Boolean).slice(0, 6),
  wrong: (Array.isArray(q?.wrong) ? q.wrong : []).map(a => clip(a, 120)).filter(Boolean).slice(0, 6),
  explain: clip(q?.explain, 500),
  kind: ['mc', 'ox', 'short'].includes(q?.kind) ? q.kind : '',
});
const cleanId = v => (typeof v === 'number' && Number.isFinite(v) ? v : clip(v, 64));

// ---------- 기록 만들기 ----------
/**
 * 게임 정보 → 기록 객체 (ARCHITECTURE.md '기록 파일')
 * log 의 name 은 answers 에 넣지 않고 players 목록에 모은다.
 */
export function buildRecord({ title, unit, mode, modeName, settings, questions, players, log, ranking, startedAt, endedAt, id, teams, events } = {}) {
  const qs = (Array.isArray(questions) ? questions : []).slice(0, LIMIT.questions).map(cleanQuestion);
  const pmap = new Map();
  for (const p of (Array.isArray(players) ? players : [])) {
    if (p?.pid == null) continue;
    const o = { pid: cleanId(p.pid), name: clip(p.name, LIMIT.name) || '이름 없음' };
    if (Number.isInteger(p.team) && p.team >= 0 && p.team < 10) o.team = p.team;
    pmap.set(String(p.pid), o);
  }
  const answers = [];
  for (const a of (Array.isArray(log) ? log : []).slice(0, LIMIT.answers)) {
    if (!a || a.pid == null || a.qid == null) continue;
    if (!pmap.has(String(a.pid))) pmap.set(String(a.pid), { pid: cleanId(a.pid), name: clip(a.name, LIMIT.name) || '이름 없음' });
    const o = { pid: cleanId(a.pid), qid: cleanId(a.qid), ok: !!a.ok, given: clip(a.given, LIMIT.given), ms: Math.max(0, Math.round(num(a.ms))), t: num(a.t) };
    // 학습 행동: 몇 번째 만남(try) · 순서(seq) · 직전 연속 정답(streak) · 건너뜀(skip) · 문제 모양(kind) · 기기(dev)
    if (Number.isInteger(a.try) && a.try > 0) o.try = Math.min(a.try, 99);
    if (Number.isInteger(a.seq) && a.seq > 0) o.seq = Math.min(a.seq, 9999);
    if (Number.isInteger(a.streak) && a.streak >= 0) o.streak = Math.min(a.streak, 999);
    if (a.skip) o.skip = true;
    if (['mc', 'ox', 'short'].includes(a.kind)) o.kind = a.kind;
    if (a.dev === 't' || a.dev === 'p') o.dev = a.dev;
    answers.push(o);
  }
  const rank = (Array.isArray(ranking) ? ranking : []).slice(0, LIMIT.ranking).filter(r => r && r.pid != null).map(r => {
    if (!pmap.has(String(r.pid))) pmap.set(String(r.pid), { pid: cleanId(r.pid), name: clip(r.name, LIMIT.name) || '이름 없음' });
    const o = { pid: cleanId(r.pid), name: clip(r.name, LIMIT.name) || pmap.get(String(r.pid)).name, score: num(r.score), rank: num(r.rank) };
    if (r.extra != null && r.extra !== '') o.extra = cleanExtra(r.extra);
    return o;
  });
  const t0 = answers.length ? Math.min(...answers.map(a => a.t).filter(Boolean)) : 0;
  return {
    app: APP, v: VERSION, id: id ? clip(id, 64) : randomId(),
    title: clip(title, 80) || '즐거운 퀴즈', unit: clip(unit, 80), mode: clip(mode, 30), modeName: clip(modeName, 40),
    startedAt: iso(startedAt) || (t0 ? iso(t0) : new Date().toISOString()), endedAt: iso(endedAt) || new Date().toISOString(),
    settings: cleanSettings(settings),
    questions: qs,
    players: [...pmap.values()].slice(0, LIMIT.players),
    answers,
    ranking: rank,
    // 모둠과 협력 기록 (연구용, 없으면 빈 배열)
    teams: (Array.isArray(teams) ? teams : []).slice(0, 10).map(t => ({ id: clip(t?.id, 20), name: clip(t?.name, 20), color: /^#[0-9a-f]{6}$/i.test(t?.color) ? t.color : '' })),
    events: (Array.isArray(events) ? events : []).slice(0, 20000).filter(e => e && e.type).map(e => ({ t: num(e.t), type: clip(e.type, 30),
      pid: e.pid == null ? null : cleanId(e.pid), team: Number.isInteger(e.team) ? e.team : null, data: cleanExtra(e.data || {}) })),
  };
}

/** 즐거운퀴즈_<제목>_<YYYY-MM-DD_HHmm> (윈도 파일 이름에 못 쓰는 글자 제거) */
export function fileBase(record) {
  const d = new Date(record?.startedAt || record?.endedAt || Date.now());
  const ok = !isNaN(d) ? d : new Date();
  const p = n => String(n).padStart(2, '0');
  const stamp = `${ok.getFullYear()}-${p(ok.getMonth() + 1)}-${p(ok.getDate())}_${p(ok.getHours())}${p(ok.getMinutes())}`;
  return `즐거운퀴즈_${safeName(record?.title)}_${stamp}`;
}
export function safeName(s, max = 40) {
  let t = String(s ?? '').normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim();
  t = [...t].slice(0, max).join('').replace(/[. ]+$/g, '').replace(/^[. ]+/g, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(t)) t = '_' + t;
  return t || '퀴즈';
}

// ---------- 엑셀 ----------
function sheetsToWorkbook(sheets, extra = []) {
  const X = globalThis.XLSX;
  if (!X) throw new Error('엑셀 도구(xlsx.full.min.js)를 불러오지 못했어요.');
  const wb = X.utils.book_new();
  for (const s of sheets) {
    const ws = X.utils.aoa_to_sheet(s.rows);
    if (s.cols) ws['!cols'] = s.cols.map(w => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  for (const s of extra) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet(s.rows), s.name.slice(0, 31));
  if (extra.length) {
    wb.Workbook = wb.Workbook || {}; wb.Workbook.Sheets = wb.SheetNames.map(n => ({ Hidden: extra.some(e => e.name === n) ? 1 : 0 }));
  }
  return wb;
}
const RAW_SHEET = '_기록원본';
// 기록 JSON 을 숨김 시트에 넣어 두면 엑셀 파일만으로도 분석실에서 다시 열 수 있다 (셀 글자 한도 32767)
function rawSheet(records) {
  const json = JSON.stringify(records.length === 1 ? records[0] : bundle(records));
  const rows = [['즐거운 퀴즈 기록 원본입니다. 고치지 마세요.']];
  for (let i = 0; i < json.length; i += 30000) rows.push([json.slice(i, i + 30000)]);
  return { name: RAW_SHEET, rows };
}

/** 한 기록 → 엑셀 통합문서 (요약·문항분석·학생분석·학생x문항·응답원자료) */
export function recordToWorkbook(record) { return recordsToWorkbook([record]); }
/** 여러 기록을 합친 분석 통합문서 (분석실 '엑셀로 저장') */
export function recordsToWorkbook(records, opts = {}) {
  return sheetsToWorkbook(analysisSheets(records, opts), opts.raw === false ? [] : [rawSheet(records)]);
}
export function workbookBytes(wb) {
  return globalThis.XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
}
export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** 여러 기록을 하나의 JSON 묶음으로 */
export function bundle(records) {
  return { app: APP, v: VERSION, kind: 'bundle', savedAt: new Date().toISOString(), sessions: records };
}

// ---------- 폴더 연결 (File System Access API, 핸들은 IndexedDB 에 보관) ----------
const DB = 'joyful-quiz', STORE = 'kv', FOLDER_KEY = 'recordFolder';
function idb(mode, fn) {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error('no indexedDB'));
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(STORE, mode), st = tx.objectStore(STORE);
      let out; const req = fn(st); if (req) req.onsuccess = () => { out = req.result; };
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    };
  });
}
const folderSupported = () => typeof globalThis.showDirectoryPicker === 'function';
async function getFolder() {
  if (!folderSupported()) return null;
  try { return (await idb('readonly', st => st.get(FOLDER_KEY))) || null; } catch { return null; }
}
async function permission(handle, ask) {
  try {
    const opt = { mode: 'readwrite' };
    let p = await handle.queryPermission(opt);
    if (p !== 'granted' && ask) p = await handle.requestPermission(opt);
    return p;
  } catch { return 'denied'; }
}

/** 저장할 폴더 고르기 (반드시 클릭에서 불러야 함) */
export async function chooseFolder() {
  if (!folderSupported()) return { ok: false, name: null, reason: 'unsupported' };
  try {
    const h = await showDirectoryPicker({ id: 'joyful-quiz-records', mode: 'readwrite', startIn: 'documents' });
    if ((await permission(h, true)) !== 'granted') return { ok: false, name: h.name, reason: 'denied' };
    await idb('readwrite', st => st.put(h, FOLDER_KEY));
    return { ok: true, name: h.name };
  } catch (e) {
    return { ok: false, name: null, reason: e?.name === 'AbortError' ? 'cancel' : 'error' };
  }
}
/** 연결한 폴더 정보: permission 은 'granted' | 'prompt' | 'denied' | null */
export async function folderInfo() {
  const supported = folderSupported();
  const h = supported ? await getFolder() : null;
  return { supported, name: h?.name ?? null, permission: h ? await permission(h, false) : null };
}
export async function forgetFolder() { try { await idb('readwrite', st => st.delete(FOLDER_KEY)); } catch {} }
/** 연결한 폴더를 쓸 수 있게 권한 다시 묻기 (클릭에서 불러야 창이 뜸) */
export async function ensureFolderPermission() {
  const h = await getFolder();
  if (!h) return { ok: false, name: null };
  return { ok: (await permission(h, true)) === 'granted', name: h.name };
}

async function uniqueName(dir, name) {
  const dot = name.lastIndexOf('.'), stem = name.slice(0, dot), ext = name.slice(dot);
  for (let i = 1; i < 100; i++) {
    const n = i === 1 ? name : `${stem} (${i})${ext}`;
    try { await dir.getFileHandle(n); } catch { return n; } // 없으면 이 이름을 쓴다
  }
  return `${stem}_${Date.now()}${ext}`;
}
async function writeToFolder(dir, name, data) {
  const n = await uniqueName(dir, name);
  const fh = await dir.getFileHandle(n, { create: true });
  const w = await fh.createWritable();
  await w.write(data); await w.close();
  return n;
}
function download(name, blob) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
const pause = ms => new Promise(r => setTimeout(r, ms));

/**
 * 파일 여러 개 저장: files = [{name, data(Blob|ArrayBuffer|string), type}]
 * 연결한 폴더가 있고 권한이 있으면(없으면 다시 물어봄) 그 폴더에, 아니면 내려받기.
 */
export async function saveFiles(files, { useFolder = true } = {}) {
  const dir = useFolder ? await getFolder() : null;
  if (dir && (await permission(dir, true)) === 'granted') {
    try {
      const names = [];
      for (const f of files) names.push(await writeToFolder(dir, f.name, f.data));
      return { where: 'folder', folderName: dir.name, files: names };
    } catch (e) { console.warn('폴더에 저장하지 못해 내려받기로 바꿔요', e); }
  }
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    download(f.name, f.data instanceof Blob ? f.data : new Blob([f.data], { type: f.type || 'application/octet-stream' }));
    if (i < files.length - 1) await pause(400);
  }
  return { where: 'download', folderName: null, files: files.map(f => f.name) };
}

/** 기록 저장: <base>.json (+ <base>.xlsx) */
export async function saveRecord(record, { xlsx = true } = {}) {
  const base = fileBase(record);
  const files = [{ name: `${base}.json`, data: JSON.stringify(record, null, 1), type: 'application/json' }];
  if (xlsx) {
    try { files.push({ name: `${base}.xlsx`, data: workbookBytes(recordToWorkbook(record)), type: XLSX_MIME }); }
    catch (e) { console.warn('엑셀을 만들지 못했어요', e); }
  }
  return saveFiles(files);
}

/** 연결한 폴더의 기록 파일 목록 (권한이 없으면 묻는다 → 클릭에서 부를 것) */
export async function listFolderRecords({ ask = true } = {}) {
  const dir = await getFolder();
  if (!dir) return { ok: false, reason: 'none', files: [] };
  if ((await permission(dir, ask)) !== 'granted') return { ok: false, reason: 'denied', name: dir.name, files: [] };
  const files = [];
  for await (const [name, h] of dir.entries()) {
    if (h.kind !== 'file' || !/\.(json|xlsx)$/i.test(name)) continue;
    try { const f = await h.getFile(); files.push({ name, size: f.size, lastModified: f.lastModified, file: f }); } catch {}
  }
  files.sort((a, b) => b.lastModified - a.lastModified);
  return { ok: true, name: dir.name, files };
}

// ---------- 읽기·검사 ----------
/** 기록 객체 검사·정리. 아니면 Error */
export function validateRecord(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== APP) throw new Error('즐거운 퀴즈 기록 파일이 아니에요.');
  if (num(obj.v, 0) > VERSION) throw new Error('더 새로운 버전에서 만든 기록이에요. 프로그램을 업데이트해 주세요.');
  if (!Array.isArray(obj.questions) || !Array.isArray(obj.answers)) throw new Error('기록 파일 내용이 망가졌어요.');
  if (obj.questions.length > LIMIT.questions || obj.answers.length > LIMIT.answers) throw new Error('기록이 너무 커요.');
  const rec = buildRecord({ ...obj, log: obj.answers, id: obj.id || randomId() });
  // buildRecord 는 시간 없으면 지금을 넣으므로 원래 값 유지
  if (!iso(obj.startedAt) && !rec.answers.length) rec.startedAt = '';
  return rec;
}
/** 파싱된 JSON → 기록 배열 (묶음 파일이면 여러 개) */
export function recordsFromJSON(obj) {
  if (obj && obj.app === APP && obj.kind === 'bundle') {
    if (!Array.isArray(obj.sessions) || obj.sessions.length > 200) throw new Error('기록 묶음 파일이 망가졌어요.');
    return obj.sessions.map(validateRecord);
  }
  return [validateRecord(obj)];
}
/**
 * 파일(File/Blob) → 기록 배열. .json(기록 또는 묶음) 과 이 앱이 만든 .xlsx(숨김 원본 시트) 를 읽는다.
 */
export async function readRecordFile(file) {
  if (!file) throw new Error('파일이 없어요.');
  if (file.size > LIMIT.fileBytes) throw new Error('파일이 너무 커요.');
  const name = String(file.name || '');
  if (/\.xlsx$/i.test(name)) {
    const X = globalThis.XLSX;
    if (!X) throw new Error('엑셀 도구를 불러오지 못했어요.');
    const wb = X.read(new Uint8Array(await file.arrayBuffer()), { type: 'array', sheets: RAW_SHEET });
    const ws = wb.Sheets[RAW_SHEET];
    if (!ws) throw new Error('즐거운 퀴즈가 저장한 엑셀이 아니에요. JSON 기록 파일을 열어 주세요.');
    const rows = X.utils.sheet_to_json(ws, { header: 1, raw: true });
    const json = rows.slice(1).map(r => String(r?.[0] ?? '')).join('');
    let obj; try { obj = JSON.parse(json); } catch { throw new Error('엑셀 안의 기록 원본이 망가졌어요.'); }
    return recordsFromJSON(obj);
  }
  let obj;
  try { obj = JSON.parse(await file.text()); } catch { throw new Error('JSON 파일을 읽지 못했어요.'); }
  return recordsFromJSON(obj);
}

// ---------- 게임 중 임시 보관 (이 기기 localStorage) ----------
const DRAFT_PREFIX = 'jq_draft:', LIVE = DRAFT_PREFIX + 'live', DRAFT_TTL = 7 * 864e5;
const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const countAns = d => (d?.answers || d?.log || []).length;
const sameGame = (a, b) => String(a?.title ?? '') === String(b?.title ?? '') && countAns(b) >= countAns(a);
/**
 * 게임 중 기록 임시 보관. 진행 중인 게임은 한 칸('live')에 덮어쓴다
 * (teacher.js 가 응답마다 buildRecord 를 새로 불러 id 가 매번 달라도 괜찮게).
 * 앞 게임을 clear 하지 않은 채 새 게임(제목이 다르거나 응답 수가 줄어듦)이 시작되면 앞 것은 따로 보관한다.
 */
export const liveDraft = {
  /** 진행 중 기록(기록 객체 또는 buildRecord 입력 형태)을 저장. 성공하면 true */
  save(partial) {
    const s = ls(); if (!s || !partial) return false;
    const put = () => s.setItem(LIVE, JSON.stringify({ savedAt: Date.now(), data: partial }));
    try {
      const old = JSON.parse(s.getItem(LIVE) || 'null');
      if (old?.data && countAns(old.data) > 0 && !sameGame(old.data, partial)) s.setItem(DRAFT_PREFIX + 'old-' + (old.savedAt || Date.now()), JSON.stringify(old));
    } catch {}
    try { put(); return true; } catch {
      dropOldestDraft(LIVE); // 자리가 모자라면 가장 오래된 다른 임시 기록을 지우고 한 번 더
      try { put(); return true; } catch { return false; }
    }
  },
  /** 진행 중 기록 (id 를 주면 listDrafts 의 그 기록). 없으면 null */
  load(id) {
    const s = ls(); if (!s) return null;
    try { const v = JSON.parse(s.getItem(id ? DRAFT_PREFIX + id : LIVE) || 'null'); return v ? v.data : null; } catch { return null; }
  },
  /** 진행 중 기록 지우기 (게임 기록을 파일로 저장한 뒤). id 를 주면 그 기록 */
  clear(id) { const s = ls(); try { s?.removeItem(id ? DRAFT_PREFIX + id : LIVE); } catch {} },
};
/** 보관 중인 임시 기록 목록 [{id, title, savedAt, answers, data}] (최근 순) */
export function listDrafts() {
  const s = ls(); if (!s) return [];
  pruneDrafts(DRAFT_TTL);
  const out = [];
  try {
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i); if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      const v = JSON.parse(s.getItem(k) || 'null'); if (!v?.data) continue;
      const d = v.data;
      out.push({ id: k.slice(DRAFT_PREFIX.length), title: d.title || '퀴즈', savedAt: v.savedAt, answers: (d.answers || d.log || []).length, players: (d.players || []).length, data: d });
    }
  } catch {}
  return out.sort((a, b) => b.savedAt - a.savedAt);
}
/** 임시 기록 → 정식 기록 객체 */
export function draftToRecord(data) {
  if (data?.app === APP) return validateRecord(data);
  return buildRecord(data);
}
function pruneDrafts(maxAge) {
  const s = ls(); if (!s) return;
  try {
    const now = Date.now(), del = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i); if (!k || !k.startsWith(DRAFT_PREFIX)) continue;
      const v = JSON.parse(s.getItem(k) || 'null');
      if (!v || now - (v.savedAt || 0) > maxAge) del.push(k);
    }
    del.forEach(k => s.removeItem(k));
  } catch {}
}
function dropOldestDraft(keep) {
  const s = ls(); if (!s) return;
  try {
    let old = null, oldT = Infinity;
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i); if (!k || !k.startsWith(DRAFT_PREFIX) || k === keep) continue;
      const t = JSON.parse(s.getItem(k) || 'null')?.savedAt || 0;
      if (t < oldT) { oldT = t; old = k; }
    }
    if (old) s.removeItem(old);
  } catch {}
}
