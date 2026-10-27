// 다 함께 보스전 검사: 교사 + 봇 6명 → 보스 3마리 처치(승리) · 방어 미션 성공/실패 · 시간 끝(아쉬운 결과) · 순위 · 다시 접속
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms, MODES } from '../server.js';
import raid, { RULE, BOSSES, PER_PLAYER, streakMult } from '../server/modes/raid.js';

let url;
const sockets = new Set();
before(() => new Promise(r => server.listen(0, () => { url = `http://localhost:${server.address().port}`; r(); })));
after(() => new Promise(r => { sockets.forEach(s => s.close()); io.close(() => r()); server.closeAllConnections?.(); }));

// 검사를 빠르게: 쉬는 시간·끝내기 지연·미션 시간 줄이기 (서버와 같은 모듈)
RULE.intermission = 300; RULE.endDelay = 300; RULE.missionMs = 1500;

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
const waitEv = (s, ev, ms = 8000) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout ' + ev)), ms); s.once(ev, d => { clearTimeout(t); res(d); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function setup(n = 6, settings = { length: 'short', minutes: 5, time: 10 }) {
  const t = await conn();
  const c = await call(t, 't:create', { title: '보스반', mode: 'raid', settings, questions: QS });
  assert.ok(c.code, JSON.stringify(c));
  const bots = [];
  for (let i = 0; i < n; i++) {
    const s = await conn();
    const j = await call(s, 's:join', { code: c.code, name: `${i + 1} 용사${i}`, device: i % 2 ? 'touch' : 'pc' });
    assert.ok(j.ok, JSON.stringify(j));
    s.pid = j.pid; s.token = j.token; s.atk = []; s.on('m', m => { if (m.type === 'atk') s.atk.push(m.data); });
    bots.push(s);
  }
  return { t, c, bots, room: () => rooms.get(c.code) };
}
// 봇: 문제를 받아 정답(또는 오답)을 내며 stop() 할 때까지 계속
function run(bots, qs, { correct = () => true } = {}) {
  let on = true;
  const loops = bots.map(async s => {
    while (on && s.connected) {
      const qP = waitEv(s, 'q', 3000).catch(() => null);
      const a = await call(s, 's:ask', {}).catch(() => ({ error: 'x' }));
      if (a?.error) { await sleep(250); continue; }
      const v = await qP; if (!v || !on) continue;
      const Q = qs[v.qid], ok = correct(s);
      const given = ok ? Q.answers[0] : (v.choices ? v.choices.find(x => x !== Q.answers[0]) : '모름');
      await call(s, 's:answer', { qid: v.qid, given }).catch(() => {});
    }
  });
  return async () => { on = false; await Promise.allSettled(loops); };
}

test('설정 정리 · 공격력 규칙', () => {
  assert.equal(MODES.raid, raid, '서버가 같은 모듈을 쓴다');
  assert.deepEqual(raid.settings({}), { length: 'normal', minutes: 15 });
  assert.deepEqual(raid.settings({ length: 'long', minutes: '20' }), { length: 'long', minutes: 20 });
  assert.deepEqual(raid.settings({ length: 'constructor', minutes: 7 }), { length: 'normal', minutes: 15 });
  assert.equal(streakMult(1), 1); assert.equal(streakMult(2), 1); assert.equal(streakMult(3), 1.5); assert.equal(streakMult(4), 1.5); assert.equal(streakMult(5), 2); assert.equal(streakMult(9), 2);
  assert.deepEqual(BOSSES.map(b => b.id), ['slime_king', 'rock_golem', 'cloud_dragon']);
  assert.deepEqual(BOSSES.map(b => b.mult), [1, 1.4, 1.8]);
  assert.ok(PER_PLAYER.short < PER_PLAYER.normal && PER_PLAYER.normal < PER_PLAYER.long);
});

test('보스 3마리 처치 → 승리 · 맞은 공격 묶음 · 순위', async () => {
  const { t, c, bots, room } = await setup();
  const bossMsgs = [], hitMsgs = [], defeats = [];
  t.on('m', m => {
    if (m.type === 'boss') { bossMsgs.push(m.data); const r = room(); if (r) r.m.hp = 220; } // 검사를 빠르게: 등장하자마자 체력 줄이기
    if (m.type === 'hits') hitMsgs.push(m.data);
    if (m.type === 'defeat') defeats.push(m.data);
  });
  const resultP = wait(t, 'result', () => true, 20000);
  const endP = waitEv(t, 'end', 22000);
  assert.ok((await call(t, 't:start', {})).ok);
  const r0 = room();
  assert.equal(r0.m.max, 6 * PER_PLAYER.short * 1, '첫 보스 체력 = 인원 × 한 사람당 체력');
  const stop = run(bots, c.questions);
  const result = await resultP;
  await stop();
  assert.equal(result.win, true);
  assert.equal(result.down, 3);
  assert.equal(defeats.length, 2, '마지막 보스 전까지 처치 방송 2번');
  assert.deepEqual(bossMsgs.map(b => b.boss.id), ['slime_king', 'rock_golem', 'cloud_dragon']);
  assert.equal(bossMsgs[1].boss.max, Math.round(6 * PER_PLAYER.short * 1.4), '두 번째 보스 ×1.4');
  assert.ok(hitMsgs.length > 0 && hitMsgs.every(h => Array.isArray(h.hits) && h.hits.length >= 1));
  assert.ok(hitMsgs.some(h => h.hits.length > 1), '여러 공격을 한 메시지로 묶어 보냄');
  for (const h of hitMsgs) for (const x of h.hits) assert.ok([10, 15, 20, 30, 40].includes(x.dmg), 'dmg ' + x.dmg);
  // 학생 공격 결과: 연속 정답이면 세짐, 크리티컬은 두 배
  for (const s of bots) for (const a of s.atk.filter(a => !a.miss)) {
    assert.equal(a.dmg, RULE.base * a.mult * (a.crit ? 2 : 1));
    assert.equal(a.mult, streakMult(a.streak));
  }
  assert.ok(bots.some(s => s.atk.some(a => a.streak >= 5 && a.mult === 2)), '5연속이면 두 배');
  const end = await endP;
  assert.equal(end.ranking.length, 6);
  const rk = end.ranking;
  for (let i = 1; i < rk.length; i++) assert.ok(rk[i - 1].score >= rk[i].score, '공격력 순');
  assert.ok(rk.every(x => x.extra.classWin === true && x.extra.bossesDown === 3 && x.extra.damage === x.score && x.extra.answered >= x.extra.correct));
  assert.ok(rk.every(x => x.rank >= 1 && 'crits' in x.extra && 'bossesHelped' in x.extra));
  assert.ok(rk[0].extra.bossesHelped >= 1);
  assert.equal(room().state, 'end');
  await call(t, 't:close', {});
  [t, ...bots].forEach(s => s.close());
});

test('방어 미션: 성공하면 반사 공격, 실패하면 보스 회복', async () => {
  const { t, c, bots, room } = await setup(5, { length: 'long', minutes: 10, time: 10 });
  assert.ok((await call(t, 't:start', {})).ok);
  const r = room();
  // 성공: 다 같이 맞히기 (5명 × 0.4 → 2문제)
  r.m.hp = r.m.max - 500;
  let startP = wait(t, 'mission', d => d.state === 'start');
  r.m.nextMission = Date.now();
  const st = await startP;
  assert.equal(st.need, Math.ceil(5 * RULE.missionRatio));
  assert.ok(st.left > 0 && st.left <= RULE.missionMs);
  const okP = wait(t, 'mission', d => d.state === 'ok' || d.state === 'fail');
  let stop = run(bots, c.questions);
  const ok = await okP;
  await stop();
  assert.equal(ok.state, 'ok');
  assert.equal(ok.bonus, Math.round(r.m.max * RULE.burst));
  assert.ok(ok.helpers >= 1);
  assert.ok(r.m.nextMission > Date.now() + RULE.missionGap[0] - 2000, '다음 미션은 60~80초 뒤');
  // 실패: 아무도 맞히지 않음 → 8% 회복 (최대 체력은 넘지 않음)
  await sleep(300);
  const hp0 = r.m.hp;
  startP = wait(t, 'mission', d => d.state === 'start');
  r.m.nextMission = Date.now();
  await startP;
  const failP = wait(t, 'mission', d => d.state === 'ok' || d.state === 'fail', 5000);
  stop = run(bots, c.questions, { correct: () => false });
  const fail = await failP;
  await stop();
  assert.equal(fail.state, 'fail');
  assert.equal(fail.heal, Math.min(Math.round(r.m.max * RULE.heal), r.m.max - hp0));
  assert.equal(r.m.hp, Math.min(r.m.max, hp0 + Math.round(r.m.max * RULE.heal)));
  // 틀려도 개인 점수는 깎이지 않음
  for (const p of r.players.values()) assert.ok(p.m.damage >= 0 && p.score === p.m.damage);
  // 다시 접속: 진행 상태 받기
  const s0 = bots[0]; s0.close();
  await sleep(150);
  const s = await conn();
  const j = await call(s, 's:join', { code: c.code, name: '1 용사0', token: s0.token });
  assert.ok(j.ok && j.snapshot, JSON.stringify(j).slice(0, 200));
  assert.equal(j.snapshot.boss.id, 'slime_king');
  assert.equal(j.snapshot.boss.hp, r.m.hp);
  assert.equal(j.snapshot.me.damage, r.players.get(j.pid).m.damage);
  assert.ok('streak' in j.snapshot.me && j.snapshot.timeLeft > 0 && j.snapshot.phase === 'fight');
  const tr = await call(t, 't:rejoin', { code: c.code, key: c.key });
  assert.ok(tr.snapshot?.boss && Array.isArray(tr.snapshot.mvp) && tr.snapshot.me === null);
  await call(t, 't:close', {});
  [t, s, ...bots].forEach(x => x.close());
});

test('시간이 끝나면 "보스가 도망갔어요" → 끝', async () => {
  const { t, c, bots, room } = await setup(3);
  assert.ok((await call(t, 't:start', {})).ok);
  const stop = run(bots, c.questions);
  await sleep(1500);
  const resultP = wait(t, 'result');
  const studentResultP = wait(bots[0], 'result');
  const endP = waitEv(t, 'end');
  room().m.endsAt = Date.now();
  const res = await resultP;
  assert.equal(res.win, false);
  assert.match(res.text, /도망/);
  assert.equal((await studentResultP).win, false, '학생 화면에도 결과 방송');
  const askAfter = await call(bots[1], 's:ask', {});
  assert.ok(askAfter?.error || room().state === 'end', '끝난 뒤에는 문제를 주지 않음');
  const end = await endP;
  await stop();
  assert.equal(end.ranking.length, 3);
  assert.ok(end.ranking.every(x => x.extra.classWin === false && x.extra.bossesDown === 0));
  assert.ok(end.ranking.some(x => x.score > 0), '그동안 쌓은 공격력은 남음');
  await call(t, 't:close', {});
  [t, ...bots].forEach(s => s.close());
});

test('선생님이 먼저 끝내도 안전 · 다시 하기', async () => {
  const { t, c, bots, room } = await setup(2);
  assert.ok((await call(t, 't:start', {})).ok);
  const stop = run(bots, c.questions);
  await sleep(800);
  const endP = waitEv(t, 'end');
  await call(t, 't:end', {});
  const end = await endP;
  await stop();
  assert.equal(end.ranking.length, 2);
  // 같은 방 다시 하기: 새 보스, 점수 초기화
  await call(t, 't:lobby', {});
  const bossP = wait(t, 'boss');
  assert.ok((await call(t, 't:start', {})).ok);
  const b = await bossP;
  assert.equal(b.boss.bi, 0); assert.equal(b.boss.hp, b.boss.max);
  assert.ok([...room().players.values()].every(p => p.score === 0 && p.m.damage === 0));
  await call(t, 't:close', {});
  [t, ...bots].forEach(s => s.close());
});
