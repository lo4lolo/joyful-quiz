// 🌸 무궁화 꽃이 피었습니다: 술래가 노래할 때만 답하고, 모둠 말은 "서로 다른 친구 수"만큼 나아간다 (서버: server/modes/mugunghwa.js)
import { $, $$, esc, h, avatarHTML, fmtSec, sleep } from '../common.js';
import { fx, setMuted } from '../fx.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/mugunghwa.css">')); } };
export const SYL = ['무', '궁', '화', '꽃', '이', '피', '었', '습', '니', '다'];
const SPEED_TXT = { slow: '느리게', normal: '보통', fast: '빠르게' };
const ART = 'assets/trad/';

// 그림: 불러오면 .ok (그림 보임), 못 불러오면 .noimg (이모지·CSS 대체). 이미 실패한 그림도 잡는다.
function wireImgs(root) {
  for (const img of $$('img.mg-img:not([data-w])', root)) {
    img.dataset.w = '1';
    const box = img.closest('.mg-imgbox') || img.parentElement;
    const ok = () => box.classList.add('ok'), bad = () => box.classList.add('noimg');
    if (img.complete) { if (img.naturalWidth > 0) ok(); else if (img.src) bad(); }
    img.addEventListener('load', ok, { once: true });
    img.addEventListener('error', bad, { once: true });
  }
}
const emblem = (T, cls = '') => `<span class="mg-imgbox mg-emb ${cls}" style="--tc:${esc(T.color)}"><img class="mg-img" src="${ART}team_${esc(T.id)}.webp" alt="" draggable="false"><b>${esc(T.emoji)}</b></span>`;
const sulaeHTML = () => `<div class="mg-sulae"><div class="mg-sbob">
  <div class="mg-blob"><i class="horn l"></i><i class="horn r"></i><span class="b">🙈</span><span class="l">👀</span></div>
  <span class="mg-imgbox mg-sart"><img class="mg-img back" src="${ART}sulae_back.webp" alt="술래" draggable="false"></span>
  <span class="mg-imgbox mg-sart look"><img class="mg-img" src="${ART}sulae_look.webp" alt="" draggable="false"></span></div>
  <div class="mg-sshadow"></div></div>`;

// ---------- 마당 길 (모둠 말들) ----------
function trackHTML(big, side = '') {
  return `<div class="mg-track ${big ? 'big' : ''}"><div class="mg-lanes"></div>
    <div class="mg-goal"><span class="mg-imgbox mg-rope"><img class="mg-img" src="${ART}finish_rope.webp" alt="" draggable="false"></span></div>
    <div class="mg-sulaebox">${sulaeHTML()}${side}</div></div>`;
}
// 길 옆 모둠 이름표 (TV): 남은 걸음 / 술래 치기 / 도착 + 이번 노래에 맞힌 친구 점
function laneInfo(T, D, got) {
  const need = T.mercy ? Math.max(1, T.online - 1) : T.online;
  const st = T.arrived ? '🏁 도착! 손 내밀기' : T.tag ? `🎯 술래 치기 <b>${got}</b>/${need}` : `술래까지 <b>${Math.max(0, D - T.pos)}</b>걸음`;
  const n = Math.min(Math.max(T.online, got), 10);
  return `<span class="mg-lst">${st}</span>${T.arrived ? '' : `<span class="mg-dots">${Array.from({ length: n }, (_, k) => `<i class="${k < got ? 'on' : ''}"></i>`).join('')}</span>`}`;
}
function trackUI(root, { mine = () => null } = {}) {
  const lanes = $('.mg-lanes', root), sulae = $('.mg-sulae', root);
  const known = new Map(); // i → {el, pos}
  wireImgs(root);
  const laneOf = i => known.get(i)?.el;
  function ensure(T) {
    if (known.has(T.i)) return known.get(T.i);
    const el = h(`<div class="mg-lane" data-i="${T.i}" style="--tc:${esc(T.color)};--p:0">
      <span class="mg-lname">${emblem(T, 'sm')}<span class="mg-lt"><em>${esc(T.name)}</em><small class="mg-linfo"></small></span></span>
      <div class="mg-run"><i class="mg-trail"></i><span class="mg-tok"><span class="mg-hop">${emblem(T)}</span><b class="mg-tag" hidden></b></span></div></div>`);
    lanes.append(el); wireImgs(el);
    const k = { el, pos: -1 }; known.set(T.i, k); return k;
  }
  return {
    sulae,
    update(teams, D, animate = true, cur = null) {
      if (!Array.isArray(teams) || !D) return;
      const my = mine();
      for (const T of teams) {
        if (!T?.active) { if (known.has(T?.i)) { known.get(T.i).el.remove(); known.delete(T.i); } continue; }
        const k = ensure(T), el = k.el, p = Math.max(0, Math.min(1, T.pos / D));
        el.style.setProperty('--p', p.toFixed(4));
        el.classList.toggle('mine', T.i === my);
        el.classList.toggle('tag', !!T.tag && !T.arrived);
        el.classList.toggle('arrived', !!T.arrived);
        const tag = $('.mg-tag', el);
        tag.hidden = !(T.arrived || T.tag);
        tag.textContent = T.arrived ? '🚩 도착' : T.tag ? '🎯 술래 치기' : '';
        if (animate && k.pos >= 0 && T.pos > k.pos) { const hp = $('.mg-hop', el); hp.classList.remove('go'); void hp.offsetWidth; hp.classList.add('go'); }
        k.pos = T.pos;
        if (cur) $('.mg-linfo', el).innerHTML = laneInfo(T, D, (cur[T.i] || []).length);
      }
    },
    tok: i => $('.mg-tok', laneOf(i) || document.createElement('div')),
    lane: laneOf,
    puff(i, text, cls = '') {
      const el = laneOf(i); if (!el) return;
      const f = document.createElement('span'); f.className = 'mg-puff ' + cls; f.textContent = text;
      $('.mg-run', el).append(f); setTimeout(() => f.remove(), 1400);
    },
    look(on) {
      if (!sulae || sulae.classList.contains('look') === on) return;
      sulae.classList.toggle('look', on); sulae.classList.remove('turn'); void sulae.offsetWidth; sulae.classList.add('turn');
    },
  };
}

// ---------- 노래 글자 ----------
function chantUI(box) {
  box.innerHTML = SYL.map((s, i) => `<span class="${i === 4 || i === 9 ? 'gap' : ''}">${s}</span>`).join('');
  const spans = $$('span', box);
  return {
    draw(marks, elapsed) { spans.forEach((s, i) => s.classList.toggle('on', !marks || elapsed >= marks[i])); },
    clear() { spans.forEach(s => s.classList.remove('on')); },
    full() { spans.forEach(s => s.classList.add('on')); },
  };
}

// 서버 단계(ms 남음)를 이 기기 시계로 바꿔 들고 있기
function clock() {
  const s = { phase: 'ready', ends: 0, chant: null, chantAt: 0, round: 0, D: 0, timeEnds: 0, speed: 'normal' };
  return {
    s,
    set(d) {
      const now = Date.now();
      if (d.phase) s.phase = d.phase;
      if (typeof d.left === 'number') s.ends = now + d.left;
      if (d.phase === 'green') { s.chant = d.chant || null; s.chantAt = d.chant ? s.ends - d.chant.dur : now; }
      else if (d.phase) s.chant = null;
      if (typeof d.round === 'number') s.round = d.round;
      if (d.D) s.D = d.D;
      if (typeof d.timeLeft === 'number') s.timeEnds = now + d.timeLeft;
      if (d.speed) s.speed = d.speed;
    },
    elapsed: () => Date.now() - s.chantAt,
    left: () => Math.max(0, s.ends - Date.now()),
    // 마지막 '다'가 나오면 (돌아보기 0.2초 전) 미리 멈춘다
    daDone: () => s.phase === 'green' && !!s.chant && Date.now() - s.chantAt >= s.chant.marks[s.chant.marks.length - 1],
  };
}
function overlay(el, d, teams) {
  const o = $('.mg-over', el);
  const list = (teams || d.teams || []).filter(T => T.active);
  o.innerHTML = `<div class="mg-overcard sticker ${d.win ? 'win' : ''}"><div class="em">${d.win ? '🎉' : '⏰'}</div>
    <h2>${esc(d.text || (d.win ? '우리 반 모두 도착!' : '다음엔 꼭!'))}</h2>
    <p>${d.win ? '모든 모둠이 술래를 쳤어요. 함께 해냈어요!' : `${d.arrived | 0} / ${d.total | 0} 모둠이 도착했어요. 다음엔 다 함께!`}</p>
    <div class="mg-overteams">${list.map(T => `<span class="mg-overteam ${T.arrived ? 'ok' : ''}">${emblem(T, 'sm')}${esc(T.name)} ${T.arrived ? '🚩' : '👣'}</span>`).join('')}</div></div>`;
  wireImgs(o);
  o.hidden = false;
}

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  setMuted(!ctx.sound.on);
  el.innerHTML = `<div class="mg-s">
    <section class="mg-strip sticker">
      <div class="mg-striphead"><b class="mg-title">🌸 무궁화 꽃이 피었습니다</b><span class="grow"></span>
        <span class="pill mg-mysteps" title="내 발자국 (내가 보탠 걸음)">👣 <b>0</b></span><span class="pill">⏱ <b class="mg-time">-</b></span></div>
      ${trackHTML(false)}
    </section>
    <div class="mg-body">
      <div class="mg-left">
        <section class="mg-banner ready" role="status" aria-live="polite">
          <div class="mg-bicon" aria-hidden="true">🌸</div>
          <div class="mg-btext"><b class="mg-bmain">준비~</b><span class="mg-bsub">술래가 나무 앞에 섰어요</span></div>
          <div class="mg-chant"></div><div class="mg-pbar"><i></i></div>
        </section>
        <section class="mg-team sticker"></section>
      </div>
      <section class="mg-q">
        <div class="mg-qslot"></div>
        <div class="mg-freeze" hidden><span>👀 술래가 보고 있어요!<br>멈춰요 🤫</span></div>
        <div class="mg-skiprow"><button class="btn sm ghost mg-skip" hidden>🤔 모르겠어요 · 다음 문제</button></div>
      </section>
    </div>
    <div class="mg-over" hidden></div></div>`;
  const C = clock(), S = C.s;
  const banner = $('.mg-banner', el), chant = chantUI($('.mg-chant', banner)), qbox = $('.mg-q', el), slot = $('.mg-qslot', el), freeze = $('.mg-freeze', el), skip = $('.mg-skip', el);
  let teams = [], cur = [], meS = { team: null, steps: 0, contrib: 0, helps: 0, counted: false }, over = false, alive = true, openQuiz = null, curQ = null, qShownAt = 0, frozen = false, lastBanner = '';
  const myTeam = () => { const p = ctx.room?.players?.find(x => x.pid === ctx.me.pid); return Number.isInteger(p?.team) ? p.team : meS.team; };
  const track = trackUI($('.mg-strip', el), { mine: myTeam });
  const T = i => teams.find(x => x.i === i);

  function setMe(m) {
    if (!m) return;
    const old = meS.steps; meS = { ...meS, ...m };
    const b = $('.mg-mysteps', el); $('b', b).textContent = meS.steps;
    if (meS.steps !== old) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }
  function teamCard() {
    const box = $('.mg-team', el), my = myTeam(), t = T(my);
    if (!t) { box.innerHTML = '<p class="mg-tline">모둠을 기다려요…</p>'; return; }
    const ms = (ctx.room?.players || []).filter(p => p.team === my);
    const got = new Set(cur[my] || []);
    const on = ms.filter(p => p.online), n = ms.filter(p => got.has(p.pid)).length;
    const missing = on.filter(p => !got.has(p.pid));
    let head;
    if (t.arrived) head = `<b class="mg-thead2">🏁 도착!</b> 이제 <b>손 내밀기</b>: 맞히면 가장 뒤에 있는 모둠이 한 걸음! <span class="chip">🤝 ${meS.helps | 0}번</span>`;
    else if (t.tag) head = `<b class="mg-thead2">🎯 술래 치기!</b> 이번 노래에 ${t.mercy ? '<b>한 명 빼고</b> ' : ''}모두 한 번씩 맞혀요 · <b>${n}</b>/${on.length}명
      ${missing.length && S.phase === 'green' ? `<span class="mg-need">아직: ${missing.map(p => esc(p.name)).join(', ')}</span>` : ''}`;
    else head = `<b class="mg-thead2">${emblem(t, 'xs')} ${esc(t.name)} 모둠</b> 이번 노래에 <b class="mg-n">${n}</b>명 함께!${on.length > 1 ? ` <small>(모두 맞히면 💞 한마음 +1)</small>` : ''}`;
    box.style.setProperty('--tc', t.color);
    box.className = 'mg-team sticker' + (t.arrived ? ' arrived' : t.tag ? ' tag' : '');
    box.innerHTML = `<p class="mg-tline">${head}</p>
      <div class="mg-mems">${ms.map(p => `<span class="mg-mem ${got.has(p.pid) ? 'on' : ''} ${p.online ? '' : 'off'} ${p.pid === ctx.me.pid ? 'me' : ''}">${avatarHTML(p.avatar, 'sm')}<small>${esc(p.name)}</small></span>`).join('')}</div>
      <p class="mg-left2">술래까지 <b>${Math.max(0, (S.D || 0) - t.pos)}</b>걸음</p>`;
    wireImgs(box);
  }
  function setBanner() {
    const key = S.phase + ':' + S.round + ':' + (over ? 1 : 0);
    if (key === lastBanner) return;
    lastBanner = key;
    banner.className = 'mg-banner ' + (over ? 'over' : S.phase);
    const [icon, main, sub] = over ? ['🏁', '끝!', '결과를 봐요']
      : S.phase === 'green' ? ['🙈', '노래 중! 지금 풀어요', '술래가 노래하는 동안에만 답이 돼요']
      : S.phase === 'red' ? ['👀', '술래가 보고 있어요!', '멈춰요 🤫 화면을 누르지 마요']
      : ['🌸', '준비~', '술래가 나무 앞에 섰어요. 문제를 먼저 읽어 둬요'];
    $('.mg-bicon', banner).textContent = icon; $('.mg-bmain', banner).textContent = main; $('.mg-bsub', banner).textContent = sub;
    if (S.phase === 'green') chant.clear(); else if (S.phase === 'red') chant.full(); else chant.clear();
  }
  function setPhase(d) {
    const prev = S.phase, prevRound = S.round;
    C.set(d);
    if (S.phase === 'green' && (prev !== 'green' || S.round !== prevRound)) { cur = teams.map(() => []); meS.counted = false; teamCard(); }
    if (S.phase === 'red' && prev !== 'red') { track.look(true); ctx.sound.play('steal'); }
    if (S.phase !== 'red') track.look(false);
    setBanner(); teamCard();
  }
  // 멈춤: 돌아봄·준비 때, 그리고 노래의 마지막 '다'가 나온 뒤
  let freezeKey = '';
  function setFrozen(f) {
    const key = f ? (over ? 'over' : S.phase) : '';
    if (key !== freezeKey) {
      freezeKey = key;
      $('span', freeze).innerHTML = over ? '🏁 끝!' : S.phase === 'ready' ? '🌸 곧 시작해요!<br>문제를 읽어 둬요' : S.phase === 'green' ? '🤫 "다!" 멈춰요' : '👀 술래가 보고 있어요!<br>멈춰요 🤫';
    }
    if (f === frozen) return;
    frozen = f;
    qbox.classList.toggle('frozen', f);
    freeze.hidden = !f;
  }
  let tapAt = 0, dupRound = -1;
  async function tapped() {
    fx.shake(freeze);
    if (S.phase !== 'red' || Date.now() - tapAt < 800) return;
    tapAt = Date.now();
    const r = await ctx.send('tap', {});
    if (r?.caught) { setMe(r.me); oops(); }
  }
  function oops() {
    banner.classList.remove('caught'); void banner.offsetWidth; banner.classList.add('caught');
    ctx.toast('앗, 들켰다! 🤭 내 발자국 한 걸음 뒤로. 다음 노래에 다시!');
  }
  // 멈춘 동안 답 버튼·입력 막기 (누르면 살짝 흔들리고 '들켰다')
  const block = e => { if (!frozen || !e.target.closest?.('.mg-q')) return; e.preventDefault(); e.stopPropagation(); if (e.type === 'pointerdown') tapped(); };
  qbox.addEventListener('pointerdown', block, true); qbox.addEventListener('click', block, true); qbox.addEventListener('submit', block, true);
  const onKey = e => { if (!frozen || !curQ) return; if (e.key === 'Enter' || (curQ.choices && '1234'.includes(e.key) && e.key.length === 1)) { e.preventDefault(); e.stopImmediatePropagation(); tapped(); } };
  window.addEventListener('keydown', onKey, true);

  skip.addEventListener('click', async () => {
    if (frozen || !curQ) return;
    const v = curQ; skip.hidden = true;
    const r = await ctx.answer(v.qid, '');
    if (r && !r.error) ctx.toast(`정답은 "${r.correct}" 이에요. 다음 문제!`, 2600);
    openQuiz?.closeQuiz?.();
  });
  function waitCard(text) { slot.innerHTML = `<div class="mg-wait sticker"><div class="em">🌸</div>${esc(text)}</div>`; }
  async function loop() {
    while (alive) {
      if (over) { waitCard('결과를 기다려요…'); return; }
      const v = await ctx.ask();
      if (!alive) return;
      if (!v) { if (!over) waitCard('잠깐만요…'); await sleep(900); continue; }
      slot.innerHTML = ''; curQ = v; qShownAt = Date.now(); skip.hidden = true;
      await ctx.showQuiz({ ...v, time: 0 }, { inline: true, container: slot, label: '🌸 노래할 때 답해요', okDelay: 700,
        onOpen: l => { openQuiz = l; }, onAnswer: g => { skip.hidden = true; return ctx.answer(v.qid, g); } });
      openQuiz = null; curQ = null; skip.hidden = true;
      if (!alive) return;
    }
  }
  const tick = setInterval(() => {
    if (!alive) return;
    if (S.phase === 'green' && S.chant) chant.draw(S.chant.marks, C.elapsed());
    const dur = S.phase === 'green' ? (S.chant?.dur || 6000) : S.phase === 'red' ? 3000 : 3000;
    $('.mg-pbar i', banner).style.transform = `scaleX(${Math.min(1, C.left() / dur)})`;
    if (S.timeEnds) $('.mg-time', el).textContent = fmtSec((S.timeEnds - Date.now()) / 1000);
    setFrozen(over || S.phase !== 'green' || C.daDone());
    skip.hidden = !(curQ && !frozen && Date.now() - qShownAt > 15000);
  }, 50);

  const offs = [
    ctx.on('phase', d => { if (d.teams) { teams = d.teams; track.update(teams, d.D || S.D, false); } setPhase(d); }),
    ctx.on('board', d => {
      if (d.phase !== S.phase || d.round !== S.round) setPhase(d); else C.set({ timeLeft: d.timeLeft, D: d.D, left: d.left });
      teams = d.teams || teams; cur = d.cur || cur; track.update(teams, S.D); teamCard();
    }),
    ctx.on('prog', d => {
      if (d.round !== S.round) return;
      cur = d.cur || cur; teamCard();
      for (const x of d.helps || []) track.puff(x.to, '🤝 +1', 'help');
    }),
    ctx.on('move', d => {
      teams = d.teams || teams; track.update(teams, S.D);
      for (const mv of d.moves || []) {
        if (mv.steps > 0) track.puff(mv.i, `+${mv.steps}${mv.all && T(mv.i)?.members > 1 ? ' 💞' : ''}`, 'step');
        if (mv.i === myTeam()) {
          if (mv.all && mv.steps > 0 && T(mv.i)?.members > 1) fx.stamp('한마음!', '#FF6F91');
          else if (mv.steps > 0) fx.float(track.tok(mv.i), `+${mv.steps}걸음`, '#14A57A');
          if (mv.tag && mv.steps > 0) ctx.toast('🎯 술래 앞이에요! 이번엔 모둠 모두 한 번씩 맞혀야 술래를 쳐요');
        }
      }
      teamCard();
    }),
    ctx.on('arrive', d => {
      teams = d.teams || teams; track.update(teams, S.D); teamCard();
      if (d.i === myTeam()) { fx.stamp('도착!', d.color || '#2ED3A0'); ctx.sound.play('win'); ctx.toast('이제 맞히면 뒤에 있는 모둠에게 한 걸음을 줄 수 있어요 🤝', 3200); }
      else ctx.toast(`🏁 ${d.emoji || ''} ${d.name} 모둠 도착!`);
    }),
    ctx.on('oops', d => track.puff(d.team, '들켰다! 🤭', 'oops')),
    ctx.on('ans', d => {
      setMe(d.me);
      const tok = track.tok(myTeam());
      if (d.state === 'counted' || d.state === 'tag') { fx.medium($('.mg-team', el), '+1 👣', '#14A57A'); }
      else if (d.state === 'dup') { if (dupRound !== S.round) { dupRound = S.round; ctx.toast('이번 노래엔 벌써 보탰어요! 친구를 응원해요 📣'); } }
      else if (d.state === 'help') { const to = T(d.to); fx.medium(tok, `🤝 ${to ? to.name : ''} +1`, '#3D8BFF'); }
      else if (d.state === 'caught') oops();
      else if (d.state === 'early') ctx.toast('아직 시작 전이에요. 술래가 노래하면 답해요!');
      else if (d.state === 'cheer') ctx.toast('정답! 친구 모둠을 응원해요 📣');
      teamCard();
    }),
    ctx.on('speed', d => C.set({ speed: d.speed })),
    ctx.on('result', d => {
      over = true; openQuiz?.closeQuiz?.(); setBanner(); setFrozen(true);
      teams = d.teams || teams; track.update(teams, S.D);
      if (d.win) { fx.heavy('우리 반 승리!', '#2ED3A0'); ctx.sound.play('win'); } else ctx.sound.play('lose');
      overlay(el, d, teams);
    }),
    ctx.onRoom(() => teamCard()),
  ];
  const s0 = ctx.snapshot;
  if (s0) {
    teams = s0.teams || []; cur = s0.cur || []; setMe(s0.me);
    C.set(s0); track.update(teams, s0.D, false);
    if (s0.over) over = true;
  }
  setPhase(s0 || {}); setFrozen(true);
  loop();
  return () => {
    alive = false; offs.forEach(f => f()); clearInterval(tick); openQuiz?.closeQuiz?.();
    window.removeEventListener('keydown', onKey, true);
  };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  el.innerHTML = `<div class="mg-t">
    <div class="mg-thead">
      <h1>🌸 무궁화 꽃이 피었습니다</h1><span class="pill mg-round">🎵 <b>0</b>번째 노래</span>
      <span class="mg-speed" role="group" aria-label="술래 속도"><span>🔁 술래 속도</span>${Object.entries(SPEED_TXT).map(([k, v]) => `<button class="chip ${k === 'normal' ? 'on' : ''}" data-v="${k}">${v}</button>`).join('')}</span>
      <span class="grow"></span><span class="pill mg-ttime">⏱ <b>-</b></span><button class="btn coral" id="mg-end">🏁 지금 끝내기</button>
    </div>
    <section class="mg-stage sticker ready">
      <div class="mg-chantbar"><div class="mg-chant big"></div><div class="mg-callout" hidden></div></div>
      <div class="mg-field">${trackHTML(true, '<div class="mg-feed"><h3>📣 소식</h3><ul></ul></div>')}</div>
    </section>
    <div class="mg-over" hidden></div></div>`;
  const C = clock(), S = C.s;
  const stage = $('.mg-stage', el), chant = chantUI($('.mg-chant', stage)), callout = $('.mg-callout', stage);
  const track = trackUI(stage);
  let teams = [], cur = [], over = false, lastSound = 0;
  const T = i => teams.find(x => x.i === i);
  const cards = () => track.update(teams, S.D, false, cur);
  function setStage() {
    stage.classList.remove('ready', 'green', 'red', 'over');
    stage.classList.add(over ? 'over' : S.phase);
    $('.mg-round b', el).textContent = S.round;
  }
  function setPhase(d) {
    const prev = S.phase, prevRound = S.round;
    C.set(d);
    if (S.phase === 'green' && (prev !== 'green' || S.round !== prevRound)) {
      cur = teams.map(() => []); chant.clear(); callout.hidden = true; track.look(false);
      ctx.music.stop(); if (!over) ctx.music.start(S.chant && S.chant.dur < 5000 ? 190 : 150);
      cards();
    } else if (S.phase === 'red' && prev !== 'red') {
      ctx.music.stop(); chant.full(); track.look(true); ctx.sound.play('steal');
      callout.textContent = '👀 돌아봤다! 멈춰요 🤫'; callout.hidden = false; callout.classList.remove('pop'); void callout.offsetWidth; callout.classList.add('pop');
    } else if (S.phase === 'ready') {
      ctx.music.stop(); callout.textContent = '🌸 술래가 나무 앞에 섰어요. 준비~'; callout.hidden = false;
    }
    if (S.phase !== 'red') track.look(false);
    setStage();
    $$('.mg-speed .chip', el).forEach(b => b.classList.toggle('on', b.dataset.v === S.speed));
  }
  function feedAdd(f) {
    const ul = $('.mg-feed ul', el);
    ul.prepend(h(`<li>${esc(f.text)}</li>`));
    while (ul.children.length > 7) ul.lastElementChild.remove();
  }
  (ctx.feed || []).slice(-7).forEach(feedAdd);
  $('#mg-end', el).addEventListener('click', () => { if (confirm('무궁화 꽃이 피었습니다를 지금 끝낼까요?')) ctx.end(); });
  $$('.mg-speed .chip', el).forEach(b => b.addEventListener('click', async () => {
    const r = await ctx.send('speed', { v: b.dataset.v });
    if (r?.ok) { C.set({ speed: r.speed }); $$('.mg-speed .chip', el).forEach(x => x.classList.toggle('on', x.dataset.v === r.speed)); fx.light(b); ctx.toast(`다음 노래부터 술래 속도 ${SPEED_TXT[r.speed]}`); }
    else ctx.toast('지금은 바꿀 수 없어요');
  }));
  const tick = setInterval(() => {
    if (S.phase === 'green' && S.chant) chant.draw(S.chant.marks, C.elapsed());
    if (S.timeEnds) { const left = (S.timeEnds - Date.now()) / 1000; $('.mg-ttime b', el).textContent = fmtSec(left); $('.mg-ttime', el).classList.toggle('hurry', left < 60 && !over); }
  }, 50);
  const offs = [
    ctx.on('phase', d => { if (d.teams) { teams = d.teams; track.update(teams, d.D || S.D, false); } setPhase(d); cards(); }),
    ctx.on('board', d => {
      if (d.phase !== S.phase || d.round !== S.round) setPhase(d); else C.set({ timeLeft: d.timeLeft, D: d.D, left: d.left });
      teams = d.teams || teams; cur = d.cur || cur; track.update(teams, S.D, true, cur);
    }),
    ctx.on('prog', d => {
      if (d.round !== S.round) return;
      const before = cur.map(x => (x || []).length);
      cur = d.cur || cur; cards();
      cur.forEach((x, i) => { const add = (x || []).length - (before[i] || 0); if (add > 0 && !T(i)?.arrived) track.puff(i, '👣'.repeat(Math.min(add, 3)), 'foot'); });
      for (const x of d.helps || []) track.puff(x.to, '🤝 +1', 'help');
      if ((d.helps || []).length && Date.now() - lastSound > 400) { lastSound = Date.now(); ctx.sound.play('coin'); }
    }),
    ctx.on('move', d => {
      teams = d.teams || teams; track.update(teams, S.D); cards();
      let any = false;
      for (const mv of d.moves || []) {
        if (mv.steps > 0) { any = true; track.puff(mv.i, `+${mv.steps}걸음${mv.all && T(mv.i)?.members > 1 ? ' 💞한마음' : ''}`, 'step big'); }
      }
      if (any) ctx.sound.play('pick');
    }),
    ctx.on('arrive', d => {
      teams = d.teams || teams; track.update(teams, S.D); cards();
      fx.stamp(`${d.name} 도착!`, d.color || '#2ED3A0'); ctx.sound.play('open');
    }),
    ctx.on('oops', d => { track.puff(d.team, '들켰다! 🤭', 'oops big'); if (Date.now() - lastSound > 300) { lastSound = Date.now(); ctx.sound.play('wrong'); } }),
    ctx.on('speed', d => { C.set({ speed: d.speed }); $$('.mg-speed .chip', el).forEach(x => x.classList.toggle('on', x.dataset.v === d.speed)); }),
    ctx.on('result', d => {
      over = true; ctx.music.stop(); setStage(); callout.hidden = true;
      teams = d.teams || teams; track.update(teams, S.D); cards();
      if (d.win) { fx.heavy('우리 반 승리!', '#2ED3A0'); ctx.sound.play('win'); } else ctx.sound.play('lose');
      overlay(el, d, teams);
    }),
    ctx.onFeed(feedAdd),
    ctx.onRoom(() => {
      // 온라인 인원은 board(1초)로 오지만, 나가고 들어오는 것은 바로 보여 준다
      const ps = ctx.room?.players || [];
      teams = teams.map(t => ({ ...t, online: ps.filter(p => p.team === t.i && p.online).length, members: ps.filter(p => p.team === t.i).length }));
      cards();
    }),
  ];
  if (s0.teams) { teams = s0.teams; cur = s0.cur || []; C.set(s0); track.update(teams, s0.D, false); if (s0.over) over = true; }
  setPhase(s0.phase ? s0 : { phase: 'ready' }); cards();
  return () => { offs.forEach(f => f()); clearInterval(tick); ctx.music.stop(); };
}
