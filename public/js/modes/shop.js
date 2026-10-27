// 퀴즈 부자: 맞히면 돈, 상점에서 업그레이드·아이템. 값 표는 서버가 보내 준 것(shop.tracks)으로만 그린다.
import { $, $$, esc, h, avatarHTML, fmtSec, pct, sleep, fx } from '../common.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/shop.css">')); } };

// ---------- 공용 ----------
// 받침에 맞는 조사: josa('박나무','이','가') → '박나무가'
export function josa(w, a, b) {
  const s = String(w ?? ''), c = s.charCodeAt(s.length - 1);
  let jong = null;
  if (c >= 0xAC00 && c <= 0xD7A3) jong = (c - 0xAC00) % 28 !== 0;
  else if (/[0-9]$/.test(s)) jong = '013678'.includes(s.slice(-1));
  else if (s.endsWith('%')) jong = false;
  return s + (jong === null ? `${a}(${b})` : jong ? a : b);
}
// 12,340원 · 12.3만원 · 1,234만원 · 1.2억원
export function won(n) {
  n = Math.max(0, Math.round(+n || 0));
  if (n < 100000) return n.toLocaleString('ko-KR') + '원';
  if (n < 1e8) { const v = n / 1e4; return (v < 1000 ? (Math.floor(v * 10) / 10) : Math.floor(v)).toLocaleString('ko-KR') + '만원'; }
  return (Math.floor(n / 1e7) / 10).toLocaleString('ko-KR') + '억원';
}
export const TEAM = [
  { name: '청룡', emoji: '🐉', color: '#3D8BFF', light: '#D6E7FF' }, { name: '주작', emoji: '🐦', color: '#FF6F61', light: '#FFDCD8' },
  { name: '봉황', emoji: '🐤', color: '#F2B200', light: '#FFF0B8' }, { name: '해치', emoji: '🦁', color: '#1FB88A', light: '#C9F5E6' },
  { name: '백호', emoji: '🐯', color: '#7D8DAA', light: '#E6EBF3' }, { name: '현무', emoji: '🐢', color: '#8C6CFF', light: '#E7DEFF' },
];
const ICON = {
  perQ: ['per_question', '💵'], streak: ['streak', '🔥'], mult: ['multiplier', '✖️'], ins: ['insurance', '☂️'],
  double: ['magnet', '🧲'], shield: [null, '🛡️'], gift: ['gift', '🎁'], cheer: ['heart', '🤝'], coin: ['coin', '💰'], time: ['hourglass', '⏱️'],
};
// 그림(assets/icons)이 아직 없거나 못 불러오면 이모지로 (CSP: 인라인 onerror 대신 addEventListener)
const ic = (k, cls = '') => { const [f, em] = ICON[k] || [null, '❔'];
  return `<span class="sh-ic ${cls} ${f ? '' : 'noimg'}">${f ? `<img src="assets/icons/${f}.webp" alt="" draggable="false">` : ''}<em>${em}</em></span>`; };
function fixImgs(root) {
  for (const img of $$('.sh-ic img, .sh-art img', root)) {
    const bad = () => img.parentElement?.classList.add('noimg');
    img.addEventListener('error', bad, { once: true });
    if (img.complete && !img.naturalWidth) bad();
  }
}
// 숫자가 또르르 올라가는 돈 표시
function counter(el, fmt = won, ms = 650) {
  let shown = 0, target = 0, from = 0, t0 = 0, raf = 0;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms), e = 1 - (1 - k) ** 3;
    shown = from + (target - from) * e; el.textContent = fmt(shown);
    raf = k < 1 ? requestAnimationFrame(step) : 0;
  };
  return {
    set(v, now = false) {
      v = Math.round(v); if (v === target && !now) return;
      target = v; from = shown;
      if (now || matchMedia('(prefers-reduced-motion: reduce)').matches) { cancelAnimationFrame(raf); raf = 0; shown = v; el.textContent = fmt(v); return; }
      t0 = performance.now(); if (!raf) raf = requestAnimationFrame(step);
    },
    get value() { return target; },
    stop() { cancelAnimationFrame(raf); },
  };
}
const effect = (id, v) => id === 'perQ' ? `문제당 ${won(v)}` : id === 'streak' ? (v ? `연속 1번마다 +${won(v)}` : '없음')
  : id === 'mult' ? `×${v}` : id === 'ins' ? (v ? `잃는 돈 ${v}% 막기` : '없음') : String(v);
const UPDESC = { perQ: '맞힐 때마다 받는 돈', streak: '연속으로 맞히면 더 받아요 (10연속까지)', mult: '버는 돈에 곱해요', ins: '틀려서 잃는 돈을 막아요' };
const ITEMDESC = {
  double: () => '20초 동안 버는 돈 2배!', shield: () => '다음에 틀려도 연속 유지 · 돈 안 잃음',
  gift: () => '한 문제 값의 0.5~2배를 깜짝 선물! (맞힐 때마다 1번)', cheer: s => `우리 팀 친구 모두에게 +${won(s?.each || 10)}`,
};
const pips = (lv, max) => `<span class="sh-pips">${Array.from({ length: max }, (_, i) => `<i class="${i <= lv ? 'on' : ''}"></i>`).join('')}</span>`;

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  let shop = s0.shop || null, teams = s0.teams || [], goal = s0.goal || 0, penalty = !!s0.penalty;
  let st = s0.me || null, endsAt = s0.left != null ? Date.now() + s0.left : 0, doubleEnd = 0, cheerEnd = 0;
  let cancelAuto = null, waitEnd = null, hoverShop = false;
  let alive = true, openQuiz = null, quizOpen = false, lastEarn = null, earnWait = null, sheetOpen = false, ended = !!s0.goalAt;
  let order = s0.order || [], top = s0.top || [], teamNow = s0.teamsNow || [];
  const myTeam = () => st?.team ?? ctx.room.players.find(p => p.pid === ctx.me.pid)?.team ?? null;

  el.innerHTML = `<div class="sh-s">
    <div class="hud sh-hud">
      <span class="pill sh-money" id="sm-money">${ic('coin')}<b>0원</b></span>
      <span class="pill sh-streak" id="sm-streak" title="연속 정답">🔥 <b>0</b></span>
      <span class="pill sh-dbl" id="sm-dbl" hidden>🧲 2배 <b>20</b>초</span>
      <span class="pill sh-shd" id="sm-shd" hidden title="방패를 가지고 있어요">🛡️</span>
      <span class="grow"></span>
      <span class="pill sh-rank" id="sm-rank">🏅 -</span>
      <span class="pill">⏱ <b id="sm-time">-</b></span>
    </div>
    <div class="sh-wrap">
      <section class="sh-play"><div class="sh-mini" id="sm-mini"></div><div class="sh-qbox" id="sm-q"></div></section>
      <div class="sh-back" id="sm-back"></div>
      <aside class="sh-shop sticker" id="sm-shop" aria-label="상점">
        <div class="sh-shop-head"><h2>🛒 상점</h2><span class="sh-wallet" id="sm-wallet">0원</span><button class="btn sm ghost sh-close" id="sm-close">닫기 ✕</button></div>
        <p class="sh-qnote" id="sm-qnote" hidden>⏱ 문제가 기다리고 있어요! <b id="sm-qleft"></b> 다 사면 <b>닫기</b></p>
        <h3>⬆️ 업그레이드 <small>계속 효과</small></h3><div class="sh-ups" id="sm-ups"></div>
        <h3>✨ 아이템 <small>한 번 쓰기 · 값은 버는 돈에 따라 달라요</small></h3><div class="sh-items" id="sm-items"></div>
      </aside>
    </div>
    <nav class="sh-tabbar"><button class="btn lemon lg" id="sm-tab">🛒 상점 <i class="sh-dot" id="sm-dot" hidden>0</i></button></nav>
  </div>`;
  fixImgs(el);
  const moneyPill = $('#sm-money', el), money = counter($('#sm-money b', el)), wallet = counter($('#sm-wallet', el));
  const q = $('#sm-q', el), shopEl = $('#sm-shop', el);
  const wide = () => matchMedia('(min-width: 900px)').matches;

  // ----- 상점 -----
  function buildShop() {
    if (!shop) return;
    $('#sm-ups', el).innerHTML = shop.tracks.map(t => `<div class="sh-card sh-up" data-k="${t.id}">${ic(t.id, 'lg')}
      <div class="sh-body"><div class="sh-name">${esc(t.name)} <span class="sh-lv">Lv.1</span></div>${pips(0, t.v.length)}
      <div class="sh-eff"><span class="now"></span><span class="nx"></span></div><div class="sh-desc">${esc(UPDESC[t.id] || '')}</div></div>
      <button class="btn sm lemon sh-buy" data-k="${t.id}"></button></div>`).join('');
    $('#sm-items', el).innerHTML = shop.items.map(t => `<div class="sh-card sh-item" data-k="${t.id}">${ic(t.id, 'lg')}
      <div class="sh-body"><div class="sh-name">${esc(t.name)}</div><div class="sh-desc"></div><div class="sh-status"></div></div>
      <button class="btn sm mint sh-use" data-k="${t.id}"></button></div>`).join('');
    fixImgs(shopEl);
    updateShop();
  }
  function affordable() {
    if (!st || !shop) return [];
    const out = [];
    for (const t of shop.tracks) { const lv = st.lv[t.id]; if (lv < t.p.length && st.money >= t.p[lv]) out.push({ k: t.id, name: t.name, price: t.p[lv] }); }
    return out;
  }
  function itemBlock(k) {
    if (!st) return '잠깐만요';
    if (k === 'double' && doubleEnd > Date.now()) return `⏱ ${Math.ceil((doubleEnd - Date.now()) / 1000)}초 남음`;
    if (k === 'shield' && st.shield) return '🛡️ 가지고 있어요';
    if (k === 'gift' && !st.giftOk) return '문제를 맞히면 다시 살 수 있어요';
    if (k === 'cheer' && cheerEnd > Date.now()) return `${Math.ceil((cheerEnd - Date.now()) / 1000)}초 뒤에 다시`;
    return '';
  }
  function updateShop() {
    if (!st || !shop) return;
    for (const t of shop.tracks) {
      const card = $(`.sh-up[data-k="${t.id}"]`, el); if (!card) continue;
      const lv = st.lv[t.id], max = lv >= t.p.length, price = t.p[lv], can = !max && st.money >= price;
      $('.sh-lv', card).textContent = max ? 'MAX' : `Lv.${lv + 1}`;
      $$('.sh-pips i', card).forEach((p, i) => p.classList.toggle('on', i <= lv));
      $('.now', card).textContent = `지금 ${effect(t.id, t.v[lv])}`;
      $('.nx', card).textContent = max ? '' : `→ ${effect(t.id, t.v[lv + 1])}`;
      const b = $('.sh-buy', card);
      if (!b.classList.contains('busy')) { b.disabled = !can; b.innerHTML = max ? '최고!' : `${won(price)}`; }
      b.dataset.level = lv + 1;
      card.classList.toggle('can', can); card.classList.toggle('max', max);
      card.title = max ? '최고 단계예요' : can ? '살 수 있어요!' : `${won(price - st.money)} 더 모으면 살 수 있어요`;
    }
    for (const t of shop.items) {
      const card = $(`.sh-item[data-k="${t.id}"]`, el); if (!card) continue;
      const price = st.pp?.[t.id] ?? 0, block = itemBlock(t.id), can = !block && st.money >= price;
      $('.sh-desc', card).textContent = ITEMDESC[t.id]?.(st) || '';
      $('.sh-status', card).textContent = block || (st.money < price ? `${won(price - st.money)} 모자라요` : '');
      const b = $('.sh-use', card);
      if (!b.classList.contains('busy')) { b.disabled = !can; b.textContent = won(price); }
      card.classList.toggle('can', can); card.classList.toggle('on', /남음|가지고/.test(block));
    }
    const n = affordable().length;
    const dot = $('#sm-dot', el); dot.hidden = !n; dot.textContent = n;
    $('#sm-tab', el).classList.toggle('pulse', n > 0 && !sheetOpen);
  }
  shopEl.addEventListener('click', async e => {
    const b = e.target.closest('.sh-buy, .sh-use'); if (!b || b.disabled || b.classList.contains('busy')) return;
    const k = b.dataset.k, isUp = b.classList.contains('sh-buy'), card = b.closest('.sh-card');
    b.classList.add('busy'); b.disabled = true;
    fx.light(b);
    const r = await ctx.send(isUp ? 'buy' : 'use', isUp ? { item: k, level: +b.dataset.level } : { item: k });
    b.classList.remove('busy');
    if (r?.state) setState(r.state);
    if (!r?.ok) { ctx.toast(r?.error || '사지 못했어요. 다시 눌러 볼까요?'); fx.shake(card); updateShop(); return; }
    ctx.sound.play('coin');
    if (isUp) {
      const t = shop.tracks.find(x => x.id === k), v = t.v[r.level];
      card.classList.remove('got'); void card.offsetWidth; card.classList.add('got');
      if (k === 'mult' || r.level >= 4) fx.heavy(k === 'mult' ? `×${v} 배수!` : '업그레이드!', k === 'mult' ? '#8C6CFF' : '#FF6F61');
      else fx.medium(card, `Lv.${r.level + 1}`, '#14A57A');
    } else {
      if (k === 'double') { fx.stamp('2배 타임!', '#8C6CFF'); }
      if (k === 'shield') fx.medium(card, '🛡️ 방패 준비!', '#3D8BFF');
      if (k === 'gift') {
        if (r.x >= 1.6) fx.heavy(`대박 +${won(r.gain)}`, '#FF9F43'); else fx.medium(card, `🎁 +${won(r.gain)}`, '#14A57A');
        fx.float(moneyPill, `+${won(r.gain)}`, '#14A57A');
      }
      if (k === 'cheer') { fx.medium(card, `🤝 ${r.mates}명 +${won(r.each)}`, '#FF6F91'); ctx.toast(`🤝 우리 팀 친구 ${r.mates}명에게 ${won(r.each)}씩 보냈어요!`); }
    }
  });
  const setSheet = open => {
    sheetOpen = open && !wide();
    el.querySelector('.sh-s').classList.toggle('sheet', sheetOpen);
    $('#sm-qnote', el).hidden = !(sheetOpen && quizOpen);
    if (sheetOpen) { shopEl.scrollTop = 0; ctx.sound.play('pick'); }
    updateShop();
    cancelAuto?.();
  };
  $('#sm-tab', el).onclick = () => setSheet(!sheetOpen);
  $('#sm-close', el).onclick = () => setSheet(false);
  $('#sm-back', el).onclick = () => setSheet(false);
  shopEl.addEventListener('pointerenter', () => { if (wide()) { hoverShop = true; cancelAuto?.(); } });
  shopEl.addEventListener('pointerleave', () => { hoverShop = false; });

  // ----- 상태 -----
  function setState(s) {
    if (!s || (st && s.now < st.now)) return;
    const first = !st;
    st = s;
    money.set(s.money, first); wallet.set(s.money, first);
    $('#sm-streak b', el).textContent = s.streak;
    $('#sm-streak', el).classList.toggle('hot', s.streak >= 3);
    doubleEnd = s.doubleLeft > 0 ? Date.now() + s.doubleLeft : 0;
    cheerEnd = s.cheerLeft > 0 ? Date.now() + s.cheerLeft : 0;
    $('#sm-shd', el).hidden = !s.shield;
    const lab = $('.quiz .qtop span', q); if (lab && quizOpen) lab.textContent = label();
    tickUI();
    updateShop();
  }
  const label = () => `❓ 맞히면 +${won(st?.next ?? 10)}${doubleEnd > Date.now() ? ' 🧲2배' : ''}`;
  function tickUI() {
    if (sheetOpen && quizOpen) { const tl = $('.quiz .tleft', q)?.textContent || ''; $('#sm-qleft', el).textContent = tl.replace('⏱', '').trim() ? `(${tl.replace('⏱', '').trim()} 남음)` : ''; }
    if (endsAt) $('#sm-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000);
    const d = $('#sm-dbl', el), left = doubleEnd - Date.now();
    d.hidden = left <= 0; if (left > 0) $('b', d).textContent = Math.ceil(left / 1000);
    if (doubleEnd && left <= 0) { doubleEnd = 0; updateShop(); }
    if (cheerEnd && cheerEnd <= Date.now()) { cheerEnd = 0; updateShop(); }
    else if (cheerEnd || doubleEnd) updateShop();
  }
  function mini() {
    const box = $('#sm-mini', el);
    const k = order.indexOf(ctx.me.pid);
    $('#sm-rank', el).textContent = k >= 0 ? `🏅 ${k + 1}등` : '🏅 -';
    if (teams.length) {
      const total = teamNow.reduce((s, t) => s + t.money, 0) || 1, mt = myTeam();
      box.innerHTML = `<div class="sh-tbar">${teamNow.map(t => `<i style="flex:${Math.max(t.money, total * 0.04)};background:${TEAM[t.k].color}"></i>`).join('')}</div>
        <div class="sh-tlist">${teamNow.map(t => `<span class="${t.k === mt ? 'me' : ''}">${TEAM[t.k].emoji} ${esc(TEAM[t.k].name)} <b>${won(t.money)}</b></span>`).join('')}</div>`;
    } else {
      box.innerHTML = top.length ? `<div class="sh-top">${top.slice(0, 3).map((t, i) => `<span class="${t.pid === ctx.me.pid ? 'me' : ''}">${['🥇', '🥈', '🥉'][i]} ${esc(t.name)} <b>${won(t.money)}</b></span>`).join('')}${k >= 3 ? `<span class="me">🏅 나 ${k + 1}등</span>` : ''}</div>` : '';
    }
    if (goal) box.insertAdjacentHTML('beforeend', `<div class="sh-goal">🏁 목표 ${won(goal)}${teams.length ? ' (팀 합계)' : ''}</div>`);
  }
  function teamPill() {
    const T = TEAM[myTeam()]; let p = $('#sm-team', el);
    if (!T) { p?.remove(); return; }
    if (!p) { p = h('<span class="pill sh-team" id="sm-team"></span>'); $('#sm-streak', el).before(p); }
    p.textContent = `${T.emoji} ${T.name}`; p.style.background = T.light;
  }

  // ----- 문제 흐름 -----
  async function afterCorrect() {
    if (!lastEarn) await Promise.race([new Promise(r => { earnWait = r; }), sleep(900)]);
    earnWait = null;
    const e = lastEarn; lastEarn = null;
    if (!e || !alive) return;
    const tr = id => shop?.tracks.find(t => t.id === id);
    const perQ = tr('perQ')?.v[st?.lv.perQ ?? 0] ?? 10, mult = tr('mult')?.v[st?.lv.mult ?? 0] ?? 1;
    const parts = [`문제당 ${won(perQ)}${mult !== 1 ? ` ×${mult}` : ''}`];
    if (e.bonus) parts.push(`🔥 연속 보너스 ${won(e.bonus / (e.doubled ? 2 : 1))}`);
    const can = affordable().sort((a, b) => a.price - b.price);
    q.innerHTML = `<div class="sticker sh-earn ${e.doubled ? 'dbl' : ''}"><div class="sh-earn-top">${ic('coin', 'xl')}<div><div class="sh-earn-amt">+${won(e.amount)}</div>
      <div class="sh-earn-parts">${esc(parts.join(' + '))}${e.doubled ? ' <b>🧲 ×2</b>' : ''}</div></div></div>
      ${e.streak >= 2 ? `<div class="sh-earn-streak">🔥 ${e.streak}연속 정답!</div>` : ''}
      ${can.length ? `<div class="sh-hint">💡 지금 살 수 있어요: <b>${esc(can[0].name)}</b> (${won(can[0].price)})</div>` : ''}
      <div class="sh-earn-btns"><button class="btn lemon lg sh-next" id="sm-next"><span>다음 문제 ▶</span><i class="sh-auto"></i></button>
      <button class="btn mint lg sh-goshop" id="sm-goshop">🛒 상점${can.length ? ` <i class="sh-dot">${can.length}</i>` : ''}</button></div></div>`;
    fixImgs(q);
    if (e.streak >= 5 && e.streak % 5 === 0) fx.stamp(`${e.streak}연속!`, '#FF9F43');
    // 3.5초 뒤 저절로 다음 문제. 상점을 열거나(태블릿) 상점 위에 마우스를 올리면(크롬북) 멈춤
    await new Promise(res => {
      let timer = 0;
      const go = () => { clearTimeout(timer); res(); };
      const stop = () => { clearTimeout(timer); $('.sh-auto', q)?.classList.add('off'); };
      $('#sm-next', el).onclick = go;
      $('#sm-goshop', el).onclick = () => {
        if (wide()) { shopEl.classList.remove('flash'); void shopEl.offsetWidth; shopEl.classList.add('flash'); shopEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        stop(); setSheet(true);
      };
      cancelAuto = stop; waitEnd = go;
      if (!sheetOpen && !hoverShop) { $('.sh-auto', q)?.classList.add('run'); timer = setTimeout(go, 3500); } else stop();
    });
    cancelAuto = null; waitEnd = null;
  }
  async function loop() {
    while (alive) {
      if (ended) { q.innerHTML = '<div class="sticker sh-wait">🏁 게임이 곧 끝나요!</div>'; await sleep(1500); continue; }
      q.innerHTML = '';
      quizOpen = true;
      $('#sm-qnote', el).hidden = !sheetOpen;
      const res = await ctx.quiz({ inline: true, container: q, label: label(), okDelay: 650, onOpen: l => { openQuiz = l; } });
      openQuiz = null; quizOpen = false; $('#sm-qnote', el).hidden = true;
      if (!alive) return;
      if (res === null) { q.innerHTML = '<div class="sticker sh-wait"><div class="big">⏳</div>잠깐만요…</div>'; await sleep(1200); continue; }
      if (res.ok) await afterCorrect();
      else await sleep(150);
    }
  }

  const clock = setInterval(tickUI, 250);
  // 화면을 돌리거나 창 크기를 바꿔 넓어지면 아래 상점 창을 닫는다
  const mq = matchMedia('(min-width: 900px)'), onMq = () => { if (mq.matches && sheetOpen) setSheet(false); };
  mq.addEventListener?.('change', onMq);
  const offs = [
    () => mq.removeEventListener?.('change', onMq),
    ctx.on('start', d => {
      shop = d.shop; teams = d.teams || []; goal = d.goal; penalty = d.penalty; endsAt = Date.now() + d.left;
      buildShop(); teamPill(); mini();
    }),
    ctx.on('me', setState),
    ctx.on('earn', e => {
      if (e.ok) {
        lastEarn = e; earnWait?.();
        fx.float(moneyPill, `+${won(e.amount)}`, '#14A57A');
        moneyPill.classList.remove('bump'); void moneyPill.offsetWidth; moneyPill.classList.add('bump');
        ctx.sound.play('coin');
      } else if (e.shielded) {
        fx.stamp('방패!', '#3D8BFF'); ctx.toast('🛡️ 방패가 지켜 줬어요! 연속이 그대로예요');
      } else {
        if (e.loss > 0) { fx.float(moneyPill, `-${won(e.loss)}`, '#D9483B'); fx.shake(moneyPill); }
        if (e.blocked > 0) ctx.toast(`☂️ 보험이 ${won(e.blocked)}을 막아 줬어요`);
        else if (e.lostStreak >= 3) ctx.toast(`🔥 ${e.lostStreak}연속이 끊겼어요. 다시 모아요!`);
      }
    }),
    ctx.on('cheer', d => {
      fx.float(moneyPill, `+${won(d.amount)}`, '#FF6F91');
      ctx.toast(`🤝 ${josa(d.by, '이', '가')} 응원했어요! +${won(d.amount)}`, 2600); ctx.sound.play('coin');
    }),
    ctx.on('board', d => { order = d.order || order; top = d.top || top; teamNow = d.teams || teamNow; if (d.left != null) endsAt = Date.now() + d.left; mini(); }),
    ctx.on('goal', d => {
      ended = true;
      const mine = d.pid === ctx.me.pid || (d.team != null && d.team === myTeam());
      fx.heavy(mine ? '목표 달성!' : '게임 끝!', mine ? '#2ED3A0' : '#FF6F61');
      ctx.toast(`🏁 ${josa(d.who, '이', '가')} 목표 금액을 모았어요!`, 3000);
      openQuiz?.closeQuiz?.(); waitEnd?.();
    }),
    ctx.onRoom(() => { teamPill(); mini(); }),
  ];
  if (st) { const s = st; st = null; setState(s); }
  buildShop(); teamPill(); mini();
  if (!st) ctx.send('state', {}).then(s => { if (s && !s.error) setState(s); });
  loop();
  return () => { alive = false; offs.forEach(f => f()); clearInterval(clock); money.stop(); wallet.stop(); openQuiz?.closeQuiz?.(); waitEnd?.(); };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  let shop = s0.shop || null, teams = s0.teams || [], goal = s0.goal || 0, endsAt = s0.left != null ? Date.now() + s0.left : 0;
  let list = s0.list || [], teamNow = s0.teamsNow || [];
  el.innerHTML = `<div class="sh-t">
    <div class="st-main sticker">
      <div class="st-head"><span class="sh-art"><img src="assets/modes/shop.webp" alt="" draggable="false"><em>💸</em></span><h1>퀴즈 부자</h1>
        <span class="grow"></span><div class="st-time">${ic('time')}<b id="st-time">-</b></div></div>
      <div id="st-top"></div>
      <div class="st-goal" id="st-goal" hidden></div>
      <div class="st-board" id="st-board"></div>
    </div>
    <div class="st-side">
      <div class="sticker"><h2>📈 지금까지</h2><div class="st-stats" id="st-stats"></div></div>
      <div class="sticker st-feedbox"><h2>📣 소식</h2><div class="feed" id="st-feed"></div></div>
      <button class="btn coral lg st-end" id="st-end">🏁 지금 끝내기</button>
    </div></div>`;
  fixImgs(el);
  ctx.music.start(150);
  const ava = pid => ctx.room.players.find(p => p.pid === pid)?.avatar;
  let totalC = null; const teamC = new Map();
  function renderTop() {
    const box = $('#st-top', el);
    if (teams.length) {
      if (!box.querySelector('.st-teams')) {
        box.innerHTML = `<div class="st-teams n${teams.length}">${teams.map(t => `<div class="st-team" data-k="${t.k}" style="--tc:${TEAM[t.k].color};--tl:${TEAM[t.k].light}">
          <div class="st-tname"><span class="em">${TEAM[t.k].emoji}</span>${esc(TEAM[t.k].name)}<span class="crown">👑</span></div>
          <div class="st-tmoney"><b>0원</b></div><div class="st-tbar"><i></i></div><div class="st-tmem"></div></div>`).join('')}</div>`;
        teamC.clear(); $$('.st-team', box).forEach(c => teamC.set(+c.dataset.k, counter($('.st-tmoney b', c))));
      }
      const max = Math.max(1, ...teamNow.map(t => t.money)), lead = teamNow.length ? teamNow.reduce((a, b) => (b.money > a.money ? b : a)) : null;
      for (const t of teamNow) {
        const c = $(`.st-team[data-k="${t.k}"]`, box); if (!c) continue;
        teamC.get(t.k)?.set(t.money);
        $('.st-tbar i', c).style.width = (t.money / max) * 100 + '%';
        $('.st-tmem', c).textContent = `${t.members}명`;
        c.classList.toggle('lead', !!lead && lead.k === t.k && t.money > 0);
      }
    } else {
      if (!totalC) { box.innerHTML = `<div class="st-total">${ic('coin', 'xl')}<div><small>우리 반 모두의 돈</small><b id="st-total">0원</b></div></div>`; fixImgs(box); totalC = counter($('#st-total', box), won, 900); }
      totalC.set(list.reduce((s, x) => s + x.money, 0));
    }
    const g = $('#st-goal', el);
    g.hidden = !goal;
    if (goal) {
      const best = teams.length ? [...teamNow].sort((a, b) => b.money - a.money)[0] : list[0];
      const who = best ? (teams.length ? `${TEAM[best.k].emoji} ${TEAM[best.k].name}` : best.name) : '';
      const v = best ? Math.min(100, (best.money / goal) * 100) : 0;
      g.innerHTML = `<span>🏁 목표 ${won(goal)}</span><div class="st-gbar"><i style="width:${v}%"></i></div><span>${esc(who)} ${Math.floor(v)}%</span>`;
    }
  }
  // 순위 줄은 한 번 만들고 순서·글자만 바꾼다 (아바타 그림이 깜빡이지 않게)
  const rows = new Map(); let lastRank = new Map();
  function renderBoard() {
    const box = $('#st-board', el), shown = list.slice(0, 15), max = Math.max(100, ...shown.map(x => x.money));
    if (!shown.length) { box.innerHTML = '<p class="muted center st-empty">학생들이 문제를 풀기 시작하면 순위가 보여요.</p>'; rows.clear(); return; }
    box.querySelector('.st-empty')?.remove();
    const keep = new Set(shown.map(x => x.pid));
    for (const [pid, r] of rows) if (!keep.has(pid)) { r.el.remove(); rows.delete(pid); }
    shown.forEach((x, i) => {
      let r = rows.get(x.pid);
      if (!r) {
        const e = h(`<div class="st-row"><span class="rk"></span>${avatarHTML(ava(x.pid), 'sm')}<span class="nm"></span><span class="tm"></span>
          <div class="track"><i></i></div><span class="bd"></span><b class="mo"></b></div>`);
        r = { el: e, mo: counter($('.mo', e)) }; rows.set(x.pid, r);
      }
      const e = r.el, T = TEAM[x.team];
      $('.rk', e).textContent = i + 1; $('.nm', e).textContent = x.name;
      $('.tm', e).textContent = T ? T.emoji : ''; e.style.setProperty('--tc', T ? T.color : 'var(--mint)');
      $('.track i', e).style.width = (x.money / max) * 100 + '%';
      $('.bd', e).textContent = `${x.mult > 1 ? '×' + x.mult : ''}${x.streak >= 3 ? ` 🔥${x.streak}` : ''}`;
      r.mo.set(x.money);
      e.className = `st-row ${i < 3 ? 'r' + (i + 1) : ''} ${x.online ? '' : 'off'}`;
      const before = lastRank.get(x.pid);
      if (before && before > i + 1) { e.classList.add('up'); setTimeout(() => e.classList.remove('up'), 700); }
      if (box.children[i] !== e) box.insertBefore(e, box.children[i] || null);
    });
    lastRank = new Map(shown.map((x, i) => [x.pid, i + 1]));
  }
  function stats() {
    const n = ctx.log.length, ok = ctx.log.filter(l => l.ok).length, up = list.reduce((s, x) => s + (x.lv || 0), 0);
    $('#st-stats', el).innerHTML = `<div class="stat"><b>${n}</b>푼 문제</div><div class="stat"><b>${pct(ok, n)}%</b>정답률</div>
      <div class="stat"><b>${ctx.room.players.filter(p => p.online).length}</b>참여</div><div class="stat"><b>${up}</b>업그레이드</div>`;
  }
  const addFeed = f => { const d = h(`<div>${esc(f.text)}</div>`); const box = $('#st-feed', el); box.prepend(d); while (box.children.length > 30) box.lastChild.remove(); };
  ctx.feed.slice(-15).forEach(addFeed);
  const tick = () => { if (endsAt) $('#st-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000); };
  const clock = setInterval(tick, 250);
  $('#st-end', el).onclick = () => { if (confirm('지금 끝내고 결과를 볼까요?')) ctx.end(); };
  const offs = [
    ctx.on('start', d => { shop = d.shop; teams = d.teams || []; goal = d.goal; endsAt = Date.now() + d.left; $('#st-top', el).innerHTML = ''; totalC = null; renderTop(); }),
    ctx.on('tboard', d => { list = d.list; teamNow = d.teams; if (d.left != null) endsAt = Date.now() + d.left; renderTop(); renderBoard(); stats(); }),
    ctx.on('buy', d => {
      const r = rows.get(d.pid)?.el; if (!r) return;
      r.classList.remove('buy'); void r.offsetWidth; r.classList.add('buy');
      const big = d.item === 'mult' || d.level >= 5;
      if (big) fx.medium(r, d.item === 'mult' ? '✖️ 배수 UP' : '⬆️ 업그레이드', '#8C6CFF');
    }),
    ctx.on('goal', d => { fx.heavy('목표 달성!', '#2ED3A0'); ctx.sound.play('win'); ctx.toast(`🏁 ${josa(d.who, '이', '가')} 목표 금액을 모았어요!`, 3000); }),
    ctx.onLog(stats), ctx.onFeed(f => { addFeed(f); if (/🏁|💰|🥇/.test(f.text)) ctx.sound.play('coin'); }), ctx.onRoom(stats),
  ];
  renderTop(); renderBoard(); stats(); tick();
  return () => { offs.forEach(f => f()); clearInterval(clock); totalC?.stop(); teamC.forEach(c => c.stop()); rows.forEach(r => r.mo.stop()); ctx.music.stop(); };
}
