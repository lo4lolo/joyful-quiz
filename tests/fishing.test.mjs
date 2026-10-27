// 낚시 대회 서버 검사: 교사 1 + 봇 6. 던지기·감기·잘못된 감기·두 번 감기·미끼·이벤트·목표 끝·순위
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms, MODES } from '../server.js';
import FISHING, { FISH, rollCatch, rarityWeights, QUALITY } from '../server/modes/fishing.js';

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
const conn = () => new Promise(r => { const s = Client(url, { transports: ['websocket'], forceNew: true }); sockets.push(s); s.on('connect', () => r(s)); });
const call = (s, ev, d) => s.timeout(4000).emitWithAck(ev, d);
const wait = (s, ev, pred = () => true, ms = 6000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout ' + ev)), ms);
  const f = d => { if (pred(d)) { clearTimeout(t); s.off(ev, f); res(d); } }; s.on(ev, f);
});
const waitM = (s, type, pred = () => true, ms) => wait(s, 'm', m => m.type === type && pred(m.data), ms).then(m => m.data);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 문제 하나 받아서 맞히거나(ok) 틀리기
async function answer(s, qs, ok = true) {
  const qP = wait(s, 'q');
  let a = await call(s, 's:ask', {});
  for (let i = 0; a?.error === 'wait' && i < 5; i++) { await sleep(750); a = await call(s, 's:ask', {}); }
  assert.ok(a?.ok, 'ask ' + JSON.stringify(a));
  const v = await qP;
  const Q = qs[v.qid];
  const given = ok ? Q.answers[0] : (v.choices ? v.choices.find(c => c !== Q.answers[0]) : '모름모름');
  return call(s, 's:answer', { qid: v.qid, given });
}
const mode = (s, type, data = {}) => call(s, 's:mode', { type, data });

async function setup(settings = {}, n = 6) {
  const t = await conn();
  const c = await call(t, 't:create', { title: '낚시반', mode: 'fishing', settings: { time: 10, ...settings }, questions: QS });
  assert.ok(c.code && c.key, JSON.stringify(c));
  const bots = [];
  for (let i = 0; i < n; i++) {
    const s = await conn();
    const j = await call(s, 's:join', { code: c.code, name: `${i + 1} 어부${i}`, device: i % 2 ? 'touch' : 'pc' });
    assert.ok(j.ok, JSON.stringify(j));
    s.pid = j.pid;
    bots.push(s);
  }
  return { t, c, qs: c.questions, bots, room: rooms.get(c.code) };
}

test('모듈이 불러와지고 설정을 정리한다', () => {
  assert.ok(MODES.fishing, 'server.js 가 fishing 을 불러옴');
  assert.deepEqual(FISHING.settings({}), { minutes: 7, goal: 0, frenzy: true });
  assert.deepEqual(FISHING.settings({ minutes: 10, goal: 300, frenzy: false }), { minutes: 10, goal: 300, frenzy: false });
  assert.deepEqual(FISHING.settings({ minutes: 999, goal: -5, frenzy: 'false' }), { minutes: 7, goal: 0, frenzy: false });
  assert.deepEqual(FISHING.settings({ minutes: '5', goal: '1000' }), { minutes: 5, goal: 1000, frenzy: true });
  // 그림 파일과 같은 id
  const ids = FISH.map(f => f.id).sort();
  assert.deepEqual(ids, ['boot', 'can', 'carp', 'clownfish', 'golden_koi', 'goldfish', 'mackerel', 'minnow', 'octopus2', 'pufferfish', 'rainbow_trout', 'squid', 'swordfish', 'whale_baby']);
});

test('미끼가 좋을수록 귀한 물고기, 무게는 범위 안', () => {
  const w1 = rarityWeights(1), w5 = rarityWeights(5);
  assert.ok(w5.legendary > w1.legendary && w5.epic > w1.epic && w5.common < w1.common);
  const count = lure => { let rare = 0; for (let i = 0; i < 4000; i++) { const c = rollCatch(lure); if (['epic', 'legendary'].includes(c.rarity)) rare++; } return rare; };
  assert.ok(count(5) > count(1) * 2, '미끼 5가 미끼 1보다 대어가 훨씬 많이');
  for (let i = 0; i < 3000; i++) {
    const c = rollCatch(1 + (i % 5)), f = FISH.find(x => x.id === c.id);
    assert.ok(c.base >= Math.max(0.1, f.min - 0.05) && c.base <= f.max + 0.05, `${c.id} ${c.base}`);
  }
});

test('한 판: 던지기·감기·잘못된 감기·두 번 감기·미끼·순위', async () => {
  const { t, qs, bots, room } = await setup({ minutes: 5, frenzy: false });
  // 시작 전 던지기는 무시 (state !== play)
  const logs = []; t.on('log', l => logs.push(l));
  const catches = []; t.on('m', m => { if (m.type === 'catch') catches.push(m.data); });
  const startP = waitM(bots[0], 'start');
  const st = await call(t, 't:start', {});
  assert.ok(st.ok, JSON.stringify(st));
  const sd = await startP;
  assert.ok(sd.endsIn > 4 * 60e3 && sd.endsIn <= 5 * 60e3 + 3000, '남은 시간(ms) 보냄');

  const [a, b, c, d, e, f] = bots;
  // 맞히기 전에 던지기 → 거절
  assert.ok((await mode(a, 'cast')).error, '문제를 맞히기 전에는 던질 수 없음');
  assert.ok((await mode(a, 'reel', { quality: 'perfect' })).error, '물고기 없이 감기 거절');

  // a: 맞히기 → 던지기 → 완벽하게 감기
  const lureP = waitM(a, 'lure');
  const r1 = await answer(a, qs, true);
  assert.equal(r1.ok, true);
  const lu = await lureP;
  assert.equal(lu.canCast, true);
  const k1 = await mode(a, 'cast');
  assert.ok(k1.ok && k1.catch?.id && k1.catch.base > 0, JSON.stringify(k1));
  const again = await mode(a, 'cast'); // 응답을 못 받은 척 다시 던지기 → 같은 물고기, 새로 굴리지 않음
  assert.ok(again.again && again.catch.id === k1.catch.id && again.catch.base === k1.catch.base);
  const base = k1.catch.base;
  const g1 = await mode(a, 'reel', { quality: 'perfect' });
  assert.ok(g1.ok, JSON.stringify(g1));
  assert.equal(g1.res.quality, 'perfect');
  assert.equal(g1.res.kg, Math.max(0.1, Math.round(base * 1.5 * 10) / 10));
  assert.equal(g1.res.isNew, true);
  assert.equal(g1.dex[k1.catch.id].n, 1);
  // 두 번 감기 → 거절, 무게 그대로
  const kgAfter = room.players.get(a.pid).m.kg;
  const dbl = await mode(a, 'reel', { quality: 'perfect' });
  assert.ok(dbl.error, '두 번 감기는 거절');
  assert.equal(room.players.get(a.pid).m.kg, kgAfter);
  // 던지기도 한 번만
  assert.ok((await mode(a, 'cast')).error, '한 번 맞히면 한 번만 던짐');

  // b: 이상한 품질 값 → miss(×1.0) 로 처리
  await answer(b, qs, true);
  const k2 = await mode(b, 'cast');
  const g2 = await mode(b, 'reel', { quality: 'superduper' });
  assert.equal(g2.res.quality, 'miss');
  assert.equal(g2.res.kg, Math.max(0.1, k2.catch.base));
  await answer(b, qs, true);
  const k3 = await mode(b, 'cast');
  const g3 = await mode(b, 'reel', { quality: { evil: 1 } });
  assert.equal(g3.res.quality, 'miss');
  await answer(b, qs, true);
  const k4 = await mode(b, 'cast');
  const g4 = await mode(b, 'reel', { quality: 'good' });
  assert.equal(g4.res.kg, Math.max(0.1, Math.round(k4.catch.base * 1.2 * 10) / 10));
  const bp = room.players.get(b.pid);
  assert.equal(bp.m.count, 3);
  assert.equal(bp.score, Math.round((g2.res.kg + g3.res.kg + g4.res.kg) * 10) / 10);

  // c: 미끼 — 연속 2번 정답마다 +1, 오답이면 -1
  const cp = room.players.get(c.pid);
  for (let i = 0; i < 4; i++) { await answer(c, qs, true); await mode(c, 'cast'); await mode(c, 'reel', { quality: 'good' }); }
  assert.equal(cp.m.lure, 3, '4연속 정답 → 미끼 3');
  const tangle = waitM(c, 'lure', x => x.tangled);
  const wr = await answer(c, qs, false);
  assert.equal(wr.ok, false);
  const tg = await tangle;
  assert.equal(tg.lure, 2, '오답 → 미끼 한 단계 내려감');
  assert.ok(tg.down);
  assert.ok((await mode(c, 'cast')).error, '틀리면 던질 수 없음');
  for (let i = 0; i < 12; i++) { await answer(c, qs, true); await mode(c, 'cast'); await mode(c, 'reel', { quality: 'miss' }); }
  assert.equal(cp.m.lure, 5, '최대 5');

  // d: 맞히고 던지지 않은 채 다음 문제 → 자동으로 낚음(×1.0), 멈추지 않음 (봇·새로고침 대비)
  await answer(d, qs, true);
  await answer(d, qs, true);
  const dp = room.players.get(d.pid);
  assert.equal(dp.m.count, 1, '던지지 않은 물고기도 다음 문제를 받을 때 낚음');
  assert.equal(dp.m.canCast, true);
  // 던지고 감지 않은 채 다음 문제 → 자동으로 감음
  await mode(d, 'cast');
  await answer(d, qs, false);
  assert.equal(dp.m.count, 2);
  assert.equal(dp.m.hook, null);

  // 다시 접속(스냅숏): 걸린 물고기·미끼·도감
  await answer(e, qs, true);
  const ke = await mode(e, 'cast');
  const ep = room.players.get(e.pid);
  const re = await conn();
  const rj = await call(re, 's:join', { code: room.code, token: ep.token });
  assert.ok(rj.ok);
  assert.equal(rj.snapshot.hook.id, ke.catch.id, '스냅숏에 걸린 물고기');
  assert.equal(rj.snapshot.lure, 1);
  assert.ok(Array.isArray(rj.snapshot.top));
  const ge = await mode(re, 'reel', { quality: 'good' });
  assert.ok(ge.ok, '다시 접속한 기기에서 이어서 감기');
  const rj2 = await call(re, 's:join', { code: room.code, token: ep.token });
  assert.equal(rj2.snapshot.hook, null);
  assert.equal(rj2.snapshot.dex[ke.catch.id].n, 1);
  // 교사 다시 접속 스냅숏
  const tr = await conn();
  const tj = await call(tr, 't:rejoin', { code: room.code, key: room.key });
  assert.ok(tj.snapshot.top.length >= 4 && Array.isArray(tj.snapshot.big));

  // 순위판 방송
  const bd = await waitM(f, 'board', () => true, 4000);
  assert.ok(bd.top[0].kg >= bd.top[1].kg);
  assert.ok(bd.all.some(x => x[0] === c.pid));
  assert.ok(bd.endsIn > 0);
  assert.ok(catches.length >= 15, '교사에게 낚은 물고기 소식 ' + catches.length);
  assert.ok(catches.every(x => x.player && x.pid && x.kg > 0 && x.id), '소식에 학생 이름·물고기·무게');
  assert.ok(logs.length >= 20);

  // 끝 → 순위
  const endP = wait(f, 'end');
  await call(t, 't:end', {});
  const { ranking } = await endP;
  assert.equal(ranking.length, 6);
  const heaviest = [...room.players.values()].sort((x, y) => y.m.kg - x.m.kg)[0];
  assert.equal(ranking[0].score, heaviest.m.kg, '가장 무거운 사람이 1등');
  assert.equal(ranking[0].rank, 1);
  for (let i = 1; i < ranking.length; i++) assert.ok(ranking[i - 1].score >= ranking[i].score);
  const rc = ranking.find(r => r.pid === c.pid);
  assert.equal(rc.extra.kg, rc.score);
  assert.equal(rc.extra.count, 16);
  assert.equal(rc.extra.correct, 16);
  assert.equal(rc.extra.answered, 17);
  assert.equal(typeof rc.extra.biggest, 'string');
  assert.match(rc.extra.biggest, /kg$/);
  assert.equal(String(rc.score), String(Math.round(rc.score * 10) / 10), '소수 한 자리');
  // 끝난 뒤 던지기·감기 무시
  const late = await Promise.race([mode(a, 'cast'), sleep(300).then(() => 'none')]);
  assert.equal(late, 'none', '끝난 뒤에는 응답 없음');
  await call(t, 't:close', {});
  assert.ok(!rooms.has(room.code));
});

test('이벤트: 물고기 떼 ×2, 황금 잉어는 처음 낚은 한 명만, 선생님이 부르기', async () => {
  const { t, qs, bots, room } = await setup({ minutes: 5, frenzy: true }, 4);
  await call(t, 't:start', {});
  const [a, b, c, d] = bots;
  assert.ok(room.m.nextEv > Date.now() + 50e3, '첫 이벤트는 1분쯤 뒤');
  // 빨리 감기: 다음 이벤트를 지금으로
  room.m.lastKinds = ['koi']; // 다음은 물고기 떼
  const warnP = waitM(a, 'event', e => e.kind === 'frenzy' && e.phase === 'warn');
  const onP = waitM(a, 'event', e => e.kind === 'frenzy' && e.phase === 'on', 5000);
  room.m.nextEv = Date.now();
  const w = await warnP;
  assert.ok(w.startsIn > 0 && w.leftMs > w.startsIn);
  const on = await onP;
  assert.ok(on.leftMs > 13000 && on.leftMs <= 15000, '15초 창 ' + on.leftMs);
  // 물고기 떼 중에 낚기 → ×2
  await answer(a, qs, true);
  const ka = await mode(a, 'cast');
  assert.equal(ka.catch.frenzy, true);
  const ga = await mode(a, 'reel', { quality: 'good' });
  assert.equal(ga.res.kg, Math.max(0.1, Math.round(ka.catch.base * 1.2 * 2 * 10) / 10));
  // 물고기 떼 중에 맞히고, 끝난 직후 던져도 ×2 (감기·애니메이션 시간 때문에 억울하지 않게)
  await answer(b, qs, true);
  const endP = waitM(a, 'event', e => e.kind === null && e.ended === 'frenzy');
  room.m.ev.endsAt = Date.now(); // 빨리 감기
  await endP;
  const kb = await mode(b, 'cast');
  assert.equal(kb.catch.frenzy, true, '이벤트 중에 맞힌 기회는 ×2 유지');
  await mode(b, 'reel', { quality: 'miss' });
  // 이벤트가 끝난 뒤에 맞힌 것은 보통
  await answer(c, qs, true);
  const kc = await mode(c, 'cast');
  assert.equal(kc.catch.frenzy, false);
  await mode(c, 'reel', { quality: 'miss' });
  assert.ok(room.m.nextEv > Date.now() + 50e3, '다음 이벤트 예약');

  // 황금 잉어: 선생님이 부르기
  const koiOn = waitM(a, 'event', e => e.kind === 'koi' && e.phase === 'on', 8000);
  const tc = await call(t, 't:mode', { type: 'event', data: { kind: 'koi' } });
  assert.ok(tc.ok, JSON.stringify(tc));
  const dup = await call(t, 't:mode', { type: 'event', data: { kind: 'frenzy' } });
  assert.ok(dup.error, '이벤트 중에는 새 이벤트 거절');
  room.m.ev.startsAt = Date.now(); // 예고 건너뛰기
  await koiOn;
  await Promise.all([answer(c, qs, true), answer(d, qs, true)]);
  const koiEnd = waitM(a, 'event', e => e.kind === null && e.ended === 'koi');
  const [kc2, kd2] = await Promise.all([mode(c, 'cast'), mode(d, 'cast')]);
  const winners = [kc2, kd2].filter(k => k.catch.koi);
  assert.equal(winners.length, 1, '황금 잉어는 한 명만');
  assert.equal(winners[0].catch.id, 'golden_koi');
  assert.ok(winners[0].catch.base >= 40);
  const ke = await koiEnd;
  assert.ok(ke.winner, '이벤트 끝 방송에 주인 이름');
  const koiMsg = waitM(b, 'koi');
  await mode(c, 'reel', { quality: 'perfect' }); await mode(d, 'reel', { quality: 'perfect' });
  const km = await koiMsg;
  assert.equal(km.name, ke.winner);
  // 다음 이벤트에서 황금 잉어 기회가 남지 않음
  await answer(a, qs, true);
  const ka2 = await mode(a, 'cast');
  assert.equal(ka2.catch.koi, false);
  await mode(a, 'reel', { quality: 'good' });

  // 아무도 못 낚은 황금 잉어 → 도망
  const tc2 = await call(t, 't:mode', { type: 'event', data: { kind: 'koi' } });
  assert.ok(tc2.ok);
  room.m.ev.startsAt = Date.now();
  await waitM(a, 'event', e => e.kind === 'koi' && e.phase === 'on');
  const esc = waitM(a, 'event', e => e.ended === 'koi');
  room.m.ev.endsAt = Date.now();
  const es = await esc;
  assert.equal(es.escaped, true);

  // 끝나기 직전에는 자동 이벤트 없음
  room.m.endsAt = Date.now() + 8000; room.m.nextEv = Date.now();
  await sleep(400);
  assert.equal(room.m.ev, null);
  assert.equal(room.m.nextEv, Infinity);
  await call(t, 't:end', {});
  await call(t, 't:close', {});
});

test('물고기 떼 끄기: 자동 이벤트 없음', async () => {
  const { t, room } = await setup({ minutes: 5, frenzy: false }, 2);
  await call(t, 't:start', {});
  assert.equal(room.m.nextEv, Infinity);
  await sleep(300);
  assert.equal(room.m.ev, null);
  await call(t, 't:close', {});
});

test('목표 무게에 닿으면 일찍 끝, 시간이 끝나면 걸린 물고기도 셈', async () => {
  const { t, qs, bots, room } = await setup({ minutes: 5, goal: 100, frenzy: false }, 3);
  await call(t, 't:start', {});
  const [a, b, c] = bots;
  const ap = room.players.get(a.pid);
  ap.m.kg = 99.9; ap.score = 99.9; // 빨리 감기
  const goalP = waitM(c, 'goal');
  const endP = wait(c, 'end', () => true, 6000);
  await answer(a, qs, true); await mode(a, 'cast'); await mode(a, 'reel', { quality: 'good' });
  const g = await goalP;
  assert.equal(g.pid, a.pid);
  // 목표 달성 뒤에는 새 문제를 주지 않음
  const ask = await call(b, 's:ask', {});
  assert.equal(ask.error, 'wait');
  const { ranking } = await endP;
  assert.equal(ranking[0].pid, a.pid);
  assert.ok(ranking[0].score >= 100);
  await call(t, 't:close', {});

  // 시간 끝: 던지고 감지 않은 물고기는 ×1.0 으로 셈
  const s2 = await setup({ minutes: 5, frenzy: false }, 2);
  await call(s2.t, 't:start', {});
  const [x] = s2.bots;
  await answer(x, s2.qs, true);
  const kx = await mode(x, 'cast');
  const end2 = wait(x, 'end');
  s2.room.m.endsAt = Date.now();
  const r2 = await end2;
  const me = r2.ranking.find(r => r.pid === x.pid);
  assert.equal(me.score, Math.max(0.1, kx.catch.base));
  assert.equal(me.extra.count, 1);
  await call(s2.t, 't:close', {});
});
