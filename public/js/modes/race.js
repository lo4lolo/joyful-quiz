// 퀴즈 카트 레이스: 학생 화면(3D 운전) · 교사 화면(큰 지도 중계)
import { h, esc, avatarHTML, confetti, sound, music, fmtSec } from '../common.js';
import { buildTrack, HALF } from '../race/tracks.js';

const ITEM = { boost: { e: '🚀', n: '부스터를' }, banana: { e: '🍌', n: '바나나를' }, shield: { e: '🛡️', n: '방패를' }, ink: { e: '🦑', n: '먹물을' }, star: { e: '⭐', n: '별을' } };
const MEDAL = ['🥇', '🥈', '🥉'];

function ensureCss() {
  if (document.querySelector('link[data-race-css]')) return;
  const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../css/race.css', import.meta.url).href; l.dataset.raceCss = '1';
  document.head.append(l);
}
const fmtTime = ms => { const s = ms / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
const playerList = room => room?.players || [];

// 서버에서 현재 경주 상태 받기 (모드 화면이 'start' 방송보다 늦게 열리므로)
async function getInfo(ctx) {
  if (ctx.snapshot?.roster) return ctx.snapshot;
  for (let i = 0; i < 5; i++) {
    const r = await ctx.send('sync', {});
    if (r && r.roster) return r;
    await new Promise(res => setTimeout(res, 600));
  }
  return null;
}

// =====================================================================
// 학생
// =====================================================================
export function mountStudent(el, ctx) {
  ensureCss();
  el.classList.add('race-el');
  const offs = [], timers = [];
  let game = null, dead = false, info = null;
  let held = null, rolling = false, busy = false, gateQueue = 0, finished = false, myRank = 0;
  let stamps = 0, correct = 0, goLocal = Infinity, closing = 0;
  const kOf = new Map(), pidOf = new Map();
  const touch = ctx.me?.device === 'touch';
  const finishOrder = [];

  const ui = h(`<div class="rc-ui">
    <div class="rc-hud">
      <div class="pill rank">🏁 <span class="rk">-</span></div>
      <div class="pill lap">🔄 <span class="lp">1/3</span></div>
      <div class="pill stamp">🎫 <span class="stp">0/2</span></div>
      <div class="pill time">⏱ <span class="tm">0:00</span></div>
      <div class="pill ww" hidden>🔄 거꾸로 가고 있어요!</div>
      <div class="sp"></div>
    </div>
    <button class="rc-item empty" title="아이템 쓰기">·<small>${touch ? '' : 'Space'}</small></button>
    <div class="rc-help" hidden></div>
    <div class="rc-closing" hidden></div>
    <div class="rc-tools"><button class="rc-assist" aria-pressed="false">🧭 주행 도움</button><button class="rc-rescue">🛟 바로 세우기</button><button class="rc-controls">⌨️ 조작법</button></div>
  </div>`);
  const $ = s => ui.querySelector(s);
  const itemBtn = $('.rc-item');

  // ----- 조종 -----
  const keys = new Set();
  let joy = { x: 0, y: 0, on: false }, autoGas = touch, driftBtn = false, brakeBtn = false;
  function applyInput() {
    if (!game?.input) return;
    if (touch) {
      game.input.steer = joy.x;
      game.input.throttle = brakeBtn ? -1 : autoGas ? (joy.on && joy.y > 0.6 ? -0.6 : 1) : clampN(-joy.y * 1.4, -1, 1);
      game.input.drift = driftBtn;
    } else {
      const L = keys.has('ArrowLeft') || keys.has('KeyA'), R = keys.has('ArrowRight') || keys.has('KeyD');
      const U = keys.has('ArrowUp') || keys.has('KeyW'), D = keys.has('ArrowDown') || keys.has('KeyS');
      game.input.steer = (R ? 1 : 0) - (L ? 1 : 0);
      game.input.throttle = (U ? 1 : 0) - (D ? 1 : 0);
      game.input.drift = keys.has('ShiftLeft') || keys.has('ShiftRight') || keys.has('KeyX');
    }
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
  const typing = e => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '') || e.target?.isContentEditable;
  const DRIVE = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'ShiftLeft', 'ShiftRight', 'KeyX', 'Space'];
  const onKeyDown = e => {
    if (typing(e)) return;
    if (DRIVE.includes(e.code)) e.preventDefault();
    if (e.code === 'Space' || e.code === 'KeyE') { if (!e.repeat) useItem(); return; }
    keys.add(e.code); applyInput();
  };
  const onKeyUp = e => { keys.delete(e.code); applyInput(); };
  const onBlur = () => { keys.clear(); joy = { x: 0, y: 0, on: false }; driftBtn = false; brakeBtn = false; applyInput(); };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur);
  offs.push(() => { window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); });
  itemBtn.addEventListener('pointerdown', e => { e.preventDefault(); sound.unlock(); useItem(); });
  $('.rc-assist').onclick = () => {
    if (!game || game.failed) return;
    game.assist = !game.assist;
    $('.rc-assist').setAttribute('aria-pressed', String(game.assist));
    $('.rc-assist').textContent = `🧭 주행 도움 ${game.assist ? '켜짐' : '꺼짐'}`;
    game.flash(game.assist ? '핸들을 놓으면 길을 따라가요. 직접 움직여도 돼요!' : '직접 운전해요! ↑ 가속 · ← → 핸들', '', 2500);
  };
  $('.rc-rescue').onclick = () => game?.rescue?.();
  $('.rc-controls').onclick = () => {
    const help = $('.rc-help'); help.hidden = !help.hidden;
    help.innerHTML = `<b>주행 도움</b>: 핸들을 놓으면 길을 따라 달려요.<br>${touch ? '동그라미 핸들 · 💨 드리프트 · ✋ 멈춤' : '↑ 가속 · ← → 핸들 · ↓ 브레이크 · Shift 드리프트 · Space 아이템'}<br><small>길을 잃으면 🛟 바로 세우기 · ❓ 게이트에서 퀴즈</small>`;
  };

  if (touch) {
    const tc = h(`<div class="rc-touch">
      <div class="rc-joy"><span>⬅ 핸들 ➡</span><i></i></div>
      <button class="rc-auto">🚗 자동 가속 켜짐</button>
      <button class="rc-tbtn drift">💨<small>드리프트</small></button>
      <button class="rc-tbtn brake">✋<small>멈춤</small></button>
    </div>`);
    ui.append(tc);
    const pad = tc.querySelector('.rc-joy'), knob = pad.querySelector('i');
    let pid = null;
    const move = e => {
      const r = pad.getBoundingClientRect(), R = r.width / 2;
      let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
      joy = { x: Math.abs(dx) < 0.08 ? 0 : dx, y: dy, on: true };
      knob.style.transform = `translate(${dx * R * 0.6}px,${dy * R * 0.6}px)`; applyInput();
    };
    pad.addEventListener('pointerdown', e => { e.preventDefault(); sound.unlock(); pid = e.pointerId; pad.setPointerCapture(pid); move(e); });
    pad.addEventListener('pointermove', e => { if (e.pointerId === pid) move(e); });
    const up = e => { if (e.pointerId !== pid) return; pid = null; joy = { x: 0, y: 0, on: false }; knob.style.transform = ''; applyInput(); };
    pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up);
    const hold = (btn, set) => {
      btn.addEventListener('pointerdown', e => { e.preventDefault(); btn.setPointerCapture(e.pointerId); set(true); btn.classList.add('on'); applyInput(); });
      const off = () => { set(false); btn.classList.remove('on'); applyInput(); };
      btn.addEventListener('pointerup', off); btn.addEventListener('pointercancel', off);
    };
    hold(tc.querySelector('.drift'), v => driftBtn = v);
    hold(tc.querySelector('.brake'), v => brakeBtn = v);
    const auto = tc.querySelector('.rc-auto');
    auto.onclick = () => { autoGas = !autoGas; auto.textContent = autoGas ? '🚗 자동 가속 켜짐' : '🚗 자동 가속 꺼짐 (핸들 위로 = 가속)'; applyInput(); };
  }

  // ----- HUD -----
  function hud() {
    if (!game?.me) return;
    const S = info.stamps;
    const lapsDone = game.me.lapsDone;
    $('.lp').textContent = lapsDone >= info.laps && !finished ? `보너스 바퀴` : `${game.lap()}/${info.laps}`;
    $('.stp').textContent = S ? `${stamps}/${S}` : `${stamps}`;
    $('.stamp').classList.toggle('ok', stamps >= S);
    const ri = game.rankInfo();
    $('.rk').textContent = finished ? `${myRank}등 도착!` : `${ri.rank}등 / ${ri.of}`;
    const now = performance.now();
    $('.tm').textContent = now < goLocal ? '0:00' : fmtSec((finished ? finishedMs : now - goLocal) / 1000);
    if (closing) { const left = Math.max(0, Math.ceil((closing - now) / 1000)); const c = $('.rc-closing'); c.hidden = false; c.textContent = `⏳ ${left}초 뒤에 경기가 끝나요!`; }
  }
  let finishedMs = 0;
  function setItem(kind) {
    held = kind;
    itemBtn.classList.toggle('empty', !kind); itemBtn.classList.toggle('has', !!kind); itemBtn.classList.remove('roll');
    itemBtn.firstChild.textContent = kind ? ITEM[kind].e : '·';
  }
  function rollItem(kind) { // 룰렛처럼 돌다가 멈춤
    rolling = true; itemBtn.classList.add('roll'); itemBtn.classList.remove('empty');
    const order = Object.keys(ITEM); let i = 0;
    const t = setInterval(() => { itemBtn.firstChild.textContent = ITEM[order[i++ % order.length]].e; sound.play('tick'); }, 80);
    timers.push(setTimeout(() => { clearInterval(t); rolling = false; setItem(kind); sound.play('coin'); game?.flash(`${ITEM[kind].e} ${ITEM[kind].n} 얻었어요! ${touch ? '' : '(Space)'}`, 'good', 1400); }, 900));
    timers.push(t);
  }

  // ----- 아이템 -----
  let using = false;
  async function useItem() {
    if (!held || rolling || using || !game?.started || finished) return;
    const kind = held; using = true;
    const data = { kind, ...(kind === 'banana' ? game.dropPos() : {}) };
    const r = await ctx.send('item', data);
    using = false;
    if (!r?.ok) { if (r?.error === 'noitem') setItem(null); return; }
    setItem(null);
    if (kind === 'boost') { game.boost(1.8); game.flash('🚀 부스터!', 'turbo', 900); }
    else if (kind === 'star') { game.star(5); game.flash('⭐ 무적 별!', 'turbo', 1100); }
    else if (kind === 'shield') { game.shield(12); game.flash('🛡️ 방패 장착!', 'good', 1000); }
    else if (kind === 'banana') { sound.play('pick'); game.flash('🍌 뒤에 바나나를 놓았어요', '', 1000); }
    else if (kind === 'ink') { game.squirt(); sound.play('steal'); game.flash('🦑 먹물 발사! 앞 친구들 화면이 깜깜~', '', 1300); }
  }

  // ----- 퀴즈 -----
  async function runQuiz(kind) {
    if (dead || finished || closing) return;
    if (busy) { if (kind === 'gate') gateQueue++; return; }
    busy = true; game.setQuiz(true);
    const label = kind === 'gate' ? '❓ 퀴즈 게이트' : '🎁 아이템 상자 퀴즈';
    let res = null;
    try { res = await ctx.quiz({ label, container: el, okDelay: 650, extra: r => r.ok ? '🚀 부스터 + 아이템!' : '조금 느려지지만 괜찮아요!' }); } catch { res = null; }
    if (dead) return;
    game.setQuiz(false); busy = false;
    if (!res && kind === 'gate') { gateQueue++; timers.push(setTimeout(nextQueued, 1400)); return; } // 너무 빨리 이어지면 잠깐 뒤에
    nextQueued();
  }
  function nextQueued() {
    if (gateQueue > 0 && !busy) { gateQueue--; runQuiz('gate'); }
    else if (!busy && finishPending) { finishPending = false; tryFinish(); }
  }

  // ----- 도착 -----
  let finishing = false, finishPending = false;
  async function tryFinish() {
    if (finished || finishing) return;
    if (busy || gateQueue) { finishPending = true; return; }
    finishing = true;
    const st = game.state();
    let r = await ctx.send('finish', { lap: game.me.lapsDone, rp: st.rp });
    if (r?.error === 'laps') { await new Promise(res => setTimeout(res, 400)); r = await ctx.send('finish', { lap: game.me.lapsDone, rp: game.state().rp }); }
    finishing = false;
    if (dead) return;
    if (r?.ok) return onFinished(r.rank, r.time);
    if (r?.error === 'stamps') {
      sound.play('wrong');
      game.flash(`🎫 퀴즈 도장이 ${r.need}개 더 필요해요!`, 'warn', 2600);
      timers.push(setTimeout(() => game?.flash('한 바퀴 더 돌면서 ❓게이트·🎁상자를 찾아요!', '', 2600), 1200));
      $('.stamp').classList.remove('need'); void $('.stamp').offsetWidth; $('.stamp').classList.add('need');
    }
  }
  function onFinished(rank, time) {
    finished = true; myRank = rank; finishedMs = time;
    game.setFinishedMe(rank);
    sound.play('win'); confetti(rank <= 3 ? 140 : 80);
    const d = h(`<div class="rc-done"><div class="card">
      <div class="big">🏁 ${rank}등!</div>
      <div style="font-size:24px">${rank === 1 ? '우와, 1등이에요! 🎉' : rank <= 3 ? '정말 잘했어요! 🎉' : '완주 성공! 멋져요 👏'}</div>
      <div class="muted" style="margin-top:6px">⏱ ${fmtTime(time)} · 🎫 도장 ${stamps}개 · ⭕ 정답 ${correct}개</div>
      <div class="muted" style="margin-top:6px">다른 친구들이 도착하기를 기다려요…</div>
      <div class="order"></div>
      <button class="btn sm ghost" style="margin-top:12px">🚗 구경하며 천천히 달리기</button>
    </div></div>`);
    d.querySelector('button').onclick = () => d.remove();
    ui.append(d); drawOrder();
  }
  function drawOrder() {
    const box = ui.querySelector('.rc-done .order'); if (!box) return;
    box.innerHTML = finishOrder.slice(0, 40).map(f => `<div class="${f.pid === ctx.me.pid ? 'me' : ''}"><b>${MEDAL[f.rank - 1] || f.rank + '등'}</b>${esc(f.name)}<span class="t">${fmtTime(f.time)}</span></div>`).join('');
  }

  // ----- 시작 -----
  function playersFor() {
    return playerList(ctx.room).filter(p => kOf.has(p.pid)).map(p => ({ k: kOf.get(p.pid), name: p.name, color: p.avatar?.color || '#ff5fa2', face: p.avatar?.face || '🐱' }));
  }
  let beginning = false;
  async function begin(data) {
    if (game || dead || beginning || !data?.roster) return; // 'start' 방송과 sync 응답이 둘 다 와도 한 번만
    beginning = true;
    info = data;
    for (const [pid, k] of data.roster) { kOf.set(pid, k); pidOf.set(k, pid); }
    const myK = data.me?.k ?? kOf.get(ctx.me.pid);
    if (myK == null) { el.append(h('<div class="rc-help">경주 자리를 찾지 못했어요. 선생님께 말해 주세요.</div>')); return; }
    stamps = data.me?.stamps || 0; correct = data.me?.correct || 0;
    const { createRace } = await import('../race/game3d.js');
    if (dead) return;
    const meP = playerList(ctx.room).find(p => p.pid === ctx.me.pid) || ctx.me;
    game = await createRace(el, {
      track: data.track, laps: data.laps, gates: data.gates, boxes: data.boxes, items: data.items, driving: data.driving, ghosts: !!data.ghosts, mode: 'player',
      me: { k: myK, color: meP.avatar?.color || ctx.me.avatar?.color || '#ff5fa2', face: meP.avatar?.face, name: ctx.me.name },
      players: playersFor().filter(p => p.k !== myK),
      resume: data.me && data.me.x != null ? data.me : (data.me?.rp > 0 ? data.me : null),
      on: {
        gate: () => runQuiz('gate'),
        gateMiss: () => game.flash('앗, 게이트를 놓쳤어요! 다음 게이트는 꼭 지나가요', '', 1800),
        box: () => runQuiz('box'),
        lap: n => {
          if (n < info.laps) { sound.play('open'); game.flash(n === info.laps - 1 ? '🏁 마지막 바퀴!' : `🔄 ${n + 1}바퀴째!`, 'turbo', 1500); }
        },
        finishLine: () => tryFinish(),
        bananaHit: (id) => { ctx.send('banana:hit', { id }); },
        wrongWay: on => { $('.ww').hidden = !on; },
        go: () => { $('.rc-help').hidden = true; },
      },
    });
    if (dead) { game.destroy(); return; }
    if (game.failed) return;
    el.append(ui);
    $('.rc-assist').setAttribute('aria-pressed', String(game.assist));
    $('.rc-assist').textContent = `🧭 주행 도움 ${game.assist ? '켜짐' : '꺼짐'}`;
    applyInput();
    goLocal = performance.now() + data.goIn;
    game.setGo(goLocal);
    if (data.closeIn > 0) closing = performance.now() + data.closeIn;
    if (data.karts) game.applySnap(data.karts.flat());
    for (const b of data.bananas || []) game.addBanana(b);
    for (const f of data.finished || []) { game.setFinished(f.k, f.rank); addOrder(f); }
    if (data.me?.item) setItem(data.me.item);
    if (data.me?.finished) onFinished(data.me.rank, data.me.time);
    if (data.goIn > 0) {
      const help = $('.rc-help'); help.hidden = false;
      help.innerHTML = `<b>❓ 퀴즈 게이트</b>를 지나면 문제가 나와요! 맞히면 🚀부스터 + 아이템<br>` +
        (info.stamps ? `🎫 퀴즈 도장 <b>${info.stamps}개</b>를 모아서 ${info.laps}바퀴를 돌면 도착!` : `${info.laps}바퀴를 돌면 도착!`) +
        `<br><small>${touch ? '왼쪽 동그라미로 핸들, 💨 드리프트, 오른쪽 아래 아이템' : '← → 핸들 · ↑ 가속 · ↓ 브레이크 · Shift 드리프트 · Space 아이템'}</small>`;
    }
    // 상태 보내기 (10번/초, 안 움직이면 2번/초)
    let last = '', lastAt = 0;
    timers.push(setInterval(() => {
      if (!game?.me || dead) return;
      const s = game.state(), key = `${s.x},${s.z},${s.h},${s.fx}`, now = performance.now();
      if (key === last && now - lastAt < 500) return;
      last = key; lastAt = now;
      ctx.socket.emit('s:mode', { type: 'st', data: s });
    }, 100));
    timers.push(setInterval(hud, 200));
    hud();
  }
  function addOrder(f) {
    if (finishOrder.some(o => o.pid === f.pid)) return;
    const p = playerList(ctx.room).find(x => x.pid === f.pid);
    finishOrder.push({ ...f, name: f.name || p?.name || '' }); finishOrder.sort((a, b) => a.rank - b.rank); drawOrder();
  }

  // ----- 서버 이벤트 -----
  offs.push(ctx.on('start', d => begin(d)));
  offs.push(ctx.on('snap', a => game?.applySnap?.(a)));
  offs.push(ctx.on('roster', d => { kOf.set(d.pid, d.k); pidOf.set(d.k, d.pid); const p = playersFor().find(x => x.k === d.k); if (p) game?.setPlayer(p); }));
  offs.push(ctx.on('banana:add', b => game?.addBanana(b)));
  offs.push(ctx.on('banana:del', d => game?.delBanana(d.id)));
  offs.push(ctx.on('ink', d => {
    if (!game || finished) return;
    const r = game.hitBy('ink');
    if (r === 'hit') game.flash(`🦑 ${d.from}의 먹물!`, 'bad', 1400);
    else game.flash(r === 'star' ? '⭐ 별이 먹물을 튕겨냈어요!' : '🛡️ 방패가 먹물을 막았어요!', 'good', 1300);
  }));
  offs.push(ctx.on('reward', d => {
    if (!game) return;
    stamps = d.stamps ?? stamps; correct = d.correct ?? correct;
    if (d.ok) {
      game.boost(1.3);
      if (d.item) rollItem(d.item);
      else if (d.full) game.flash('아이템 칸이 꽉 찼어요! 먼저 쓰세요', '', 1400);
    } else if (d.penalty) { game.slow(d.penalty.ms || 1000); game.flash('괜찮아요! 다음엔 맞힐 수 있어요 💪', '', 1600); }
    if (info?.stamps && stamps === info.stamps) timers.push(setTimeout(() => game?.flash('🎫 도장을 다 모았어요! 결승선으로 GO!', 'good', 2000), 900));
    hud();
    // 도장이 모자라 결승선을 그냥 지나친 뒤라면, 다음에 지날 때 다시 확인
  }));
  offs.push(ctx.on('finish', f => { game?.setFinished(f.k, f.rank); addOrder(f); if (f.pid !== ctx.me.pid && f.rank <= 3) game?.flash(`${MEDAL[f.rank - 1]} ${f.name} 도착!`, '', 1500); }));
  offs.push(ctx.on('closing', d => { closing = performance.now() + d.endIn; hud(); }));
  if (ctx.onRoom) offs.push(ctx.onRoom(() => { if (game) for (const p of playersFor()) if (p.k !== game.me?.k) game.setPlayer(p); }));

  getInfo(ctx).then(d => { if (d) begin(d); });

  return () => {
    dead = true;
    for (const f of offs) try { f?.(); } catch {}
    for (const t of timers) { clearTimeout(t); clearInterval(t); }
    el.querySelectorAll('.quiz-layer').forEach(layer => layer.closeQuiz?.());
    game?.destroy?.();
    ui.remove(); el.classList.remove('race-el');
  };
}

// =====================================================================
// 교사 (교실 TV 중계)
// =====================================================================
export function mountTeacher(el, ctx) {
  ensureCss();
  const offs = [], timers = [];
  let info = null, tr = null, dead = false, raf = 0, g3d = null, goLocal = Infinity, closing = 0, started = false;
  const kOf = new Map(), pidOf = new Map(), karts = new Map(), stats = {}, finished = new Map();
  let nAns = 0, nOk = 0;

  const root = h(`<div class="rt-root">
    <div class="rt-main">
      <canvas class="map"></canvas>
      <div class="rt-3d" hidden></div>
      <div class="rt-top">
        <div class="pill big tname">🏁 퀴즈 카트 레이스</div>
        <div class="pill tlaps"></div>
        <div class="pill ttime">⏱ 0:00</div>
        <div class="sp"></div>
        <div class="pill tclose" hidden></div>
      </div>
      <div class="rt-count"></div>
      <div class="rt-btns">
        <button class="btn r big bend">🏁 지금 끝내기</button>
        <button class="btn s bcam">📺 중계 카메라</button>
      </div>
    </div>
    <div class="rt-side">
      <div class="card"><div class="rt-stats">
        <div><b class="sDone">0</b>도착</div><div><b class="sAns">0</b>푼 문제</div><div><b class="sPct">-</b>정답률</div>
      </div></div>
      <div class="card rt-rank"><h3>🏆 실시간 순위</h3><div class="rt-list"></div></div>
      <div class="card rt-feed"><h3>📣 소식</h3><div class="feed"></div></div>
    </div>
  </div>`);
  el.append(root);
  const $ = s => root.querySelector(s);
  const canvas = $('canvas.map'), cx = canvas.getContext('2d');

  // ----- 정답률 -----
  const addLog = e => { nAns++; if (e.ok) nOk++; $('.sAns').textContent = nAns; $('.sPct').textContent = nAns ? Math.round(nOk / nAns * 100) + '%' : '-'; };
  for (const e of ctx.log || []) addLog(e);
  if (ctx.onLog) offs.push(ctx.onLog(addLog));
  // ----- 소식 -----
  const feedBox = $('.feed');
  const addFeed = f => { const t = typeof f === 'string' ? f : f?.text; if (!t) return; feedBox.prepend(h(`<div>${esc(t)}</div>`)); while (feedBox.children.length > 40) feedBox.lastChild.remove(); };
  for (const f of ctx.feed || []) addFeed(f);
  if (ctx.onFeed) offs.push(ctx.onFeed(addFeed));

  // ----- 버튼 -----
  let endClicked = 0;
  $('.bend').onclick = async () => {
    const now = Date.now();
    if (closing && now - endClicked < 6000) { ctx.end ? ctx.end() : ctx.send('endnow', {}); return; }
    endClicked = now;
    const r = await ctx.send('endnow', { soon: true });
    if (r?.error) { ctx.end?.(); return; }
    ctx.toast?.('5초 뒤에 끝나요. 한 번 더 누르면 바로 끝나요.');
  };
  $('.bcam').onclick = () => toggle3D();

  async function toggle3D() {
    const box = $('.rt-3d');
    if (g3d) { g3d.destroy(); g3d = null; box.hidden = true; $('.bcam').textContent = '📺 중계 카메라'; return; }
    if (!info) return;
    box.hidden = false; $('.bcam').textContent = '🗺️ 지도 보기';
    try {
      const { createRace } = await import('../race/game3d.js');
      if (dead) return;
      const g = await createRace(box, { track: info.track, laps: info.laps, gates: info.gates, boxes: info.boxes, mode: 'spectate', players: playersFor(), quality: 'high' });
      if (dead || box.hidden) { g.destroy(); return; }
      if (g.failed) { ctx.toast?.('이 컴퓨터에서는 3D를 열 수 없어요.'); g.destroy(); box.hidden = true; return; }
      g3d = g; g3d.setGo(goLocal);
      const snap = []; for (const [k, s] of karts) snap.push(k, Math.round(s.tx * 10), Math.round(s.tz * 10), Math.round(s.h * 100), Math.round(s.s * 10), Math.round(s.rp * 1000), s.fx);
      g3d.applySnap(snap);
      for (const b of bananas.values()) g3d.addBanana(b);
      for (const [k, rank] of finished) g3d.setFinished(k, rank);
    } catch (e) { console.error(e); box.hidden = true; ctx.toast?.('3D 화면을 열지 못했어요.'); }
  }

  function playersFor() {
    return playerList(ctx.room).filter(p => kOf.has(p.pid)).map(p => ({ k: kOf.get(p.pid), name: p.name, color: p.avatar?.color || '#ff5fa2', face: p.avatar?.face || '🐱' }));
  }
  const bananas = new Map();

  function begin(d) {
    if (info && d === info) return;
    info = d; tr = buildTrack(d.track);
    for (const [pid, k] of d.roster) { kOf.set(pid, k); pidOf.set(k, pid); }
    goLocal = performance.now() + d.goIn;
    if (d.closeIn > 0) closing = performance.now() + d.closeIn;
    if (d.stats) for (const [pid, v] of Object.entries(d.stats)) stats[pid] = { stamps: v[0], correct: v[1] };
    for (const f of d.finished || []) finished.set(f.k, f.rank);
    if (d.karts) applySnap(d.karts.flat());
    for (const b of d.bananas || []) bananas.set(b.id, b);
    $('.tname').textContent = `${tr.emoji} ${tr.name}`;
    $('.tlaps').textContent = `🔄 ${d.laps}바퀴 · 🎫 도장 ${d.stamps}개 · ❓ 게이트 ${d.gates}개`;
    $('.rt-main').style.background = tr.theme.ground;
    bg = null;
    if (d.goIn <= 0) started = true;
    else music.start();
    rankList();
  }
  function applySnap(a) {
    for (let i = 0; i + 6 < a.length; i += 7) {
      const k = a[i]; let s = karts.get(k);
      const x = a[i + 1] / 10, z = a[i + 2] / 10;
      if (!s) { s = { x, z }; karts.set(k, s); }
      s.tx = x; s.tz = z; s.h = a[i + 3] / 100; s.s = a[i + 4] / 10; s.rp = a[i + 5] / 1000; s.fx = a[i + 6];
    }
    g3d?.applySnap(a);
  }

  offs.push(ctx.on('start', d => begin(d)));
  offs.push(ctx.on('snap', applySnap));
  offs.push(ctx.on('roster', d => { kOf.set(d.pid, d.k); pidOf.set(d.k, d.pid); const p = playersFor().find(x => x.k === d.k); if (p) g3d?.setPlayer(p); }));
  offs.push(ctx.on('stat', d => { stats[d.pid] = { stamps: d.stamps, correct: d.correct }; }));
  offs.push(ctx.on('finish', f => { finished.set(f.k, f.rank); g3d?.setFinished(f.k, f.rank); $('.sDone').textContent = finished.size; sound.play(f.rank <= 3 ? 'win' : 'coin'); if (f.rank === 1) confetti(120); }));
  offs.push(ctx.on('closing', d => { closing = performance.now() + d.endIn; }));
  offs.push(ctx.on('banana:add', b => { bananas.set(b.id, b); g3d?.addBanana(b); }));
  offs.push(ctx.on('banana:del', d => { bananas.delete(d.id); g3d?.delBanana(d.id); }));
  if (ctx.onRoom) offs.push(ctx.onRoom(() => { if (g3d) for (const p of playersFor()) g3d.setPlayer(p); }));

  // ----- 순위표 -----
  function order() {
    const list = [];
    for (const [pid, k] of kOf) {
      const p = playerList(ctx.room).find(x => x.pid === pid); if (!p) continue;
      const s = karts.get(k); list.push({ pid, k, p, rp: s?.rp ?? -1, fx: s?.fx || 0, fin: finished.get(k) || 0 });
    }
    list.sort((a, b) => (a.fin && b.fin ? a.fin - b.fin : a.fin ? -1 : b.fin ? 1 : b.rp - a.rp));
    return list;
  }
  function rankList() {
    if (!info) return;
    const list = order();
    $('.rt-list').innerHTML = list.map((o, i) => {
      const st = stats[o.pid] || { stamps: 0, correct: 0 };
      const lap = o.fin ? '🏁' : `${Math.max(1, Math.min(info.laps, Math.floor(o.rp) + 1))}/${info.laps}`;
      return `<div class="rt-row ${o.fin ? 'done' : ''} ${i < 3 ? 'r' + (i + 1) : ''} ${o.p.online === false ? 'off' : ''}">
        <span class="rk">${MEDAL[i] || i + 1}</span>${avatarHTML(o.p.avatar, 'sm')}<span class="nm">${esc(o.p.name)}${o.fx & 64 ? ' <span class="q">❓</span>' : ''}</span>
        <span class="lp">${lap}</span><span class="st">🎫${st.stamps} ⭕${st.correct}</span></div>`;
    }).join('');
    $('.sDone').textContent = finished.size;
  }
  timers.push(setInterval(rankList, 700));

  // ----- 지도 그리기 -----
  let bg = null, W = 0, H = 0, sc = 1, ox = 0, oz = 0, dpr = 1;
  const mm = (x, z) => [W / 2 - (x - ox) * sc, H / 2 - (z - oz) * sc];
  function layout() {
    const r = canvas.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.max(100, r.width * dpr | 0), hh = Math.max(100, r.height * dpr | 0);
    if (w !== W || hh !== H) { W = canvas.width = w; H = canvas.height = hh; bg = null; }
  }
  function drawBg() {
    const { minX, maxX, minZ, maxZ } = tr.bounds, pad = 60 * dpr;
    sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2 - 40 * dpr) / (maxZ - minZ));
    ox = (minX + maxX) / 2; oz = (minZ + maxZ) / 2 - 12 * dpr / sc;
    bg = document.createElement('canvas'); bg.width = W; bg.height = H; const b = bg.getContext('2d');
    const th = tr.theme;
    b.fillStyle = th.ground; b.fillRect(0, 0, W, H);
    const cell = 40 * dpr; b.fillStyle = th.ground2; for (let i = 0; i * cell < W; i++) for (let j = 0; j * cell < H; j++) if ((i + j) % 2) b.fillRect(i * cell, j * cell, cell, cell);
    b.lineJoin = b.lineCap = 'round';
    const path = () => { b.beginPath(); tr.samples.forEach((s, i) => { const [u, v] = mm(s.x, s.z); i ? b.lineTo(u, v) : b.moveTo(u, v); }); b.closePath(); };
    path(); b.strokeStyle = 'rgba(0,0,0,.18)'; b.lineWidth = (HALF * 2 + 6) * sc; b.stroke();
    path(); b.strokeStyle = th.curb[0]; b.lineWidth = (HALF * 2 + 2) * sc; b.stroke();
    path(); b.setLineDash([2.5 * sc, 2.5 * sc]); b.strokeStyle = th.curb[1]; b.stroke(); b.setLineDash([]);
    path(); b.strokeStyle = th.road; b.lineWidth = HALF * 2 * sc; b.stroke();
    path(); b.setLineDash([4 * sc, 5 * sc]); b.strokeStyle = th.line; b.globalAlpha = 0.7; b.lineWidth = Math.max(1.5, 0.5 * sc); b.stroke(); b.setLineDash([]); b.globalAlpha = 1;
    // 출발선
    const s0 = tr.pointAt(0);
    b.save(); const [u0, v0] = mm(s0.x, s0.z); b.translate(u0, v0); b.rotate(-s0.h); const q = HALF * sc;
    for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { b.fillStyle = (i + j) % 2 ? '#222' : '#fff'; b.fillRect(-q + i * q / 4, -q / 4 + j * q / 4, q / 4, q / 4); }
    b.restore();
    // 게이트, 상자
    b.font = `${Math.max(18, 4.2 * sc)}px sans-serif`; b.textAlign = 'center'; b.textBaseline = 'middle';
    for (const g of tr.gates(info.gates)) { const p = tr.pointAt(g), [u, v] = mm(p.x, p.z); b.fillStyle = 'rgba(255,95,162,.9)'; b.beginPath(); b.arc(u, v, Math.max(14, 3 * sc), 0, Math.PI * 2); b.fill(); b.fillText('❓', u, v + 1); }
    if (info.boxes) for (const row of tr.boxes(info.gates)) for (const lat of row.lanes) { const p = tr.pointAt(row.prog, lat), [u, v] = mm(p.x, p.z); const r = Math.max(4, 0.9 * sc); b.fillStyle = '#ffd32a'; b.fillRect(u - r, v - r, r * 2, r * 2); b.strokeStyle = '#fff'; b.lineWidth = 2; b.strokeRect(u - r, v - r, r * 2, r * 2); }
  }
  let lastT = performance.now();
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    // 카운트다운·시간
    const cnt = $('.rt-count');
    if (info) {
      const left = goLocal - now;
      if (left > 0) { const n = Math.ceil(left / 1000); const key = n > 3 ? 'r' : n; if (cnt.dataset.k != key) { cnt.dataset.k = key; cnt.innerHTML = n > 3 ? '<b class="msg">🏁 곧 출발해요!<br><small>퀴즈 게이트를 지나면 문제가 나와요</small></b>' : `<b>${n}</b>`; if (n <= 3) sound.play('count'); } }
      else if (!started || cnt.dataset.k !== 'done') {
        if (!started) { started = true; sound.play('go'); music.start(); }
        if (cnt.dataset.k !== 'go' && cnt.dataset.k !== 'done') { cnt.dataset.k = 'go'; cnt.innerHTML = '<b class="go">출발!</b>'; timers.push(setTimeout(() => { cnt.innerHTML = ''; cnt.dataset.k = 'done'; }, 1000)); }
      }
      $('.ttime').textContent = '⏱ ' + fmtSec(Math.max(0, now - goLocal) / 1000);
      const tc = $('.tclose');
      if (closing) { tc.hidden = false; tc.textContent = `⏳ ${Math.max(0, Math.ceil((closing - now) / 1000))}초 뒤 끝`; }
    }
    if (!info || g3d) return;
    layout();
    if (!bg) drawBg();
    cx.drawImage(bg, 0, 0);
    // 바나나
    cx.font = `${Math.max(14, 2.4 * sc)}px sans-serif`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    for (const b of bananas.values()) { const [u, v] = mm(b.x, b.z); cx.fillText('🍌', u, v); }
    // 카트 (뒤에 있는 카트부터 그려 선두가 위에)
    const list = order().reverse();
    const R = Math.max(13 * dpr, Math.min(24 * dpr, 2.1 * sc));
    const leader = list[list.length - 1];
    for (const o of list) {
      const s = karts.get(o.k);
      let x, z;
      if (s) { s.x += (s.tx - s.x) * Math.min(1, dt * 7); s.z += (s.tz - s.z) * Math.min(1, dt * 7); x = s.x; z = s.z; }
      else { const g = tr.grid(o.k % 40); x = g.x; z = g.z; }
      const [u, v] = mm(x, z);
      const col = o.p.avatar?.color || '#ff5fa2';
      cx.globalAlpha = o.p.online === false ? 0.4 : 1;
      cx.fillStyle = 'rgba(0,0,0,.25)'; cx.beginPath(); cx.arc(u, v + 3 * dpr, R, 0, Math.PI * 2); cx.fill();
      cx.fillStyle = col; cx.strokeStyle = (s?.fx & 4) ? `hsl(${(now / 4) % 360},90%,60%)` : '#fff'; cx.lineWidth = 3 * dpr;
      cx.beginPath(); cx.arc(u, v, R, 0, Math.PI * 2); cx.fill(); cx.stroke();
      if (s?.fx & 2) { cx.strokeStyle = 'rgba(127,220,255,.9)'; cx.lineWidth = 3 * dpr; cx.beginPath(); cx.arc(u, v, R + 5 * dpr, 0, Math.PI * 2); cx.stroke(); }
      cx.font = `${R * 1.15}px sans-serif`; cx.fillStyle = '#000'; cx.fillText(o.p.avatar?.face || '🐱', u, v + R * 0.08);
      if (o === leader && !o.fin) { cx.font = `${R}px sans-serif`; cx.fillText('👑', u, v - R * 1.35); }
      if (s?.fx & 64) { cx.font = `${R * 0.9}px sans-serif`; cx.fillText('❓', u + R, v - R); }
      if (s?.fx & 1) { cx.font = `${R * 0.8}px sans-serif`; cx.fillText('🔥', u - R, v + R * 0.9); }
      const nm = o.p.name; cx.font = `${Math.max(12 * dpr, R * 0.72)}px Jua, sans-serif`;
      const tw = cx.measureText(nm).width + 10 * dpr;
      cx.fillStyle = 'rgba(255,255,255,.9)'; cx.fillRect(u - tw / 2, v + R + 2 * dpr, tw, R * 0.95);
      cx.fillStyle = '#1d2140'; cx.fillText(nm, u, v + R + 2 * dpr + R * 0.5);
      cx.globalAlpha = 1;
    }
  }
  raf = requestAnimationFrame(frame);
  const onResize = () => { bg = null; };
  window.addEventListener('resize', onResize); offs.push(() => window.removeEventListener('resize', onResize));

  getInfo(ctx).then(d => { if (d && !dead) begin(d); });

  return () => {
    dead = true; cancelAnimationFrame(raf);
    for (const f of offs) try { f?.(); } catch {}
    for (const t of timers) { clearTimeout(t); clearInterval(t); }
    g3d?.destroy(); music.stop(); root.remove();
  };
}
