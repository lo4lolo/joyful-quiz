// 낚시 대회: 맞히면 낚싯대를 던지고(cast), 바늘이 초록 칸에 올 때 감아서(reel) 무게 보너스. 점수 = kg
import { $, $$, esc, h, avatarHTML, fmtSec, pct, sleep, fx } from '../common.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/fishing.css">')); } };

// 서버 server/modes/fishing.js 와 같은 id (그림: assets/fish/<id>.png)
export const FISH = [
  ['minnow', '송사리', 'common', '🐟'], ['goldfish', '금붕어', 'common', '🐠'], ['mackerel', '고등어', 'common', '🐟'], ['carp', '붕어', 'common', '🐟'],
  ['clownfish', '흰동가리', 'rare', '🐠'], ['pufferfish', '복어', 'rare', '🐡'], ['squid', '오징어', 'rare', '🦑'], ['rainbow_trout', '무지개송어', 'rare', '🐟'],
  ['octopus2', '문어', 'epic', '🐙'], ['swordfish', '황새치', 'epic', '🦈'], ['whale_baby', '아기고래', 'legendary', '🐋'], ['golden_koi', '황금 잉어', 'legendary', '🐠'],
  ['boot', '낡은 장화', 'junk', '👢'], ['can', '빈 깡통', 'junk', '🥫'],
].map(([id, name, rarity, em]) => ({ id, name, rarity, em }));
const F = Object.fromEntries(FISH.map(f => [f.id, f]));
export const RAR = {
  common: { name: '흔한 물고기', c: '#8FA3C4' }, rare: { name: '희귀', c: '#3D8BFF' }, epic: { name: '대어', c: '#8C6CFF' },
  legendary: { name: '전설', c: '#FFB800' }, junk: { name: '잡동사니', c: '#A9784F' },
};
const Q_TEXT = { perfect: ['완벽해요!', '×1.5', '#14A57A'], good: ['좋아요!', '×1.2', '#2368D6'], miss: ['휴, 낚았다!', '×1.0', '#5B6B8C'] };
const LURE_MAX = 5, LURE_STEP = 2;

// 물고기 그림 (없으면 이모지). CSP 때문에 onerror 대신 addEventListener
const failed = new Set();
const fishHTML = (id, cls = '') => `<span class="fi-fish ${cls} fi-${esc(id)} ${failed.has(id) ? 'noimg' : ''}"><img src="assets/fish/${esc(id)}.png" alt="" draggable="false" data-id="${esc(id)}"><em>${F[id]?.em || '🐟'}</em></span>`;
function fixImgs(el) {
  $$('.fi-fish img', el).forEach(img => {
    if (img.dataset.fx) return; img.dataset.fx = '1';
    const bad = () => { failed.add(img.dataset.id); img.parentElement?.classList.add('noimg'); };
    img.addEventListener('error', bad, { once: true });
    if (img.complete && !img.naturalWidth) bad();
  });
}
const lurePips = (lure, xp) => Array.from({ length: LURE_MAX }, (_, i) => `<i class="${i < lure ? 'on' : i === lure && xp ? 'half' : ''}"></i>`).join('');
const kgStr = kg => (Math.round((+kg || 0) * 10) / 10).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const rarTag = r => `<span class="fi-rar" style="--rc:${RAR[r]?.c || '#8FA3C4'}">${esc(RAR[r]?.name || '')}</span>`;

// 물결 원 하나 (위치는 부모 기준 px)
function ripple(parent, x, y, big = false) {
  const r = document.createElement('i'); r.className = 'fi-ring' + (big ? ' big' : '');
  r.style.left = x + 'px'; r.style.top = y + 'px'; parent.append(r); setTimeout(() => r.remove(), 1300);
}

// 이벤트 띠 (학생·교사 공용)
function bannerHTML(ev, left) {
  const s = Math.max(0, Math.ceil(left / 1000));
  if (!ev) return '';
  if (ev.phase === 'warn') return ev.kind === 'koi' ? `<b>✨ 곧 황금 잉어가 나타나요!</b><span class="cd">${s}</span>` : `<b>🐟 곧 물고기 떼가 와요!</b><span class="cd">${s}</span>`;
  return ev.kind === 'koi' ? `<b>✨ 황금 잉어 출현!</b><small>가장 먼저 낚는 사람이 주인!</small><span class="cd">${s}</span>`
    : `<b>🐟 물고기 떼!</b><small>무게 ×2</small><span class="cd">${s}</span>`;
}

// ================= 학생 =================
export function mountStudent(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  let alive = true, kg = s0.kg || 0, count = s0.count || 0, lure = s0.lure || 1, xp = s0.xp || 0, dex = s0.dex || {};
  let canCast = !!s0.canCast, hook = s0.hook || null, endAt = s0.endsIn != null ? Date.now() + s0.endsIn : 0, ended = false;
  let ev = null, evAt = 0; // evAt: 지금 단계가 끝나는(또는 시작하는) 이 기기 시각
  let openQuiz = null, keyFn = null, raf = 0, bobOut = false;
  const me = ctx.room.players.find(p => p.pid === ctx.me.pid);
  el.innerHTML = `<div class="fi-s">
    <div class="fi-scene" aria-hidden="true">
      <div class="fi-sky"><i class="fi-sun"></i><i class="fi-cloud c1"></i><i class="fi-cloud c2"></i></div>
      <div class="fi-water"><i class="fi-shadow s1"></i><i class="fi-shadow s2"></i><i class="fi-lily l1"></i><i class="fi-lily l2"></i>
        <i class="fi-amb a1"></i><i class="fi-amb a2"></i><i class="fi-amb a3"></i><div class="fi-school"></div></div>
      <svg class="fi-line"><path d=""/></svg>
      <div class="fi-boat"><div class="fi-rider">${avatarHTML(me?.avatar || ctx.me.avatar, 'lg')}</div><i class="fi-rod"><b class="fi-tip"></b></i><div class="fi-hull"></div></div>
      <div class="fi-bob" hidden><i></i></div><div class="fi-struggle" hidden></div>
    </div>
    <div class="hud"><span class="pill fi-kgpill">🎣 <b id="fs-kg">0</b><small>kg</small></span><span class="pill" id="fs-rank">🏅 -</span>
      <span class="pill fi-lure" id="fs-lure" title="연속으로 맞히면 미끼가 좋아져요">🪱 미끼 <span class="pips" id="fs-pips"></span></span>
      <span class="grow"></span><span class="pill">⏱ <b id="fs-time">-</b></span></div>
    <div class="fi-banner" id="fs-banner" hidden></div>
    <div class="fi-main" id="fs-main"></div>
    <button class="btn sm fi-dexbtn" id="fs-dexbtn">📖 도감 <b id="fs-dexn">0</b>/${FISH.length}</button>
  </div>`;
  const root = $('.fi-s', el), main = $('#fs-main', el), scene = $('.fi-scene', el), bob = $('.fi-bob', el), line = $('.fi-line path', el), strug = $('.fi-struggle', el);
  const boat = $('.fi-boat', el), water = $('.fi-water', el);

  const setKg = (v, pop) => { kg = v; const b = $('#fs-kg', el); b.textContent = kgStr(kg); if (pop) fx.float(b, pop, '#2368D6'); };
  const setLure = (l, x) => { lure = l; xp = x; $('#fs-pips', el).innerHTML = lurePips(lure, xp); $('#fs-lure', el).classList.toggle('max', lure >= LURE_MAX); };
  const setDex = () => { $('#fs-dexn', el).textContent = Object.keys(dex).length; };
  setKg(kg); setLure(lure, xp); setDex();

  // ----- 낚싯줄: 낚싯대 끝 → 찌 -----
  function drawLine() {
    const sr = scene.getBoundingClientRect(), tip = $('.fi-tip', el).getBoundingClientRect();
    if (!bobOut) { line.setAttribute('d', ''); return; }
    const br = bob.getBoundingClientRect();
    const x1 = tip.left - sr.left, y1 = tip.top - sr.top, x2 = br.left + br.width / 2 - sr.left, y2 = br.top + br.height * .35 - sr.top;
    const sag = root.classList.contains('taut') ? 0 : Math.min(60, Math.abs(x2 - x1) * .18);
    line.setAttribute('d', `M${x1.toFixed(1)},${y1.toFixed(1)} Q${((x1 + x2) / 2).toFixed(1)},${(Math.max(y1, y2) + sag).toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`);
  }
  const frame = () => { drawLine(); raf = bobOut && alive ? requestAnimationFrame(frame) : 0; };
  const startLine = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const onResize = () => drawLine();
  addEventListener('resize', onResize);

  // 찌 던지기 애니메이션
  async function throwBob() {
    root.classList.add('casting'); setTimeout(() => root.classList.remove('casting'), 600);
    bob.hidden = false; bob.className = 'fi-bob'; bobOut = true; startLine();
    const tip = $('.fi-tip', el).getBoundingClientRect(), br = bob.getBoundingClientRect();
    const dx = tip.left - (br.left + br.width / 2), dy = tip.top - (br.top + br.height / 2);
    ctx.sound.play('boost');
    try { // 탭이 가려져 애니메이션이 멈춰도 게임은 계속되게 시간 제한
      const an = bob.animate([{ transform: `translate(${dx}px,${dy}px) scale(.5)` }, { transform: `translate(${dx * .45}px,${dy * .45 - 140}px) scale(1.1)`, offset: .5 }, { transform: 'translate(0,0) scale(1)' }],
        { duration: 700, easing: 'cubic-bezier(.3,.6,.5,1)' });
      await Promise.race([an.finished, sleep(900)]);
      an.finish();
    } catch {}
    const sr = scene.getBoundingClientRect(), b2 = bob.getBoundingClientRect();
    ripple(scene, b2.left + b2.width / 2 - sr.left, b2.top + b2.height * .7 - sr.top, true);
    ctx.sound.play('hit');
    bob.classList.add('float');
  }
  function reelIn() { bob.hidden = true; bobOut = false; strug.hidden = true; root.classList.remove('taut', 'biting'); drawLine(); }

  // ----- 화면 단계 -----
  const waitKeyOrClick = (btn, ms) => new Promise(res => {
    let done = false; const go = () => { if (done) return; done = true; keyFn = null; clearTimeout(t); res(); };
    const t = ms ? setTimeout(go, ms) : 0;
    btn?.addEventListener('click', go);
    keyFn = e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); go(); } };
  });

  async function castCard() {
    const big = ev?.phase === 'on';
    main.innerHTML = `<div class="sticker fi-card fi-castcard"><div class="fi-cardhead">⭕ 정답! ${big ? (ev.kind === 'koi' ? '✨ 황금 잉어를 노려요!' : '🐟 물고기 떼 시간이에요!') : '낚싯대를 던져요'}</div>
      <button class="btn xl lemon fi-castbtn" id="fs-cast">🎣 던지기!</button><div class="muted small sys">버튼을 누르거나 스페이스 키</div></div>`;
    const b = $('#fs-cast', main);
    await waitKeyOrClick(b, 6000);
    if (!alive) return false;
    fx.light(b);
    b.disabled = true;
    return true;
  }

  // 감기 놀이: 바늘이 왔다 갔다. 초록 칸에서 누르면 good, 가운데 노랑이면 perfect. 놓쳐도 물고기는 받는다.
  function reelGame(c) {
    return new Promise(resolve => {
      const period = { common: 1050, rare: 880, epic: 760, legendary: 680, junk: 1150 }[c.rarity] || 1000;
      const gw = c.rarity === 'legendary' || c.rarity === 'epic' ? 26 : 32, pw = 9;
      const center = 22 + Math.random() * 56;
      const title = c.koi ? '✨ 황금 잉어가 걸렸어요!' : c.rarity === 'legendary' || c.rarity === 'epic' ? '🌊 엄청 묵직해요!' : c.rarity === 'junk' ? '🤔 뭔가 이상한 게 걸렸어요…' : '🎣 입질이 왔어요!';
      main.innerHTML = `<div class="sticker fi-card fi-reel ${c.koi ? 'koi' : ''}"><div class="fi-cardhead">${title}</div>
        <div class="fi-meter"><i class="good" style="left:${center - gw / 2}%;width:${gw}%"></i><i class="perfect" style="left:${center - pw / 2}%;width:${pw}%"></i><b class="needle"></b></div>
        <button class="btn xl blue fi-reelbtn" id="fs-reel">🌀 감기!</button><div class="muted small sys">바늘이 <b class="fi-g">초록 칸</b>에 왔을 때 눌러요 (가운데 <b class="fi-y">노랑</b>은 완벽!)</div></div>`;
      const needle = $('.needle', main), btn = $('#fs-reel', main), card = $('.fi-reel', main);
      const t0 = performance.now(); let done = false, rf = 0, pos = 0;
      const step = () => {
        const t = (performance.now() - t0) / period, ph = t % 2;
        pos = (ph < 1 ? ph : 2 - ph) * 100;
        needle.style.left = pos + '%';
        if (!done) rf = requestAnimationFrame(step);
      };
      step();
      const finish = auto => {
        if (done) return; done = true; cancelAnimationFrame(rf); keyFn = null; clearTimeout(timer);
        const d = Math.abs(pos - center);
        const q = auto ? 'miss' : d <= pw / 2 + 1 ? 'perfect' : d <= gw / 2 + 1 ? 'good' : 'miss';
        card.classList.add('q-' + q); btn.disabled = true;
        const [t1, t2, col] = Q_TEXT[q];
        fx.float(needle, `${t1} ${t2}`, col);
        if (q === 'perfect') fx.medium(card); else if (q === 'good') fx.light(card);
        setTimeout(() => resolve(q), 450);
      };
      const timer = setTimeout(() => finish(true), 6500);
      const tap = e => { if (performance.now() - t0 < 250) return; e?.preventDefault?.(); finish(false); };
      card.addEventListener('pointerdown', tap);
      keyFn = e => { if (e.key === ' ' || e.key === 'Enter') tap(e); };
    });
  }

  async function revealCard(r) {
    const f = F[r.id] || { name: r.name, em: '🐟' }, big = r.rarity === 'epic' || r.rarity === 'legendary';
    const [qt, qm] = Q_TEXT[r.quality] || Q_TEXT.miss;
    main.innerHTML = `<div class="sticker fi-card fi-reveal r-${esc(r.rarity)}" style="--rc:${RAR[r.rarity]?.c}">
      <div class="fi-ribbon">${rarTag(r.rarity)}${r.isNew ? '<span class="fi-new">NEW! 도감 +1</span>' : ''}</div>
      <div class="fi-catchimg">${fishHTML(r.id, 'xl pop')}</div>
      <div class="fi-cname">${esc(f.name || r.name)}</div>
      <div class="fi-ckg"><b>${kgStr(r.kg)}</b>kg</div>
      <div class="fi-badges"><span class="badge ${r.quality === 'perfect' ? 'g' : r.quality === 'good' ? 'b' : ''}">${qt} ${qm}</span>${r.frenzy ? '<span class="badge y">🐟 물고기 떼 ×2</span>' : ''}${r.koi ? '<span class="badge y">✨ 황금 잉어의 주인!</span>' : ''}</div>
      ${r.msg ? `<p class="fi-junk">${esc(r.msg)}</p>` : ''}
      <button class="btn lg blue" id="fs-next">다음 문제 ▶</button></div>`;
    fixImgs(main);
    const card = $('.fi-reveal', main);
    if (r.koi || r.rarity === 'legendary') { fx.heavy(r.koi ? '황금 잉어!' : '전설의 물고기!', '#FFB800'); ctx.sound.play('win'); }
    else if (r.rarity === 'epic') { fx.heavy('대어!', '#8C6CFF'); }
    else if (r.rarity === 'junk') { fx.shake(card); ctx.sound.play('lose'); }
    else { fx.medium($('.fi-catchimg', card), `+${kgStr(r.kg)}kg`, '#2368D6'); ctx.sound.play('coin'); }
    if (r.rarity !== 'junk' && navigator.vibrate) try { navigator.vibrate(big ? [40, 40, 80] : 30); } catch {}
    await waitKeyOrClick($('#fs-next', main), big || r.koi ? 4500 : r.isNew ? 3600 : 3000);
  }

  async function fishOnce() {
    let c = hook;
    if (!c) {
      if (!(await castCard())) return;
      const [a] = await Promise.all([ctx.send('cast', {}), throwBob()]);
      if (!alive) return;
      if (a?.error || !a?.catch) { canCast = false; reelIn(); if (a?.error) ctx.toast(a.error); return; }
      c = a.catch;
    } else { // 다시 접속: 이미 걸린 물고기
      await throwBob();
    }
    hook = c; canCast = false;
    main.innerHTML = `<div class="sticker fi-card fi-wait"><div class="fi-cardhead">…찌를 보고 있어요</div><div class="fi-dots"><i></i><i></i><i></i></div></div>`;
    await sleep(600 + Math.random() * 900);
    if (!alive) return;
    // 입질!
    root.classList.add('biting', 'taut'); bob.classList.add('bite'); strug.hidden = false;
    const br = bob.getBoundingClientRect(), sr = scene.getBoundingClientRect();
    strug.style.left = (br.left - sr.left + br.width / 2) + 'px'; strug.style.top = (br.top - sr.top + br.height) + 'px';
    strug.className = 'fi-struggle r-' + c.rarity;
    ctx.sound.play('tick'); if (navigator.vibrate) try { navigator.vibrate(25); } catch {}
    const quality = await reelGame(c);
    if (!alive) return;
    let a = await ctx.send('reel', { quality });
    if (a?.error && /연결/.test(a.error)) a = await ctx.send('reel', { quality }); // 느린 연결이면 한 번 더
    reelIn();
    hook = null;
    if (!alive || !a?.res) return; // 응답이 없으면 순위판(board)이 무게를 맞춰 줌
    const r = a.res;
    dex = a.dex || dex; count = r.count; setDex();
    setKg(r.total);
    if (a.lure) setLure(a.lure, a.xp ?? xp);
    await revealCard(r);
  }

  function tangled() {
    $('.fi-tangle', boat)?.remove();
    const b = h('<div class="fi-tangle">🧶 줄이 엉켰어요!</div>'); boat.append(b); setTimeout(() => b.remove(), 1800);
    fx.shake($('.fi-rider', boat));
  }

  async function loop() {
    while (alive) {
      if (ended) return;
      if (canCast || hook) { await fishOnce(); continue; }
      main.innerHTML = '';
      const label = ev?.phase === 'on' ? (ev.kind === 'koi' ? '✨ 황금 잉어! 맞히고 먼저 낚아요' : '🐟 물고기 떼! 맞히면 무게 ×2') : '❓ 맞히면 낚싯대를 던져요';
      const res = await ctx.quiz({ inline: true, container: main, label, okDelay: 450, onOpen: l => { openQuiz = l; } });
      openQuiz = null;
      if (!alive) return;
      if (res === null || res.error) {
        if (endAt && Date.now() >= endAt - 500) { ended = true; main.innerHTML = `<div class="sticker fi-card fi-wait"><div class="fi-cardhead">⏳ 시간이 다 됐어요! 결과를 기다려요</div></div>`; return; }
        main.innerHTML = `<div class="sticker fi-card fi-wait"><div class="fi-cardhead">⏳ 잠깐만요…</div></div>`;
        await sleep(1200); continue;
      }
      if (res.ok) canCast = true; else tangled();
    }
  }

  // ----- 이벤트 띠 -----
  const banner = $('#fs-banner', el);
  function setEvent(e) {
    ev = e && e.kind ? e : null;
    root.classList.toggle('frenzy', ev?.kind === 'frenzy' && ev.phase === 'on');
    root.classList.toggle('koi', ev?.kind === 'koi' && ev.phase === 'on');
    if (!ev) { banner.hidden = true; return; }
    evAt = Date.now() + (ev.phase === 'warn' ? ev.startsIn : ev.leftMs);
    banner.className = `fi-banner ${ev.kind} ${ev.phase}`; banner.hidden = false; banner.innerHTML = bannerHTML(ev, evAt - Date.now());
    if (ev.phase === 'on') { school(ev.kind); ctx.sound.play('go'); }
  }
  function school(kind) {
    const box = $('.fi-school', el); box.innerHTML = '';
    const ems = kind === 'koi' ? ['✨', '🐠', '✨'] : ['🐟', '🐠', '🐟', '🐡', '🐟', '🐠', '🐟', '🐟'];
    ems.forEach((e, i) => { const s = document.createElement('span'); s.textContent = e; s.style.top = (8 + (i * 37) % 80) + '%'; s.style.animationDelay = (i * .45) + 's'; if (kind === 'koi' && e === '🐠') s.className = 'gold'; box.append(s); });
  }

  const clock = setInterval(() => {
    if (endAt) $('#fs-time', el).textContent = fmtSec((endAt - Date.now()) / 1000);
    if (ev) banner.querySelector('.cd') && (banner.querySelector('.cd').textContent = Math.max(0, Math.ceil((evAt - Date.now()) / 1000)));
  }, 250);

  // ----- 도감 -----
  function openDex() {
    const n = Object.keys(dex).length;
    const box = h(`<div class="fi-dex"><div class="sticker fi-dexcard"><h2>📖 오늘의 물고기 도감 <span class="badge y">${n} / ${FISH.length}</span><span class="grow"></span><button class="btn sm ghost" id="fs-dexx">닫기 ✕</button></h2>
      <div class="fi-dexgrid">${FISH.map(f => { const d = dex[f.id]; return `<div class="fi-dexitem ${d ? 'got' : 'no'}" style="--rc:${RAR[f.rarity].c}">${fishHTML(f.id, d ? '' : 'sil')}
        <b>${d ? esc(f.name) : '???'}</b><small>${d ? `최고 ${kgStr(d.best)}kg · ${d.n}마리` : esc(RAR[f.rarity].name)}</small></div>`; }).join('')}</div></div></div>`);
    el.append(box); fixImgs(box);
    const close = () => box.remove();
    $('#fs-dexx', box).onclick = close;
    box.addEventListener('click', e => { if (e.target === box) close(); });
  }
  $('#fs-dexbtn', el).onclick = openDex;

  const onKey = e => { if (keyFn && !(e.target instanceof HTMLInputElement)) keyFn(e); };
  document.addEventListener('keydown', onKey);

  function myRank(all) {
    const k = (all || []).findIndex(x => x[0] === ctx.me.pid);
    if (k < 0) return;
    $('#fs-rank', el).textContent = `🏅 ${k + 1}등`;
    if (!hook && !canCast && !main.querySelector('.fi-reveal') && Math.abs(all[k][1] - kg) > .05) setKg(all[k][1]);
  }
  const offs = [
    ctx.on('start', d => { endAt = Date.now() + d.endsIn; }),
    ctx.on('board', d => {
      endAt = Date.now() + d.endsIn; myRank(d.all);
      if ((ev?.id ?? null) !== (d.ev?.id ?? null) || ev?.phase !== d.ev?.phase) setEvent(d.ev);
    }),
    ctx.on('lure', d => {
      const before = lure; setLure(d.lure, d.xp);
      if (d.up) { fx.float($('#fs-lure', el), lure >= LURE_MAX ? '최고 미끼! 🌟' : '미끼 UP! 🪱', '#14A57A'); ctx.sound.play('coin'); }
      else if (d.down && before > d.lure) fx.shake($('#fs-lure', el));
    }),
    ctx.on('event', d => {
      if (d.kind) return setEvent(d);
      setEvent(null);
      if (d.ended === 'koi' && d.winner && d.winner !== ctx.me.name && !d.escaped) ctx.toast(`✨ ${d.winner}이(가) 황금 잉어를 낚았어요!`, 3000);
      else if (d.escaped) ctx.toast('✨ 황금 잉어가 도망갔어요…', 2500);
      else if (d.ended === 'frenzy') ctx.toast('🐟 물고기 떼가 지나갔어요', 2000);
    }),
    ctx.on('big', d => { if (d.pid !== ctx.me.pid) ctx.toast(`${F[d.id]?.em || '🐟'} ${d.name} ${d.fish} ${kgStr(d.kg)}kg!`, 2600); }),
    ctx.on('goal', d => { ctx.toast(d.pid === ctx.me.pid ? `🏆 목표 ${d.goal}kg 달성!` : `🏆 ${d.name} 목표 ${d.goal}kg 달성! 곧 끝나요`, 3000); if (d.pid === ctx.me.pid) fx.heavy('목표 달성!', '#FF6F61'); }),
  ];
  if (s0.ev) setEvent(s0.ev);
  if (s0.all) myRank(s0.all);
  loop();
  return () => {
    alive = false; offs.forEach(f => f()); clearInterval(clock); cancelAnimationFrame(raf); keyFn = null;
    document.removeEventListener('keydown', onKey); removeEventListener('resize', onResize); openQuiz?.closeQuiz?.();
  };
}

// ================= 선생님 (TV) =================
export function mountTeacher(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  let top = s0.top || [], big = s0.big || [], all = s0.all || [], total = s0.total || 0, catches = s0.catches || 0;
  let endAt = s0.endsIn != null ? Date.now() + s0.endsIn : 0, ev = null, evAt = 0;
  const goal = ctx.room.settings.goal || 0;
  el.innerHTML = `<div class="fi-t">
    <div class="ft-left">
      <div class="sticker ft-pond" id="ft-pond"><div class="fi-sky"><i class="fi-sun"></i><i class="fi-cloud c1"></i><i class="fi-cloud c2"></i></div>
        <div class="fi-water"><i class="fi-shadow s1"></i><i class="fi-shadow s2"></i><i class="fi-shadow s3"></i><i class="fi-lily l1"></i><i class="fi-lily l2"></i>
          <i class="fi-amb a1"></i><i class="fi-amb a2"></i><i class="fi-amb a3"></i><div class="fi-school"></div></div>
        <h1 class="ft-title">🎣 낚시 대회</h1><div class="fi-banner ft-banner" id="ft-banner" hidden></div>
        <div class="ft-dock"></div><div class="ft-shore" id="ft-shore"></div><div class="ft-bigpop" id="ft-bigpop"></div></div>
      <div class="sticker ft-board"><h2>🏆 무게 순위 <small class="muted sys" id="ft-n"></small></h2><div class="ft-rows" id="ft-rows"></div></div>
    </div>
    <div class="ft-side">
      <div class="sticker ft-time"><span>⏱ 남은 시간</span><b id="ft-time">-</b>
        ${goal ? `<div class="ft-goal"><span>🏆 목표 ${goal.toLocaleString()}kg</span><div class="ft-gbar"><i id="ft-gbar"></i></div></div>` : ''}</div>
      <div class="sticker ft-bigs"><h2>🐋 오늘의 대어</h2><div id="ft-big"></div></div>
      <div class="sticker ft-statbox"><div class="ft-stats" id="ft-stats"></div></div>
      <div class="sticker ft-feedbox"><h2>📣 소식</h2><div class="feed" id="ft-feed"></div></div>
      <div class="ft-btns"><button class="btn blue" id="ft-frenzy">🐟 물고기 떼 부르기</button><button class="btn lemon" id="ft-koi">✨ 황금 잉어 부르기</button>
        <button class="btn coral lg" id="ft-end">🏁 지금 끝내기</button></div>
    </div></div>`;
  ctx.music.start(118);
  const pond = $('#ft-pond', el), shore = $('#ft-shore', el);
  const players = () => ctx.room.players || [];
  const ava = pid => players().find(p => p.pid === pid)?.avatar;

  // 물가에 모두의 스티커
  let shoreKey = '';
  function drawShore() {
    const ps = players();
    const key = ps.map(p => p.pid + (p.online ? 1 : 0) + (p.avatar?.char || p.avatar?.face || '')).join('|');
    if (key === shoreKey) return; shoreKey = key;
    const n = ps.length, rows = n <= 14 ? 1 : n <= 30 ? 2 : 3, per = Math.ceil(n / rows) || 1;
    pond.style.setProperty('--rows', rows);
    shore.innerHTML = ps.map((p, i) => {
      const r = Math.floor(i / per), c = i % per, x = ((c + (r % 2 ? .75 : .25) + .25) / (per + .25)) * 100;
      return `<div class="ft-angler ${p.online ? '' : 'off'}" data-pid="${esc(p.pid)}" style="left:${x.toFixed(2)}%;--r:${r}"><i class="ft-rod"></i>${avatarHTML(p.avatar, 'sm')}<span class="nm">${esc(p.name)}</span></div>`;
    }).join('');
  }
  function drawBoard() {
    const max = Math.max(1, ...top.map(t => t.kg));
    $('#ft-rows', el).innerHTML = top.slice(0, 15).map((t, i) => `<div class="brow ${i < 3 ? 'r' + (i + 1) : ''}"><span class="rk">${i + 1}</span>${avatarHTML(ava(t.pid) || t.avatar, 'sm')}
      <span class="nm">${esc(t.name)}</span><span class="ft-best">${t.best ? fishHTML(t.best.id, 'mini') : ''}</span><span class="ft-cnt">${t.count}마리</span>
      <span class="ft-bar"><i style="width:${(t.kg / max) * 100}%"></i></span><span class="sc">${kgStr(t.kg)}<small>kg</small></span></div>`).join('')
      || '<p class="muted center sys">학생들이 문제를 맞히면 물고기가 올라와요 🎣</p>';
    fixImgs($('#ft-rows', el));
    $('#ft-n', el).textContent = `${players().filter(p => p.online).length}명 참여`;
    if (goal) $('#ft-gbar', el).style.width = Math.min(100, ((top[0]?.kg || 0) / goal) * 100) + '%';
  }
  function drawBig() {
    $('#ft-big', el).innerHTML = big.slice(0, 5).map((b, i) => `<div class="ft-bigrow" style="--rc:${RAR[b.rarity]?.c}"><span class="rk">${['🥇', '🥈', '🥉', '4', '5'][i]}</span>${fishHTML(b.id, 'mini')}
      <span class="nm"><b>${esc(F[b.id]?.name || b.fish)}</b><small>${esc(b.name)}</small></span><span class="sc">${kgStr(b.kg)}kg</span></div>`).join('')
      || '<p class="muted sys small">아직 대어가 없어요</p>';
    fixImgs($('#ft-big', el));
  }
  function stats() {
    const n = ctx.log.length, ok = ctx.log.filter(l => l.ok).length;
    $('#ft-stats', el).innerHTML = `<div class="stat"><b>${catches.toLocaleString()}</b>낚은 물고기</div><div class="stat"><b>${kgStr(total)}</b>모두 kg</div><div class="stat"><b>${pct(ok, n)}%</b>정답률</div>`;
  }
  const addFeed = f => { const box = $('#ft-feed', el); box.prepend(h(`<div>${esc(f.text)}</div>`)); while (box.children.length > 30) box.lastChild.remove(); };
  ctx.feed.slice(-15).forEach(addFeed);

  // 낚을 때마다 그 학생 스티커 위로 물고기가 튀어 오름
  let lastSnd = 0;
  function onCatch(d) {
    catches++; total = Math.round((total + d.kg) * 10) / 10; stats();
    const a = shore.querySelector(`[data-pid="${CSS.escape(d.pid)}"]`);
    if (a) {
      const pop = h(`<div class="ft-pop r-${esc(d.rarity)}">${fishHTML(d.id, 'mini')}<b>+${kgStr(d.kg)}</b></div>`);
      a.append(pop); fixImgs(pop); setTimeout(() => pop.remove(), 1800);
      a.classList.remove('jump'); void a.offsetWidth; a.classList.add('jump');
      const pr = pond.getBoundingClientRect(), ar = a.getBoundingClientRect();
      ripple(pond, ar.left - pr.left + ar.width / 2, ar.top - pr.top - 6);
    }
    const isBig = d.rarity === 'legendary' || d.rarity === 'epic' || d.koi;
    if (isBig) {
      const box = $('#ft-bigpop', el);
      box.innerHTML = `<div class="sticker ft-bigcard r-${esc(d.rarity)}" style="--rc:${RAR[d.rarity]?.c}">${avatarHTML(ava(d.pid), '')}${fishHTML(d.id, 'lg')}
        <div class="txt"><small>${rarTag(d.rarity)}</small><b>${esc(d.player)}</b><em>${esc(F[d.id]?.name || d.name)} ${kgStr(d.kg)}kg!</em></div></div>`;
      fixImgs(box); clearTimeout(onCatch.t); onCatch.t = setTimeout(() => { box.innerHTML = ''; }, 3500);
      ctx.sound.play('win');
    } else if (Date.now() - lastSnd > 500) { lastSnd = Date.now(); ctx.sound.play(d.rarity === 'junk' ? 'pick' : 'coin'); }
  }

  const banner = $('#ft-banner', el);
  function setEvent(e) {
    ev = e && e.kind ? e : null;
    pond.classList.toggle('frenzy', ev?.kind === 'frenzy' && ev.phase === 'on');
    pond.classList.toggle('koi', ev?.kind === 'koi' && ev.phase === 'on');
    $('#ft-frenzy', el).disabled = $('#ft-koi', el).disabled = !!ev;
    if (!ev) { banner.hidden = true; return; }
    evAt = Date.now() + (ev.phase === 'warn' ? ev.startsIn : ev.leftMs);
    banner.className = `fi-banner ft-banner ${ev.kind} ${ev.phase}`; banner.hidden = false; banner.innerHTML = bannerHTML(ev, evAt - Date.now());
    if (ev.phase === 'on') {
      const box = $('.fi-school', pond); box.innerHTML = '';
      (ev.kind === 'koi' ? ['✨', '🐠', '✨', '✨'] : ['🐟', '🐠', '🐟', '🐡', '🐟', '🐠', '🐟', '🐟', '🐠', '🐟']).forEach((m, i) => {
        const s = document.createElement('span'); s.textContent = m; s.style.top = (6 + (i * 29) % 70) + '%'; s.style.animationDelay = (i * .4) + 's'; if (ev.kind === 'koi' && m === '🐠') s.className = 'gold'; box.append(s);
      });
      ctx.sound.play('go');
    }
  }
  const clock = setInterval(() => {
    if (endAt) $('#ft-time', el).textContent = fmtSec((endAt - Date.now()) / 1000);
    const cd = ev && banner.querySelector('.cd'); if (cd) cd.textContent = Math.max(0, Math.ceil((evAt - Date.now()) / 1000));
  }, 250);
  const callEvent = async kind => { const r = await ctx.send('event', { kind }); if (r?.error) ctx.toast(r.error); };
  $('#ft-frenzy', el).onclick = () => callEvent('frenzy');
  $('#ft-koi', el).onclick = () => callEvent('koi');
  $('#ft-end', el).onclick = () => { if (confirm('지금 끝내고 결과를 볼까요?')) ctx.end(); };

  const offs = [
    ctx.on('start', d => { endAt = Date.now() + d.endsIn; }),
    ctx.on('board', d => {
      endAt = Date.now() + d.endsIn; top = d.top; big = d.big; all = d.all; total = d.total; catches = d.catches;
      drawBoard(); drawBig(); stats();
      if ((ev?.id ?? null) !== (d.ev?.id ?? null) || ev?.phase !== d.ev?.phase) setEvent(d.ev);
    }),
    ctx.on('catch', onCatch),
    ctx.on('event', d => {
      setEvent(d.kind ? d : null);
    }),
    ctx.on('koi', d => fx.heavy('황금 잉어!', '#FFB800')),
    ctx.on('goal', d => { fx.heavy('목표 달성!', '#FF6F61'); ctx.toast(`🏆 ${d.name} 목표 ${d.goal}kg 달성!`, 3000); }),
    ctx.onRoom(() => { drawShore(); }), ctx.onLog(stats), ctx.onFeed(addFeed),
  ];
  drawShore(); drawBoard(); drawBig(); stats();
  if (s0.ev) setEvent(s0.ev);
  return () => { offs.forEach(f => f()); clearInterval(clock); clearTimeout(onCatch.t); ctx.music.stop(); };
}
