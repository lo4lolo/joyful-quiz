// 모둠 윷판 원정: 모둠들 vs 도깨비 말 (서버: server/modes/yut.js, 설명: docs/modes/yut.md)
// 화면은 확인 순간에만: 말 고르기·길 고르기는 모둠이 책상에서 의논하고 던지는 친구가 누른다.
import { $, $$, esc, h, avatarHTML, fmtSec, sleep, onImgFail } from '../common.js';
import { fx, setMuted } from '../fx.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/yut.css">')); } };
const S = -1, H = 99;
const NAME = { backdo: '백도', do: '도', gae: '개', geol: '걸', yut: '윷', mo: '모' };
const STEPS = { backdo: -1, do: 1, gae: 2, geol: 3, yut: 4, mo: 5 };
const MAL = ['blue', 'red', 'yellow', 'green', 'white', 'black'];

// ---------- 윷판 좌표 (0~100, 바깥 0번 = 오른쪽 아래 참먹이, 시계 반대 방향) ----------
const INNER = { 20: [5 / 6, 1 / 6], 21: [4 / 6, 2 / 6], 22: [.5, .5], 23: [2 / 6, 4 / 6], 24: [1 / 6, 5 / 6], 25: [1 / 6, 1 / 6], 26: [2 / 6, 2 / 6], 27: [4 / 6, 4 / 6], 28: [5 / 6, 5 / 6] };
function xy(st) {
  let u = 1, v = 1;
  if (st >= 0 && st <= 19) {
    const side = Math.floor(st / 5), k = (st % 5) / 5;
    [u, v] = side === 0 ? [1, 1 - k] : side === 1 ? [1 - k, 0] : side === 2 ? [0, k] : [k, 1];
  } else if (INNER[st]) [u, v] = INNER[st];
  return { x: 14.41 + u * 71.18, y: 14.41 + v * 71.18 }; // assets/trad/trad.json board.stations 와 같은 자리 (yut_board.png 겹치기)
}
const BIG = new Set([0, 5, 10, 15, 22]);
const LABEL = { 0: '출발·도착', 5: '모', 10: '뒷모', 15: '찌모', 22: '방' };
function boardSVG() {
  const L = (a, b) => { const p = xy(a), q = xy(b); return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}"/>`; };
  const dots = [];
  for (let st = 0; st <= 28; st++) {
    const p = xy(st), big = BIG.has(st);
    dots.push(`<g class="yt-st ${big ? 'big' : ''} s${st}" data-st="${st}"><circle class="ring" cx="${p.x}" cy="${p.y}" r="${big ? 5.6 : 3.9}"/>
      <g class="yt-draw"><circle class="dot" cx="${p.x}" cy="${p.y}" r="${big ? 4 : 2.7}"/>${big ? `<circle class="in" cx="${p.x}" cy="${p.y}" r="2.1"/>` : ''}</g></g>`);
  }
  const lab = Object.entries(LABEL).map(([st, t]) => {
    const p = xy(+st), dy = +st === 22 ? 9.4 : p.y > 50 ? 9 : -6.4, dx = 0;
    return `<text class="yt-lab ${+st === 0 ? 'home' : ''}" x="${p.x + dx}" y="${p.y + dy}">${t}</text>`;
  }).join('');
  // 가는 방향 화살표 (출발 → 위로)
  const arrow = `<path class="yt-arrow" d="M79.6 77 L79.6 61 M77.4 64.4 L79.6 60.6 L81.8 64.4"/>`;
  return `<svg class="yt-svg" viewBox="0 0 100 100" aria-hidden="true">
    <g class="yt-draw"><rect class="yt-paper" x="5" y="5" width="90" height="90" rx="4"/>
    <g class="yt-lines">${L(0, 5)}${L(5, 10)}${L(10, 15)}${L(15, 0)}${L(5, 15)}${L(10, 0)}</g></g>
    ${arrow}${dots.join('')}${lab}</svg>`;
}
// 도깨비 말 (웃는 얼굴, 무섭지 않게)
const DK_SVG = `<svg class="yt-dkface" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M19 17 L23 4 L30 14Z M34 14 L41 4 L45 17Z" fill="#FFE14D" stroke="#1B2A4A" stroke-width="3" stroke-linejoin="round"/>
  <circle cx="32" cy="37" r="23" fill="#8C6CFF" stroke="#1B2A4A" stroke-width="3.2"/>
  <circle cx="23.5" cy="34" r="5.4" fill="#fff" stroke="#1B2A4A" stroke-width="2.2"/><circle cx="40.5" cy="34" r="5.4" fill="#fff" stroke="#1B2A4A" stroke-width="2.2"/>
  <circle cx="24.6" cy="35" r="2.3" fill="#1B2A4A"/><circle cx="41.6" cy="35" r="2.3" fill="#1B2A4A"/>
  <circle cx="16.5" cy="44" r="3.6" fill="#FF6F91" opacity=".75"/><circle cx="47.5" cy="44" r="3.6" fill="#FF6F91" opacity=".75"/>
  <path d="M23 46 Q32 54 41 46" fill="#fff" stroke="#1B2A4A" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// 모둠 문장 (그림이 없으면 이모지)
function emblem(T, cls = '') {
  return `<span class="yt-emb ${cls}" style="--tc:${esc(T.color)}"><img src="assets/trad/team_${esc(T.id)}.webp" alt="" draggable="false"><b>${esc(T.emoji)}</b></span>`;
}
function wireImgs(root) {
  $$('img', root).forEach(img => {
    if (img.dataset.w) return; img.dataset.w = 1;
    const box = img.closest('.yt-emb, .f, .b');
    onImgFail(img, i => i.remove()); // 그림이 없으면 이모지·CSS 그림 그대로
    if (img.complete && img.naturalWidth) box?.classList.add('img');
    else img.addEventListener('load', () => box?.classList.add('img'), { once: true });
  });
}
// 윷가락 4개: 평평한 면(배)이 위면 셈. 0번 가락에 백도 표시
function sticksHTML(sticks = [true, true, false, false], toss = false) {
  return `<div class="yt-sticks ${toss ? 'toss' : ''}">${sticks.map((up, i) => `<div class="yt-stick ${up ? 'up' : 'down'} ${i === 0 ? 'mark' : ''}" style="--d:${i * 70}ms;--end:${(up ? 1080 : 1260) + i * 360}deg;--r:${[-8, 4, -3, 7][i]}deg">
    <div class="yt-spin"><div class="f"><img src="assets/trad/${i === 0 ? 'yut_backdo' : 'yut_front'}.webp" alt="" draggable="false"><i></i><i></i><i></i>${i === 0 ? '<em>백</em>' : ''}</div>
    <div class="b"><img src="assets/trad/yut_back.webp" alt="" draggable="false"></div></div></div>`).join('')}</div>`;
}
const resultText = (key, asDo) => asDo ? '백도 → 도처럼 한 칸!' : key === 'backdo' ? '백도! 한 칸 뒤로' : `${NAME[key]}! ${STEPS[key]}칸${key === 'yut' || key === 'mo' ? ' · 한 번 더!' : ''}`;
const stName = st => (st === S ? '출발 전' : st === H ? '집' : LABEL[st] && st !== 0 ? `${LABEL[st]}(${st}번 칸)` : `${st}번 칸`);

// ---------- 윷판 화면 (말 그리기·움직이기) ----------
function makeBoard(host, { big = false, mine = null } = {}) {
  host.innerHTML = `<div class="yt-board ${big ? 'big' : ''}"><img class="yt-bimg" src="assets/trad/yut_board.webp" alt="" draggable="false">${boardSVG()}<div class="yt-trail"></div><div class="yt-layer"></div></div>`;
  const board = $('.yt-board', host), layer = $('.yt-layer', board), trailBox = $('.yt-trail', board);
  { const bi = $('.yt-bimg', board); onImgFail(bi, i => i.remove()); if (bi.complete && bi.naturalWidth) board.classList.add('img'); else bi.addEventListener('load', () => board.classList.add('img'), { once: true }); }
  const toks = new Map();
  let st = null, pend = null, busy = 0, chain = Promise.resolve(), onTap = null;
  const tok = (T, i) => {
    const key = T.k + ':' + i;
    let el = toks.get(key);
    if (!el) {
      el = h(`<button class="yt-tok ${mine === T.k ? 'mine' : ''}" data-k="${T.k}" data-i="${i}" style="--tc:${esc(T.color)}" tabindex="-1">${emblem(T)}<span class="n"></span></button>`);
      el.addEventListener('click', () => onTap?.(T.k, i));
      layer.append(el); wireImgs(el); toks.set(key, el);
    }
    return el;
  };
  let dk = null;
  const dkTok = () => { if (!dk) { dk = h(`<div class="yt-tok dk">${DK_SVG}</div>`); layer.append(dk); } return dk; };
  const put = (el, st, dx = 0, dy = 0) => { const p = xy(st === S ? 0 : st === H ? 0 : st); el.style.left = (p.x + dx) + '%'; el.style.top = (p.y + dy) + '%'; };
  function layout(s) {
    st = s;
    const groups = new Map(); // 칸 → [{T, idx[]}]
    for (const T of s.teams) {
      const at = new Map();
      T.pieces.forEach((pc, i) => { if (pc.st !== S && pc.st !== H) { if (!at.has(pc.st)) at.set(pc.st, []); at.get(pc.st).push(i); } });
      T.pieces.forEach((pc, i) => { const el = tok(T, i); if (pc.st === S || pc.st === H) { el.hidden = true; el.classList.remove('lead'); } });
      for (const [k, idx] of at) { if (!groups.has(k)) groups.set(k, []); groups.get(k).push({ T, idx }); }
    }
    for (const [k, list] of groups) list.forEach((g, j) => {
      const n = list.length, a = (j / n) * Math.PI * 2 - Math.PI / 4, r = n > 1 ? (big ? 3.3 : 3.6) : 0;
      g.idx.forEach((i, z) => {
        const el = tok(g.T, i); el.hidden = z > 0; el.classList.toggle('lead', z === 0);
        put(el, k, Math.cos(a) * r, Math.sin(a) * r);
        $('.n', el).textContent = g.idx.length > 1 ? '×' + g.idx.length : '';
      });
    });
    const d = dkTok(); put(d, s.dk.st); d.classList.toggle('wait', s.dk.st === S || s.dk.st === 0);
  }
  // 화면이 가려져 있거나(다른 탭) 움직임이 밀려 있으면 건너뛰고 바로 최신 상태로 (타이머가 느려져도 쌓이지 않게)
  const skip = () => document.hidden || busy > 2;
  const run = fn => { busy++; chain = chain.then(fn).catch(e => console.error(e)).finally(() => { busy--; if (!busy && pend) { const p = pend; pend = null; layout(p); } }); return chain; };
  async function hopAlong(els, trail, ms, snd) {
    for (const s of trail) {
      els.forEach(el => { el.hidden = false; put(el, s === S ? 0 : s); el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); });
      if (s === S) els.forEach(el => el.classList.add('gohome'));
      snd?.(); await sleep(ms);
    }
  }
  return {
    el: board,
    apply(s) { if (busy) pend = s; else layout(s); },
    set onTap(fn) { onTap = fn; },
    move(d, snd) {
      if (skip()) return null;
      return run(async () => {
        const T = st?.teams.find(x => x.k === d.team); if (!T) return;
        const els = d.pieces.map(i => tok(T, i));
        els.forEach(el => { el.classList.add('moving'); $('.n', el).textContent = ''; });
        els.slice(1).forEach(el => { el.hidden = true; });
        await hopAlong(els.slice(0, 1), d.trail, big ? 300 : 240, snd);
        if (d.home) { els[0].classList.add('arrive'); await sleep(500); }
        els.forEach(el => el.classList.remove('moving', 'arrive', 'gohome', 'hop'));
      });
    },
    dk(d, snd, delay = 0) {
      if (skip()) return null;
      return run(async () => {
        if (delay) await sleep(delay);
        const el = dkTok(); el.classList.remove('wait'); el.classList.add('moving');
        await hopAlong([el], d.trail, big ? 300 : 240, snd);
        if (d.bumped?.length) {
          const bumpEls = d.bumped.flatMap(b => { const T = st?.teams.find(x => x.k === b.team); return T ? b.pieces.map(i => tok(T, i)) : []; });
          bumpEls.forEach(e => e.classList.add('bumped')); await sleep(650);
          bumpEls.forEach(e => { e.classList.remove('bumped'); e.hidden = true; });
        }
        el.classList.remove('moving', 'hop');
      });
    },
    // 고르는 중인 수 미리 보기: 지나갈 칸·도착 칸
    preview(trail, color) {
      trailBox.innerHTML = (trail || []).map((s, i, a) => { const p = xy(s === H ? 0 : s === S ? 0 : s); return `<i class="${i === a.length - 1 ? 'end' : ''}" style="left:${p.x}%;top:${p.y}%;--tc:${esc(color || '#1B2A4A')}"></i>`; }).join('');
    },
    flash(stn) { const g = $(`.yt-st.s${stn}`, board); if (!g) return; g.classList.remove('flash'); void g.getBoundingClientRect(); g.classList.add('flash'); },
  };
}

// 던지기 모습 (윷가락 4개가 뒤집히며 떨어짐)
function tossInto(box, d, { label = '' } = {}) {
  box.innerHTML = `${label ? `<div class="yt-tlabel">${label}</div>` : ''}${sticksHTML(d.sticks, true)}<div class="yt-tword k-${esc(d.key)}">${esc(resultText(d.key, d.asDo))}</div>`;
  wireImgs(box);
  box.classList.remove('done'); void box.offsetWidth;
  setTimeout(() => box.classList.add('done'), 1050);
}
const big2 = key => key === 'yut' || key === 'mo';

// 결과 덮개
function overlay(el, d, st) {
  const o = $('.yt-over', el);
  const done = d.done ?? st?.teams?.filter(t => t.phase === 'done').length ?? 0, n = d.teams ?? st?.teams?.length ?? 0;
  o.innerHTML = `<div class="yt-overcard sticker ${d.win ? 'win' : 'lose'}"><div class="em">${d.win ? '🏆' : DK_SVG}</div>
    <h2>${esc(d.text || (d.win ? '우리 반 승리!' : '다음엔 꼭!'))}</h2>
    <p>집에 온 모둠 <b>${done}</b> / ${n} · 도깨비 말 ${Math.min(2, Math.floor((d.dkSteps || 0) / 20))} / 2바퀴</p></div>`;
  o.hidden = false;
}

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  setMuted(!ctx.sound.on);
  const me = ctx.me.pid;
  el.innerHTML = `<div class="yt-s">
    <div class="hud"><span class="pill yt-myteam" id="ys-team">🎲 모둠 윷판</span><span class="grow"></span>
      <span class="pill yt-dkpill" title="도깨비 말">${DK_SVG}<b id="ys-dk">0 / 2</b>바퀴</span>
      <span class="pill">⏱ <b id="ys-time">-</b></span></div>
    <div class="yt-wrap">
      <section class="yt-left"><div class="sticker yt-boardcard" id="ys-board"></div></section>
      <section class="yt-right">
        <div class="sticker yt-gauge" id="ys-gauge"></div>
        <div id="ys-act"></div>
        <div class="yt-q" id="ys-q"></div>
      </section>
    </div>
    <div class="yt-tossbox" id="ys-toss" hidden></div>
    <div class="yt-over" hidden></div></div>`;
  let board = makeBoard($('#ys-board', el), { big: false, mine: null });
  const qbox = $('#ys-q', el), act = $('#ys-act', el), gaugeEl = $('#ys-gauge', el), tossBox = $('#ys-toss', el);
  let alive = true, st = null, myK = null, over = false, openQuiz = null, wake = null, sel = null, sigAct = '', sigGauge = '', contrib = 0;
  let endsAt = 0, choiceEnds = 0, readyEnds = 0;
  const players = () => ctx.room?.players || [];
  const pl = pid => players().find(p => p.pid === pid);
  const nm = pid => pl(pid)?.name || '친구';
  const myTeam = () => st?.teams.find(t => t.k === myK) || null;
  function findMine(s) {
    const t = s.teams.find(x => x.members.includes(me)) || s.teams.find(x => x.k === pl(me)?.team);
    return t ? t.k : null;
  }
  function apply(s) {
    if (!s?.teams) return;
    const firstTeam = myK == null;
    st = s; myK = findMine(s);
    if (firstTeam && myK != null) { // 내 모둠 말 강조
      const T = myTeam();
      board = makeBoard($('#ys-board', el), { big: false, mine: myK }); wireTap();
      el.querySelector('.yt-s').style.setProperty('--tc', T.color);
      $('#ys-team', el).innerHTML = `${emblem(T, 'sm')} ${esc(T.name)} 모둠`; wireImgs($('#ys-team', el));
    }
    board.apply(s);
    endsAt = Date.now() + s.timeLeft;
    $('#ys-dk', el).textContent = `${Math.min(2, s.dk.lap)} / ${s.laps}`;
    const T = myTeam();
    if (T?.choice) choiceEnds = Date.now() + T.choice.left;
    if (T?.phase === 'ready') readyEnds = Date.now() + T.readyLeft;
    if (s.over) over = true;
    if (T?.phase !== 'choose') { if (sel) board.preview(null); sel = null; }
    else if (T.choice.pick && T.thrower !== me) sel = { piece: T.choice.pick.piece, route: T.choice.pick.route };
    renderGauge(); renderAct();
    if (T?.phase === 'choose' && sel) showPreview();
    wake?.();
  }
  function renderGauge() {
    const T = myTeam(); if (!T) { gaugeEl.innerHTML = '<p class="muted">모둠을 기다려요…</p>'; return; }
    const done = T.phase === 'done';
    const fullWait = T.phase === 'ready' && !T.readyBonus;
    const lit = new Set(done ? st.help.got : T.gauge), need = done ? st.help.need : T.need;
    const got = done ? st.help.got.length : T.gauge.length;
    const sig = JSON.stringify([T.phase, T.readyBonus, [...lit], need, T.next, T.thrower, T.members, done, contrib, players().map(p => p.online + p.pid).join()]);
    if (sig === sigGauge) return; sigGauge = sig;
    const mem = done ? st.teams.filter(t => t.phase === 'done').flatMap(t => t.members) : T.members;
    gaugeEl.className = 'sticker yt-gauge' + (fullWait ? ' full' : '') + (done ? ' help' : '');
    gaugeEl.innerHTML = `<div class="yt-ghead"><b>${done ? '📣 응원 기운' : '✨ 윷 기운'}</b><span class="yt-gnum">${Math.min(got, need)} / ${need}</span>
      <span class="grow"></span><span class="chip yt-mine" title="내가 보탠 몫">⭐ 내 몫 ${contrib}</span></div>
      <div class="yt-gbar">${Array.from({ length: need }, (_, i) => `<i class="${i < got ? 'on' : ''}"></i>`).join('')}</div>
      <div class="yt-who"><small>${done ? '응원에 함께한 친구' : '이번 기운에 함께한 친구'}</small>
        <div class="yt-avs">${mem.map(pid => { const p = pl(pid); return `<span class="yt-av ${lit.has(pid) ? 'lit' : ''} ${p?.online === false ? 'off' : ''} ${pid === T.thrower && !done ? 'thr' : ''} ${pid === me ? 'me' : ''}" title="${esc(p?.name || '')}">${avatarHTML(p?.avatar, 'sm')}</span>`; }).join('')}</div></div>
      ${!done && T.next.length ? `<div class="yt-next">다음 기운 ${T.next.length}명 모였어요</div>` : ''}
      ${done ? '<div class="yt-next">맞히면 가장 뒤에 있는 모둠이 공짜로 한 번 던져요!</div>' : `<div class="yt-hint">서로 다른 친구 <b>${need}명</b>이 맞히면 윷을 던져요 · 같은 친구는 한 번만</div>`}`;
  }
  function optLabel(o) {
    if (o.at === S) return o.wait > 1 ? `출발 말 (기다리는 말 ${o.wait}개)` : '출발 말';
    return `${stName(o.at)} 말${o.pieces.length > 1 ? ` <b class="yt-up">업은 말 ${o.pieces.length}개</b>` : ''}`;
  }
  function routeHint(r) {
    const out = [];
    if (r.home) out.push('<b class="good">🏠 집 도착!</b>');
    else if (r.to === S) out.push('출발로 돌아가요');
    else out.push(`→ ${esc(stName(r.to))}`);
    if (r.catch) out.push('<b class="good">🎉 도깨비 잡기! 한 번 더</b>');
    if (r.stack) out.push('<b>🤝 업기</b>');
    if (r.friends?.length) out.push('🙌 함께 가요');
    if (!r.home && r.to !== S) out.push(`<small>집까지 ${r.left}칸</small>`);
    return out.join(' ');
  }
  function renderAct() {
    const T = myTeam();
    if (!T) { act.innerHTML = ''; sigAct = ''; return; }
    const amT = T.thrower === me, ch = T.choice;
    const sig = JSON.stringify([T.phase, T.thrower, T.readyBonus, ch && [ch.key, ch.asDo, ch.options, ch.single], sel, over, amT, nm(T.thrower)]);
    if (sig === sigAct) return; sigAct = sig;
    el.querySelector('.yt-s')?.classList.toggle('choosing', T.phase === 'choose' && amT && !over);
    if (over) { act.innerHTML = ''; return; }
    if (T.phase === 'done') {
      act.innerHTML = `<div class="sticker yt-banner done"><b>🎊 우리 모둠 말이 모두 집에 왔어요!</b><span>계속 맞혀서 친구 모둠에게 응원 기운을 보내요</span></div>`;
    } else if (T.phase === 'ready') {
      act.innerHTML = amT
        ? `<div class="sticker yt-banner me"><div class="yt-bt"><b>🎲 내가 던질 차례!</b><span>${T.readyBonus ? '한 번 더 던져요!' : '모둠 친구들이 기운을 모아 줬어요'}</span></div>
            <button class="btn lemon xl yt-throw" id="ys-throw">윷 던지기!</button><small class="yt-auto" id="ys-auto"></small></div>`
        : `<div class="sticker yt-banner"><b>🎲 ${esc(nm(T.thrower))} 차례예요!</b><span>다 같이 "윷이야!" 외쳐 봐요 · 그동안 문제를 풀면 다음 기운이 모여요</span></div>`;
      $('#ys-throw', act)?.addEventListener('click', async e => {
        const b = e.currentTarget; b.disabled = true; fx.light(b); ctx.sound.unlock?.();
        const r = await ctx.send('throw', {});
        if (r?.error) { ctx.toast(r.error); b.disabled = false; }
      });
    } else if (T.phase === 'choose' && ch) {
      const routes = o => o.routes.map(r => {
        const on = sel && sel.piece === o.piece && (o.routes.length === 1 || sel.route === r.route);
        return `<button class="yt-route ${on ? 'on' : ''} ${r.catch ? 'catch' : ''} ${r.home ? 'home' : ''}" data-p="${o.piece}" data-r="${r.route || ''}" ${amT ? '' : 'disabled'}>
          ${r.route ? `<span class="yt-rname">${r.route === 'short' ? '🏃 지름길' : '🚶 먼 길'}</span>` : ''}<span class="yt-rhint">${routeHint(r)}</span></button>`;
      }).join('');
      act.innerHTML = `<div class="sticker yt-choice ${amT ? 'me' : ''}">
        <div class="yt-chead"><span class="yt-res k-${esc(ch.key)}">${esc(resultText(ch.key, ch.asDo))}</span><span class="grow"></span><span class="pill yt-cd" id="ys-cd"></span></div>
        <div class="yt-talk">🗣️ 모둠과 의논해서 정해요${ch.single ? ' · 고를 것이 하나라 바로 움직여요' : ''}</div>
        <div class="yt-opts">${ch.options.map(o => `<div class="yt-opt ${o.routes.length > 1 ? 'fork' : ''}"><div class="yt-oname">${optLabel(o)}${o.routes.length > 1 ? ' <span class="yt-forkt">갈림길!</span>' : ''}</div><div class="yt-routes">${routes(o)}</div></div>`).join('')}</div>
        ${amT ? `<button class="btn mint lg yt-go" id="ys-go" ${sel && isComplete(sel, ch) ? '' : 'disabled'}>✔ 이렇게 옮기기</button>` : `<div class="yt-wait">👉 <b>${esc(nm(T.thrower))}</b>이(가) 모둠 의견을 듣고 정해요</div>`}</div>`;
      $$('.yt-route', act).forEach(b => b.addEventListener('click', () => choose(+b.dataset.p, b.dataset.r || null)));
      $('#ys-go', act)?.addEventListener('click', async e => {
        const b = e.currentTarget; if (!sel) return; b.disabled = true;
        const r = await ctx.send('move', { piece: sel.piece, route: sel.route ?? null });
        if (r?.error) { ctx.toast(r.error); b.disabled = false; }
      });
      tickCd();
    } else {
      act.innerHTML = `<div class="sticker yt-banner fill"><b>✨ 기운을 모아요!</b><span>다음 던지는 사람: <b>${esc(nm(T.thrower))}</b>${amT ? ' (나!)' : ''}</span></div>`;
    }
  }
  const isComplete = (s, ch) => { const o = ch.options.find(x => x.piece === s.piece); return !!o && (o.routes.length === 1 || !!s.route); };
  function showPreview() {
    const T = myTeam(), ch = T?.choice; if (!ch || !sel) { board.preview(null); return; }
    const o = ch.options.find(x => x.piece === sel.piece); if (!o) return board.preview(null);
    const r = o.routes.length === 1 ? o.routes[0] : o.routes.find(x => x.route === sel.route);
    board.preview(r ? r.trail : o.routes.flatMap(x => x.trail.slice(-1)), T.color);
  }
  function choose(piece, route) {
    const T = myTeam(); if (!T || T.thrower !== me || !T.choice) return;
    const o = T.choice.options.find(x => x.piece === piece); if (!o) return;
    sel = { piece, route: o.routes.length > 1 ? route : null };
    fx.light($('#ys-act', el)); ctx.sound.play('pick');
    ctx.send('pick', { piece, route: sel.route }).catch(() => {});
    sigAct = ''; renderAct(); showPreview();
  }
  function wireTap() {
    board.onTap = (k, i) => {
      const T = myTeam(); if (!T || k !== myK || T.phase !== 'choose' || T.thrower !== me) return;
      const o = T.choice.options.find(x => x.pieces.includes(i)); if (!o) return;
      choose(o.piece, o.routes.length > 1 ? (sel?.piece === o.piece ? sel.route : null) : null);
    };
  }
  wireTap();
  function tickCd() {
    const cd = $('#ys-cd', el); if (cd) { const l = Math.max(0, Math.ceil((choiceEnds - Date.now()) / 1000)); cd.textContent = `⏱ ${l}초`; cd.classList.toggle('hurry', l <= 5); }
    const au = $('#ys-auto', el); if (au) { const l = Math.max(0, Math.ceil((readyEnds - Date.now()) / 1000)); au.textContent = l <= 10 ? `${l}초 뒤에 자동으로 던져요` : ''; }
  }
  function waitCard(text) { qbox.innerHTML = `<div class="sticker yt-waitq"><div class="em">⏳</div>${esc(text)}</div>`; }
  function qLabel() {
    const T = myTeam();
    if (!T) return '❓ 문제';
    if (T.phase === 'done') return st.help.got.includes(me) ? '📣 응원에 함께했어요 · 다음 응원도!' : '📣 맞히면 응원 기운';
    if (T.phase === 'ready' && !T.readyBonus) return T.next.includes(me) ? '✨ 다음 기운에 함께했어요' : '✨ 맞히면 다음 기운';
    return T.gauge.includes(me) ? '🙌 이번 기운엔 함께했어요 · 친구를 도와줘요' : '✨ 맞히면 윷 기운';
  }
  async function loop() {
    while (alive) {
      if (over) { waitCard('결과를 기다려요…'); return; }
      const T = myTeam();
      if (!st || T?.phase === 'choose') {
        if (st) qbox.innerHTML = '';
        await new Promise(r => { wake = r; setTimeout(r, 1200); }); wake = null;
        continue;
      }
      qbox.innerHTML = '';
      const res = await ctx.quiz({ inline: true, container: qbox, label: qLabel(), okDelay: 650, onOpen: l => { openQuiz = l; } });
      openQuiz = null;
      if (!alive) return;
      if (res === null) await sleep(700);
    }
  }
  const clock = setInterval(() => { if (endsAt) $('#ys-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000); tickCd(); }, 250);
  const offs = [
    ctx.on('st', apply),
    ctx.on('gain', d => {
      contrib = d.contrib ?? contrib; sigGauge = ''; renderGauge();
      const g = $('.yt-gbar', gaugeEl) || gaugeEl;
      if (d.kind === 'gauge') fx.medium(g, '기운 +1!', '#E3A200');
      else if (d.kind === 'next') fx.float(g, '다음 기운 +1', '#8C6CFF');
      else if (d.kind === 'help') fx.medium(g, '응원 +1!', '#2ED3A0');
      else if (d.kind === 'dup') ctx.toast(d.help ? '이번 응원엔 이미 함께했어요. 다른 친구가 맞히도록 도와줘요!' : '이번 기운엔 이미 함께했어요! 친구가 맞히도록 도와줘요 🙌');
      else if (d.kind === 'full') ctx.toast('기운이 가득 찼어요! 윷을 던져요');
    }),
    ctx.on('ready', d => {
      if (d.team !== myK) return;
      if (d.thrower === me) { ctx.sound.play('open'); fx.stamp(d.bonus ? '한 번 더!' : '내 차례!', '#E3A200'); }
      else ctx.sound.play('join');
    }),
    ctx.on('throw', d => {
      if (d.team !== myK) return;
      tossBox.hidden = false; tossInto(tossBox, d, { label: `${esc(d.auto ? '자동 던지기' : nm(d.by))}` });
      ctx.sound.play('pick');
      setTimeout(() => {
        if (!alive) return;
        if (big2(d.key)) { fx.heavy(NAME[d.key] + '!', '#E3A200'); ctx.sound.play('win'); }
        else { fx.medium(tossBox, NAME[d.key] + '!', d.key === 'backdo' ? '#FF6F61' : '#1B2A4A'); }
      }, 1000);
      setTimeout(() => { if (alive) tossBox.hidden = true; }, 2300);
    }),
    ctx.on('pick', d => { if (d.team !== myK) return; const T = myTeam(); if (T?.thrower === me) return; sel = { piece: d.piece, route: d.route }; sigAct = ''; renderAct(); showPreview(); }),
    ctx.on('move', d => {
      sel = d.team === myK ? null : sel; if (d.team === myK) board.preview(null);
      board.move(d, () => ctx.sound.play('tick'));
      if (d.team !== myK) return;
      if (d.caught) setTimeout(() => { fx.heavy('도깨비 잡았다!', '#2ED3A0'); ctx.sound.play('win'); }, d.trail.length * 240);
      else if (d.home) setTimeout(() => { fx.medium(board.el, '🏠 집에 왔어요!', '#14A57A'); ctx.sound.play('coin'); }, d.trail.length * 240);
    }),
    ctx.on('dk', d => {
      board.dk(d, () => ctx.sound.play('tick'));
      const hit = d.bumped?.some(b => b.team === myK);
      if (hit) setTimeout(() => { fx.stamp('출발로 돌아가요', '#FF6F61'); fx.shake(board.el); ctx.sound.play('lose'); }, d.trail.length * 240);
      else if (d.lapDone && d.steps < d.goal) ctx.toast('도깨비 말이 한 바퀴를 돌았어요! 서둘러요');
    }),
    ctx.on('help', d => { if (d.to === myK) { fx.stamp('응원 도착!', '#2ED3A0'); ctx.sound.play('open'); ctx.toast('📣 다 온 모둠 친구들이 응원 기운을 보냈어요! 공짜로 한 번 던져요'); } }),
    ctx.on('result', d => {
      over = true; openQuiz?.closeQuiz?.();
      if (d.win) { fx.heavy('우리 반 승리!', '#2ED3A0'); ctx.sound.play('win'); } else ctx.sound.play('lose');
      overlay(el, d, st); wake?.();
    }),
    ctx.onRoom(() => { sigGauge = ''; renderGauge(); }),
  ];
  if (ctx.snapshot) { contrib = ctx.snapshot.me?.contrib || 0; apply(ctx.snapshot); }
  loop();
  return () => { alive = false; offs.forEach(f => f()); clearInterval(clock); openQuiz?.closeQuiz?.(); wake?.(); };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  el.innerHTML = `<div class="yt-t">
    <section class="sticker yt-main">
      <div class="yt-top"><h1>🎲 모둠 윷판 원정</h1><span class="grow"></span>
        <div class="yt-dkbox" id="yt-dk">${DK_SVG}<div><b>도깨비 말</b><div class="yt-dkbar"><i></i><span></span></div><small id="yt-dknext"></small></div></div>
        <span class="pill yt-time">⏱ <b id="yt-time">-</b></span></div>
      <div class="yt-stage">
        <div class="yt-col">
          <div class="sticker yt-last" id="yt-last"><p class="muted">윷 기운이 모이면 윷을 던져요!</p></div>
          <div class="sticker yt-rules"><b>규칙</b><span>도1 · 개2 · 걸3 · 윷4 · 모5 · 백도 −1</span><span>윷·모·도깨비 잡기 → 한 번 더</span><span>모서리·가운데에 서면 지름길!</span><span>다른 모둠 말은 함께 가요 🙌</span></div>
        </div>
        <div class="yt-boardwrap" id="yt-board"></div>
      </div>
    </section>
    <aside class="yt-side">
      <div class="yt-teams" id="yt-teams"></div>
      <div class="sticker yt-helpcard" id="yt-help" hidden></div>
      <div class="sticker yt-feed" id="yt-feed"></div>
      <div class="row"><span class="grow"></span><button class="btn coral lg" id="yt-end">🏁 지금 끝내기</button></div>
    </aside>
    <div class="yt-over" hidden></div></div>`;
  ctx.music.start(132);
  const board = makeBoard($('#yt-board', el), { big: true });
  let st = null, endsAt = 0, dkAt = 0, sig = '', lastSoundT = 0;
  const choiceEnds = new Map();
  const pl = pid => ctx.room?.players.find(p => p.pid === pid);
  const nm = pid => pl(pid)?.name || '';
  const PH = { fill: '✨ 기운 모으는 중', ready: '🎲 던질 차례!', choose: '🗣️ 의논 중', done: '🏠 모두 도착!' };
  function renderTeams() {
    if (!st) return;
    const s2 = JSON.stringify([st.teams.map(t => [t.phase, t.gauge, t.need, t.members, t.thrower, t.pieces.map(p => p.st), t.readyBonus, t.choice?.key, t.live]), (ctx.room?.players || []).map(p => p.pid + p.online + p.name).join()]);
    if (s2 === sig) return; sig = s2;
    $('#yt-teams', el).className = 'yt-teams n' + st.teams.length;
    $('#yt-teams', el).innerHTML = st.teams.map(T => {
      const lit = new Set(T.gauge), wait = T.pieces.filter(p => p.st === S).length, home = T.pieces.filter(p => p.st === H).length, on = T.pieces.length - wait - home;
      return `<div class="sticker yt-tcard ph-${T.phase} ${T.live ? '' : 'gone'}" style="--tc:${esc(T.color)}" data-k="${T.k}">
        <div class="yt-thead">${emblem(T)}<b class="yt-tname">${esc(T.name)}</b><span class="yt-ph">${PH[T.phase] || ''}${T.phase === 'choose' ? ` <em class="yt-tcd" data-k="${T.k}"></em>` : ''}</span></div>
        ${T.phase === 'done' ? '' : `<div class="yt-dots">${T.members.map(pid => `<i class="${lit.has(pid) ? 'on' : ''} ${pl(pid)?.online === false ? 'off' : ''}"></i>`).join('')}<span>${T.gauge.length} / ${T.need}</span></div>`}
        <div class="yt-tfoot"><span class="yt-pcs">${'<i class="w"></i>'.repeat(wait)}${'<i class="b"></i>'.repeat(on)}${'<i class="h">★</i>'.repeat(home)}</span>
          ${T.phase !== 'done' && T.thrower ? `<span class="yt-thr">🎲 ${esc(nm(T.thrower))}</span>` : ''}</div></div>`;
    }).join('');
    wireImgs($('#yt-teams', el));
  }
  function renderHelp() {
    const any = st?.teams.some(t => t.phase === 'done') && st.teams.some(t => t.phase !== 'done');
    const box = $('#yt-help', el); box.hidden = !any; if (!any) return;
    const hs = st.help.got.length + '/' + st.help.need; if (box.dataset.sig === hs) return; box.dataset.sig = hs;
    box.innerHTML = `<b>📣 응원 기운</b><div class="yt-gbar">${Array.from({ length: st.help.need }, (_, i) => `<i class="${i < st.help.got.length ? 'on' : ''}"></i>`).join('')}</div><small>다 온 모둠 친구들이 맞히면 가장 뒤에 있는 모둠이 공짜로 던져요</small>`;
  }
  function renderFeed() {
    $('#yt-feed', el).innerHTML = (ctx.feed || []).slice(-5).reverse().map(f => `<div>${esc(f.text)}</div>`).join('') || '<div class="muted">모둠 소식이 여기에 나와요</div>';
  }
  function apply(s) {
    if (!s?.teams) return;
    st = s; board.apply(s);
    endsAt = Date.now() + s.timeLeft; dkAt = Date.now() + s.dk.nextLeft;
    const r = Math.min(1, s.dk.steps / s.dk.goal);
    $('.yt-dkbar i', el).style.transform = `scaleX(${r})`;
    $('.yt-dkbar span', el).textContent = `${Math.min(2, s.dk.lap)} / ${s.laps}바퀴`;
    $('#yt-dk', el).classList.toggle('near', r >= .75);
    for (const T of s.teams) if (T.choice) choiceEnds.set(T.k, Date.now() + T.choice.left); else choiceEnds.delete(T.k);
    renderTeams(); renderHelp();
    if (s.last && !$('#yt-last', el).dataset.t) showLast(s.last, false);
  }
  function showLast(d, anim = true) {
    const box = $('#yt-last', el); box.dataset.t = d.t || Date.now();
    const T = d.team === 'dk' ? null : st?.teams.find(t => t.k === d.team);
    const label = T ? `${emblem(T, 'sm')} ${esc(T.name)}${d.by ? ` · ${esc(nm(d.by))}` : ''}` : `<span class="yt-dkmini">${DK_SVG}</span> 도깨비 말`;
    if (anim) tossInto(box, d, { label });
    else { box.innerHTML = `<div class="yt-tlabel">${label}</div>${sticksHTML(d.sticks, false)}<div class="yt-tword k-${esc(d.key)}">${esc(resultText(d.key, d.asDo))}</div>`; box.classList.add('done'); wireImgs(box); }
    box.style.setProperty('--tc', T ? T.color : '#8C6CFF');
  }
  const clock = setInterval(() => {
    if (endsAt) { const left = (endsAt - Date.now()) / 1000; $('#yt-time', el).textContent = fmtSec(left); $('#yt-time', el).parentElement.classList.toggle('hurry', left < 60); }
    if (dkAt && st && !st.over) $('#yt-dknext', el).textContent = `다음 던지기 ${Math.max(0, Math.ceil((dkAt - Date.now()) / 1000))}초`;
    $$('.yt-tcd', el).forEach(e => { const t = choiceEnds.get(+e.dataset.k); e.textContent = t ? Math.max(0, Math.ceil((t - Date.now()) / 1000)) + '초' : ''; });
  }, 250);
  $('#yt-end', el).addEventListener('click', () => { if (confirm('윷판 원정을 지금 끝낼까요?')) ctx.end(); });
  const snd = () => { if (Date.now() - lastSoundT > 120) { lastSoundT = Date.now(); ctx.sound.play('tick'); } };
  const offs = [
    ctx.on('st', apply),
    ctx.on('throw', d => {
      showLast({ ...d, team: d.team, t: Date.now() });
      ctx.sound.play('pick');
      const T = st?.teams.find(t => t.k === d.team);
      setTimeout(() => { if (big2(d.key)) { fx.stamp(`${T?.name || ''} ${NAME[d.key]}!`, '#E3A200'); ctx.sound.play('go'); } }, 1000);
    }),
    ctx.on('move', d => {
      board.move(d, snd);
      const T = st?.teams.find(t => t.k === d.team), wait = d.trail.length * 300;
      if (d.caught) setTimeout(() => { fx.heavy(`${T?.name || ''} 도깨비 잡았다!`, '#2ED3A0'); ctx.sound.play('win'); }, wait);
      else if (d.home) setTimeout(() => { board.flash(0); ctx.sound.play('coin'); }, wait);
    }),
    ctx.on('dk', d => {
      showLast({ team: 'dk', key: d.key, sticks: d.sticks, t: Date.now() });
      board.dk(d, snd, 900);
      if (d.bumped?.length) setTimeout(() => { fx.stamp('출발로 돌아가요!', '#FF6F61'); fx.shake(board.el); ctx.sound.play('steal'); }, 900 + d.trail.length * 300);
      if (big2(d.key)) setTimeout(() => fx.stamp(`도깨비 ${NAME[d.key]}!`, '#8C6CFF'), 1000);
    }),
    ctx.on('help', d => { const T = st?.teams.find(t => t.k === d.to); fx.stamp(`📣 ${T?.name || ''} 응원!`, '#2ED3A0'); ctx.sound.play('open'); }),
    ctx.on('result', d => {
      if (d.win) { fx.heavy('우리 반 승리!', '#2ED3A0'); ctx.sound.play('win'); } else ctx.sound.play('lose');
      overlay(el, d, st);
    }),
    ctx.onRoom(() => { sig = ''; renderTeams(); }),
    ctx.onFeed(renderFeed),
  ];
  if (ctx.snapshot) apply(ctx.snapshot);
  renderFeed();
  return () => { offs.forEach(f => f()); clearInterval(clock); ctx.music.stop(); };
}
