// 모둠 윷판 원정 검사: 교사 + 봇 9명(3모둠) → 윷 결과별 이동 · 갈림길 · 업기 · 도깨비 잡기/출발로 · 서로 다른 모둠원 규칙
// · 던지는 사람 돌림 · 다른 친구는 못 던짐 · 자동 던지기/옮기기 · 응원 기운 · 우리 반 승리/아쉬움 · 다시 접속 · 잘못된 요청
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms, MODES } from '../server.js';
import yut, { RULE, PATHS, S, H, step, forks, roll, needFor, RESULTS } from '../server/modes/yut.js';

let url;
const sockets = new Set();
before(() => new Promise(r => server.listen(0, () => { url = `http://localhost:${server.address().port}`; r(); })));
after(() => new Promise(r => { sockets.forEach(s => s.close()); io.close(() => r()); server.closeAllConnections?.(); }));

// 검사를 빠르게: 도깨비는 검사에서 직접 움직일 때만, 기다림은 짧게
RULE.endDelay = 200; RULE.dkFirstMs = 1e9; RULE.autoMoveMs = 250;
const CHOOSE = RULE.chooseMs, WAIT = RULE.throwWaitMs;

const QS = [
  { q: '1+1은?', answers: ['2'], wrong: ['3', '4', '5'] },
  { q: '하늘은 파랗다.', answers: ['O'], wrong: [] },
  { q: '우리나라 수도는?', answers: ['서울'], wrong: ['부산', '대구'] },
  { q: '물은 몇 도에서 끓을까?', answers: ['100도'], wrong: ['50도', '0도'] },
];
// 윷가락 값 (0번 가락 = 백도 표시). rng() < 0.6 이면 평평한 면
const STICKS = { mo: [.9, .9, .9, .9], backdo: [.1, .9, .9, .9], do: [.9, .1, .9, .9], gae: [.1, .1, .9, .9], geol: [.1, .1, .1, .9], yut: [.1, .1, .1, .1] };

const conn = () => new Promise(r => { const s = Client(url, { transports: ['websocket'], forceNew: true }); sockets.add(s); s.on('connect', () => r(s)); });
const call = (s, ev, d) => s.timeout(4000).emitWithAck(ev, d);
const wait = (s, type, pred = () => true, ms = 6000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off('m', f); rej(new Error('timeout ' + type)); }, ms);
  const f = m => { if (m.type === type && pred(m.data)) { clearTimeout(t); s.off('m', f); res(m.data); } }; s.on('m', f);
});
const waitEv = (s, ev, pred = () => true, ms = 6000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off(ev, f); rej(new Error('timeout ' + ev)); }, ms);
  const f = d => { if (pred(d)) { clearTimeout(t); s.off(ev, f); res(d); } }; s.on(ev, f);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('until timeout'); await sleep(20); } }

async function setup(n = 9, settings = { teams: 3, pieces: 2, minutes: 10, time: 10 }) {
  const t = await conn();
  const c = await call(t, 't:create', { title: '윷반', mode: 'yut', settings, questions: QS });
  assert.ok(c.code, JSON.stringify(c));
  t.evts = []; t.on('evt', e => t.evts.push(e));
  const bots = [], byPid = Object.create(null);
  for (let i = 0; i < n; i++) {
    const s = await conn();
    const j = await call(s, 's:join', { code: c.code, name: `${i + 1} 친구${i}`, device: i % 2 ? 'touch' : 'pc' });
    assert.ok(j.ok, JSON.stringify(j));
    s.pid = j.pid; s.token = j.token; s.name = `${i + 1} 친구${i}`; s.gains = []; s.on('m', m => { if (m.type === 'gain') s.gains.push(m.data); });
    bots.push(s); byPid[j.pid] = s;
  }
  const st = await call(t, 't:start', {});
  assert.ok(st.ok, JSON.stringify(st));
  const room = () => rooms.get(c.code);
  const q = [];
  room().m.rng = () => (q.length ? q.shift() : Math.random());
  const env = { t, c, bots, byPid, room, q, m: () => room().m,
    team: k => room().m.byK[k],
    teamBots: k => bots.filter(s => room().players.get(s.pid).team === k) };
  return env;
}
async function answer(env, s, ok) {
  const qP = waitEv(s, 'q', () => true, 3000);
  const a = await call(s, 's:ask', {});
  assert.ok(!a?.error, 'ask ' + JSON.stringify(a));
  const v = await qP, Q = QS[v.qid];
  const given = ok ? Q.answers[0] : (v.choices ? v.choices.find(x => x !== Q.answers[0]) : '모름');
  return call(s, 's:answer', { qid: v.qid, given });
}
// k 모둠이 key 를 던지게: 기운이 없으면 공짜 던지기로 준비시킨다
async function throwAs(env, k, key) {
  const t = env.team(k);
  if (t.phase !== 'ready') { t.extra++; await until(() => t.phase === 'ready'); }
  env.q.push(...STICKS[key]);
  const s = env.byPid[t.thrower];
  const thP = wait(env.t, 'throw', d => d.team === k);
  const r = await call(s, 's:mode', { type: 'throw', data: {} });
  assert.ok(r.ok, JSON.stringify(r));
  return thP;
}
// 던지고 옮기기. pick 이 없으면 자동 옮김(고를 것이 하나)을 기다린다
async function play(env, k, key, pick) {
  const mvP = wait(env.t, 'move', d => d.team === k, 4000);
  const th = await throwAs(env, k, key);
  if (pick) {
    const s = env.byPid[env.team(k).thrower];
    const r = await call(s, 's:mode', { type: 'move', data: pick });
    assert.ok(r.ok, JSON.stringify(r));
  }
  return { th, mv: await mvP };
}
const stations = t => t.pieces.map(pc => PATHS[pc.path][pc.i]);
const place = (t, idx, path, st) => { const i = PATHS[path].indexOf(st); assert.ok(i >= 0); t.pieces[idx] = { path, i }; };

// ---------------- 규칙 (순수 함수) ----------------
test('설정 정리 · 윷판 길 · 윷 결과 확률', () => {
  assert.equal(MODES.yut, yut, '서버가 같은 모듈을 쓴다');
  assert.deepEqual(yut.settings({}), { pieces: 2, minutes: 15, teams: 0 });
  assert.deepEqual(yut.settings({ pieces: '1', minutes: '20', teams: '4' }), { pieces: 1, minutes: 20, teams: 4 });
  assert.deepEqual(yut.settings({ pieces: 3, minutes: 7, teams: 9 }), { pieces: 2, minutes: 15, teams: 0 });
  assert.deepEqual(yut.settings({ pieces: 'constructor', minutes: {}, teams: -1 }), { pieces: 2, minutes: 15, teams: 0 });
  // 29칸: 바깥 0~19, 안쪽 20~28
  const all = new Set(Object.values(PATHS).flat().filter(x => x !== S && x !== H)); all.add(0);
  assert.equal(all.size, 29);
  assert.deepEqual(Object.fromEntries(Object.entries(PATHS).map(([k, p]) => [k, p.length - 1])), { A: 20, B: 16, C: 11, D: 16, E: 21 });
  // 도개걸윷모 (출발에서)
  for (const [key, n] of [['do', 1], ['gae', 2], ['geol', 3], ['yut', 4], ['mo', 5]]) assert.equal(step('A', 0, RESULTS[key].steps).trail.at(-1), n);
  // 모서리 5: 지름길 → 20, 21, 22 / 먼 길 → 6, 7, 8
  assert.deepEqual(step('A', 5, 3, 'short').trail, [20, 21, 22]);
  assert.deepEqual(step('A', 5, 3, 'long').trail, [6, 7, 8]);
  // 가운데(5쪽에서 옴): 지름길 → 27, 28, 도착 / 먼 길 → 23, 24, 15
  const c = step('A', 5, 3, 'short');
  assert.deepEqual(step(c.path, c.i, 3, 'short'), { path: 'C', i: 11, trail: [27, 28, H], home: true });
  assert.deepEqual(step(c.path, c.i, 3, 'long').trail, [23, 24, 15]);
  // 가운데를 지나가기만 하면 그대로 15 쪽으로
  assert.deepEqual(step('B', PATHS.B.indexOf(21), 3).trail, [22, 23, 24]);
  // 모서리 10: 지름길 25, 26, 22, 27, 28 / 가운데에서 먼 길 23, 24
  assert.deepEqual(step('A', 10, 5, 'short').trail, [25, 26, 22, 27, 28]);
  const d = step('A', 10, 3, 'short'); assert.equal(PATHS[d.path][d.i], 22);
  assert.deepEqual(step(d.path, d.i, 2, 'long').trail, [23, 24]);
  assert.equal(forks('A', 15), null, '15는 갈림길이 아님');
  assert.equal(forks('A', 3), null);
  // 백도: 한 칸 뒤, 1에서는 출발로, 지름길 첫 칸에서는 모서리로
  assert.deepEqual(step('A', 3, -1), { path: 'A', i: 2, trail: [2], home: false });
  assert.deepEqual(step('A', 1, -1), { path: 'A', i: 0, trail: [S], home: false });
  assert.equal(PATHS.B[step('B', PATHS.B.indexOf(20), -1).i], 5);
  // 마지막 칸에서 넘치면 도착
  assert.equal(step('A', 18, 5).home, true);
  // 서로 다른 모둠원 수
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 10].map(needFor), [1, 1, 2, 2, 3, 3, 4, 6]);
  // 윷가락 4개 (평평한 면 0.6): 도·개·걸·윷·모·백도 비율
  const cnt = Object.create(null); const N = 40000;
  for (let i = 0; i < N; i++) { const r = roll(); cnt[r.key] = (cnt[r.key] || 0) + 1; assert.equal(r.sticks.length, 4); }
  const want = { backdo: .0384, do: .1152, gae: .3456, geol: .3456, yut: .1296, mo: .0256 };
  for (const [k, p] of Object.entries(want)) assert.ok(Math.abs(cnt[k] / N - p) < .012, `${k} ${cnt[k] / N}`);
  assert.equal(roll(() => .9).key, 'mo'); assert.equal(roll(() => .1).key, 'yut');
});

// ---------------- 진행 ----------------
test('서로 다른 모둠원 정답으로 기운 · 던지는 사람만 던지기/옮기기 · 돌림 · 윷 결과별 이동 · 업기', async () => {
  const env = await setup();
  const { t } = env;
  const st0 = await wait(t, 'st');
  assert.equal(st0.teams.length, 3);
  assert.ok(st0.teams.every(x => x.members.length === 3 && x.need === 2 && x.pieces.length === 2 && x.pieces.every(p => p.st === S)));
  assert.ok(t.evts.filter(e => e.type === 'role').length >= 3, '처음 던지는 사람 기록');
  const k = 0, T = env.team(k), [a, b, c] = env.teamBots(k);
  // a가 두 번 맞혀도 한 번만 (기운 1/2)
  assert.equal((await answer(env, a, true)).ok, true);
  await sleep(750);
  assert.equal((await answer(env, a, true)).ok, true);
  await until(() => a.gains.length >= 2);
  assert.deepEqual(a.gains.map(g => g.kind), ['gauge', 'dup']);
  assert.equal(T.gauge.size, 1); assert.equal(T.phase, 'fill');
  // 틀린 답은 세지 않음
  await answer(env, b, false); await sleep(50);
  assert.equal(T.gauge.size, 1);
  // 다른 친구 b가 맞히면 가득 → 던질 준비, 'shared' 기록
  const readyP = wait(t, 'ready', d => d.team === k);
  await sleep(750); await answer(env, b, true);
  const rd = await readyP;
  assert.equal(rd.bonus, false); assert.equal(T.phase, 'ready');
  await until(() => t.evts.some(e => e.type === 'shared'));
  const sh = t.evts.find(e => e.type === 'shared');
  assert.equal(sh.data.team, k); assert.equal(sh.data.distinct, 2); assert.equal(sh.data.needed, 2);
  // 던지는 사람이 아니면 못 던짐
  const thrower = T.thrower, others = env.teamBots(k).filter(s => s.pid !== thrower);
  assert.ok((await call(others[0], 's:mode', { type: 'throw', data: {} })).error);
  assert.ok((await call(env.teamBots(1)[0], 's:mode', { type: 'throw', data: {} })).error, '다른 모둠도 못 던짐');
  // 개 → 말 하나뿐이라 자동으로 2번 칸
  env.q.push(...STICKS.gae);
  const mvP = wait(t, 'move', d => d.team === k);
  assert.ok((await call(env.byPid[thrower], 's:mode', { type: 'throw', data: {} })).ok);
  assert.ok((await call(env.byPid[thrower], 's:mode', { type: 'throw', data: {} })).error, '두 번 연속 못 던짐');
  const mv = await mvP;
  assert.deepEqual(mv.trail, [1, 2]); assert.equal(mv.key, 'gae');
  assert.deepEqual(stations(T), [2, S]);
  // 돌림: 다음 친구에게
  assert.notEqual(T.thrower, thrower, '던지는 사람이 바뀜');
  await until(() => t.evts.some(e => e.type === 'role' && e.pid === T.thrower && e.data.reason === 'turn'));
  // 이제 고를 것이 둘 (2번 칸 말, 출발 말): 다른 친구는 못 옮김, 잘못된 말 번호도 안 됨
  const th = await throwAs(env, k, 'geol');
  assert.equal(th.key, 'geol'); assert.equal(th.single, false);
  assert.equal(T.phase, 'choose');
  const nonT = env.teamBots(k).find(s => s.pid !== T.thrower), me = env.byPid[T.thrower];
  assert.ok((await call(nonT, 's:mode', { type: 'move', data: { piece: 0 } })).error);
  for (const bad of [{ piece: -1 }, { piece: 2 }, { piece: 0.5 }, { piece: '0' }, {}, { piece: 0, route: 'short' }, { piece: 0, route: 'banana' }])
    assert.ok((await call(me, 's:mode', { type: 'move', data: bad })).error, JSON.stringify(bad));
  assert.ok((await call(me, 's:mode', { type: 'fly', data: {} })).error, '모르는 요청');
  // 고르는 동안 이 모둠은 새 문제 쉬기 (의논)
  assert.ok((await call(nonT, 's:ask', {})).error);
  // 고르는 중인 말 보여 주기 → 모둠 화면에
  const pkP = wait(t, 'pick', d => d.team === k);
  assert.ok((await call(me, 's:mode', { type: 'pick', data: { piece: 1 } })).ok);
  assert.equal((await pkP).piece, 1);
  const mv2P = wait(t, 'move', d => d.team === k);
  assert.ok((await call(me, 's:mode', { type: 'move', data: { piece: 1 } })).ok);
  assert.deepEqual((await mv2P).trail, [1, 2, 3]);
  assert.deepEqual(stations(T), [2, 3]);
  // 백도: 3 → 2 (업기 됨: 같은 칸)
  let r = await play(env, k, 'backdo', { piece: 1 });
  assert.deepEqual(r.mv.trail, [2]); assert.deepEqual(stations(T), [2, 2]);
  // 업기: 함께 움직임 (고를 것 하나 → 자동), 윷 → 한 번 더
  r = await play(env, k, 'yut');
  assert.deepEqual(r.mv.pieces, [0, 1]); assert.deepEqual(stations(T), [6, 6]);
  assert.equal(r.th.bonus, true);
  await until(() => T.phase === 'ready'); assert.equal(T.readyBonus, true, '윷은 기운 없이 한 번 더');
  r = await play(env, k, 'mo'); // 6 + 5 = 11, 또 한 번 더
  assert.deepEqual(stations(T), [11, 11]);
  await until(() => T.phase === 'ready'); assert.equal(T.readyBonus, true);
  r = await play(env, k, 'do');
  assert.deepEqual(stations(T), [12, 12]);
  await sleep(150); assert.equal(T.phase, 'fill', '도는 한 번 더 없음');
  // 다른 모둠 말과는 같은 칸에 함께 (잡지 않음)
  const U = env.team(1); place(U, 0, 'A', 11);
  r = await play(env, 1, 'do', { piece: 0 });
  assert.deepEqual(r.mv.friends, [k]);
  assert.deepEqual(stations(U), [12, S]); assert.deepEqual(stations(T), [12, 12], '다른 모둠 말은 그대로');
});

test('갈림길: 지름길·먼 길 고르기 · 거절 기록 · 도깨비 잡기 · 도깨비가 보낸 말 · 자동 던지기/옮기기', async () => {
  const env = await setup();
  const { t } = env;
  const k = 1, T = env.team(k);
  place(T, 0, 'A', 5); place(T, 1, 'A', 10);
  // 모서리 5: 길을 안 고르면 안 됨
  await throwAs(env, k, 'geol');
  const me = env.byPid[T.thrower];
  const opts = T.choice.options;
  assert.equal(opts.length, 2); assert.ok(opts.every(o => o.routes.length === 2));
  const e1 = await call(me, 's:mode', { type: 'move', data: { piece: 0 } });
  assert.ok(e1.error && e1.route);
  const mvP = wait(t, 'move', d => d.team === k);
  assert.ok((await call(me, 's:mode', { type: 'move', data: { piece: 0, route: 'short' } })).ok);
  assert.deepEqual((await mvP).trail, [20, 21, 22]);
  assert.deepEqual(stations(T), [22, 10]);
  await until(() => t.evts.some(e => e.type === 'choice'));
  let ch = t.evts.filter(e => e.type === 'choice');
  assert.equal(ch[0].data.route, 'short'); assert.equal(ch[0].data.refused, false); assert.equal(ch[0].data.at, 5);
  // 모서리 10에서 먼 길 = 지름길 거절
  let r = await play(env, k, 'gae', { piece: 1, route: 'long' });
  assert.deepEqual(r.mv.trail, [11, 12]);
  await until(() => t.evts.filter(e => e.type === 'choice').length >= 2);
  ch = t.evts.filter(e => e.type === 'choice');
  assert.equal(ch[1].data.refused, true); assert.equal(ch[1].data.at, 10);
  // 가운데에서 지름길: 22 → 27, 28, 도착
  r = await play(env, k, 'geol', { piece: 0, route: 'short' });
  assert.deepEqual(r.mv.trail, [27, 28, H]); assert.equal(r.mv.home, true);
  assert.deepEqual(stations(T), [H, 12]);

  // 도깨비 잡기: 도깨비 7번 칸, 우리 말 4번 칸 → 걸
  const m = env.m(), U = env.team(2);
  m.dk.steps = 7; place(U, 0, 'A', 4);
  r = await play(env, 2, 'geol', { piece: 0 });
  assert.equal(r.mv.caught, true); assert.equal(m.dk.steps, 0, '도깨비는 출발로');
  await until(() => U.phase === 'ready'); assert.equal(U.readyBonus, true, '잡으면 한 번 더');
  assert.ok(t.evts.some(e => e.type === 'capture' && e.data.team === 2));
  // 도깨비가 우리 말에 올라오면 그 말은 출발로 (업은 말도 함께)
  place(U, 0, 'A', 3); place(U, 1, 'A', 3);
  m.dk.steps = 1; env.q.push(...STICKS.gae);
  const dkP = wait(t, 'dk');
  m.dk.nextAt = 0;
  const dk = await dkP;
  assert.deepEqual(dk.trail, [2, 3]); assert.deepEqual(dk.bumped, [{ team: 2, pieces: [0, 1] }]);
  assert.deepEqual(stations(U), [S, S]);
  assert.ok(t.evts.some(e => e.type === 'caught' && e.data.team === 2 && e.data.pieces === 2));
  m.dk.nextAt = Infinity;
  // 던질 준비(공짜)였던 U 모둠: 던지는 사람이 안 누르면 자동 던지기, 고를 것이 여럿이면 시간 뒤 기본 수
  place(U, 1, 'A', 8);
  RULE.throwWaitMs = 300; RULE.chooseMs = 400;
  try {
    env.q.push(...STICKS.gae);
    const thP = wait(t, 'throw', d => d.team === 2 && d.auto);
    const mvAuto = wait(t, 'move', d => d.team === 2);
    U.readyAt = Date.now();
    const th = await thP; assert.equal(th.key, 'gae');
    const mv = await mvAuto;
    assert.equal(mv.auto, true); assert.deepEqual(mv.pieces, [0], '기본: 가장 뒤에 있는 말(출발 말)');
    assert.deepEqual(stations(U), [2, 8]);
    // 갈림길에서 시간이 지나면 먼 길 (거절, auto)
    place(U, 0, 'A', 5); place(U, 1, 'A', 10);
    const mvF = wait(t, 'move', d => d.team === 2);
    await throwAs(env, 2, 'do');
    const fm = await mvF;
    assert.equal(fm.auto, true); assert.equal(fm.route, 'long'); assert.deepEqual(fm.pieces, [0], '5에 있는(더 뒤) 말');
    assert.deepEqual(stations(U), [6, 10]);
    await until(() => t.evts.some(e => e.type === 'choice' && e.data.auto));
  } finally { RULE.throwWaitMs = WAIT; RULE.chooseMs = CHOOSE; }
  // 판에 말이 없을 때 백도는 도처럼
  const V = env.team(0);
  const th = await throwAs(env, 0, 'backdo');
  assert.equal(th.asDo, true); assert.equal(th.steps, 1);
  await until(() => V.phase !== 'choose');
  assert.deepEqual(stations(V), [1, S]);
});

test('응원 기운 · 우리 반 승리 · 기여 결과 · 다시 접속', async () => {
  const env = await setup();
  const { t } = env;
  const T0 = env.team(0), T1 = env.team(1), T2 = env.team(2);
  // 0모둠: 도착 바로 앞(업기) → 도 → 모두 집
  place(T0, 0, 'A', 19); place(T0, 1, 'A', 19);
  let r = await play(env, 0, 'do');
  assert.equal(r.mv.home, true); assert.equal(T0.phase, 'done');
  assert.ok(t.evts.some(e => e.type === 'teamGoal' && e.data.team === 0));
  // 1모둠은 많이 남음, 2모둠은 조금 남음 → 응원은 1모둠에게
  place(T2, 0, 'A', 18); place(T2, 1, 'A', 18);
  const helpP = wait(t, 'help');
  const [h1, h2] = env.teamBots(0);
  await answer(env, h1, true); await answer(env, h2, true);
  const hp = await helpP;
  assert.equal(hp.to, 1); assert.equal(hp.n, 2);
  await until(() => T1.phase === 'ready'); assert.equal(T1.readyBonus, true);
  await until(() => t.evts.some(e => e.type === 'help'));
  assert.equal(t.evts.find(e => e.type === 'help').data.distinct, 2);
  assert.deepEqual(h1.gains.at(-1).kind, 'help');
  // 다시 접속: 고르는 중 상태가 스냅숏에 들어 있음
  place(T1, 0, 'A', 3);
  await throwAs(env, 1, 'gae');
  assert.equal(T1.phase, 'choose');
  const who = env.teamBots(1)[0];
  who.close(); await sleep(150);
  const s2 = await conn();
  const j = await call(s2, 's:join', { code: env.c.code, name: who.name, token: who.token });
  assert.ok(j.ok && j.pid === who.pid);
  const snap = j.snapshot;
  assert.ok(snap && snap.teams.length === 3);
  const v1 = snap.teams.find(x => x.k === 1);
  assert.equal(v1.phase, 'choose'); assert.equal(v1.choice.key, 'gae');
  assert.ok(v1.choice.left > 0 && v1.choice.left <= RULE.chooseMs);
  assert.equal(v1.choice.options.length, 2);
  assert.ok(snap.timeLeft > 0 && snap.dk.goal === 40);
  assert.equal(snap.me.pid, who.pid);
  env.byPid[who.pid] = s2; s2.pid = who.pid;
  // 교사 다시 접속
  const t2 = await conn();
  const tj = await call(t2, 't:rejoin', { code: env.c.code, key: env.c.key });
  assert.equal(tj.snapshot.teams.length, 3);
  // 던지는 사람이 나가면 다음 친구가 이어 받음
  const thr = env.byPid[T1.thrower];
  const before = T1.thrower;
  thr.close(); await sleep(200);
  assert.notEqual(T1.thrower, before);
  assert.ok(env.room().players.get(T1.thrower).online);
  const me = env.byPid[T1.thrower];
  assert.ok((await call(me, 's:mode', { type: 'move', data: { piece: 0 } })).ok);
  await until(() => T1.phase !== 'choose');
  // 나머지 모둠 모두 집으로 → 우리 반 승리 → 끝
  place(T1, 0, 'A', 19); place(T1, 1, 'A', 19);
  await play(env, 1, 'do');
  const resP = wait(t, 'result');
  const endP = waitEv(t, 'end');
  await play(env, 2, 'gae');
  const res = await resP;
  assert.equal(res.win, true); assert.equal(res.why, 'home');
  const end = await endP;
  const rk = end.ranking;
  assert.equal(rk.length, 9);
  for (const x of rk) {
    assert.equal(x.extra.noRank, true); assert.equal(x.extra.classWin, true);
    assert.equal(x.score, x.extra.contrib); assert.ok(['청룡', '주작', '봉황'].includes(x.extra.teamName));
    assert.ok(typeof x.extra.throws === 'number' && x.extra.share >= 0 && x.extra.share <= 1);
  }
  const helper = rk.find(x => x.pid === h1.pid);
  assert.equal(helper.extra.contrib, 1); assert.equal(helper.extra.teamContrib, 2);
  assert.equal(helper.extra.share, 0.5);
  assert.ok(t.evts.some(e => e.type === 'classGoal' && e.data.win));
  assert.equal(env.room().state, 'end');
});

test('도깨비가 두 바퀴 → 아쉬운 결과 · 시간 끝', async () => {
  const env = await setup(6, { teams: 2, pieces: 1, minutes: 10, time: 10 });
  const { t } = env;
  const m = env.m();
  assert.equal(m.teams.length, 2); assert.equal(m.teams[0].pieces.length, 1);
  // 도깨비도 윷·모면 곧바로 한 번 더 (같은 규칙)
  env.q.push(...STICKS.yut);
  const dk1P = wait(t, 'dk');
  m.dk.nextAt = 0;
  const dk1 = await dk1P;
  assert.deepEqual(dk1.trail, [1, 2, 3, 4]); assert.ok(dk1.nextLeft <= RULE.dkBonusMs);
  m.dk.nextAt = Infinity;
  m.dk.steps = 38; env.q.push(...STICKS.gae);
  const resP = wait(t, 'result'), endP = waitEv(t, 'end');
  m.dk.nextAt = 0;
  const res = await resP;
  assert.equal(res.win, false); assert.equal(res.why, 'dk');
  const end = await endP;
  assert.ok(end.ranking.every(x => x.extra.noRank && x.extra.classWin === false));
  // 끝난 뒤 요청은 조용히 거절
  assert.equal(env.room().state, 'end');

  const env2 = await setup(3, { teams: 0, pieces: 2, minutes: 10, time: 10 });
  assert.ok(env2.m().teams.length >= 1);
  const res2P = wait(env2.t, 'result');
  env2.m().endsAt = Date.now();
  const res2 = await res2P;
  assert.equal(res2.win, false); assert.equal(res2.why, 'time');
});

test('혼자인 모둠 · 늦게 온 친구 · 잘못된 데이터', async () => {
  const env = await setup(2, { teams: 2, pieces: 2, minutes: 10, time: 10 });
  const st = await wait(env.t, 'st');
  assert.ok(st.teams.every(x => x.need === 1 && x.members.length === 1));
  const s = env.bots[0], k = env.room().players.get(s.pid).team, T = env.team(k);
  const rd = wait(env.t, 'ready', d => d.team === k);
  await answer(env, s, true);
  await rd;
  assert.equal(T.thrower, s.pid, '혼자면 늘 내 차례');
  // 늦게 온 친구는 판에 있는 모둠으로
  const late = await conn();
  const j = await call(late, 's:join', { code: env.c.code, name: '99 늦게' });
  assert.ok(j.ok);
  const p = env.room().players.get(j.pid);
  assert.ok(env.m().byK[p.team], '판에 있는 모둠');
  // 이상한 데이터에도 서버는 계속
  for (const d of [null, 'x', 5, [], { type: 'throw', data: 'zz' }, { type: { a: 1 } }, { type: 'move', data: { piece: 1e9, route: {} } }])
    await call(late, 's:mode', d).catch(() => {});
  assert.ok((await call(late, 's:mode', { type: 'throw', data: null })).error);
  assert.equal(env.room().state, 'play');
  const st2 = await wait(env.t, 'st', x => x.teams.some(tm => tm.members.includes(j.pid)));
  assert.ok(st2);
});
