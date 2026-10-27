// 다 함께 보스전: 반 전체가 한 팀으로 보스 3마리를 물리친다 (서버: server/modes/raid.js)
import { $, $$, esc, h, avatarHTML, fmtSec, pct, sleep } from '../common.js';
import { fx, setMuted } from '../fx.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/raid.css">')); } };
// 서버 표와 같은 순서·id (그림이 없으면 이모지 + CSS 말랑이로)
export const BOSS = [
  { id: 'slime_king', name: '슬라임 왕', emoji: '👾', color: '#4FB8FF' },
  { id: 'rock_golem', name: '바위 골렘', emoji: '🪨', color: '#A9A3C9' },
  { id: 'cloud_dragon', name: '구름 용', emoji: '🐉', color: '#8C6CFF' },
];
const N = n => Math.max(0, Math.round(n || 0)).toLocaleString();
// 보스 그림 한 덩어리: 겉(맞으면 흔들림) > 둥실(가만히 있을 때 위아래) > 그림·아파하는 그림 / 말랑이(그림이 없을 때)
// 아파하는 그림은 미리 겹쳐 두고 보이기만 바꾼다 (맞을 때마다 다시 내려받지 않음)
function bossHTML(b) {
  return `<div class="rd-boss enter b-${esc(b.id)}" style="--bc:${esc(b.color)}"><div class="rd-bob">
    <div class="rd-blob"><span>${esc(b.emoji)}</span></div>
    <img class="rd-img" src="assets/boss/${esc(b.id)}.webp" alt="${esc(b.name)}" draggable="false">
    <img class="rd-img rd-hurt" src="assets/boss/${esc(b.id)}_hurt.webp" alt="" draggable="false"></div><div class="rd-shadow"></div></div>`;
}
function wireBoss(wrap, b) {
  const boss = $('.rd-boss', wrap), [img, hurt] = $$('.rd-img', wrap);
  img.addEventListener('error', () => boss.classList.add('noimg'), { once: true });
  img.addEventListener('load', () => boss.classList.add('hasimg'), { once: true });
  hurt.addEventListener('load', () => boss.classList.add('hashurt'), { once: true });
  setTimeout(() => boss.classList.remove('enter'), 900);
  let t = 0;
  return {
    el: boss,
    hit(big) {
      boss.classList.remove('hit', 'bighit'); void boss.offsetWidth; boss.classList.add(big ? 'bighit' : 'hit', 'hurt');
      clearTimeout(t); t = setTimeout(() => boss.classList.remove('hit', 'bighit', 'hurt'), big ? 600 : 300);
    },
    die() { boss.classList.add('dead', 'hurt'); },
  };
}
const hpHTML = () => `<div class="rd-hp"><i class="lag"></i><i class="fill"></i><b class="num"></b></div>`;
function setHP(el, hp, max, color) {
  const r = max ? Math.max(0, Math.min(1, hp / max)) : 0, bar = $('.rd-hp', el);
  if (!bar) return;
  bar.style.setProperty('--r', r); if (color) bar.style.setProperty('--bc', color);
  bar.classList.toggle('low', r < 0.25);
  $('.num', bar).textContent = `${N(hp)} / ${N(max)}`;
}
const stepsHTML = (bi, down) => BOSS.map((B, i) => `<span class="rd-step ${i < down ? 'done' : i === bi ? 'now' : ''}" title="${esc(B.name)}">${B.emoji}</span>`).join('<i class="rd-dash"></i>');
// 방어 미션 띠
function missionHTML() {
  return `<div class="rd-mission" hidden><div class="rd-mhead"><b class="rd-mtitle">🛡️ 방어 미션!</b><span class="rd-mtext"></span><span class="rd-mtime"></span></div>
    <div class="rd-mbar"><i></i><span class="rd-mcount"></span></div></div>`;
}
function missionUI(root) {
  const box = $('.rd-mission', root);
  let m = null, raf = 0;
  const draw = () => {
    if (!m) return;
    const left = Math.max(0, m.deadline - Date.now());
    $('.rd-mtime', box).textContent = `⏱ ${Math.ceil(left / 1000)}초`;
    $('.rd-mbar i', box).style.transform = `scaleX(${Math.min(1, m.got / m.need)})`;
    $('.rd-mcount', box).textContent = `${m.got} / ${m.need}`;
    box.classList.toggle('hurry', left < 4000);
    if (left > 0) raf = requestAnimationFrame(draw);
  };
  return {
    start(d) {
      m = { need: d.need, got: d.got || 0, deadline: Date.now() + (d.left ?? 12000) };
      box.hidden = false; box.className = 'rd-mission on';
      $('.rd-mtitle', box).textContent = '🛡️ 방어 미션!';
      $('.rd-mtext', box).innerHTML = `${d.text ? `<small>${esc(d.text)}</small> ` : ''}다 같이 <b>${d.need}문제</b> 맞히기!`;
      cancelAnimationFrame(raf); draw();
    },
    progress(got, need) { if (!m) return; m.got = got; m.need = need || m.need; draw(); $('.rd-mbar', box).classList.remove('tick'); void box.offsetWidth; $('.rd-mbar', box).classList.add('tick'); },
    end(state, text) {
      cancelAnimationFrame(raf);
      if (!m && state !== 'cancel') { box.hidden = true; return; }
      if (state === 'cancel') { m = null; box.hidden = true; return; }
      if (m) { m.got = state === 'ok' ? m.need : m.got; }
      $('.rd-mbar i', box).style.transform = `scaleX(${m ? Math.min(1, m.got / m.need) : 1})`;
      if (m) $('.rd-mcount', box).textContent = `${m.got} / ${m.need}`;
      box.className = 'rd-mission ' + (state === 'ok' ? 'ok' : 'fail');
      $('.rd-mtitle', box).textContent = state === 'ok' ? '🛡️ 방어 성공!' : '💚 아쉬워요';
      $('.rd-mtext', box).textContent = text; $('.rd-mtime', box).textContent = '';
      m = null;
      setTimeout(() => { if (!m) box.hidden = true; }, 2600);
    },
    get on() { return !!m; },
  };
}
const say = (el, text) => {
  const b = $('.rd-say', el); if (!b || !text) return;
  b.textContent = text; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
};
function overlay(el, d) {
  const o = $('.rd-over', el);
  o.innerHTML = `<div class="rd-overcard sticker ${d.win ? 'win' : 'lose'}"><div class="em">${d.win ? '🏆' : '💨'}</div>
    <h2>${esc(d.text || (d.win ? '우리 반 승리!' : '보스가 도망갔어요! 다음엔 꼭!'))}</h2>
    <p>${d.win ? '보스 3마리를 모두 물리쳤어요' : `보스 ${d.down}마리를 물리쳤어요`} · 우리 반 공격 ${N(d.total)}</p>
    ${d.mvp?.length ? `<div class="rd-overmvp">${d.mvp.map((m, i) => `<span class="pill">${['🥇', '🥈', '🥉'][i]} ${esc(m.name)} ${N(m.damage)}</span>`).join('')}</div>` : ''}</div>`;
  o.hidden = false;
}

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  setMuted(!ctx.sound.on); // 학생 기기는 소리 기본 꺼짐: 효과음도 함께 맞춘다
  el.innerHTML = `<div class="rd-s">
    <div class="hud"><span class="pill rd-steps" id="rs-steps"></span><span class="grow"></span>
      <span class="pill">⚔️ <b id="rs-dmg">0</b></span><span class="pill">⏱ <b id="rs-time">-</b></span></div>
    <div class="rd-wrap">
      <section class="rd-arena sticker" id="rs-arena">
        <div class="rd-bossbar"><span class="rd-bname" id="rs-bname"></span>${hpHTML()}</div>
        ${missionHTML()}
        <div class="rd-stage" id="rs-stage"><div class="rd-say"></div><div class="rd-bossbox"></div><div class="rd-break" hidden></div></div>
        <div class="rd-mine"><span class="chip" id="rs-streak">🔥 연속 0</span><span class="chip" id="rs-crit">💥 크리티컬 0</span><span class="chip" id="rs-ok">✅ 0 / 0</span></div>
      </section>
      <section class="rd-q" id="rs-q"></section>
    </div>
    <div class="rd-over" hidden></div></div>`;
  const qbox = $('#rs-q', el), stage = $('#rs-stage', el), mission = missionUI(el);
  let alive = true, openQuiz = null, boss = null, bossUI = null, phase = 'fight', endsAt = 0, over = false, me = { damage: 0, streak: 0, crits: 0, correct: 0, answered: 0 };
  let wake = null; // 쉬는 시간이 끝나면 문제 고리 깨우기
  const setMe = d => {
    const old = me.damage; me = { ...me, ...d };
    $('#rs-dmg', el).textContent = N(me.damage);
    if (me.damage !== old) { const p = $('#rs-dmg', el).parentElement; p.classList.remove('bump'); void p.offsetWidth; p.classList.add('bump'); }
    const m = me.streak >= 5 ? 2 : me.streak >= 3 ? 1.5 : 1;
    const st = $('#rs-streak', el); st.textContent = `🔥 ${me.streak}연속${m > 1 ? ` ×${m}` : ''}`; st.classList.toggle('hot', m > 1);
    $('#rs-crit', el).textContent = `💥 크리티컬 ${me.crits}`;
    $('#rs-ok', el).textContent = `✅ ${me.correct} / ${me.answered}`;
  };
  const setTime = ms => { endsAt = Date.now() + ms; };
  function setBoss(b, fresh) {
    boss = { ...b };
    $('#rs-steps', el).innerHTML = stepsHTML(b.bi, b.bi);
    $('#rs-bname', el).innerHTML = `${esc(b.emoji)} ${esc(b.name)} <small>${b.bi + 1}/${b.n || 3}</small>`;
    $('#rs-arena', el).style.setProperty('--bc', b.color);
    setHP(el, b.hp, b.max, b.color);
    const box = $('.rd-bossbox', stage); box.innerHTML = bossHTML(b);
    bossUI = wireBoss(box, b);
    if (!fresh) $('.rd-boss', box).classList.remove('enter');
  }
  function breakCard(d) {
    const br = $('.rd-break', stage);
    br.innerHTML = `<b>🎉 ${esc(d.name)} 처치!</b><span>다음 보스 ${esc(d.next?.emoji || '')} ${esc(d.next?.name || '')} 등장까지 <em class="rd-cd">${Math.ceil((d.breakLeft || 4000) / 1000)}</em>초</span>`;
    br.hidden = false;
    const until = Date.now() + (d.breakLeft || 4000);
    const cd = setInterval(() => { const e = $('.rd-cd', br); if (!e || !alive) return clearInterval(cd); e.textContent = Math.max(0, Math.ceil((until - Date.now()) / 1000)); if (until <= Date.now()) clearInterval(cd); }, 200);
  }
  function waitCard(text) { qbox.innerHTML = `<div class="rd-wait sticker"><div class="em">⏳</div>${esc(text)}</div>`; }
  function apply(s) { // 스냅숏(다시 접속)
    if (!s?.boss) return;
    setBoss(s.boss, false); phase = s.phase; setTime(s.timeLeft);
    if (s.me) setMe(s.me);
    $('#rs-steps', el).innerHTML = stepsHTML(s.boss.bi, s.down);
    if (s.mission) mission.start(s.mission);
    if (s.phase === 'break') { bossUI?.die(); breakCard({ name: s.boss.name, next: BOSS[s.boss.bi + 1], breakLeft: s.breakLeft }); }
    if (s.over) over = true;
  }
  async function loop() {
    while (alive) {
      if (over) { waitCard('결과를 기다려요…'); return; }
      if (phase !== 'fight') {
        waitCard('다음 보스가 오고 있어요!');
        await new Promise(r => { wake = r; setTimeout(r, 1500); }); wake = null;
        continue;
      }
      qbox.innerHTML = '';
      const res = await ctx.quiz({ inline: true, container: qbox, label: mission.on ? '🛡️ 미션 중! 맞히면 공격' : '⚔️ 맞히면 보스 공격!', okDelay: 550, onOpen: l => { openQuiz = l; } });
      openQuiz = null;
      if (!alive) return;
      if (res === null) { if (phase === 'fight' && !over) waitCard('잠깐만요…'); await sleep(1000); }
    }
  }
  const clock = setInterval(() => { if (endsAt) $('#rs-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000); }, 250);
  const offs = [
    ctx.on('boss', d => {
      phase = d.phase; setTime(d.timeLeft); over = false;
      $('.rd-break', stage).hidden = true;
      setBoss(d.boss, true);
      $('#rs-steps', el).innerHTML = stepsHTML(d.boss.bi, d.down);
      say(stage, d.say);
      if (d.boss.bi > 0) { ctx.sound.play('go'); fx.stamp(`${d.boss.name} 등장!`, "#8C6CFF"); }
      mission.end('cancel');
      wake?.();
    }),
    ctx.on('hits', d => {
      if (!boss || d.bi !== boss.bi) return;
      boss.hp = d.hp; setHP(el, d.hp, d.max);
      const others = d.hits.filter(x => x.pid !== ctx.me.pid);
      if (others.length) {
        bossUI?.hit(false);
        others.slice(0, 3).forEach((x, i) => mini(stage, `${x.name} -${x.dmg}`, x.crit, i));
      }
    }),
    ctx.on('atk', d => {
      setMe(d);
      if (d.miss) return;
      const at = bossUI?.el || stage;
      if (d.charged) { fx.float(at, `⚡ 충전 +${d.dmg}`, '#8C6CFF'); return; }
      bossUI?.hit(d.crit);
      if (d.crit) fx.medium(at, `💥 크리티컬! -${d.dmg}`, '#FF6F61');
      else { fx.float(at, `-${d.dmg}`, d.mult > 1 ? '#E3B800' : '#1B2A4A'); fx.burst(...center(at), 6, .6); }
      ctx.sound.play('hit');
    }),
    ctx.on('mbonus', d => { setMe(d); ctx.toast(`🛡️ 방어 성공 보너스! +${d.dmg}`); }),
    ctx.on('mission', d => {
      if (d.state === 'start') { mission.start(d); ctx.sound.play('count'); say(stage, d.text); }
      else if (d.state === 'progress') mission.progress(d.got, d.need);
      else if (d.state === 'ok') { mission.end('ok', `반사 공격 -${N(d.bonus)}!`); if (boss) setHP(el, d.hp, d.max); bossUI?.hit(true); fx.medium(bossUI?.el, `🛡️ -${N(d.bonus)}`, '#3D8BFF'); ctx.sound.play('win'); }
      else if (d.state === 'fail') { mission.end('fail', `보스가 체력을 ${N(d.heal)} 회복했어요. 다음엔 함께!`); if (boss) setHP(el, d.hp, d.max); ctx.sound.play('open'); }
      else mission.end('cancel');
    }),
    ctx.on('defeat', d => {
      phase = 'break'; if (boss) setHP(el, 0, boss.max);
      $('#rs-steps', el).innerHTML = stepsHTML(d.bi + 1, d.down);
      bossUI?.die(); say(stage, d.say);
      fx.heavy('처치!', '#FF6F61'); ctx.sound.play('win');
      breakCard(d);
    }),
    ctx.on('board', d => { setTime(d.timeLeft); if (boss && d.bi === boss.bi && d.phase === 'fight') { boss.hp = d.hp; setHP(el, d.hp, d.max); } }),
    ctx.on('result', d => {
      over = true; phase = 'over'; mission.end('cancel');
      openQuiz?.closeQuiz?.();
      if (d.win) { bossUI?.die(); fx.heavy('승리!', '#2ED3A0'); ctx.sound.play('win'); } else { ctx.sound.play('lose'); }
      overlay(el, d);
    }),
  ];
  apply(ctx.snapshot);
  if (!ctx.snapshot) setMe(me);
  loop();
  return () => { alive = false; offs.forEach(f => f()); clearInterval(clock); openQuiz?.closeQuiz?.(); wake?.(); };
}
const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
// 친구 공격 / TV 공격 글자 (무대 안에서 여기저기)
function mini(stage, text, crit, i = 0, big = false) {
  const f = document.createElement('div');
  f.className = 'rd-pop' + (crit ? ' crit' : '') + (big ? ' big' : '');
  f.textContent = (crit ? '💥 ' : '') + text;
  f.style.left = (12 + Math.random() * 76) + '%'; f.style.top = (18 + Math.random() * 52) + '%';
  f.style.animationDelay = (i * 60) + 'ms';
  stage.append(f); setTimeout(() => f.remove(), 1300 + i * 60);
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  el.innerHTML = `<div class="rd-t">
    <div class="rt-main sticker" id="rt-arena">
      <div class="rt-top"><h1>🐲 다 함께 보스전</h1><span class="rd-steps big" id="rt-steps"></span><span class="grow"></span><span class="pill rt-time">⏱ <b id="rt-time">-</b></span></div>
      <div class="rd-bossbar big"><span class="rd-bname" id="rt-bname"></span>${hpHTML()}</div>
      ${missionHTML()}
      <div class="rd-stage big" id="rt-stage"><div class="rd-say"></div><div class="rd-bossbox"></div><div class="rd-break" hidden></div></div>
    </div>
    <aside class="rt-side">
      <div class="sticker rt-card"><h2>🏅 MVP</h2><div class="board" id="rt-mvp"></div></div>
      <div class="sticker rt-card"><h2>🙋 참여</h2><div class="rt-meter"><i id="rt-part"></i></div><p class="rt-partx" id="rt-partx"></p></div>
      <div class="sticker rt-card rt-stats" id="rt-stats"></div>
      <div class="row"><button class="btn ghost sm" id="rt-mis" title="방어 미션을 지금 시작해요">⚠️ 미션 지금</button><span class="grow"></span>
        <button class="btn coral lg" id="rt-end">🏁 지금 끝내기</button></div>
    </aside>
    <div class="rd-over" hidden></div></div>`;
  ctx.music.start(150);
  const stage = $('#rt-stage', el), mission = missionUI(el);
  let boss = null, bossUI = null, endsAt = 0, attackers = s0.attackers || 0, total = s0.total || 0, lastSound = 0;
  const ava = pid => ctx.room.players.find(p => p.pid === pid)?.avatar;
  const online = () => ctx.room.players.filter(p => p.online).length;
  function setBoss(b, fresh) {
    boss = { ...b };
    $('#rt-bname', el).innerHTML = `${esc(b.emoji)} ${esc(b.name)} <small>${b.bi + 1} / ${b.n || 3}</small>`;
    $('#rt-arena', el).style.setProperty('--bc', b.color);
    setHP(el, b.hp, b.max, b.color);
    const box = $('.rd-bossbox', stage); box.innerHTML = bossHTML(b);
    bossUI = wireBoss(box, b);
    if (!fresh) $('.rd-boss', box).classList.remove('enter');
  }
  function mvp(list = []) {
    $('#rt-mvp', el).innerHTML = list.length ? list.map((m, i) => `<div class="brow ${i < 3 ? 'r' + (i + 1) : ''}"><span class="rk">${['🥇', '🥈', '🥉'][i] || i + 1}</span>${avatarHTML(ava(m.pid) || m.avatar, 'sm')}
      <span class="nm">${esc(m.name)}</span><span class="sc">${N(m.damage)}</span></div>`).join('') : '<p class="muted">문제를 맞히면 공격! 누가 MVP가 될까요?</p>';
  }
  function part() {
    const on = Math.max(online(), 1);
    $('#rt-part', el).style.transform = `scaleX(${Math.min(1, attackers / on)})`;
    $('#rt-partx', el).innerHTML = `이 보스를 공격한 친구 <b>${attackers}</b> / ${online()}명`;
  }
  function stats() {
    const n = ctx.log.length, ok = ctx.log.filter(l => l.ok).length;
    $('#rt-stats', el).innerHTML = `<div class="stat"><b>${N(total)}</b>우리 반 공격</div><div class="stat"><b>${pct(ok, n)}%</b>정답률</div><div class="stat"><b>${n}</b>푼 문제</div>`;
  }
  const setTime = ms => { endsAt = Date.now() + ms; };
  const clock = setInterval(() => { if (endsAt) { const left = (endsAt - Date.now()) / 1000; $('#rt-time', el).textContent = fmtSec(left); $('#rt-time', el).parentElement.classList.toggle('hurry', left < 60); } }, 250);
  $('#rt-end', el).addEventListener('click', () => { if (confirm('보스전을 지금 끝낼까요?')) ctx.end(); });
  $('#rt-mis', el).addEventListener('click', async () => { const r = await ctx.send('mission', {}); if (!r?.ok) ctx.toast('지금은 미션을 시작할 수 없어요 (보스가 없거나 미션 중)'); });
  const offs = [
    ctx.on('boss', d => {
      setTime(d.timeLeft); attackers = d.attackers || 0; total = d.total ?? total;
      $('.rd-break', stage).hidden = true;
      setBoss(d.boss, true); $('#rt-steps', el).innerHTML = stepsHTML(d.boss.bi, d.down);
      say(stage, d.say); mission.end('cancel'); part(); stats();
      if (d.boss.bi > 0) { fx.stamp(`${d.boss.name} 등장!`, "#8C6CFF"); ctx.sound.play('go'); }
    }),
    ctx.on('hits', d => {
      if (!boss || d.bi !== boss.bi) return;
      boss.hp = d.hp; setHP(el, d.hp, d.max); attackers = d.attackers; total = d.total ?? total; part(); stats();
      const crit = d.hits.some(x => x.crit);
      bossUI?.hit(crit);
      const show = d.hits.slice(0, 10);
      show.forEach((x, i) => mini(stage, `${x.name} -${x.dmg}`, x.crit, i, true));
      if (d.hits.length > show.length) mini(stage, `+${d.hits.length - show.length}명 공격!`, false, show.length, true);
      if (Date.now() - lastSound > 450) { lastSound = Date.now(); ctx.sound.play(crit ? 'hit' : 'pick'); }
    }),
    ctx.on('board', d => {
      setTime(d.timeLeft); attackers = d.attackers; total = d.total ?? total; mvp(d.mvp); part(); stats();
      if (boss && d.bi === boss.bi && d.phase === 'fight') setHP(el, d.hp, d.max);
    }),
    ctx.on('mission', d => {
      if (d.state === 'start') { mission.start(d); say(stage, d.text); ctx.sound.play('count'); fx.stamp('반격!', '#FF6F61'); }
      else if (d.state === 'progress') mission.progress(d.got, d.need);
      else if (d.state === 'ok') { mission.end('ok', `${d.helpers}명이 막아 냈어요! 반사 공격 -${N(d.bonus)}`); setHP(el, d.hp, d.max); bossUI?.hit(true); fx.heavy('방어 성공!', '#3D8BFF'); }
      else if (d.state === 'fail') { mission.end('fail', `${d.got}/${d.need} · 보스가 체력을 ${N(d.heal)} 회복했어요`); setHP(el, d.hp, d.max); ctx.sound.play('open'); }
      else mission.end('cancel');
    }),
    ctx.on('defeat', d => {
      if (boss) setHP(el, 0, boss.max);
      $('#rt-steps', el).innerHTML = stepsHTML(d.bi + 1, d.down);
      bossUI?.die(); say(stage, d.say); fx.heavy('처치!', '#FF6F61'); ctx.sound.play('win');
      const br = $('.rd-break', stage);
      br.innerHTML = `<b>🎉 ${esc(d.name)} 처치!</b><span>마지막 한 방: ${esc(d.by)}</span>
        ${d.top?.length ? `<span class="rd-top">${d.top.map((m, i) => `${['🥇', '🥈', '🥉'][i]} ${esc(m.name)} ${N(m.damage)}`).join(' · ')}</span>` : ''}
        <span>다음: ${esc(d.next?.emoji || '')} ${esc(d.next?.name || '')}</span>`;
      br.hidden = false;
    }),
    ctx.on('result', d => {
      mission.end('cancel');
      if (d.win) { bossUI?.die(); fx.heavy('승리!', '#2ED3A0'); ctx.sound.play('win'); } else ctx.sound.play('lose');
      overlay(el, d);
    }),
    ctx.onRoom(part), ctx.onLog(stats),
  ];
  if (s0.boss) {
    setBoss(s0.boss, false); setTime(s0.timeLeft); $('#rt-steps', el).innerHTML = stepsHTML(s0.boss.bi, s0.down);
    if (s0.mission) mission.start(s0.mission);
    if (s0.phase === 'break') { bossUI?.die(); const br = $('.rd-break', stage); br.innerHTML = `<b>🎉 ${esc(s0.boss.name)} 처치!</b><span>다음 보스가 곧 나와요</span>`; br.hidden = false; }
  }
  mvp(s0.mvp); part(); stats();
  return () => { offs.forEach(f => f()); clearInterval(clock); ctx.music.stop(); };
}
