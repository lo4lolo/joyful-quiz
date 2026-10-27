// 뿅망치 대결: 선생님이 한 문제씩 진행. 문제마다 살아 있는 학생을 둘씩 짝지어 1대1.
// 둘 다 맞히면 빠른 쪽 승, 한 명만 맞히면 그 사람 승, 둘 다 틀리면 둘 다 하트 -1. 하트 0이면 응원석(👻).
// 마지막 한 명이 남으면 챔피언. 문제가 다 떨어지면 (살아 있음, 하트, 승, 점수) 순.
import { shuffle } from '../quiz.js';

const WIN = 100, SPEED = 50, KO = 200, BYE = 50;
const all = room => [...room.players.values()];
const online = room => all(room).filter(p => p.online);
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const fresh = H => ({ hearts: H, alive: true, wins: 0, losses: 0, kos: 0, out: null, late: false });
// 게임 중 들어온 학생은 응원석에서 시작 (선생님이 💖 모두 부활을 누르면 함께해요)
const late = () => ({ hearts: 0, alive: false, wins: 0, losses: 0, kos: 0, out: null, late: true });
function st(room, p) { if (typeof p.m?.hearts !== 'number') p.m = late(); return p.m; }
const aliveList = room => all(room).filter(p => st(room, p).alive);

function rankingOf(room) {
  const champ = room.m?.champion || null;
  const list = all(room).map(p => {
    const s = st(room, p);
    return { pid: p.pid, name: p.name, score: p.score,
      extra: { alive: !!s.alive, hearts: s.hearts | 0, wins: s.wins | 0, correct: p.stats.ok, answered: p.stats.n,
        eliminatedRound: s.out ?? null, champion: p.pid === champ } };
  });
  const k = r => [+r.extra.champion, +r.extra.alive, r.extra.hearts, r.extra.wins, r.score];
  const cmp = (a, b) => { const x = k(a), y = k(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };
  list.sort((a, b) => cmp(a, b) || (b.extra.eliminatedRound ?? 1e9) - (a.extra.eliminatedRound ?? 1e9) || b.extra.correct - a.extra.correct);
  list.forEach((r, i) => { r.rank = i > 0 && cmp(list[i - 1], r) === 0 ? list[i - 1].rank : i + 1; });
  return list;
}

function phase(room, api, data) {
  room.m.phase = data.phase;
  room.m.last = data;
  api.toAll('phase', data);
}

// 짝짓기: 접속이 끊긴 학생은 끊긴 학생끼리 먼저(답을 못 내면 진 것으로), 접속한 학생은 접속한 학생끼리.
// 그래서 혼자 남는 사람은 늘 접속한 학생 → 응원석 유령과 겨루거나, 유령이 없으면 부전승.
// 지난 판과 같은 짝·같은 부전승은 되도록 피한다.
function makeDuels(room) {
  const m = room.m;
  const alive = aliveList(room);
  const on = alive.filter(p => p.online), off = alive.filter(p => !p.online);
  let best = null, bestCost = Infinity;
  for (let t = 0; t < 60 && bestCost > 0; t++) {
    const L = [...shuffle([...off]), ...shuffle([...on])];
    const pairs = [];
    for (let i = 0; i + 1 < L.length; i += 2) pairs.push([L[i], L[i + 1]]);
    const left = L.length % 2 ? L[L.length - 1] : null;
    const cost = pairs.filter(([a, b]) => m.prevPairs.has(pairKey(a.pid, b.pid))).length * 10 + (left && left.pid === m.prevBye && L.length > 1 ? 1 : 0);
    if (cost < bestCost) { bestCost = cost; best = { pairs, left }; }
  }
  const duels = (best?.pairs || []).map(([a, b]) => ({ kind: 'duel', a: a.pid, b: b.pid }));
  const left = best?.left;
  if (left) {
    const ghosts = all(room).filter(p => p.online && !st(room, p).alive);
    const pool = ghosts.length > 1 ? ghosts.filter(g => g.pid !== m.prevGhost) : ghosts;
    if (left.online && pool.length) {
      const g = pool[Math.floor(Math.random() * pool.length)];
      duels.push({ kind: 'ghost', a: left.pid, b: g.pid }); m.prevGhost = g.pid;
    } else duels.push({ kind: 'bye', a: left.pid, b: null });
  }
  m.prevPairs = new Set(duels.filter(d => d.kind === 'duel').map(d => pairKey(d.a, d.b)));
  m.prevBye = duels.find(d => d.kind === 'bye')?.a || null;
  m.duels = duels;
  m.roles = Object.create(null);
  for (const d of duels) {
    if (d.kind === 'bye') m.roles[d.a] = { role: 'bye', opp: null };
    else if (d.kind === 'ghost') { m.roles[d.a] = { role: 'vsGhost', opp: d.b }; m.roles[d.b] = { role: 'ghost', opp: d.a }; }
    else { m.roles[d.a] = { role: 'duel', opp: d.b }; m.roles[d.b] = { role: 'duel', opp: d.a }; }
  }
}

// 기다릴 학생: 접속 중이거나, 이 문제를 받고 잠깐(8초 안) 끊긴 학생 (새로고침·와이파이 끊김은 기다려 준다)
const GRACE = 8000;
function progress(room) {
  const m = room.m, now = Date.now();
  const answered = Object.keys(m.answers).length;
  let left = 0;
  for (const p of all(room)) if (!m.answers[p.pid] && (p.online || (m.asked?.has(p.pid) && now - (p.m?.leftAt || 0) < GRACE))) left++;
  return { answered, total: answered + left };
}
function sendCount(room, api, c = progress(room)) {
  room.m.lastTotal = c.total;
  api.toTeacher('count', { answered: c.answered, total: c.total });
}

const pubP = (room, q) => q && { pid: q.pid, name: q.name, avatar: q.avatar, hearts: st(room, q).hearts, alive: q.m.alive, online: !!q.online };
// 학생마다 이번 판 내 상대·하트
function duelInfo(room, p) {
  const m = room.m, s = st(room, p), r = m.roles?.[p.pid];
  const role = r ? r.role : s.alive ? 'wait' : 'cheer';
  return { index: m.idx, total: m.order.length, role, opp: r?.opp ? pubP(room, room.players.get(r.opp)) : null,
    hearts: s.hearts, max: room.settings.hearts, alive: s.alive, late: !!s.late, wins: s.wins, score: p.score,
    aliveN: aliveList(room).length };
}

function ask(room, api) {
  const m = room.m;
  if (m.champion) return api.end();
  m.idx++;
  if (m.idx >= m.order.length) return api.end();
  m.round++;
  m.answers = Object.create(null);
  m.results = Object.create(null);
  m.allOut = false; m.doneAt = 0; m.lastTotal = -1;
  makeDuels(room);
  const qi = m.order[m.idx];
  // 상대 정보를 먼저 보내고 문제를 보낸다 (학생 화면 위쪽 대결 띠)
  for (const p of all(room)) api.toPlayer(p.pid, 'duel', duelInfo(room, p));
  const { pcView } = api.askAll(qi, room.settings.time);
  m.asked = new Set(all(room).map(p => p.pid));
  m.deadline = Date.now() + room.settings.time * 1000;
  phase(room, api, { phase: 'question', index: m.idx, total: m.order.length, view: pcView, deadline: m.deadline,
    alive: aliveList(room).length, duels: m.duels.filter(d => d.kind !== 'bye').length, byes: m.duels.filter(d => d.kind === 'bye').length,
    answered: 0, need: online(room).length });
}

function reveal(room, api) {
  const m = room.m; if (m.phase !== 'question') return;
  m.phase = 'resolving';
  const Q = room.questions[m.order[m.idx]];
  const T = room.settings.time * 1000;
  for (const p of all(room)) p.pending = null;
  const ans = pid => { const a = m.answers[pid]; return a ? { ok: !!a.ok, ms: a.ms, answered: a.given !== '' } : { ok: false, ms: null, answered: false }; };
  const gain = Object.create(null);
  const add = (p, n) => { gain[p.pid] = (gain[p.pid] || 0) + n; };
  const speed = ms => Math.round(SPEED * Math.max(0, 1 - (ms || 0) / T));
  const losers = new Set();
  const fights = []; // { d, A, B, ra, rb, winner, double }
  for (const d0 of m.duels) {
    let A = room.players.get(d0.a), B = d0.b ? room.players.get(d0.b) : null, kind = d0.kind;
    if (!A && B && kind === 'duel') { A = B; B = null; } // 한 명이 내보내졌으면 남은 사람은 부전승
    if (!A) continue;
    if (!B) kind = 'bye';
    const ra = ans(A.pid), rb = B ? ans(B.pid) : null;
    const f = { kind, A, B, ra, rb, winner: null, double: false };
    if (kind === 'bye') { if (ra.ok) add(A, BYE); fights.push(f); continue; }
    if (ra.ok && rb.ok) f.winner = ra.ms <= rb.ms ? A : B;
    else if (ra.ok) f.winner = A; else if (rb.ok) f.winner = B;
    else f.double = true;
    if (kind === 'ghost') { // 유령(B)은 잃을 것도 얻을 것도 없다
      if (f.winner === A) { A.m.wins++; add(A, WIN + speed(ra.ms)); } else { losers.add(A); }
    } else {
      if (f.winner) { const w = f.winner, wr = w === A ? ra : rb; w.m.wins++; add(w, WIN + speed(wr.ms)); losers.add(w === A ? B : A); }
      else { losers.add(A); losers.add(B); }
    }
    fights.push(f);
  }
  for (const p of losers) { p.m.hearts = Math.max(0, p.m.hearts - 1); p.m.losses++; }
  // 이번 판에 마지막 하트를 잃은 사람
  const dying = [...losers].filter(p => p.m.hearts <= 0 && p.m.alive);
  const survivors = aliveList(room).filter(p => p.m.hearts > 0).length;
  if (dying.length && survivors === 0) { // 모두 탈락이면 아무도 탈락하지 않는다
    dying.forEach(p => { p.m.hearts = 1; }); m.allOut = true;
    api.feed('😮 모두 하트를 잃을 뻔! 모두 하트 1개로 살아남았어요');
  } else dying.forEach(p => { p.m.alive = false; p.m.hearts = 0; p.m.out = m.round; });
  const outSet = new Set(m.allOut ? [] : dying);
  const kos = Object.create(null);
  for (const f of fights) {
    if (f.kind !== 'duel' || !f.winner) continue;
    const l = f.winner === f.A ? f.B : f.A;
    if (outSet.has(l)) { add(f.winner, KO); f.winner.m.kos++; kos[f.winner.pid] = (kos[f.winner.pid] || 0) + 1; api.feed(`🔨 뿅! ${f.winner.name} 승리 · ${l.name} 응원석으로`); }
  }
  for (const p of outSet) if (!fights.some(f => f.kind === 'duel' && f.winner && (f.winner === f.A ? f.B : f.A) === p)) api.feed(`👻 ${p.name} 응원석으로`);
  for (const pid in gain) { const p = room.players.get(pid); if (p) p.score += gain[pid]; }
  const aliveNow = aliveList(room);
  if (aliveNow.length === 1 && m.startN >= 2) { m.champion = aliveNow[0].pid; api.feed(`🏆 챔피언: ${aliveNow[0].name}!`); }
  const champion = m.champion ? { pid: m.champion, name: room.players.get(m.champion)?.name || '' } : null;

  const side = (p, r) => ({ pid: p.pid, name: p.name, ok: r.ok, answered: r.answered, ms: r.ms, hearts: p.m.hearts, alive: p.m.alive,
    out: outSet.has(p), lost: losers.has(p) });
  const duels = fights.map(f => ({ kind: f.kind, a: side(f.A, f.ra), b: f.B ? side(f.B, f.rb) : null, winner: f.winner?.pid || null, double: f.double }));

  const ranking = rankingOf(room);
  const rankOf = Object.fromEntries(ranking.map(r => [r.pid, r.rank]));
  const fightOf = Object.create(null);
  for (const f of fights) { fightOf[f.A.pid] = f; if (f.B) fightOf[f.B.pid] = f; }
  for (const p of all(room)) {
    const f = fightOf[p.pid], r = ans(p.pid), s = p.m;
    let role = s.alive || losers.has(p) ? 'wait' : 'cheer', outcome = role, opp = null;
    if (f) {
      const isA = f.A === p, o = isA ? f.B : f.A, or = isA ? f.rb : f.ra;
      opp = o ? { pid: o.pid, name: o.name, avatar: o.avatar, ok: or.ok, answered: or.answered, ms: or.ms, hearts: o.m.hearts, alive: o.m.alive } : null;
      if (f.kind === 'bye') { role = 'bye'; outcome = 'bye'; }
      else if (f.kind === 'ghost' && !isA) { role = 'ghost'; outcome = f.winner === p ? 'ghostWin' : 'ghostLose'; }
      else { role = f.kind === 'ghost' ? 'vsGhost' : 'duel'; outcome = f.winner === p ? 'win' : f.double ? 'double' : 'lose'; }
    }
    if (role === 'duel' || role === 'vsGhost') api.event('duel', p.pid, { outcome, ok: !!r.ok, ms: r.ms | 0, round: m.idx + 1 });
    const res = { index: m.idx, total: m.order.length, role, outcome, ok: r.ok, answered: r.answered, ms: r.ms, opp,
      heartLost: losers.has(p), hearts: s.hearts, max: room.settings.hearts, alive: s.alive, out: outSet.has(p), saved: m.allOut && losers.has(p),
      gained: gain[p.pid] || 0, kos: kos[p.pid] || 0, wins: s.wins, score: p.score, rank: rankOf[p.pid], players: room.players.size,
      correct: Q.answers[0], explain: Q.explain, champion, isChampion: champion?.pid === p.pid, aliveN: aliveNow.length };
    m.results[p.pid] = res;
    api.toPlayer(p.pid, 'result', res);
  }
  const answered = Object.keys(m.answers).length, okN = Object.values(m.answers).filter(a => a.ok).length;
  phase(room, api, { phase: 'reveal', index: m.idx, total: m.order.length, correct: Q.answers[0], explain: Q.explain, duels,
    answered, okN, alive: aliveNow.length, outNames: [...outSet].map(p => p.name), allOut: m.allOut, champion,
    last: m.idx + 1 >= m.order.length });
}

function board(room, api) {
  const m = room.m;
  const alive = aliveList(room).sort((a, b) => b.m.hearts - a.m.hearts || b.m.wins - a.m.wins || b.score - a.score)
    .map(p => ({ pid: p.pid, name: p.name, hearts: p.m.hearts, wins: p.m.wins, online: !!p.online }));
  phase(room, api, { phase: 'board', index: m.idx, total: m.order.length, max: room.settings.hearts, alive, ghosts: room.players.size - alive.length,
    top: rankingOf(room).slice(0, 10), champion: m.champion ? { pid: m.champion, name: room.players.get(m.champion)?.name || '' } : null,
    last: m.idx + 1 >= m.order.length });
}

function revive(room, api) {
  const m = room.m;
  let n = 0;
  for (const p of all(room)) {
    const s = st(room, p);
    if (!s.alive) { s.alive = true; s.hearts = 1; s.out = null; s.late = false; n++; }
  }
  if (m.champion && aliveList(room).length > 1) m.champion = null;
  if (m.last?.champion && !m.champion) m.last = { ...m.last, champion: null };
  api.feed(n ? `💖 모두 부활! ${n}명이 하트 1개로 돌아왔어요` : '💖 모두 살아 있어요');
  api.toAll('revive', { n, alive: aliveList(room).length, champion: m.champion || null });
  for (const p of all(room)) api.toPlayer(p.pid, 'me', duelInfo(room, p));
}

export default {
  id: 'royale',
  name: '뿅망치 대결',
  selfPaced: false,
  settings: s => ({
    hearts: [2, 3, 5].includes(+s.hearts) ? +s.hearts : 3,
    shuffle: s.shuffle === undefined ? true : !(s.shuffle === false || s.shuffle === 'false' || s.shuffle === 0),
  }),
  start(room, api) {
    const order = room.questions.map(q => q.qid);
    if (room.settings.shuffle) shuffle(order);
    const H = room.settings.hearts;
    for (const p of all(room)) p.m = fresh(H);
    room.m = { idx: -1, round: 0, order, phase: 'ready', answers: Object.create(null), results: Object.create(null),
      duels: [], roles: Object.create(null), prevPairs: new Set(), prevBye: null, prevGhost: null, champion: null, allOut: false,
      startN: room.players.size };
    phase(room, api, { phase: 'ready', total: order.length, hearts: H, players: room.players.size });
  },
  onJoin(room, p) {
    // 대기실에서는 start()가 정한다. 첫 문제 전이면 정식 참가, 그 뒤면 응원석.
    if (room.state !== 'play') { p.m = {}; return; }
    if (room.m.idx < 0) { p.m = fresh(room.settings.hearts); room.m.startN = room.players.size; }
    else p.m = late();
  },
  onTeacher(room, type, data, api, ack) {
    const m = room.m;
    if (type === 'next') {
      if (m.phase === 'question') reveal(room, api);
      else if (m.phase === 'reveal' && !m.champion) board(room, api);
      else ask(room, api);
    } else if (type === 'reveal') reveal(room, api);
    else if (type === 'ask') { if (m.phase !== 'question') ask(room, api); }
    else if (type === 'board') { if (m.phase !== 'question') board(room, api); }
    else if (type === 'revive') revive(room, api);
    else if (type === 'time') { // 시간 10초 더
      if (m.phase === 'question') { m.deadline += 10000; api.toAll('deadline', { deadline: m.deadline }); }
    }
    ack?.({ ok: true, phase: room.m.phase });
  },
  onAnswer(room, p, res, api) {
    const m = room.m; if (m.phase !== 'question' || m.answers[p.pid]) return;
    m.answers[p.pid] = { given: res.given, ok: res.ok, ms: res.ms };
    sendCount(room, api);
  },
  // 마감이 지나면 공개. 기다릴 학생이 모두 답하면 0.6초 뒤 공개.
  tick(room, api) {
    const m = room.m;
    if (m.phase !== 'question') return;
    const now = Date.now();
    if (now > m.deadline + 400) return reveal(room, api);
    const c = progress(room);
    if (c.total !== m.lastTotal) sendCount(room, api, c);
    if (c.answered && c.answered >= c.total) { m.doneAt ||= now; if (now - m.doneAt >= 600) reveal(room, api); }
    else m.doneAt = 0;
  },
  onLeave(room, p, api) {
    if (p.m) p.m.leftAt = Date.now();
    if (room.m?.phase === 'question') sendCount(room, api);
  },
  ranking: rankingOf,
  snapshot(room, p) {
    const m = room.m;
    if (!m || m.phase == null) return null;
    const answered = Object.keys(m.answers || {}).length;
    if (!p) return { last: m.last, answered, need: m.phase === 'question' ? progress(room).total : online(room).length };
    return { last: m.last, me: duelInfo(room, p), answered: !!m.answers?.[p.pid],
      result: m.phase === 'reveal' || m.phase === 'board' ? m.results?.[p.pid] || null : null };
  },
};
