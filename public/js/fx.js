// 게임 손맛 효과 (game-feel 3단: 가벼움 / 보통 / 강함). 움직임 줄이기 설정이면 흔들림·번쩍은 생략.
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#FFE14D', '#FF6F61', '#3D8BFF', '#2ED3A0', '#8C6CFF', '#FF6F91'];
let actx = null;
const AC = () => (actx ||= new (window.AudioContext || window.webkitAudioContext)());
export let muted = false;
export const setMuted = m => { muted = m; };
function tone(f, d = .1, type = 'square', v = .08, when = 0, slide = 0) {
  if (muted) return;
  try {
    const c = AC(), t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.0001, t + d); o.connect(g).connect(c.destination); o.start(t); o.stop(t + d + .02);
  } catch {}
}
const center = el => { const r = el?.getBoundingClientRect?.(); return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: innerWidth / 2, y: innerHeight / 2 }; };

// 색종이 조각 (캔버스 한 장을 재사용)
let cv = null, ctx2 = null, parts = [], raf = 0;
function burst(x, y, n = 12, power = 1) {
  if (!cv) { cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:955'; document.body.append(cv); ctx2 = cv.getContext('2d'); }
  cv.width = innerWidth; cv.height = innerHeight;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (2 + Math.random() * 5) * power;
    parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 3 * power, r: Math.random() * 6, vr: (Math.random() - .5) * .4, w: 6 + Math.random() * 7, c: COLORS[i % COLORS.length], life: 50 + Math.random() * 30 });
  }
  if (!raf) loop();
}
function loop() {
  ctx2.clearRect(0, 0, cv.width, cv.height);
  parts = parts.filter(p => p.life-- > 0);
  for (const p of parts) {
    p.x += p.vx; p.y += p.vy; p.vy += .25; p.vx *= .98; p.r += p.vr;
    ctx2.save(); ctx2.translate(p.x, p.y); ctx2.rotate(p.r); ctx2.globalAlpha = Math.min(1, p.life / 20);
    ctx2.fillStyle = p.c; ctx2.strokeStyle = '#1B2A4A'; ctx2.lineWidth = 1.5;
    ctx2.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); ctx2.strokeRect(-p.w / 2, -p.w / 4, p.w, p.w / 2); ctx2.restore();
  }
  raf = parts.length ? requestAnimationFrame(loop) : (ctx2.clearRect(0, 0, cv.width, cv.height), 0);
}
function cls(el, c, ms) { if (!el) return; el.classList.remove(c); void el.offsetWidth; el.classList.add(c); setTimeout(() => el.classList.remove(c), ms); }

export const fx = {
  // 가벼움: 고르기·버튼
  light(el) { const p = center(el); burst(p.x, p.y, 5, .5); tone(1320, .04, 'square', .05); },
  // 보통: 정답·획득. text 는 떠오르는 글자 (+50 등)
  medium(el, text, color) { const p = center(el); burst(p.x, p.y, 12, .9); if (el) cls(el, 'fx-bounce', 460); if (text) this.float(el, text, color); tone(784, .08, 'square', .07); tone(1175, .14, 'square', .07, .07); },
  // 강함: 대박·1등·보스 처치
  heavy(text, color) {
    burst(innerWidth / 2, innerHeight * .42, 40, 1.6);
    if (!reduce()) { cls(document.body, 'fx-quake', 300); const f = document.createElement('div'); f.className = 'fx-flash'; document.body.append(f); setTimeout(() => f.remove(), 300); }
    tone(110, .35, 'sawtooth', .09, 0, .5); tone(523, .12, 'square', .07, .12); tone(784, .12, 'square', .07, .22); tone(1047, .3, 'square', .07, .32);
    if (text) this.stamp(text, color);
  },
  stamp(text, color = '#FF6F61') {
    const s = document.createElement('div'); s.className = 'fx-stamp'; s.textContent = text; s.style.setProperty('--c', color);
    document.body.append(s); setTimeout(() => { tone(90, .18, 'triangle', .14); }, 200); setTimeout(() => s.remove(), 1000);
  },
  float(el, text, color = '#1B2A4A') {
    const p = center(el), f = document.createElement('div'); f.className = 'fx-float'; f.textContent = text; f.style.color = color;
    f.style.left = p.x + 'px'; f.style.top = (p.y - 20) + 'px'; document.body.append(f); setTimeout(() => f.remove(), 1000);
  },
  shake(el) { cls(el, 'fx-shake', 340); tone(180, .2, 'sawtooth', .06, 0, .6); },
  burst,
};
export default fx;
