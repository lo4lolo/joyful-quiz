// 보물 상자: 맞히면 상자 3개 중 하나를 연다
import { $, $$, esc, h, avatarHTML, fmtSec, pct, sleep, confetti } from '../common.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/chest.css">')); } };
const IMG = ['assets/img/chest_wood.webp', 'assets/img/chest_silver.webp', 'assets/img/chest_gold.webp'];
const chestImg = (i, cls = '') => `<span class="chest-img ${cls}"><img src="${IMG[i % 3]}" alt="" draggable="false"><em>🎁</em></span>`;
// 그림 파일이 없으면 이모지로
const fixImgs = el => $$('img', el).forEach(img => img.addEventListener('error', () => img.parentElement.classList.add('noimg'), { once: true }));

export const LABEL = {
  gold: r => ['💰', `+${r.amount} 골드`], 'gold+': r => ['💰', `+${r.amount} 골드!`], big: r => ['🤑', `대박! +${r.amount}`],
  x2: () => ['✖️2', '골드 두 배!'], x3: () => ['✖️3', '골드 세 배!!'], nothing: () => ['🕸️', '텅 빈 상자…'],
  lose: r => ['💸', `골드 ${r.pct}% 잃음`], steal: r => ['🦝', `${r.pct}% 가져오기!`], swap: () => ['🔄', '골드 바꾸기!'],
  gift: r => ['🎁', `선물 +${r.amount} (친구도!)`], bonusq: () => ['🍀', '행운 부적! 다음 골드 2배'],
};
const lab = r => (LABEL[r.kind] || LABEL.nothing)(r);
const good = r => ['gold', 'gold+', 'big', 'x2', 'x3', 'steal', 'gift', 'bonusq'].includes(r.kind) || (r.kind === 'swap' && r.delta > 0);

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  el.innerHTML = `<div class="ch-s"><div class="hud"><span class="pill gold">💰 <b id="cs-gold">0</b></span><span class="pill" id="cs-rank">-</span>
    <span class="grow"></span><span class="pill">⏱ <b id="cs-time">-</b></span></div><div class="ch-main" id="cs-main"></div></div>`;
  const main = $('#cs-main', el);
  let openQuiz = null;
  let gold = 0, endsAt = ctx.snapshot?.endsAt || 0, alive = true, busy = false, lucky = false;
  const setGold = g => {
    const old = gold; gold = g; const b = $('#cs-gold', el); b.textContent = gold.toLocaleString();
    if (g !== old) { b.parentElement.classList.remove('bump'); void b.offsetWidth; b.parentElement.classList.add('bump'); }
  };
  const clock = setInterval(() => { if (endsAt) $('#cs-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000); }, 250);

  async function loop() {
    while (alive) {
      if (busy) return;
      busy = true;
      main.innerHTML = '';
      const res = await ctx.quiz({ inline: true, container: main, label: lucky ? '❓ 문제 · 🍀 행운 부적 있음' : '❓ 문제를 맞히면 보물 상자!', okDelay: 600, onOpen: l => { openQuiz = l; } });
      openQuiz = null;
      busy = false;
      if (!alive) return;
      if (res === null) { // 시간이 끝났거나 잠깐 기다림
        main.innerHTML = '<div class="ch-card center"><div class="bigem">⏳</div>잠깐만요…</div>';
        await sleep(1200); continue;
      }
      if (!res.ok) { await sleep(200); continue; }
      await pickChest();
    }
  }
  let pickResolve = null, pickReady = false;
  function waitPick() {
    return new Promise(r => {
      const go = () => { pickReady = false; pickResolve = null; r(); };
      if (pickReady) go(); else { pickResolve = go; setTimeout(() => pickResolve === go && go(), 3000); }
    });
  }
  async function pickChest(fromSnapshot = false) {
    if (!fromSnapshot) await waitPick();
    main.innerHTML = `<div class="ch-card"><h2>상자 하나를 골라요!</h2><div class="chests">${[0, 1, 2].map(i => `<button class="chest" data-i="${i}">${chestImg(i)}</button>`).join('')}</div></div>`;
    fixImgs(main);
    ctx.sound.play('coin');
    const i = await new Promise(r => $$('.chest', main).forEach(b => b.onclick = () => r(+b.dataset.i)));
    $$('.chest', main).forEach(b => { b.disabled = true; b.classList.toggle('chosen', +b.dataset.i === i); });
    ctx.sound.play('open');
    const ack = await ctx.send('pick', { i });
    if (ack?.error || !ack?.res) return;
    await sleep(500);
    let r = ack.res;
    if (ack.target) r = await chooseTarget(r, ack.target);
    if (r.kind === 'bonusq') lucky = true;
    if (r.lucky) lucky = false;
    if (ack.score != null) setGold(ack.score);
    if (r.score != null) setGold(r.score);
    const [em, txt] = lab(r);
    const others = (ack.all || []).map((x, k) => k === i ? '' : `<div class="other">${chestImg(k, 'tiny')} ${lab(x)[0]} ${esc(lab(x)[1])}</div>`).join('');
    main.innerHTML = `<div class="ch-card center reveal ${good(r) ? 'good' : 'bad'}"><div class="bigem pop">${em}</div><div class="txt">${esc(txt)}</div>
      ${r.lucky ? '<div class="sub">🍀 행운 부적으로 두 배!</div>' : ''}
      ${r.delta ? `<div class="delta ${r.delta > 0 ? 'up' : 'down'}">${r.delta > 0 ? '+' : ''}${r.delta.toLocaleString()}</div>` : ''}
      ${r.targetName ? `<div class="sub">${esc(r.targetName)}</div>` : ''}
      <div class="others">${others}</div><button class="btn y big" id="cs-next">다음 문제 ▶</button></div>`;
    fixImgs(main);
    ctx.sound.play(good(r) ? (r.kind === 'big' || r.kind === 'x3' ? 'win' : 'coin') : 'lose');
    if (r.kind === 'big' || r.kind === 'x3') confetti(50);
    await Promise.race([sleep(2600), new Promise(res => { $('#cs-next', main).onclick = res; })]);
  }
  async function chooseTarget(r, list) {
    const [em, txt] = lab(r);
    const title = r.kind === 'steal' ? '누구의 골드를 가져올까요?' : r.kind === 'swap' ? '누구와 골드를 바꿀까요?' : '누구에게 선물할까요?';
    main.innerHTML = `<div class="ch-card"><div class="bigem center">${em}</div><h2 class="center">${esc(txt)}</h2><p class="center">${title}</p>
      <div class="targets">${list.map(o => `<button class="target" data-pid="${esc(o.pid)}">${avatarHTML(o.avatar, 'sm')}<span>${esc(o.name)}</span><b>💰 ${o.score.toLocaleString()}</b></button>`).join('')}</div></div>`;
    for (;;) {
      const pid = await new Promise(res => $$('.target', main).forEach(b => b.onclick = () => res(b.dataset.pid)));
      const a = await ctx.send('target', { pid });
      if (a?.error) { ctx.toast(a.error); continue; }
      ctx.sound.play('steal');
      return { ...a.res, score: a.score, targetName: a.target };
    }
  }
  const offs = [
    ctx.on('start', d => { endsAt = d.endsAt; }),
    ctx.on('pick', () => { pickReady = true; pickResolve?.(); }),
    ctx.on('board', d => {
      endsAt = d.endsAt;
      const k = d.top.findIndex(t => t.pid === ctx.me.pid);
      if (k >= 0) {
        $('#cs-rank', el).textContent = `🏅 ${k + 1}등`;
        const g = d.top[k].score; if (g !== gold && !main.querySelector('.reveal,.chests,.targets')) setGold(g);
      }
    }),
    ctx.on('stolen', d => { setGold(d.score); ctx.toast(`🦝 ${d.by}이(가) 내 골드 ${d.amount}을(를) 가져갔어요!`, 3000); ctx.sound.play('steal'); }),
    ctx.on('swapped', d => { setGold(d.score); ctx.toast(`🔄 ${d.by}와(과) 골드가 바뀌었어요!`, 3000); }),
    ctx.on('gift', d => { setGold(d.score); ctx.toast(`🎁 ${d.by}이(가) 선물을 줬어요! +${d.amount}`, 3000); ctx.sound.play('coin'); }),
  ];
  const s = ctx.snapshot;
  if (s?.score != null) setGold(s.score);
  (async () => {
    if (s?.targeting) {
      const a = await ctx.send('targets', {});
      if (a?.target) { const r = await chooseTarget(a.res, a.target); if (r.score != null) setGold(r.score); }
    } else if (s?.picking) await pickChest(true);
    loop();
  })();
  return () => { alive = false; offs.forEach(f => f()); clearInterval(clock); openQuiz?.closeQuiz?.(); };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  el.innerHTML = `<div class="ch-t"><div class="ct-left"><div class="ct-head"><h1>💰 보물 상자</h1><div class="ct-time" id="ct-time">-</div></div>
    <div class="ct-board" id="ct-board"></div></div>
    <div class="ct-right"><div class="card"><h2>📈 지금까지</h2><div class="ct-stats" id="ct-stats"></div></div>
    <div class="card"><h2>📣 소식</h2><div class="feed" id="ct-feed"></div></div>
    <button class="btn r big" id="ct-end" style="width:100%">🏁 지금 끝내기</button></div></div>`;
  let endsAt = ctx.snapshot?.endsAt || 0, top = ctx.snapshot?.top || [];
  ctx.music.start(140);
  const ava = pid => ctx.room.players.find(p => p.pid === pid)?.avatar;
  function board() {
    const max = Math.max(100, ...top.map(t => t.score));
    $('#ct-board', el).innerHTML = top.slice(0, 15).map((t, i) => `<div class="ct-row ${i < 3 ? 'r' + (i + 1) : ''}"><span class="rk">${i + 1}</span>${avatarHTML(ava(t.pid) || t.avatar, 'sm')}
      <span class="nm">${esc(t.name)}</span><div class="track"><i style="width:${(Math.max(0, t.score) / max) * 100}%"></i></div><b>💰 ${t.score.toLocaleString()}</b></div>`).join('')
      || '<p class="muted center">학생들이 문제를 풀기 시작하면 순위가 보여요.</p>';
  }
  function stats() {
    const n = ctx.log.length, ok = ctx.log.filter(l => l.ok).length;
    $('#ct-stats', el).innerHTML = `<div class="stat"><b>${n}</b>푼 문제</div><div class="stat"><b>${pct(ok, n)}%</b>정답률</div><div class="stat"><b>${ctx.room.players.filter(p => p.online).length}</b>참여</div>`;
  }
  const addFeed = f => { const d = h(`<div>${esc(f.text)}</div>`); $('#ct-feed', el).prepend(d); while ($('#ct-feed', el).children.length > 30) $('#ct-feed', el).lastChild.remove(); };
  ctx.feed.slice(-15).forEach(addFeed);
  const clock = setInterval(() => { if (endsAt) $('#ct-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000); }, 250);
  $('#ct-end', el).onclick = () => { if (confirm('지금 끝낼까요?')) ctx.end(); };
  const offs = [
    ctx.on('start', d => { endsAt = d.endsAt; }),
    ctx.on('board', d => { endsAt = d.endsAt; top = d.top; board(); }),
    ctx.onLog(stats), ctx.onFeed(f => { addFeed(f); ctx.sound.play('coin'); }),
  ];
  board(); stats();
  return () => { offs.forEach(f => f()); clearInterval(clock); ctx.music.stop(); };
}
