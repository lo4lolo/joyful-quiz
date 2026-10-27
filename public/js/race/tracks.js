// 퀴즈 카트 레이스 트랙 (순수 수학: 브라우저·서버 공용, DOM·three.js 없음)
// 좌표: x·z 평면(미터), y 위. 카트 방향 h(라디안): 앞 = (sin h, cos h).
export const ROAD_W = 12;          // 도로 폭 (m)
export const HALF = ROAD_W / 2;    // 도로 반폭
export const WALL = HALF + 6;      // 이보다 멀리 나가면 부드러운 벽이 밀어 줌
const STEP = 2;                    // 샘플 간격 (m)

// 극좌표 고조파로 만든 닫힌 곡선은 스스로 겹치지 않는다(별 모양 곡선).
// a: [[k, 크기, 위상]] → r(θ) = 1 + Σ 크기·cos(kθ + 위상)
// 테마 색: ground/ground2(잔디 무늬), road, line(가운데 점선), curb[2], sky[위, 아래], fog,
// decor: [[종류, 비율]] (game3d.js가 모양을 만듦), night(밤 조명)
export const TRACKS = [
  { id: 'ground', name: '운동장 서킷', emoji: '🏫', len: 700, sx: 1.3, sz: 0.9, a: [[2, 0.14, 0], [3, 0.13, 0.5], [5, 0.025, 1]],
    theme: { ground: '#8fd968', ground2: '#7fcc5a', road: '#6d6f86', line: '#ffffff', curb: ['#ff5f7e', '#ffffff'],
      sky: ['#5ec8ff', '#d9f4ff'], fog: '#cdefff', light: 1.0,
      decor: [['tree_round', 5], ['tree_pine', 2], ['cone', 2], ['rock', 1], ['flower', 3]], clouds: 14 } },
  { id: 'desert', name: '사막 협곡', emoji: '🏜️', len: 820, sx: 1.2, sz: 1.0, a: [[2, 0.2, 0.3], [3, 0.12, 1.2], [4, 0.07, 0.4], [6, 0.02, 0]],
    theme: { ground: '#f3c77a', ground2: '#e9b866', road: '#9a6b4c', line: '#fff3c4', curb: ['#ff9f43', '#fff3c4'],
      sky: ['#ffb36b', '#ffe9b8'], fog: '#ffe2b0', light: 1.05,
      decor: [['cactus', 5], ['rock', 5], ['mesa', 2], ['cone', 1]], clouds: 6 } },
  { id: 'snow', name: '눈꽃 마을', emoji: '⛄', len: 760, sx: 1.0, sz: 1.05, a: [[3, 0.2, 0], [2, 0.1, 1], [5, 0.03, 0.7]],
    theme: { ground: '#f4f8ff', ground2: '#e3ecfb', road: '#7e8bb0', line: '#ffffff', curb: ['#3fa2f0', '#ffffff'],
      sky: ['#9ab8ff', '#eef3ff'], fog: '#e8efff', light: 0.95,
      decor: [['tree_pine', 7], ['snowman', 2], ['rock', 1], ['house', 2]], clouds: 10 } },
  { id: 'space', name: '우주 정거장', emoji: '🚀', len: 840, sx: 1.1, sz: 1.0, a: [[4, 0.15, 0], [1, 0.1, 0], [2, 0.06, 2]],
    theme: { ground: '#2d2463', ground2: '#3a2f7a', road: '#4b3f9a', line: '#7ff5ff', curb: ['#ff5fa2', '#7ff5ff'],
      sky: ['#0d0b2e', '#4a2c8f'], fog: '#2a1f66', light: 0.85, night: true,
      decor: [['crystal', 5], ['planet', 2], ['rock', 2], ['cone', 1]], clouds: 0 } },
  { id: 'beach', name: '바닷가', emoji: '🏖️', len: 720, sx: 1.4, sz: 0.8, a: [[2, 0.2, 0], [1, 0.1, 0.8], [3, 0.06, 2]],
    theme: { ground: '#ffe7a8', ground2: '#ffdc8f', road: '#5e9fc4', line: '#ffffff', curb: ['#ffd32a', '#ffffff'],
      sky: ['#45c7f5', '#e6fbff'], fog: '#d4f6ff', light: 1.05, water: '#3fc3f0',
      decor: [['palm', 6], ['umbrella', 3], ['rock', 2], ['flower', 1]], clouds: 12 } },
];
export const TRACK_COUNT = TRACKS.length;

// 닫힌 Catmull-Rom 곡선 (균일). pts: [[x,z]...] → 점(t) 함수
export function catmullRomClosed(pts) {
  const n = pts.length;
  return t => { // t: 0..1
    const f = ((t % 1) + 1) % 1 * n, i = Math.floor(f), u = f - i;
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const u2 = u * u, u3 = u2 * u;
    const c = (a, b, c2, d) => 0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u2 + (-a + 3 * b - 3 * c2 + d) * u3);
    return [c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])];
  };
}

function controlPoints(T, count = 36) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2;
    let r = 1; for (const [k, amp, ph] of T.a) r += amp * Math.cos(k * th + ph);
    pts.push([T.sx * r * Math.cos(th), T.sz * r * Math.sin(th)]);
  }
  return pts;
}

// 곡선을 STEP 간격으로 다시 고르게 샘플: [{x,z,d,tx,tz}] (d=누적 거리)
function sampleCurve(fn, targetLen) {
  const raw = []; const N = 3000;
  for (let i = 0; i <= N; i++) raw.push(fn(i / N));
  let len = 0; for (let i = 1; i <= N; i++) len += Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
  const sc = targetLen / len;
  const out = []; const n = Math.round(targetLen / STEP), seg = targetLen / n;
  let acc = 0, j = 1, want = 0;
  out.push({ x: raw[0][0] * sc, z: raw[0][1] * sc });
  want = seg;
  while (out.length < n && j <= N) {
    const ax = raw[j - 1][0] * sc, az = raw[j - 1][1] * sc, bx = raw[j][0] * sc, bz = raw[j][1] * sc;
    const l = Math.hypot(bx - ax, bz - az);
    if (acc + l >= want) { const u = (want - acc) / l; out.push({ x: ax + (bx - ax) * u, z: az + (bz - az) * u }); want += seg; continue; }
    acc += l; j++;
  }
  for (let i = 0; i < out.length; i++) {
    const a = out[(i - 1 + out.length) % out.length], b = out[(i + 1) % out.length];
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    out[i].tx = dx / l; out[i].tz = dz / l; out[i].d = i * seg;
  }
  return { samples: out, length: n * seg };
}

const cache = new Map();
export function buildTrack(index = 0) {
  index = Math.max(0, Math.min(TRACKS.length - 1, index | 0));
  if (cache.has(index)) return cache.get(index);
  const T = TRACKS[index];
  const { samples, length } = sampleCurve(catmullRomClosed(controlPoints(T)), T.len);
  const n = samples.length;
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minZ = Math.min(minZ, s.z); maxZ = Math.max(maxZ, s.z); }

  // 가장 가까운 도로 위치 → {i, prog(0..1), lat(왼쪽 +), px,pz(도로 중심점), tx,tz}
  function progressAt(x, z, hint = -1) {
    let best = -1, bd = Infinity;
    if (hint >= 0) {
      for (let o = -24; o <= 24; o++) { const i = (hint + o + n) % n, s = samples[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    if (best < 0 || bd > 30 * 30) { // 힌트가 없거나 너무 멀면 전체 검색
      for (let i = 0; i < n; i++) { const s = samples[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = i; } }
    }
    // 이웃 구간에 투영해 부드러운 진행도
    const s = samples[best];
    let along = (x - s.x) * s.tx + (z - s.z) * s.tz;
    along = Math.max(-STEP, Math.min(STEP, along));
    const px = s.x + s.tx * along, pz = s.z + s.tz * along;
    const lat = (x - px) * -s.tz + (z - pz) * s.tx; // 왼쪽 법선 (-tz, tx)
    const d = ((s.d + along) % length + length) % length;
    return { i: best, prog: d / length, lat, px, pz, tx: s.tx, tz: s.tz };
  }
  // 진행도(0..1, 음수 가능) → 위치·방향
  function pointAt(prog, lat = 0) {
    const d = ((prog % 1 + 1) % 1) * length, f = d / (length / n), i = Math.floor(f) % n, u = f - Math.floor(f);
    const a = samples[i], b = samples[(i + 1) % n];
    const x = a.x + (b.x - a.x) * u, z = a.z + (b.z - a.z) * u;
    let tx = a.tx + (b.tx - a.tx) * u, tz = a.tz + (b.tz - a.tz) * u; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    return { x: x - tz * lat, z: z + tx * lat, tx, tz, h: Math.atan2(tx, tz), i };
  }
  // 퀴즈 게이트 진행도 (출발선 근처는 비움)
  function gates(count) {
    const out = []; for (let i = 0; i < count; i++) out.push(0.08 + (i + 0.5) * 0.84 / count);
    return out;
  }
  // 아이템 상자 줄: 게이트 사이 가운데. lanes: 줄마다 가로 위치
  function boxes(gateCount) {
    const g = gates(gateCount);
    const marks = gateCount ? [0, ...g, 1] : [0, 0.25, 0.5, 0.75, 1];
    const rows = [];
    for (let i = 0; i < marks.length - 1; i++) {
      const p = gateCount ? (marks[i] + marks[i + 1]) / 2 : marks[i + 1];
      if (p > 0.04 && p < 0.97) rows.push(p);
    }
    return rows.map(p => ({ prog: p, lanes: [-4.5, -1.5, 1.5, 4.5] }));
  }
  // 출발 자리 (출발선 뒤로 4줄)
  function grid(slot) {
    const row = Math.floor(slot / 4), col = slot % 4;
    const back = 7 + row * 5 + (col % 2) * 1.2;
    const p = pointAt(-back / length, [-4.5, -1.5, 1.5, 4.5][col]);
    return { x: p.x, z: p.z, h: p.h, rp: -back / length };
  }
  const tr = { index, id: T.id, name: T.name, emoji: T.emoji, theme: T.theme, samples, length, n,
    bounds: { minX, maxX, minZ, maxZ }, progressAt, pointAt, gates, boxes, grid };
  cache.set(index, tr);
  return tr;
}

// 진행도 차이 (한 바퀴를 넘나들 때 보정): -0.5..0.5
export const wrapDelta = d => d - Math.round(d);
