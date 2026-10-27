// 선생님 셸 v0.2: 퀴즈 세트 보관함 → 세트 편집 → 게임 고르기 → 설정 → 대기실(TV) → 진행 → 결과·저장
import { $, $$, esc, store, toast, connect, emit, avatarHTML, sound, music, showQuiz, qrSVG, pct, fx, session as sstore, onImgFail } from './common.js';
import { MODES, MODE, defaults } from './modes/info.js';
import { buildRecord, saveRecord, chooseFolder, folderInfo, liveDraft } from './record.js';

const socket = connect();
let room = null, session = store.get('jq_teacher', null), questionsSrv = [], log = [], feed = [], ranking = null, startedAt = 0;
let mode = store.get('jq_mode', 'live');
let allSettings = store.get('jq_settings', {});
let nickMode = store.get('jq_nick', false);
let unmount = null, mounting = false, buffer = [];
const handlers = new Map(), roomFns = new Set(), logFns = new Set(), feedFns = new Set();
let lastRecord = null, saved = false, info = { pinRequired: false };
const events = []; // 연구용 협력 기록 (모드가 api.event 로 보냄)
// ---------- 교사의 눈: 살펴볼 학생·모둠 알림 (선생님 연구 프로토타입 기준값) ----------
const ALERT = { stuckMin: 4, failStreak: 2, lowShare: .15, dominance: .5, max: 12, cooldown: 5 * 60e3 };
let alerts = [], alertSeen = new Map(), alertTimer = 0;
const nameOf = pid => { const p = room?.players.find(x => x.pid === pid); return p ? (p.realName || p.name) : '학생'; };
function raise(key, type, text, pid = null, team = null) {
  const now = Date.now();
  // 연구 기준: 차시당 12건 이하 → 게임 전체에서 12건까지, 같은 학생·종류는 5분에 한 번
  if (alerts.length >= ALERT.max || now - (alertSeen.get(key) || 0) < ALERT.cooldown) return;
  alertSeen.set(key, now);
  const a = { id: key + now, type, text, pid, team, t: now, done: false };
  alerts.unshift(a); events.push({ t: now, type: 'alert', pid, team, data: { kind: type } });
  renderAlerts(); fx.light($('#p-alerts'));
}
function checkAlerts() {
  if (!room || room.state !== 'play') return;
  const now = Date.now(), selfPaced = !['live', 'royale'].includes(room.mode);
  const by = new Map(); for (const l of log) { if (!by.has(l.pid)) by.set(l.pid, []); by.get(l.pid).push(l); }
  for (const p of room.players) {
    if (!p.online) continue;
    const ls = by.get(p.pid) || [];
    const lastN = ls.slice(-ALERT.failStreak);
    if (lastN.length === ALERT.failStreak && lastN.every(l => !l.ok)) raise(`${p.pid}:fail`, 'fail', `${nameOf(p.pid)}: 연속 ${ALERT.failStreak}번 틀렸어요. 해설을 같이 봐 주세요.`, p.pid);
    const lastT = ls.length ? ls[ls.length - 1].t : startedAt;
    if (selfPaced && startedAt && now - lastT > ALERT.stuckMin * 60e3) raise(`${p.pid}:stuck`, 'stuck', `${nameOf(p.pid)}: ${ALERT.stuckMin}분째 답이 없어요.`, p.pid);
  }
  if (room.teamCount) for (let k = 0; k < room.teamCount; k++) {
    const mem = room.players.filter(p => p.team === k);
    const cnt = mem.map(p => (by.get(p.pid) || []).filter(l => l.ok).length), tot = cnt.reduce((a, b) => a + b, 0);
    const tn = room.teams?.[k]?.name || `${k + 1}`;
    mem.forEach((p, i) => {
      if (tot >= 8 && mem.length > 2 && cnt[i] / tot > ALERT.dominance) raise(`${p.pid}:dom`, 'dominance', `${tn} 모둠: ${nameOf(p.pid)}이(가) 혼자 많이 풀고 있어요. 역할을 바꿔 보세요.`, p.pid, k);
      if (tot >= 10 && p.online && cnt[i] / tot < ALERT.lowShare) raise(`${p.pid}:low`, 'lowShare', `${tn} 모둠: ${nameOf(p.pid)}의 기여가 적어요. 함께 풀도록 도와주세요.`, p.pid, k);
    });
  }
}
function renderAlerts() {
  const open = alerts.filter(a => !a.done);
  $('#p-alert-n').textContent = open.length;
  $('#p-alerts').classList.toggle('lemon', open.length > 0);
  $('#alert-list').innerHTML = alerts.length ? alerts.map(a => `<div class="alert ${a.done ? 'done' : ''} k-${a.type}"><span>${esc(a.text)}</span>
    ${a.done ? '<small>확인함</small>' : `<button class="btn sm mint" data-id="${esc(a.id)}">가 봤어요</button>`}</div>`).join('') : '<p class="muted">지금은 알림이 없어요.</p>';
  $$('#alert-list [data-id]').forEach(b => b.onclick = () => {
    const a = alerts.find(x => x.id === b.dataset.id); if (!a) return;
    a.done = true; events.push({ t: Date.now(), type: 'teacher', pid: a.pid, team: a.team, data: { action: 'visit', kind: a.type, delay: Date.now() - a.t } }); renderAlerts();
  });
}
$('#p-alerts').onclick = () => { $('#alerts').hidden = !$('#alerts').hidden; };
$('#al-close').onclick = () => { $('#alerts').hidden = true; };

function show(name) {
  $$('.main > .screen').forEach(s => s.classList.toggle('on', s.id === 's-' + name));
  document.body.classList.toggle('playing', name === 'play');
  document.body.classList.toggle('lobbying', name === 'lobby');
  $$('.rail-btn[data-go]').forEach(b => b.classList.toggle('on', b.dataset.go === (name === 'editor' ? 'library' : name)));
  window.scrollTo(0, 0);
}
$$('.rail-btn[data-go]').forEach(b => b.onclick = () => { if (b.dataset.go === 'picker') openPicker(); else { saveCurrent(); renderLibrary(); show('library'); } });

// ================= 세트 보관함 (이 컴퓨터 브라우저에 저장) =================
const SAMPLE_ROWS = [
  ['자갈, 모래, 진흙 등이 쌓여 층을 이룬 것은?', '지층', '화산', '빙하', '사막', '지층은 여러 겹의 층으로 이루어져 있어요.'],
  ['지층에서 보통 아래에 있는 층이 먼저 쌓였다.', 'O', '', '', '', '아래층이 먼저, 위층이 나중에 쌓여요.'],
  ['알갱이가 주로 진흙으로 된 퇴적암은?', '이암', '사암', '역암', '현무암', ''],
  ['알갱이가 주로 모래로 된 퇴적암은?', '사암', '이암', '역암', '화강암', ''],
  ['자갈이 많이 섞여 있는 퇴적암의 이름은?', '역암', '', '', '', '자갈 역(礫) 자를 써요.'],
  ['옛날에 살았던 생물의 몸체나 흔적이 남은 것은?', '화석', '지층', '퇴적암', '광물', ''],
  ['나뭇잎 화석을 보고 알 수 있는 것은?', '그곳이 옛날에 육지였다', '그곳이 옛날에 바다였다', '그곳이 화산이었다', '아무것도 알 수 없다', '나무는 육지에서 자라요.'],
  ['삼엽충 화석이 나온 곳은 옛날에 바다였다.', 'O', '', '', '', '삼엽충은 바다에 살았어요.'],
  ['화석은 어떤 암석에서 주로 발견될까요?', '퇴적암', '화성암', '변성암', '현무암', ''],
  ['공룡 발자국도 화석이 될 수 있다.', 'O', '', '', '', '생물의 흔적도 화석이에요.'],
  ['퇴적물이 쌓이고 눌려 단단하게 굳어진 암석은?', '퇴적암', '', '', '', ''],
  ['지층이 휘어지거나 끊어진 것을 보고 알 수 있는 것은?', '큰 힘을 받았다', '비가 많이 왔다', '바람이 불었다', '생물이 살았다', ''],
].map(a => ({ q: a[0], a: a[1], w1: a[2], w2: a[3], w3: a[4], ex: a[5] }));
const COVERS = ['#FFFFFF', '#D6E7FF', '#FFE0E8', '#E3FAF1', '#EDE6FF', '#FFF4B8'];
const newId = () => Math.random().toString(36).slice(2, 10);
function loadSets() {
  let list = store.get('jq_sets2', null);
  if (!list) { // 예전 버전에서 옮기기
    list = [];
    const old = store.get('jq_sets', {});
    for (const [name, s] of Object.entries(old)) list.push({ id: newId(), title: s.title || name, rows: s.rows || [], updatedAt: s.at || Date.now() });
    const rows = store.get('jq_rows', []);
    if (rows?.length) list.push({ id: newId(), title: store.get('jq_title', '') || '이어서 만들던 세트', rows, updatedAt: Date.now() });
    store.set('jq_sets2', list);
  }
  return list;
}
let sets = loadSets(), cur = null; // cur = 편집 중인 세트
const saveSets = () => { if (!store.set('jq_sets2', sets)) toast('브라우저 저장 공간이 부족해요. 엑셀로 저장해 두세요.', 3500); };
const qCount = rs => rs.filter(r => ['mc', 'short', 'ox'].includes(rowState(r))).length;
function renderLibrary() {
  const card = (s, i) => `<div class="set" style="--cover:${COVERS[i % COVERS.length]}" data-id="${s.id}">
    <div class="label"><h3>${esc(s.title || '제목 없는 세트')}</h3><div class="meta">문제 ${qCount(s.rows)}개 · ${new Date(s.updatedAt).toLocaleDateString('ko-KR')}</div></div>
    <div class="acts"><button class="btn sm mint" data-act="play">게임 열기</button><button class="btn sm" data-act="edit">편집</button>
      <button class="btn sm ghost" data-act="dup" title="복사본 만들기">복제</button><button class="btn sm ghost" data-act="del" title="지우기">🗑</button></div></div>`;
  $('#sets').innerHTML = `<div class="set sample" data-id="sample"><div class="tape"></div>
      <div class="label"><h3>예시 · 4학년 과학 지층과 화석</h3><div class="meta">문제 ${SAMPLE_ROWS.length}개 · 처음이라면 이걸로 해 보세요</div></div>
      <div class="acts"><button class="btn sm mint" data-act="play">게임 열기</button><button class="btn sm" data-act="dup">내 세트로 복사</button></div></div>`
    + [...sets].sort((a, b) => b.updatedAt - a.updatedAt).map(card).join('')
    + '<button class="set add" id="lib-add">+ 새 세트</button>';
  $('#lib-add').onclick = () => newSet();
  $$('#sets .set[data-id]').forEach(el => el.addEventListener('click', e => {
    const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
    const id = el.dataset.id, s = id === 'sample' ? { id: 'sample', title: '4학년 과학 · 지층과 화석', rows: SAMPLE_ROWS } : sets.find(x => x.id === id);
    if (!s) return;
    if (act === 'play') { openSet(s); openPicker(); }
    else if (act === 'edit') openSet(s, true);
    else if (act === 'dup') { const c = { id: newId(), title: s.title + (id === 'sample' ? '' : ' (복사본)'), rows: JSON.parse(JSON.stringify(s.rows)), updatedAt: Date.now() }; sets.push(c); saveSets(); renderLibrary(); fx.medium(el, '복사!'); }
    else if (act === 'del' && confirm(`"${s.title}" 세트를 지울까요? 되돌릴 수 없어요.`)) { sets = sets.filter(x => x.id !== id); saveSets(); renderLibrary(); }
  }));
}
function newSet(rowsIn = [], title = '') {
  const s = { id: newId(), title, rows: rowsIn, updatedAt: Date.now() };
  sets.push(s); saveSets(); openSet(s, true); setTimeout(() => $('#title').focus(), 50); return s;
}
function openSet(s, edit = false) {
  cur = s; rows = s.rows.map(r => ({ ...blank(), ...r }));
  $('#title').value = s.title || '';
  store.set('jq_cur', s.id);
  if (edit) { renderRows(); show('editor'); }
}
function saveCurrent() {
  if (!cur || cur.id === 'sample') return;
  cur.rows = rows.filter(filled); cur.title = $('#title').value.trim(); cur.updatedAt = Date.now(); saveSets();
}
let saveTimer = 0;
const queueSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveCurrent, 400); };
$('#lib-new').onclick = () => newSet();
$('#lib-ai').onclick = () => { newSet(); openAI(); };
$('#lib-file').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const got = await readQuestionFile(f); if (got?.length) { newSet(got, f.name.replace(/\.[^.]+$/, '')); toast(`문제 ${got.length}개를 가져왔어요. 정답을 한 번 확인해 주세요.`, 3200); } };
$('#ed-back').onclick = () => { saveCurrent(); renderLibrary(); show('library'); };
$('#title').oninput = queueSave;

// ================= 문제 표 =================
const COLS = ['q', 'a', 'w1', 'w2', 'w3', 'ex'];
const PH = { q: '문제를 입력하세요', a: '정답', w1: '', w2: '', w3: '', ex: '' };
const blank = () => ({ q: '', a: '', w1: '', w2: '', w3: '', ex: '' });
let rows = [];
const filled = r => COLS.some(c => String(r[c] || '').trim());
const padRows = () => { while (rows.length < 5 || filled(rows[rows.length - 1])) rows.push(blank()); };
const isOX = s => /^(o|x|○|×)$/i.test(String(s).trim());
function rowState(r) {
  if (!filled(r)) return '';
  if (!String(r.q).trim()) return 'noq';
  if (!String(r.a).trim()) return 'noa';
  if ([r.w1, r.w2, r.w3].some(w => String(w ?? '').trim())) return 'mc';
  return isOX(r.a) ? 'ox' : 'short';
}
const TYPE = { mc: '<span class="tag mc">객관식</span>', short: '<span class="tag short">단답형</span>', ox: '<span class="tag ox">OX</span>', noq: '<span class="tag bad">문제 없음</span>', noa: '<span class="tag bad">정답 없음</span>', '': '' };
const toQ = r => ({ q: String(r.q).trim(), answers: String(r.a).split('/').map(s => s.trim()).filter(Boolean), wrong: [r.w1, r.w2, r.w3].map(w => String(w ?? '').trim()).filter(Boolean), explain: String(r.ex ?? '').trim() });
const questions = () => rows.filter(r => ['mc', 'short', 'ox'].includes(rowState(r))).map(toQ);
const tbody = $('#q-rows');
let selRow = 0;
function renderRows() {
  padRows();
  tbody.innerHTML = rows.map((r, i) => `<tr data-i="${i}"><td class="n">${i + 1}</td>${COLS.map(c =>
    `<td><input data-c="${c}" value="${esc(r[c])}" placeholder="${PH[c]}" autocomplete="off" maxlength="${c === 'q' || c === 'ex' ? 300 : 80}" aria-label="${i + 1}번 ${{ q: '문제', a: '정답', w1: '오답1', w2: '오답2', w3: '오답3', ex: '해설' }[c]}"></td>`).join('')}<td class="type"></td><td><button class="del" title="이 줄 지우기" aria-label="${i + 1}번 줄 지우기">✕</button></td></tr>`).join('');
  refreshQ();
}
function refreshQ() {
  const cnt = { mc: 0, short: 0, ox: 0, bad: 0 };
  $$('tr', tbody).forEach(tr => {
    const st = rowState(rows[+tr.dataset.i]);
    tr.querySelector('.type').innerHTML = TYPE[st];
    tr.classList.toggle('bad', st === 'noq' || st === 'noa');
    tr.classList.toggle('sel', +tr.dataset.i === selRow);
    if (st === 'noq' || st === 'noa') cnt.bad++; else if (st) cnt[st]++;
  });
  const n = cnt.mc + cnt.short + cnt.ox;
  $('#q-count').textContent = `문제 ${n}개`;
  $('#q-summary').textContent = `객관식 ${cnt.mc} · 단답형 ${cnt.short} · OX ${cnt.ox}${cnt.bad ? ` · 고칠 줄 ${cnt.bad}` : ''}`;
  renderPreview(); queueSave();
}
function renderPreview() {
  const r = rows[selRow], st = r && rowState(r);
  if (!r || !['mc', 'short', 'ox'].includes(st)) { $('#preview').innerHTML = '<p class="muted small">문제 줄을 누르면 학생 화면이 여기에 보여요.</p>'; return; }
  const Q = toQ(r), ox = st === 'ox';
  const choices = st === 'mc' ? [Q.answers[0], ...Q.wrong] : ox ? ['O', 'X'] : null;
  $('#preview').innerHTML = `<div class="quiz"><div class="qtext">${esc(Q.q)}</div>${choices ? `<div class="choices">${choices.map((c, i) =>
    `<div class="choice k${ox ? (c === 'O' ? 3 : 0) : i} ${ox ? 'ox' : ''}">${ox ? (c === 'O' ? '⭕' : '❌') : esc(c)}</div>`).join('')}</div>`
    : '<div class="short-row"><input class="input" disabled placeholder="답을 써요"><span class="btn blue">확인</span></div>'}</div>
    <p class="note">${st === 'mc' ? '보기 순서는 학생마다 섞여요.' : st === 'short' ? '태블릿에서는 보기 4개로 바뀌어 나와요.' : ''}${Q.answers.length > 1 ? ` 인정하는 답: ${Q.answers.map(esc).join(', ')}` : ''}</p>`;
}
tbody.addEventListener('focusin', e => { const tr = e.target.closest('tr'); if (tr && +tr.dataset.i !== selRow) { selRow = +tr.dataset.i; $$('tr', tbody).forEach(t => t.classList.toggle('sel', t === tr)); renderPreview(); } });
tbody.addEventListener('input', e => {
  const inp = e.target.closest('input'); if (!inp) return;
  const i = +inp.closest('tr').dataset.i; rows[i][inp.dataset.c] = inp.value;
  if (i === rows.length - 1 && filled(rows[i])) { rows.push(blank()); renderKeepFocus(inp); return; }
  refreshQ();
});
function renderKeepFocus(inp) {
  const i = inp.closest('tr').dataset.i, c = inp.dataset.c, pos = inp.selectionStart;
  renderRows();
  const n = $(`tr[data-i="${i}"] input[data-c="${c}"]`, tbody); n?.focus(); n?.setSelectionRange(pos, pos);
}
tbody.addEventListener('click', e => { const b = e.target.closest('.del'); if (!b) return; rows.splice(+b.closest('tr').dataset.i, 1); renderRows(); });
tbody.addEventListener('paste', e => {
  const inp = e.target.closest('input'); if (!inp) return;
  const text = e.clipboardData.getData('text/plain');
  if (!text.includes('\t') && !text.includes('\n')) return;
  e.preventDefault();
  const grid = parseTSV(text);
  if (grid.length && looksHeader(grid[0])) grid.shift();
  const start = +inp.closest('tr').dataset.i, c0 = COLS.indexOf(inp.dataset.c);
  grid.forEach((cells, k) => { const r = rows[start + k] || (rows[start + k] = blank()); cells.forEach((v, j) => { const c = COLS[c0 + j]; if (c) r[c] = String(v).trim(); }); });
  renderRows(); toast(`${grid.length}줄을 넣었어요.`);
});
$$('#add1, #add5').forEach(b => b.onclick = () => { for (let i = 0; i < (b.id === 'add1' ? 1 : 5); i++) rows.push(blank()); renderRows(); });
$('#btn-clear').onclick = () => { if (confirm('이 세트의 문제를 모두 지울까요?')) { rows = []; renderRows(); } };
function parseTSV(text) {
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"' && cell === '') q = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some(c => c.trim())) out.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.some(c => c.trim())) out.push(row);
  return out;
}
const looksHeader = r => r.some(c => /^\s*(문제|question)\s*$/i.test(c)) && r.some(c => /정답|answer/i.test(c));

// ---------- 엑셀 ----------
const HEAD = ['문제', '정답', '오답1', '오답2', '오답3', '해설'];
const safe = s => String(s).replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 40) || '문제';
function writeXlsx(data, name) {
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 46 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 36 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '문제'); XLSX.writeFile(wb, name);
}
$('#btn-tpl').onclick = () => writeXlsx([HEAD, ...SAMPLE_ROWS.slice(0, 4).map(r => COLS.map(c => r[c]))], '즐거운퀴즈_문제양식.xlsx');
$('#btn-down').onclick = () => {
  const qs = rows.filter(r => ['mc', 'short', 'ox'].includes(rowState(r)));
  if (!qs.length) return toast('저장할 문제가 없어요.');
  writeXlsx([HEAD, ...qs.map(r => COLS.map(c => r[c] || ''))], `즐거운퀴즈_${safe($('#title').value || '문제')}.xlsx`);
};
$('#file').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const got = await readQuestionFile(f); if (!got?.length) return;
  if (rows.some(filled) && !confirm(`문제 ${got.length}개를 찾았어요.\n[확인] 지금 문제 뒤에 붙이기 / [취소] 지금 문제를 바꾸기`)) rows = [];
  rows = rows.filter(filled).concat(got); renderRows();
  toast(`문제 ${got.length}개를 넣었어요. 정답을 한 번 확인해 주세요.`, 3200);
};
async function readQuestionFile(f) {
  if (f.size > 5e6) { toast('5MB보다 작은 파일만 올릴 수 있어요.'); return null; }
  try {
    let grid;
    if (/\.json$/i.test(f.name)) {
      const j = JSON.parse(await f.text()); const qs = Array.isArray(j) ? j : j.questions || [];
      grid = [HEAD, ...qs.map(q => [q.q, (q.answers || [q.a]).join('/'), ...(q.wrong || []).concat(['', '', '']).slice(0, 3), q.explain || ''])];
    } else if (/\.(csv|tsv|txt)$/i.test(f.name)) {
      const buf = await f.arrayBuffer(); let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('�')) text = new TextDecoder('euc-kr').decode(buf);
      const wb = XLSX.read(text.replace(/^﻿/, ''), { type: 'string', raw: true });
      grid = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
    } else {
      const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellFormula: false, cellHTML: false });
      const name = wb.SheetNames.find(n => /문제|quiz|question/i.test(n)) || wb.SheetNames[0];
      grid = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: false, defval: '' });
    }
    const got = gridToRows(grid);
    if (!got.length) toast('문제를 찾지 못했어요. 첫 줄이 "문제 | 정답 | 오답1…" 인지 확인해 주세요.', 3500);
    return got;
  } catch (err) { console.error(err); toast('파일을 읽지 못했어요. .xlsx 또는 .csv 파일인지 확인해 주세요.', 3500); return null; }
}
// 열 이름으로 찾기 (이 앱 양식 / 문제·정답·오답 5열 양식 / 보기1~4+정답 번호 양식)
function gridToRows(grid) {
  grid = grid.map(r => r.map(c => String(c ?? '').trim()));
  let hi = grid.slice(0, 15).findIndex(r => r.some(c => /^(문제|질문|question)/i.test(c)));
  let idx = { q: 0, a: 1, w1: 2, w2: 3, w3: 4, ex: 5 }, choices = null;
  if (hi >= 0) {
    const H = grid[hi], find = re => H.findIndex(c => re.test(c.replace(/\s/g, '')));
    idx = { q: find(/^(문제|질문|question)/i), a: find(/^(정답|답|answer|correct)/i), w1: find(/^오답1|^wrong1/i), w2: find(/^오답2|^wrong2/i), w3: find(/^오답3|^wrong3/i), ex: find(/^(해설|설명|explain)/i) };
    const b = [1, 2, 3, 4].map(n => find(new RegExp(`^(보기|선택지|option|answer)${n}$`, 'i')));
    if (b[0] >= 0 && b[1] >= 0) choices = b;
  } else hi = -1;
  const out = [];
  for (const r of grid.slice(hi + 1)) {
    const g = k => (idx[k] >= 0 ? r[idx[k]] || '' : '');
    if (!g('q')) continue;
    if (choices) {
      const opts = choices.map(i => (i >= 0 ? r[i] || '' : '')).filter(Boolean);
      const n = parseInt(g('a'), 10); const ans = n >= 1 && n <= opts.length ? opts[n - 1] : g('a');
      const wrong = opts.filter(o => o !== ans);
      if (opts.length === 2 && opts.every(isOX)) out.push({ q: g('q'), a: ans, w1: '', w2: '', w3: '', ex: g('ex') });
      else out.push({ q: g('q'), a: ans, w1: wrong[0] || '', w2: wrong[1] || '', w3: wrong[2] || '', ex: g('ex') });
    } else out.push({ q: g('q'), a: g('a'), w1: g('w1'), w2: g('w2'), w3: g('w3'), ex: g('ex') });
  }
  return out.slice(0, 300);
}

// ---------- AI 요청문 ----------
function aiPrompt() {
  const g = $('#ai-grade').value, s = $('#ai-subject').value, type = $('#ai-type').value, lv = $('#ai-level').value, wr = $('#ai-wrong').value;
  const n = Math.max(5, Math.min(60, Math.round(+$('#ai-count').value) || 20));
  const scope = $('#ai-scope').value.trim();
  const shape = { mc: `${n}문제 모두 보기 4개짜리 선택형`, mix: `선택형(보기 4개) 위주, 그중 4분의 1 정도는 O/X 문제`, mixshort: `선택형(보기 4개) 위주, 그중 4분의 1 정도는 한두 낱말로 답하는 문제`, short: `대부분 한두 낱말로 답하는 문제, 일부만 선택형` }[type];
  const level = { easy: '교과서의 기본 개념과 낱말을 확인하는 수준', mid: '단원 전체를 고르게 복습하는 수준', hard: '기본 문제에 더해 "왜 그럴까?"를 생각하거나 생활에 적용하는 문제를 3분의 1 정도 섞은 수준' }[lv];
  const wrongRule = wr === 'mis' ? '오답은 이 학년 아이들이 실제로 자주 하는 잘못된 생각(오개념)을 담아 그럴듯하게' : '오답은 정답과 비슷한 낱말로';
  return `[역할] 초등학교 ${g}학년 ${s} 수업을 준비하는 교사를 돕는 출제 도우미
[자료] 함께 올린 교과서·학습지 내용만 사용 (자료에 없는 사실은 만들지 않기)${scope ? `\n[범위] ${scope}` : ''}

[만들 것] 단원 정리 게임에 쓸 문제 ${n}개
- 모양: ${shape}
- 수준: ${level}
- ${wrongRule}. "모두 맞다/정답 없음" 같은 보기는 쓰지 않기
- 문제는 게임 중에 빨리 읽도록 한두 줄(40자 이내), ${g}학년이 아는 쉬운 말로
- 같은 내용을 두 번 묻지 않고 자료 전체에서 고르게
- 해설은 왜 그 답인지 아이 눈높이로 한 문장
- 학생 이름 등 개인정보는 넣지 않기

[결과 형식] 엑셀 파일(.xlsx), 시트 이름 '문제', 첫 줄 제목은 정확히:
문제 | 정답 | 오답1 | 오답2 | 오답3 | 해설
- 한 줄에 한 문제. 번호 열이나 다른 열은 만들지 않기
- O/X 문제: 정답 칸에 O 또는 X, 오답 칸은 비우기
- 짧은 답 문제: 오답 칸은 비우기. 같은 뜻의 답이 여럿이면 '/'로 나눠 적기 (예: 세종대왕/세종)
- 파일을 만들 수 없다면 같은 6칸 표만 보여 주기

마지막에 정답이 애매하거나 자료로 확인하기 어려운 문제 번호를 따로 알려 줘.`;
}
function openAI() { $('#ai-prompt').value = aiPrompt(); $('#ai-copied').textContent = ''; $('#ai-modal').hidden = false; }
$('#btn-ai').onclick = openAI;
$('#ai-close').onclick = () => { $('#ai-modal').hidden = true; };
$('#ai-modal').onclick = e => { if (e.target.id === 'ai-modal') $('#ai-modal').hidden = true; };
['#ai-grade', '#ai-subject', '#ai-count', '#ai-type', '#ai-scope', '#ai-level', '#ai-wrong'].forEach(id => $(id).addEventListener('input', () => { $('#ai-prompt').value = aiPrompt(); $('#ai-copied').textContent = ''; }));
$('#ai-copy').onclick = async () => {
  const text = $('#ai-prompt').value;
  try { await navigator.clipboard.writeText(text); } catch { const ta = $('#ai-prompt'); ta.focus(); ta.select(); document.execCommand('copy'); }
  $('#ai-copied').textContent = '복사했어요. AI 창에 붙여넣으세요.'; fx.light($('#ai-copy'));
};

// ================= 게임 고르기 =================
const NEW = new Set(['shop', 'fishing', 'raid', 'royale']);
function openPicker() {
  if (!cur) { const last = sets.find(s => s.id === store.get('jq_cur')) || null; if (last) openSet(last); else openSet({ id: 'sample', title: '4학년 과학 · 지층과 화석', rows: SAMPLE_ROWS }); }
  saveCurrent();
  const n = questions().length;
  $('#pk-set').textContent = `· ${$('#title').value || '제목 없는 세트'} (문제 ${n}개)`;
  const boxHTML = m => `<button class="box" data-id="${m.id}" style="--mc:${m.color}">
    <div class="art"><img src="assets/modes/${m.id}.png" alt="" data-em="${m.emoji}"></div>
    <div class="body"><span class="nm">${m.emoji} ${esc(m.name)}</span><span class="sh">${esc(m.short)}</span>
    <span class="tags">${m.coop ? '<span class="new">모둠 협력</span>' : NEW.has(m.id) ? '<span class="new">새 게임</span>' : ''}<span>${m.players}</span><span>${m.pace}</span><span>${m.when}</span></span></div></button>`;
  const has = m => !serverModes || serverModes.has(m.id); // 서버에 있는 게임만
  $('#modes').innerHTML = `<h2 class="box-sec">전통놀이 · 모둠 협력 <small>우리 반이 함께 도깨비에 도전해요</small></h2>${MODES.filter(m => m.trad && has(m)).map(boxHTML).join('')}
    <h2 class="box-sec">게임 모음</h2>${MODES.filter(m => !m.trad && has(m)).map(boxHTML).join('')}`;
  $$('#modes img[data-em]').forEach(img => onImgFail(img, () => { img.outerHTML = `<span class="em">${img.dataset.em}</span>`; }));
  $$('#modes .box').forEach(b => b.onclick = () => { mode = b.dataset.id; store.set('jq_mode', mode); fx.light(b); openSettings(); });
  show('picker');
}
$('#ed-play').onclick = () => { if (!questions().length) return toast('문제를 1개 이상 넣어 주세요.'); openPicker(); };
$('#pk-back').onclick = () => { if (cur?.id === 'sample') { renderLibrary(); show('library'); } else { renderRows(); show('editor'); } };
const curSettings = () => ({ ...defaults(mode), ...(allSettings[mode] || {}) });
function openSettings() {
  const M = MODE[mode], cs = curSettings();
  $('#sm-title').textContent = `${M.emoji} ${M.name}`;
  $('#sm-desc').textContent = M.teacher;
  const art = $('#sm-art'); art.hidden = false; art.src = `assets/modes/${M.id}.png`;
  onImgFail(art, () => { art.hidden = true; });
  $('#settings').innerHTML = M.settings.map(s => `<div class="setrow"><span>${esc(s.label)}</span>
    <div class="chips" data-k="${s.key}">${s.options.map(([v, l]) => `<button class="chip ${String(cs[s.key]) === String(v) ? 'on' : ''}" data-v='${JSON.stringify(v)}'>${esc(l)}</button>`).join('')}</div></div>`).join('');
  $$('#settings .chips').forEach(box => $$('.chip', box).forEach(c => c.onclick = () => {
    allSettings[mode] = { ...curSettings(), [box.dataset.k]: JSON.parse(c.dataset.v) }; store.set('jq_settings', allSettings);
    $$('.chip', box).forEach(x => x.classList.toggle('on', x === c));
  }));
  $$('#nick-chips .chip').forEach(c => { c.classList.toggle('on', (c.dataset.v === '1') === nickMode); c.onclick = () => { nickMode = c.dataset.v === '1'; store.set('jq_nick', nickMode); $$('#nick-chips .chip').forEach(x => x.classList.toggle('on', x === c)); }; });
  $('#sm-open').textContent = room && session && room.state !== 'play' ? '이 설정으로 바꾸기' : '방 열기';
  $('#set-modal').hidden = false;
}
$('#sm-cancel').onclick = () => { $('#set-modal').hidden = true; };
$('#set-modal').onclick = e => { if (e.target.id === 'set-modal') $('#set-modal').hidden = true; };
$('#sm-open').onclick = () => openRoom();

// ================= 방 =================
async function openRoom(pin = sstore.get('jq_pin', '')) {
  const qs = questions();
  if (!qs.length) return toast('문제를 1개 이상 넣어 주세요.', 3000);
  sound.unlock();
  $('#sm-open').disabled = true;
  const body = { title: $('#title').value.trim() || '우리 반 퀴즈', mode, settings: { ...curSettings(), nick: nickMode }, questions: qs, pin };
  let r;
  if (room && session && room.state !== 'play') r = await emit(socket, 't:update', body);
  else { r = await emit(socket, 't:create', body); if (!r.error) { session = { code: r.code, key: r.key }; store.set('jq_teacher', session); } }
  $('#sm-open').disabled = false;
  if (r.pin) { $('#set-modal').hidden = true; $('#pin-modal').hidden = false; $('#pin').value = ''; setTimeout(() => $('#pin').focus(), 50); return; }
  if (r.error) return toast(r.error, 3000);
  $('#set-modal').hidden = true;
  room = r.room; questionsSrv = r.questions || questionsSrv;
  openLobby();
}
$('#pin-form').onsubmit = e => { e.preventDefault(); const p = $('#pin').value.trim(); sstore.set('jq_pin', p); $('#pin-modal').hidden = true; openRoom(p); };
$('#pin-cancel').onclick = () => { $('#pin-modal').hidden = true; };

let base = null;
async function studentBase() {
  if (base) return base;
  base = location.origin + '/';
  try {
    info = await (await fetch('/api/info')).json();
    if (info.publicUrl) base = info.publicUrl;
    else if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && info.lan?.length) {
      base = info.lan[0]; $('#l-lan').textContent = info.lan.length > 1 ? `다른 주소: ${info.lan.slice(1).join(', ')} (같은 와이파이)` : '같은 와이파이에 연결된 기기에서 들어올 수 있어요.';
    }
  } catch {}
  return base;
}
async function openLobby() {
  show('lobby'); renderLobby();
  const b = await studentBase();
  $('#l-addr').textContent = b.replace(/^https?:\/\//, '').replace(/\/$/, '');
  $('#l-qr').innerHTML = qrSVG(`${b}?code=${room.code}`);
}
let crowdKeys = '';
function renderLobby() {
  if (!room) return;
  const M = MODE[room.mode];
  $('#l-code').textContent = room.code;
  $('#l-mode').textContent = `${M.emoji} ${M.name}`;
  $('#l-lock').textContent = room.locked ? '🔒 입장 잠김' : '🔓 입장 열림';
  $('#l-lock').classList.toggle('coral', !!room.locked);
  const ps = room.players, on = ps.filter(p => p.online);
  $('#l-count').textContent = on.length;
  const tc = room.teamCount || 0;
  $$('#l-teamcount .chip').forEach(c => c.classList.toggle('on', +c.dataset.n === tc));
  $('#l-shuffle').hidden = !tc;
  $('#l-teamhint').textContent = tc ? '학생 스티커를 누르면 다른 모둠으로 옮겨요.' : '모둠 게임(전통놀이·팀전)에서 쓰여요. 나중에 정해도 돼요.';
  const keys = tc + ':' + ps.map(p => p.pid + p.online + p.team + p.avatar?.char + p.avatar?.color + p.avatar?.hat).join();
  if (keys !== crowdKeys) {
    const had = new Set([...$$('#l-players .kid')].map(k => k.dataset.pid));
    crowdKeys = keys;
    const kid = p => `<div class="kid ${p.online ? '' : 'off'}" data-pid="${p.pid}" style="${had.has(p.pid) ? 'animation:none' : ''}">${avatarHTML(p.avatar, 'lg')}
      <span class="nm">${esc(p.name)}</span>${p.realName && p.realName !== p.name ? `<span class="real">${esc(p.realName)}</span>` : ''}<button class="x" data-pid="${p.pid}" title="내보내기" aria-label="${esc(p.realName || p.name)} 내보내기">✕</button></div>`;
    $('#l-players').classList.toggle('teamed', !!tc);
    $('#l-players').innerHTML = !ps.length ? '<div class="empty">학생들이 들어오면 여기에 스티커가 붙어요 ✨</div>'
      : tc ? room.teams.map((t, k) => `<div class="team-col" style="--tc:${t.color}"><div class="team-head"><img src="assets/trad/team_${t.id}.png" alt="" data-em="${t.emoji}"><b>${esc(t.name)} 모둠</b><small>${ps.filter(p => p.team === k).length}명</small></div>
          <div class="team-kids">${ps.filter(p => p.team === k).map(kid).join('')}</div></div>`).join('')
      : ps.map(kid).join('');
    $$('#l-players .team-head img').forEach(img => onImgFail(img, () => { img.outerHTML = `<span class="em">${img.dataset.em}</span>`; }));
    if (tc) $$('#l-players .kid').forEach(k => k.addEventListener('click', async e => {
      if (e.target.closest('.x')) return;
      const p = room.players.find(x => x.pid === k.dataset.pid); if (!p) return;
      await emit(socket, 't:setTeam', { pid: p.pid, team: ((p.team ?? -1) + 1) % tc });
    }));
    $$('#l-players .x').forEach(b => b.onclick = async () => { if (confirm('이 학생을 내보낼까요?')) await emit(socket, 't:kick', { pid: b.dataset.pid }); });
    if (ps.length > had.size && had.size) sound.play('join');
  }
  $('#l-start').disabled = !on.length;
  $('#l-start').textContent = on.length ? `${on.length}명과 게임 시작` : '게임 시작';
}
$('#l-back').onclick = () => { openPicker(); openSettings(); };
$$('#l-teamcount .chip').forEach(c => c.onclick = async () => { const r = await emit(socket, 't:teams', { count: +c.dataset.n }); if (r?.error) toast(r.error); else fx.light(c); });
$('#l-shuffle').onclick = async () => { await emit(socket, 't:teams', { count: room?.teamCount || 0, shuffle: true }); fx.light($('#l-shuffle')); };
$('#l-lock').onclick = async () => { const r = await emit(socket, 't:lock', { locked: !room?.locked }); if (r?.ok) toast(r.locked ? '이제 새 학생은 들어올 수 없어요.' : '다시 들어올 수 있어요.'); };
$('#l-music').onclick = () => { if (music.timer) music.stop(); else { sound.unlock(); music.start(120); } };
$('#l-full').onclick = $('#p-full').onclick = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.());
$('#l-start').onclick = async () => {
  sound.unlock(); music.stop();
  const r = await emit(socket, 't:start', {});
  if (r.error) return toast(r.error);
  startedAt = r.startedAt || Date.now(); log.length = 0; feed.length = 0; events.length = 0; ranking = null; saved = false; lastRecord = null;
  alerts = []; alertSeen = new Map(); renderAlerts();
  sound.play('go');
};

// ================= 진행 =================
async function mountPlay(snapshot = null) {
  if (unmount) { try { unmount(); } catch {} unmount = null; }
  show('play');
  const M = MODE[room.mode];
  $('#p-mode').textContent = `${M.emoji} ${M.name}`; $('#p-code').textContent = room.code;
  updatePlaybar();
  mounting = true;
  let mod;
  try { mod = await import(`./modes/${room.mode}.js`); } catch (e) { console.error(e); mounting = false; toast('게임 화면을 불러오지 못했어요. 새로고침 해 주세요.', 4000); return; }
  const el = $('#stage'); el.innerHTML = ''; el.className = 'mode-' + room.mode;
  try { unmount = mod.mountTeacher(el, makeCtx(snapshot)) || null; } catch (e) { console.error(e); toast('진행 화면을 여는 중 문제가 생겼어요.'); }
  mounting = false;
  const b = buffer; buffer = []; b.forEach(dispatch);
}
const dispatch = ([k, a]) => {
  if (k === 'm') handlers.get(a.type)?.forEach(f => f(a.data));
  else if (k === 'log') logFns.forEach(f => f(a));
  else if (k === 'feed') feedFns.forEach(f => f(a));
};
function makeCtx(snapshot) {
  return {
    socket, get room() { return room; }, snapshot, questions: questionsSrv, log, feed,
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type)?.delete(fn); },
    onRoom(fn) { roomFns.add(fn); return () => roomFns.delete(fn); },
    onLog(fn) { logFns.add(fn); return () => logFns.delete(fn); },
    onFeed(fn) { feedFns.add(fn); return () => feedFns.delete(fn); },
    send: (type, data) => emit(socket, 't:mode', { type, data }),
    end: () => emit(socket, 't:end', {}),
    sound, music, toast, showQuiz, fx,
  };
}
function updatePlaybar() {
  if (!room) return;
  $('#p-count').textContent = room.players.filter(p => p.online).length;
  const ok = log.filter(l => l.ok).length;
  $('#p-acc').textContent = log.length ? `✅ 정답률 ${pct(ok, log.length)}% (${log.length}번)` : '✅ -';
}
$('#p-end').onclick = async () => { if (confirm('게임을 끝내고 결과를 볼까요?')) await emit(socket, 't:end', {}); };

// ================= 결과 =================
const gameKey = () => `${room?.code}:${startedAt}`;
const savedKeys = () => store.get('jq_saved_games', []);
function makeRecord() {
  return buildRecord({
    title: room.title, unit: room.title, mode: room.mode, modeName: MODE[room.mode].name, settings: room.settings,
    questions: questionsSrv, players: room.players.map(p => ({ pid: p.pid, name: p.realName || p.name, team: p.team ?? null })), log, ranking: ranking || [],
    teams: room.teams || [], events,
    startedAt, endedAt: Date.now(),
  });
}
async function doSave(auto) {
  if (!lastRecord) return;
  try {
    const r = await saveRecord(lastRecord, { xlsx: true });
    saved = true; liveDraft.clear();
    store.set('jq_saved_games', [...savedKeys(), gameKey()].slice(-30));
    $('#r-save').className = 'save-box';
    $('#r-save').innerHTML = r.where === 'folder'
      ? `✅ <b>${esc(r.folderName)}</b> 폴더에 저장했어요: ${r.files.map(esc).join(', ')}`
      : `✅ 내려받기 폴더에 저장했어요: ${r.files.map(esc).join(', ')}<br><small>왼쪽 메뉴의 <b>💾 기록 폴더</b>를 연결하면 정한 폴더에 자동으로 모여요.</small>`;
  } catch (e) {
    console.error(e);
    $('#r-save').className = 'save-box warn';
    $('#r-save').innerHTML = auto ? '자동 저장을 하지 못했어요. <b>📥 결과 다시 저장</b>을 눌러 주세요.' : '저장하지 못했어요. 다시 눌러 주세요.';
  }
}
function showResult() {
  if (unmount) { try { unmount(); } catch {} unmount = null; }
  music.stop();
  show('result');
  const rk = ranking || [];
  const cx = rk[0]?.extra;
  const tail = cx?.classWin == null ? '' : cx.classWin ? ' · 🎉 우리 반 성공!' : room.mode === 'raid' ? ` · 보스 ${cx.bossesDown | 0}마리 처치` : ' · 다음엔 꼭!';
  $('#r-title').textContent = `${room.title} · ${MODE[room.mode].name}${tail}`;
  const ava = pid => room.players.find(p => p.pid === pid)?.avatar;
  const label = r => esc(r.name) + (r.nick ? ` <small class="muted">(${esc(r.nick)})</small>` : '');
  const coop = !!rk[0]?.extra?.noRank;
  $('#r-podium').hidden = coop; $('#r-coop-private').hidden = true;
  $('#r-board-title').textContent = coop ? '모둠이 함께 만든 결과' : '순위';
  if (coop) { renderCoopResult(rk, ava); } else {
  $('#r-podium').innerHTML = [rk[1], rk[0], rk[2]].map((r, k) => r ? `<div class="pod p${[2, 1, 3][k]}"><div class="who">${avatarHTML(ava(r.pid), 'lg')}${label(r)}</div><div class="block">${[2, 1, 3][k]}</div></div>` : '').join('');
  $('#r-board').innerHTML = rk.map(r => `<div class="brow ${r.rank <= 3 ? 'r' + r.rank : ''}"><span class="rk">${r.rank}</span>${avatarHTML(ava(r.pid), 'sm')}<span class="nm">${label(r)}</span>
    <span class="muted small">${r.extra?.teamName ? esc(r.extra.teamName) + ' · ' : ''}${r.extra?.correct != null ? `맞힘 ${r.extra.correct}${r.extra.answered != null ? '/' + r.extra.answered : ''}` : ''}</span><span class="sc">${(r.score || 0).toLocaleString()}</span></div>`).join('') || '<p class="muted">순위가 없어요.</p>';
  }
  const by = questionsSrv.map(q => ({ q, n: 0, ok: 0, wrong: Object.create(null) }));
  for (const l of log) { const s = by[l.qid]; if (!s) continue; s.n++; if (l.ok) s.ok++; else if (l.given) s.wrong[l.given] = (s.wrong[l.given] || 0) + 1; }
  const list = by.filter(s => s.n).sort((a, b) => a.ok / a.n - b.ok / b.n);
  $('#r-qstats').innerHTML = list.length ? list.map(s => {
    const w = Object.entries(s.wrong).sort((a, b) => b[1] - a[1])[0];
    return `<div class="qstat"><div>${esc(s.q.q)}<div class="wrongtop">${w ? `많이 고른 오답: ${esc(w[0])} (${w[1]}명)` : ''}</div></div>
      <div class="bar"><i style="width:${pct(s.ok, s.n)}%"></i></div><b>${pct(s.ok, s.n)}%</b></div>`;
  }).join('') : '<p class="muted">아직 응답이 없어요.</p>';
  if (!lastRecord) {
    lastRecord = makeRecord();
    try { localStorage.setItem('jq_last_record', JSON.stringify(lastRecord)); } catch {}
    if (log.length && store.get('jq_autosave', true)) doSave(true);
    else { $('#r-save').className = 'save-box warn'; $('#r-save').innerHTML = log.length ? '<b>📥 결과 다시 저장</b>을 눌러 선생님 컴퓨터에 보관하세요.' : '응답 기록이 없어요.'; }
  }
  if (coop) fx.heavy(rk[0]?.extra?.classWin ? '우리 반 성공!' : '다음엔 꼭!', rk[0]?.extra?.classWin ? '#2ED3A0' : '#3D8BFF');
  else if (rk[0]) fx.heavy(`1등 ${rk[0].name}`, '#FF6F61'); else sound.play('win');
}
$('#r-savebtn').onclick = () => doSave(false);
$('#r-analyze').onclick = () => { window.open('analyze.html?from=last', '_blank'); };
const unsavedOk = () => saved || !log.length || confirm('결과를 아직 저장하지 않았어요. 그래도 넘어갈까요?');
$('#r-again').onclick = async () => { if (!unsavedOk()) return; lastRecord = null; await emit(socket, 't:lobby', {}); openLobby(); };
$('#r-change').onclick = async () => { if (!unsavedOk()) return; lastRecord = null; await emit(socket, 't:lobby', {}); openPicker(); };
$('#r-new').onclick = async () => {
  if (!unsavedOk()) return;
  await emit(socket, 't:close', {}); room = null; session = null; store.del('jq_teacher'); lastRecord = null;
  renderLibrary(); show('library');
};

// ================= 기록 폴더 =================
async function refreshFolder() {
  try { const f = await folderInfo(); $('#btn-folder').hidden = !f.supported; $('#folder-name').textContent = f.name ? f.name : '연결 안 됨'; }
  catch { $('#btn-folder').hidden = true; }
}
$('#btn-folder').onclick = async () => { const r = await chooseFolder(); if (r?.ok) toast(`"${r.name}" 폴더에 수업 기록을 저장할게요.`, 3000); refreshFolder(); };

// ================= 소켓 =================
socket.on('room', r => {
  const prev = room?.state;
  room = r;
  roomFns.forEach(f => f(r));
  if (r.state === 'play' && prev !== 'play') { log.length = 0; feed.length = 0; mountPlay(); }
  else if (r.state === 'lobby' && $('#s-lobby').classList.contains('on')) renderLobby();
  else if (r.state === 'play') updatePlaybar();
});
socket.on('m', m => (mounting ? buffer.push(['m', m]) : dispatch(['m', m])));
socket.on('log', l => {
  log.push(l); updatePlaybar(); checkAlerts();
  if (log.length % 5 === 0) liveDraft.save(makeRecord());
  mounting ? buffer.push(['log', l]) : dispatch(['log', l]);
});
socket.on('evt', e => { if (events.length < 20000) events.push(e); if (e.type === 'reflect') renderReflect(); });
clearInterval(alertTimer); alertTimer = setInterval(checkAlerts, 10000);
socket.on('feed', f => { feed.push(f); mounting ? buffer.push(['feed', f]) : dispatch(['feed', f]); });
socket.on('end', d => { ranking = d.ranking; showResult(); });
socket.on('connect', async () => {
  if (!session) return;
  const r = await emit(socket, 't:rejoin', session);
  if (r.error) { if (r.error === 'gone') { session = null; store.del('jq_teacher'); room = null; } return; }
  room = r.room; questionsSrv = r.questions || [];
  if (room.startedAt) startedAt = room.startedAt;
  if (room.state === 'play') { log.splice(0, log.length, ...(r.log || [])); feed.splice(0, feed.length, ...(r.feed || [])); mountPlay(r.snapshot); }
  else if (room.state === 'end') {
    log.splice(0, log.length, ...(r.log || [])); ranking = r.ranking;
    if (!$('#s-result').classList.contains('on')) {
      const done = savedKeys().includes(gameKey());
      if (done) { saved = true; lastRecord = makeRecord(); }
      showResult();
      if (done) { $('#r-save').className = 'save-box'; $('#r-save').textContent = '이 게임 기록은 이미 저장했어요.'; }
    }
  } else if ($('#s-lobby').classList.contains('on') || $('#s-library').classList.contains('on')) {
    // 열려 있던 방이 있으면 대기실로 (편집 중이 아니면)
    const last = sets.find(s => s.id === store.get('jq_cur')); if (last && !cur) openSet(last);
    openLobby();
  }
});

// 시작
let serverModes = null;
fetch('/api/info').then(r => r.json()).then(i => { info = i; serverModes = new Set((i.modes || []).map(m => m.id)); }).catch(() => {});
renderLibrary(); refreshFolder();
window.addEventListener('beforeunload', e => { saveCurrent(); if (room?.state === 'play' || (lastRecord && !saved && log.length)) { e.preventDefault(); e.returnValue = ''; } });

// ---------- 협력 게임 결과: 모둠 단위로 (개인 기여는 선생님만 보기) ----------
function renderCoopResult(rk, ava) {
  const teams = room.teams || [];
  const byT = new Map(); for (const r of rk) { const k = r.extra?.team ?? -1; if (!byT.has(k)) byT.set(k, []); byT.get(k).push(r); }
  const win = rk[0]?.extra?.classWin;
  $('#r-board').innerHTML = `<div class="coop-sum ${win ? 'win' : ''}">${win ? '🎉 우리 반이 함께 성공했어요!' : '이번엔 아쉬워요. 다음엔 꼭!'}</div>` + [...byT.entries()].sort((a, b) => a[0] - b[0]).map(([k, rs]) => {
    const T = teams[k] || { name: '모둠', emoji: '👥', color: '#8FA3C4' };
    const tot = rs.reduce((a, r) => a + (r.extra?.contrib | 0), 0), joined = rs.filter(r => (r.extra?.contrib | 0) > 0).length;
    const maxShare = tot ? Math.max(...rs.map(r => (r.extra?.contrib | 0) / tot)) : 0;
    return `<div class="coop-team" style="--tc:${T.color}"><b>${T.emoji} ${esc(T.name)} 모둠</b>
      <span>함께 보탠 정답 <b>${tot}</b></span><span>참여 <b>${joined}/${rs.length}</b>명</span>
      <span class="${maxShare > .5 ? 'warn-t' : ''}">가장 많이 보탠 친구 몫 <b>${Math.round(maxShare * 100)}%</b></span>
      <div class="avs">${rs.map(r => `<span class="${(r.extra?.contrib | 0) ? '' : 'zero'}">${avatarHTML(ava(r.pid), 'sm')}</span>`).join('')}</div></div>`;
  }).join('') + `<button class="btn sm ghost" id="r-private">🔒 선생님만 보기: 학생별 기여</button><div class="reflect-sum" id="r-reflect"></div>`;
  $('#r-private').onclick = () => {
    const box = $('#r-coop-private'); box.hidden = !box.hidden;
    box.innerHTML = rk.map(r => `<div class="brow"><span class="nm">${esc(r.name)}${r.nick ? ` <small class="muted">(${esc(r.nick)})</small>` : ''}</span>
      <span class="muted small">${esc(r.extra?.teamName || '')}</span><span class="sc">${r.extra?.contrib | 0}번 · ${Math.round((r.extra?.share || 0) * 100)}%</span></div>`).join('');
  };
  renderReflect();
}
function renderReflect() {
  const box = $('#r-reflect'); if (!box) return;
  const L = { great: '😄 많이', good: '🙂 조금', little: '😅 아쉬움', next: '💪 다음엔 더' };
  const c = Object.create(null); for (const e of events) if (e.type === 'reflect') c[e.data?.v] = (c[e.data?.v] || 0) + 1;
  const n = Object.values(c).reduce((a, b) => a + b, 0);
  box.innerHTML = `<h3>학생 성찰 (모둠에 보탠 몫) <small class="muted">${n}명 응답</small></h3>` + Object.entries(L).map(([k, t]) => `<span class="chip">${t} <b>${c[k] || 0}</b></span>`).join(' ')
    + (n && lastRecord ? ' <button class="btn sm" id="r-resave">성찰까지 넣어 다시 저장</button>' : '');
  const rb = $('#r-resave'); if (rb) rb.onclick = () => { lastRecord = makeRecord(); doSave(false); };
}
