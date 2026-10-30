import { $, esc, store, showQuiz, sound, toast } from './common.js';
import { SAMPLE_ROWS } from './sample.js';
import { TRACKS, buildTrack } from './race/tracks.js';
import { mountStudent } from './modes/race.js';
import { newLearning, nextQuestion, recordAnswer, learningSummary, reviewCards } from './learning.js';
import { renderReview } from './review.js';

const sets = [{ title: '예시 · 지층과 화석', rows: SAMPLE_ROWS }, ...store.get('jq_sets2', [])];
$('#practice-set').innerHTML = sets.map((s, i) => `<option value="${i}">${esc(s.title || '제목 없는 세트')}</option>`).join('');
$('#practice-track').innerHTML = TRACKS.map((t, i) => `<option value="${i}">${t.emoji} ${t.name}</option>`).join('');
$('#practice-device').value = matchMedia('(pointer:coarse)').matches ? 'touch' : 'pc';
let cleanup, tick, endTimer, running = false, learning, questions, startedAt;
const norm = s => String(s).normalize('NFC').toLowerCase().replace(/[\s.,!?~'"`·()[\]{}]/g, '');
const mix = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
$('#practice-start').onclick = () => {
  if (running) return;
  const set = sets[+$('#practice-set').value];
  questions = set.rows.filter(r => String(r.q || '').trim() && String(r.a || '').trim()).slice(0, 300).map((r, i) => ({ qid: i,
    q: r.q, answers: r.a.split('/').map(s => s.trim()).filter(Boolean), wrong: [r.w1, r.w2, r.w3].filter(Boolean), explain: r.ex || '' }));
  if (!questions.length) return toast('문제와 정답이 있는 세트를 골라 주세요.');
  sound.unlock(); running = true; learning = newLearning(); startedAt = performance.now();
  $('#setup').hidden = true; $('#practice-result').hidden = true; $('#practice-game').hidden = false; $('#practice-stop').hidden = false;
  const track = +$('#practice-track').value, tr = buildTrack(track), goAt = performance.now() + 4500;
  const me = { pid: 'practice-me', name: '연습하는 나', device: $('#practice-device').value, avatar: { color: '#ff6f91', face: '🐰' } };
  const listeners = new Map(), emit = (type, d) => listeners.get(type)?.forEach(fn => fn(d));
  let stamps = 0, correct = 0, held = null, lastQi = -1, busy = false, finished = false;
  const bots = Array.from({ length: 3 }, (_, i) => ({ k: i + 1, pid: `practice-${i}`, name: ['연습 친구 구름', '연습 친구 별', '연습 친구 바람'][i], avatar: { color: ['#3d8bff', '#2ed3a0', '#ffe14d'][i], face: '🐻' } }));
  const snapshot = { track, laps: 1, gates: 3, stamps: 3, items: true, boxes: false, ghosts: true,
    driving: $('#practice-assist').checked ? 'assist' : 'manual', goIn: 4500, roster: [[me.pid, 0], ...bots.map(b => [b.pid, b.k])], karts: [], bananas: [], finished: [] };
  const ctx = {
    me, room: { code: '연습', players: [me, ...bots], settings: snapshot }, snapshot,
    on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type)?.delete(fn); },
    onRoom() { return () => {}; }, socket: { emit() {} },
    async send(type, data) {
      if (type === 'sync') return snapshot;
      if (type === 'item') {
        if (held !== data.kind) return { error: 'noitem' };
        held = null; return { ok: true };
      }
      if (type === 'finish') {
        if (data.lap < 1) return { error: 'laps' };
        if (stamps < 3) return { error: 'stamps', need: 3 - stamps };
        if (!finished) { finished = true; endTimer = setTimeout(() => finish(true), 1500); }
        return { ok: true, rank: 1, time: performance.now() - goAt };
      }
      return { ok: true };
    },
    async quiz(opts) {
      if (!running || busy || finished || performance.now() < goAt) return null;
      busy = true;
      const qi = nextQuestion(learning, questions.map(q => q.qid), lastQi); lastQi = qi;
      const Q = questions[qi], ox = !Q.wrong.length && /^(o|x|○|×)$/i.test(Q.answers[0]);
      const correctAnswer = ox ? (/^(o|○)$/i.test(Q.answers[0]) ? 'O' : 'X') : Q.answers[0];
      const wrong = [...new Set(Q.wrong)].filter(w => !Q.answers.some(a => norm(a) === norm(w)));
      const choices = ox ? ['O','X'] : wrong.length ? mix([correctAnswer, ...wrong]) : null;
      const result = await showQuiz({ qid: qi, q: Q.q, kind: ox ? 'ox' : choices ? 'mc' : 'short', choices, time: 30,
        review: !!learning.items[qi]?.misses && !learning.items[qi].lastOk }, { ...opts, readToContinue: true, onAnswer: async given => {
        if (!running) return { error: 'ended' };
        const ok = ox ? norm(given) === norm(correctAnswer) : Q.answers.some(a => norm(a) === norm(given));
        recordAnswer(learning, qi, ok, given); stamps++; if (ok) correct++;
        const item = ok && !held ? (held = ['boost', 'shield', 'star'][Math.floor(Math.random() * 3)]) : null;
        emit('reward', { ok, stamps, correct, item, full: ok && !item, boost: ok ? 1 : 0, penalty: ok ? null : { kind: 'slow', ms: 1000 } });
        return { ok, correct: correctAnswer, explain: Q.explain, learning: learningSummary(learning, questions.length) };
      } });
      busy = false; return result;
    }
  };
  cleanup = mountStudent($('#practice-game'), ctx);
  tick = setInterval(() => {
    if (!running) return;
    const time = Math.max(0, performance.now() - goAt) / 1000;
    const values = bots.flatMap((b, i) => {
      const rp = tr.grid(b.k).rp + time * (12 + i * 1.5) / tr.length, p = tr.pointAt(rp, (i - 1) * 2.5);
      return [b.k, Math.round(p.x * 10), Math.round(p.z * 10), Math.round(p.h * 100), 150, Math.round(rp * 1000), 0];
    });
    emit('snap', values);
  }, 140);
};
function finish(complete = false) {
  if (!running) return;
  running = false; clearInterval(tick); clearTimeout(endTimer);
  document.querySelectorAll('.quiz-layer').forEach(el => el.closeQuiz?.());
  cleanup?.(); cleanup = null; $('#practice-game').innerHTML = ''; $('#practice-game').className = '';
  $('#practice-game').hidden = true; $('#practice-stop').hidden = true; $('#practice-result').hidden = false;
  $('#practice-title').textContent = complete ? '🏁 첫 바퀴, 완주 성공!' : '🌱 연습한 만큼 자랐어요!';
  const s = learningSummary(learning, questions.length);
  $('#practice-score').textContent = `정답 ${s.correct}/${s.attempts}회 · 연습 ${Math.round((performance.now() - startedAt) / 1000)}초`;
  renderReview($('#practice-review'), { summary: s, cards: reviewCards(learning, questions) });
  $('#practice-review .learning-note:last-child').textContent = '이 연습 기록은 서버로 보내지 않아요. 새 연습을 시작하거나 탭을 닫으면 사라져요.';
}
$('#practice-stop').onclick = () => finish();
$('#practice-again').onclick = () => { $('#practice-result').hidden = true; $('#practice-review').innerHTML = ''; $('#setup').hidden = false; };
window.addEventListener('pagehide', () => { running = false; clearInterval(tick); clearTimeout(endTimer); cleanup?.(); });
