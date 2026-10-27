// 뿅망치 대결: 문제마다 둘씩 짝지어 1대1. 선생님 화면(TV)에 대결 카드, 학생은 자기 기기에서 답.
import { $, $$, esc, h, avatarHTML, confetti } from '../common.js';
import { fx } from '../fx.js';

const SHAPES = ['▲', '◆', '●', '■'];
const asset = p => new URL('../../' + p, import.meta.url).href;
let cssDone = false;
function css() {
  if (cssDone || document.querySelector('link[data-royale]')) { cssDone = true; return; }
  cssDone = true;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = asset('css/royale.css'); l.dataset.royale = '1';
  document.head.append(l);
}

// ---------- 그림 (없으면 이모지) ----------
const ICON = { hammer: '🔨', heart: '❤️' };
const have = {};
for (const k of Object.keys(ICON)) {
  const im = new Image();
  im.addEventListener('load', () => { have[k] = true; });
  im.addEventListener('error', () => { have[k] = false; });
  im.src = asset(`assets/icons/${k}.webp`);
}
const ico = (k, cls = '') => have[k]
  ? `<img class="ry-ico ${cls}" src="${asset(`assets/icons/${k}.webp`)}" alt="" data-fb="${ICON[k]}">`
  : `<span class="ry-ico ${cls}" aria-hidden="true">${ICON[k]}</span>`;
// 그림이 중간에 깨지면 이모지로 (CSP 때문에 onerror 대신 여기서)
document.addEventListener('error', e => {
  const t = e.target;
  if (t?.tagName === 'IMG' && t.classList?.contains('ry-ico') && t.dataset.fb) {
    const s = document.createElement('span'); s.className = t.className; s.textContent = t.dataset.fb; t.replaceWith(s);
  }
}, true);
function heroArt() {
  const wrap = h(`<div class="ry-hero"><img src="${asset('assets/modes/royale.webp')}" alt=""></div>`);
  $('img', wrap).addEventListener('error', () => { wrap.innerHTML = `<div class="ry-hero-fb"><span>⚔️</span>${ico('hammer', 'swing')}</div>`; });
  return wrap;
}
const hearts = (n, max, lost = false) => {
  let s = '';
  for (let i = 0; i < max; i++) s += ico('heart', i < n ? 'ry-hp' : `ry-hp off${lost && i === n ? ' broke' : ''}`);
  return `<span class="ry-hearts" aria-label="하트 ${n}개">${s}</span>`;
};
const ansText = c => (c === 'O' ? '⭕' : c === 'X' ? '❌' : c);
const sec = ms => (ms == null ? '' : (ms / 1000).toFixed(1) + '초');
const mark = r => (r.ok ? `⭕ ${sec(r.ms)}` : r.answered ? '❌' : '⌛');

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  el.innerHTML = `<div class="ry-s"><div class="hud"><span class="pill" id="ry-hp"></span><span class="pill" id="ry-wins">🔨 0승</span>
    <span class="grow"></span><span class="pill" id="ry-score">⭐ 0</span></div>
    <div class="ry-col"><div id="ry-band"></div><div id="ry-main"></div></div></div>`;
  const main = $('#ry-main', el), band = $('#ry-band', el);
  let info = null, view = null, quizLayer = null, deadline = 0, sent = false, lastRes = null, phaseNow = 'ready';
  const max = () => info?.max || ctx.room.settings.hearts || 3;
  const me = () => ctx.room.players.find(p => p.pid === ctx.me.pid) || ctx.me;
  const hud = () => {
    if (!info) { $('#ry-hp', el).innerHTML = hearts(max(), max()); return; }
    $('#ry-hp', el).innerHTML = info.alive ? hearts(info.hearts, max()) : '👻 응원석';
    $('#ry-wins', el).textContent = `🔨 ${info.wins || 0}승`;
    $('#ry-score', el).textContent = `⭐ ${(info.score || 0).toLocaleString()}`;
  };
  const wait = (big, text, cls = '') => { main.innerHTML = `<div class="ry-card sticker ${cls}"><div class="big">${big}</div><div class="t">${text}</div></div>`; };

  function renderBand() {
    if (!info) { band.innerHTML = ''; return; }
    const r = info.role, o = info.opp;
    const oOn = o && (ctx.room.players.find(p => p.pid === o.pid)?.online ?? o.online);
    const side = (who, name, hp, alive, extra = '') => `<div class="ry-bside">${avatarHTML(who?.avatar, '')}<div><b>${esc(name)}</b>${alive ? hearts(hp, max()) : '<span class="ry-ghosttag">👻 유령</span>'}${extra}</div></div>`;
    const no = info.index != null ? `<span class="ry-qno">${info.index + 1}/${info.total}</span>` : '';
    if (r === 'duel' || r === 'vsGhost' || r === 'ghost') {
      band.innerHTML = `<div class="ry-band sticker ${r}">${no}${side(me(), '나', info.hearts, info.alive)}
        <div class="ry-vs">${ico('hammer')}<span>VS</span></div>
        ${side(o, o?.name || '?', o?.hearts, r !== 'vsGhost', oOn === false ? '<small class="ry-off">접속 끊김</small>' : '')}</div>
        ${r === 'ghost' ? '<p class="ry-note">👻 유령 출동! 나는 잃을 게 없어요. 빨리 맞히면 친구를 뿅!</p>' : r === 'vsGhost' ? '<p class="ry-note">상대는 응원석 유령이에요. 지면 하트 -1!</p>' : ''}`;
    } else if (r === 'bye') {
      band.innerHTML = `<div class="ry-band sticker solo">${no}<div class="ry-solo">🍀 <b>부전승!</b> 이번 판은 상대가 없어요 · 맞히면 +50</div></div>`;
    } else if (r === 'cheer') {
      band.innerHTML = `<div class="ry-band sticker solo cheer">${no}<div class="ry-solo">👻 <b>응원석</b> · 연습하며 친구들을 응원해요${info.late ? '<small>게임 중에 들어왔어요. 선생님이 💖 모두 부활을 누르면 함께해요</small>' : ''}</div></div>`;
    } else if (r === 'wait') {
      band.innerHTML = `<div class="ry-band sticker solo">${no}<div class="ry-solo">💖 <b>다음 문제부터 대결해요!</b>${phaseNow === 'question' ? ' 이번 문제는 연습' : ''}</div></div>`;
    } else band.innerHTML = '';
  }

  function ask(v) {
    view = v; sent = false; deadline = Date.now() + v.time * 1000;
    main.innerHTML = '';
    open();
  }
  function open() {
    const left = Math.max(1, (deadline - Date.now()) / 1000);
    quizLayer?.closeQuiz?.();
    let mine = null;
    const label = `❓ ${info?.index != null ? info.index + 1 + '번 문제' : '문제'}${info && !info.alive ? ' · 연습' : ''}`;
    ctx.showQuiz({ ...view, time: left }, {
      inline: true, container: main, label, revealInline: true,
      onOpen: l => { quizLayer = mine = l; },
      onAnswer: g => { sent = true; return ctx.answer(view.qid, g); },
    }).then(res => {
      if (quizLayer === mine) quizLayer = null; // 시간 연장으로 새로 연 문제 카드는 건드리지 않는다
      if (res === null) return;
      if (phaseNow !== 'question') return;
      if (res?.error) return wait('📨', '답을 냈어요! 결과를 기다려요', 'sent');
      wait(res.ok ? '⭕' : '❌', res.ok ? '맞혔어요! 이제 빠르기 대결… 두근두근' : '아쉬워요… 상대도 틀리길!', `sent ${res.ok ? 'ok' : 'no'}`);
    });
  }

  function showResult(r, animate = true) {
    lastRes = r; quizLayer?.closeQuiz?.(); quizLayer = null;
    band.innerHTML = ''; // 결과 카드에 나·상대 비교가 있으니 위 띠는 치운다
    info = { ...(info || {}), hearts: r.hearts, alive: r.alive, wins: r.wins, score: r.score, max: r.max };
    hud();
    const o = r.opp;
    const T = {
      win: ['승리!', '뿅! 상대를 이겼어요', 'win'], lose: ['패배…', '하트 -1', 'lose'], double: ['둘 다 뿅!', '둘 다 하트 -1', 'lose'],
      bye: ['부전승', r.ok ? '맞혀서 +50' : '하트는 그대로예요', 'bye'], ghostWin: ['유령의 반격!', '뿅! 응원석에서 한 방', 'win'],
      ghostLose: ['아쉬워요', '연습은 계속!', 'cheer'], cheer: [r.ok ? '정답!' : r.answered ? '아쉬워요' : '시간 끝', '응원석 연습', 'cheer'],
      wait: [r.ok ? '정답!' : '아쉬워요', '다음 판부터 대결해요', 'cheer'],
    }[r.outcome] || ['결과', '', 'cheer'];
    const myWin = r.outcome === 'win' || r.outcome === 'ghostWin', oppWin = !!o && (r.outcome === 'lose' || r.outcome === 'ghostLose') && o.ok;
    const vs = o ? `<div class="ry-cmp"><div class="${myWin ? 'w' : ''}"><small>나</small>${mark(r)}</div>
      <div class="${oppWin ? 'w' : ''}"><small>${esc(o.name)}</small>${mark(o)}</div></div>` : '';
    const lines = [], champLine = r.champion && !r.isChampion;
    if (r.saved) lines.push('😮 모두 하트를 잃을 뻔! 하트 1개로 살아남았어요');
    if (r.out) lines.push('👻 하트가 모두 없어졌어요. 응원석에서 계속 풀며 응원해요!');
    if (r.kos) lines.push(`🔨 ${esc(o?.name || '상대')}를 응원석으로! +200`);
        main.innerHTML = `<div class="ry-card sticker res ${T[2]} ${r.isChampion ? 'champ' : ''}">
      <div class="ry-me">${avatarHTML(me().avatar, 'lg')}${r.heartLost ? `<span class="ry-bonk">${ico('hammer', 'hit')}<b>뿅!</b></span>` : ''}</div>
      <div class="ry-big">${r.isChampion ? '🏆 챔피언!' : T[0]}</div><div class="t">${T[1]}</div>
      ${r.gained ? `<div class="ry-gain">+${r.gained.toLocaleString()}</div>` : ''}
      ${r.alive ? `<div class="ry-hpbig">${hearts(r.hearts, r.max, r.heartLost)}</div>` : ''}
      ${vs}${champLine ? `<div class="ry-line champ">🏆 챔피언: <b>${esc(r.champion.name)}</b>!</div>` : ''}${lines.map(l => `<div class="ry-line">${l}</div>`).join('')}
      <div class="ry-ans">정답: <b>${esc(ansText(r.correct))}</b></div>${r.explain ? `<div class="ry-ex">💡 ${esc(r.explain)}</div>` : ''}
      <div class="ry-rk">지금 <b>${r.rank}</b>등 / ${r.players}명 · 💖 생존 ${r.aliveN}명</div></div>`;
    if (!animate) return;
    const card = $('.ry-card', main);
    if (r.isChampion) { fx.heavy('챔피언!', '#E3B800'); confetti(120); ctx.sound.play('win'); }
    else if (r.outcome === 'win' || r.outcome === 'ghostWin') {
      if (r.kos) fx.heavy('뿅!', '#FF6F61'); else fx.stamp('승리!', '#14A57A');
      fx.medium(card, r.gained ? `+${r.gained}` : '', '#14A57A');
    } else if (r.heartLost) { fx.shake(card); ctx.sound.play(r.out ? 'lose' : 'hit'); }
    else if (r.ok) fx.medium(card, r.gained ? `+${r.gained}` : '정답!', '#14A57A');
    else fx.shake(card);
  }

  const offs = [
    ctx.onQuestion(ask),
    ctx.on('duel', d => { info = d; renderBand(); hud(); }),
    ctx.on('me', d => {
      const wasOut = info && !info.alive;
      info = { ...(info || {}), ...d }; hud();
      if (phaseNow !== 'question') renderBand();
      if (wasOut && d.alive) { ctx.toast('💖 부활! 하트 1개로 다시 대결해요'); fx.medium($('#ry-hp', el), '💖'); }
    }),
    ctx.on('phase', d => {
      phaseNow = d.phase;
      if (d.phase === 'ready') { info = null; hud(); band.innerHTML = ''; wait('⚔️', `곧 시작해요! 하트 ${d.hearts}개로 시작<br><small>선생님 화면을 봐요</small>`); }
      if (d.phase === 'board') {
        quizLayer?.closeQuiz?.(); quizLayer = null;
        wait('🏆', `선생님 화면을 봐요!${lastRes ? `<br><small>지금 ${lastRes.rank}등 · 💖 생존 ${d.alive.length}명</small>` : ''}`);
      }
      if (d.phase === 'reveal' && d.champion && !lastRes) wait('🏆', `챔피언: ${esc(d.champion.name)}!`);
    }),
    ctx.on('deadline', () => { if (view && quizLayer && !sent) { deadline += 10000; open(); ctx.toast('⏱ 10초 더!'); } }),
    ctx.on('result', r => { phaseNow = 'reveal'; showResult(r); }),
    ctx.onRoom(() => { if (phaseNow === 'question' && info?.opp) renderBand(); }),
  ];
  // 처음 화면 / 다시 접속
  const s = ctx.snapshot;
  hud();
  if (s) {
    if (s.me) { info = s.me; hud(); }
    phaseNow = s.last?.phase || 'ready';
    if (phaseNow === 'question') { renderBand(); if (s.answered) wait('📨', '답을 냈어요! 결과를 기다려요', 'sent'); }
    else if (s.result) showResult(s.result, false);
    else if (phaseNow === 'ready') wait('⚔️', `곧 시작해요! 하트 ${max()}개로 시작<br><small>선생님 화면을 봐요</small>`);
    else wait('⚔️', '다음 문제를 기다려요');
  } else wait('⚔️', `곧 시작해요! 하트 ${max()}개로 시작<br><small>선생님 화면을 봐요</small>`);
  return () => { offs.forEach(f => f()); quizLayer?.closeQuiz?.(); };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  el.innerHTML = `<div class="ry-t"><div class="ry-tmain" id="ry-tmain"></div><div class="ry-ctrl" id="ry-ctrl"></div></div>`;
  const main = $('#ry-tmain', el), ctrl = $('#ry-ctrl', el);
  let cur = null, timer = 0, lastTick = 0, lastQ = null, timers = [];
  const H = () => ctx.room.settings.hearts || 3;
  const online = () => ctx.room.players.filter(p => p.online).length;
  const ava = pid => ctx.room.players.find(p => p.pid === pid)?.avatar;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  const btns = list => {
    ctrl.innerHTML = list.map(([id, label, cls]) => `<button class="btn ${cls}" data-id="${id}">${label}</button>`).join('');
    $$('button', ctrl).forEach(b => b.onclick = async () => {
      ctx.sound.unlock(); b.disabled = true;
      const r = await ctx.send(b.dataset.id, {});
      if (r?.error) ctx.toast(r.error);
      b.disabled = false;
    });
  };
  const nextBtns = d => {
    const fin = d.champion || d.last;
    const list = [];
    if (d.phase !== 'board') list.push(['board', '🏆 순위 보기', 'grape lg']);
    list.push(['ask', fin ? '결과 보기 🏁' : '다음 문제 ▶', 'lemon lg']);
    list.push(['revive', '💖 모두 부활', 'coral lg']);
    btns(list);
  };

  function side(s, d, i) {
    if (!s) return '';
    const win = d.winner === s.pid, lose = s.lost;
    const ghost = d.kind === 'ghost' && s === d.b;
    return `<div class="ry-side ${win ? 'win' : ''} ${lose ? 'lose' : ''} ${s.out ? 'out' : ''} ${ghost ? 'ghost' : ''}">
      <div class="ry-ava">${avatarHTML(ava(s.pid), '')}${lose ? `<span class="ry-bonk" style="--i:${i}">${ico('hammer', 'hit')}<b>뿅!</b></span>` : ''}${win ? '<span class="ry-crown">승!</span>' : ''}</div>
      <div class="ry-nm">${esc(s.name)}</div>
      <div class="ry-mk ${s.ok ? 'ok' : 'no'}">${mark(s)}</div>
      <div class="ry-hrow">${ghost ? '<span class="ry-ghosttag">👻 유령</span>' : s.out ? '<span class="ry-outtag">👻 응원석으로</span>' : hearts(s.hearts, H(), lose)}</div></div>`;
  }
  function duelCard(d, i) {
    if (d.kind === 'bye') return `<div class="ry-duel bye" style="--i:${i}">${side(d.a, d, i)}<div class="ry-mid"><span class="ry-byetag">🍀 부전승</span></div></div>`;
    return `<div class="ry-duel ${d.double ? 'double' : ''} ${d.kind}" style="--i:${i}">${side(d.a, d, i)}
      <div class="ry-mid">${d.double ? '<span class="ry-dbl">둘 다<br>뿅!</span>' : '<span class="ry-vsb">VS</span>'}</div>${side(d.b, d, i)}</div>`;
  }
  // 재미있는 순서: 탈락 → 승부 → 둘 다 뿅 → 부전승
  const order = d => (d.kind === 'bye' ? 4 : (d.a.out || d.b?.out) ? 0 : d.double ? 2 : 1);

  function render(d) {
    cur = d; clearInterval(timer); timers.forEach(clearTimeout); timers = [];
    if (d.phase === 'ready') {
      ctx.music.stop();
      main.innerHTML = `<div class="ry-ready"><h1 class="ry-title">⚔️ 뿅망치 대결</h1>
        <div class="ry-rules">
          <div class="sticker tilt-l"><b>1</b> 문제마다 <span class="hl">짝</span>이 정해져요</div>
          <div class="sticker tilt-r"><b>2</b> 둘 다 맞히면 <span class="hl">빠른 사람</span> 승! <span class="nw">지면 ${ico('heart')} -1</span></div>
          <div class="sticker tilt-l"><b>3</b> 하트가 0이면 👻 응원석 · <span class="nw">마지막 1명이 <span class="hl">챔피언</span></span></div></div>
        <div class="ry-pills"><span class="pill">👧 학생 <b>${online()}</b>명</span><span class="pill">${hearts(H(), H())}</span><span class="pill">❓ 문제 <b>${d.total}</b>개</span></div></div>`;
      main.querySelector('.ry-ready').prepend(heroArt());
      btns([['ask', '시작 ▶', 'lemon xl']]);
    } else if (d.phase === 'question') {
      lastQ = d.view;
      const v = d.view, ox = v.kind === 'ox';
      main.innerHTML = `<div class="ry-q"><div class="ry-top"><span class="pill">${d.index + 1} / ${d.total}</span><span class="pill">💖 생존 ${d.alive}명</span>
        <span class="pill">⚔️ 대결 ${d.duels}판</span><span class="grow"></span><span class="pill big" id="ry-ans">📨 ${d.answered || 0}/${d.need ?? online()} 답함</span></div>
        <div class="ry-timer" id="ry-timer"></div>
        <div class="ry-qtext sticker">${esc(v.q)}</div>
        ${v.choices ? `<div class="ry-choices ${ox ? 'ox' : ''}">${v.choices.map((c, i) => `<div class="ry-c k${ox ? (c === 'O' ? 3 : 0) : i}"><span>${ox ? '' : SHAPES[i]}</span>${ox ? (c === 'O' ? '⭕' : '❌') : esc(c)}</div>`).join('')}</div>`
          : '<div class="ry-short sticker">✍️ 단답형 — 답을 써서 내요</div>'}</div>`;
      btns([['reveal', '정답 공개 ⏭', 'blue lg'], ['time', '⏱ +10초', 'ghost lg']]);
      ctx.music.start(170);
      const tick = () => {
        const left = Math.max(0, Math.ceil((cur.deadline - Date.now()) / 1000));
        const t = $('#ry-timer', el); if (t) { t.textContent = left; t.classList.toggle('hurry', left <= 5); }
        if (left <= 5 && left > 0 && left !== lastTick) { lastTick = left; ctx.sound.play('tick'); }
      };
      tick(); timer = setInterval(tick, 200);
    } else if (d.phase === 'reveal') {
      ctx.music.stop(); ctx.sound.play('open');
      const duels = [...d.duels].sort((a, b) => order(a) - order(b));
      const dense = duels.length > 8 ? 'dense' : '';
      main.innerHTML = `<div class="ry-rev"><div class="ry-top"><span class="pill">${d.index + 1} / ${d.total}</span><span class="pill">✅ 정답 ${d.okN}/${d.answered}</span>
        <span class="pill" id="ry-alive">💖 생존 ${d.alive}명</span><span class="grow"></span></div>
        <div class="ry-answer sticker">정답 <b class="hl">${esc(ansText(d.correct))}</b>${lastQ ? `<small>${esc(lastQ.q)}</small>` : ''}${d.explain ? `<div class="ry-ex">💡 ${esc(d.explain)}</div>` : ''}</div>
        ${d.allOut ? '<div class="ry-banner">😮 모두 하트를 잃을 뻔! 모두 하트 1개로 살아남았어요</div>' : ''}
        <div class="ry-grid ${dense}">${duels.map(duelCard).join('')}</div>
        ${d.outNames?.length ? `<div class="ry-outs">👻 응원석으로: ${d.outNames.map(esc).join(', ')}</div>` : ''}</div>`;
      // 뿅! 소리 (카드가 차례로 나올 때)
      const hits = duels.filter(x => x.a.lost || x.b?.lost).length;
      for (let k = 0; k < Math.min(hits, 6); k++) later(() => ctx.sound.play('hit'), 520 + k * 90);
      if (d.champion) later(() => showChampion(d.champion), 900 + duels.length * 90);
      nextBtns(d); fit(); later(fit, 80); later(fit, 700);
    } else if (d.phase === 'board') {
      ctx.music.stop(); ctx.sound.play('win');
      const max = Math.max(1, ...d.top.map(r => r.score));
      main.innerHTML = `<div class="ry-board"><div class="sticker ry-alive"><h2>💖 살아남은 친구 <b>${d.alive.length}</b>명 <span class="badge">👻 응원석 ${d.ghosts}명</span></h2>
          <div class="ry-alist">${d.alive.map((p, i) => `<div class="ry-arow ${p.online ? '' : 'off'}" style="--i:${i}">${avatarHTML(ava(p.pid), 'sm')}<span class="nm">${esc(p.name)}</span>${hearts(p.hearts, d.max)}<span class="w">🔨${p.wins}</span></div>`).join('') || '<p class="muted">아무도 없어요</p>'}</div></div>
        <div class="sticker ry-top10"><h2>⭐ 점수 순위</h2><div class="board">${d.top.map((r, i) => `<div class="brow r${r.rank}" style="--i:${i}">
          <span class="rk">${r.rank}</span>${avatarHTML(ava(r.pid), 'sm')}<span class="nm">${esc(r.name)}${r.extra.champion ? ' 🏆' : r.extra.alive ? '' : ' 👻'}</span>
          <span class="ry-bar"><i style="width:${(r.score / max) * 100}%"></i></span><span class="sc">${r.score.toLocaleString()}</span></div>`).join('')}</div></div></div>`;
      if (d.champion) later(() => showChampion(d.champion, true), 300);
      nextBtns(d); fit(); later(fit, 80); later(fit, 700);
    }
  }
  // TV 한 화면에 다 보이게: 넘치면 줄여서(최소 55%) 맞춘다 (반 30명이면 대결 카드 15장)
  function fit() {
    const box = main.firstElementChild; if (!box || !box.matches('.ry-rev, .ry-board')) return;
    box.style.zoom = '';
    const avail = innerHeight - Math.max(0, main.getBoundingClientRect().top) - ctrl.offsetHeight - 28;
    const need = box.scrollHeight;
    if (need > avail && avail > 200) box.style.zoom = Math.max(0.55, avail / need).toFixed(3);
  }
  function showChampion(c, quiet) {
    const card = h(`<div class="ry-champ"><div class="sticker"><div class="ry-ctitle">🏆 챔피언</div>${avatarHTML(ava(c.pid), 'xl')}<div class="ry-cname">${esc(c.name)}</div><small>마지막까지 살아남았어요!</small></div></div>`);
    main.append(card);
    card.addEventListener('click', () => card.remove());
    if (!quiet) { fx.heavy('챔피언!', '#E3B800'); confetti(140); ctx.sound.play('win'); }
  }
  const onResize = () => fit();
  window.addEventListener('resize', onResize);
  const offs = [
    ctx.on('phase', render),
    ctx.on('count', c => { const a = $('#ry-ans', el); if (a) a.textContent = `📨 ${c.answered}/${c.total} 답함`; }),
    ctx.on('deadline', d => { if (cur) cur.deadline = d.deadline; ctx.toast('⏱ 10초 더!'); }),
    ctx.on('revive', d => {
      ctx.toast(d.n ? `💖 ${d.n}명이 하트 1개로 부활했어요!` : '💖 모두 살아 있어요');
      if (d.n) ctx.sound.play('win');
      if (!cur) return;
      const al = $('#ry-alive', el); if (al) al.textContent = `💖 생존 ${d.alive}명`;
      if (!d.champion && cur.champion) { cur = { ...cur, champion: null }; $('.ry-champ', main)?.remove(); }
      if (cur.phase === 'board') ctx.send('board', {});
      else if (cur.phase === 'reveal') nextBtns(cur);
    }),
  ];
  const s = ctx.snapshot;
  if (s?.last) {
    render(s.last);
    if (s.last.phase === 'question' && s.answered != null) { const a = $('#ry-ans', el); if (a) a.textContent = `📨 ${s.answered}/${s.need} 답함`; }
  } else main.innerHTML = '<div class="ry-ready"><h1 class="ry-title">⚔️ 준비 중…</h1></div>';
  return () => { offs.forEach(f => f()); clearInterval(timer); timers.forEach(clearTimeout); window.removeEventListener('resize', onResize); ctx.music.stop(); };
}
