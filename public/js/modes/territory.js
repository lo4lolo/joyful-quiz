// 땅따먹기 팀전: 육각 지도
import { $, $$, esc, h, fmtSec, pct, sleep } from '../common.js';

let cssDone = false;
const css = () => { if (!cssDone) { cssDone = true; document.head.append(h('<link rel="stylesheet" href="css/territory.css">')); } };
export const TEAM = [
  { name: '청룡', emoji: '🐉', color: '#3D8BFF', light: '#D6E7FF' }, { name: '주작', emoji: '🐦', color: '#FF6F61', light: '#FFDCD8' },
  { name: '봉황', emoji: '🐤', color: '#F2B200', light: '#FFF0B8' }, { name: '해치', emoji: '🦁', color: '#1FB88A', light: '#C9F5E6' },
  { name: '백호', emoji: '🐯', color: '#7D8DAA', light: '#E6EBF3' }, { name: '현무', emoji: '🐢', color: '#8C6CFF', light: '#E7DEFF' },
];
function neighbors(i, cols, rows) {
  const r = Math.floor(i / cols), c = i % cols, even = r % 2 === 0;
  const d = even ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return d.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && a < rows && b >= 0 && b < cols).map(([a, b]) => a * cols + b);
}
// SVG 육각 지도
function mapSVG(cells, cols, rows, myTeam = null) {
  const R = 30, W = Math.sqrt(3) * R, Hh = 1.5 * R;
  const vw = cols * W + W / 2 + 4, vh = rows * Hh + R / 2 + 4;
  const pts = (cx, cy) => [0, 1, 2, 3, 4, 5].map(k => { const a = Math.PI / 180 * (60 * k - 30); return `${(cx + (R - 1.5) * Math.cos(a)).toFixed(1)},${(cy + (R - 1.5) * Math.sin(a)).toFixed(1)}`; }).join(' ');
  const out = cells.map(c => {
    const r = Math.floor(c.i / cols), col = c.i % cols;
    const cx = 2 + W / 2 + col * W + (r % 2 === 0 ? W / 2 : 0), cy = 2 + R + r * Hh;
    return `<g class="hx" data-i="${c.i}"><polygon points="${pts(cx, cy)}"/><text x="${cx}" y="${cy + 7}"></text></g>`;
  }).join('');
  return `<svg class="hexmap" viewBox="0 0 ${vw.toFixed(0)} ${vh.toFixed(0)}">${out}</svg>`;
}
function paint(svg, cells, cols, rows, myTeam, flags = 0) {
  const now = Date.now();
  const mine = new Set(); if (myTeam != null) cells.forEach(c => { if (c.team === myTeam) neighbors(c.i, cols, rows).forEach(j => mine.add(j)); });
  for (const c of cells) {
    const g = svg.querySelector(`[data-i="${c.i}"]`); if (!g) continue;
    const poly = g.firstChild, t = g.lastChild, T = TEAM[c.team];
    poly.style.fill = c.rock ? '#8a8fa8' : T ? (c.base ? T.color : T.light) : '#ffffff';
    poly.style.stroke = T ? T.color : '#d9dcef';
    t.textContent = c.base ? (T?.emoji || '🏠') : c.rock ? '🪨' : c.v === 5 ? '👑' : c.star ? '⭐' : (T ? '🚩' : '');
    const can = myTeam != null && !c.base && !c.rock && c.team !== myTeam && mine.has(c.i);
    const cost = c.team === -1 ? 1 : 2;
    const prot = c.team !== -1 && now - (c.t || 0) < 8000;
    g.classList.toggle('can', can && flags >= cost && !prot);
    g.classList.toggle('near', can);
    g.classList.toggle('prot', prot && c.team !== -1);
  }
}
const teamBar = (teams) => {
  const total = teams.reduce((s, t) => s + t.score, 0) || 1;
  return `<div class="tbar">${teams.map(t => `<i style="flex:${Math.max(t.score, 0.0001)};background:${TEAM[t.k].color}"></i>`).join('')}</div>
    <div class="tscores">${teams.map(t => `<span><b style="color:${TEAM[t.k].color}">${TEAM[t.k].emoji} ${esc(TEAM[t.k].name)}</b> ${t.score}점 <small>(${t.members}명)</small></span>`).join('')}</div>`;
};

// ---------------- 학생 ----------------
export function mountStudent(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  let cells = s0.cells || [], cols = s0.cols || 13, rows = s0.rows || 9, flags = s0.flags || 0, endsAt = s0.endsAt || 0, alive = true, quizzing = false;
  let openQuiz = null;
  let myTeam = s0.team ?? ctx.room.players.find(p => p.pid === ctx.me.pid)?.team ?? null;
  el.innerHTML = `<div class="tr-s"><div class="hud"><span class="pill" id="ts-team">팀</span><span class="pill">🚩 <b id="ts-flags">0</b>/3</span><span class="grow"></span><span class="pill">⏱ <b id="ts-time">-</b></span></div>
    <div class="tr-wrap"><div class="tr-mapbox"><div id="ts-teams"></div><div id="ts-map"></div><p class="tr-tip" id="ts-tip"></p></div><div class="tr-quiz" id="ts-quiz"></div></div></div>`;
  const setTeam = () => { const T = TEAM[myTeam]; if (T) { const p = $('#ts-team', el); p.textContent = `${T.emoji} 우리는 ${T.name}`; p.style.background = T.light; } };
  const draw = () => { const svg = $('svg', el); if (svg) paint(svg, cells, cols, rows, myTeam, flags); };
  const tip = () => { $('#ts-tip', el).textContent = flags > 0 ? '👆 반짝이는 칸을 눌러 깃발을 꽂아요! (빈 땅 1개 · 상대 땅 2개)' : '❓ 문제를 맞히면 깃발을 받아요'; };
  const setFlags = f => { flags = f; $('#ts-flags', el).textContent = f; tip(); draw(); };
  function build() {
    if (!cells.length) return;
    $('#ts-map', el).innerHTML = mapSVG(cells, cols, rows);
    $('svg', el).addEventListener('click', async e => {
      const g = e.target.closest('.hx'); if (!g) return;
      const i = +g.dataset.i, c = cells[i];
      if (!g.classList.contains('near')) { if (c.team !== myTeam) ctx.toast('우리 팀 땅 바로 옆 칸에만 꽂을 수 있어요'); return; }
      const r = await ctx.send('claim', { i });
      if (r?.error) { ctx.toast(r.error); ctx.sound.play('wrong'); return; }
      setFlags(r.flags); ctx.sound.play('coin'); g.classList.add('boom'); setTimeout(() => g.classList.remove('boom'), 500);
      if (!quizzing) loop();
    });
    draw(); tip();
  }
  async function loop() {
    if (quizzing) return;
    quizzing = true;
    const box = $('#ts-quiz', el);
    while (alive) {
      if (flags >= 3) { box.innerHTML = '<div class="tr-full">🚩🚩🚩<br>깃발이 가득! 지도에 꽂아요</div>'; quizzing = false; return; }
      box.innerHTML = '';
      const res = await ctx.quiz({ inline: true, container: box, label: '❓ 맞히면 깃발 🚩', okDelay: 500, onOpen: l => { openQuiz = l; } });
      openQuiz = null;
      if (!alive) return;
      if (res === null) { box.innerHTML = '<div class="tr-full">⏳</div>'; await sleep(1200); }
    }
    quizzing = false;
  }
  const clock = setInterval(() => { if (endsAt) $('#ts-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000); draw(); }, 1000);
  const offs = [
    ctx.on('start', d => { cells = d.cells; cols = d.cols; rows = d.rows; endsAt = d.endsAt; $('#ts-teams', el).innerHTML = teamBar(d.teams); build(); }),
    ctx.onRoom(r => { const me = r.players.find(p => p.pid === ctx.me.pid); if (me && me.team !== myTeam) { myTeam = me.team; setTeam(); draw(); } }),
    ctx.on('cell', d => { const c = cells[d.i]; if (!c) return; c.team = d.team; c.by = d.by; c.t = Date.now(); draw(); if (d.prev === myTeam && myTeam != null) ctx.sound.play('hit'); }),
    ctx.on('teams', d => { endsAt = d.endsAt; $('#ts-teams', el).innerHTML = teamBar(d.teams); }),
    ctx.on('flags', d => setFlags(d.flags)),
    ctx.on('bonus', () => { ctx.toast('🔥 3연속 정답! 깃발 보너스'); ctx.sound.play('win'); }),
  ];
  setTeam();
  if (cells.length) { build(); if (s0.teams) $('#ts-teams', el).innerHTML = teamBar(s0.teams); }
  setFlags(flags);
  loop();
  return () => { alive = false; offs.forEach(f => f()); clearInterval(clock); openQuiz?.closeQuiz?.(); };
}

// ---------------- 선생님 (TV) ----------------
export function mountTeacher(el, ctx) {
  css();
  const s0 = ctx.snapshot || {};
  let cells = s0.cells || [], cols = s0.cols || 13, rows = s0.rows || 9, endsAt = s0.endsAt || 0, teams = s0.teams || [];
  el.innerHTML = `<div class="tr-t"><div class="tt-main"><div class="tt-head"><h1>🚩 땅따먹기 팀전</h1><div class="tt-time" id="tt-time">-</div></div>
    <div id="tt-teams"></div><div id="tt-map"></div></div>
    <div class="tt-side"><div class="card"><h2>👫 팀</h2><div id="tt-members"></div></div>
    <div class="card"><h2>📣 소식</h2><div class="feed" id="tt-feed"></div></div>
    <div class="card"><div class="ct-stats" id="tt-stats"></div></div>
    <button class="btn r big" id="tt-end" style="width:100%">🏁 지금 끝내기</button></div></div>`;
  ctx.music.start(150);
  const build = () => { if (!cells.length) return; $('#tt-map', el).innerHTML = mapSVG(cells, cols, rows); draw(); };
  const draw = () => { const svg = $('svg', el); if (svg) paint(svg, cells, cols, rows, null); };
  const members = () => {
    const ps = ctx.room.players;
    $('#tt-members', el).innerHTML = TEAM.slice(0, ctx.room.settings.teams).map((T, k) => `<div class="tt-team"><b style="color:${T.color}">${T.emoji} ${T.name}</b>
      <span>${ps.filter(p => p.team === k).map(p => `<i class="${p.online ? '' : 'off'}">${esc(p.avatar?.face || '')}${esc(p.name)}</i>`).join('')}</span></div>`).join('');
  };
  const stats = () => { const n = ctx.log.length, ok = ctx.log.filter(l => l.ok).length; $('#tt-stats', el).innerHTML = `<div class="stat"><b>${n}</b>푼 문제</div><div class="stat"><b>${pct(ok, n)}%</b>정답률</div>`; };
  const addFeed = f => { const d = h(`<div>${esc(f.text)}</div>`); $('#tt-feed', el).prepend(d); while ($('#tt-feed', el).children.length > 30) $('#tt-feed', el).lastChild.remove(); };
  ctx.feed.slice(-15).forEach(addFeed);
  const clock = setInterval(() => { if (endsAt) $('#tt-time', el).textContent = fmtSec((endsAt - Date.now()) / 1000); draw(); }, 1000);
  $('#tt-end', el).onclick = () => { if (confirm('지금 끝낼까요?')) ctx.end(); };
  const offs = [
    ctx.on('start', d => { cells = d.cells; cols = d.cols; rows = d.rows; endsAt = d.endsAt; teams = d.teams; $('#tt-teams', el).innerHTML = teamBar(teams); build(); members(); }),
    ctx.on('cell', d => { const c = cells[d.i]; if (!c) return; c.team = d.team; c.t = Date.now(); draw(); const g = $(`[data-i="${d.i}"]`, el); g?.classList.add('boom'); setTimeout(() => g?.classList.remove('boom'), 500); }),
    ctx.on('teams', d => { endsAt = d.endsAt; teams = d.teams; $('#tt-teams', el).innerHTML = teamBar(teams); }),
    ctx.onRoom(members), ctx.onLog(stats), ctx.onFeed(addFeed),
  ];
  build(); members(); stats(); if (teams.length) $('#tt-teams', el).innerHTML = teamBar(teams);
  return () => { offs.forEach(f => f()); clearInterval(clock); ctx.music.stop(); };
}
