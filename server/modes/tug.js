// 다 함께 줄다리기: 우리 반(모든 모둠) vs 도깨비 팀, 또는 청군 vs 홍군(협력적 팀 경쟁).
// 핵심 규칙(docs/COOP_DESIGN.md): 모둠의 "영차"는 서로 다른 모둠원 여럿의 정답이 모여야 준비된다.
// 같은 학생은 한 박자에 한 번만 센다. 기수(돌아가며 맡는 역할)가 "영차!"를 누르면 모둠이 당긴다.
// 기수가 6초 안에 안 누르거나 자리에 없으면 "자동 영차". 개인 순위 없음, 탈락 없음, 오답 벌칙 없음.
import { TEAMS } from '../teams.js';

// 숫자 근거: 모의 실험(25명·6모둠·1분 4문제·정답률 70%)으로 맞춤. 표는 docs/modes/tug.md, 같은 방식의 검사는 tests/tug.test.mjs.
export const RULE = {
  countMs: 3000,      // 판 사이 3-2-1
  roundEndMs: 3500,   // 판 결과 보여 주기
  endDelay: 3000,     // 마지막 결과 뒤 끝내기
  autoMs: 6000,       // 준비된 뒤 기수가 안 누르면 자동 영차
  ropeMs: 200,        // 줄 위치 묶어 보내기
  boardMs: 1000,      // 전체 상태 다시 맞추기
  c0: 0.040,          // 보통 반 한 사람이 1초에 내는 힘(시뮬레이션 측정값: 1분 4문제·정답률 70%)
  classGain: 2.2,     // 보통 반이 혼자 당기면 한 판 시간의 1/2.2 만에 끝까지
  foeGain: 1.0,       // 도깨비 혼자면 한 판 시간에 끝까지 → 보통 반은 약 0.85판 시간에 이김, 보통의 45% 아래면 짐
  teamGain: 2.0,      // 청홍전: 한쪽이 1.5배 잘하면 한 판 시간쯤에 끝까지
  wobble: 0.3,        // 도깨비 힘 출렁임(±30%)
};
export const needFor = online => (online <= 0 ? 1 : online === 1 ? 1 : Math.max(2, Math.ceil(online * 0.5)));
const SIDES = { class: ['우리 반', '도깨비 팀'], teams: ['청군', '홍군'] };

const pm = p => {
  const m = p.m || (p.m = {});
  if (typeof m.contrib !== 'number') Object.assign(m, { contrib: 0, correct: 0, gisuPulls: 0 });
  return m;
};
const online = room => [...room.players.values()].filter(p => p.online).length;
const sideOf = (m, ti) => (m.style === 'teams' && ti % 2 === 1 ? 1 : 0); // 0 = 왼쪽(우리 반·청군), 1 = 오른쪽(도깨비·홍군)
// 모둠원: 들어온 순서대로 (기수 돌림 순서)
const members = (room, ti) => [...room.players.values()].filter(p => p.team === ti).sort((a, b) => (a.joinedAt - b.joinedAt) || (a.pid < b.pid ? -1 : 1));
const sideOnline = (room, m, side) => [...room.players.values()].filter(p => p.online && Number.isInteger(p.team) && p.team < m.teams.length && sideOf(m, p.team) === side).length;

function status(room, T) {
  const mem = members(room, T.ti), on = mem.filter(p => p.online);
  const done = mem.filter(p => T.beat.has(p.pid));
  const need = needFor(on.length), n = done.length;
  const all = on.length >= 2 && on.every(p => T.beat.has(p.pid));
  return { mem, on, done, need, n, all, ready: on.length > 0 && n >= need };
}
function gauge(room, T, now = Date.now()) {
  const m = room.m, st = status(room, T), g = room.players.get(T.gisu);
  return { ti: T.ti, n: st.n, need: st.need, on: st.on.length, ready: st.ready, all: st.all, done: st.done.map(p => p.pid),
    gisu: T.gisu, gisuName: g?.name || '', pulls: T.pulls,
    autoLeft: st.ready && T.readyAt && m.phase === 'pull' ? Math.max(0, RULE.autoMs - (now - Math.max(T.readyAt, m.roundStart))) : 0 };
}
const teamsInfo = m => m.teams.map(T => ({ ti: T.ti, side: sideOf(m, T.ti), ...TEAMS[T.ti] }));
function roundView(room, now = Date.now()) {
  const m = room.m;
  return { style: m.style, rounds: m.rounds, round: m.round, phase: m.phase, wins: m.wins.slice(), sides: SIDES[m.style], r: round1(m.r),
    countLeft: m.phase === 'count' ? Math.max(0, m.until - now) : 0,
    timeLeft: m.phase === 'pull' ? Math.max(0, m.endsAt - now) : m.phase === 'count' ? m.seconds * 1000 : 0,
    seconds: m.seconds, teams: teamsInfo(m), last: m.last };
}
const round1 = x => Math.round(x * 10) / 10;

// 기수 정하기: after 다음 차례의 접속 중인 모둠원 (없으면 아무도)
function setGisu(room, api, T, after, reason) {
  const mem = members(room, T.ti), on = mem.filter(p => p.online);
  if (!on.length) { T.gisu = null; return; }
  let next;
  if (after == null) next = on[Math.floor(Math.random() * on.length)];
  else {
    const i = mem.findIndex(p => p.pid === after);
    for (let k = 1; k <= mem.length && !next; k++) { const p = mem[(Math.max(i, 0) + k) % mem.length]; if (p.online) next = p; }
    next ||= on[0];
  }
  if (next.pid === T.gisu && reason !== 'start') return;
  T.gisu = next.pid; T.dirty = true;
  api.event('role', next.pid, { team: T.ti, role: 'gisu', round: room.m.round, reason });
}

function pull(room, api, T, auto, now = Date.now()) {
  const m = room.m, st = status(room, T);
  if (!st.ready || m.phase !== 'pull') return false;
  const strength = st.n + (st.all ? 1 : 0), side = sideOf(m, T.ti);
  for (const p of st.done) { const s = pm(p); s.contrib++; p.score = s.contrib; }
  T.contrib += st.n; T.pulls++; m.strength[side] += strength;
  const g = room.players.get(T.gisu);
  if (g && !auto) pm(g).gisuPulls++;
  // 움직임: 편 인원으로 나눠 반 크기와 상관없이 같은 느낌
  const N = Math.max(1, m.style === 'teams' ? sideOnline(room, m, side) : online(room));
  const gain = m.style === 'teams' ? RULE.teamGain : RULE.classGain;
  const dr = strength * gain * 100 / (RULE.c0 * N * m.seconds);
  m.r = Math.max(-100, Math.min(100, m.r + (side === 0 ? -dr : dr)));
  const T0 = TEAMS[T.ti];
  api.event('shared', T.gisu, { team: T.ti, distinct: st.n, need: st.need, all: st.all, strength, auto, round: m.round, online: st.on.length });
  api.toAll('pull', { ti: T.ti, side, strength, distinct: st.n, need: st.need, all: st.all, auto, by: g?.name || '', r: round1(m.r) });
  api.feed(`${T0.emoji} ${T0.name} ${auto ? '자동 ' : ''}영차! ${st.n}명이 힘을 모았어요${st.all ? ' (한마음 +1)' : ''}`);
  T.beat = new Set(); T.readyAt = 0; T.dirty = true;
  setGisu(room, api, T, T.gisu, 'rotate');
  m.ropeDirty = true;
  if (m.r <= -100) endRound(room, api, 0, 'line', now);
  else if (m.r >= 100) endRound(room, api, 1, 'line', now);
  return true;
}

function startCount(room, api, now) {
  const m = room.m;
  m.round++; m.phase = 'count'; m.until = now + RULE.countMs; m.r = 0; m.strength = [0, 0];
  api.toAll('round', roundView(room, now));
  api.feed(`🪢 ${m.round}판 준비! 3, 2, 1…`);
}
function endRound(room, api, winner, how, now = Date.now()) {
  const m = room.m;
  if (m.phase !== 'pull') return;
  if (winner != null) m.wins[winner]++;
  m.last = { round: m.round, winner, how };
  m.phase = 'roundEnd'; m.until = now + RULE.roundEndMs;
  const sides = SIDES[m.style];
  api.event('round', null, { round: m.round, winner, how, r: round1(m.r), wins: m.wins.slice(), strength: m.strength.map(round1), style: m.style });
  flushRope(room, api, now, true);
  api.toAll('roundEnd', { round: m.round, rounds: m.rounds, winner, how, wins: m.wins.slice(), r: round1(m.r), sides, final: matchOver(m) });
  api.feed(winner == null ? `🤝 ${m.round}판 비겼어요!` : `🏁 ${m.round}판: ${sides[winner]} 승리!${how === 'line' ? ' (끝까지 당겼어요)' : ''}`);
}
// 우리 반 방식은 세 판을 모두 한다 ("세 판 중 몇 판"). 청홍전은 먼저 두 판.
function matchOver(m) {
  if (m.round >= m.rounds) return true;
  if (m.style === 'teams') return Math.max(...m.wins) > m.rounds / 2;
  return false;
}
function finish(room, api, now) {
  const m = room.m;
  m.phase = 'over'; m.until = now + RULE.endDelay;
  const [a, b] = m.wins, winner = a > b ? 0 : b > a ? 1 : null;
  m.winner = winner;
  const classWin = m.style === 'class' ? a > m.rounds / 2 : winner != null;
  const sides = SIDES[m.style];
  const text = m.style === 'class'
    ? (m.rounds === 1 ? (a ? '우리 반 승리! 도깨비 팀을 이겼어요!' : '도깨비 팀이 이겼어요. 다음엔 꼭!') : `우리 반이 세 판 중 ${a}판 이겼어요!`)
    : (winner == null ? '비겼어요! 두 편 모두 멋졌어요' : `${sides[winner]} 승리! 두 편 모두 수고했어요`);
  api.event(m.style === 'class' ? 'classGoal' : 'teamGoal', null, { win: classWin, winner, wins: m.wins.slice(), rounds: m.round, style: m.style });
  api.toAll('result', { style: m.style, wins: m.wins.slice(), rounds: m.rounds, played: m.round, winner, classWin, text, sides });
  api.feed('🏆 ' + text);
}

function flushRope(room, api, now, force = false) {
  const m = room.m;
  const dirty = m.teams.filter(T => T.dirty);
  if (!force && !dirty.length && !(m.phase === 'pull' && m.ropeDirty)) { m.lastRope = now; return; }
  dirty.forEach(T => { T.dirty = false; });
  m.ropeDirty = false; m.lastRope = now;
  api.toAll('rope', { r: round1(m.r), timeLeft: m.phase === 'pull' ? Math.max(0, m.endsAt - now) : 0, phase: m.phase, g: dirty.map(T => gauge(room, T, now)) });
}

export default {
  id: 'tug',
  name: '다 함께 줄다리기',
  selfPaced: true,
  settings: s => ({
    style: s.style === 'teams' ? 'teams' : 'class',
    rounds: +s.rounds === 1 ? 1 : 3,
    seconds: [60, 90, 120].includes(+s.seconds) ? +s.seconds : 90,
    teams: [0, 2, 3, 4, 5, 6].includes(+s.teams) ? +s.teams : 0,
  }),
  start(room, api) {
    const S = room.settings, now = Date.now();
    let teams = api.ensureTeams(S.teams);
    if (S.style === 'teams' && teams.length < 2) teams = api.ensureTeams(2);
    room.m = { style: S.style === 'teams' ? 'teams' : 'class', rounds: S.rounds === 1 ? 1 : 3, seconds: S.seconds || 90,
      round: 0, phase: 'count', until: 0, endsAt: 0, roundStart: 0, r: 0, wins: [0, 0], strength: [0, 0], last: null, winner: null,
      lastTick: now, lastRope: now, lastBoard: now, ropeDirty: false,
      teams: teams.map((_, ti) => ({ ti, beat: new Set(), readyAt: 0, gisu: null, pulls: 0, contrib: 0, dirty: true })) };
    for (const p of room.players.values()) { p.m = {}; pm(p); }
    for (const T of room.m.teams) setGisu(room, api, T, null, 'start');
    startCount(room, api, now);
  },
  onJoin(room, p) { p.m = {}; pm(p); if (room.m?.teams) room.m.teams.forEach(T => { T.dirty = true; }); },
  onLeave(room) { if (room.m?.teams) room.m.teams.forEach(T => { T.dirty = true; }); },
  canAsk: (room) => !!room.m?.teams && (room.m.phase === 'pull' || room.m.phase === 'count'),
  onAnswer(room, p, res, api) {
    const m = room.m;
    if (!m?.teams || m.phase === 'over') return;
    const s = pm(p);
    const T = Number.isInteger(p.team) ? m.teams[p.team] : null;
    if (!res.ok || !T) { api.toPlayer(p.pid, 'mine', { ok: false, contrib: s.contrib, g: T ? gauge(room, T) : null }); return; }
    s.correct++;
    const fresh = !T.beat.has(p.pid);
    if (fresh) { T.beat.add(p.pid); T.dirty = true; }
    const st = status(room, T);
    if (st.ready && !T.readyAt) T.readyAt = Date.now();
    api.toPlayer(p.pid, 'mine', { ok: true, fresh, contrib: s.contrib, g: gauge(room, T) });
  },
  onStudent(room, p, type, data, api, ack) {
    const m = room.m, done = r => (typeof ack === 'function' ? ack(r) : null);
    if (!m?.teams || type !== 'pull') return done({ error: 'bad' });
    const T = Number.isInteger(p.team) ? m.teams[p.team] : null;
    if (!T) return done({ error: 'team' });
    if (T.gisu !== p.pid) return done({ error: 'notGisu' });
    if (m.phase !== 'pull') return done({ error: 'wait' });
    if (!status(room, T).ready) return done({ error: 'notReady' });
    const ok = pull(room, api, T, false);
    done(ok ? { ok: true } : { error: 'wait' });
  },
  onTeacher(room, type, data, api, ack) { if (typeof ack === 'function') ack({ ok: false }); },
  tick(room, api) {
    const m = room.m;
    if (!m?.teams) return;
    const now = Date.now(), dt = Math.min(250, Math.max(0, now - m.lastTick));
    m.lastTick = now;
    if (m.phase === 'over') { if (now >= m.until) { m.phase = 'end'; api.end(); } return; }
    if (m.phase === 'end') return;
    if (m.phase === 'count' && now >= m.until) {
      m.phase = 'pull'; m.roundStart = now; m.endsAt = now + m.seconds * 1000;
      api.toAll('round', roundView(room, now));
    } else if (m.phase === 'roundEnd' && now >= m.until) {
      if (matchOver(m)) return finish(room, api, now);
      startCount(room, api, now);
    }
    if (m.phase === 'pull') {
      // 도깨비 팀: 꾸준히 당긴다 (반 전체 인원에 맞춘 줄 단위라 반 크기와 상관없음)
      if (m.style === 'class' && online(room) > 0) {
        const w = 1 + RULE.wobble * Math.sin((now - m.roundStart) / 1700);
        m.r = Math.min(100, m.r + RULE.foeGain * 100 / m.seconds * w * dt / 1000);
        m.strength[1] += RULE.foeGain * RULE.c0 * online(room) / RULE.classGain * w * dt / 1000;
        m.ropeDirty = true;
      }
      for (const T of m.teams) {
        if (m.phase !== 'pull') break;
        const g = room.players.get(T.gisu);
        if (!g || !g.online || g.team !== T.ti) setGisu(room, api, T, T.gisu, 'away');
        const st = status(room, T);
        if (!st.ready) { if (T.readyAt) { T.readyAt = 0; T.dirty = true; } continue; }
        if (!T.readyAt) { T.readyAt = now; T.dirty = true; }
        const gisu = room.players.get(T.gisu);
        if (!gisu?.online || now - Math.max(T.readyAt, m.roundStart) >= RULE.autoMs) pull(room, api, T, true, now);
      }
      if (m.phase === 'pull') {
        if (m.r >= 100) endRound(room, api, 1, 'line', now);
        else if (now >= m.endsAt) endRound(room, api, m.r < -0.05 ? 0 : m.r > 0.05 ? 1 : null, 'time', now);
      }
    }
    if (now - m.lastRope >= RULE.ropeMs) flushRope(room, api, now);
    if (now - m.lastBoard >= RULE.boardMs) {
      m.lastBoard = now;
      (api.toAllIfChanged || api.toAll)('board', { ...roundView(room, now), g: m.teams.map(T => gauge(room, T, now)), online: online(room) });
    }
  },
  ranking(room) {
    const m = room.m || {};
    const ps = [...room.players.values()];
    const teamSum = Object.create(null);
    for (const p of ps) { const k = String(p.team); teamSum[k] = (teamSum[k] || 0) + pm(p).contrib; }
    const [a, b] = m.wins || [0, 0];
    const list = ps.map(p => {
      const s = pm(p), T = Number.isInteger(p.team) ? TEAMS[p.team] : null, teamContrib = teamSum[String(p.team)] || 0;
      const side = m.teams && Number.isInteger(p.team) ? sideOf(m, p.team) : 0;
      const classWin = m.style === 'teams' ? m.winner === side : a > (m.rounds || 1) / 2;
      return { pid: p.pid, name: p.name, score: s.contrib, rank: 1,
        extra: { noRank: true, team: p.team ?? null, teamName: T?.name || '', contrib: s.contrib, teamContrib,
          share: teamContrib ? Math.round((s.contrib / teamContrib) * 1000) / 1000 : 0, classWin: !!classWin,
          roundsWon: (m.wins || [0, 0])[side] || 0, rounds: m.round || 0, side, style: m.style || 'class',
          gisuPulls: s.gisuPulls, correct: p.stats.ok, answered: p.stats.n } };
    });
    // 순위가 아니라 모둠별로 묶어 보여 주기 (모두 rank 1)
    list.sort((x, y) => ((x.extra.team ?? 99) - (y.extra.team ?? 99)) || String(x.name).localeCompare(String(y.name), 'ko'));
    return list;
  },
  snapshot(room, p) {
    const m = room.m;
    if (!m?.teams) return null;
    const now = Date.now();
    return { ...roundView(room, now), g: m.teams.map(T => gauge(room, T, now)), over: m.phase === 'over' || m.phase === 'end',
      result: m.phase === 'over' || m.phase === 'end' ? { wins: m.wins.slice(), winner: m.winner } : null,
      me: p ? { team: p.team ?? null, contrib: pm(p).contrib, inBeat: Number.isInteger(p.team) && !!m.teams[p.team]?.beat.has(p.pid),
        gisu: Number.isInteger(p.team) && m.teams[p.team]?.gisu === p.pid } : null };
  },
};
