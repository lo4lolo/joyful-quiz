// 수업 연습용 가짜 학생: node tools/bots.mjs <방번호> [인원=8] [주소=http://localhost:3030]
// 문제를 70% 확률로 "아무 보기"나 고르며 끝까지 참여한다. 실제 수업 서버에는 쓰지 마세요.
import { io } from 'socket.io-client';

const [code, n = 8, url = 'http://localhost:3030'] = process.argv.slice(2);
if (!code) { console.log('사용법: node tools/bots.mjs <방번호> [인원] [주소]'); process.exit(1); }
const FACES = ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐯', '🐸', '🐧', '🦄'];
const NAMES = ['김하늘', '이바다', '박나무', '최구름', '정별', '강산', '조이슬', '윤솔', '장해', '임달', '한결', '오름'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

for (let i = 0; i < +n; i++) {
  const s = io(url, { transports: ['websocket'] });
  const name = `${i + 1} ${NAMES[i % NAMES.length]}`;
  let mode = null, busy = false;
  const answer = async v => {
    await sleep(800 + Math.random() * 3000);
    const given = v.choices ? v.choices[Math.floor(Math.random() * v.choices.length)] : ['지층', '퇴적암', '모름'][i % 3];
    const r = await s.emitWithAck('s:answer', { qid: v.qid, given });
    if (mode === 'chest' && r?.ok) {
      await sleep(600);
      const p = await s.emitWithAck('s:mode', { type: 'pick', data: { i: Math.floor(Math.random() * 3) } });
      if (p?.target?.length) await s.emitWithAck('s:mode', { type: 'target', data: { pid: p.target[Math.floor(Math.random() * p.target.length)].pid } });
    }
    if (mode === 'territory' && r?.ok) {
      for (let k = 0; k < 117; k++) { const t = await s.emitWithAck('s:mode', { type: 'claim', data: { i: Math.floor(Math.random() * 117) } }); if (t?.ok) break; }
    }
    return r;
  };
  async function selfLoop() {
    if (busy) return; busy = true;
    while (mode && mode !== 'live' && mode !== 'race') {
      const qP = new Promise(r => s.once('q', r));
      const a = await s.emitWithAck('s:ask', {});
      if (a?.error) { await sleep(1500); continue; }
      await answer(await qP);
    }
    busy = false;
  }
  s.on('q', v => { if (mode === 'live') answer(v); });
  s.on('room', r => { mode = r.state === 'play' ? r.mode : null; if (mode) selfLoop(); });
  s.on('end', () => { mode = null; });
  s.on('connect', async () => {
    const r = await s.emitWithAck('s:join', { code, name, device: i % 3 === 0 ? 'touch' : 'pc',
      avatar: { char: ['cat','dog','bunny','bear','panda','fox','frog','penguin','tiger','unicorn'][i % 10], face: FACES[i % FACES.length], color: ['#ff5fa2', '#3fc3f0', '#ffd32a', '#2ed573', '#a55eea'][i % 5], hat: i % 4 } });
    console.log(name, r.ok ? '입장' : r.error);
  });
}
