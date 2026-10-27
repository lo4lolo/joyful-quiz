// 퀴즈 부자: 맞히면 돈을 벌고, 상점에서 업그레이드·아이템을 사서 더 많이 번다. (서버가 돈의 주인)
// 값 표는 docs/modes/shop.md 와 같게 유지한다. 10분 · 정답 약 60개면 업그레이드 6~8단계쯤 닿도록 맞춤.
export const TEAMS = [
  { name: '청룡', emoji: '🐉' }, { name: '주작', emoji: '🐦' }, { name: '봉황', emoji: '🐤' }, { name: '해치', emoji: '🦁' },
];
// v[레벨] = 효과, p[레벨] = 그 레벨에서 다음 레벨로 올리는 값 (p.length = v.length - 1)
export const TRACKS = {
  perQ: { name: '문제당 돈', v: [10, 50, 100, 250, 500, 1000, 2000, 4000, 8000, 15000], p: [30, 150, 500, 1500, 5000, 20000, 70000, 250000, 800000] },
  streak: { name: '연속 보너스', v: [0, 10, 25, 50, 100, 200, 400, 800, 1500, 3000], p: [50, 200, 700, 2500, 8000, 30000, 100000, 350000, 1000000] },
  mult: { name: '배수', v: [1, 1.5, 2, 3, 4, 5, 6, 8], p: [100, 500, 2000, 8000, 35000, 150000, 500000] },
  ins: { name: '보험', v: [0, 25, 50, 75, 100], p: [100, 400, 1500, 5000] },
};
export const STREAK_CAP = 10; // 연속 보너스는 10연속까지만 커진다
// 아이템 값 = 한 번 맞힐 때 버는 돈(base) × k (최소 min). 팀 응원은 팀전에서만.
export const ITEMS = {
  double: { name: '2배 타임', k: 1.5, min: 20 },
  shield: { name: '방패', k: 2, min: 30 },
  gift: { name: '깜짝 선물', k: 1, min: 10 },
  cheer: { name: '팀 응원', k: 3, min: 30 },
};
export const DOUBLE_MS = 20000, CHEER_COOLDOWN = 30000, CHEER_SHARE = 0.6;
// 받침에 맞는 조사: josa('박나무','이','가') → '박나무가'
export function josa(w, a, b) {
  const s = String(w ?? ''), c = s.charCodeAt(s.length - 1);
  let jong = null;
  if (c >= 0xAC00 && c <= 0xD7A3) jong = (c - 0xAC00) % 28 !== 0;
  else if (/[0-9]$/.test(s)) jong = '013678'.includes(s.slice(-1));
  else if (s.endsWith('%')) jong = false;
  return s + (jong === null ? `${a}(${b})` : jong ? a : b);
}
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

const fresh = () => ({ money: 0, earned: 0, spent: 0, lv: { perQ: 0, streak: 0, mult: 0, ins: 0 }, streak: 0, best: 0, shield: false,
  doubleUntil: 0, giftOk: false, cheerAt: 0, buys: 0, marks: {} });
const M = p => (p.m && p.m.lv ? p.m : (p.m = fresh()));
const val = (k, p) => TRACKS[k].v[M(p).lv[k]];
// 한 번 맞힐 때 버는 돈 (streak = 이번 정답을 넣은 연속 수)
export const earnFor = (p, streak, doubled) => Math.round((val('perQ', p) * val('mult', p) + val('streak', p) * Math.min(streak, STREAK_CAP)) * (doubled ? 2 : 1));
const base = p => Math.round(val('perQ', p) * val('mult', p) + val('streak', p) * 3);
export const itemPrice = (p, id) => Math.max(ITEMS[id].min, Math.round(base(p) * ITEMS[id].k));
const upgrades = p => Object.values(M(p).lv).reduce((s, n) => s + n, 0);
const mates = (room, p) => [...room.players.values()].filter(o => o !== p && o.team != null && o.team === p.team);

function state(room, p, now = Date.now()) {
  const m = M(p);
  const dbl = Math.max(0, m.doubleUntil - now);
  return {
    money: m.money, earned: m.earned, lv: { ...m.lv }, streak: m.streak, best: m.best, shield: m.shield,
    doubleLeft: dbl, giftOk: m.giftOk, cheerLeft: Math.max(0, m.cheerAt + CHEER_COOLDOWN - now),
    next: earnFor(p, m.streak + 1, dbl > 0), team: p.team ?? null, each: Math.max(10, Math.round(base(p) * CHEER_SHARE)),
    pp: Object.fromEntries(Object.keys(ITEMS).map(k => [k, itemPrice(p, k)])), now,
  };
}
const sendMe = (room, p, api) => api.toPlayer(p.pid, 'me', state(room, p));

function teamTotals(room) {
  const n = room.m.nTeams || 0;
  const out = TEAMS.slice(0, n).map((t, k) => ({ k, name: t.name, emoji: t.emoji, money: 0, members: 0 }));
  for (const p of room.players.values()) if (p.team != null && out[p.team]) { out[p.team].money += M(p).money; out[p.team].members++; }
  return out;
}
function list(room) {
  return [...room.players.values()].map(p => {
    const m = M(p);
    return { pid: p.pid, name: p.name, money: m.money, earned: m.earned, team: p.team ?? null, mult: val('mult', p), streak: m.streak, lv: upgrades(p),
      n: p.stats.n, ok: p.stats.ok, online: !!p.online };
  }).sort((a, b) => b.money - a.money || b.earned - a.earned);
}
function smallestTeam(room) {
  const cnt = Array(room.m.nTeams).fill(0);
  for (const p of room.players.values()) if (p.team != null && p.team < cnt.length) cnt[p.team]++;
  return cnt.indexOf(Math.min(...cnt));
}

function setMoney(p, v) { M(p).money = Math.max(0, Math.round(v)); p.score = M(p).money; }
// 돈 이정표 소식 + 목표 확인
function moneyChanged(room, p, api) {
  const m = M(p);
  for (const [t, label] of [[100000, '10만'], [1000000, '100만'], [10000000, '1000만']]) {
    if (m.money >= t && !m.marks[t]) { m.marks[t] = 1; api.feed(`💰 ${josa(p.name, '이', '가')} ${label}원을 모았어요!`); }
  }
  if (!room.m.first && m.money >= 10000) { room.m.first = 1; api.feed(`🥇 ${josa(p.name, '이', '가')} 우리 반에서 처음으로 1만원을 넘었어요!`); }
  const goal = room.settings.goal;
  if (!goal || room.m.goalAt) return;
  if (room.m.nTeams) {
    const t = teamTotals(room).find(x => x.money >= goal);
    if (t) reach(room, api, `${t.emoji} ${t.name}`, t.k);
  } else if (m.money >= goal) reach(room, api, p.name, null, p.pid);
}
function reach(room, api, who, team, pid = null) {
  room.m.goalAt = Date.now();
  api.feed(`🏁 ${josa(who, '이', '가')} 목표 금액을 모았어요!`);
  api.toAll('goal', { who, team, pid });
}

// 학생·교사 모두에게 같은 게임 정보 (상점 표 포함: 화면은 이 표로만 그린다)
function info(room) {
  const tracks = Object.entries(TRACKS).filter(([k]) => k !== 'ins' || room.settings.penalty).map(([id, t]) => ({ id, name: t.name, v: t.v, p: t.p }));
  const items = Object.entries(ITEMS).filter(([k]) => k !== 'cheer' || room.m.nTeams).map(([id, t]) => ({ id, name: t.name }));
  return { left: room.m.endsAt - Date.now(), goal: room.settings.goal, penalty: room.settings.penalty, streakCap: STREAK_CAP, doubleMs: DOUBLE_MS,
    teams: TEAMS.slice(0, room.m.nTeams).map((t, k) => ({ k, ...t })), shop: { tracks, items } };
}
function board(room, api) {
  const now = Date.now(), all = list(room), teams = teamTotals(room);
  const total = all.reduce((s, x) => s + x.money, 0), left = room.m.endsAt - now;
  api.toTeacher('tboard', { list: all, teams, total, left, goal: room.settings.goal });
  api.toStudents('board', { top: all.slice(0, 5).map(({ pid, name, money, team }) => ({ pid, name, money, team })), order: all.map(x => x.pid), teams, total, left });
}

export default {
  id: 'shop',
  name: '퀴즈 부자',
  selfPaced: true,
  settings: s => ({
    minutes: [5, 7, 10, 15].includes(+s.minutes) ? +s.minutes : 10,
    goal: [0, 10000, 100000, 1000000].includes(+s.goal) ? +s.goal : 0,
    teams: [0, 2, 3, 4].includes(+s.teams) ? +s.teams : 0,
    penalty: s.penalty === true || s.penalty === 'true',
  }),
  start(room, api) {
    const ps = [...room.players.values()];
    const nTeams = room.settings.teams ? Math.max(2, Math.min(room.settings.teams, ps.length)) : 0;
    room.m = { endsAt: Date.now() + room.settings.minutes * 60e3 + 3000, lastBoard: 0, nTeams, goalAt: 0, first: 0 };
    for (const p of ps) { p.m = fresh(); p.score = 0; }
    if (nTeams) api.ensureTeams(nTeams); // 대기실에서 나눈 모둠을 그대로 (개수가 다르면 다시 나눔)
    else api.sendRoom();
    api.toAll('start', info(room));
    for (const p of ps) sendMe(room, p, api);
    board(room, api);
  },
  onJoin(room, p, api) {
    p.m = fresh(); p.score = 0;
    if (room.state === 'play' && room.m.nTeams) p.team = smallestTeam(room);
  },
  canAsk: (room, p) => Date.now() < room.m.endsAt && !room.m.goalAt,
  onAnswer(room, p, res, api) {
    const m = M(p), now = Date.now();
    if (res.ok) {
      m.streak++; m.best = Math.max(m.best, m.streak);
      const doubled = m.doubleUntil > now;
      const amount = earnFor(p, m.streak, doubled);
      const bonus = val('streak', p) * Math.min(m.streak, STREAK_CAP) * (doubled ? 2 : 1);
      setMoney(p, m.money + amount); m.earned += amount; m.giftOk = true;
      api.toPlayer(p.pid, 'earn', { ok: true, amount, bonus, doubled, streak: m.streak, money: m.money });
      if (m.streak >= 5 && m.streak % 5 === 0) api.feed(`🔥 ${p.name} ${m.streak}연속 정답!`);
      moneyChanged(room, p, api);
    } else if (m.shield) {
      m.shield = false;
      api.toPlayer(p.pid, 'earn', { ok: false, shielded: true, streak: m.streak, money: m.money });
    } else {
      const lostStreak = m.streak; m.streak = 0;
      let loss = 0, blocked = 0;
      if (room.settings.penalty && res.given !== '') { // 시간 초과(상점 구경 중 등)는 돈을 잃지 않는다
        const full = val('perQ', p);
        loss = Math.min(m.money, Math.round(full * (1 - val('ins', p) / 100)));
        blocked = full - Math.round(full * (1 - val('ins', p) / 100));
        setMoney(p, m.money - loss);
      }
      api.toPlayer(p.pid, 'earn', { ok: false, loss, blocked, lostStreak, streak: 0, money: m.money });
    }
    sendMe(room, p, api);
  },
  onStudent(room, p, type, data, api, ack) {
    const m = M(p), now = Date.now();
    if (type === 'state') return ack(state(room, p, now));
    if (now >= room.m.endsAt || room.m.goalAt) return ack({ error: '게임이 끝났어요' });
    if (type === 'buy') {
      const k = data.item;
      if (!has(TRACKS, k)) return ack({ error: '그런 업그레이드는 없어요' });
      if (k === 'ins' && !room.settings.penalty) return ack({ error: '이번 게임은 틀려도 돈을 잃지 않아서 보험이 필요 없어요' });
      const T = TRACKS[k], lv = m.lv[k];
      if (lv >= T.p.length) return ack({ error: '벌써 최고 단계예요' });
      if (data.level != null && (data.level | 0) !== lv + 1) return ack({ error: '이미 샀어요', state: state(room, p, now) }); // 두 번 누름
      const price = T.p[lv];
      if (m.money < price) return ack({ error: `돈이 ${(price - m.money).toLocaleString()}원 모자라요` });
      setMoney(p, m.money - price); m.spent += price; m.lv[k] = lv + 1; m.buys++;
      const level = lv + 1, v = T.v[level];
      const what = k === 'mult' ? `×${v} 배수` : k === 'perQ' ? `문제당 ${v.toLocaleString()}원` : k === 'streak' ? `연속 보너스 +${v.toLocaleString()}원` : `보험 ${v}%`;
      if (k === 'mult' || level >= 3) api.feed(`🛒 ${josa(p.name, '이', '가')} ${josa(what, '을', '를')} 샀어요!`);
      api.toTeacher('buy', { pid: p.pid, item: k, level });
      ack({ ok: true, item: k, level, price, state: state(room, p, now) });
      return;
    }
    if (type === 'use') {
      const k = data.item;
      if (!has(ITEMS, k)) return ack({ error: '그런 아이템은 없어요' });
      if (k === 'cheer' && !room.m.nTeams) return ack({ error: '팀 응원은 팀전에서만 쓸 수 있어요' });
      if (k === 'double' && m.doubleUntil > now) return ack({ error: '이미 2배 타임이에요' });
      if (k === 'shield' && m.shield) return ack({ error: '방패는 하나만 가질 수 있어요' });
      if (k === 'gift' && !m.giftOk) return ack({ error: '선물은 한 문제 맞힐 때마다 하나씩 살 수 있어요' });
      if (k === 'cheer' && now - m.cheerAt < CHEER_COOLDOWN) return ack({ error: `팀 응원은 ${Math.ceil((m.cheerAt + CHEER_COOLDOWN - now) / 1000)}초 뒤에 다시 쓸 수 있어요` });
      const team = k === 'cheer' ? mates(room, p) : [];
      if (k === 'cheer' && !team.length) return ack({ error: '우리 팀에 다른 친구가 없어요' });
      const price = itemPrice(p, k);
      if (m.money < price) return ack({ error: `돈이 ${(price - m.money).toLocaleString()}원 모자라요` });
      const b = base(p);
      setMoney(p, m.money - price); m.spent += price; m.buys++;
      const out = { ok: true, item: k, price };
      if (k === 'double') { m.doubleUntil = now + DOUBLE_MS; out.ms = DOUBLE_MS; }
      if (k === 'shield') m.shield = true;
      if (k === 'gift') {
        m.giftOk = false;
        const x = 0.5 + Math.random() * 1.5, gain = Math.max(1, Math.round(b * x));
        setMoney(p, m.money + gain); m.earned += gain; out.gain = gain; out.x = Math.round(x * 100) / 100;
        if (x >= 1.8) api.feed(`🎁 ${p.name}의 깜짝 선물 대박! +${gain.toLocaleString()}원`);
      }
      if (k === 'cheer') {
        m.cheerAt = now;
        const each = Math.max(10, Math.round(b * CHEER_SHARE));
        for (const o of team) {
          setMoney(o, M(o).money + each); M(o).earned += each;
          api.toPlayer(o.pid, 'cheer', { by: p.name, amount: each, money: M(o).money });
          sendMe(room, o, api);
          moneyChanged(room, o, api);
        }
        out.each = each; out.mates = team.length;
        api.feed(`🤝 ${josa(p.name, '이', '가')} ${TEAMS[p.team].name} 친구 ${team.length}명을 응원했어요! (각 +${each.toLocaleString()}원)`);
      }
      api.toTeacher('buy', { pid: p.pid, item: k });
      moneyChanged(room, p, api);
      out.state = state(room, p, now);
      ack(out);
      return;
    }
    ack({ error: '알 수 없는 요청' });
  },
  onTeacher(room, type, data, api, ack) {
    if (type === 'endnow') api.end();
    ack?.({ ok: true });
  },
  tick(room, api) {
    const now = Date.now();
    if (now >= room.m.endsAt || (room.m.goalAt && now - room.m.goalAt > 1800)) return api.end();
    if (now - room.m.lastBoard > 1000) { room.m.lastBoard = now; board(room, api); }
  },
  ranking(room) {
    const nT = room.m?.nTeams || 0;
    const teams = nT ? teamTotals(room) : [];
    const order = [...teams].sort((a, b) => b.money - a.money);
    const tRank = k => { const t = teams[k]; return t ? order.findIndex(x => x.money === t.money) + 1 : 0; };
    const rows = [...room.players.values()].map(p => {
      const m = M(p);
      return { pid: p.pid, name: p.name, score: m.money, extra: { correct: p.stats.ok, answered: p.stats.n, money: m.money, earned: m.earned, upgrades: upgrades(p),
        best: m.best, ...(nT ? { team: p.team, teamName: TEAMS[p.team]?.name, teamRank: tRank(p.team), teamMoney: teams[p.team]?.money ?? 0 } : {}) } };
    });
    rows.sort((a, b) => (nT ? (a.extra.teamRank || 9) - (b.extra.teamRank || 9) : 0) || b.score - a.score || b.extra.earned - a.extra.earned);
    if (nT) rows.forEach((r, i) => { r.rank = i + 1; });
    else rows.forEach((r, i) => { r.rank = i && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1; });
    return rows;
  },
  snapshot(room, p) {
    const base = { ...info(room), list: p ? undefined : list(room), teamsNow: teamTotals(room), total: list(room).reduce((s, x) => s + x.money, 0), goalAt: room.m.goalAt || 0 };
    if (p) { base.me = state(room, p); const all = list(room); base.top = all.slice(0, 5).map(({ pid, name, money, team }) => ({ pid, name, money, team })); base.order = all.map(x => x.pid); }
    return base;
  },
};
