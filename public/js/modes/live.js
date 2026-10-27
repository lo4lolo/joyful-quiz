// 골든벨 라이브: 선생님 화면(TV)에 문제, 학생은 자기 기기에서 답
import { $, $$, esc, h, avatarHTML, pct, confetti } from '../common.js';

const SHAPES = ['▲', '◆', '●', '■'];
let cssDone = false;
function css() {
  if (cssDone) return; cssDone = true;
  document.head.append(h(`<link rel="stylesheet" href="css/live.css">`));
}

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  el.innerHTML = `<div class="live-s"><div class="hud"><span class="pill" id="ls-score">⭐ 0</span><span class="pill" id="ls-streak" hidden></span><span class="grow"></span><span class="pill" id="ls-life" hidden></span></div>
    <div class="live-main" id="ls-main"></div></div>`;
  const main = $('#ls-main', el);
  let score = 0, alive = true, survival = false, cur = null, quizLayer = null, deadline = 0, view = null;
  const wait = (big, text, cls = '') => { main.innerHTML = `<div class="live-wait ${cls}"><div class="big">${big}</div><div>${text}</div></div>`; };
  const setScore = (s, streak) => {
    score = s; $('#ls-score', el).textContent = `⭐ ${score.toLocaleString()}`;
    const st = $('#ls-streak', el); st.hidden = !(streak >= 2); st.textContent = `🔥 ${streak}연속`;
  };
  const setLife = () => { const l = $('#ls-life', el); l.hidden = !survival; l.textContent = alive ? '💖 살아 있어요' : '👻 탈락 (연습 중)'; };
  wait('🔔', '곧 시작해요! 선생님 화면을 봐요');

  function ask(v) {
    view = v; deadline = Date.now() + v.time * 1000;
    main.innerHTML = '';
    open();
  }
  function open() {
    const left = Math.max(1, (deadline - Date.now()) / 1000);
    const v = { ...view, time: left };
    quizLayer?.closeQuiz?.();
    let mine = null;
    ctx.showQuiz(v, {
      inline: true, container: main, label: `❓ ${cur ? cur.index + 1 + '번 문제' : '문제'}${survival && !alive ? ' · 연습' : ''}`, revealInline: true,
      onOpen: l => { quizLayer = mine = l; },
      onAnswer: g => ctx.answer(view.qid, g),
    }).then(res => {
      if (quizLayer === mine) quizLayer = null;
      if (res === null) return; // 시간 연장으로 다시 열림
      wait('📨', '답을 냈어요! 다른 친구들을 기다려요', 'sent');
    });
  }
  const offs = [
    ctx.onQuestion(ask),
    ctx.on('phase', d => {
      cur = d;
      if (d.style) survival = d.style === 'survival';
      setLife();
      if (d.phase === 'ready') wait('🔔', `곧 시작해요! 문제 ${d.total}개`);
      if (d.phase === 'board') { quizLayer?.closeQuiz?.(); }
      // 문제는 'phase'보다 먼저 오므로 번호를 여기서 고친다
      if (d.phase === 'question') { const lb = quizLayer && $('.qtop span', quizLayer); if (lb) lb.textContent = `❓ ${d.index + 1}번 문제${survival && !alive ? ' · 연습' : ''}`; }
    }),
    ctx.on('deadline', d => { if (view && quizLayer) { deadline += 10000; open(); ctx.toast('⏱ 10초 더!'); } }),
    ctx.on('result', r => {
      quizLayer?.closeQuiz?.(); quizLayer = null;
      alive = r.alive; setLife(); setScore(r.score, r.streak);
      ctx.sound.play(r.ok ? 'correct' : 'wrong');
      main.innerHTML = `<div class="live-res ${r.ok ? 'ok' : 'no'}">
        <div class="big">${r.ok ? '⭕' : r.answered ? '❌' : '⌛'}</div>
        <div class="t">${r.ok ? '정답!' : r.answered ? '아쉬워요' : '시간이 끝났어요'}</div>
        ${r.ok ? `<div class="gain">+${r.gained.toLocaleString()}</div>` : `<div class="ans">정답: ${esc(r.correct)}</div>`}
        ${r.explain ? `<div class="ex">💡 ${esc(r.explain)}</div>` : ''}
        ${r.out ? '<div class="out">👻 탈락! 패자부활을 기다리며 계속 풀어 봐요</div>' : ''}
        <div class="rk">지금 <b>${r.rank}</b>등 / ${r.total}명</div></div>`;
    }),
    ctx.on('revive', () => { alive = true; setLife(); ctx.toast('💖 패자부활! 다시 도전해요'); ctx.sound.play('win'); }),
  ];
  // 다시 접속
  const s = ctx.snapshot;
  if (s) {
    if (s.score != null) setScore(s.score, 0);
    if (s.alive != null) alive = s.alive;
    if (s.last) { cur = s.last; survival = ctx.room.settings.style === 'survival'; setLife(); }
    if (s.answered) wait('📨', '답을 냈어요! 기다려요', 'sent');
  } else survival = ctx.room.settings.style === 'survival';
  setLife();
  return () => { offs.forEach(f => f()); quizLayer?.closeQuiz?.(); };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  const survival = ctx.room.settings.style === 'survival';
  el.innerHTML = `<div class="live-t"><div class="lt-main" id="lt-main"></div><div class="lt-ctrl" id="lt-ctrl"></div></div>`;
  const main = $('#lt-main', el), ctrl = $('#lt-ctrl', el);
  let cur = null, timer = 0, answered = 0, lastTick = 0, localDeadline = 0;
  const online = () => ctx.room.players.filter(p => p.online).length;
  const send = t => ctx.send(t, {});
  const btns = list => { ctrl.innerHTML = list.map(([id, label, cls]) => `<button class="btn ${cls} big" data-id="${id}">${label}</button>`).join('');
    $$('button', ctrl).forEach(b => b.onclick = () => { ctx.sound.unlock(); send(b.dataset.id); }); };

  function render(d) {
    cur = d; clearInterval(timer);
    if (d.phase === 'ready') {
      ctx.music.stop();
      main.innerHTML = `<div class="lt-ready"><div class="em">🔔</div><h1>${survival ? '골든벨 생존전' : '골든벨 라이브'}</h1>
        <p>문제 <b>${d.total}</b>개 · 학생 <b>${online()}</b>명</p>
        <p class="sub">${survival ? '틀리면 탈락! 마지막까지 살아남아요' : '빨리 맞힐수록 점수가 커요. 연속 정답 보너스!'}</p></div>`;
      btns([['ask', '첫 문제 시작 ▶', 'y huge']]);
    } else if (d.phase === 'question') {
      answered = 0; localDeadline = Date.now() + (d.deadline - Date.now());
      const v = d.view, ox = v.kind === 'ox';
      main.innerHTML = `<div class="lt-q"><div class="lt-top"><span class="pill">${d.index + 1} / ${d.total}</span>
        ${survival ? `<span class="pill">💖 ${d.alive}명 생존</span>` : ''}<span class="grow"></span><span class="pill" id="lt-ans">📨 0 / ${online()}</span></div>
        <div class="lt-timer" id="lt-timer"></div>
        <div class="lt-text">${esc(v.q)}</div>
        ${v.choices ? `<div class="lt-choices ${ox ? 'ox' : ''}">${v.choices.map((c, i) => `<div class="lt-c k${ox ? (c === 'O' ? 3 : 0) : i}"><span>${ox ? '' : SHAPES[i]}</span>${ox ? (c === 'O' ? '⭕' : '❌') : esc(c)}</div>`).join('')}</div>`
          : '<div class="lt-short">✍️ 단답형 — 답을 써서 내요</div>'}</div>`;
      btns([['reveal', '정답 공개 ⏭', 'p'], ['time', '⏱ +10초', 'ghost']]);
      ctx.music.start(160);
      const tick = () => {
        const left = Math.max(0, Math.ceil((cur.deadline - Date.now()) / 1000));
        const t = $('#lt-timer', el); if (t) t.textContent = left;
        if (left <= 5 && left > 0 && left !== lastTick) { lastTick = left; ctx.sound.play('tick'); }
      };
      tick(); timer = setInterval(tick, 200);
    } else if (d.phase === 'reveal') {
      ctx.music.stop(); ctx.sound.play('open');
      const view = cur?.view && cur.index === d.index ? cur.view : lastQ;
      const total = Object.values(d.counts).reduce((a, b) => a + b, 0) || 1;
      const ox = view?.kind === 'ox';
      const choices = view?.choices || Object.keys(d.counts);
      main.innerHTML = `<div class="lt-q"><div class="lt-top"><span class="pill">${d.index + 1} / ${d.total}</span><span class="pill">✅ 정답률 ${pct(d.okN, d.answered)}% (${d.okN}/${d.answered})</span>
        ${survival ? `<span class="pill">💖 ${d.alive}명 생존</span>` : ''}</div>
        <div class="lt-text small">${esc(view?.q || '')}</div>
        <div class="lt-bars">${choices.map((c, i) => { const n = d.counts[c] || 0, right = c === d.correct; return `<div class="lt-bar ${right ? 'right' : ''}">
          <div class="lab k${ox ? (c === 'O' ? 3 : 0) : i % 4}">${ox ? (c === 'O' ? '⭕' : '❌') : (view?.choices ? SHAPES[i] + ' ' : '') + esc(c)}${right ? ' ✔' : ''}</div>
          <div class="track"><i style="width:${(n / total) * 100}%"></i></div><b>${n}</b></div>`; }).join('')}</div>
        <div class="lt-correct">정답: <b>${esc(d.correct)}</b></div>
        ${d.explain ? `<div class="lt-ex">💡 ${esc(d.explain)}</div>` : ''}
        ${d.outNames?.length ? `<div class="lt-out">👻 탈락: ${d.outNames.map(esc).join(', ')}</div>` : ''}${d.allOut ? '<div class="lt-out">😮 모두 틀려서 모두 살아남았어요!</div>' : ''}</div>`;
      const last = d.index + 1 >= d.total;
      btns([['board', '🏆 순위 보기', 'v'], ['ask', last ? '결과 보기 🏁' : '다음 문제 ▶', 'y'], ...(survival ? [['revive', '💖 패자부활', 'p']] : [])]);
    } else if (d.phase === 'board') {
      ctx.sound.play('win');
      const max = Math.max(1, ...d.top.map(r => r.score));
      const ava = pid => ctx.room.players.find(p => p.pid === pid)?.avatar;
      main.innerHTML = `<div class="lt-board"><h1>🏆 지금 순위</h1>${d.top.map((r, i) => `<div class="lt-brow" style="animation-delay:${i * 60}ms">
        <span class="rk">${r.rank}</span>${avatarHTML(ava(r.pid), 'sm')}<span class="nm">${esc(r.name)}${survival && !r.extra.alive ? ' 👻' : ''}</span>
        <div class="track"><i style="width:${(r.score / max) * 100}%"></i></div><b>${r.score.toLocaleString()}</b></div>`).join('')}</div>`;
      const last = d.index + 1 >= d.total;
      btns([['ask', last ? '결과 보기 🏁' : '다음 문제 ▶', 'y'], ...(survival ? [['revive', '💖 패자부활', 'p']] : [])]);
    }
    if (d.phase === 'question') lastQ = d.view;
  }
  let lastQ = null;
  const offs = [
    ctx.on('phase', render),
    ctx.on('count', c => { answered = c.answered; const a = $('#lt-ans', el); if (a) a.textContent = `📨 ${c.answered} / ${c.total}`; }),
    ctx.on('deadline', d => { if (cur) cur.deadline = d.deadline; }),
    ctx.on('revive', () => ctx.toast('💖 모두 다시 살아났어요!')),
  ];
  if (ctx.snapshot?.last) render(ctx.snapshot.last);
  else main.innerHTML = '<div class="lt-ready"><div class="em">🔔</div><h1>준비 중…</h1></div>';
  return () => { offs.forEach(f => f()); clearInterval(timer); ctx.music.stop(); };
}
