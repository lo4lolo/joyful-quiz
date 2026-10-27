// 즐거운 퀴즈 서버: 정적 파일 + socket.io 임시 방.
// 학생 기록은 메모리에만 잠깐 두고 디스크에 쓰지 않는다. 방을 닫거나 4시간이 지나면 지운다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { cleanQuestions, studentView, grade, shuffle } from './server/quiz.js';
import { TEAMS, MAX_TEAMS, assignTeams, smallestTeam } from './server/teams.js';

const VERSION = '0.4.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(ROOT, 'public');
const PORT = +process.env.PORT || 3030;
// 인터넷에 올릴 때: PUBLIC_URL=https://주소/ (학생 QR 주소), TEACHER_PIN=선생님만 아는 숫자 (방 만들기 잠금)
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/?$/, process.env.PUBLIC_URL ? '/' : '');
const TEACHER_PIN = String(process.env.TEACHER_PIN || '');
// 화면을 다른 주소(예: GitHub Pages)에서 열 때 허용할 주소들. 비우면 같은 주소만.
const ALLOWED = String(process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
// 학생 기록은 메모리에만: 방을 닫으면 바로, 끝난 방은 선생님이 떠나고 10분 뒤 지운다
const MAX_ROOMS = 300, MAX_PLAYERS = 300, ROOM_TTL = 4 * 3600e3, ENDED_TTL = 10 * 60e3;
// 게임 방식: server/modes/<id>.js 파일이 있으면 불러온다 (순서 = 화면 순서)
const MODE_IDS = ['race', 'live', 'chest', 'territory', 'shop', 'fishing', 'raid', 'royale', 'tug', 'mugunghwa', 'yut'];
export const MODES = Object.create(null);
for (const m of MODE_IDS) {
  const f = path.join(ROOT, 'server', 'modes', m + '.js');
  if (!fs.existsSync(f)) continue;
  try { const mod = (await import(new URL('./server/modes/' + m + '.js', import.meta.url))).default; if (mod?.id) MODES[mod.id] = mod; }
  catch (e) { console.error(`게임 방식 ${m} 을(를) 불러오지 못했어요:`, e.message); }
}

// ---------- 정적 파일 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.glb': 'model/gltf-binary', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.webp': 'image/webp', '.md': 'text/markdown; charset=utf-8' };
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
  "font-src 'self' data:; connect-src 'self' ws: wss:; media-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'";

function lanUrls() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || [])
    if (n.family === 'IPv4' && !n.internal && !n.address.startsWith('169.254.')) out.push(`http://${n.address}:${PORT}/`);
  return out;
}

const server = http.createServer((req, res) => {
  try { serve(req, res); } catch { if (!res.headersSent) res.writeHead(400); res.end(); }
});
function serve(req, res) {
  const url = new URL(req.url, 'http://x');
  const head = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': CSP };
  if (url.pathname === '/api/stats' && process.env.LOADTEST === '1') { // 부하 시험 때만
    res.writeHead(200, { ...head, 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ cpu: process.cpuUsage(), mem: process.memoryUsage().rss, up: process.uptime(), sent: STATS.sent, recv: STATS.recv, wire: STATS.wireNow?.() || 0, types: STATS.types, sockets: io.engine.clientsCount, rooms: rooms.size }));
  }
  if (url.pathname === '/api/info') {
    const o = req.headers.origin;
    if (o && ALLOWED.includes(o)) { head['Access-Control-Allow-Origin'] = o; head['Vary'] = 'Origin'; }
    res.writeHead(200, { ...head, 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ version: VERSION, lan: PUBLIC_URL ? [] : lanUrls(), publicUrl: PUBLIC_URL, pinRequired: !!TEACHER_PIN,
      modes: Object.values(MODES).map(m => ({ id: m.id, name: m.name })) }));
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, head); return res.end(); }
  let p = decodeURIComponent(url.pathname);
  if (p.includes(String.fromCharCode(0))) { res.writeHead(400, head); return res.end(); }
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(PUB, p));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403, head); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { ...head, 'Content-Type': MIME['.html'] }); return res.end('<h1>404</h1><a href="/">처음으로</a>'); }
    const ext = path.extname(file).toLowerCase();
    const lm = st.mtime.toUTCString();
    const cache = /[\\/](vendor|assets)[\\/]/.test(file) ? 'public, max-age=86400' : 'no-cache';
    if (req.headers['if-modified-since'] === lm) { res.writeHead(304, { ...head, 'Last-Modified': lm, 'Cache-Control': cache }); return res.end(); }
    res.writeHead(200, { ...head, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Content-Length': st.size, 'Last-Modified': lm, 'Cache-Control': cache });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
  });
}

// 큰 메시지(1KB 넘는 순위표 등)만 압축: 무료 서버의 대역폭을 아끼고 CPU는 덜 쓴다
const io = new Server(server, { maxHttpBufferSize: 2e6, pingInterval: 25000, pingTimeout: 20000, serveClient: true,
  perMessageDeflate: { threshold: 1024, zlibDeflateOptions: { level: 3 }, serverNoContextTakeover: true, clientNoContextTakeover: true },
  cors: { origin: (origin, cb) => cb(null, !origin || ALLOWED.length === 0 || ALLOWED.includes(origin)) } });
const STATS = { sent: 0, recv: 0, wire: 0 };
if (process.env.LOADTEST === '1') { let closed = 0; const live = new Set();
  server.on('connection', c => { live.add(c); c.on('close', () => { closed += c.bytesWritten; live.delete(c); }); });
  STATS.wireNow = () => closed + [...live].reduce((a, c) => a + c.bytesWritten, 0); }
if (process.env.LOADTEST === '1') io.engine.on('connection', s => {
  s.on('packetCreate', p => {
    const n = typeof p.data === 'string' ? p.data.length : 8; STATS.sent += n;
    const m = typeof p.data === 'string' && p.data.match(/^\d*\["(\w+)"(?:,\{"type":"([\w:]+)")?/);
    const k = m ? (m[2] ? m[1] + ':' + m[2] : m[1]) : 'ping'; (STATS.types ||= {})[k] = ((STATS.types[k]) || 0) + n;
  });
  s.on('packet', p => { STATS.recv += typeof p.data === 'string' ? p.data.length : 8; });
});

// ---------- 방 ----------
const rooms = new Map();
const id = (n = 9) => crypto.randomBytes(n).toString('base64url');
function newCode() {
  for (let i = 0; i < 500; i++) { const c = String(1000 + crypto.randomInt(9000)); if (!rooms.has(c)) return c; }
  return null;
}
const cleanName = (s, n = 12) => String(s ?? '').normalize('NFC').replace(/[<>&"'`\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const cleanTitle = s => cleanName(s, 40);
const cleanAvatar = a => ({
  char: typeof a?.char === "string" && /^[a-z0-9_]{2,12}$/.test(a.char) ? a.char : null,
  face: String(a?.face ?? '🐱').slice(0, 8), color: /^#[0-9a-f]{6}$/i.test(a?.color) ? a.color : '#3D8BFF',
  kart: Math.max(0, Math.min(7, a?.kart | 0)), hat: Math.max(0, Math.min(9, a?.hat | 0)),
});
// 별명 모드: p.name = 친구들에게 보이는 별명, p.realName = 선생님 기록용 이름
const pubPlayer = (p, teacher) => ({ pid: p.pid, name: p.name, ...(teacher ? { realName: p.realName } : {}), avatar: p.avatar, team: p.team, online: p.online, device: p.device });
const ADJ = ['반짝이는', '용감한', '말랑한', '씩씩한', '졸린', '배고픈', '신나는', '수줍은', '날쌘', '똑똑한', '웃는', '꿈꾸는', '빙글빙글', '보송보송', '튼튼한', '상냥한'];
const NOUN = ['고구마', '구름', '감자', '별사탕', '도토리', '젤리', '만두', '호떡', '솜사탕', '단추', '연필', '지우개', '풍선', '눈사람', '붕어빵', '해바라기'];
function uniqueNick(room) {
  for (let i = 0; i < 60; i++) {
    const n = ADJ[crypto.randomInt(ADJ.length)] + ' ' + NOUN[crypto.randomInt(NOUN.length)];
    if (![...room.players.values()].some(p => p.name === n)) return n;
  }
  return '친구 ' + (room.players.size + 1);
}

function roomInfo(room, teacher = false) {
  return { code: room.code, title: room.title, mode: room.mode, modeName: MODES[room.mode].name, state: room.state, startedAt: room.startedAt || 0,
    locked: !!room.locked, teamCount: room.teamCount || 0, teams: TEAMS.slice(0, room.teamCount || 0), settings: room.settings, qcount: room.questions.length, players: [...room.players.values()].map(p => pubPlayer(p, teacher)) };
}
function makeApi(room) {
  const M = MODES[room.mode];
  const api = {
    room,
    players: () => [...room.players.values()],
    toAll: (type, data) => io.to(room.code).emit('m', { type, data }),
    toStudents: (type, data) => io.to(room.code + ':s').emit('m', { type, data }),
    toTeacher: (type, data) => io.to(room.code + ':t').emit('m', { type, data }),
    toPlayer: (pid, type, data) => { const p = room.players.get(pid); if (p?.sid) io.to(p.sid).emit('m', { type, data }); },
    feed: text => { const f = { text: String(text).slice(0, 140), t: Date.now() }; room.feed.push(f); if (room.feed.length > 60) room.feed.shift(); io.to(room.code + ':t').emit('feed', f); },
    // 주기적으로 보내는 순위표 등: 바뀐 게 없으면 건너뛴다 (시간 값은 비교에서 빼고, every ms 마다는 꼭 보냄)
    toAllIfChanged(type, data, { to = 'all', ignore = ['left', 'ms', 'timeLeft', 'endsIn', 'now', 't'], every = 4000 } = {}) {
      const key = to + ':' + type, sig = JSON.stringify(data, (k, v) => (ignore.includes(k) ? undefined : v)), now = Date.now();
      const last = (room.sent ||= Object.create(null))[key];
      if (last && last.sig === sig && now - last.t < every) return false;
      room.sent[key] = { sig, t: now };
      (to === 'students' ? api.toStudents : to === 'teacher' ? api.toTeacher : api.toAll)(type, data); return true;
    },
    sendRoom: () => { io.to(room.code + ':s').emit('room', roomInfo(room)); io.to(room.code + ':t').emit('room', roomInfo(room, true)); },
    // 자율 진행: 학생마다 섞인 순서로 다음 문제
    nextQi(p) {
      if (!p.order.length) {
        p.order = shuffle(room.questions.map(q => q.qid));
        if (p.order.length > 1 && p.order[p.order.length - 1] === p.lastQi) p.order.unshift(p.order.pop());
      }
      return p.order.pop();
    },
    ask(p, qi = api.nextQi(p), time = room.settings.time) {
      const v = studentView(room.questions, qi, p.device, time);
      p.pending = { qid: v.qid, sentAt: Date.now(), time, kind: v.kind }; p.lastQi = qi;
      if (p.sid) io.to(p.sid).emit('q', v);
      return v;
    },
    // 모두에게 같은 문제 (교사 진행형). 보기 순서도 같게.
    askAll(qi, time) {
      const pcView = studentView(room.questions, qi, 'pc', time), touchView = studentView(room.questions, qi, 'touch', time);
      if (pcView.choices && touchView.choices && pcView.kind === touchView.kind) touchView.choices = pcView.choices;
      const now = Date.now();
      for (const p of room.players.values()) {
        const v = p.device === 'touch' ? touchView : pcView;
        p.pending = { qid: qi, sentAt: now, time, kind: v.kind };
        if (p.sid) io.to(p.sid).emit('q', v);
      }
      return { pcView, touchView };
    },
    grade(p, qid, given) {
      if (!p.pending || p.pending.qid !== qid) return null;
      const Q = room.questions[qid]; if (!Q) return null;
      const ms = Date.now() - p.pending.sentAt;
      const pend = p.pending;
      p.pending = null; p.pendingKind = pend?.kind;
      const g = String(given ?? '').slice(0, 80);
      const r = grade(Q, g);
      // 정오답 말고도: 몇 번째 만난 문제인지(try), 게임 속 몇 번째 답(seq), 직전 연속 정답(streak), 건너뜀(skip), 문제 모양(kind)
      const seen = (p.seen ||= Object.create(null)); seen[qid] = (seen[qid] || 0) + 1;
      const entry = { pid: p.pid, name: p.realName || p.name, qid, ok: r.ok, given: g, ms, t: Date.now(),
        try: seen[qid], seq: p.stats.n + 1, streak: p.streakNow | 0, skip: !g, kind: p.pendingKind || Q.kind, dev: p.device === 'touch' ? 't' : 'p' };
      p.streakNow = r.ok ? (p.streakNow | 0) + 1 : 0;
      if (room.log.length < 50000) room.log.push(entry);
      io.to(room.code + ':t').emit('log', entry);
      p.stats.n++; if (r.ok) p.stats.ok++;
      return { ...r, qid, given: g, ms };
    },
    end() { endRoom(room); },
    // 모둠: 선생님이 대기실에서 나눈 모둠을 그대로 쓰고, 개수가 다르면 다시 나눈다
    ensureTeams(n) {
      n = n | 0;
      if (n <= 0) n = room.teamCount || Math.min(4, Math.max(2, Math.ceil(room.players.size / 4))); // 0 = 대기실 모둠 그대로 (없으면 4명씩)
      n = Math.max(1, Math.min(MAX_TEAMS, n));
      const ps = [...room.players.values()];
      const ok = room.teamCount === n && ps.every(p => Number.isInteger(p.team) && p.team < n);
      if (!ok) { assignTeams(ps, n, room.teamCount === n); room.teamCount = n; }
      api.sendRoom();
      return TEAMS.slice(0, n);
    },
    teams: () => TEAMS.slice(0, room.teamCount || 0),
    // 연구용 협력 기록 (도움·함께 성공 등). 교사 브라우저가 기록 파일에 함께 저장한다.
    event(type, pid, data = {}) {
      const p = pid ? room.players.get(pid) : null;
      const e = { t: Date.now(), type: String(type).slice(0, 30), pid: p?.pid || null, team: p?.team ?? data.team ?? null, data };
      io.to(room.code + ':t').emit('evt', e);
    },
  };
  return api;
}

function endRoom(room) {
  if (room.state === 'end') return;
  const M = MODES[room.mode];
  room.state = 'end'; room.endedAt = Date.now();
  const ranking = M.ranking(room);
  room.lastRanking = ranking;
  room.lastRankingT = teacherRanking(room, ranking);
  io.to(room.code + ':s').emit('end', { ranking });
  io.to(room.code + ':t').emit('end', { ranking: room.lastRankingT });
  room.api.sendRoom();
}
// 선생님 기록에는 실제 이름 (별명은 nick 으로 함께)
const teacherRanking = (room, ranking) => ranking.map(r => { const p = room.players.get(r.pid); return p?.realName && p.realName !== r.name ? { ...r, name: p.realName, nick: r.name } : r; });

function closeRoom(room, reason = 'closed') {
  io.to(room.code + ':s').emit('kicked', { reason });
  io.in(room.code).socketsLeave([room.code, room.code + ':s', room.code + ':t']);
  room.players.clear(); room.log.length = 0;
  rooms.delete(room.code);
}

setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (room.teacherOnline) room.teacherSeen = now;
    if (now - room.createdAt > ROOM_TTL || (room.state === 'end' && now - room.endedAt > ENDED_TTL && !room.teacherOnline)
      || (room.state === 'lobby' && !room.teacherOnline && now - (room.teacherSeen || room.createdAt) > ENDED_TTL)) { closeRoom(room, 'expired'); continue; }
    if (room.state === 'play') { try { MODES[room.mode].tick?.(room, room.api, 100); } catch (e) { console.error('tick', e); } }
  }
}, 100).unref();

// 소켓마다 간단한 속도 제한 (초당 40개)
function limiter(socket) {
  let tokens = 40, last = Date.now();
  return () => { const n = Date.now(); tokens = Math.min(40, tokens + (n - last) * 0.04); last = n; return tokens-- > 0; };
}

io.on('connection', socket => {
  const allow = limiter(socket);
  let room = null, player = null, isTeacher = false, created = [];
  const on = (ev, fn) => socket.on(ev, (data, ack) => {
    if (!allow()) { if (typeof ack === 'function') ack({ error: '너무 빨리 눌렀어요. 잠깐만 기다려 주세요.', slow: true }); return; }
    try { fn(data || {}, typeof ack === 'function' ? ack : () => {}); } catch (e) { console.error(ev, e); }
  });

  // ----- 교사 -----
  on('t:create', (d, ack) => {
    if (rooms.size >= MAX_ROOMS) return ack({ error: '지금은 방이 너무 많아요. 잠시 뒤에 다시 해 주세요.' });
    const M = typeof d.mode === 'string' ? MODES[d.mode] : null; if (!M) return ack({ error: '게임 방식을 골라 주세요.' });
    created = created.filter(t => Date.now() - t < 600e3);
    if (created.length >= 6) return ack({ error: '방을 너무 많이 만들었어요. 잠시 뒤에 다시 해 주세요.' });
    created.push(Date.now());
    const questions = cleanQuestions(d.questions);
    if (!questions.length) return ack({ error: '문제를 1개 이상 넣어 주세요.' });
    const code = newCode(); if (!code) return ack({ error: '방 번호를 만들 수 없어요.' });
    if (TEACHER_PIN && String(d.pin || '') !== TEACHER_PIN) return ack({ error: '선생님 PIN이 맞지 않아요.', pin: true });
    const base = { time: Math.max(5, Math.min(120, d.settings?.time | 0 || 20)), maxPlayers: Math.max(2, Math.min(M.id === 'race' ? 40 : MAX_PLAYERS, d.settings?.maxPlayers | 0 || 40)), nick: !!d.settings?.nick };
    room = { code, key: id(18), title: cleanTitle(d.title) || '우리 반', mode: M.id, settings: { ...base, ...M.settings(d.settings || {}) },
      questions, players: new Map(), log: [], feed: [], state: 'lobby', createdAt: Date.now(), teacherOnline: true, m: {} };
    room.api = makeApi(room);
    rooms.set(code, room);
    isTeacher = true; socket.join([code, code + ':t']);
    ack({ code, key: room.key, room: roomInfo(room, true), questions: room.questions });
  });
  on('t:rejoin', (d, ack) => {
    const r = rooms.get(String(d.code)); if (!r || r.key !== d.key) return ack({ error: 'gone' });
    room = r; isTeacher = true; room.teacherOnline = true; socket.join([r.code, r.code + ':t']);
    ack({ room: roomInfo(r, true), questions: r.questions, log: r.log, feed: r.feed, snapshot: r.state === 'play' ? MODES[r.mode].snapshot?.(r, null) : null, ranking: r.lastRankingT || null });
  });
  const T = fn => (d, ack) => { if (isTeacher && room && rooms.has(room.code)) fn(d, ack); };
  on('t:update', T((d, ack) => { // 대기실에서 문제·설정 바꾸기
    if (room.state === 'play') return ack({ error: '진행 중에는 바꿀 수 없어요.' });
    const M = (typeof d.mode === 'string' && MODES[d.mode]) || MODES[room.mode];
    const qs = d.questions ? cleanQuestions(d.questions) : room.questions;
    if (!qs.length) return ack({ error: '문제를 1개 이상 넣어 주세요.' });
    room.mode = M.id; room.questions = qs; room.title = cleanTitle(d.title) || room.title;
    room.settings = { ...room.settings, time: Math.max(5, Math.min(120, d.settings?.time | 0 || room.settings.time)), ...M.settings(d.settings || {}) };
    if (d.settings && 'nick' in d.settings) room.settings.nick = !!d.settings.nick;
    if (d.settings?.maxPlayers) room.settings.maxPlayers = Math.max(2, Math.min(M.id === 'race' ? 40 : MAX_PLAYERS, d.settings.maxPlayers | 0));
    room.api = makeApi(room);
    room.api.sendRoom(); ack({ room: roomInfo(room, true), questions: room.questions });
  }));
  on('t:start', T((d, ack) => {
    if (room.state === 'play') return ack({ error: '이미 시작했어요.' });
    const online = [...room.players.values()].filter(p => p.online);
    if (!online.length) return ack({ error: '들어온 학생이 없어요.' });
    // 다시 하기: 점수·순서 초기화 (기록은 교사 쪽에서 새 파일로 저장)
    for (const p of room.players.values()) { p.score = 0; p.order = []; p.pending = null; p.stats = { n: 0, ok: 0 }; p.m = {}; p.seen = Object.create(null); p.streakNow = 0; }
    room.log = []; room.feed = []; room.m = {}; room.lastRanking = null;
    room.state = 'play'; room.startedAt = Date.now();
    room.api.sendRoom(); // 먼저 '시작' 상태를 알려 화면을 준비시키고
    MODES[room.mode].start(room, room.api);
    ack({ ok: true, startedAt: room.startedAt });
  }));
  on('t:end', T((d, ack) => { endRoom(room); ack({ ranking: room.lastRanking }); }));
  on('t:lobby', T((d, ack) => { room.state = 'lobby'; room.api.sendRoom(); ack({ ok: true }); }));
  on('t:kick', T((d, ack) => {
    const p = room.players.get(d.pid); if (!p) return ack({});
    if (p.sid) io.to(p.sid).emit('kicked', { reason: 'kick' });
    room.players.delete(p.pid); room.api.sendRoom(); ack({ ok: true });
  }));
  on('t:teams', T((d, ack) => { // 모둠 수 정하기 (0 = 모둠 없음), shuffle=true 면 새로 섞기
    if (room.state === 'play') return ack({ error: '게임 중에는 모둠을 바꿀 수 없어요.' });
    const n = Math.max(0, Math.min(MAX_TEAMS, d.count | 0));
    assignTeams([...room.players.values()], n, !d.shuffle && room.teamCount === n);
    room.teamCount = n; room.api.sendRoom(); ack({ ok: true, teamCount: n });
  }));
  on('t:setTeam', T((d, ack) => {
    const p = room.players.get(d.pid); const n = room.teamCount || 0;
    if (!p || !n) return ack({ error: '모둠을 먼저 정해 주세요.' });
    p.team = Math.max(0, Math.min(n - 1, d.team | 0)); room.api.sendRoom(); ack({ ok: true });
  }));
  on('t:lock', T((d, ack) => { room.locked = !!d.locked; room.api.sendRoom(); ack({ ok: true, locked: room.locked }); }));
  on('t:close', T((d, ack) => { closeRoom(room); room = null; isTeacher = false; ack({ ok: true }); }));
  // 선생님이 결과를 저장했으면 서버 메모리의 응답 기록을 바로 지운다 (순위만 남겨 학생 결과 화면 유지)
  on('t:purge', T((d, ack) => { room.log.length = 0; room.feed.length = 0; ack({ ok: true }); }));
  on('t:mode', T((d, ack) => { if (room.state === 'play') MODES[room.mode].onTeacher?.(room, String(d.type), d.data || {}, room.api, ack); }));

  // ----- 학생 -----
  on('s:join', (d, ack) => {
    const r = rooms.get(String(d.code).trim());
    if (!r) return ack({ error: '방 번호를 다시 확인해 주세요.' });
    let p = d.token ? [...r.players.values()].find(x => x.token === d.token) : null;
    if (!p) {
      const name = cleanName(d.name);
      if (!name) return ack({ error: '이름을 써 주세요.' });
      const same = r.settings.nick ? null : [...r.players.values()].find(x => x.name === name);
      if (same && same.online) return ack({ error: '같은 이름이 이미 있어요. 번호를 붙여 주세요. (예: 3 김민지)' });
      const sameReal = [...r.players.values()].find(x => x.realName === name);
      if (sameReal?.online) return ack({ error: '같은 이름이 이미 있어요. 번호를 붙여 주세요. (예: 3 김민지)' });
      if (same || sameReal) p = same || sameReal; // 같은 이름으로 다시 들어옴 (다른 기기)
      else {
        if (r.locked) return ack({ error: '선생님이 입장을 잠갔어요. 선생님께 말씀드려요.' });
        if (r.players.size >= r.settings.maxPlayers) return ack({ error: '방이 가득 찼어요.' });
        p = { pid: id(6), token: id(18), realName: name, name: r.settings.nick ? uniqueNick(r) : name, avatar: cleanAvatar(d.avatar), device: d.device === 'touch' ? 'touch' : 'pc', team: null,
          score: 0, order: [], pending: null, stats: { n: 0, ok: 0 }, m: {}, joinedAt: Date.now() };
        if (r.teamCount) p.team = smallestTeam([...r.players.values()], r.teamCount);
        r.players.set(p.pid, p);
        MODES[r.mode].onJoin?.(r, p, r.api);
      }
    }
    if (p.sid && p.sid !== socket.id) io.sockets.sockets.get(p.sid)?.emit('kicked', { reason: 'other' });
    if (d.device) p.device = d.device === 'touch' ? 'touch' : 'pc';
    room = r; player = p; p.sid = socket.id; p.online = true;
    socket.join([r.code, r.code + ':s']);
    r.api.sendRoom();
    ack({ ok: true, pid: p.pid, token: p.token, name: p.name, realName: p.realName, avatar: p.avatar, room: roomInfo(r),
      snapshot: r.state === 'play' ? MODES[r.mode].snapshot?.(r, p) : null, ranking: r.state === 'end' ? r.lastRanking : null });
    if (r.state === 'play' && p.pending) { // 다시 접속: 풀던 문제 다시 보내기
      const left = p.pending.time - (Date.now() - p.pending.sentAt) / 1000;
      const v = studentView(r.questions, p.pending.qid, p.device, Math.max(2, Math.round(left))); socket.emit('q', v);
    }
  });
  const S = fn => (d, ack) => { if (player && room && rooms.has(room.code) && room.players.get(player.pid) === player) fn(d, ack); };
  on('s:avatar', S((d, ack) => { player.avatar = cleanAvatar(d.avatar); room.api.sendRoom(); ack({ ok: true }); }));
  on('s:ask', S((d, ack) => {
    if (room.state !== 'play' || !MODES[room.mode].selfPaced) return ack({ error: 'wait' });
    if (MODES[room.mode].canAsk && !MODES[room.mode].canAsk(room, player)) return ack({ error: 'wait' });
    if (!player.pending && Date.now() - (player.lastAsk || 0) < 700) return ack({ error: 'wait' }); // 마구 누르기 방지
    if (!player.pending) player.lastAsk = Date.now();
    if (!player.pending) room.api.ask(player);
    else socket.emit('q', studentView(room.questions, player.pending.qid, player.device, Math.max(2, Math.round(player.pending.time - (Date.now() - player.pending.sentAt) / 1000))));
    ack({ ok: true });
  }));
  on('s:answer', S((d, ack) => {
    if (room.state !== 'play') return;
    const res = room.api.grade(player, d.qid | 0, d.given);
    if (!res) return ack({ error: 'late' });
    ack(res);
    MODES[room.mode].onAnswer?.(room, player, res, room.api);
  }));
  // 성찰: 게임이 끝난 뒤 "오늘 내가 모둠에 보탠 몫" (연구용 기록으로 교사에게)
  on('s:reflect', S((d, ack) => {
    const v = ['great', 'good', 'little', 'next'].includes(d.v) ? d.v : null; if (!v) return ack({ error: 'bad' });
    if (player.reflected === room.endedAt) return ack({ ok: true });
    player.reflected = room.endedAt;
    room.api.event('reflect', player.pid, { v, mode: room.mode }); ack({ ok: true });
  }));
  on('s:mode', S((d, ack) => { if (room.state === 'play') MODES[room.mode].onStudent?.(room, player, String(d.type), d.data || {}, room.api, ack); }));

  socket.on('disconnect', () => { try { onDisconnect(); } catch (e) { console.error('disconnect', e); } });
  function onDisconnect() {
    if (!room || !rooms.has(room.code)) return;
    if (isTeacher) { room.teacherOnline = io.sockets.adapter.rooms.get(room.code + ':t')?.size > 0; return; }
    if (player && player.sid === socket.id) {
      player.online = false; player.sid = null;
      MODES[room.mode].onLeave?.(room, player, room.api);
      room.api.sendRoom();
    }
  }
});

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`\n  🎉 즐거운 퀴즈 v${VERSION}`);
    console.log(`  선생님 화면: http://localhost:${PORT}/teacher.html`);
    for (const u of lanUrls()) console.log(`  학생 주소:   ${u}`);
    console.log('  학생 기록은 이 서버에 저장되지 않아요. 결과는 선생님 화면에서 내려받아 보관하세요.');
    console.log('  끝내려면 이 창에서 Ctrl+C 를 누르세요.\n');
  });
}
export { server, io, rooms };
