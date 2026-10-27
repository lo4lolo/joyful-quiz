// 땅따먹기 팀전: 문제를 맞히면 깃발을 얻고, 우리 팀 땅 옆 칸에 깃발을 꽂아 땅을 넓힌다.
export const TEAMS = [
  { name: '청룡', emoji: '🐉' }, { name: '주작', emoji: '🐦' }, { name: '봉황', emoji: '🐤' }, { name: '해치', emoji: '🦁' },
];
const COLS = 13, ROWS = 9, MAX_FLAGS = 3, PROTECT_MS = 8000;

// 짝수 줄이 오른쪽으로 반 칸 밀린 육각 격자 (odd-r 아님: even-r)
export function neighbors(i) {
  const r = Math.floor(i / COLS), c = i % COLS, even = r % 2 === 0;
  const d = even ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]] : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]];
  return d.map(([dr, dc]) => [r + dr, c + dc]).filter(([rr, cc]) => rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS).map(([rr, cc]) => rr * COLS + cc);
}

function makeMap(nTeams) {
  const cells = Array.from({ length: COLS * ROWS }, (_, i) => ({ i, team: -1, v: 1, base: false, rock: false, by: '', t: 0 }));
  const mid = Math.floor(ROWS / 2);
  const bases = nTeams === 2 ? [mid * COLS + 0, mid * COLS + COLS - 1]
    : nTeams === 3 ? [0, COLS - 1, (ROWS - 1) * COLS + Math.floor(COLS / 2)]
    : [0, COLS - 1, (ROWS - 1) * COLS, ROWS * COLS - 1];
  bases.forEach((b, t) => { cells[b].team = t; cells[b].base = true; cells[b].v = 0; });
  // 대칭에 가깝게 보물(3점)과 바위(못 가는 칸)
  const center = mid * COLS + Math.floor(COLS / 2);
  cells[center].v = 5; cells[center].star = true;
  const near = new Set(bases.flatMap(b => [b, ...neighbors(b)]));
  let stars = 0, rocks = 0, guard = 0;
  while ((stars < 6 || rocks < 7) && guard++ < 500) {
    const i = Math.floor(Math.random() * cells.length), c = cells[i];
    if (near.has(i) || c.base || c.star || c.rock || i === center) continue;
    if (stars < 6) { c.v = 3; c.star = true; stars++; } else { c.rock = true; c.v = 0; rocks++; }
  }
  return cells;
}

function teamScores(room) {
  const n = room.settings.teams, out = TEAMS.slice(0, n).map((t, k) => ({ ...t, k, score: 0, cells: 0, members: 0 }));
  for (const c of room.m.cells) if (c.team >= 0 && !c.base) { out[c.team].score += c.v; out[c.team].cells++; }
  for (const p of room.players.values()) if (p.team != null && out[p.team]) out[p.team].members++;
  return out;
}

function smallestTeam(room) {
  const cnt = Array(room.settings.teams).fill(0);
  for (const p of room.players.values()) if (p.team != null && p.team < cnt.length) cnt[p.team]++;
  return cnt.indexOf(Math.min(...cnt));
}

export default {
  id: 'territory',
  name: '땅따먹기 팀전',
  selfPaced: true,
  settings: s => ({
    teams: [2, 3, 4].includes(+s.teams) ? +s.teams : 2,
    minutes: [3, 5, 7, 10, 15].includes(+s.minutes) ? +s.minutes : 7,
  }),
  start(room, api) {
    const n = room.settings.teams;
    room.m = { cells: makeMap(n), endsAt: Date.now() + room.settings.minutes * 60e3 + 3000, lastBoard: 0, cols: COLS, rows: ROWS };
    for (const p of room.players.values()) p.m = { flags: 0, claims: 0, streak: 0 };
    api.ensureTeams(n); // 대기실에서 나눈 모둠을 그대로 (개수가 다르면 다시 나눔)
    api.toAll('start', { endsAt: room.m.endsAt, cols: COLS, rows: ROWS, cells: room.m.cells, teams: teamScores(room) });
  },
  onJoin(room, p) { p.m = { flags: 0, claims: 0, streak: 0 }; if (room.state === 'play') p.team = smallestTeam(room); },
  canAsk: (room, p) => (p.m.flags || 0) < MAX_FLAGS && Date.now() < room.m.endsAt,
  onAnswer(room, p, res, api) {
    if (res.ok) {
      p.m.streak = (p.m.streak || 0) + 1;
      const bonus = p.m.streak % 3 === 0 ? 1 : 0;
      p.m.flags = Math.min(MAX_FLAGS, (p.m.flags || 0) + 1 + bonus);
      if (bonus) api.toPlayer(p.pid, 'bonus', { streak: p.m.streak });
    } else p.m.streak = 0;
    api.toPlayer(p.pid, 'flags', { flags: p.m.flags });
  },
  onStudent(room, p, type, data, api, ack) {
    if (type !== 'claim') return;
    const cells = room.m.cells, c = cells[data.i | 0];
    if (!c || c.base || c.rock || c.team === p.team) return ack({ error: '여기는 꽂을 수 없어요' });
    if (!neighbors(c.i).some(j => cells[j].team === p.team)) return ack({ error: '우리 팀 땅 바로 옆에만 꽂을 수 있어요' });
    const cost = c.team === -1 ? 1 : 2;
    if (c.team !== -1 && Date.now() - c.t < PROTECT_MS) return ack({ error: '방금 생긴 땅은 잠깐 보호 중이에요' });
    if ((p.m.flags || 0) < cost) return ack({ error: cost === 2 ? '상대 땅은 깃발 2개가 필요해요' : '깃발이 없어요. 문제를 풀어요!' });
    const prev = c.team;
    p.m.flags -= cost; p.m.claims++;
    c.team = p.team; c.by = p.name; c.t = Date.now();
    api.toAll('cell', { i: c.i, team: c.team, by: p.name, t: c.t, prev });
    if (prev >= 0) api.feed(`${TEAMS[p.team].emoji} ${p.name}이(가) ${TEAMS[prev].name} 땅을 차지했어요!`);
    else if (c.star) api.feed(`⭐ ${p.name}이(가) 보물 땅을 차지했어요!`);
    ack({ ok: true, flags: p.m.flags });
  },
  onTeacher(room, type, data, api, ack) {
    if (type === 'endnow') api.end();
    ack?.({ ok: true });
  },
  tick(room, api) {
    const now = Date.now();
    if (now >= room.m.endsAt) return api.end();
    if (now - room.m.lastBoard > 1000) { room.m.lastBoard = now; api.toAll('teams', { teams: teamScores(room), endsAt: room.m.endsAt }); }
  },
  ranking(room) {
    const ts = room.m.cells ? teamScores(room) : [];
    const order = [...ts].sort((a, b) => b.score - a.score);
    const list = [...room.players.values()].map(p => ({ pid: p.pid, name: p.name, score: (p.m.claims || 0) * 10 + p.stats.ok * 5,
      extra: { team: p.team, teamName: TEAMS[p.team]?.name, teamRank: order.findIndex(t => t.k === p.team) + 1, claims: p.m.claims || 0, correct: p.stats.ok, answered: p.stats.n } }));
    list.sort((a, b) => a.extra.teamRank - b.extra.teamRank || b.score - a.score);
    list.forEach((r, i) => { r.rank = i + 1; });
    return list;
  },
  snapshot(room, p) {
    return { endsAt: room.m.endsAt, cols: COLS, rows: ROWS, cells: room.m.cells, teams: teamScores(room), flags: p?.m?.flags ?? 0, team: p?.team ?? null };
  },
};
