// 무궁화 꽃이 피었습니다 검사: 교사 + 봇 8명(3모둠). 노래/돌아봄 단계는 room.m 을 바꿔 빨리 넘긴다.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms, MODES } from '../server.js';
import mg, { RULE, DIST, SPEED, SYL, makeChant } from '../server/modes/mugunghwa.js';

let url;
const sockets = new Set();
before(() => new Promise(r => server.listen(0, () => { url = `http://localhost:${server.address().port}`; r(); })));
after(() => new Promise(r => { sockets.forEach(s => s.close()); io.close(() => r()); server.closeAllConnections?.(); }));

RULE.endDelay = 300;

const QS = [
  { q: '1+1은?', answers: ['2'], wrong: ['3', '4', '5'] },
  { q: '하늘은 파랗다.', answers: ['O'], wrong: [] },
  { q: '우리나라 수도는?', answers: ['서울'], wrong: [] },
  { q: '물은 몇 도에서 끓을까?', answers: ['100도'], wrong: ['50도', '0도'] },
];
const conn = () => new Promise(r => { const s = Client(url, { transports: ['websocket'], forceNew: true }); sockets.add(s); s.on('connect', () => r(s)); });
const call = (s, ev, d) => s.timeout(4000).emitWithAck(ev, d);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wait = (s, type, pred = () => true, ms = 6000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off('m', f); rej(new Error('timeout ' + type)); }, ms);
  const f = m => { if (m.type === type && pred(m.data)) { clearTimeout(t); s.off('m', f); res(m.data); } }; s.on('m', f);
});
const waitEv = (s, ev, ms = 6000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + ev)), ms); s.once(ev, d => { clearTimeout(t); res(d); }); });

async function setup(n = 8, settings = { distance: 'short', minutes: 6, teams: 3, time: 20 }) {
  const t = await conn();
  const c = await call(t, 't:create', { title: '무궁화반', mode: 'mugunghwa', settings, questions: QS });
  assert.ok(c.code, JSON.stringify(c));
  const evts = []; t.on('evt', e => evts.push(e));
  const bots = [];
  for (let i = 0; i < n; i++) bots.push(await join(c.code, `${i + 1} 친구${i}`, i % 2 ? 'touch' : 'pc'));
  return { t, c, bots, evts, room: () => rooms.get(c.code) };
}
async function join(code, name, device = 'pc', token) {
  const s = await conn();
  const j = await call(s, 's:join', { code, name, device, token });
  assert.ok(j.ok, JSON.stringify(j));
  s.pid = j.pid; s.token = j.token; s.name = name; s.j = j;
  s.on('q', v => { s.qv = v; s.qWait?.(v); });
  return s;
}
// 문제 받기 (s:ask 는 0.7초에 한 번만 되므로 될 때까지 다시)
async function getQ(s) {
  for (let i = 0; i < 40; i++) {
    s.qv = null;
    const got = new Promise(r => { s.qWait = r; setTimeout(() => r(null), 1500); });
    const a = await call(s, 's:ask', {}).catch(() => ({ error: 'x' }));
    if (!a?.error) { const v = s.qv || await got; s.qWait = null; if (v) return v; }
    s.qWait = null; await sleep(150);
  }
  throw new Error('문제를 받지 못함');
}
const givenFor = (qs, v, ok) => { const Q = qs[v.qid]; return ok ? Q.answers[0] : (v.choices ? v.choices.find(x => x !== Q.answers[0]) : '모름'); };
async function answer(s, qs, ok = true, v = null) {
  v ||= await getQ(s);
  const ansP = wait(s, 'ans');
  const res = await call(s, 's:answer', { qid: v.qid, given: givenFor(qs, v, ok) });
  return { res, ans: await ansP };
}
// 단계 넘기기: 지금 단계를 끝내고 원하는 단계 방송을 기다림. 노래는 길게 잡아 둠 (검사 중 저절로 끝나지 않게)
async function toPhase(t, r, phase, hold = 60000) {
  const p = wait(t, 'phase', d => d.phase === phase);
  r.m.phaseEnds = Date.now();
  const d = await p;
  if (phase === 'green' && hold) r.m.phaseEnds = Date.now() + hold;
  if (phase === 'red' && hold) r.m.phaseEnds = Date.now() + hold;
  return d;
}
const teamsOf = (r, bots) => {
  const by = new Map();
  for (const s of bots) { const tm = r.players.get(s.pid).team; if (!by.has(tm)) by.set(tm, []); by.get(tm).push(s); }
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]); // [[team, bots]] 큰 모둠 먼저
};
const closeAll = async (t, ...ss) => { await call(t, 't:close', {}).catch(() => {}); [t, ...ss.flat()].forEach(s => s.close()); };

test('설정 정리 · 노래 박자', () => {
  assert.equal(MODES.mugunghwa, mg, '서버가 같은 모듈을 쓴다');
  assert.deepEqual(mg.settings({}), { distance: 'normal', minutes: 10, teams: 0 });
  assert.deepEqual(mg.settings({ distance: 'long', minutes: '15', teams: '4' }), { distance: 'long', minutes: 15, teams: 4 });
  assert.deepEqual(mg.settings({ distance: 'constructor', minutes: 7, teams: 9 }), { distance: 'normal', minutes: 10, teams: 0 });
  assert.deepEqual(mg.settings({ distance: '__proto__', minutes: null, teams: -1 }), { distance: 'normal', minutes: 10, teams: 0 });
  assert.ok(DIST.short < DIST.normal && DIST.normal < DIST.long);
  assert.equal(SYL.join(''), '무궁화꽃이피었습니다');
  for (const sp of Object.keys(SPEED)) for (let i = 0; i < 200; i++) {
    const c = makeChant(sp);
    assert.ok(c.dur >= RULE.greenMin * SPEED[sp] - 1 && c.dur <= RULE.greenMax * SPEED[sp] + 1, `${sp} ${c.dur}`);
    assert.equal(c.marks.length, SYL.length);
    for (let k = 1; k < c.marks.length; k++) assert.ok(c.marks[k] >= c.marks[k - 1], '글자는 차례로 ' + c.marks);
    assert.equal(c.marks.at(-1), c.dur - 200, "'다'는 돌아보기 0.2초 전");
  }
});

test('노래 때만 인정 · 서로 다른 모둠원 수만큼 · 한마음 +1 · 돌아볼 때 답/누르기 = 들켰다', async () => {
  const { t, c, bots, evts, room } = await setup();
  const startP = wait(t, 'phase', d => d.phase === 'ready');
  assert.ok((await call(t, 't:start', {})).ok);
  const r = room(), st = await startP;
  assert.equal(r.teamCount, 3, '모둠 3개로 나눔');
  assert.equal(r.m.D, Math.round(DIST.short * 8 / 3), '걸음 = K × 평균 모둠 인원');
  assert.equal(st.D, r.m.D); assert.ok(st.teams.length === 3 && st.teams.every(x => x.pos === 0 && x.active));
  const [[tA, A], [tB, B], [tC, C]] = teamsOf(r, bots);
  assert.deepEqual([A.length, B.length, C.length], [3, 3, 2]);

  // 준비 단계: 답해도 세지 않음, 들키지도 않음
  const early = await answer(A[0], c.questions, true);
  assert.equal(early.ans.state, 'early');
  assert.equal(r.players.get(A[0].pid).m.caught, 0);

  const g = await toPhase(t, r, 'green');
  assert.equal(g.round, 1); assert.ok(g.chant.marks.length === 10 && g.left > 0);
  // A: 한 명이 두 번 맞혀도 한 번, 한 명 맞힘, 한 명 틀림 → 2걸음
  assert.equal((await answer(A[0], c.questions, true)).ans.state, 'counted');
  assert.equal((await answer(A[0], c.questions, true)).ans.state, 'dup', '같은 노래에서 두 번째 정답은 다시 세지 않음');
  assert.equal((await answer(A[1], c.questions, true)).ans.state, 'counted');
  const wr = await answer(A[2], c.questions, false);
  assert.equal(wr.res.ok, false); assert.equal(wr.ans.state, 'wrong');
  // B: 모두 맞힘 → 3 + 한마음 1 = 4걸음
  for (const s of B) assert.equal((await answer(s, c.questions, true)).ans.state, 'counted');
  // C: 한 명만 → 1걸음
  assert.equal((await answer(C[0], c.questions, true)).ans.state, 'counted');
  const prog = await wait(t, 'board', d => d.cur[tB].length === 3 && d.cur[tC].length === 1);
  assert.equal(prog.cur[tA].length, 2); assert.equal(prog.cur[tC].length, 1);

  // 돌아보기 직전에 받아 둔 문제를 돌아본 순간(0.25초 안) 내면 노래 때 낸 것으로 친다
  const vGrace = await getQ(C[1]);
  const graceAns = new Promise(res => C[1].on('m', function f(m) {
    if (m.type === 'phase' && m.data.phase === 'red') { C[1].off('m', f); res(call(C[1], 's:answer', { qid: vGrace.qid, given: givenFor(c.questions, vGrace, true) })); }
  }));
  const moveP = wait(t, 'move');
  await toPhase(t, r, 'red');
  await graceAns;
  const mv = await moveP;
  const byT = Object.fromEntries(mv.moves.map(x => [x.i, x]));
  assert.deepEqual([byT[tA].distinct, byT[tA].all, byT[tA].steps], [2, false, 2]);
  assert.deepEqual([byT[tB].distinct, byT[tB].all, byT[tB].steps], [3, true, 4], '한마음 +1');
  assert.deepEqual([byT[tC].distinct, byT[tC].all, byT[tC].steps], [2, true, 3], '0.25초 안의 답은 인정 → C 모두 맞힘');
  assert.equal(r.m.teams[tB].pos, 4);
  const shared = evts.filter(e => e.type === 'shared' && e.data.phase === 1);
  assert.equal(shared.length, 3);
  assert.ok(shared.every(e => typeof e.data.distinct === 'number' && typeof e.data.all === 'boolean' && Number.isInteger(e.data.team)));

  // 돌아본 뒤에 답 → 들켰다: 말은 그대로, 내 발자국만 한 걸음 뒤로
  await sleep(RULE.grace + 50);
  const posBefore = r.m.teams.map(x => x.pos), stepsBefore = r.players.get(A[0].pid).m.steps;
  const late = await answer(A[0], c.questions, true);
  assert.equal(late.res.ok, true, '채점은 그대로 (기록용)');
  assert.equal(late.ans.state, 'caught');
  assert.equal(late.ans.me.steps, stepsBefore - 1);
  assert.equal(r.players.get(A[0].pid).m.caught, 1);
  assert.deepEqual(r.m.teams.map(x => x.pos), posBefore, '모둠 말은 움직이지 않음');
  assert.ok(evts.some(e => e.type === 'caught' && e.pid === A[0].pid && e.data.via === 'answer'));

  // 돌아볼 때 화면 누르기: 처음 0.5초는 봐줌 → 그 뒤엔 들켰다 (한 번 돌아볼 때 한 번만)
  r.m.redAt = Date.now();
  assert.equal((await call(B[0], 's:mode', { type: 'tap', data: {} })).caught, false, '돌아본 직후는 봐줌');
  r.m.redAt = Date.now() - RULE.tapGrace - 10;
  const tap1 = await call(B[1], 's:mode', { type: 'tap', data: {} });
  assert.equal(tap1.caught, true); assert.equal(tap1.me.caught, 1);
  assert.equal((await call(B[1], 's:mode', { type: 'tap', data: {} })).caught, false, '같은 돌아봄에서 두 번은 안 셈');
  assert.ok(evts.some(e => e.type === 'caught' && e.pid === B[1].pid && e.data.via === 'tap'));
  assert.equal(r.m.teams[tB].pos, 4, '들켜도 모둠은 그대로');

  // 다음 노래: 누르기는 들키지 않음, 들킨 친구도 다시 보탤 수 있음, 새 노래에서 다시 셈
  await toPhase(t, r, 'green');
  assert.equal(r.m.round, 2);
  assert.equal((await call(B[2], 's:mode', { type: 'tap', data: {} })).caught, false);
  assert.equal((await answer(A[0], c.questions, true)).ans.state, 'counted');
  const mv2P = wait(t, 'move');
  await toPhase(t, r, 'red');
  const mv2 = await mv2P;
  assert.equal(mv2.moves.find(x => x.i === tA).steps, 1);
  assert.equal(r.m.teams[tA].pos, 3);
  // 순위 대신 기여
  const rk = mg.ranking(r);
  assert.ok(rk.every(x => x.extra.noRank && x.rank === 1 && x.score === x.extra.contrib));
  const a0 = rk.find(x => x.pid === A[0].pid);
  assert.equal(a0.extra.contrib, 2); assert.equal(a0.extra.caught, 1);
  assert.equal(a0.extra.teamContrib, 3); assert.equal(a0.extra.share, 0.667);
  await closeAll(t, bots);
});

test('술래 치기 (모둠 전원) → 도착 · 손 내밀기는 가장 뒤 모둠에게 · 봐주기 · 우리 반 승리', async () => {
  const { t, c, bots, evts, room } = await setup();
  assert.ok((await call(t, 't:start', {})).ok);
  const r = room();
  const [[tA, A], [tB, B], [tC, C]] = teamsOf(r, bots);
  const D = r.m.D;
  await toPhase(t, r, 'green');
  r.m.teams[tA].pos = D - 1; r.m.teams[tB].pos = 10; r.m.teams[tC].pos = 4;
  await answer(A[0], c.questions, true);
  let mvP = wait(t, 'move');
  await toPhase(t, r, 'red');
  let mv = await mvP;
  assert.equal(mv.moves.find(x => x.i === tA).pos, D, '술래 앞에서 멈춤 (넘어가지 않음)');
  assert.equal(r.m.teams[tA].tag, true);
  assert.ok(evts.some(e => e.type === 'round' && e.data.tag && e.data.team === tA));

  // 술래 치기: 한 노래 안에 모둠원 모두 (3명) 맞혀야 함. 2명만 → 아직
  await toPhase(t, r, 'green');
  assert.equal((await answer(A[0], c.questions, true)).ans.state, 'tag');
  await answer(A[1], c.questions, true);
  assert.equal(r.m.teams[tA].arrived, false);
  mvP = wait(t, 'move');
  await toPhase(t, r, 'red');
  mv = await mvP;
  assert.equal(mv.moves.find(x => x.i === tA).steps, 0, '술래 치기 중에는 걸음 없음');
  assert.equal(r.m.teams[tA].arrived, false, '다음 노래에서는 처음부터 다시');
  // 다음 노래: 세 명 모두 → 바로 도착
  await toPhase(t, r, 'green');
  await answer(A[0], c.questions, true); await answer(A[1], c.questions, false); await answer(A[1], c.questions, true);
  const arriveP = wait(t, 'arrive');
  await answer(A[2], c.questions, true);
  const ar = await arriveP;
  assert.equal(ar.i, tA); assert.equal(ar.order, 1);
  assert.ok(evts.some(e => e.type === 'teamGoal' && e.data.team === tA && e.data.order === 1));

  // 손 내밀기: 도착한 모둠의 정답 → 가장 뒤 모둠(C)에게 +1
  const pgP = wait(t, 'prog', d => d.helps?.length > 0);
  const h1 = await answer(A[0], c.questions, true);
  assert.equal(h1.ans.state, 'help'); assert.equal(h1.ans.to, tC);
  const h2 = await answer(A[1], c.questions, true);
  assert.equal(h2.ans.to, tC, 'C(4+1)가 아직 B(10)보다 뒤');
  assert.ok(evts.filter(e => e.type === 'help' && e.data.toTeam === tC).length === 2);
  const pg = await pgP;
  assert.ok(pg.helps.every(x => x.from === tA && x.to === tC));
  await answer(C[0], c.questions, true);
  mvP = wait(t, 'move');
  await toPhase(t, r, 'red');
  mv = await mvP;
  const mc = mv.moves.find(x => x.i === tC);
  assert.equal(mc.help, 2); assert.equal(mc.steps, 1 + 2, '자기 모둠 1 + 손 내밀기 2');
  assert.equal(r.m.teams[tC].pos, 7);
  assert.equal(r.players.get(A[0].pid).m.helps, 1);

  // 봐주기: 술래 치기를 오래 못 하면 한 명 빼고 모두 맞혀도 도착
  r.m.teams[tB].pos = D; r.m.teams[tB].tag = true; r.m.teams[tB].tries = RULE.mercyAfter;
  r.m.teams[tC].pos = D; r.m.teams[tC].tag = true; r.m.teams[tC].tries = 0;
  await toPhase(t, r, 'green');
  assert.ok(r.m.teams[tB].tries > RULE.mercyAfter);
  await answer(B[0], c.questions, true);
  const arB = wait(t, 'arrive');
  await answer(B[1], c.questions, true);
  assert.equal((await arB).i, tB, '3명 중 2명으로 도착 (봐주기)');
  assert.ok(evts.some(e => e.type === 'teamGoal' && e.data.team === tB && e.data.mercy === true));
  // 마지막 모둠 C (2명) 모두 → 우리 반 승리
  const resultP = wait(t, 'result'), studentRes = wait(bots[0], 'result'), endP = waitEv(t, 'end');
  await answer(C[0], c.questions, true);
  await answer(C[1], c.questions, true);
  const res = await resultP;
  assert.equal(res.win, true); assert.equal(res.arrived, 3);
  assert.equal((await studentRes).win, true);
  assert.ok(evts.some(e => e.type === 'classGoal'));
  const end = await endP;
  assert.equal(end.ranking.length, 8);
  for (const x of end.ranking) {
    assert.equal(x.extra.noRank, true); assert.equal(x.extra.classWin, true);
    assert.equal(x.score, x.extra.contrib);
    for (const k of ['team', 'teamName', 'teamContrib', 'share', 'caught', 'helps']) assert.ok(k in x.extra, k);
  }
  for (const tm of [tA, tB, tC]) {
    const rs = end.ranking.filter(x => x.extra.team === tm), sum = rs.reduce((a, x) => a + x.extra.share, 0);
    assert.ok(Math.abs(sum - 1) < 0.01, '모둠 몫 합 = 1');
  }
  assert.equal(room().state, 'end');
  const ask = await call(bots[0], 's:ask', {});
  assert.ok(ask.error, '끝난 뒤에는 문제 없음');
  await closeAll(t, bots);
});

test('시간이 끝나면 "다음엔 꼭!" → 끝', async () => {
  const { t, c, bots, room } = await setup(4, { distance: 'long', minutes: 6, teams: 2, time: 20 });
  assert.ok((await call(t, 't:start', {})).ok);
  const r = room();
  await toPhase(t, r, 'green');
  await answer(bots[0], c.questions, true);
  const resultP = wait(t, 'result'), endP = waitEv(t, 'end');
  r.m.endsAt = Date.now();
  const res = await resultP;
  assert.equal(res.win, false); assert.match(res.text, /다음엔 꼭/);
  const end = await endP;
  assert.ok(end.ranking.every(x => x.extra.classWin === false && x.extra.noRank));
  assert.ok(end.ranking.some(x => x.score === 1), '그동안 보탠 몫은 남음');
  await closeAll(t, bots);
});

test('다시 접속 스냅숏 · 늦게 들어온 학생 · 술래 속도 · 이상한 입력 무시', async () => {
  const { t, c, bots, room } = await setup(4, { distance: 'short', minutes: 10, teams: 6, time: 20 });
  assert.ok((await call(t, 't:start', {})).ok);
  const r = room();
  assert.equal(r.teamCount, 6);
  assert.equal(r.m.teams.filter(x => x.active).length, 4, '빈 모둠은 쉬기 (기다리지 않음)');
  await toPhase(t, r, 'green');
  await answer(bots[0], c.questions, true);
  // 다시 접속
  const s0 = bots[0]; s0.close(); await sleep(150);
  const s = await join(c.code, s0.name, 'pc', s0.token);
  const snap = s.j.snapshot;
  assert.ok(snap, '스냅숏');
  assert.equal(snap.phase, 'green'); assert.ok(snap.left > 0 && snap.timeLeft > 0 && snap.chant?.marks.length === 10);
  assert.equal(snap.D, r.m.D); assert.equal(snap.teams.length, 6);
  assert.equal(snap.me.team, r.players.get(s.pid).team); assert.equal(snap.me.contrib, 1); assert.equal(snap.me.counted, true);
  assert.ok(snap.cur[snap.me.team].includes(s.pid));
  const tr = await call(t, 't:rejoin', { code: c.code, key: c.key });
  assert.ok(tr.snapshot?.teams && tr.snapshot.me === null);
  // 늦게 들어온 학생은 사람이 있는 모둠으로
  const late = await join(c.code, '9 늦은친구');
  const lt = r.players.get(late.pid).team;
  assert.ok(r.m.teams[lt].active, '빈 모둠이 아닌 곳: ' + lt);
  assert.equal((await answer(late, c.questions, true)).ans.state, 'counted');
  // 술래 속도
  assert.equal((await call(t, 't:mode', { type: 'speed', data: { v: 'turbo' } })).ok, false);
  assert.equal((await call(t, 't:mode', { type: 'speed', data: { v: '__proto__' } })).ok, false);
  const sp = wait(s, 'speed');
  assert.deepEqual(await call(t, 't:mode', { type: 'speed', data: { v: 'fast' } }), { ok: true, speed: 'fast' });
  assert.equal((await sp).speed, 'fast');
  const g = await toPhase(t, r, 'green', 0);
  assert.ok(g.chant.dur <= RULE.greenMax * SPEED.fast + 1, '빠르게: 노래가 짧아짐');
  r.m.phaseEnds = Date.now() + 60000;
  // 이상한 입력
  for (const d of [{ type: 'tap', data: null }, { type: '__proto__', data: {} }, { type: 'constructor' }, { type: { x: 1 } }, null, 'abc', 42]) {
    const a = await call(s, 's:mode', d).catch(() => 'noack');
    assert.ok(a === 'noack' || a == null || typeof a === 'object');
  }
  assert.deepEqual(await call(s, 's:answer', { qid: 'x', given: { a: 1 } }), { error: 'late' });
  assert.deepEqual(await call(s, 's:answer', { qid: 9999, given: '2' }), { error: 'late' });
  await call(t, 't:mode', { type: 'speed', data: null }).catch(() => {});
  await call(t, 't:mode', { type: 'whatever' }).catch(() => {});
  await sleep(300);
  assert.equal(room().state, 'play', '게임은 계속');
  assert.ok(r.m.teams.every(x => Number.isInteger(x.pos) && x.pos >= 0 && x.pos <= r.m.D));
  // 선생님이 먼저 끝내도 안전
  const endP = waitEv(t, 'end');
  await call(t, 't:end', {});
  const end = await endP;
  assert.equal(end.ranking.length, 5);
  await closeAll(t, bots, s, late);
});
