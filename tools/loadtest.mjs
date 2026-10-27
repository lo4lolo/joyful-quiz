// 부하 시험: 서버를 따로 띄우고 여러 반(방) × 학생 봇으로 실제 수업처럼 플레이한다.
// 사용: node tools/loadtest.mjs [시나리오=grade] [초=90]
//   class : 1반 30명 (보물 상자)
//   grade : 6학년 250명 동시 — 9반 × 28명, 게임 섞어서 (골든벨·퀴즈부자·낚시·보스전·줄다리기·무궁화·윷놀이·땅따먹기·카트)
// 결과: 서버 CPU(한 코어 대비 %), 메모리, 응답 지연(p50/p95), 서버가 보낸 데이터(KB/s) → Render 무료(0.1 CPU) 견적
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { io } from 'socket.io-client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [scenario = 'grade', secs = '90'] = process.argv.slice(2);
const DURATION = +secs * 1000;
const PORT = 3990 + Math.floor(Math.random() * 9);
const URL = `http://localhost:${PORT}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

const PLAN = scenario.startsWith('mode:') ? [[scenario.slice(5), 28]] : scenario === 'class' ? [['chest', 30]]
  : [['live', 28], ['shop', 28], ['fishing', 28], ['raid', 28], ['tug', 28], ['mugunghwa', 28], ['yut', 28], ['territory', 28], ['race', 28]];
const QS = Array.from({ length: 20 }, (_, i) => ({ q: `문제 ${i + 1}: 지층에 대한 설명으로 알맞은 것은 무엇일까요?`, answers: [`정답${i}`], wrong: [`오답${i}a`, `오답${i}b`, `오답${i}c`], explain: '해설 한 줄' }));

const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), LOADTEST: '1' }, stdio: 'ignore' });
process.on('exit', () => srv.kill());
for (let i = 0; i < 50; i++) { try { await fetch(URL + '/api/info'); break; } catch { await sleep(200); } }

const lat = [];
const timed = async (s, ev, d) => { const t = performance.now(); try { const r = await s.timeout(8000).emitWithAck(ev, d); lat.push(performance.now() - t); return r; } catch { lat.push(8000); return null; } };
const conn = () => new Promise(r => { const s = io(URL, { transports: ['websocket'], forceNew: true, reconnection: false }); s.on('connect', () => r(s)); });
let running = true, answers = 0;

async function classroom(mode, n, k) {
  const t = await conn();
  const c = await timed(t, 't:create', { title: `${k + 1}반`, mode, settings: { time: 20, minutes: 15, teams: 4, seconds: 90, rounds: 3, laps: 3 }, questions: QS });
  if (!c?.code) { console.log('방 만들기 실패', mode, c); return; }
  await timed(t, 't:teams', { count: 4 });
  const kids = [];
  for (let i = 0; i < n; i++) {
    const s = await conn();
    const j = await timed(s, 's:join', { code: c.code, name: `${i + 1}번`, device: i % 3 ? 'pc' : 'touch', avatar: { char: 'cat', color: '#3D8BFF' } });
    kids.push({ s, pid: j?.pid });
    await sleep(15);
  }
  await timed(t, 't:start', {});
  const correct = qid => QS[qid] ? QS[qid].answers[0] : '';
  const pick = v => (Math.random() < 0.7 ? correct(v.qid) : (v.choices ? v.choices.find(x => x !== correct(v.qid)) : '몰라'));
  // 학생: 문제를 받으면 4~12초 생각하고 답
  for (const kid of kids) {
    const { s } = kid;
    s.on('q', async v => { await sleep(rnd(4000, 12000)); if (!running) return; await timed(s, 's:answer', { qid: v.qid, given: pick(v) }); answers++; });
    s.on('m', ({ type, data }) => {
      if (mode === 'chest' && type === 'pick') timed(s, 's:mode', { type: 'pick', data: { i: 0 } });
      if (mode === 'fishing' && type === 'catch') timed(s, 's:mode', { type: 'reel', data: { quality: 'good' } });
    });
    if (mode !== 'live' && mode !== 'race') (async () => {
      await sleep(rnd(500, 4000));
      while (running) {
        const r = await timed(s, 's:ask', {});
        if (r?.error) await sleep(1500);
        await sleep(rnd(4000, 12000));
        if (mode === 'tug') timed(s, 's:mode', { type: 'pull', data: {} });
        if (mode === 'yut') { timed(s, 's:mode', { type: 'throw', data: {} }); timed(s, 's:mode', { type: 'move', data: { piece: 0, route: 'long' } }); }
        if (mode === 'fishing') { timed(s, 's:mode', { type: 'cast', data: {} }); timed(s, 's:mode', { type: 'reel', data: { quality: 'good' } }); }
        if (mode === 'territory') timed(s, 's:mode', { type: 'claim', data: { i: Math.floor(Math.random() * 117) } });
      }
    })();
    if (mode === 'race') (async () => { // 카트: 10Hz 위치
      let x = 0; await sleep(4500);
      while (running) { x += 1; s.emit('s:mode', { type: 'st', data: { x: x % 300, z: (x * 7) % 300, h: 1, s: 20, rp: (x % 800) / 800, fx: 0 } }); await sleep(100); }
    })();
  }
  if (mode === 'live') (async () => { // 선생님이 문제를 넘김
    while (running) { await timed(t, 't:mode', { type: 'ask', data: {} }); await sleep(18000); await timed(t, 't:mode', { type: 'reveal', data: {} }); await sleep(4000); }
  })();
  return { t, kids };
}

const stat = async () => (await (await fetch(URL + '/api/stats')).json());
console.log(`시나리오 ${scenario}: ${PLAN.map(([m, n]) => `${m}×${n}`).join(', ')} / ${secs}초`);
const t0 = Date.now();
const rooms = [];
for (const [k, [mode, n]] of PLAN.entries()) rooms.push(await classroom(mode, n, k));
const joinMs = Date.now() - t0;
const s0 = await stat(), w0 = Date.now(); lat.length = 0; answers = 0;
let peakMem = s0.mem;
for (let left = DURATION; left > 0; left -= 5000) { await sleep(Math.min(5000, left)); const s = await stat(); peakMem = Math.max(peakMem, s.mem); }
const s1 = await stat(), w1 = Date.now();
running = false;
const cpuMs = (s1.cpu.user + s1.cpu.system - s0.cpu.user - s0.cpu.system) / 1000, wall = w1 - w0;
lat.sort((a, b) => a - b);
const q = p => lat.length ? lat[Math.min(lat.length - 1, Math.floor(lat.length * p))].toFixed(0) : '-';
const out = {
  students: PLAN.reduce((a, [, n]) => a + n, 0), rooms: PLAN.length, sockets: s1.sockets, joinSeconds: (joinMs / 1000).toFixed(1),
  cpuPercentOfOneCore: (cpuMs / wall * 100).toFixed(1), peakMemMB: (peakMem / 1048576).toFixed(0),
  ackP50ms: q(.5), ackP95ms: q(.95), ackP99ms: q(.99), answersPerMin: (answers / (wall / 60000)).toFixed(0),
  serverSentKBps: ((s1.sent - s0.sent) / 1024 / (wall / 1000)).toFixed(1), wireKBps: ((s1.wire - s0.wire) / 1024 / (wall / 1000)).toFixed(1), serverRecvKBps: ((s1.recv - s0.recv) / 1024 / (wall / 1000)).toFixed(1),
};
out.sentMBperHour = (out.serverSentKBps * 3600 / 1024).toFixed(0); out.wireMBperHour = (out.wireKBps * 3600 / 1024).toFixed(0);
console.log(JSON.stringify(out, null, 2));
const top = Object.entries(s1.types || {}).map(([k, v]) => [k, v - ((s0.types || {})[k] || 0)]).sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('보낸 데이터 상위 (KB/s):', top.map(([k, v]) => `${k} ${(v / 1024 / (wall / 1000)).toFixed(1)}`).join(' | '));
for (const r of rooms) { r?.t.close(); r?.kids.forEach(k => k.s.close()); }
srv.kill(); process.exit(0);
