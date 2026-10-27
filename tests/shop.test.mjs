// 퀴즈 부자(shop) 서버 검사: 돈 계산 · 상점 검증(잘못된 구매 거절) · 아이템 · 팀 합계 · 목표 · 순위
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms } from '../server.js';
import { TRACKS, ITEMS, STREAK_CAP } from '../server/modes/shop.js';

let url;
const sockets = [];
before(() => new Promise(r => server.listen(0, () => { url = `http://localhost:${server.address().port}`; r(); })));
after(() => new Promise(r => { sockets.forEach(s => s.close()); io.close(() => r()); server.closeAllConnections?.(); }));

const QS = [
  { q: '1+1은?', answers: ['2'], wrong: ['3', '4', '5'] },
  { q: '하늘은 파랗다.', answers: ['O'], wrong: [] },
  { q: '우리나라 수도는?', answers: ['서울'], wrong: [] },
  { q: '물은 몇 도에서 끓을까?', answers: ['100도'], wrong: ['50도', '0도'] },
  { q: '3×3은?', answers: ['9'], wrong: ['6', '8', '12'] },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const conn = () => new Promise(r => { const s = Client(url, { transports: ['websocket'], forceNew: true }); sockets.push(s); s.on('connect', () => r(s)); });
// 서버 속도 제한(소켓당 초당 40개)에 걸리지 않게 조금씩 쉬며 보낸다
const call = async (s, ev, d) => { await sleep(30); return callNow(s, ev, d); };
const callNow = (s, ev, d) => s.timeout(4000).emitWithAck(ev, d).catch(e => { throw new Error(`${ev} ${JSON.stringify(d)}: ${e.message}`); });
const wait = (s, ev, pred = () => true, ms = 6000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off(ev, f); rej(new Error('timeout ' + ev)); }, ms);
  const f = d => { if (pred(d)) { clearTimeout(t); s.off(ev, f); res(d); } }; s.on(ev, f);
});
const waitM = (s, type, pred = () => true, ms) => wait(s, 'm', m => m.type === type && pred(m.data), ms).then(m => m.data);
const mode = (s, type, data) => call(s, 's:mode', { type, data });

// 학생 하나: 문제 받기 → 맞히기/틀리기 → earn·me 받기
async function play(ctx, bot, correct, forceGiven) {
  const p = rooms.get(ctx.code).players.get(bot.pid); p.lastAsk = 0; // 검사 속도를 위해 0.7초 제한 풀기
  const qP = wait(bot.s, 'q');
  const a = await call(bot.s, 's:ask', {});
  assert.ok(a.ok, JSON.stringify(a));
  const v = await qP;
  const Q = ctx.qs[v.qid];
  const given = forceGiven != null ? forceGiven : correct ? Q.answers[0] : (v.choices ? v.choices.find(c => c !== Q.answers[0]) : '모르겠어요');
  const earnP = waitM(bot.s, 'earn'), meP = waitM(bot.s, 'me');
  const r = await call(bot.s, 's:answer', { qid: v.qid, given });
  assert.equal(r.ok, correct, JSON.stringify(r));
  const [earn, me] = await Promise.all([earnP, meP]);
  bot.me = me;
  return earn;
}
const P = (ctx, bot) => rooms.get(ctx.code).players.get(bot.pid);

async function setup(settings, n = 6) {
  const t = await conn();
  const c = await call(t, 't:create', { title: '부자반', mode: 'shop', settings: { time: 10, ...settings }, questions: QS });
  assert.ok(c.code, JSON.stringify(c));
  const bots = [];
  for (let i = 0; i < n; i++) {
    const s = await conn();
    const j = await call(s, 's:join', { code: c.code, name: `${i + 1} 부자${i}`, device: i % 2 ? 'touch' : 'pc' });
    assert.ok(j.ok, JSON.stringify(j));
    bots.push({ s, pid: j.pid, me: null });
  }
  const meP = bots.map(b => waitM(b.s, 'me'));
  const startP = waitM(bots[0].s, 'start');
  const tb = waitM(t, 'tboard');
  const st = await call(t, 't:start', {});
  assert.ok(st.ok, JSON.stringify(st));
  const start = await startP;
  (await Promise.all(meP)).forEach((m, i) => { bots[i].me = m; });
  await tb;
  return { t, code: c.code, qs: c.questions, bots, start };
}

test('설정 정리 (잘못된 값은 기본값)', async () => {
  const { default: M } = await import('../server/modes/shop.js');
  assert.deepEqual(M.settings({}), { minutes: 10, goal: 0, teams: 0, penalty: false });
  assert.deepEqual(M.settings({ minutes: 99, goal: 123, teams: 7, penalty: 'yes' }), { minutes: 10, goal: 0, teams: 0, penalty: false });
  assert.deepEqual(M.settings({ minutes: '15', goal: '1000000', teams: '3', penalty: true }), { minutes: 15, goal: 1000000, teams: 3, penalty: true });
  for (const t of Object.values(TRACKS)) assert.equal(t.p.length, t.v.length - 1, '값 표 길이');
});

test('개인전: 돈 계산 · 업그레이드 · 잘못된 구매 거절 · 아이템 · 순위', async () => {
  const ctx = await setup({ minutes: 5, penalty: true });
  const { t, bots, start } = ctx;
  assert.ok(start.left > 4 * 60e3 && start.left <= 5 * 60e3 + 3000);
  assert.deepEqual(start.shop.tracks.map(x => x.id), ['perQ', 'streak', 'mult', 'ins'], '틀리면 잃기 → 보험 보임');
  assert.ok(!start.shop.items.some(x => x.id === 'cheer'), '개인전에는 팀 응원 없음');
  assert.ok(bots.every(b => b.me.money === 0 && b.me.next === 10));
  const b = bots[0];

  // 맞히기 3번: 10원씩 (연속 보너스 0단계)
  for (let k = 1; k <= 3; k++) { const e = await play(ctx, b, true); assert.equal(e.amount, 10); assert.equal(e.streak, k); }
  assert.equal(b.me.money, 30);

  // 잘못된 구매들
  for (const item of ['__proto__', 'constructor', 'toString', 'money', 123, null]) {
    const r = await mode(b.s, 'buy', { item }); assert.ok(r.error, 'buy ' + item);
    const u = await mode(b.s, 'use', { item }); assert.ok(u.error, 'use ' + item);
  }
  assert.ok((await mode(b.s, 'buy', { item: 'mult' })).error, '돈이 모자람 (배수 100원)');
  assert.ok((await mode(b.s, 'use', { item: 'cheer' })).error, '개인전 팀 응원 거절');
  assert.equal(P(ctx, b).m.money, 30, '거절된 구매는 돈이 그대로');

  // 문제당 돈 1단계 → 50원. 같은 단계를 두 번 누르면 거절
  const buy = await mode(b.s, 'buy', { item: 'perQ', level: 1 });
  assert.ok(buy.ok, JSON.stringify(buy)); assert.equal(buy.state.money, 0); assert.equal(buy.state.lv.perQ, 1);
  assert.ok((await mode(b.s, 'buy', { item: 'perQ', level: 1 })).error, '두 번 누름 거절');
  let e = await play(ctx, b, true);
  assert.equal(e.amount, 50); assert.equal(e.streak, 4);

  // 틀림: 연속 끊기 + 문제당 돈만큼 잃기 (보험 0%)
  e = await play(ctx, b, false);
  assert.equal(e.loss, 50); assert.equal(e.lostStreak, 4); assert.equal(b.me.money, 0); assert.equal(b.me.streak, 0);

  // 보험 25% → 50원 중 38원만 잃음 (돈은 0 아래로 안 내려감)
  P(ctx, b).m.money = 1000;
  assert.ok((await mode(b.s, 'buy', { item: 'ins' })).ok);
  e = await play(ctx, b, false);
  assert.equal(e.loss, Math.round(50 * 0.75)); assert.equal(e.blocked, 50 - Math.round(50 * 0.75));
  assert.equal(b.me.money, 900 - 38);

  // 시간 초과(빈 답)는 연속만 끊기고 돈은 안 잃음
  e = await play(ctx, b, false, '');
  assert.equal(e.loss, 0); assert.equal(b.me.money, 900 - 38);

  // 방패: 다음 오답에 연속·돈 지킴
  await play(ctx, b, true); await play(ctx, b, true);
  const before = P(ctx, b).m.money;
  const sh = await mode(b.s, 'use', { item: 'shield' });
  assert.ok(sh.ok, JSON.stringify(sh)); assert.equal(sh.price, Math.max(ITEMS.shield.min, Math.round((50 * 1 + 0) * ITEMS.shield.k)));
  assert.ok((await mode(b.s, 'use', { item: 'shield' })).error, '방패는 하나만');
  e = await play(ctx, b, false);
  assert.ok(e.shielded); assert.equal(e.streak, 2); assert.equal(b.me.money, before - sh.price);

  // 2배 타임: 다음 정답 두 배, 켜진 동안 또 사기 거절
  const d = await mode(b.s, 'use', { item: 'double' });
  assert.ok(d.ok, JSON.stringify(d)); assert.ok(d.state.doubleLeft > 19000);
  assert.ok((await mode(b.s, 'use', { item: 'double' })).error);
  e = await play(ctx, b, true);
  assert.ok(e.doubled); assert.equal(e.amount, 100); assert.equal(e.streak, 3);
  P(ctx, b).m.doubleUntil = 0;

  // 깜짝 선물: 한 번 맞힐 때마다 하나, 0.5~2배
  const g = await mode(b.s, 'use', { item: 'gift' });
  assert.ok(g.ok, JSON.stringify(g));
  const baseV = 50; assert.ok(g.gain >= baseV * 0.5 - 1 && g.gain <= baseV * 2 + 1, 'gift ' + g.gain);
  assert.ok((await mode(b.s, 'use', { item: 'gift' })).error, '선물 연속 사기 거절');

  // 연속 보너스 + 배수: (perQ × mult + 연속값 × 연속) 계산
  const p = P(ctx, b);
  p.m.money = 10_000_000; p.m.lv = { perQ: 2, streak: 2, mult: 2, ins: 1 }; p.m.streak = 12;
  e = await play(ctx, b, true);
  assert.equal(e.amount, 100 * 2 + 25 * STREAK_CAP, '연속 보너스는 10연속까지');
  assert.equal(e.bonus, 25 * STREAK_CAP);

  // 최고 단계 넘기 거절
  p.m.money = 1e12;
  for (let k = p.m.lv.mult; k < TRACKS.mult.p.length; k++) assert.ok((await mode(b.s, 'buy', { item: 'mult' })).ok);
  assert.equal(p.m.lv.mult, TRACKS.mult.v.length - 1);
  const mx = await mode(b.s, 'buy', { item: 'mult' }); assert.match(mx.error, /최고/);

  // 다른 봇들: 섞어서 풀기 (돈은 절대 음수가 아님, 서버와 화면 상태 같음)
  await Promise.all(bots.slice(1).map(async (x, i) => {
    for (let k = 0; k < 5; k++) {
      await play(ctx, x, (k + i) % 3 !== 0);
      if (x.me.money >= 30) await mode(x.s, 'buy', { item: 'perQ', level: x.me.lv.perQ + 1 });
      await mode(x.s, 'buy', { item: 'mult' }); // 대부분 돈 모자람
      const pp = P(ctx, x); assert.ok(pp.m.money >= 0); assert.equal(pp.score, pp.m.money);
    }
  }));

  // 교사 화면 순위표 · 다시 접속 상태
  const tb = await waitM(t, 'tboard');
  assert.equal(tb.list.length, 6);
  assert.ok(tb.list.every((r, i, a) => !i || a[i - 1].money >= r.money), '돈 순서');
  assert.equal(tb.total, tb.list.reduce((s, r) => s + r.money, 0));
  const snap = await call(t, 't:rejoin', { code: ctx.code, key: rooms.get(ctx.code).key });
  assert.ok(snap.snapshot.list.length === 6 && snap.snapshot.shop.tracks.length === 4);
  const sb = await mode(bots[1].s, 'state', {});
  assert.equal(sb.money, P(ctx, bots[1]).m.money);

  const endP = wait(t, 'end');
  await call(t, 't:end', {});
  const { ranking } = await endP;
  assert.equal(ranking.length, 6);
  assert.equal(ranking[0].pid, b.pid, '돈 제일 많은 사람이 1등');
  assert.ok(ranking.every((r, i, a) => !i || a[i - 1].score >= r.score));
  assert.ok(ranking.every(r => r.rank >= 1 && 'money' in r.extra && 'upgrades' in r.extra && 'correct' in r.extra && 'answered' in r.extra));
  assert.ok(!('teamName' in ranking[0].extra));
  // 끝난 뒤에는 사기 불가
  assert.equal(rooms.get(ctx.code).state, 'end');
  await call(t, 't:close', {});
});

test('팀전: 팀 나누기 · 팀 합계 · 팀 응원 · 보험 숨김 · 목표 금액으로 끝', async () => {
  const ctx = await setup({ minutes: 5, teams: 2, goal: 10000, penalty: false });
  const { t, bots, start } = ctx;
  assert.equal(start.teams.length, 2);
  assert.ok(!start.shop.tracks.some(x => x.id === 'ins'), '안 잃는 게임에는 보험 없음');
  assert.ok(start.shop.items.some(x => x.id === 'cheer'));
  const R = rooms.get(ctx.code);
  const teamOf = b => R.players.get(b.pid).team;
  const counts = [0, 0]; bots.forEach(b => counts[teamOf(b)]++);
  assert.deepEqual(counts, [3, 3], '3명씩 자동으로 나눔');
  assert.ok((await mode(bots[0].s, 'buy', { item: 'ins' })).error, '보험 구매 거절');

  // 틀려도 안 잃음
  const e0 = await play(ctx, bots[0], false);
  assert.equal(e0.loss, 0);

  // 팀 응원: 같은 팀 친구들만 받음
  const a = bots[0], mates = bots.filter(b => b !== a && teamOf(b) === teamOf(a)), others = bots.filter(b => teamOf(b) !== teamOf(a));
  assert.ok((await mode(a.s, 'use', { item: 'cheer' })).error, '돈 모자람');
  R.players.get(a.pid).m.money = 500;
  const cheerP = mates.map(m => waitM(m.s, 'cheer'));
  const ch = await mode(a.s, 'use', { item: 'cheer' });
  assert.ok(ch.ok, JSON.stringify(ch)); assert.equal(ch.mates, 2); assert.equal(ch.price, ITEMS.cheer.min);
  for (const c of await Promise.all(cheerP)) { assert.equal(c.amount, ch.each); assert.equal(c.money, ch.each); }
  assert.ok(others.every(o => R.players.get(o.pid).m.money === 0), '다른 팀은 못 받음');
  assert.match((await mode(a.s, 'use', { item: 'cheer' })).error, /초 뒤/, '쿨타임');

  // 팀 합계 = 팀원 돈의 합
  const tb = await waitM(t, 'tboard');
  for (const T of tb.teams) {
    const sum = [...R.players.values()].filter(p => p.team === T.k).reduce((s, p) => s + p.m.money, 0);
    assert.equal(T.money, sum); assert.equal(T.members, 3);
  }
  const sb = await waitM(bots[3].s, 'board');
  assert.equal(sb.teams.length, 2); assert.equal(sb.order.length, 6); assert.ok(!('list' in sb), '학생에게는 짧은 순위만');

  // 늦게 들어온 학생은 인원이 적은 팀으로
  const late = await conn();
  const lj = await call(late, 's:join', { code: ctx.code, name: '7 늦게' });
  assert.ok(lj.ok && lj.snapshot?.me && lj.snapshot.shop, '늦게 와도 상점 정보');
  assert.ok([0, 1].includes(R.players.get(lj.pid).team));

  // 목표: 팀 합계가 1만원을 넘으면 잠깐 뒤 끝
  const m1 = mates[0];
  R.players.get(m1.pid).m.money = 9990;
  const goalP = waitM(m1.s, 'goal');
  const endP = wait(t, 'end', () => true, 5000);
  await play(ctx, m1, true);
  const goal = await goalP; assert.equal(goal.team, teamOf(a));
  assert.ok((await mode(m1.s, 'buy', { item: 'perQ' })).error, '목표 달성 뒤 구매 거절');
  const { ranking } = await endP;
  assert.equal(ranking.length, 7);
  assert.equal(ranking[0].extra.team, teamOf(a), '이긴 팀이 위');
  assert.ok(ranking.every(r => r.extra.teamName && r.extra.teamRank >= 1 && r.extra.teamMoney >= 0));
  assert.ok(ranking.every((r, i) => r.rank === i + 1));
  assert.ok(ranking.every((r, i, a) => !i || a[i - 1].extra.teamRank <= r.extra.teamRank), '팀 순위가 먼저');
  await call(t, 't:close', {});
  assert.ok(!rooms.has(ctx.code));
});
