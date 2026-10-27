// 카트 레이스 시험장: 서버 없이 가짜 ctx + 봇으로 학생/교사 화면을 띄운다.
// 주소: /dev/race-test.html?view=student|teacher&touch=1&bots=15&track=0&laps=2&gates=3&stamps=2
import { showQuiz, sound, music, toast, h, esc, FACES, COLORS, soundButton } from '../js/common.js';
import { mountStudent, mountTeacher } from '../js/modes/race.js';
import { buildTrack, TRACKS } from '../js/race/tracks.js';

const P = new URLSearchParams(location.search);
const view = P.get('view') || 'student';
const touch = P.get('touch') === '1';
const S = { track: +(P.get('track') ?? 0), laps: +(P.get('laps') || 2), gates: +(P.get('gates') ?? 3), stamps: +(P.get('stamps') ?? 2), items: true, boxes: P.get('boxes') !== '0', finishPct: 50 };
const BOTS = +(P.get('bots') || (view === 'teacher' ? 30 : 15));
const tr = buildTrack(S.track);
const NAMES = ['민지', '서준', '하윤', '도윤', '지우', '시우', '서아', '하준', '아린', '은우', '수아', '지호', '예린', '건우', '유나', '현우', '채원', '우진', '다은', '준서', '소율', '태오', '나은', '로운', '하린', '이안', '윤서', '선우', '지안', '도하', '세아', '주원', '가은', '연우', '루아', '시윤', '봄', '한결', '별', '솔'];

const sel = document.getElementById('trk');
sel.innerHTML = TRACKS.map((t, i) => `<option value="${i}" ${i === S.track ? 'selected' : ''}>${t.emoji} ${t.name}</option>`).join('');
sel.onchange = () => { P.set('track', sel.value); location.search = P.toString(); };
soundButton();

// ---------- 가짜 문제 ----------
const QS = [
  { q: '우리나라의 수도는?', a: '서울', wrong: ['부산', '대구', '광주'] },
  { q: '3 × 4 = ?', a: '12', wrong: ['7', '10', '14'] },
  { q: '물은 100℃에서 끓는다', a: 'O', wrong: [] },
  { q: '해는 서쪽에서 뜬다', a: 'X', wrong: [] },
  { q: '무지개 색깔은 몇 가지?', a: '7', wrong: ['5', '6', '8'] },
  { q: '한글을 만든 임금은? (단답)', a: '세종대왕', wrong: [] },
  { q: '거미 다리는 몇 개?', a: '8', wrong: ['6', '4', '10'] },
  { q: '12 ÷ 3 = ?', a: '4', wrong: ['3', '5', '6'] },
];
let qi = 0;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
function nextView() {
  const Q = QS[qi++ % QS.length];
  const ox = !Q.wrong.length && /^[OX]$/.test(Q.a);
  let kind = Q.wrong.length ? 'mc' : ox ? 'ox' : 'short', choices = null;
  if (kind === 'mc') choices = shuffle([Q.a, ...Q.wrong]); else if (ox) choices = ['O', 'X'];
  else if (touch) { kind = 'mc'; choices = shuffle([Q.a, '이순신', '장영실', '김구']); }
  return { view: { qid: qi, q: Q.q, kind, choices, time: 15 }, Q };
}

// ---------- 가짜 서버 ----------
const listeners = new Map();
const emitM = (type, data) => { for (const fn of listeners.get(type) || []) try { fn(data); } catch (e) { console.error(e); } };
const on = (type, fn) => { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type).delete(fn); };
const feedFns = new Set(), logFns = new Set(), log = [];
const feed = text => { for (const f of feedFns) f({ text, t: Date.now() }); };
const addLog = e => { log.push(e); for (const f of logFns) f(e); };

const t0 = Date.now(), goAt = t0 + 4500;
const me = view === 'student' ? { pid: 'me', name: '나', k: 0, avatar: { face: '🐰', color: '#ff5fa2', kart: 0, hat: 1 }, device: touch ? 'touch' : 'pc', rp: tr.grid(0).rp, item: null, stamps: 0, correct: 0, finished: false, lastAns: 0 } : null;
const players = me ? [{ pid: me.pid, name: me.name, avatar: me.avatar, online: true }] : [];
const bots = [];
for (let i = 0; i < BOTS; i++) {
  const k = (me ? 1 : 0) + i, g = tr.grid(k % 40);
  const b = { pid: 'b' + i, name: NAMES[i % NAMES.length], k, avatar: { face: FACES[i % FACES.length], color: COLORS[i % 11], kart: i % 8, hat: 0 },
    rp: g.rp, lat: g.x ? [-4.5, -1.5, 1.5, 4.5][k % 4] : 0, latT: 0, sp: 16 + Math.random() * 5, quizT: 0, boostT: 0, fx: 0, finished: 0, stamps: 0, correct: 0, gateSeen: -1, x: g.x, z: g.z, h: g.h };
  bots.push(b); players.push({ pid: b.pid, name: b.name, avatar: b.avatar, online: true });
}
const roster = [...(me ? [[me.pid, me.k]] : []), ...bots.map(b => [b.pid, b.k])];
const finished = []; let closeAt = 0, bseq = 1, ended = false;
const bananas = new Map();
const room = { code: '0000', title: '시험', mode: 'race', state: 'play', settings: S, players };
const info = () => ({ track: S.track, laps: S.laps, gates: S.gates, stamps: S.stamps, items: S.items, boxes: S.boxes, goIn: goAt - Date.now(), maxIn: 9e5, closeIn: closeAt ? closeAt - Date.now() : 0, roster,
  karts: [], bananas: [...bananas.values()], finished, stats: Object.fromEntries(bots.map(b => [b.pid, [b.stamps, b.correct]])),
  me: me ? { k: me.k, x: null, z: null, h: 0, rp: me.rp, item: me.item, stamps: me.stamps, correct: me.correct, finished: me.finished, rank: me.rank || 0, time: me.time || 0 } : undefined });

function doFinish(pid, k, name) {
  const rank = finished.length + 1, time = Date.now() - goAt;
  finished.push({ pid, k, rank, time });
  emitM('finish', { pid, k, rank, time, name }); feed(`${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : '🏁'} ${name} ${rank}등 도착 (${(time / 1000).toFixed(1)}초)`);
  const total = (me ? 1 : 0) + bots.length;
  if (!closeAt && finished.length >= Math.ceil(total * S.finishPct / 100)) { closeAt = Date.now() + 8000; emitM('closing', { endIn: 8000 }); feed('⏳ 8초 뒤에 경기가 끝나요.'); }
  return { rank, time };
}
function rollItem() { return ['boost', 'banana', 'shield', 'ink', 'star'][Math.random() * 5 | 0]; }
function serverSend(type, d) {
  if (type === 'sync') return info();
  if (type === 'endnow') { if (d.soon) { closeAt = Date.now() + 5000; emitM('closing', { endIn: 5000 }); return { ok: true }; } endGame(); return { ok: true }; }
  if (!me) return { error: 'x' };
  if (type === 'item') {
    if (me.item !== d.kind) return { error: 'noitem' };
    me.item = null;
    if (d.kind === 'banana') { const b = { id: bseq++, x: d.x, z: d.z, by: me.k }; bananas.set(b.id, b); emitM('banana:add', b); }
    if (d.kind === 'ink') feed('🦑 나의 먹물 공격!');
    return { ok: true };
  }
  if (type === 'banana:hit') { if (bananas.delete(d.id)) { emitM('banana:del', { id: d.id }); feed('🍌 나 미끄러졌어요!'); } return { ok: true }; }
  if (type === 'finish') {
    if (me.finished) return { ok: true, rank: me.rank, time: me.time };
    if (d.lap < S.laps) return { error: 'laps' };
    if (me.stamps < S.stamps) return { error: 'stamps', need: S.stamps - me.stamps };
    me.finished = true; const r = doFinish(me.pid, me.k, me.name); me.rank = r.rank; me.time = r.time; return { ok: true, ...r };
  }
  return { error: 'type' };
}
const ask = () => new Promise(res => setTimeout(() => res(nextView()), 60));
async function fakeQuiz(opts) {
  if (Date.now() < goAt || me.finished || Date.now() - me.lastAns < 1200) return null;
  const { view: v, Q } = await ask();
  return showQuiz(v, { ...opts, onAnswer: async given => {
    await new Promise(r => setTimeout(r, 80));
    const ok = String(given).replace(/\s/g, '') === Q.a;
    const res = { ok, correct: Q.a, explain: '', qid: v.qid };
    setTimeout(() => {
      me.stamps++; me.lastAns = Date.now(); if (ok) me.correct++;
      let item = null, full = false;
      if (ok) { if (me.item) full = true; else item = me.item = rollItem(); }
      emitM('reward', ok ? { ok: true, item, full, boost: 1, stamps: me.stamps, correct: me.correct } : { ok: false, penalty: { kind: 'slow', ms: 1000 }, stamps: me.stamps, correct: me.correct });
      addLog({ pid: me.pid, name: me.name, qid: v.qid, ok, given, ms: 3000, t: Date.now() });
    }, 30);
    return res;
  } });
}
function endGame() {
  if (ended) return; ended = true; clearInterval(simT); cleanup?.();
  const d = h(`<div class="dev-end"><div class="card"><h2>🏁 경기 끝! (시험장)</h2><div class="board">${finished.map(f => `<div class="brow"><span class="rk">${f.rank}</span><span class="nm">${esc(players.find(p => p.pid === f.pid)?.name)}</span><span class="sc">${(f.time / 1000).toFixed(1)}초</span></div>`).join('')}</div>
    <p><a class="btn y" href="${esc(location.href)}">다시 하기</a></p></div></div>`);
  document.body.append(d);
}

// ---------- 봇 ----------
let myState = null;
const gates = tr.gates(S.gates);
const simT = setInterval(() => {
  const now = Date.now(), dt = 0.1;
  if (closeAt && now >= closeAt) return endGame();
  const out = [];
  for (const b of bots) {
    if (now >= goAt) {
      let sp = b.sp;
      if (b.quizT > 0) { b.quizT -= dt; sp = 3; if (b.quizT <= 0) { b.stamps++; const ok = Math.random() < 0.7; if (ok) { b.correct++; b.boostT = 1.2; }
        addLog({ pid: b.pid, name: b.name, qid: Math.random() * 8 | 0, ok, given: '?', ms: 2500, t: now }); emitM('stat', { pid: b.pid, stamps: b.stamps, correct: b.correct });
        if (ok && Math.random() < 0.25) { const p = tr.pointAt(b.rp - 3 / tr.length, b.lat); const bn = { id: bseq++, x: p.x, z: p.z, by: b.k }; bananas.set(bn.id, bn); emitM('banana:add', bn); }
        if (ok && me && Math.random() < 0.08 && myState && myState.rp > b.rp && !me.finished) { emitM('ink', { from: b.name }); feed(`🦑 ${b.name}의 먹물 공격!`); } } }
      if (b.boostT > 0) { b.boostT -= dt; sp += 9; }
      if (b.finished) sp = 8;
      // 게이트 통과 → 퀴즈 (봇은 3~5초 멈칫)
      const lap = Math.floor(b.rp), frac = b.rp - lap;
      gates.forEach((g, gi) => { const id = lap * 10 + gi; if (lap >= 0 && frac >= g && b.gateSeen < id && !b.finished) { b.gateSeen = id; b.quizT = 2.5 + Math.random() * 3; } });
      b.rp += sp * dt / tr.length;
      if ((b.latT -= dt) <= 0) { b.latT = 2 + Math.random() * 3; b.latGoal = (Math.random() - 0.5) * 8; }
      b.lat += ((b.latGoal ?? b.lat) - b.lat) * 0.05;
      if (!b.finished && b.rp >= S.laps && b.stamps >= S.stamps) { b.finished = doFinish(b.pid, b.k, b.name).rank; }
      b.fx = (b.quizT > 0 ? 64 : 0) | (b.boostT > 0 ? 1 : 0);
      b.sp += (Math.random() - 0.5) * 0.3; b.sp = Math.max(14, Math.min(21, b.sp));
    }
    const p = tr.pointAt(b.rp, b.lat);
    out.push(b.k, Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.h * 100), Math.round((b.quizT > 0 ? 3 : b.sp) * 10), Math.round((b.finished ? S.laps + 1 - b.finished / 1000 : b.rp) * 1000), b.fx);
  }
  if (myState) out.push(me.k, Math.round(myState.x * 10), Math.round(myState.z * 10), Math.round(myState.h * 100), Math.round(myState.s * 10), Math.round((me.finished ? S.laps + 1 - me.rank / 1000 : myState.rp) * 1000), myState.fx);
  emitM('snap', out);
}, 100);

// ---------- 화면 붙이기 ----------
const app = document.getElementById('app');
let cleanup = null;
if (view === 'student') {
  const ctx = {
    socket: { emit: (ev, d) => { if (ev === 's:mode' && d.type === 'st') { myState = d.data; me.rp = d.data.rp; } } },
    me: { pid: me.pid, name: me.name, avatar: me.avatar, device: me.device }, room, snapshot: null,
    on, onRoom: () => () => {}, send: async (type, data) => serverSend(type, data || {}),
    ask, answer: async () => null, quiz: fakeQuiz, onQuestion: () => () => {},
    sound, music, toast, showQuiz,
  };
  cleanup = mountStudent(app, ctx);
} else {
  const ctx = {
    socket: { emit() {} }, room, on, onRoom: () => () => {}, send: async (type, data) => serverSend(type, data || {}),
    questions: QS, log, onLog: fn => { logFns.add(fn); return () => logFns.delete(fn); }, onFeed: fn => { feedFns.add(fn); return () => feedFns.delete(fn); },
    snapshot: null, sound, music, toast, end: endGame,
  };
  cleanup = mountTeacher(app, ctx);
}
feed('🏁 시험 경주 출발!');

// FPS 표시
const fpsEl = document.getElementById('fps'); let fc = 0, ft = performance.now();
(function f(t) { fc++; if (t - ft > 1000) { fpsEl.textContent = `${fc} fps`; fc = 0; ft = t; } requestAnimationFrame(f); })(performance.now());
window.__race = { bots, me, serverSend, emitM };

// ?auto=1 : 내 카트를 자동 운전 (퀴즈는 첫 보기 고르기) — 게이트·상자·바퀴·도착 시험용
if (P.get('auto') === '1' && view === 'student') {
  setInterval(() => {
    const g = globalThis.__lastRace; if (!g?.me || !g.prog) return;
    const m = g.me, a = g.tr.pointAt(g.prog.prog + 14 / g.tr.length, 0);
    let d = Math.atan2(a.x - m.x, a.z - m.z) - m.h; d = Math.atan2(Math.sin(d), Math.cos(d));
    g.input.steer = Math.max(-1, Math.min(1, -d * 2.5)); g.input.throttle = 1;
    const c = document.querySelector('.quiz-layer .choice'); if (c && !c.disabled) c.click();
    const f = document.querySelector('.quiz-layer form'); if (f) { f.querySelector('input').value = '세종대왕'; f.requestSubmit(); }
    if (Math.random() < 0.02) window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  }, 50);
}
