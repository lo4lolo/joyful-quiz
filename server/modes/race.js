// 퀴즈 카트 레이스 (서버 규칙)
// 운전·충돌은 학생 브라우저가 하고, 서버는 위치 중계·문제·아이템·도착 판정·순위를 맡는다.
// 점수(score) = 맞힌 문제 수 × 100 + 순위 보너스
//   도착한 사람: 200 + (10등 안이면 (11 - 등수) × 30)  → 1등 500, 2등 470 … 10등 230, 11등부터 200
//   도착 못 한 사람: 달린 거리 비율 × 150 (최대 150)
import { TRACK_COUNT, buildTrack } from '../../public/js/race/tracks.js';
import { shuffle } from '../quiz.js';

const ITEMS = ['boost', 'banana', 'shield', 'ink', 'star'];
const ITEM_NAME = { boost: '🚀 부스터', banana: '🍌 바나나', shield: '🛡️ 방패', ink: '🦑 먹물', star: '⭐ 별' };
const GO_DELAY = 4000, LAP_MAX_MS = 240000, MIN_LAP_MS = 12000, ASK_GAP = 1200, MAX_BANANAS = 60;

const int = (v, a, b, d) => { if (v === undefined || v === null || v === '') return d; const n = Math.round(+v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };
const bool = (v, d) => (v === undefined || v === null || v === '' ? d : !(v === false || v === 'false' || v === 0 || v === '0' || v === 'off'));
const num = (v, a, b) => { v = +v; return Number.isFinite(v) ? Math.max(a, Math.min(b, v)) : null; };
const r1 = v => Math.round(v * 10), r2 = v => Math.round(v * 100), r3 = v => Math.round(v * 1000);

function initKart(room, p) {
  const m = room.m;
  const k = m.nextK++;
  const g = m.tr.grid(k % 40);
  p.m = { k, x: null, z: null, h: g.h, s: 0, rp: g.rp, fx: 0, dirty: false, item: null, stamps: 0, correct: 0,
    finished: false, time: 0, rank: 0, lastAns: 0, lastSt: 0 };
  m.kOf[p.pid] = k;
}
const roster = room => Object.entries(room.m.kOf);
const racers = room => [...room.players.values()].filter(p => p.m && p.m.k != null);

// 앞에서부터의 등수 비율 (0 = 1등, 1 = 꼴찌). 도착한 사람은 앞으로 친다.
function placeFrac(room, p) {
  const list = racers(room).filter(x => x.online || x.m.finished);
  if (list.length < 2) return 0.5;
  const ahead = list.filter(x => x !== p && (x.m.finished || x.m.rp > p.m.rp)).length;
  return ahead / (list.length - 1);
}

// 맞힌 학생에게 줄 아이템. 앞선 학생은 방어용, 뒤처진 학생은 따라잡기용이 더 잘 나온다.
function rollItem(f) {
  const w = { boost: 3 + f, banana: 4 - 3 * f, shield: 3 - 2 * f, ink: 0.5 + 2.5 * f, star: 0.3 + 2.7 * f };
  let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const k of ITEMS) { r -= w[k]; if (r <= 0) return k; }
  return 'boost';
}

function startInfo(room, now = Date.now()) {
  const m = room.m;
  return { track: m.track, laps: m.laps, gates: m.gates, stamps: m.stamps, items: m.items, boxes: m.boxes,
    goIn: m.goAt - now, maxIn: m.maxEnd - now, closeIn: m.closeAt ? m.closeAt - now : 0, roster: roster(room) };
}

function checkClose(room, api) {
  const m = room.m, now = Date.now();
  const list = racers(room).filter(p => p.online || p.m.finished);
  if (!list.length) return;
  const done = list.filter(p => p.m.finished).length;
  const need = Math.max(1, Math.ceil(list.length * m.finishPct / 100));
  const all = done >= list.length;
  if (all && (!m.closeAt || m.closeAt - now > 3500)) {
    m.closeAt = now + 3000; api.toAll('closing', { endIn: 3000, all: true });
  } else if (!m.closeAt && done >= need) {
    m.closeAt = now + 8000; api.toAll('closing', { endIn: 8000, all: false });
    api.feed(`⏳ ${done}명이 도착! 8초 뒤에 경기가 끝나요.`);
  }
}

const mode = {
  id: 'race', name: '퀴즈 카트 레이스', selfPaced: true,

  // track: 0~(트랙 수-1), -1 = 무작위 / laps 1~5 / gates 바퀴마다 퀴즈 게이트 0~4 / stamps 도착에 필요한 퀴즈 도장(푼 문제 수) 0~6
  // finishPct: 이만큼(%) 도착하면 8초 뒤 끝 (30|50|100) / items 아이템 사용 / boxes 아이템 상자(상자도 퀴즈를 냄)
  settings(i = {}) {
    let track = i.track === 'random' ? -1 : int(i.track, -1, TRACK_COUNT - 1, 0);
    const laps = int(i.laps, 1, 5, 3), gates = int(i.gates, 0, 4, 3);
    const boxes = bool(i.boxes, true), items = bool(i.items, true);
    let stamps = int(i.stamps, 0, 6, 2);
    if (!gates && !boxes) stamps = 0; // 문제를 받을 곳이 없으면 도장 조건 없음
    const finishPct = [30, 50, 100].includes(+i.finishPct) ? +i.finishPct : 50;
    return { track, laps, gates, stamps, finishPct, items, boxes };
  },

  start(room, api) {
    const s = room.settings, now = Date.now();
    const track = s.track >= 0 ? s.track : Math.floor(Math.random() * TRACK_COUNT);
    room.m = { track, tr: buildTrack(track), laps: s.laps, gates: s.gates, stamps: s.stamps, items: s.items, boxes: s.boxes,
      finishPct: s.finishPct, goAt: now + GO_DELAY, maxEnd: now + GO_DELAY + s.laps * LAP_MAX_MS, closeAt: 0,
      bananas: new Map(), bseq: 1, finished: [], nextK: 0, kOf: {}, ticks: 0 };
    const list = [...room.players.values()];
    const order = [...shuffle(list.filter(p => p.online)), ...list.filter(p => !p.online)];
    for (const p of order) initKart(room, p);
    api.toAll('start', startInfo(room, now));
    api.feed(`🏁 ${room.m.tr.emoji} ${room.m.tr.name} · ${s.laps}바퀴 경주 출발!`);
  },

  onJoin(room, p, api) {
    if (room.state !== 'play' || !room.m?.tr || p.m?.k != null) return;
    initKart(room, p);
    api.toAll('roster', { pid: p.pid, k: p.m.k });
  },

  canAsk(room, p) {
    const m = room.m, now = Date.now();
    return !!m?.tr && p.m?.k != null && now >= m.goAt && !p.m.finished && !m.closeAt && now - p.m.lastAns >= ASK_GAP;
  },

  onAnswer(room, p, res, api) {
    const m = room.m; if (!m?.tr || p.m?.k == null) return;
    p.m.stamps++; p.m.lastAns = Date.now();
    let item = null, full = false;
    if (res.ok) {
      p.m.correct++;
      if (m.items) { if (p.m.item) full = true; else item = p.m.item = rollItem(placeFrac(room, p)); }
      api.toPlayer(p.pid, 'reward', { ok: true, item, full, boost: 1, stamps: p.m.stamps, correct: p.m.correct });
    } else {
      api.toPlayer(p.pid, 'reward', { ok: false, penalty: { kind: 'slow', ms: 1000 }, stamps: p.m.stamps, correct: p.m.correct });
    }
    api.toTeacher('stat', { pid: p.pid, stamps: p.m.stamps, correct: p.m.correct });
  },

  onStudent(room, p, type, d, api, ack = () => {}) {
    const m = room.m; if (!m?.tr || p.m?.k == null) return ack({ error: 'norace' });
    const now = Date.now();
    if (type === 'sync') return ack(mode.snapshot(room, p)); // 모드 화면이 늦게 열렸을 때 현재 상태 받기
    if (type === 'st') {
      const x = num(d.x, -3000, 3000), z = num(d.z, -3000, 3000), h = num(d.h, -1000, 1000);
      if (x === null || z === null || h === null) return;
      p.m.x = x; p.m.z = z; p.m.h = ((h + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      p.m.s = num(d.s, -30, 60) ?? 0;
      if (!p.m.finished) p.m.rp = num(d.rp, -1, m.laps + 3) ?? p.m.rp;
      p.m.fx = Math.max(0, Math.min(1023, d.fx | 0));
      p.m.dirty = true; p.m.lastSt = now;
      return;
    }
    if (type === 'item') {
      const kind = String(d.kind);
      if (!ITEMS.includes(kind) || p.m.item !== kind) return ack({ error: 'noitem' });
      p.m.item = null;
      api.event('item', p.pid, { kind });
      if (kind === 'banana') {
        const x = num(d.x, -3000, 3000) ?? p.m.x ?? 0, z = num(d.z, -3000, 3000) ?? p.m.z ?? 0;
        const b = { id: m.bseq++, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, by: p.m.k };
        m.bananas.set(b.id, b);
        if (m.bananas.size > MAX_BANANAS) { const old = m.bananas.keys().next().value; m.bananas.delete(old); api.toAll('banana:del', { id: old }); }
        api.toAll('banana:add', b);
      } else if (kind === 'ink') {
        let n = 0;
        for (const o of racers(room)) if (o !== p && o.online && !o.m.finished && o.m.rp > p.m.rp) { api.toPlayer(o.pid, 'ink', { from: p.name }); n++; }
        api.feed(n ? `🦑 ${p.name}의 먹물 공격! 앞선 ${n}명 화면이 깜깜!` : `🦑 ${p.name}가 먹물을 뿌렸지만 앞에 아무도 없어요`);
      }
      api.toAll('use', { k: p.m.k, kind });
      return ack({ ok: true });
    }
    if (type === 'banana:hit') {
      const id = d.id | 0;
      if (m.bananas.delete(id)) { api.toAll('banana:del', { id, k: p.m.k }); api.feed(`🍌 ${p.name} 미끄러졌어요!`); }
      return ack({ ok: true });
    }
    if (type === 'finish') {
      if (p.m.finished) return ack({ ok: true, rank: p.m.rank, time: p.m.time });
      const lap = +d.lap || 0, elapsed = now - m.goAt;
      const rp = Math.max(p.m.rp, num(d.rp, -1, m.laps + 3) ?? -1);
      if (lap < m.laps || rp < m.laps - 0.05) return ack({ error: 'laps' });
      if (elapsed < m.laps * MIN_LAP_MS) return ack({ error: 'fast' });
      if (p.m.stamps < m.stamps) return ack({ error: 'stamps', need: m.stamps - p.m.stamps, have: p.m.stamps });
      p.m.finished = true; p.m.time = elapsed; p.m.rank = m.finished.length + 1; p.m.rp = m.laps + 1 - p.m.rank / 1000;
      m.finished.push({ pid: p.pid, k: p.m.k, rank: p.m.rank, time: elapsed });
      ack({ ok: true, rank: p.m.rank, time: elapsed });
      api.toAll('finish', { pid: p.pid, k: p.m.k, rank: p.m.rank, time: elapsed, name: p.name });
      const sec = (elapsed / 1000).toFixed(1);
      api.feed(p.m.rank <= 3 ? `${['🥇', '🥈', '🥉'][p.m.rank - 1]} ${p.name} ${p.m.rank}등으로 도착! (${sec}초)` : `🏁 ${p.name} ${p.m.rank}등 도착 (${sec}초)`);
      checkClose(room, api);
      return;
    }
    ack({ error: 'type' });
  },

  onTeacher(room, type, d, api, ack = () => {}) {
    const m = room.m; if (!m?.tr) return ack({ error: 'norace' });
    if (type === 'sync') return ack(mode.snapshot(room, null));
    if (type === 'endnow') {
      if (d.soon) { // 5초 세고 끝내기
        const now = Date.now();
        if (!m.closeAt || m.closeAt - now > 5000) { m.closeAt = now + 5000; api.toAll('closing', { endIn: 5000, teacher: true }); }
        return ack({ ok: true, endIn: 5000 });
      }
      ack({ ok: true }); api.end(); return;
    }
    ack({ error: 'type' });
  },

  onLeave(room, p, api) { if (room.m?.tr) checkClose(room, api); },

  tick(room, api) {
    const m = room.m; if (!m?.tr) return;
    const now = Date.now();
    if (now - (m.lastSnap || 0) < 140) return; // 약 7Hz (학생 화면은 사이를 부드럽게 이어 줌)
    m.lastSnap = now;
    const out = [];
    for (const p of room.players.values()) {
      const k = p.m; if (!k || !k.dirty || k.x === null) continue;
      k.dirty = false;
      out.push(k.k, r1(k.x), r1(k.z), r2(k.h), r1(k.s), r3(k.rp), k.fx);
    }
    if (out.length) api.toAll('snap', out);
    if (++m.ticks % 10 === 0) checkClose(room, api);
    if (m.closeAt && now >= m.closeAt) return api.end();
    if (now >= m.maxEnd) { api.feed('⏰ 경주 시간이 다 되었어요!'); return api.end(); }
  },

  ranking(room) {
    const m = room.m; if (!m?.tr) return [];
    const list = racers(room);
    list.sort((a, b) => (a.m.finished !== b.m.finished ? (a.m.finished ? -1 : 1)
      : a.m.finished ? a.m.time - b.m.time : b.m.rp - a.m.rp));
    return list.map((p, i) => {
      const rank = i + 1;
      const bonus = p.m.finished ? 200 + (rank <= 10 ? (11 - rank) * 30 : 0) : Math.round(Math.max(0, Math.min(1, p.m.rp / m.laps)) * 150);
      return { pid: p.pid, name: p.name, score: p.m.correct * 100 + bonus, rank,
        extra: { time: p.m.finished ? p.m.time : null, finished: p.m.finished, stamps: p.m.stamps, correct: p.m.correct,
          lap: Math.max(0, Math.min(m.laps, Math.floor(p.m.rp) + (p.m.finished ? 0 : 1))) } };
    });
  },

  snapshot(room, p) {
    const m = room.m; if (!m?.tr) return null;
    const now = Date.now();
    const karts = [], stats = {};
    for (const o of room.players.values()) {
      const k = o.m; if (!k || k.k == null) continue;
      if (k.x !== null) karts.push([k.k, r1(k.x), r1(k.z), r2(k.h), r1(k.s), r3(k.rp), k.fx]);
      stats[o.pid] = [k.stamps, k.correct];
    }
    const snap = { ...startInfo(room, now), karts, bananas: [...m.bananas.values()], finished: m.finished };
    if (!p) snap.stats = stats;
    else if (p.m?.k != null) {
      const k = p.m;
      snap.me = { k: k.k, x: k.x, z: k.z, h: k.h, rp: k.rp, item: k.item, stamps: k.stamps, correct: k.correct, finished: k.finished, rank: k.rank, time: k.time };
    }
    return snap;
  },
};

export default mode;
export { ITEMS, ITEM_NAME };
