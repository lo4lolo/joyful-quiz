// 다 함께 줄다리기 (서버: server/modes/tug.js, 설계: docs/modes/tug.md)
// 우리 반(모든 모둠) vs 도깨비 팀, 또는 청군 vs 홍군. 서로 다른 모둠원 여럿이 맞혀야 "영차!" 준비, 기수가 눌러 당긴다.
import { $, $$, esc, h, avatarHTML, fmtSec, sleep, onImgFail } from '../common.js';
import { fx, setMuted } from '../fx.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/tug.css">')); } };
const ART = 'assets/trad/';
// 서버 server/teams.js 와 같은 순서 (방 정보·라운드 정보가 오기 전 대체용)
const TEAM0 = [
  { id: 'cheongryong', name: '청룡', color: '#3D8BFF', emoji: '🐉' }, { id: 'jujak', name: '주작', color: '#FF6F61', emoji: '🐦' },
  { id: 'bonghwang', name: '봉황', color: '#FFC83D', emoji: '🐤' }, { id: 'haechi', name: '해치', color: '#2ED3A0', emoji: '🦁' },
  { id: 'baekho', name: '백호', color: '#8FA3C4', emoji: '🐯' }, { id: 'hyeonmu', name: '현무', color: '#8C6CFF', emoji: '🐢' },
];
const SIDES = { class: ['우리 반', '도깨비 팀'], teams: ['청군', '홍군'] };
const SIDE_COLOR = ['#3D8BFF', '#FF6F61'];
const clampR = r => Math.max(-100, Math.min(100, +r || 0));

// 그림이 있으면 클래스를 붙인다 (CSS 배경용). 없으면 CSS 그림 그대로.
function preload(src, ok) { const i = new Image(); i.onload = () => { if (i.naturalWidth) ok(); }; i.src = src; }
const emblem = (T, size = '') => `<span class="tg-emb ${size}" style="--tc:${esc(T.color)}"><img src="${ART}team_${esc(T.id)}.webp" alt="" draggable="false"><b>${esc(T.emoji)}</b></span>`;
function wireImgs(root) {
  $$('.tg-emb img', root).forEach(img => onImgFail(img, () => img.parentElement.classList.add('noimg')));
  $$('.tg-ribbon img', root).forEach(img => onImgFail(img, () => img.parentElement.classList.add('noimg')));
  // 줄 당기는 친구들 그림: 있을 때만 넣는다 (없으면 아바타·도깨비 CSS)
  $$('.tg-crew[data-img]', root).forEach(c => {
    const src = ART + c.dataset.img; delete c.dataset.img;
    preload(src, () => { const img = new Image(); img.className = 'tg-crewimg'; img.alt = ''; img.draggable = false; img.src = src; c.prepend(img); c.classList.add('hasimg'); });
  });
}
// 귀여운 도깨비 친구 (CSS 그림, 무섭지 않게)
const dokkaebi = (k = 0) => `<span class="tg-dok d${k}"><i class="hn l"></i><i class="hn r"></i><i class="ey l"></i><i class="ey r"></i><i class="bl l"></i><i class="bl r"></i><i class="mo"></i><i class="ar"></i></span>`;
// 판 점수: 우리 반 2 : 1 도깨비 (이긴 판만큼 동그라미)
const pips = (wins, rounds, style) => {
  if (rounds <= 1) return '';
  const a = Math.max(0, wins?.[0] | 0), b = Math.max(0, wins?.[1] | 0), S = SIDES[style] || SIDES.class;
  return `<span class="tg-pips"><span class="sn a">${esc(S[0])}</span>${'<i class="a"></i>'.repeat(Math.min(3, a))}<em>${a} : ${b}</em>${'<i class="b"></i>'.repeat(Math.min(3, b))}<span class="sn b">${esc(S[1])}</span></span>`;
};

// 줄다리기 마당 (TV 큰 것 / 학생 작은 것)
function fieldHTML(big) {
  return `<div class="tg-field ${big ? 'big' : 'mini'}">
    <div class="tg-ground"><i class="tg-line l"></i><i class="tg-line c"></i><i class="tg-line r"></i>
      <span class="tg-lab l"></span><span class="tg-lab r"></span></div>
    <div class="tg-mover">
      <div class="tg-rope"></div>
      ${big ? `<div class="tg-crew left" data-img="tug_left.webp"><div class="tg-avas"></div></div>
      <div class="tg-crew right" data-img="tug_right.webp"><div class="tg-avas"></div><div class="tg-doks">${dokkaebi(0)}${dokkaebi(1)}${dokkaebi(2)}</div></div>` : ''}
      <span class="tg-ribbon"><img src="${ART}rope_center.webp" alt="" draggable="false"><i class="tg-flag"></i></span>
    </div></div>`;
}
function fieldUI(root, big) {
  const f = $('.tg-field', root), mover = $('.tg-mover', f);
  preload(ART + 'rope.webp', () => f.classList.add('has-rope'));
  let cur = 0;
  return {
    el: f,
    set(r, jolt) {
      r = clampR(r);
      // 큰 마당: 결승선이 가운데에서 20% 떨어짐, 작은 마당: 35%
      mover.style.transform = `translateX(${(r * (big ? 0.2 : 0.35)).toFixed(2)}%)`;
      f.classList.toggle('lean-l', r < -60); f.classList.toggle('lean-r', r > 60);
      if (jolt) { f.classList.remove('jolt'); void f.offsetWidth; f.classList.add('jolt'); }
      cur = r;
    },
    get r() { return cur; },
    labels(style) { $('.tg-lab.l', f).textContent = SIDES[style][0]; $('.tg-lab.r', f).textContent = SIDES[style][1]; f.dataset.style = style; },
  };
}

// 공통 상태 (라운드·시간·모둠 게이지)
function makeState() {
  return { style: 'class', rounds: 3, round: 0, phase: 'count', wins: [0, 0], r: 0, teams: [], g: Object.create(null), endsAt: 0, countUntil: 0, seconds: 90 };
}
function applyRound(S, d) {
  if (!d) return;
  if (d.style === 'class' || d.style === 'teams') S.style = d.style;
  if (d.rounds) S.rounds = d.rounds;
  if (Number.isFinite(d.round)) S.round = d.round;
  if (d.phase) S.phase = d.phase;
  if (Array.isArray(d.wins)) S.wins = d.wins;
  if (Number.isFinite(d.r)) S.r = clampR(d.r);
  if (Array.isArray(d.teams) && d.teams.length) S.teams = d.teams;
  if (d.seconds) S.seconds = d.seconds;
  if (Number.isFinite(d.timeLeft)) S.endsAt = Date.now() + d.timeLeft;
  if (d.phase === 'count') S.countUntil = Date.now() + (d.countLeft || 0);
  if (Array.isArray(d.g)) d.g.forEach(g => setG(S, g));
}
function setG(S, g) {
  if (!g || !Number.isInteger(g.ti)) return;
  S.g[g.ti] = { ...g, done: new Set(Array.isArray(g.done) ? g.done : []), autoAt: g.autoLeft ? Date.now() + g.autoLeft : 0 };
}
const teamOf = (S, ti) => S.teams.find(t => t.ti === ti) || { ti, side: 0, ...(TEAM0[ti] || TEAM0[0]) };
const needText = g => !g ? '문제를 맞혀 힘을 모아요' : g.ready ? (g.all ? '모두 모였어요! 한마음 +1' : '영차 준비 완료!') : `영차까지 ${Math.max(1, g.need - g.n)}명 더!`;

// 큰 글자 알림 (3-2-1, 판 결과)
function overlayUI(root) {
  const o = $('.tg-over', root);
  let t = 0, cd = 0;
  const hide = () => { clearInterval(cd); o.hidden = true; o.innerHTML = ''; };
  return {
    count(until, round, rounds, style, sound) {
      clearTimeout(t); clearInterval(cd);
      o.hidden = false;
      let last = -1;
      const draw = () => {
        const left = Math.ceil((until - Date.now()) / 1000);
        if (left <= 0) { o.innerHTML = `<div class="tg-cd go">영차!</div>`; clearInterval(cd); t = setTimeout(hide, 650); sound?.('go'); return; }
        if (left !== last) {
          last = left;
          o.innerHTML = `<div class="tg-cdwrap"><div class="tg-cdtitle">${rounds > 1 ? `${round}판` : '한 판 승부'} · ${esc(SIDES[style][0])} vs ${esc(SIDES[style][1])}</div><div class="tg-cd">${left}</div></div>`;
          sound?.('count');
        }
      };
      draw(); cd = setInterval(draw, 100);
    },
    card(html, ms) { clearTimeout(t); clearInterval(cd); o.hidden = false; o.innerHTML = html; if (ms) t = setTimeout(hide, ms); },
    hide() { clearTimeout(t); hide(); },
    stop() { clearTimeout(t); clearInterval(cd); },
  };
}
function roundEndHTML(d, style) {
  const sides = d.sides || SIDES[style];
  const win = d.winner, cls = style === 'class';
  const title = win == null ? '🤝 비겼어요!' : cls ? (win === 0 ? '🎉 우리 반 승리!' : '도깨비 팀이 이겼어요') : `🎉 ${esc(sides[win])} 승리!`;
  const sub = d.how === 'line' ? '끝까지 당겼어요!' : '시간 끝! 줄이 더 가까운 편이 이겨요';
  const next = d.final ? '결과를 보여 줄게요' : '다음 판 준비!';
  return `<div class="tg-rcard sticker ${win === 0 || !cls ? 'win' : 'lose'}"><h2>${d.round}판 · ${title}</h2><p>${sub}</p>
    ${d.rounds > 1 ? `<p class="tg-rwins">${pips(d.wins, d.rounds, style)}</p>` : ''}<p class="muted">${next}</p></div>`;
}
function resultHTML(d) {
  const cls = d.style === 'class', good = cls ? d.classWin : true;
  return `<div class="tg-rcard sticker final ${good ? 'win' : 'lose'}"><div class="em">${cls ? (d.classWin ? '🏆' : '💪') : '🤝'}</div><h2>${esc(d.text || '')}</h2>
    ${d.rounds > 1 ? `<p class="tg-rwins">${pips(d.wins, d.rounds, d.style)}</p>` : ''}
    <p>${cls ? '모둠 친구들이 힘을 모은 덕분이에요!' : '협력적 팀 경쟁: 두 편 모두 모둠끼리 힘을 모았어요'}</p></div>`;
}

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  setMuted(!ctx.sound.on);
  el.innerHTML = `<div class="tg-s">
    <section class="tg-top sticker">
      <div class="tg-toprow"><span class="tg-round" id="ts-round"></span><span id="ts-pips"></span><span class="grow"></span><span class="pill tg-time">⏱ <b id="ts-time">-</b></span></div>
      ${fieldHTML(false)}
      <div class="tg-myside" id="ts-side"></div>
    </section>
    <div class="tg-sgrid">
      <section class="tg-team sticker" id="ts-team">
        <div class="tg-thead" id="ts-thead"></div>
        <div class="tg-mem" id="ts-mem"></div>
        <div class="tg-need" id="ts-need"></div>
        <div class="tg-gisu" id="ts-gisu"></div>
        <p class="tg-mine" id="ts-mine"></p>
      </section>
      <section class="tg-q" id="ts-q"></section>
    </div>
    <div class="tg-over" hidden></div></div>`;
  const S = makeState(), field = fieldUI(el, false), over = overlayUI(el), qbox = $('#ts-q', el);
  let alive = true, openQuiz = null, wake = null, inBeat = false, pulling = false, contrib = 0, lastGisu = null, wasReady = false;
  const myTeam = () => { const p = ctx.room?.players?.find(x => x.pid === ctx.me.pid); return Number.isInteger(p?.team) ? p.team : null; };
  const mySide = () => { const t = myTeam(); return t == null ? 0 : (S.style === 'teams' && t % 2 === 1 ? 1 : 0); };
  const sound = n => ctx.sound.play(n);

  function drawTop() {
    $('#ts-round', el).textContent = S.rounds > 1 ? `${Math.max(1, S.round)}판 / 3판` : '한 판 승부';
    $('#ts-pips', el).innerHTML = pips(S.wins, S.rounds, S.style);
    field.labels(S.style); field.set(S.r);
    const side = mySide();
    const dir = side === 0 ? '⬅️ 왼쪽으로 당겨요' : '오른쪽으로 당겨요 ➡️';
    $('#ts-side', el).innerHTML = `<span class="tg-sidechip" style="--sc:${SIDE_COLOR[side]}">우리 편: ${esc(SIDES[S.style][side])}</span><span class="muted">${dir}</span>`;
    el.querySelector('.tg-field').dataset.side = side;
  }
  function drawTeam() {
    const ti = myTeam();
    const box = $('#ts-team', el);
    if (ti == null) { $('#ts-thead', el).innerHTML = '<b>모둠을 정하는 중…</b>'; $('#ts-mem', el).innerHTML = ''; $('#ts-need', el).textContent = ''; $('#ts-gisu', el).innerHTML = ''; return; }
    const T = teamOf(S, ti), g = S.g[ti];
    box.style.setProperty('--tc', T.color);
    const hk = `${ti}:${S.style}:${T.side}`;
    if (box.dataset.hk !== hk) {
      box.dataset.hk = hk;
      $('#ts-thead', el).innerHTML = `${emblem(T)}<div><b>${esc(T.name)} 모둠</b><small>${esc(SIDES[S.style][T.side ?? mySide()])}</small></div>`;
      wireImgs($('#ts-thead', el));
    }
    const mem = (ctx.room?.players || []).filter(p => p.team === ti);
    const mk = mem.map(p => p.pid + (p.online ? 1 : 0) + (g?.done.has(p.pid) ? 'y' : 'n') + (g?.gisu === p.pid ? 'g' : '') + (p.avatar?.char || '')).join('|');
    if (box.dataset.mk !== mk) {
      box.dataset.mk = mk;
      $('#ts-mem', el).innerHTML = mem.map(p => `<span class="tg-m ${g?.done.has(p.pid) ? 'lit' : ''} ${p.online ? '' : 'off'} ${g?.gisu === p.pid ? 'gisu' : ''} ${p.pid === ctx.me.pid ? 'me' : ''}" title="${esc(p.name)}">
        ${avatarHTML(p.avatar, 'sm')}<em>${esc(p.pid === ctx.me.pid ? '나' : p.name)}</em>${g?.gisu === p.pid ? '<i class="tg-flagi">🚩</i>' : ''}</span>`).join('');
    }
    const need = $('#ts-need', el);
    need.textContent = needText(g); need.classList.toggle('ready', !!g?.ready);
    box.classList.toggle('ready', !!g?.ready);
    // 기수
    const me = g?.gisu === ctx.me.pid, canPull = !!g?.ready && S.phase === 'pull';
    const gbox = $('#ts-gisu', el);
    if (me) {
      if (!$('.tg-yc', gbox)) {
        gbox.innerHTML = `<button class="tg-yc" id="ts-yc"><span class="big">영차!</span><small></small><i class="tg-ring"></i></button><p class="tg-gtip">🚩 내가 기수예요! 친구들과 눈을 맞추고 함께 "영차!"</p>`;
        $('#ts-yc', el).addEventListener('click', doPull);
      }
      const b = $('#ts-yc', el);
      b.disabled = !canPull || pulling; b.classList.toggle('on', canPull);
      $('small', b).textContent = canPull ? (g.all ? '지금 누르면 한마음 +1!' : '모둠과 신호를 맞춰 눌러요') : S.phase === 'pull' ? `친구 ${Math.max(1, (g?.need || 2) - (g?.n || 0))}명 더 맞히면 켜져요` : '곧 시작해요';
    } else {
      const name = g?.gisuName || (ctx.room?.players || []).find(p => p.pid === g?.gisu)?.name || '';
      gbox.innerHTML = name ? `<div class="tg-gname ${g?.ready ? 'ready' : ''}">🚩 기수: <b>${esc(name)}</b><small>${g?.ready ? `준비 완료! ${esc(name)}에게 "영차!" 신호를 보내요` : '준비되면 기수가 영차를 눌러요'}</small></div>` : '';
    }
    if (me && !lastGisu && g) { fx.stamp('내가 기수!', '#8C6CFF'); sound('open'); }
    if (me && g?.ready && !wasReady && S.phase === 'pull') sound('coin');
    lastGisu = me; wasReady = !!g?.ready;
    $('#ts-mine', el).innerHTML = inBeat ? '✅ 내 힘을 보탰어요! 영차 뒤에 또 보탤 수 있어요' : '💪 문제를 맞히면 내 힘이 모둠에 모여요';
  }
  async function doPull() {
    if (pulling) return;
    pulling = true; drawTeam();
    const r = await ctx.send('pull', {});
    pulling = false;
    if (!r?.ok) { const m = { notReady: '아직 준비가 안 됐어요. 친구들이 더 맞혀야 해요!', notGisu: '기수가 바뀌었어요.', wait: '잠깐만요!' }[r?.error]; if (m) ctx.toast(m); }
    drawTeam();
  }
  // 자동 영차까지 남은 시간 (기수 버튼 둘레)
  const clock = setInterval(() => {
    if (S.phase === 'pull' && S.endsAt) { const left = (S.endsAt - Date.now()) / 1000; $('#ts-time', el).textContent = fmtSec(left); $('#ts-time', el).parentElement.classList.toggle('hurry', left < 10); }
    else if (S.phase === 'count') $('#ts-time', el).textContent = fmtSec(S.seconds);
    const ti = myTeam(), g = ti != null ? S.g[ti] : null, b = $('#ts-yc', el);
    if (b && g?.autoAt && g.ready) { const left = Math.max(0, g.autoAt - Date.now()); b.style.setProperty('--auto', (left / 6000).toFixed(3)); }
    else if (b) b.style.setProperty('--auto', 1);
  }, 200);

  function waitCard(text) { qbox.innerHTML = `<div class="tg-wait sticker"><div class="em">🪢</div>${esc(text)}</div>`; }
  async function loop() {
    while (alive) {
      if (S.phase === 'over' || S.phase === 'end') { waitCard('결과를 기다려요…'); return; }
      if (S.phase !== 'pull' && S.phase !== 'count') {
        waitCard('다음 판을 준비해요!');
        await new Promise(r => { wake = r; setTimeout(r, 1500); }); wake = null;
        continue;
      }
      qbox.innerHTML = '';
      const res = await ctx.quiz({ inline: true, container: qbox, label: '💪 맞히면 모둠에 힘을 보태요', okDelay: 500, onOpen: l => { openQuiz = l; } });
      openQuiz = null;
      if (!alive) return;
      if (res === null) { if (S.phase === 'pull' || S.phase === 'count') waitCard('잠깐만요…'); await sleep(900); }
    }
  }
  const offs = [
    ctx.on('round', d => {
      applyRound(S, d); drawTop(); drawTeam();
      if (d.phase === 'count') over.count(S.countUntil, S.round, S.rounds, S.style, sound);
      wake?.();
    }),
    ctx.on('rope', d => { if (Number.isFinite(d.r)) S.r = clampR(d.r); if (Number.isFinite(d.timeLeft) && d.phase === 'pull') S.endsAt = Date.now() + d.timeLeft; (d.g || []).forEach(g => setG(S, g)); field.set(S.r); if (d.g?.length) drawTeam(); }),
    ctx.on('board', d => { applyRound(S, d); field.set(S.r); drawTeam(); }),
    ctx.on('mine', d => {
      if (d.g) setG(S, d.g);
      contrib = d.contrib | 0;
      if (d.ok) {
        const card = $('#ts-team', el);
        if (d.fresh) { inBeat = true; fx.medium(card, '힘 보탬!', '#14A57A'); sound('coin'); }
        else fx.float(card, '이미 보탰어요! 친구를 응원해요', '#5B6B8C');
      }
      drawTeam();
    }),
    ctx.on('pull', d => {
      S.r = clampR(d.r);
      const mine = d.ti === myTeam(), sameSide = (S.style === 'teams' ? d.side : 0) === mySide();
      field.set(S.r, true);
      if (mine) {
        inBeat = false;
        fx.heavy(d.auto ? '자동 영차!' : '영차!', d.all ? '#2ED3A0' : '#FF6F61');
        if (d.all) ctx.toast('한마음 보너스! 모둠 모두가 힘을 보탰어요 +1');
      } else if (sameSide) { fx.float(field.el, `${teamOf(S, d.ti).name} 영차!`, '#1B2A4A'); sound('pick'); }
      else { fx.float(field.el, `${teamOf(S, d.ti).name} 영차!`, '#FF6F61'); }
      drawTeam();
    }),
    ctx.on('roundEnd', d => {
      S.phase = 'roundEnd'; S.wins = d.wins || S.wins; if (Number.isFinite(d.r)) S.r = clampR(d.r);
      drawTop(); drawTeam();
      openQuiz?.closeQuiz?.();
      const won = d.winner != null && (S.style === 'class' ? d.winner === 0 : d.winner === mySide());
      if (won) { fx.heavy('이겼다!', '#2ED3A0'); sound('win'); } else sound(d.winner == null ? 'open' : 'lose');
      over.card(roundEndHTML(d, S.style), 3200);
    }),
    ctx.on('result', d => {
      S.phase = 'over'; S.wins = d.wins || S.wins; openQuiz?.closeQuiz?.(); drawTop();
      if (d.style === 'class' ? d.classWin : d.winner === mySide()) fx.heavy('승리!', '#2ED3A0');
      over.card(resultHTML(d));
    }),
    ctx.onRoom(() => { drawTop(); drawTeam(); }),
  ];
  const s = ctx.snapshot;
  if (s) {
    applyRound(S, s);
    if (s.me) { inBeat = !!s.me.inBeat; contrib = s.me.contrib | 0; lastGisu = s.me.gisu; }
    if (s.phase === 'count') setTimeout(() => alive && over.count(S.countUntil, S.round, S.rounds, S.style, sound), 0);
    if (s.over) over.card(resultHTML({ style: s.style, wins: s.wins, rounds: s.rounds, classWin: s.style === 'class' && s.wins[0] > s.rounds / 2, text: '게임이 끝났어요!' }));
  }
  drawTop(); drawTeam();
  loop();
  return () => { alive = false; offs.forEach(f => f()); clearInterval(clock); over.stop(); openQuiz?.closeQuiz?.(); wake?.(); };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  el.innerHTML = `<div class="tg-t">
    <div class="tt-top"><h1>🪢 다 함께 줄다리기</h1><span class="tg-round big" id="tt-round"></span><span id="tt-pips"></span><span class="grow"></span>
      <span class="pill tt-time">⏱ <b id="tt-time">-</b></span><button class="btn coral" id="tt-end">🏁 지금 끝내기</button></div>
    <section class="tt-scene" id="tt-scene">
      <div class="tt-sky"><i class="cl c1"></i><i class="cl c2"></i><i class="cl c3"></i></div>
      ${fieldHTML(true)}
      <div class="tt-feed" id="tt-feed"></div>
      <div class="tt-pops" id="tt-pops"></div>
    </section>
    <section class="tt-banners" id="tt-banners"></section>
    <div class="tg-over" hidden></div></div>`;
  ctx.music.start(140);
  const S = makeState(), field = fieldUI(el, true), over = overlayUI(el), scene = $('#tt-scene', el);
  preload(ART + 'bg_madang.webp', () => scene.classList.add('has-bg'));
  preload(ART + 'hanji.webp', () => el.querySelector('.tg-t')?.classList.add('has-hanji'));
  wireImgs(el);
  const sound = n => ctx.sound.play(n);
  let bannerKey = '', lastSound = 0;

  function drawTop() {
    $('#tt-round', el).textContent = S.rounds > 1 ? `${Math.max(1, S.round)}판 / 3판${S.style === 'teams' ? ' (먼저 2판)' : ''}` : '한 판 승부';
    $('#tt-pips', el).innerHTML = pips(S.wins, S.rounds, S.style);
    field.labels(S.style); field.set(S.r);
    el.querySelector('.tg-t').dataset.style = S.style;
  }
  // 줄에 매달린 친구들 (그림이 없을 때 실제 아바타로)
  function drawCrews() {
    const ps = (ctx.room?.players || []).filter(p => p.online && Number.isInteger(p.team));
    const side = p => (S.style === 'teams' && p.team % 2 === 1 ? 1 : 0);
    const put = (sel, list) => { const box = $(sel, el); if (box) box.innerHTML = list.slice(0, 7).map((p, i) => `<span class="tg-pull" style="--i:${i}">${avatarHTML(p.avatar, '')}</span>`).join(''); };
    put('.tg-crew.left .tg-avas', ps.filter(p => side(p) === 0));
    put('.tg-crew.right .tg-avas', S.style === 'teams' ? ps.filter(p => side(p) === 1) : []);
  }
  function bannerHTML(T) {
    return `<div class="tt-card sticker" data-ti="${T.ti}" style="--tc:${esc(T.color)}">
      <div class="tt-chead">${emblem(T, 'lg')}<div><b>${esc(T.name)}</b><span class="tt-pulls"></span></div></div><small class="tt-gisu"></small>
      <div class="tt-dots"></div><div class="tt-need"></div></div>`;
  }
  function drawBanners() {
    const teams = S.teams.length ? S.teams : [];
    const key = S.style + ':' + teams.map(t => t.ti + '.' + t.side).join(',');
    const box = $('#tt-banners', el);
    if (key !== bannerKey) {
      bannerKey = key;
      if (S.style === 'teams') {
        const side = k => teams.filter(t => t.side === k).map(bannerHTML).join('');
        box.innerHTML = `<div class="tt-group blue"><h3>청군</h3><div class="tt-row">${side(0)}</div></div><div class="tt-vs">VS</div><div class="tt-group red"><h3>홍군</h3><div class="tt-row">${side(1)}</div></div>`;
      } else box.innerHTML = `<div class="tt-group class"><h3>우리 반 모둠</h3><div class="tt-row">${teams.map(bannerHTML).join('')}</div></div>`;
      wireImgs(box);
    }
    for (const T of teams) drawGauge(T.ti);
  }
  function drawGauge(ti) {
    const card = $(`.tt-card[data-ti="${ti}"]`, el); if (!card) return;
    const g = S.g[ti];
    const mem = (ctx.room?.players || []).filter(p => p.team === ti);
    const on = mem.filter(p => p.online);
    const key = mem.map(p => p.pid + (p.online ? 1 : 0) + (g?.done.has(p.pid) ? 'y' : 'n') + (g?.gisu === p.pid ? 'g' : '')).join('|');
    if (card.dataset.k !== key) {
      card.dataset.k = key;
      $('.tt-dots', card).innerHTML = mem.map(p => `<span class="tg-m ${g?.done.has(p.pid) ? 'lit' : ''} ${p.online ? '' : 'off'} ${g?.gisu === p.pid ? 'gisu' : ''}" title="${esc(p.name)}">${avatarHTML(p.avatar, 'sm')}${g?.gisu === p.pid ? '<i class="tg-flagi">🚩</i>' : ''}</span>`).join('')
        || '<span class="muted">아직 친구가 없어요</span>';
    }
    const name = g?.gisuName || mem.find(p => p.pid === g?.gisu)?.name || '';
    $('.tt-gisu', card).textContent = name ? `🚩 기수 ${name}` : on.length ? '' : '모두 자리를 비웠어요';
    $('.tt-pulls', card).textContent = g?.pulls ? `영차 ${g.pulls}` : '';
    const need = $('.tt-need', card);
    need.textContent = on.length ? needText(g) : '';
    card.classList.toggle('ready', !!g?.ready && on.length > 0);
  }
  function pop(d) {
    const card = $(`.tt-card[data-ti="${d.ti}"]`, el), T = teamOf(S, d.ti);
    if (card) { card.classList.remove('pulled'); void card.offsetWidth; card.classList.add('pulled'); fx.burst(...center(card), 14, 1); }
    const p = document.createElement('div');
    p.className = 'tt-pop' + (d.all ? ' all' : '') + (d.side === 1 ? ' right' : '');
    p.style.setProperty('--tc', T.color);
    p.innerHTML = `<b>${d.auto ? '자동 ' : ''}영차!</b><small>${esc(T.emoji)} ${esc(T.name)} · ${d.distinct}명${d.all ? ' · 한마음 +1' : ''}</small>`;
    const r = card?.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    const x = r ? ((r.left + r.width / 2 - sr.left) / sr.width) * 100 : (d.side === 1 ? 70 : 30);
    p.style.left = Math.max(10, Math.min(90, x)) + '%';
    $('#tt-pops', el).append(p); setTimeout(() => p.remove(), 1500);
  }
  function feedLine(f) {
    const box = $('#tt-feed', el); if (!box || !f?.text) return;
    box.prepend(h(`<div class="tt-fl">${esc(f.text)}</div>`));
    while (box.children.length > 4) box.lastChild.remove();
  }
  const clock = setInterval(() => {
    const t = $('#tt-time', el);
    if (S.phase === 'pull' && S.endsAt) { const left = (S.endsAt - Date.now()) / 1000; t.textContent = fmtSec(left); t.parentElement.classList.toggle('hurry', left < 10); }
    else if (S.phase === 'count') t.textContent = fmtSec(S.seconds);
  }, 200);
  $('#tt-end', el).addEventListener('click', () => { if (confirm('줄다리기를 지금 끝낼까요?')) ctx.end(); });
  const offs = [
    ctx.on('round', d => {
      applyRound(S, d); drawTop(); drawBanners(); drawCrews();
      if (d.phase === 'count') over.count(S.countUntil, S.round, S.rounds, S.style, sound);
    }),
    ctx.on('rope', d => { if (Number.isFinite(d.r)) S.r = clampR(d.r); if (Number.isFinite(d.timeLeft) && d.phase === 'pull') S.endsAt = Date.now() + d.timeLeft; (d.g || []).forEach(g => { setG(S, g); drawGauge(g.ti); }); field.set(S.r); }),
    ctx.on('board', d => { applyRound(S, d); field.set(S.r); drawBanners(); }),
    ctx.on('pull', d => {
      S.r = clampR(d.r); field.set(S.r, true); pop(d);
      if (Date.now() - lastSound > 300) { lastSound = Date.now(); sound('hit'); }
    }),
    ctx.on('roundEnd', d => {
      S.phase = 'roundEnd'; S.wins = d.wins || S.wins; if (Number.isFinite(d.r)) S.r = clampR(d.r); drawTop();
      const good = S.style === 'teams' ? d.winner != null : d.winner === 0;
      if (good) { fx.heavy(S.style === 'class' ? '우리 반 승리!' : `${SIDES.teams[d.winner]} 승리!`, '#2ED3A0'); sound('win'); } else sound(d.winner == null ? 'open' : 'lose');
      over.card(roundEndHTML(d, S.style), 3300);
    }),
    ctx.on('result', d => {
      S.phase = 'over'; S.wins = d.wins || S.wins; drawTop();
      if (d.style === 'class' ? d.classWin : d.winner != null) fx.heavy('🏆', '#FFC83D');
      over.card(resultHTML(d));
    }),
    ctx.onRoom(() => { drawBanners(); drawCrews(); }),
    ctx.onFeed(feedLine),
  ];
  (ctx.feed || []).slice(-4).forEach(feedLine);
  const s = ctx.snapshot;
  if (s) { applyRound(S, s); if (s.phase === 'count') setTimeout(() => over.count(S.countUntil, S.round, S.rounds, S.style, sound), 0); }
  else { S.style = ctx.room?.settings?.style === 'teams' ? 'teams' : 'class'; S.rounds = +ctx.room?.settings?.rounds === 1 ? 1 : 3; S.seconds = ctx.room?.settings?.seconds || 90; S.teams = (ctx.room?.teams || []).map((t, ti) => ({ ti, side: S.style === 'teams' && ti % 2 ? 1 : 0, ...t })); }
  drawTop(); drawBanners(); drawCrews();
  return () => { offs.forEach(f => f()); clearInterval(clock); over.stop(); ctx.music.stop(); };
}
const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
