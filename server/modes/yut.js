// 모둠 윷판 원정: 우리 반(모든 모둠) vs 도깨비 말. docs/modes/yut.md, docs/COOP_DESIGN.md
// 핵심: 모둠의 "윷 기운"은 서로 다른 모둠원 여럿의 정답으로만 찬다 (같은 친구는 한 번만).
// 기운이 차면 "던지는 사람"(돌아가며 맡는 역할)이 윷을 던지고, 어느 말을 어느 길로 옮길지는 모둠이 의논해서 정한다.
// 다른 모둠 말은 잡지 않는다(함께 가요). 도깨비 말만 잡을 수 있고, 도깨비가 우리 말에 올라오면 그 말은 출발로 돌아간다(탈락 없음).
import { TEAMS } from '../teams.js';

export const RULE = {
  pFlat: 0.6,          // 윷가락 하나가 평평한 면(배)으로 떨어질 확률
  chooseMs: 15000,     // 말 고르기 의논 시간. 지나면 기본 수(가장 뒤에 있는 말, 먼 길)
  throwWaitMs: 15000,  // 던지기 준비 뒤 던지는 사람이 안 누르면 자동으로 던짐
  autoMoveMs: 1800,    // 고를 것이 하나뿐이면 윷 던지는 모습만 보여 주고 자동으로 옮김
  dkFirstMs: 30000,    // 도깨비 첫 던지기 (자리 잡을 시간)
  dkEvery: { 10: 20000, 15: 22000, 20: 25000 }, // 제한 시간별 도깨비 던지기 간격 (시뮬레이션: 보통 반 승리 약 80~90%)
  dkBonusMs: 1800,     // 도깨비도 윷·모면 한 번 더 (같은 규칙)
  dkJitter: 0.15,      // 간격 ±15%
  rush: 0.8,           // 마지막 1/3 시간에는 간격 ×0.8
  laps: 2,             // 도깨비가 두 바퀴를 돌면 도깨비 승
  endDelay: 1600,      // 결과를 보여 준 뒤 끝내기
  stMs: 150,           // 상태 묶어 보내기
  syncMs: 1000,        // 상태 다시 맞추기 (시계 포함)
};

// ---------- 윷판 ----------
// 바깥 20칸: 0(참먹이·출발/도착, 오른쪽 아래) → 1~4(오른쪽 변 위로) → 5(오른쪽 위 모서리) → 6~9 → 10(왼쪽 위) → 11~14 → 15(왼쪽 아래) → 16~19 → 0
// 안쪽 9칸: 5→20→21→22(가운데)→23→24→15, 10→25→26→22→27→28→0
export const S = -1, H = 99; // S = 출발 전(판 밖), H = 도착
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
export const PATHS = {
  A: [S, ...range(1, 19), H],                                      // 먼 길 (바깥) 20걸음
  B: [S, ...range(1, 5), 20, 21, 22, 23, 24, ...range(15, 19), H], // 5에서 지름길 → 가운데 지나 15 쪽 16걸음
  C: [S, ...range(1, 5), 20, 21, 22, 27, 28, H],                   // 5에서 지름길 → 가운데에서 또 지름길 11걸음
  D: [S, ...range(1, 10), 25, 26, 22, 27, 28, H],                  // 10에서 지름길 16걸음
  E: [S, ...range(1, 10), 25, 26, 22, 23, 24, ...range(15, 19), H], // 10에서 지름길 → 가운데에서 먼 길 21걸음
};
export const FORKS = [5, 10, 22];
// 갈림길(모서리·가운데)에 서 있을 때 고를 수 있는 길. 앞부분이 같은 길끼리라 칸 번호(i)는 그대로.
export function forks(path, i) {
  const st = PATHS[path]?.[i];
  if (st === 5) return { short: 'B', long: 'A' };
  if (st === 10) return { short: 'D', long: 'A' };
  if (st === 22) return path === 'B' || path === 'C' ? { short: 'C', long: 'B' } : { short: 'D', long: 'E' };
  return null;
}
// 한 번 옮기기: {path, i, trail(지나간 칸), home}
export function step(path, i, steps, route) {
  let p = path;
  if (steps > 0) { const f = forks(p, i); if (f) p = route === 'short' ? f.short : f.long; }
  const P = PATHS[p];
  if (steps < 0) { // 백도: 한 칸 뒤로. 1번 칸에서 뒤로 가면 출발로.
    const ni = Math.max(0, i - 1);
    return { path: ni === 0 ? 'A' : p, i: ni, trail: [P[ni]], home: false };
  }
  let ni = i; const trail = [];
  for (let k = 0; k < steps && ni < P.length - 1; k++) { ni++; trail.push(P[ni]); }
  return { path: p, i: ni, trail, home: ni === P.length - 1 };
}
// 윷 던지기: 윷가락 4개, 0번은 백도 표시가 있는 가락
export const RESULTS = {
  backdo: { name: '백도', steps: -1 }, do: { name: '도', steps: 1 }, gae: { name: '개', steps: 2 },
  geol: { name: '걸', steps: 3 }, yut: { name: '윷', steps: 4, bonus: true }, mo: { name: '모', steps: 5, bonus: true },
};
export function roll(rng = Math.random) {
  const sticks = [0, 1, 2, 3].map(() => rng() < RULE.pFlat);
  const n = sticks.filter(Boolean).length;
  const key = n === 0 ? 'mo' : n === 1 ? (sticks[0] ? 'backdo' : 'do') : n === 2 ? 'gae' : n === 3 ? 'geol' : 'yut';
  return { key, sticks };
}
// 윷 기운에 필요한 서로 다른 모둠원 수
export const needFor = n => (n <= 1 ? 1 : Math.max(2, Math.ceil(n * 0.6)));

const stOf = pc => PATHS[pc.path][pc.i];
const isDone = pc => stOf(pc) === H;
const onBoard = pc => { const s = stOf(pc); return s !== S && s !== H; };
const remain = pc => PATHS[pc.path].length - 1 - pc.i;
// 도깨비: 바깥길만 돈다. steps = 지금까지 걸음(바퀴 포함). 0 = 출발 전, 20의 배수 = 참먹이(0번 칸)
const dkStation = s => (s <= 0 ? S : s % 20 === 0 ? 0 : s % 20);

// ---------- 플레이어·모둠 ----------
function pm(p) {
  const m = p.m || (p.m = {});
  if (typeof m.contrib !== 'number') Object.assign(m, { contrib: 0, throws: 0, helps: 0 });
  return m;
}
const members = (room, k) => [...room.players.values()].filter(p => p.team === k)
  .sort((a, b) => ((a.joinedAt || 0) - (b.joinedAt || 0)) || (a.pid < b.pid ? -1 : 1));
const onlineOf = (room, k) => members(room, k).filter(p => p.online).length;
const needOf = (room, t) => needFor(onlineOf(room, t.k));
const teamOf = (m, p) => (Number.isInteger(p.team) ? m.byK[p.team] : null) || null;
const nameOf = (room, pid) => room.players.get(pid)?.name || '';
const live = (room, t) => members(room, t.k).length > 0; // 모둠원이 아무도 없으면(모두 내보냄) 승리 조건에서 뺀다
function helpers(room) {
  const m = room.m;
  return [...room.players.values()].filter(p => p.online && teamOf(m, p)?.phase === 'done').length;
}
const helpNeed = room => needFor(helpers(room));
const dirty = room => { room.m.dirty = true; };

function setThrower(room, api, t, pid, reason) {
  if (!pid || pid === t.thrower) return;
  t.thrower = pid;
  api.event('role', pid, { team: t.k, role: 'thrower', reason });
  dirty(room);
}
// after 다음 차례의 모둠원 (접속 중인 친구 먼저)
function nextThrower(room, t, after) {
  const mem = members(room, t.k); if (!mem.length) return null;
  const on = mem.filter(p => p.online), pool = on.length ? on : mem;
  const idx = mem.findIndex(p => p.pid === after);
  for (let s = 1; s <= mem.length; s++) { const p = mem[(idx + s + mem.length) % mem.length]; if (pool.includes(p)) return p.pid; }
  return pool[0].pid;
}
function fixThrower(room, api, t, reason = 'offline') {
  const p = room.players.get(t.thrower);
  if (!p || p.team !== t.k || !p.online) {
    const n = nextThrower(room, t, t.thrower);
    if (n && room.players.get(n)?.online) setThrower(room, api, t, n, reason);
  }
}

// 고를 수 있는 수: 판 위의 말 무더기(업은 말은 함께) + 출발 전 말 하나
function options(room, t, steps) {
  const m = room.m, out = [], dk = dkStation(m.dk.steps);
  const at = (st, k) => (st === S || st === H ? 0 : m.teams.filter(x => x.k !== k).filter(x => x.pieces.some(pc => stOf(pc) === st)).map(x => x.k));
  t.pieces.forEach((pc, idx) => {
    if (isDone(pc)) return;
    const st = stOf(pc);
    if (st === S && steps < 0) return;
    const same = out.find(o => o.at === st);
    if (same) { if (st === S) same.wait++; else same.pieces.push(idx); return; }
    const f = steps > 0 ? forks(pc.path, pc.i) : null;
    const routes = (f ? ['short', 'long'] : [null]).map(route => {
      const r = step(pc.path, pc.i, steps, route), to = r.home ? H : PATHS[r.path][r.i];
      return { route, to, trail: r.trail, home: r.home, left: PATHS[r.path].length - 1 - r.i,
        catch: to !== S && to !== H && to === dk, friends: at(to, t.k) || [] };
    });
    out.push({ piece: idx, pieces: [idx], at: st, wait: st === S ? 1 : 0, routes, remain: remain(pc) });
  });
  for (const o of out) for (const r of o.routes) r.stack = r.to === S || r.to === H ? 0 : t.pieces.filter((pc, j) => !o.pieces.includes(j) && stOf(pc) === r.to).length;
  return out;
}
// 시간이 지나면 기본 수: 가장 뒤에 있는 말(출발 전 말 먼저), 먼 길
const defaultOption = opts => opts.reduce((a, b) => (b.remain > a.remain ? b : a), opts[0]);
function refreshChoices(room) {
  for (const t of room.m.teams) if (t.phase === 'choose' && t.choice) {
    t.choice.options = options(room, t, t.choice.steps);
    if (!t.choice.options.length) { t.choice.steps = 1; t.choice.asDo = true; t.choice.options = options(room, t, 1); }
  }
}

// ---------- 진행 ----------
function ready(room, api, t, bonus) {
  t.phase = 'ready'; t.readyBonus = bonus; t.readyAt = Date.now();
  fixThrower(room, api, t, 'offline');
  if (!bonus) api.event('shared', null, { team: t.k, distinct: t.gauge.size, needed: needOf(room, t), online: onlineOf(room, t.k), pids: [...t.gauge] });
  api.toAll('ready', { team: t.k, thrower: t.thrower, bonus });
  dirty(room);
}
// 모으는 중이면: 공짜 던지기(윷·모·도깨비 잡기·응원) 먼저, 아니면 기운이 찼는지
function settle(room, api, t) {
  if (t.phase !== 'fill' || room.m.over) return;
  if (t.extra > 0) { t.extra--; ready(room, api, t, true); }
  else if (t.gauge.size > 0 && t.gauge.size >= needOf(room, t)) ready(room, api, t, false);
}

function doThrow(room, api, t, by, auto) {
  const m = room.m;
  if (t.phase !== 'ready' || m.over) return false;
  const now = Date.now();
  if (!t.readyBonus) { t.gauge = t.next; t.next = new Set(); }
  const r = roll(typeof m.rng === 'function' ? m.rng : Math.random), R = RESULTS[r.key];
  let steps = R.steps, asDo = false;
  if (steps < 0 && !t.pieces.some(onBoard)) { steps = 1; asDo = true; } // 판에 말이 없을 때 백도는 도처럼 한 칸 앞으로
  const opts = options(room, t, steps);
  t.throws++;
  const tp = room.players.get(by); if (tp && !auto) pm(tp).throws++;
  const single = opts.length === 1 && opts[0].routes.length === 1;
  t.phase = 'choose';
  t.choice = { key: r.key, name: R.name, steps, sticks: r.sticks, bonus: !!R.bonus, asDo, by, auto: !!auto, options: opts,
    deadline: now + RULE.chooseMs, autoAt: single ? now + RULE.autoMoveMs : 0, pick: null };
  m.last = { team: t.k, key: r.key, name: R.name, sticks: r.sticks, asDo, by, t: now };
  api.toAll('throw', { team: t.k, by, byName: nameOf(room, by), key: r.key, name: R.name, steps, sticks: r.sticks, bonus: !!R.bonus, asDo, auto: !!auto, single });
  api.feed(`${TEAMS[t.k].emoji} ${TEAMS[t.k].name} ${auto ? '(자동)' : nameOf(room, by)}: ${R.name}${asDo ? '(도처럼)' : ''}${R.bonus ? ' · 한 번 더!' : ''}`);
  dirty(room);
  return true;
}

function applyMove(room, api, t, opt, route, by, auto) {
  const m = room.m, ch = t.choice, lead = t.pieces[opt.piece];
  const fork = opt.routes.length > 1;
  const r = step(lead.path, lead.i, ch.steps, fork ? route : null);
  for (const idx of opt.pieces) Object.assign(t.pieces[idx], { path: r.path, i: r.i });
  if (fork) api.event('choice', by, { team: t.k, at: opt.at, route, refused: route === 'long', auto: !!auto, steps: ch.steps, stack: opt.pieces.length });
  const to = r.home ? H : PATHS[r.path][r.i];
  let caught = false;
  if (!r.home && to !== S && to === dkStation(m.dk.steps)) { // 도깨비 잡기 → 도깨비는 이번 바퀴 출발로, 우리 모둠은 한 번 더
    m.dk.steps = Math.floor(m.dk.steps / 20) * 20; caught = true; t.extra++;
    api.event('capture', by, { team: t.k, at: to, dkLap: m.dk.steps / 20 });
    api.feed(`🎉 ${TEAMS[t.k].name} 모둠이 도깨비 말을 잡았어요! 한 번 더!`);
  }
  if (ch.bonus) t.extra++;
  const friends = to === S || to === H ? [] : m.teams.filter(x => x.k !== t.k && x.pieces.some(pc => stOf(pc) === to)).map(x => x.k);
  api.toAll('move', { team: t.k, pieces: opt.pieces.slice(), from: opt.at, trail: r.trail, to, home: r.home, route: fork ? route : null,
    caught, friends, by, auto: !!auto, steps: ch.steps, key: ch.key });
  if (r.home) api.feed(`🏠 ${TEAMS[t.k].name} 모둠 말 ${opt.pieces.length}개가 집에 왔어요!`);
  t.choice = null; t.phase = 'fill'; t.readyBonus = false;
  if (t.pieces.every(isDone)) {
    t.phase = 'done'; t.extra = 0; t.doneAt = Date.now();
    api.event('teamGoal', null, { team: t.k, throws: t.throws, ms: t.doneAt - m.startedAt });
    api.feed(`🎊 ${TEAMS[t.k].name} 모둠 말이 모두 집에 왔어요! 이제 응원 기운을 모아요`);
  } else setThrower(room, api, t, nextThrower(room, t, t.thrower), 'turn'); // 던질 때마다 다음 친구에게
  refreshChoices(room);
  dirty(room);
  if (checkWin(room, api)) return;
  settle(room, api, t);
}

function checkWin(room, api) {
  const m = room.m, alive = m.teams.filter(t => live(room, t));
  if (alive.length && alive.every(t => t.phase === 'done')) { finish(room, api, true, 'home'); return true; }
  return false;
}

function dkInterval(room, now) {
  const m = room.m, base = RULE.dkEvery[room.settings.minutes] || RULE.dkEvery[15];
  const rush = m.endsAt - now < (m.endsAt - m.startedAt) / 3 ? RULE.rush : 1;
  const rng = Math.random; // 간격은 검사 RNG와 따로 (던지기 결과만 정해 두기 위해)
  return Math.round(base * rush * (1 - RULE.dkJitter + rng() * RULE.dkJitter * 2));
}
function dkTurn(room, api, now = Date.now()) {
  const m = room.m;
  const r = roll(typeof m.rng === 'function' ? m.rng : Math.random), R = RESULTS[r.key];
  const before = m.dk.steps, goal = RULE.laps * 20, trail = [];
  if (R.steps < 0) { if (m.dk.steps > 0) { m.dk.steps--; trail.push(dkStation(m.dk.steps)); } }
  else for (let k = 0; k < R.steps && m.dk.steps < goal; k++) { m.dk.steps++; trail.push(dkStation(m.dk.steps)); }
  const at = dkStation(m.dk.steps), bumped = [];
  if (at !== S && at !== 0 && m.dk.steps < goal) for (const t of m.teams) {
    const idx = []; t.pieces.forEach((pc, j) => { if (stOf(pc) === at) { idx.push(j); pc.path = 'A'; pc.i = 0; } });
    if (idx.length) {
      bumped.push({ team: t.k, pieces: idx });
      api.event('caught', null, { team: t.k, by: 'dokkaebi', at, pieces: idx.length });
      api.feed(`😝 도깨비 말이 ${TEAMS[t.k].name} 모둠 말 ${idx.length}개를 출발로 보냈어요`);
    }
  }
  m.last = { team: 'dk', key: r.key, name: R.name, sticks: r.sticks, t: now };
  m.dk.nextAt = now + (R.bonus ? RULE.dkBonusMs : dkInterval(room, now));
  const lap = Math.floor(m.dk.steps / 20), lapDone = lap > Math.floor(before / 20) && R.steps > 0;
  api.toAll('dk', { key: r.key, name: R.name, sticks: r.sticks, steps: m.dk.steps, trail, at, lap, lapDone, bumped, goal, nextLeft: m.dk.nextAt - now });
  if (lapDone && m.dk.steps < goal) api.feed(`👀 도깨비 말이 ${lap}바퀴를 돌았어요! 서둘러요`);
  refreshChoices(room);
  dirty(room);
  if (m.dk.steps >= goal) finish(room, api, false, 'dk');
}

function giveHelp(room, api) {
  const m = room.m;
  const left = m.teams.filter(t => t.phase !== 'done' && live(room, t));
  if (!left.length) return;
  const score = t => t.pieces.reduce((a, pc) => a + remain(pc), 0);
  const target = left.reduce((a, b) => (score(b) > score(a) ? b : a), left[0]);
  const from = m.teams.filter(t => t.phase === 'done').map(t => t.k), pids = [...m.help];
  target.extra++;
  api.event('help', null, { to: target.k, from, distinct: pids.length, needed: helpNeed(room), pids });
  api.toAll('help', { to: target.k, from, n: pids.length });
  api.feed(`📣 응원 기운! ${TEAMS[target.k].name} 모둠이 공짜로 한 번 던져요`);
  m.help = new Set();
  settle(room, api, target);
  dirty(room);
}

function contribute(room, api, p, t) {
  const m = room.m, s = pm(p);
  if (t.phase === 'done') { // 다 온 모둠: 응원 기운 (가장 뒤처진 모둠에게 공짜 던지기)
    if (m.help.has(p.pid)) return api.toPlayer(p.pid, 'gain', { kind: 'dup', help: true, contrib: s.contrib });
    m.help.add(p.pid); s.contrib++; s.helps++;
    api.toPlayer(p.pid, 'gain', { kind: 'help', contrib: s.contrib, got: m.help.size, need: helpNeed(room) });
    dirty(room);
    if (m.help.size >= helpNeed(room)) giveHelp(room, api);
    return;
  }
  const set = t.phase === 'ready' && !t.readyBonus ? t.next : t.gauge, need = needOf(room, t);
  if (set.has(p.pid)) return api.toPlayer(p.pid, 'gain', { kind: 'dup', contrib: s.contrib });
  if (set.size >= need) return api.toPlayer(p.pid, 'gain', { kind: 'full', contrib: s.contrib });
  set.add(p.pid); s.contrib++;
  api.toPlayer(p.pid, 'gain', { kind: set === t.next ? 'next' : 'gauge', contrib: s.contrib, got: set.size, need });
  dirty(room);
  settle(room, api, t);
}

function finish(room, api, win, why) {
  const m = room.m;
  if (m.over) return;
  m.over = true; m.win = win; m.why = why;
  const done = m.teams.filter(t => t.phase === 'done').length;
  sendState(room, api);
  const text = win ? '우리 반 승리! 모든 모둠이 집에 왔어요!' : why === 'dk' ? '도깨비 말이 먼저 두 바퀴를 돌았어요. 다음엔 꼭!' : '시간이 다 됐어요. 다음엔 꼭!';
  api.toAll('result', { win, why, text, done, teams: m.teams.length, dkSteps: m.dk.steps, goal: RULE.laps * 20 });
  api.event('classGoal', null, { win, why, done, teams: m.teams.length, ms: Date.now() - m.startedAt });
  api.feed(win ? '🏆 우리 반 승리! 모든 모둠이 도깨비보다 먼저 집에 왔어요' : `💨 ${why === 'dk' ? '도깨비 말이 두 바퀴를 다 돌았어요' : '시간 끝'}… 다음엔 꼭!`);
  setTimeout(() => { if (room.m === m && room.state === 'play') room.api.end(); }, RULE.endDelay);
}

// ---------- 상태 보내기 ----------
function teamView(room, t, now) {
  const ch = t.choice, mem = members(room, t.k);
  return { k: t.k, id: TEAMS[t.k].id, name: TEAMS[t.k].name, color: TEAMS[t.k].color, emoji: TEAMS[t.k].emoji,
    members: mem.map(p => p.pid), online: mem.filter(p => p.online).length, need: needOf(room, t),
    gauge: [...t.gauge], next: [...t.next], phase: t.phase, thrower: t.thrower, readyBonus: !!t.readyBonus, extra: t.extra, throws: t.throws,
    readyLeft: t.phase === 'ready' ? Math.max(0, t.readyAt + RULE.throwWaitMs - now) : 0, live: mem.length > 0,
    pieces: t.pieces.map(pc => ({ st: stOf(pc), path: pc.path, i: pc.i, left: remain(pc) })),
    choice: ch ? { key: ch.key, name: ch.name, steps: ch.steps, sticks: ch.sticks, bonus: ch.bonus, asDo: ch.asDo, by: ch.by, auto: ch.auto,
      options: ch.options, left: Math.max(0, (ch.autoAt || ch.deadline) - now), single: !!ch.autoAt, pick: ch.pick } : null };
}
function state(room, now = Date.now()) {
  const m = room.m;
  return { pieces: m.pieces, laps: RULE.laps, chooseMs: RULE.chooseMs, timeLeft: Math.max(0, m.endsAt - now), total: m.endsAt - m.startedAt,
    dk: { steps: m.dk.steps, st: dkStation(m.dk.steps), lap: Math.floor(m.dk.steps / 20), goal: RULE.laps * 20, nextLeft: Math.max(0, m.dk.nextAt - now) },
    help: { got: [...m.help], need: helpNeed(room), on: helpers(room) },
    teams: m.teams.map(t => teamView(room, t, now)), last: m.last, over: m.over ? { win: m.win, why: m.why } : null };
}
function sendState(room, api, now = Date.now()) {
  const m = room.m; m.dirty = false; m.lastSt = now; m.lastSync = now;
  api.toAll('st', state(room, now));
}

export default {
  id: 'yut',
  name: '모둠 윷판 원정',
  selfPaced: true,
  settings: s => ({
    pieces: [1, 2].includes(+s.pieces) ? +s.pieces : 2,
    minutes: [10, 15, 20].includes(+s.minutes) ? +s.minutes : 15,
    teams: [0, 1, 2, 3, 4].includes(+s.teams) ? +s.teams : 0,
  }),
  start(room, api) {
    const now = Date.now(), n = room.settings.pieces || 2;
    // 0 = 대기실 모둠 그대로 (6모둠까지 그대로 씀: 책상 모둠을 섞지 않기 위해)
    const list = api.ensureTeams(room.settings.teams | 0);
    for (const p of room.players.values()) { p.m = {}; pm(p); }
    room.m = { startedAt: now, endsAt: now + room.settings.minutes * 60e3, pieces: n, teams: [], byK: [], help: new Set(), last: null,
      dk: { steps: 0, nextAt: now + RULE.dkFirstMs }, over: false, win: false, dirty: true, lastSt: 0, lastSync: 0, rng: null };
    list.forEach((T, k) => {
      if (!members(room, k).length) return; // 빈 모둠은 판에 올리지 않음
      const t = { k, pieces: Array.from({ length: n }, () => ({ path: 'A', i: 0 })), gauge: new Set(), next: new Set(),
        phase: 'fill', thrower: null, readyAt: 0, readyBonus: false, extra: 0, choice: null, throws: 0, doneAt: 0 };
      room.m.teams.push(t); room.m.byK[k] = t;
      setThrower(room, api, t, nextThrower(room, t, null), 'start');
    });
    sendState(room, api, now);
    api.feed(`🎲 모둠 윷판 원정 시작! 모둠 ${room.m.teams.length}개 · 말 ${n}개씩 · 도깨비 말이 두 바퀴 돌기 전에 집으로!`);
  },
  onJoin(room, p, api) {
    p.m = {}; pm(p);
    const m = room.m;
    if (room.state !== 'play' || !m?.teams?.length) return;
    if (!teamOf(m, p)) { // 늦게 온 친구: 판에 있는 모둠 중 사람이 가장 적은 모둠으로
      const t = m.teams.reduce((a, b) => (members(room, b.k).length < members(room, a.k).length ? b : a), m.teams[0]);
      p.team = t.k;
    }
    dirty(room);
  },
  onLeave(room, p, api) {
    const m = room.m; if (!m?.teams || m.over) return;
    const t = teamOf(m, p); if (!t) return;
    if (t.thrower === p.pid && t.phase !== 'done') fixThrower(room, api, t, 'offline');
    settle(room, api, t); dirty(room);
  },
  canAsk(room, p) {
    const m = room.m;
    if (!m?.teams || m.over || Date.now() >= m.endsAt) return false;
    return teamOf(m, p)?.phase !== 'choose'; // 말 고르는 동안은 모둠이 함께 의논 (새 문제 쉬기)
  },
  onAnswer(room, p, res, api) {
    const m = room.m;
    if (!m?.teams || m.over || !res?.ok) return;
    let t = teamOf(m, p);
    if (!t && m.teams.length) { // 판에 없는 모둠으로 옮겨진 친구: 가장 작은 모둠으로
      t = m.teams.reduce((a, b) => (members(room, b.k).length < members(room, a.k).length ? b : a), m.teams[0]);
      p.team = t.k; api.sendRoom?.();
    }
    if (t) contribute(room, api, p, t);
  },
  onStudent(room, p, type, data, api, ack) {
    ack = typeof ack === 'function' ? ack : () => {};
    const m = room.m;
    if (!m?.teams || m.over) return ack({ error: '지금은 할 수 없어요' });
    const t = teamOf(m, p);
    if (!t) return ack({ error: '모둠이 없어요. 선생님께 말씀드려요' });
    data = data && typeof data === 'object' ? data : {};
    if (type === 'throw') {
      if (t.phase !== 'ready') return ack({ error: '아직 윷 기운이 다 모이지 않았어요' });
      if (t.thrower !== p.pid) return ack({ error: '이번에 던지는 친구가 아니에요' });
      doThrow(room, api, t, p.pid, false);
      return ack({ ok: true });
    }
    if (type === 'move' || type === 'pick') {
      if (t.phase !== 'choose' || !t.choice) return ack({ error: '지금은 말을 옮길 때가 아니에요' });
      if (t.thrower !== p.pid) return ack({ error: '던진 친구가 정해요. 모둠과 의논해요!' });
      const idx = data.piece;
      if (!Number.isInteger(idx) || idx < 0 || idx >= t.pieces.length) return ack({ error: '말을 다시 골라 주세요' });
      const pc = t.pieces[idx];
      const opt = t.choice.options.find(o => o.pieces.includes(idx) || (o.at === S && stOf(pc) === S));
      if (!opt) return ack({ error: '그 말은 옮길 수 없어요' });
      const fork = opt.routes.length > 1, route = data.route ?? null;
      if (fork && route !== 'short' && route !== 'long') {
        if (type === 'pick' && route == null) { t.choice.pick = { piece: opt.piece, route: null }; api.toAll('pick', { team: t.k, piece: opt.piece, route: null }); return ack({ ok: true }); }
        return ack({ error: '지름길과 먼 길 중에서 골라 주세요', route: true });
      }
      if (!fork && route != null) return ack({ error: '여기는 갈림길이 아니에요' });
      if (type === 'pick') { // 던지는 친구가 고르는 중인 말을 모둠 화면에 함께 보여 줌 (의논용)
        t.choice.pick = { piece: opt.piece, route };
        api.toAll('pick', { team: t.k, piece: opt.piece, route });
        return ack({ ok: true });
      }
      applyMove(room, api, t, opt, fork ? route : null, p.pid, false);
      return ack({ ok: true });
    }
    ack({ error: '알 수 없는 요청이에요' });
  },
  onTeacher(room, type, data, api, ack) {
    ack?.({ ok: false });
  },
  tick(room, api) {
    const m = room.m;
    if (!m?.teams || m.over) return;
    const now = Date.now();
    if (now >= m.endsAt) return finish(room, api, false, 'time');
    for (const t of m.teams) {
      if (m.over) return;
      if (t.phase === 'ready' && now - t.readyAt >= RULE.throwWaitMs) doThrow(room, api, t, t.thrower, true);
      else if (t.phase === 'choose' && t.choice && ((t.choice.autoAt && now >= t.choice.autoAt) || now >= t.choice.deadline)) {
        const ch = t.choice, single = !!ch.autoAt;
        let opt = null, route = null;
        if (single) opt = ch.options[0];
        else if (ch.pick) { opt = ch.options.find(o => o.piece === ch.pick.piece) || null; route = ch.pick.route; }
        if (!opt) opt = defaultOption(ch.options);
        if (opt.routes.length > 1 && route !== 'short' && route !== 'long') route = 'long';
        applyMove(room, api, t, opt, opt.routes.length > 1 ? route : null, ch.by, !single);
      } else if (t.phase === 'fill') settle(room, api, t);
    }
    if (m.over) return;
    if (now >= m.dk.nextAt) dkTurn(room, api, now);
    if (m.over) return;
    if ((m.dirty && now - m.lastSt >= RULE.stMs) || now - m.lastSync >= RULE.syncMs) sendState(room, api, now);
  },
  ranking(room) {
    const m = room.m || {};
    const ps = [...room.players.values()];
    const sum = Object.create(null);
    for (const p of ps) { const k = String(p.team); sum[k] = (sum[k] || 0) + pm(p).contrib; }
    return ps.map(p => {
      const s = pm(p), T = Number.isInteger(p.team) ? TEAMS[p.team] : null, teamContrib = sum[String(p.team)] || 0;
      const t = m.byK && Number.isInteger(p.team) ? m.byK[p.team] : null;
      return { pid: p.pid, name: p.name, score: s.contrib, rank: 1,
        extra: { noRank: true, team: p.team ?? null, teamName: T?.name || '', contrib: s.contrib, teamContrib,
          share: teamContrib ? Math.round((s.contrib / teamContrib) * 1000) / 1000 : 0, classWin: !!m.win,
          throws: s.throws, teamThrows: t?.throws || 0, helps: s.helps, teamHome: t?.phase === 'done',
          correct: p.stats.ok, answered: p.stats.n } };
    });
  },
  snapshot(room, p) {
    if (!room.m?.teams) return null;
    return { ...state(room), me: p ? { pid: p.pid, team: p.team, contrib: pm(p).contrib } : null };
  },
};
