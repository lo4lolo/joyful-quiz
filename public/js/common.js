// 공용 도구: DOM, 저장, 토스트, 효과음, 아바타, 문제 카드, QR
import { fx, setMuted } from './fx.js';
import { CHAR, charImg, emojiOf } from './chars.js';
export { fx };
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
export const session = {
  get(k, d) { try { const v = sessionStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
export function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export const fmtSec = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function toast(text, ms = 2200) {
  let box = $('#toast'); if (!box) { box = h('<div id="toast" role="status" aria-live="polite" aria-atomic="false"></div>'); document.body.append(box); }
  const t = h(`<div class="toast">${esc(text)}</div>`); box.append(t);
  setTimeout(() => t.remove(), ms);
}

// 실시간 서버 주소 (config.js). 비어 있으면 이 화면을 보낸 서버.
export const SERVER = (window.JQ_CONFIG?.server || '').replace(/\/$/, '');
export const apiURL = p => (SERVER || '') + p;
export function connect() {
  if (!window.io) { toast('서버에 연결할 수 없어요. 주소를 확인해 주세요.'); throw new Error('socket.io 없음'); }
  const opts = { transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 };
  return SERVER ? window.io(SERVER, opts) : window.io(opts);
}
export const emit = (socket, ev, data) => new Promise(res => socket.timeout(8000).emit(ev, data, (err, r) => res(err ? { error: '연결이 느려요. 다시 해 볼까요?' } : r)));

// ---------- 아바타 ----------
export const FACES = ['🐱', '🐶', '🐰', '🐻', '🐼', '🦊', '🐯', '🦁', '🐸', '🐵', '🐧', '🐨', '🐹', '🦄', '🐲', '🐙', '🦖', '🐤', '🐮', '🐷'];
export const COLORS = ['#FF6F91', '#FF5A5F', '#FF9F43', '#FFE14D', '#2ED3A0', '#1ABC9C', '#3D8BFF', '#8C6CFF', '#C38BFF', '#A9784F', '#5B6B8C', '#FFFFFF'];
export const HATS = ['', '👑', '🎩', '🧢', '🎀', '⛑️', '🎓', '🌸', '⭐', '🔥'];
export function avatarHTML(a = {}, size = '') {
  const hat = HATS[a?.hat | 0] || '';
  const inner = CHAR[a?.char] ? `<img src="${charImg(a.char)}" alt="" data-emoji="${esc(emojiOf(a))}">` : esc(emojiOf(a));
  return `<span class="ava ${size}" style="--c:${esc(a?.color || '#3D8BFF')}">${inner}${hat ? `<span class="hat">${hat}</span>` : ''}</span>`;
}
// 캐릭터 그림이 없으면 이모지로 (CSP 때문에 onerror 대신 전역에서 잡음)
document.addEventListener('error', e => {
  const t = e.target;
  if (t?.tagName === 'IMG' && t.dataset.emoji && t.parentElement?.classList.contains('ava')) t.replaceWith(document.createTextNode(t.dataset.emoji));
}, true);
export const randomAvatar = () => { const ids = ['cat', 'dog', 'bunny', 'bear', 'panda', 'fox', 'frog', 'penguin']; const char = ids[Math.random() * ids.length | 0];
  return { char, face: CHAR[char].emoji, color: COLORS[Math.random() * 10 | 0], kart: Math.random() * 8 | 0, hat: 0 }; };

// ---------- 효과음 (WebAudio로 만들어 외부 파일 없음) ----------
let actx = null;
const AC = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());
function tone(freq, dur = 0.12, type = 'square', vol = 0.12, when = 0, slide = 0) {
  const c = AC(), t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur = 0.2, vol = 0.15) {
  const c = AC(), b = c.createBuffer(1, c.sampleRate * dur, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const s = c.createBufferSource(), g = c.createGain(); g.gain.value = vol; s.buffer = b; s.connect(g).connect(c.destination); s.start();
}
const FX = {
  correct: () => { tone(660, .1, 'square', .1); tone(990, .18, 'square', .1, .09); },
  wrong: () => { tone(220, .25, 'sawtooth', .08, 0, .6); },
  coin: () => { tone(988, .07, 'square', .08); tone(1319, .16, 'square', .08, .06); },
  pick: () => tone(523, .06, 'triangle', .14),
  tick: () => tone(1200, .03, 'square', .04),
  go: () => { tone(523, .12, 'square', .1); tone(784, .25, 'square', .1, .12); },
  count: () => tone(440, .15, 'square', .1),
  boost: () => tone(200, .4, 'sawtooth', .07, 0, 4),
  hit: () => { noise(.25, .2); tone(150, .3, 'square', .08, 0, .4); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .2, 'square', .09, i * .12)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, .22, 'triangle', .12, i * .15)),
  steal: () => { tone(880, .08, 'square', .08); tone(440, .2, 'square', .08, .08, .5); },
  join: () => tone(784, .08, 'triangle', .12),
  open: () => [659, 880, 1175].forEach((f, i) => tone(f, .12, 'triangle', .12, i * .07)),
};
export const sound = {
  on: store.get('jq_sound', true),
  play(name) { if (!this.on) return; try { FX[name]?.(); } catch {} },
  toggle() { this.on = !this.on; setMuted(!this.on); store.set('jq_sound', this.on); if (!this.on) music.stop(); return this.on; },
  unlock() { try { AC().resume(); } catch {} },
};
// 아주 단순한 배경음악 (반복 멜로디)
export const music = {
  timer: null,
  start(tempo = 150) {
    if (this.timer || !sound.on) return;
    const mel = [0, 4, 7, 4, 9, 7, 4, 2, 0, 4, 7, 12, 11, 7, 9, 7], bass = [0, 0, 5, 5, 7, 7, 5, 5];
    let i = 0; const base = 392, step = 60 / tempo / 2;
    this.timer = setInterval(() => {
      if (!sound.on) return this.stop();
      const n = mel[i % mel.length]; tone(base * 2 ** (n / 12), step * .9, 'triangle', .05);
      if (i % 2 === 0) tone(base / 2 * 2 ** (bass[(i / 2) % bass.length] / 12), step * 1.8, 'square', .03);
      i++;
    }, step * 1000);
  },
  stop() { clearInterval(this.timer); this.timer = null; },
};
export function soundButton() {
  const b = h(`<button class="sound-btn" title="소리 켜기/끄기">${sound.on ? '🔊' : '🔇'}</button>`);
  b.onclick = () => { sound.unlock(); b.textContent = sound.toggle() ? '🔊' : '🔇'; };
  document.body.append(b);
  window.addEventListener('pointerdown', () => sound.unlock(), { once: true });
  return b;
}

// ---------- 문제 카드 ----------
// view: {qid,q,kind,choices,time}. opts: {inline, container, label, onAnswer(given) => Promise<res>}
// 반환: Promise<res|null>. res = 서버 채점 결과 {ok, correct, explain}
export function showQuiz(view, opts = {}) {
  return new Promise(resolve => {
    const layer = h(`<div class="quiz-layer ${opts.inline ? 'inline' : ''}"><div class="quiz">
      <div class="qtop"><span>${view.review ? '🌱 다시 도전 · ' : ''}${esc(opts.label || '❓ 문제')}</span><span class="tleft"></span></div>
      ${view.time ? '<div class="bar"><i></i></div>' : ''}
      <div class="qtext">${esc(view.q)}</div><div class="ans"></div></div></div>`);
    const ans = $('.ans', layer);
    let done = false, t0 = performance.now(), raf = 0;
    const finish = async given => {
      if (done) return; done = true; cancelAnimationFrame(raf);
      $$('.choice', layer).forEach(b => { b.disabled = true; b.classList.toggle('picked', b.dataset.v === given); b.classList.toggle('dim', b.dataset.v !== given); });
      sound.play('pick');
      let res;
      try { res = await opts.onAnswer?.(given); } catch { res = { error: 'connection' }; }
      if (!layer.isConnected) return resolve(null);
      if (!res || res.error) { close(); return resolve(res || null); }
      if (res.ok) fx.medium($('.quiz', layer), '정답!', '#14A57A'); else fx.shake($('.quiz', layer));
      if (opts.revealInline) { close(); return resolve(res); }
      $$('.choice', layer).forEach(b => b.classList.toggle('right', b.dataset.v === res.correct));
      const r = h(`<div class="qres ${res.ok ? 'ok' : 'no'}"><div><div class="big">${res.ok ? '⭕' : '❌'}</div>${res.ok ? '정답!' : '아쉬워요'}
        ${res.ok ? '' : `<small>정답: ${esc(res.correct)}</small>`}${res.explain ? `<small>💡 ${esc(res.explain)}</small>` : ''}${opts.extra ? `<small>${esc(opts.extra(res))}</small>` : ''}</div></div>`);
      $('.quiz', layer).append(r);
      if (opts.readToContinue && !res.ok) {
        const next = h('<button class="btn mint" style="margin-top:14px">읽었어요 · 계속하기 →</button>');
        r.firstElementChild.append(next); next.onclick = () => { close(); resolve(res); }; next.focus();
      } else setTimeout(() => { close(); resolve(res); }, res.ok ? (opts.okDelay ?? 900) : (opts.noDelay ?? (res.explain ? 2600 : 1800)));
    };
    function close() { cancelAnimationFrame(raf); layer.remove(); document.removeEventListener('keydown', onKey); }
    if (view.choices) {
      const ox = view.kind === 'ox';
      ans.innerHTML = `<div class="choices ${view.choices.length === 2 ? 'two' : ''}">${view.choices.map((c, i) =>
        `<button class="choice k${ox ? (c === 'O' ? 3 : 0) : i} ${ox ? 'ox' : ''}" data-v="${esc(c)}"><span class="sh">${ox ? '' : ['▲', '◆', '●', '■'][i]}</span>${ox ? (c === 'O' ? '⭕' : '❌') : esc(c)}</button>`).join('')}</div>`;
      $$('.choice', ans).forEach(b => b.onclick = () => finish(b.dataset.v));
    } else {
      ans.innerHTML = `<form class="short-row"><input class="input" maxlength="40" autocomplete="off" placeholder="답을 써요"><button class="btn v big">확인</button></form>`;
      const f = $('form', ans), inp = $('input', ans);
      f.onsubmit = e => { e.preventDefault(); if (inp.value.trim()) finish(inp.value.trim()); };
      setTimeout(() => inp.focus(), 50);
    }
    // 1~4 숫자키로 보기 고르기
    const onKey = e => { if (!view.choices || done) return; const n = '1234'.indexOf(e.key); if (n >= 0 && view.choices[n] != null) finish(view.choices[n]); };
    document.addEventListener('keydown', onKey);
    (opts.container || document.body).append(layer);
    if (view.time) {
      const bar = $('.bar i', layer), tl = $('.tleft', layer), total = view.time * 1000, start = opts.deadline ? opts.deadline - total : Date.now();
      const loop = () => {
        const left = Math.max(0, total - (Date.now() - start));
        bar.style.transform = `scaleX(${left / total})`; tl.textContent = `⏱ ${Math.ceil(left / 1000)}초`;
        if (left <= 0) { if (!done) finish(''); return; }
        raf = requestAnimationFrame(loop);
      };
      loop();
    }
    layer.closeQuiz = () => { done = true; close(); resolve(null); };
    opts.onOpen?.(layer);
  });
}

// ---------- QR (vendor/qrcode.js: 전역 qrcode) ----------
export function qrSVG(text, cell = 4) {
  if (!window.qrcode) return '';
  const q = window.qrcode(0, 'M'); q.addData(text); q.make();
  return q.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
}

export function confetti(n = 80) {
  const c = h('<canvas style="position:fixed;inset:0;pointer-events:none;z-index:900"></canvas>'); document.body.append(c);
  const x = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#ffd32a', '#ff5fa2', '#3fc3f0', '#2ed573', '#5b3bd6', '#ff9f43'];
  const ps = Array.from({ length: n }, () => ({ x: Math.random() * c.width, y: -20 - Math.random() * c.height * .5, vx: (Math.random() - .5) * 3, vy: 2 + Math.random() * 3, r: Math.random() * 6, s: 6 + Math.random() * 6, c: cols[Math.random() * 6 | 0] }));
  let f = 0; const loop = () => {
    x.clearRect(0, 0, c.width, c.height);
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.r += .1; x.save(); x.translate(p.x, p.y); x.rotate(p.r); x.fillStyle = p.c; x.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); x.restore(); }
    if (++f < 240) requestAnimationFrame(loop); else c.remove();
  }; loop();
}
setMuted(!sound.on);
// 그림을 못 불러오면 fn 실행 (이미 실패한 그림도 잡음)
export function onImgFail(img, fn) {
  if (!img) return;
  if (img.complete && img.naturalWidth === 0 && img.src) { fn(img); return; }
  img.addEventListener('error', () => fn(img), { once: true });
}
