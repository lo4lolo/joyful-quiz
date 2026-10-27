// 뿅망치 대결 검사: 교사 + 봇 7명(홀수 → 부전승). 봇은 서버가 돌려준 문제 목록으로 일부러 맞히거나 틀린다.
// 짝짓기 · 하트 · 둘 다 뿅 · 유령 대결 · +10초 · 문제 중 접속 끊김 · 다시 접속 · 모두 탈락 부활 규칙 · 챔피언 · 순위
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms } from '../server.js';
import royale from '../server/modes/royale.js';

let url;
const socks = new Set();
before(() => new Promise(r => server.listen(0, () => { url = `http://localhost:${server.address().port}`; r(); })));
after(() => new Promise(r => { for (const s of socks) s.close(); io.close(() => r()); server.closeAllConnections?.(); }));

const QS = Array.from({ length: 10 }, (_, i) => ({ q: `${i + 1} + ${i + 1} = ?`, answers: [String(2 * (i + 1))], wrong: [String(2 * i + 3), String(2 * i + 5), String(2 * i + 7)] }));
const conn = () => new Promise(r => { const s = Client(url, { transports: ['websocket'], forceNew: true, reconnection: false }); socks.add(s); s.on('connect', () => r(s)); });
const call = (s, ev, d) => s.timeout(4000).emitWithAck(ev, d);
const wait = (s, ev, pred = () => true, ms = 9000) => new Promise((res, rej) => {
  const t = setTimeout(() => { s.off(ev, f); rej(new Error('timeout ' + ev)); }, ms);
  const f = d => { if (pred(d)) { clearTimeout(t); s.off(ev, f); res(d); } }; s.on(ev, f);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
const key = (a, b) => [a, b].sort().join('|');

function pick(Q, v, how) {
  if (how === 'right') return Q.answers[0];
  return v.choices ? v.choices.find(c => c !== Q.answers[0]) : '모름';
}

async function addBot(g, name, i, token) {
  const s = await conn();
  // 다시 접속하면 서버가 ack 바로 뒤에 문제를 다시 보내므로 듣기는 먼저 건다
  const b = { s, pid: null, token, name, i, reborn: !!token, duel: null, result: null, join: null, deadlines: [] };
  s.on('m', ({ type, data }) => {
    if (type === 'duel' || type === 'me') b.duel = data;
    if (type === 'result') b.result = data;
    if (type === 'deadline') b.deadlines.push(data.deadline);
  });
  s.on('q', v => {
    const p = g.plan(b, v);
    if (!p || p.a === 'none') return;
    setTimeout(() => { if (s.connected) s.emit('s:answer', { qid: v.qid, given: pick(g.qs[v.qid], v, p.a) }, () => {}); }, p.d ?? 30);
  });
  const j = await call(s, 's:join', { code: g.code, name, device: 'pc', token });
  assert.ok(j.ok, JSON.stringify(j));
  Object.assign(b, { pid: j.pid, token: j.token, join: j });
  b.duel ||= j.snapshot?.me || null;
  return b;
}

async function game(n, settings, qs = QS) {
  const t = await conn();
  const c = await call(t, 't:create', { title: '뿅망치 검사', mode: 'royale', settings: { time: 5, ...settings }, questions: qs });
  assert.ok(c.code, JSON.stringify(c));
  const g = { t, code: c.code, qs: c.questions, bots: [], plan: () => ({ a: 'wrong' }), feed: [] };
  t.on('feed', f => g.feed.push(f.text));
  for (let i = 0; i < n; i++) g.bots.push(await addBot(g, `${i + 1} 봇${i}`, i));
  g.room = rooms.get(c.code);
  g.P = pid => g.room.players.get(pid);
  g.byPid = pid => g.bots.find(b => b.pid === pid);
  g.role = pid => g.room.m.roles[pid]?.role || null;
  return g;
}

// 한 판: 문제 → (before) → 공개. plan(bot, view) → {a:'right'|'wrong'|'none', d:ms}
async function round(g, plan, beforeFn) {
  g.plan = plan;
  g.bots.forEach(b => { b.result = null; });
  const qP = wait(g.t, 'm', m => m.type === 'phase' && m.data.phase === 'question');
  const rP = wait(g.t, 'm', m => m.type === 'phase' && m.data.phase === 'reveal', 15000);
  const t0 = Date.now();
  await call(g.t, 't:mode', { type: 'ask', data: {} });
  const q = (await qP).data;
  await beforeFn?.(q);
  const r = (await rP).data;
  await sleep(150);
  if (process.env.RDEBUG) console.log("round ms", Date.now() - t0);
  return { q, r, ms: Date.now() - t0 };
}
// 상태 직접 맞추기: alive = { 봇번호: 하트 }
function force(g, alive) {
  for (const b of g.bots) {
    const m = g.P(b.pid).m, h = alive[b.i];
    if (h) { m.alive = true; m.hearts = h; m.out = null; } else { m.alive = false; m.hearts = 0; m.out = m.out ?? 1; }
  }
}

test('설정 정리', () => {
  assert.deepEqual(royale.settings({}), { hearts: 3, shuffle: true });
  assert.deepEqual(royale.settings({ hearts: 5, shuffle: false }), { hearts: 5, shuffle: false });
  assert.deepEqual(royale.settings({ hearts: 4, shuffle: 'false' }), { hearts: 3, shuffle: false });
  assert.deepEqual(royale.settings({ hearts: '2', shuffle: true }), { hearts: 2, shuffle: true });
});

test('7명: 짝짓기·부전승·하트·둘 다 뿅·유령·+10초·접속 끊김·모두 탈락 부활·챔피언', async () => {
  const g = await game(7, { hearts: 2 });
  const readyP = wait(g.t, 'm', m => m.type === 'phase' && m.data.phase === 'ready');
  assert.ok((await call(g.t, 't:start', {})).ok);
  const ready = (await readyP).data;
  assert.equal(ready.hearts, 2);
  assert.equal(ready.total, QS.length);

  // ---- 1판: 모두 맞힘, 번호가 작을수록 빠름 → 빠른 쪽 승. 7명이라 1명 부전승(유령 없음)
  const R1 = await round(g, b => ({ a: 'right', d: 40 + b.i * 110 }));
  const roles = g.bots.map(b => b.duel.role);
  assert.equal(roles.filter(r => r === 'duel').length, 6, roles.join());
  assert.equal(roles.filter(r => r === 'bye').length, 1, roles.join());
  for (const b of g.bots) if (b.duel.role === 'duel') assert.equal(g.byPid(b.duel.opp.pid).duel.opp.pid, b.pid, '짝은 서로');
  assert.equal(R1.r.duels.length, 4);
  const pairs1 = new Set();
  for (const d of R1.r.duels) {
    if (d.kind === 'bye') {
      const b = g.byPid(d.a.pid);
      assert.equal(b.result.outcome, 'bye'); assert.equal(b.result.hearts, 2); assert.equal(g.P(b.pid).score, 50, '부전승 +50 (맞혔을 때)');
      continue;
    }
    assert.equal(d.kind, 'duel');
    pairs1.add(key(d.a.pid, d.b.pid));
    const A = g.byPid(d.a.pid), B = g.byPid(d.b.pid), fast = A.i < B.i ? A : B, slow = fast === A ? B : A;
    assert.equal(d.winner, fast.pid, '둘 다 맞히면 빠른 쪽 승');
    assert.equal(fast.result.outcome, 'win'); assert.equal(slow.result.outcome, 'lose');
    assert.equal(g.P(slow.pid).m.hearts, 1); assert.equal(g.P(fast.pid).m.hearts, 2);
    assert.equal(g.P(fast.pid).m.wins, 1);
    const sc = g.P(fast.pid).score; assert.ok(sc >= 100 && sc <= 150, '승리 100 + 빠르기 최대 50: ' + sc);
    assert.equal(g.P(slow.pid).score, 0);
    assert.ok(slow.result.heartLost && !slow.result.out);
  }

  // ---- 2판: 같은 짝 피하기 + 모두 틀림 → 둘 다 뿅, 하트 0 → 응원석
  const before2 = Object.fromEntries(g.bots.map(b => [b.pid, g.P(b.pid).m.hearts]));
  const R2 = await round(g, () => ({ a: 'wrong', d: 30 }));
  for (const d of R2.r.duels) if (d.kind === 'duel') assert.ok(!pairs1.has(key(d.a.pid, d.b.pid)), '지난 판과 같은 짝은 피함');
  const out2 = [];
  for (const d of R2.r.duels) {
    if (d.kind === 'bye') { assert.equal(g.P(d.a.pid).m.hearts, before2[d.a.pid], '부전승은 하트 그대로'); continue; }
    assert.ok(d.double && !d.winner);
    for (const s of [d.a, d.b]) {
      const b = g.byPid(s.pid);
      assert.equal(b.result.outcome, 'double');
      assert.equal(g.P(s.pid).m.hearts, before2[s.pid] - 1);
      if (before2[s.pid] === 1) { out2.push(s.name); assert.ok(b.result.out && !g.P(s.pid).m.alive); assert.equal(g.P(s.pid).m.out, 2, '탈락한 판 번호'); }
    }
  }
  assert.ok(out2.length >= 1);
  assert.deepEqual([...R2.r.outNames].sort(), out2.sort());

  // ---- 3판: 살아 있는 3명 → 1대1 하나 + 유령 대결 하나. 유령이 이기면 산 사람 하트 -1, 유령은 그대로
  force(g, { 0: 2, 1: 2, 2: 2 });
  const s3 = Object.fromEntries(g.bots.map(b => [b.pid, g.P(b.pid).score]));
  const R3 = await round(g, b => {
    const r = g.role(b.pid);
    if (r === 'ghost') return { a: 'right', d: 20 };
    if (r === 'vsGhost') return { a: 'wrong', d: 30 };
    if (r === 'duel') return { a: b.i === Math.min(...g.bots.filter(x => g.role(x.pid) === 'duel').map(x => x.i)) ? 'right' : 'wrong', d: 40 };
    return { a: 'wrong', d: 30 };
  });
  const kinds = R3.r.duels.map(d => d.kind).sort();
  assert.deepEqual(kinds, ['duel', 'ghost']);
  const gd = R3.r.duels.find(d => d.kind === 'ghost');
  const host = g.byPid(gd.a.pid), ghost = g.byPid(gd.b.pid);
  assert.ok(host.i <= 2 && ghost.i > 2, '유령은 응원석 학생');
  assert.equal(host.duel.role, 'vsGhost'); assert.equal(ghost.duel.role, 'ghost');
  assert.equal(gd.winner, ghost.pid);
  assert.equal(host.result.outcome, 'lose'); assert.equal(g.P(host.pid).m.hearts, 1);
  assert.equal(ghost.result.outcome, 'ghostWin');
  assert.equal(g.P(ghost.pid).m.alive, false); assert.equal(g.P(ghost.pid).m.hearts, 0); assert.equal(g.P(ghost.pid).score, s3[ghost.pid], '유령은 점수 그대로');
  const dd = R3.r.duels.find(d => d.kind === 'duel');
  assert.ok(dd.winner && g.byPid(dd.winner).result.outcome === 'win');
  // 응원석(짝 없는) 학생도 문제를 받고 연습
  const cheer = g.bots.filter(b => b.duel.role === 'cheer');
  assert.ok(cheer.length >= 3 && cheer.every(b => b.result.outcome === 'cheer'));

  // ---- 4판: +10초 · 문제 중 접속 끊김 = 답 안 냄 (상대 승) · 남은 사람이 다 내면 바로 공개
  force(g, { 0: 2, 1: 2, 2: 2, 3: 2 });
  let victim = null, foe = null;
  const R4 = await round(g, b => {
    const r = g.room.m.roles;
    const v = g.bots.find(x => r[x.pid]?.role === 'duel');
    if (b === v) return { a: 'none' };
    if (b.pid === r[v.pid].opp) return { a: 'right', d: 300 };
    return { a: g.role(b.pid) === 'duel' || g.role(b.pid) === 'bye' ? 'right' : 'wrong', d: 300 };
  }, async q => {
    victim = g.bots.find(x => g.role(x.pid) === 'duel'); foe = g.byPid(g.room.m.roles[victim.pid].opp);
    const dP = wait(g.t, 'm', m => m.type === 'deadline');
    await call(g.t, 't:mode', { type: 'time', data: {} });
    assert.equal((await dP).data.deadline, q.deadline + 10000, '+10초');
    victim.s.close(); // 문제 도중 나감
  });
  // 끊긴 학생은 8초까지 기다려 주고(새로고침 대비), 그 뒤 남은 학생이 다 냈으면 마감(15초) 전에 공개
  assert.ok(R4.ms > 7000 && R4.ms < 12000, '끊긴 학생 8초 기다린 뒤 공개: ' + R4.ms);
  assert.ok(g.bots.some(b => b !== victim && b.deadlines.length), '학생에게도 +10초 알림');
  const vd = R4.r.duels.find(d => d.kind === 'duel' && [d.a.pid, d.b.pid].includes(victim.pid));
  assert.equal(vd.winner, foe.pid, '나간 학생은 답 안 낸 것');
  assert.equal(g.P(victim.pid).m.hearts, 1);
  assert.equal(foe.result.outcome, 'win');

  // ---- 5판: 살아 있는 모두가 마지막 하트를 잃으면 아무도 탈락하지 않음 (하트 1로 부활). 끊긴 학생 다시 접속
  force(g, { 0: 1, 1: 1, 2: 1, 3: 1, 4: 1 });
  let rejoin = null;
  const R5 = await round(g, () => ({ a: 'wrong', d: 500 }), async () => {
    const i = g.bots.indexOf(victim);
    rejoin = await addBot(g, victim.name, victim.i, victim.token);
    g.bots[i] = rejoin;
  });
  assert.equal(rejoin.pid, victim.pid, '같은 학생으로 다시 접속');
  const snap = rejoin.join.snapshot;
  assert.ok(snap && snap.me && ['duel', 'vsGhost'].includes(snap.me.role), JSON.stringify(snap?.me));
  assert.equal(snap.last.phase, 'question');
  assert.ok(rejoin.result, '다시 접속한 학생도 결과를 받음 (다시 보낸 문제에 답함)');
  assert.equal(R5.r.allOut, true);
  assert.deepEqual(R5.r.outNames, []);
  for (const b of g.bots.filter(b => b.i <= 4)) { assert.equal(g.P(b.pid).m.alive, true); assert.equal(g.P(b.pid).m.hearts, 1); }
  assert.ok(g.feed.some(t => t.includes('모두')), g.feed.join('/'));

  // ---- 6판: 2명 남음 → 이기면 챔피언, 상대 탈락 보너스 +200 → 다음 누르면 끝
  force(g, { 0: 1, 1: 1 });
  const s6 = g.P(g.bots[0].pid).score;
  const R6 = await round(g, b => ({ a: b.i === 0 ? 'right' : 'wrong', d: 30 }));
  const champ = g.bots[0];
  assert.equal(R6.r.champion?.pid, champ.pid);
  assert.equal(champ.result.isChampion, true);
  assert.equal(champ.result.kos, 1);
  const gain = g.P(champ.pid).score - s6;
  assert.ok(gain >= 300 && gain <= 350, '승리 100 + 빠르기 + 탈락 보너스 200: ' + gain);
  assert.ok(g.bots[1].result.out);
  assert.ok(g.bots.every(b => b.result.champion?.pid === champ.pid), '챔피언을 모두에게 알림');

  // 순위 보기 → 다음 → 끝
  const bP = wait(g.t, 'm', m => m.type === 'phase' && m.data.phase === 'board');
  await call(g.t, 't:mode', { type: 'board', data: {} });
  const bd = (await bP).data;
  assert.equal(bd.alive.length, 1); assert.equal(bd.champion.pid, champ.pid);
  const endP = wait(g.t, 'end');
  await call(g.t, 't:mode', { type: 'ask', data: {} });
  const { ranking } = await endP;
  assert.equal(ranking.length, 7);
  assert.equal(ranking[0].pid, champ.pid); assert.equal(ranking[0].rank, 1); assert.equal(ranking[0].extra.champion, true);
  for (const r of ranking) for (const k of ['alive', 'hearts', 'wins', 'correct', 'answered', 'eliminatedRound']) assert.ok(k in r.extra, k);
  const k = r => [+r.extra.alive, r.extra.hearts, r.extra.wins, r.score];
  for (let i = 2; i < ranking.length; i++) {
    const a = k(ranking[i - 1]), b = k(ranking[i]);
    const c = a.map((x, j) => x - b[j]).find(x => x !== 0) ?? 0;
    assert.ok(c >= 0, `순위 순서 ${i}: ${a} / ${b}`);
  }
  await call(g.t, 't:close', {});
  [g.t, ...g.bots.map(b => b.s)].forEach(s => s.close());
});

test('문제가 다 떨어지면 (살아 있음, 하트, 승, 점수) 순으로 끝 · 모두 부활', async () => {
  const g = await game(4, { hearts: 3, shuffle: false }, QS.slice(0, 2));
  await call(g.t, 't:start', {});
  // 1판: 0·1번만 맞힘 (0이 더 빠름) → 2·3번 중 맞힌 상대가 있으면 하트 -1
  await round(g, b => ({ a: b.i <= 1 ? 'right' : 'wrong', d: 30 + b.i * 120 }));
  assert.equal(g.room.m.order[0], 0, '섞기 끄면 넣은 순서');
  // 부활: 응원석 학생 없음 → 그대로
  const rv = wait(g.t, 'm', m => m.type === 'revive');
  await call(g.t, 't:mode', { type: 'revive', data: {} });
  assert.equal((await rv).data.n, 0);
  // 3번을 응원석으로 보낸 뒤 부활 → 하트 1로 돌아옴
  force(g, { 0: 3, 1: 3, 2: 2 });
  const rv2 = wait(g.t, 'm', m => m.type === 'revive');
  await call(g.t, 't:mode', { type: 'revive', data: {} });
  assert.equal((await rv2).data.n, 1);
  assert.equal(g.P(g.bots[3].pid).m.alive, true); assert.equal(g.P(g.bots[3].pid).m.hearts, 1);
  await sleep(100);
  assert.equal(g.bots[3].duel.alive, true, '부활한 학생에게 알림');
  await round(g, b => ({ a: 'right', d: 30 + b.i * 120 }));
  const endP = wait(g.t, 'end');
  await call(g.t, 't:mode', { type: 'ask', data: {} });
  const { ranking } = await endP;
  assert.equal(ranking.length, 4);
  assert.ok(ranking.every(r => !r.extra.champion), '여러 명 살아 있으면 챔피언 없음');
  assert.ok(ranking[0].extra.alive);
  const k = r => [+r.extra.alive, r.extra.hearts, r.extra.wins, r.score];
  for (let i = 1; i < ranking.length; i++) {
    const a = k(ranking[i - 1]), b = k(ranking[i]);
    const c = a.map((x, j) => x - b[j]).find(x => x !== 0) ?? 0;
    assert.ok(c >= 0, `순위 ${a} / ${b}`);
    if (c === 0) assert.equal(ranking[i].rank, ranking[i - 1].rank, '같으면 같은 등수');
  }
  await call(g.t, 't:close', {});
  [g.t, ...g.bots.map(b => b.s)].forEach(s => s.close());
});

test('혼자서도 진행 (챔피언 없이 부전승) · 게임 중 들어온 학생은 응원석', async () => {
  const g = await game(1, { hearts: 2 }, QS.slice(0, 2));
  await call(g.t, 't:start', {});
  const R1 = await round(g, () => ({ a: 'right', d: 30 }), async () => {
    g.bots.push(await addBot(g, '늦은 친구', 9));
  });
  assert.equal(R1.r.champion, null);
  assert.equal(g.bots[0].result.outcome, 'bye');
  assert.equal(g.bots[1].duel.role, 'cheer');
  assert.equal(g.bots[1].duel.late, true);
  assert.equal(g.bots[1].result.outcome, 'cheer');
  await call(g.t, 't:close', {});
  [g.t, ...g.bots.map(b => b.s)].forEach(s => s.close());
});

test('문제 중 새로고침(잠깐 끊김)은 기다려 주고, 다시 들어와 낸 답도 인정', async () => {
  const g = await game(2, { hearts: 3 }, QS.slice(0, 2));
  await call(g.t, 't:start', {});
  let back = null;
  const R = await round(g, b => (b.i === 0 ? { a: 'right', d: 200 } : b.reborn ? { a: 'right', d: 50 } : { a: 'none' }), async () => {
    const old = g.bots[1];
    old.s.close();
    await sleep(1500);
    back = await addBot(g, old.name, 1, old.token);
    g.bots[1] = back;
  });
  assert.ok(R.ms < 5000, '다시 들어와 답하면 바로 공개: ' + R.ms);
  assert.equal(back.result.ok, true, '다시 들어와 낸 답 인정');
  assert.equal(back.result.outcome, 'lose', '시간은 처음 받은 때부터 (새로고침으로 시간 초기화 안 됨)');
  assert.equal(g.bots[0].result.outcome, 'win');
  await call(g.t, 't:close', {});
  [g.t, ...g.bots.map(b => b.s)].forEach(s => s.close());
});
