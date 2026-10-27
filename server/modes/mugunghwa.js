// 🌸 무궁화 꽃이 피었습니다: 모든 모둠이 함께 도깨비 술래에게 가는 협력 놀이 (docs/modes/mugunghwa.md, docs/COOP_DESIGN.md)
// - 술래가 노래하는 동안(green)에만 답이 인정된다. 돌아보는 동안(red)에 답하거나 화면을 누르면 "들켰다" → 내 발자국만 한 걸음 뒤로 (모둠은 그대로, 탈락 없음).
// - 노래가 끝나면 모둠 말은 그 노래 동안 정답을 낸 "서로 다른 모둠원 수"만큼 나아간다. 온라인 모둠원이 모두 맞히면 +1 (한마음).
// - 술래 앞에 닿으면 "술래 치기": 한 노래 안에 모둠원 모두가 한 번씩 맞혀야 도착. 도착한 모둠의 정답은 가장 뒤처진 모둠에게 +1 (손 내밀기).
// - 모든 모둠이 도착하면 우리 반 승리. 개인 순위 없음 (ranking extra.noRank).
import { TEAMS } from '../teams.js';

// 걸음 수 = K × (한 모둠 평균 인원). 25명·6모둠이 보통 속도로 풀 때 약 5 / 8 / 12분 (docs/modes/mugunghwa.md 시뮬레이션)
export const DIST = { short: 16, normal: 32, long: 50 };
export const SPEED = { slow: 1.3, normal: 1, fast: 0.72 };
export const RULE = {
  readyMs: 3000, greenMin: 4000, greenMax: 8000, redMs: 3000,
  grace: 250,        // 돌아본 직후 0.25초 안에 도착한 답은 노래 때 낸 것으로 친다 (통신 지연)
  tapGrace: 500,     // 돌아본 직후 0.5초 안에 누른 것은 봐준다 (반응 시간)
  mercyAfter: 6,     // 술래 치기를 6번 노래 동안 못 하면 "술래가 봐줘요": 한 명 빼고 모두 맞히면 도착
  flushMs: 300, boardMs: 1000, endDelay: 1600, minD: 8,
};
export const SYL = ['무', '궁', '화', '꽃', '이', '피', '었', '습', '니', '다'];
const STYLES = {
  even: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  slowfast: [3, 3, 3, .6, .6, .5, .5, .5, .5, .5],   // 무~ 궁~ 화~ 꽃이피었습니다!
  pause: [1, 1, 1, 1, 4.5, .7, .7, .7, .7, .7],     // 무궁화 꽃이…… 피었습니다!
  fastslow: [.5, .5, .5, .5, .5, .6, 1, 2.2, 2.6, 2.6], // 무궁화꽃이피었 습…니…다!
  quick: [.6, .6, .6, .6, .6, .6, .6, .6, .6, .6],
};
const pick = a => a[Math.floor(Math.random() * a.length)];
const isTeamIdx = (m, t) => Number.isInteger(t) && t >= 0 && t < m.teams.length;

// 노래 한 번: 길이(ms)와 글자마다 나타나는 시각(ms, 노래 시작 기준). 마지막 '다'는 돌아보기 0.2초 전.
export function makeChant(speed = 'normal') {
  const k = SPEED[speed] || 1;
  const dur = Math.round((RULE.greenMin + Math.random() * (RULE.greenMax - RULE.greenMin)) * k);
  const style = dur < 4500 * k ? pick(['even', 'quick', 'slowfast']) : pick(['even', 'slowfast', 'pause', 'fastslow', 'even']);
  const w = STYLES[style], end = Math.max(600, dur - 200), lead = Math.min(300, dur * 0.05);
  const tot = w.slice(0, -1).reduce((a, b) => a + b, 0);
  let acc = 0;
  const marks = w.map((x, i) => { const at = Math.round(lead + (end - lead) * (acc / tot)); acc += i < w.length - 1 ? x : 0; return at; });
  marks[marks.length - 1] = end;
  return { dur, style, marks };
}

// 플레이어 상태 (늦게 들어온 학생도 같은 모양)
function pm(p) {
  const m = p.m || (p.m = {});
  if (typeof m.contrib !== 'number') Object.assign(m, { contrib: 0, steps: 0, caught: 0, helps: 0, lastCaughtRound: -1, lastTapRound: -1 });
  return m;
}
const members = (room, t) => [...room.players.values()].filter(p => p.team === t);
const onlineIds = (room, t) => members(room, t).filter(p => p.online).map(p => p.pid);

function teamView(room, i) {
  const T = room.m.teams[i], ms = members(room, i);
  return { i, id: T.id, name: T.name, color: T.color, emoji: T.emoji, active: T.active, pos: T.pos, tag: T.tag, arrived: T.arrived,
    order: T.order, tries: T.tries, mercy: T.tag && !T.arrived && T.tries > RULE.mercyAfter, members: ms.length, online: ms.filter(p => p.online).length };
}
const teamsView = room => room.m.teams.map((_, i) => teamView(room, i));
// 이번 노래에서 모둠마다 정답을 낸 친구 (pid 목록)
const curView = m => m.teams.map((_, i) => [...(m.cur[i] || [])]);
function mine(room, p) {
  const s = pm(p), m = room.m;
  return { team: p.team ?? null, contrib: s.contrib, steps: s.steps, caught: s.caught, helps: s.helps, correct: p.stats.ok, answered: p.stats.n,
    counted: isTeamIdx(m, p.team) && !!m.cur[p.team]?.has(p.pid) };
}
function phaseLeft(m, now = Date.now()) { return Math.max(0, m.phaseEnds - now); }
function phaseMsg(room, now = Date.now()) {
  const m = room.m;
  return { phase: m.phase, left: phaseLeft(m, now), round: m.round, speed: m.speed, timeLeft: Math.max(0, m.endsAt - now), D: m.D,
    chant: m.phase === 'green' ? { dur: m.chant.dur, marks: m.chant.marks, style: m.chant.style } : null };
}
function need(room, T, i) {
  const ids = onlineIds(room, i);
  const n = T.tries > RULE.mercyAfter ? Math.max(1, ids.length - 1) : ids.length;
  return { ids, n };
}

function startGreen(room, api, now) {
  const m = room.m;
  m.round++; m.phase = 'green'; m.settled = false;
  m.chant = makeChant(m.speed);
  m.phaseEnds = now + m.chant.dur;
  m.cur = m.teams.map(() => new Set());
  m.helpIn = m.teams.map(() => 0);
  for (const T of m.teams) if (T.tag && !T.arrived) T.tries++;
  api.toAll('phase', phaseMsg(room, now));
}
function startRed(room, api, now) {
  const m = room.m;
  m.phase = 'red'; m.redAt = now; m.phaseEnds = now + RULE.redMs;
  api.toAll('phase', phaseMsg(room, now));
}

// 노래 한 번이 끝나면 (돌아본 뒤 0.25초) 모둠 말을 옮긴다
function settle(room, api) {
  const m = room.m;
  if (m.settled) return;
  m.settled = true;
  const moves = [];
  m.teams.forEach((T, i) => {
    if (!T.active || T.arrived) return;
    const set = m.cur[i], { ids } = need(room, T, i);
    const distinct = set.size, all = distinct > 0 && ids.length > 0 && ids.every(pid => set.has(pid));
    if (T.tag) { // 술래 치기 실패한 노래 (성공은 답을 낸 순간 바로 처리)
      if (tryArrive(room, api, i)) return;
      moves.push({ i, steps: 0, distinct, all, help: 0, pos: T.pos, tag: true, tries: T.tries });
      api.event('shared', null, { team: i, distinct, all, needed: ids.length, phase: m.round, steps: 0, tag: true });
      return;
    }
    const help = m.helpIn[i] || 0, steps = distinct + (all ? 1 : 0) + help;
    const before = T.pos;
    T.pos = Math.min(m.D, T.pos + steps);
    T.contrib += distinct;
    api.event('shared', null, { team: i, distinct, all, needed: ids.length, phase: m.round, steps: T.pos - before, help });
    if (all && ids.length > 1) api.feed(`💞 ${T.emoji} ${T.name} 모둠 한마음! ${distinct}명 모두 맞혀서 +${steps}걸음`);
    if (T.pos >= m.D && !T.tag) {
      T.tag = true; T.tries = 0;
      api.feed(`🎯 ${T.emoji} ${T.name} 모둠이 술래 앞에 왔어요! 술래 치기 도전`);
      api.event('round', null, { team: i, tag: true, phase: m.round });
    }
    moves.push({ i, steps: T.pos - before, distinct, all, help, pos: T.pos, tag: T.tag });
  });
  api.toAll('move', { round: m.round, moves, teams: teamsView(room) });
}

// 술래 치기: 지금 노래에서 필요한 모둠원이 모두 맞혔으면 도착
function tryArrive(room, api, i) {
  const m = room.m, T = m.teams[i];
  if (!T.tag || T.arrived || m.over) return false;
  const { ids, n } = need(room, T, i), set = m.cur[i];
  const got = ids.filter(pid => set.has(pid)).length;
  if (!(got >= n && (got > 0 || ids.length === 0))) return false;
  T.arrived = true; T.order = ++m.arrivedN; T.arrivedAt = Date.now();
  api.event('teamGoal', null, { team: i, order: T.order, phase: m.round, tries: T.tries, mercy: T.tries > RULE.mercyAfter, ms: T.arrivedAt - m.startedAt });
  api.feed(`🏁 ${T.emoji} ${T.name} 모둠 도착! 이제 손 내밀기로 친구 모둠을 도와요`);
  api.toAll('arrive', { i, order: T.order, name: T.name, emoji: T.emoji, color: T.color, teams: teamsView(room) });
  if (m.teams.every(x => !x.active || x.arrived)) finish(room, api, true);
  return true;
}

// 손 내밀기를 받을 모둠: 술래 앞에 닿지 않은 모둠 가운데 가장 뒤 (받을 걸음까지 셈, 같으면 앞 번호)
function behind(m) {
  let best = -1, bv = Infinity;
  m.teams.forEach((T, i) => { if (!T.active || T.arrived || T.tag) return; const v = T.pos + (m.helpIn[i] || 0); if (v < bv) { bv = v; best = i; } });
  return best;
}

function caught(room, p, api, via) {
  const m = room.m, s = pm(p);
  if (s.lastCaughtRound === m.round) return false; // 한 번 돌아볼 때 한 번만
  s.lastCaughtRound = m.round; s.caught++;
  s.steps = Math.max(0, s.steps - 1);
  api.event('caught', p.pid, { team: p.team ?? null, via, phase: m.round });
  api.toAll('oops', { team: p.team ?? null });
  return true;
}

function flush(room, api) {
  const m = room.m;
  m.lastFlush = Date.now();
  if (!m.dirty) return;
  m.dirty = false;
  const helps = m.helpQ; m.helpQ = [];
  api.toAll('prog', { round: m.round, cur: curView(m), helps });
}

function finish(room, api, win) {
  const m = room.m;
  if (m.over) return;
  flush(room, api);
  m.over = true; m.win = win; m.phase = 'over';
  const arrived = m.teams.filter(T => T.active && T.arrived).length, total = m.teams.filter(T => T.active).length;
  if (win) api.event('classGoal', null, { ms: Date.now() - m.startedAt, rounds: m.round, teams: total });
  api.toAll('result', { win, arrived, total, rounds: m.round, teams: teamsView(room),
    text: win ? '우리 반 모두 도착! 술래를 쳤어요!' : '시간이 다 됐어요. 다음엔 꼭!' });
  api.feed(win ? '🎉 모든 모둠이 술래에게 도착했어요! 우리 반 승리!' : `⏰ 시간 끝! ${arrived}/${total} 모둠 도착. 다음엔 꼭!`);
  setTimeout(() => { if (room.m === m && room.state === 'play') room.api.end(); }, RULE.endDelay);
}

export default {
  id: 'mugunghwa',
  name: '무궁화 꽃이 피었습니다',
  selfPaced: true,
  settings: s => ({
    distance: Object.hasOwn(DIST, s.distance) ? s.distance : 'normal',
    minutes: [6, 10, 15].includes(+s.minutes) ? +s.minutes : 10,
    teams: [0, 2, 3, 4, 5, 6].includes(+s.teams) ? +s.teams : 0,
  }),
  start(room, api) {
    const now = Date.now();
    const teams = api.ensureTeams(room.settings.teams || 0);
    for (const p of room.players.values()) { p.m = {}; pm(p); }
    const counts = teams.map((_, i) => members(room, i).length);
    const active = counts.filter(n => n > 0).length || 1;
    const avg = Math.max(1, [...room.players.values()].filter(p => Number.isInteger(p.team)).length / active);
    room.m = {
      D: Math.max(RULE.minD, Math.round((DIST[room.settings.distance] || DIST.normal) * avg)),
      teams: teams.map((T, i) => ({ ...T, active: counts[i] > 0, pos: 0, tag: false, arrived: false, order: 0, tries: 0, contrib: 0 })),
      phase: 'ready', phaseEnds: now + RULE.readyMs, round: 0, redAt: 0, settled: true, speed: 'normal', chant: null,
      cur: teams.map(() => new Set()), helpIn: teams.map(() => 0), helpQ: [], dirty: false,
      endsAt: now + room.settings.minutes * 60e3, startedAt: now, lastFlush: now, lastBoard: 0, arrivedN: 0, over: false, win: false,
    };
    api.toAll('phase', { ...phaseMsg(room, now), teams: teamsView(room) });
    api.feed(`🌸 술래가 나무 앞에 섰어요! 술래까지 ${room.m.D}걸음`);
  },
  onJoin(room, p) {
    p.m = {}; pm(p);
    const m = room.m;
    if (room.state !== 'play' || !m?.teams || m.over) return;
    // 늦게 들어온 학생: 빈 모둠(말이 출발선에 있는)이 아니라 사람이 있는 모둠 가운데 가장 작은 곳으로 (아직 도착하지 않은 모둠 먼저)
    const live = m.teams.map((T, i) => ({ i, T, n: members(room, i).filter(x => x !== p).length })).filter(x => x.T.active);
    if (!live.length) { if (isTeamIdx(m, p.team)) m.teams[p.team].active = true; return; }
    if (isTeamIdx(m, p.team) && m.teams[p.team].active) return;
    live.sort((a, b) => (a.T.arrived - b.T.arrived) || (a.n - b.n) || (a.i - b.i));
    p.team = live[0].i;
  },
  onLeave(room, p, api) { // 술래 치기 중인 모둠에서 친구가 나가면 남은 친구들로 다시 확인
    const m = room.m;
    if (room.state === 'play' && m?.teams && !m.over && m.phase === 'green' && isTeamIdx(m, p.team)) tryArrive(room, api, p.team);
  },
  canAsk: (room) => !!room.m?.teams && !room.m.over && Date.now() < room.m.endsAt,
  onAnswer(room, p, res, api) {
    const m = room.m;
    if (!m?.teams || m.over) return;
    const now = Date.now(), s = pm(p);
    const inGreen = m.phase === 'green' || (m.phase === 'red' && !m.settled && now - m.redAt < RULE.grace);
    if (m.phase === 'ready') return api.toPlayer(p.pid, 'ans', { state: 'early', me: mine(room, p) });
    if (!inGreen) { // 돌아봤을 때 답함 → 들켰다 (답은 세지 않음)
      caught(room, p, api, 'answer');
      return api.toPlayer(p.pid, 'ans', { state: 'caught', me: mine(room, p) });
    }
    if (!res.ok) return api.toPlayer(p.pid, 'ans', { state: 'wrong', me: mine(room, p) });
    if (!isTeamIdx(m, p.team)) return api.toPlayer(p.pid, 'ans', { state: 'cheer', me: mine(room, p) });
    const t = p.team, T = m.teams[t];
    if (T.arrived) { // 손 내밀기
      const to = behind(m);
      if (to < 0) return api.toPlayer(p.pid, 'ans', { state: 'cheer', me: mine(room, p) });
      m.helpIn[to]++; s.helps++; s.contrib++; s.steps++; T.contrib++;
      m.helpQ.push({ from: t, to }); m.dirty = true;
      api.event('help', p.pid, { team: t, toTeam: to, phase: m.round });
      return api.toPlayer(p.pid, 'ans', { state: 'help', to, me: mine(room, p) });
    }
    const set = m.cur[t];
    if (set.has(p.pid)) return api.toPlayer(p.pid, 'ans', { state: 'dup', me: mine(room, p) });
    set.add(p.pid); s.contrib++; s.steps++; m.dirty = true;
    api.toPlayer(p.pid, 'ans', { state: T.tag ? 'tag' : 'counted', me: mine(room, p) });
    if (T.tag) { T.contrib++; flush(room, api); tryArrive(room, api, t); }
  },
  onStudent(room, p, type, data, api, ack) {
    const m = room.m;
    if (type !== 'tap' || !m?.teams || m.over) return ack?.({ ok: false });
    // 돌아봤을 때 화면을 누름 → 들켰다 (돌아본 직후 0.5초는 봐줌, 한 번 돌아볼 때 한 번만)
    if (m.phase !== 'red' || Date.now() - m.redAt < RULE.tapGrace) return ack?.({ ok: true, caught: false });
    const s = pm(p);
    if (s.lastTapRound === m.round) return ack?.({ ok: true, caught: false });
    s.lastTapRound = m.round;
    const c = caught(room, p, api, 'tap');
    ack?.({ ok: true, caught: c, me: mine(room, p) });
  },
  onTeacher(room, type, data, api, ack) {
    const m = room.m;
    if (type === 'speed' && m?.teams && Object.hasOwn(SPEED, data?.v)) {
      m.speed = data.v;
      api.toAll('speed', { speed: m.speed });
      api.feed(`🔁 술래 속도: ${{ slow: '느리게', normal: '보통', fast: '빠르게' }[m.speed]}`);
      return ack?.({ ok: true, speed: m.speed });
    }
    ack?.({ ok: false });
  },
  tick(room, api) {
    const m = room.m;
    if (!m?.teams || m.over) return;
    const now = Date.now();
    if (now - m.lastFlush >= RULE.flushMs) flush(room, api);
    if (m.phase === 'red' && !m.settled && now - m.redAt >= RULE.grace) settle(room, api);
    if (m.over) return;
    if (now >= m.endsAt) return finish(room, api, false);
    if (now >= m.phaseEnds) {
      if (m.phase === 'green') startRed(room, api, now);
      else { if (!m.settled) settle(room, api); if (!m.over) startGreen(room, api, now); }
    }
    if (now - m.lastBoard >= RULE.boardMs && !m.over) {
      m.lastBoard = now;
      (api.toAllIfChanged || api.toAll)('board', { ...phaseMsg(room, now), chant: undefined, teams: teamsView(room), cur: curView(m) });
    }
  },
  ranking(room) {
    const m = room.m || {};
    const ps = [...room.players.values()];
    const sum = Object.create(null);
    for (const p of ps) { const k = String(p.team); sum[k] = (sum[k] || 0) + pm(p).contrib; }
    const list = ps.map(p => {
      const s = pm(p), T = Number.isInteger(p.team) ? TEAMS[p.team] : null, teamContrib = sum[String(p.team)] || 0;
      const MT = m.teams && Number.isInteger(p.team) ? m.teams[p.team] : null;
      return { pid: p.pid, name: p.name, score: s.contrib, rank: 1,
        extra: { noRank: true, team: p.team ?? null, teamName: T?.name || '', contrib: s.contrib, teamContrib,
          share: teamContrib ? Math.round((s.contrib / teamContrib) * 1000) / 1000 : 0, classWin: !!m.win,
          caught: s.caught, helps: s.helps, steps: s.steps, arrived: !!MT?.arrived, order: MT?.order || 0, rounds: m.round || 0,
          correct: p.stats.ok, answered: p.stats.n } };
    });
    list.sort((x, y) => ((x.extra.team ?? 99) - (y.extra.team ?? 99)) || String(x.name).localeCompare(String(y.name), 'ko'));
    return list;
  },
  snapshot(room, p) {
    const m = room.m;
    if (!m?.teams) return null;
    const now = Date.now(), ph = phaseMsg(room, now);
    return { ...ph, teams: teamsView(room), cur: curView(m), over: m.over ? { win: m.win } : null, me: p ? mine(room, p) : null };
  },
};
