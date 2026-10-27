// 다 함께 줄다리기 검사: 서로 다른 모둠원 규칙 · 기수 돌림 · 자동 영차 · 판 승패 · 세 판 · 청홍전 · 다시 접속 · 잘못된 메시지
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms, MODES } from '../server.js';
import tug, { RULE, needFor } from '../server/modes/tug.js';
import { assignTeams } from '../server/teams.js';

let url;
const sockets = new Set();
before(() => new Promise(r => server.listen(0, () => { url = `http://localhost:${server.address().port}`; r(); })));
after(() => new Promise(r => { sockets.forEach(s => s.close()); io.close(() => r()); server.closeAllConnections?.(); }));

// 검사를 빠르게
const FAST = { countMs: 200, roundEndMs: 250, endDelay: 250, autoMs: 700 };
Object.assign(RULE, FAST);

const QS = [
  { q: '1+1은?', answers: ['2'], wrong: ['3', '4', '5'] },
  { q: '하늘은 파랗다.', answers: ['O'], wrong: [] },
  { q: '우리나라 수도는?', answers: ['서울'], wrong: [] },
  { q: '물은 몇 도에서 끓을까?', answers: ['100도'], wrong: ['50도', '0도'] },
];
const conn = () => new Promise(r => { const s = Client(url, { transports: ['websocket'], forceNew: true }); sockets.add(s); s.on('connect', () => r(s)); });
const call = (s, ev, d) => s.timeout(4000).emitWithAck(ev, d);
const wait = (s, type, pred = () => true, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off('m', f); rej(new Error('timeout ' + type)); }, ms);
  const f = m => { if (m.type === type && pred(m.data)) { clearTimeout(t); s.off('m', f); res(m.data); } }; s.on('m', f);
});
const waitEv = (s, ev, pred = () => true, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off(ev, f); rej(new Error('timeout ' + ev)); }, ms);
  const f = d => { if (pred(d)) { clearTimeout(t); s.off(ev, f); res(d); } }; s.on(ev, f);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(40); } throw new Error('until timeout'); };

async function setup(n = 8, settings = { style: 'class', rounds: 1, seconds: 60, teams: 2, time: 20 }) {
  const t = await conn();
  const c = await call(t, 't:create', { title: '줄다리기반', mode: 'tug', settings, questions: QS });
  assert.ok(c.code, JSON.stringify(c));
  t.evts = []; t.on('evt', e => t.evts.push(e));
  const bots = [];
  for (let i = 0; i < n; i++) {
    const s = await conn();
    const j = await call(s, 's:join', { code: c.code, name: `${i + 1} 친구${i}`, device: i % 2 ? 'touch' : 'pc' });
    assert.ok(j.ok, JSON.stringify(j));
    s.pid = j.pid; s.token = j.token; s.mine = []; s.on('m', m => { if (m.type === 'mine') s.mine.push(m.data); });
    bots.push(s);
  }
  const room = () => rooms.get(c.code);
  return { t, c, bots, room, bot: pid => bots.find(b => b.pid === pid) };
}
// 한 문제 받아 정답(또는 오답) 내기
async function answer(s, qs, ok = true) {
  for (let k = 0; k < 40; k++) {
    const qP = waitEv(s, 'q', () => true, 3000).catch(() => null);
    const a = await call(s, 's:ask', {}).catch(() => ({ error: 'x' }));
    if (a?.error) { await sleep(200); continue; }
    const v = await qP; if (!v) continue;
    const Q = qs[v.qid];
    const given = ok ? Q.answers[0] : (v.choices ? v.choices.find(x => x !== Q.answers[0]) : '모름');
    return call(s, 's:answer', { qid: v.qid, given });
  }
  throw new Error('문제를 받지 못함');
}
const startPull = async (t) => { assert.ok((await call(t, 't:start', {})).ok); await wait(t, 'round', d => d.phase === 'pull'); };
const pullMode = (s, data = {}) => call(s, 's:mode', { type: 'pull', data });

test('설정 정리 · 필요 인원', () => {
  assert.equal(MODES.tug, tug, '서버가 같은 모듈을 쓴다');
  assert.deepEqual(tug.settings({}), { style: 'class', rounds: 3, seconds: 90, teams: 0 });
  assert.deepEqual(tug.settings({ style: 'teams', rounds: '1', seconds: '120', teams: '4' }), { style: 'teams', rounds: 1, seconds: 120, teams: 4 });
  assert.deepEqual(tug.settings({ style: 'constructor', rounds: 7, seconds: 999, teams: 9 }), { style: 'class', rounds: 3, seconds: 90, teams: 0 });
  assert.deepEqual(tug.settings({ style: { x: 1 }, rounds: null, seconds: [60], teams: -1 }), { style: 'class', rounds: 3, seconds: 60, teams: 0 });
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(needFor), [1, 2, 2, 2, 3, 3, 4]);
});

test('균형 시뮬레이션: 보통 반(1분 4문제·70%)은 이기고, 아주 느린 반은 어렵다', () => {
  const realNow = Date.now, realRandom = Math.random, saved = { ...RULE };
  Object.assign(RULE, { countMs: 3000, roundEndMs: 3500, endDelay: 3000, autoMs: 6000 });
  let NOW = 1e12;
  try {
    Date.now = () => NOW;
    const sim = ({ N = 25, nTeams = 6, qpm = 4, acc = 0.7, seconds = 90, seed = 1 }) => {
      let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647; Math.random = rnd;
      const room = { players: new Map(), settings: { style: 'class', rounds: 1, seconds, teams: nTeams } };
      for (let i = 0; i < N; i++) room.players.set('p' + i, { pid: 'p' + i, name: 'p' + i, online: true, team: null, joinedAt: i, stats: { n: 0, ok: 0 }, m: {} });
      let out = null; const shared = [];
      const api = { ensureTeams(n) { assignTeams([...room.players.values()], n, false); return Array.from({ length: n }, (_, i) => i); },
        event: (t, pid, d) => { if (t === 'shared') shared.push(d); }, toAll: (t, d) => { if (t === 'roundEnd') out = d; }, toPlayer() {}, feed() {}, end() {} };
      tug.start(room, api);
      const ps = [...room.players.values()], next = new Map(ps.map(p => [p.pid, NOW + 15000 * rnd()]));
      for (let k = 0; k < 2000 && !out; k++) {
        NOW += 100;
        for (const p of ps) if (NOW >= next.get(p.pid)) { next.set(p.pid, NOW + (60 / qpm) * 1000 * (0.5 + rnd())); const ok = rnd() < acc; p.stats.n++; tug.onAnswer(room, p, { ok }, api); }
        for (const T of room.m.teams) if (room.m.phase === 'pull' && T.readyAt && NOW - T.readyAt > 1500) tug.onStudent(room, room.players.get(T.gisu), 'pull', {}, api, () => {});
        tug.tick(room, api);
      }
      return { win: out?.winner === 0, how: out?.how, shared };
    };
    const typical = Array.from({ length: 8 }, (_, i) => sim({ seed: i + 1 }));
    assert.equal(typical.filter(r => r.win).length, 8, '보통 반은 이긴다');
    assert.ok(typical.filter(r => r.how === 'line').length >= 6, '대부분 끝까지 당겨서 이긴다');
    const slow = Array.from({ length: 8 }, (_, i) => sim({ qpm: 1.5, acc: 0.5, seed: i + 1 }));
    assert.ok(slow.filter(r => r.win).length <= 2, '아주 느리면 도깨비가 이긴다 (노력이 필요)');
    // 서로 다른 친구 규칙: 영차 힘 = 서로 다른 기여 인원 (+한마음 1)
    for (const e of typical[0].shared) { assert.ok(e.distinct >= e.need); assert.equal(e.strength, e.distinct + (e.all ? 1 : 0)); }
  } finally { Date.now = realNow; Math.random = realRandom; Object.assign(RULE, saved); }
});

test('서로 다른 모둠원 규칙 · 기수 영차 · 기수 돌림 · 잘못된 메시지', async () => {
  const { t, c, bots, room, bot } = await setup(8);
  await startPull(t);
  const r0 = room();
  assert.equal(r0.teamCount, 2, '모둠 2개');
  const T0 = r0.m.teams[0];
  const mem = bots.filter(b => r0.players.get(b.pid).team === 0);
  assert.equal(mem.length, 4);
  const gisu0 = T0.gisu;
  assert.ok(mem.some(b => b.pid === gisu0), '기수는 모둠원');
  assert.ok(t.evts.some(e => e.type === 'role' && e.pid === gisu0 && e.data.reason === 'start'), '처음 기수 기록');
  // 한 명이 여러 번 맞혀도 한 박자에 한 번만 → 준비 안 됨
  const solo = mem.find(b => b.pid !== gisu0), g = bot(gisu0);
  for (let k = 0; k < 3; k++) assert.equal((await answer(solo, c.questions, true)).ok, true);
  assert.equal(T0.beat.size, 1, '같은 학생은 한 번만');
  assert.deepEqual(solo.mine.map(m => m.fresh), [true, false, false]);
  assert.equal(solo.mine.at(-1).g.ready, false);
  assert.equal(solo.mine.at(-1).g.need, 2);
  assert.deepEqual(await pullMode(g), { error: 'notReady' }, '준비 전에는 못 당김');
  // 오답은 세지 않음
  const other = mem.find(b => b.pid !== gisu0 && b !== solo);
  await answer(other, c.questions, false);
  assert.equal(T0.beat.size, 1);
  // 두 번째 친구가 맞히면 준비
  await answer(other, c.questions, true);
  assert.equal(T0.beat.size, 2);
  assert.equal(other.mine.at(-1).g.ready, true);
  // 기수가 아니면 못 당김, 잘못된 메시지는 무시
  assert.deepEqual(await pullMode(solo), { error: 'notGisu' });
  assert.deepEqual(await call(g, 's:mode', { type: 'yank', data: {} }), { error: 'bad' });
  assert.deepEqual(await call(g, 's:mode', { type: { a: 1 }, data: 'x' }), { error: 'bad' });
  await call(g, 's:mode', null).catch(() => {});
  await call(g, 's:mode', 'garbage').catch(() => {});
  const rBefore = r0.m.r;
  const pullP = wait(t, 'pull', d => d.ti === 0);
  assert.deepEqual(await pullMode(g, { strength: 999 }), { ok: true });
  const p = await pullP;
  assert.equal(p.distinct, 2); assert.equal(p.strength, 2, '힘 = 서로 다른 인원 (보낸 숫자는 무시)'); assert.equal(p.auto, false);
  assert.ok(p.r < rBefore, '우리 반 쪽(왼쪽, 음수)으로 당겨짐');
  assert.equal(T0.beat.size, 0, '영차 뒤 박자 초기화');
  assert.notEqual(T0.gisu, gisu0, '기수가 다음 친구에게');
  assert.ok(mem.some(b => b.pid === T0.gisu));
  await until(() => t.evts.some(e => e.type === 'shared' && e.data.team === 0));
  const sh = t.evts.find(e => e.type === 'shared');
  assert.deepEqual([sh.data.team, sh.data.distinct, sh.data.need, sh.data.all], [0, 2, 2, false]);
  assert.ok(t.evts.some(e => e.type === 'role' && e.pid === T0.gisu && e.data.reason === 'rotate'));
  // 다시 같은 친구가 맞히면 새 박자에서는 셈
  assert.equal((await answer(solo, c.questions, true)).ok, true);
  assert.equal(solo.mine.at(-1).fresh, true);
  // 모두 맞히면 한마음 +1 (자동 영차가 먼저 오지 않게 잠깐 늘림)
  RULE.autoMs = 8000;
  for (const b of mem) if (!T0.beat.has(b.pid)) await answer(b, c.questions, true);
  const g2 = bot(T0.gisu), p2P = wait(t, 'pull', d => d.ti === 0);
  assert.deepEqual(await pullMode(g2), { ok: true });
  const p2 = await p2P;
  assert.equal(p2.distinct, 4); assert.equal(p2.all, true); assert.equal(p2.strength, 5);
  RULE.autoMs = FAST.autoMs;
  // 순위 대신 기여
  const end = waitEv(t, 'end');
  await call(t, 't:end', {});
  const { ranking } = await end;
  assert.equal(ranking.length, 8);
  assert.ok(ranking.every(r => r.extra.noRank === true && r.score === r.extra.contrib && r.rank === 1));
  const team0 = ranking.filter(r => r.extra.team === 0);
  assert.equal(team0.reduce((a, r) => a + r.extra.contrib, 0), 6, '2명 + 4명');
  assert.ok(Math.abs(team0.reduce((a, r) => a + r.extra.share, 0) - 1) < 0.01, '모둠 몫 합 = 1');
  assert.ok(team0.every(r => r.extra.teamContrib === 6 && r.extra.teamName === '청룡'));
  assert.equal(ranking.find(r => r.pid === solo.pid).extra.contrib, 2);
  [t, ...bots].forEach(s => s.close());
});

test('자동 영차 · 기수가 나가면 다음 친구 · 다시 접속 스냅숏', async () => {
  const { t, c, bots, room, bot } = await setup(6, { style: 'class', rounds: 1, seconds: 60, teams: 2, time: 20 });
  await startPull(t);
  const r0 = room(), T1 = r0.m.teams[1];
  const mem = bots.filter(b => r0.players.get(b.pid).team === 1);
  const helpers = mem.filter(b => b.pid !== T1.gisu).slice(0, 2);
  const autoP = wait(t, 'pull', d => d.ti === 1, 5000);
  const t0 = Date.now();
  for (const b of helpers) await answer(b, c.questions, true);
  const a = await autoP;
  assert.equal(a.auto, true, '기수가 안 누르면 자동 영차');
  assert.ok(Date.now() - t0 >= RULE.autoMs - 100);
  assert.ok(t.evts.some(e => e.type === 'shared' && e.data.auto === true && e.data.team === 1));
  // 다시 접속: 스냅숏에 판·줄·모둠 게이지·내 역할
  const someone = mem[0];
  await answer(someone, c.questions, true);
  someone.close();
  await until(() => !r0.players.get(someone.pid).online);
  const s2 = await conn();
  const j = await call(s2, 's:join', { code: c.code, token: someone.token });
  assert.ok(j.ok); s2.pid = someone.pid;
  const snap = j.snapshot;
  assert.equal(snap.round, 1); assert.equal(snap.phase, 'pull'); assert.equal(snap.style, 'class');
  assert.ok(snap.timeLeft > 0 && snap.timeLeft <= 60000, '남은 시간은 ms');
  assert.ok(Number.isFinite(snap.r));
  assert.equal(snap.g.length, 2);
  assert.equal(snap.me.team, 1); assert.equal(snap.me.inBeat, true, '보탠 힘은 다시 접속해도 남음');
  assert.equal(typeof snap.me.gisu, 'boolean');
  assert.equal(snap.teams[1].name, '주작');
  // 기수가 나가면 다음 친구가 기수
  const g = T1.gisu, gs = g === someone.pid ? s2 : bot(g);
  gs.close();
  await until(() => T1.gisu && T1.gisu !== g);
  assert.ok(t.evts.some(e => e.type === 'role' && e.data.reason === 'away' && e.pid === T1.gisu));
  assert.ok(r0.players.get(T1.gisu).online);
  await call(t, 't:end', {});
  [t, s2, ...bots].forEach(s => s.close());
});

test('판 이기기(끝까지) · 시간 끝 지기 · 우리 반 세 판 모두', async () => {
  const { t, c, bots, room, bot } = await setup(4, { style: 'class', rounds: 3, seconds: 60, teams: 2, time: 20 });
  const rounds = [];
  t.on('m', m => { if (m.type === 'roundEnd') rounds.push(m.data); });
  await startPull(t);
  const r0 = room(), T0 = r0.m.teams[0];
  // 1판: 끝까지 당겨 이김
  r0.m.r = -99;
  const mem = bots.filter(b => r0.players.get(b.pid).team === 0);
  for (const b of mem) await answer(b, c.questions, true);
  assert.ok(T0.beat.size >= 1);
  const endP = wait(t, 'roundEnd', d => d.round === 1);
  await pullMode(bot(T0.gisu));
  const e1 = await endP;
  assert.equal(e1.winner, 0); assert.equal(e1.how, 'line'); assert.deepEqual(e1.wins, [1, 0]); assert.equal(e1.final, false);
  // 2판: 3-2-1 뒤 시작, 시간 끝에 도깨비 쪽이면 짐
  const cd = await wait(t, 'round', d => d.round === 2 && d.phase === 'count');
  assert.ok(cd.countLeft > 0 && cd.countLeft <= RULE.countMs);
  await wait(t, 'round', d => d.round === 2 && d.phase === 'pull');
  assert.ok(Math.abs(r0.m.r) < 5, '판마다 줄은 가운데에서');
  r0.m.r = 30; r0.m.endsAt = Date.now();
  const e2 = await wait(t, 'roundEnd', d => d.round === 2);
  assert.equal(e2.winner, 1); assert.equal(e2.how, 'time');
  // 도깨비는 혼자서도 당긴다
  await wait(t, 'round', d => d.round === 3 && d.phase === 'pull');
  const rs = r0.m.r; await sleep(500); assert.ok(r0.m.r > rs, '도깨비가 꾸준히 당김');
  // 우리 반 방식은 2:0 이 아니어도 세 판 모두 (1:1 → 3판)
  r0.m.r = -40; r0.m.endsAt = Date.now();
  const res = await wait(t, 'result');
  assert.deepEqual(res.wins, [2, 1]); assert.equal(res.classWin, true); assert.equal(res.played, 3);
  assert.match(res.text, /세 판 중 2판/);
  const { ranking } = await waitEv(t, 'end');
  assert.ok(ranking.every(r => r.extra.classWin === true && r.extra.roundsWon === 2 && r.extra.noRank));
  assert.equal(rounds.length, 3);
  assert.equal(t.evts.filter(e => e.type === 'round').length, 3);
  assert.ok(t.evts.some(e => e.type === 'classGoal' && e.data.win === true));
  assert.equal(room().state, 'end');
  [t, ...bots].forEach(s => s.close());
});

test('청군 vs 홍군: 편 나누기 · 서로 당기기 · 먼저 두 판', async () => {
  const { t, c, bots, room, bot } = await setup(8, { style: 'teams', rounds: 3, seconds: 60, teams: 4, time: 20 });
  await startPull(t);
  const r0 = room();
  assert.equal(r0.m.teams.length, 4);
  const startR = r0.m.r;
  await sleep(400);
  assert.equal(r0.m.r, startR, '청홍전에는 도깨비가 없다');
  const snap = tug.snapshot(r0, null);
  assert.deepEqual(snap.teams.map(x => x.side), [0, 1, 0, 1], '짝수 모둠 = 청군, 홀수 = 홍군');
  assert.deepEqual(snap.sides, ['청군', '홍군']);
  // 홍군(1모둠)이 당기면 오른쪽(+)
  const T1 = r0.m.teams[1];
  for (const b of bots.filter(b => r0.players.get(b.pid).team === 1)) await answer(b, c.questions, true);
  const pP = wait(t, 'pull', d => d.ti === 1);
  await pullMode(bot(T1.gisu));
  const p = await pP;
  assert.equal(p.side, 1); assert.ok(p.r > 0);
  // 1판·2판 홍군 승리 → 먼저 두 판이면 끝
  r0.m.endsAt = Date.now();
  const e1 = await wait(t, 'roundEnd', d => d.round === 1);
  assert.equal(e1.winner, 1);
  await wait(t, 'round', d => d.round === 2 && d.phase === 'pull');
  r0.m.r = 99.5;
  for (const b of bots.filter(b => r0.players.get(b.pid).team === 3)) await answer(b, c.questions, true);
  const T3 = r0.m.teams[3];
  await pullMode(bot(T3.gisu));
  const res = await wait(t, 'result');
  assert.deepEqual(res.wins, [0, 2]); assert.equal(res.played, 2); assert.equal(res.winner, 1);
  const { ranking } = await waitEv(t, 'end');
  const red = ranking.filter(r => r.extra.side === 1), blue = ranking.filter(r => r.extra.side === 0);
  assert.ok(red.length && blue.length);
  assert.ok(red.every(r => r.extra.classWin === true && r.extra.roundsWon === 2));
  assert.ok(blue.every(r => r.extra.classWin === false && r.extra.roundsWon === 0));
  assert.ok(t.evts.some(e => e.type === 'teamGoal'));
  [t, ...bots].forEach(s => s.close());
});
