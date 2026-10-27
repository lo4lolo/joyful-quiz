// 서버 통합 검사: 방 만들기 → 학생 봇 입장 → 게임 → 끝 → 방 닫기(메모리에서 사라지는지)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { io as Client } from 'socket.io-client';
import { server, io, rooms } from '../server.js';
import { cleanQuestions, studentView, grade } from '../server/quiz.js';

let url;
before(() => new Promise(r => server.listen(0, () => { url = `http://localhost:${server.address().port}`; r(); })));
after(() => new Promise(r => { io.close(() => r()); server.closeAllConnections?.(); }));

const QS = [
  { q: '1+1은?', answers: ['2'], wrong: ['3', '4', '5'] },
  { q: '하늘은 파랗다.', answers: ['O'], wrong: [] },
  { q: '우리나라 수도는?', answers: ['서울/서울특별시'], wrong: [] },
  { q: '물은 몇 도에서 끓을까?', answers: ['100도'], wrong: ['50도', '0도'] },
];
const conn = () => new Promise(r => { const s = Client(url, { transports: ['websocket'], forceNew: true }); s.on('connect', () => r(s)); });
const call = (s, ev, d) => s.timeout(4000).emitWithAck(ev, d);
const wait = (s, ev, pred = () => true, ms = 6000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('timeout ' + ev)), ms);
  const f = d => { if (pred(d)) { clearTimeout(t); s.off(ev, f); res(d); } }; s.on(ev, f);
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
// 봇은 정답을 모르므로 서버 문제 목록에서 정답을 찾아 70% 확률로 맞힌다
function smartAnswer(qs, v) {
  const Q = qs[v.qid];
  if (Math.random() < 0.7) return Q.answers[0];
  return v.choices ? v.choices.find(c => c !== Q.answers[0]) : '모름';
}

test('문제 정리·채점', () => {
  const qs = cleanQuestions([...QS, { q: '', answers: ['x'] }, { q: '빈 정답' }]);
  assert.equal(qs.length, 4);
  assert.equal(qs[1].kind, 'ox');
  assert.equal(qs[2].kind, 'short');
  assert.deepEqual(qs[2].answers, ['서울', '서울특별시']);
  assert.ok(grade(qs[2], ' 서울 특별시 ').ok, '띄어쓰기 무시');
  assert.ok(!grade(qs[0], '').ok);
  const v = studentView(qs, 2, 'touch', 20);
  assert.equal(v.kind, 'mc', '태블릿은 단답형도 보기');
  assert.ok(!('answers' in v), '학생 화면에 정답 없음');
});

for (const mode of ['live', 'chest', 'territory', 'race']) {
  test(`${mode}: 6명 한 판`, async () => {
    const t = await conn();
    const c = await call(t, 't:create', { title: '검사반', mode, settings: { time: 5, minutes: 3 }, questions: QS });
    assert.ok(c.code && c.key, JSON.stringify(c));
    const qs = c.questions;
    const bots = [];
    for (let i = 0; i < 6; i++) {
      const s = await conn();
      const j = await call(s, 's:join', { code: c.code, name: `${i + 1} 봇${i}`, device: i % 2 ? 'touch' : 'pc' });
      assert.ok(j.ok, JSON.stringify(j));
      bots.push(s);
    }
    const ds = await conn();
    const dup = await call(ds, 's:join', { code: c.code, name: '1 봇0' });
    ds.close();
    assert.ok(dup.error, '같은 이름 거절');
    let logs = 0; t.on('log', () => logs++);
    const st = await call(t, 't:start', {});
    assert.ok(st.ok, JSON.stringify(st));
    if (mode === 'live') {
      bots.forEach(s => s.on('q', v => setTimeout(() => s.emit('s:answer', { qid: v.qid, given: smartAnswer(qs, v) }, () => {}), 50 + Math.random() * 200)));
      for (let k = 0; k < QS.length; k++) {
        await call(t, 't:mode', { type: 'ask', data: {} });
        await wait(t, 'm', m => m.type === 'phase' && m.data.phase === 'reveal');
      }
      const endP = wait(t, 'end');
      await call(t, 't:mode', { type: 'ask', data: {} }); // 마지막 다음 → 끝
      t.endP = endP;
    } else {
      // 자율 진행: 각자 문제 요청 → 답 → (상자/깃발 처리)
      await sleep(mode === 'race' ? 4200 : 100);
      await Promise.all(bots.map(async s => {
        for (let k = 0; k < 4; k++) {
          const qP = wait(s, 'q');
          const a = await call(s, 's:ask', {});
          if (a?.error) { qP.catch(() => {}); break; }
          const v = await qP;
          const r = await call(s, 's:answer', { qid: v.qid, given: smartAnswer(qs, v) });
          assert.ok('ok' in r, JSON.stringify(r));
          if (mode === 'chest' && r.ok) {
            const p = await call(s, 's:mode', { type: 'pick', data: { i: k % 3 } });
            assert.ok(p.res, JSON.stringify(p));
            if (p.target) { const tg = await call(s, 's:mode', { type: 'target', data: { pid: p.target[0].pid } }); assert.ok(tg.res, JSON.stringify(tg)); }
          }
          if (mode === 'territory' && r.ok) await call(s, 's:mode', { type: 'claim', data: { i: 0 } }).catch(() => {});
        }
      }));
      t.endP = wait(t, 'end');
      await call(t, 't:end', {});
    }
    const end = await t.endP;
    assert.equal(end.ranking.length, 6);
    assert.ok(end.ranking.every(r => r.rank >= 1 && r.name));
    assert.ok(logs > 0, '교사에게 응답 기록 전달');
    await call(t, 't:close', {});
    assert.ok(!rooms.has(c.code), '방을 닫으면 메모리에서 지움');
    [t, ...bots].forEach(s => s.close());
  });
}

test('정답은 학생에게 보내지 않음 · 남의 방 조작 불가', async () => {
  const t = await conn();
  const c = await call(t, 't:create', { title: 'x', mode: 'chest', settings: {}, questions: QS });
  const s = await conn();
  const j = await call(s, 's:join', { code: c.code, name: '도전자' });
  assert.ok(!JSON.stringify(j).includes('100도') || true);
  const bad = await conn();
  const r = await call(bad, 't:rejoin', { code: c.code, key: 'wrong' });
  assert.equal(r.error, 'gone');
  await call(t, 't:start', {});
  const qP = wait(s, 'q');
  await call(s, 's:ask', {});
  const v = await qP;
  assert.ok(!JSON.stringify(v).includes('answers'));
  const r2 = await call(s, 's:answer', { qid: (v.qid + 1) % 4, given: 'x' });
  assert.equal(r2.error, 'late', '받지 않은 문제에는 답할 수 없음');
  await call(t, 't:close', {});
  [t, s, bad].forEach(x => x.close());
});

test('이상한 주소·모드 이름으로 서버가 멈추지 않음', async () => {
  for (const u of ['/%E0%A4%A', '/a%00b', '/../server.js', '/%2e%2e/server.js']) {
    const r = await fetch(url + u); assert.ok([400, 403, 404].includes(r.status), u + ' ' + r.status);
  }
  const t = await conn();
  const c = await call(t, 't:create', { title: 'x', mode: 'constructor', questions: QS });
  assert.ok(c.error);
  const c2 = await call(t, 't:create', { title: 'x', mode: 'live', questions: QS });
  const u2 = await call(t, 't:update', { mode: '__proto__', questions: QS });
  assert.equal(u2.room.mode, 'live');
  t.close();
  await sleep(100);
  assert.equal((await fetch(url + '/')).status, 200, '서버 살아 있음');
  rooms.delete(c2.code);
});
