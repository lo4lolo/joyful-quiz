// 다 함께 보스전: 반 전체가 한 팀. 각자 문제를 풀고 맞히면 보스를 공격한다. 보스 3마리를 차례로 물리치면 승리.
// 가끔 보스가 반격하면 "방어 미션"(12초 안에 반 전체가 N문제 맞히기). 성공 → 반사 공격, 실패 → 보스 체력 회복 (개인 벌칙 없음).
export const BOSSES = [
  { id: 'slime_king', name: '슬라임 왕', emoji: '👾', color: '#4FB8FF', mult: 1,
    hello: '말랑말랑~ 나를 이길 수 있을까?', attack: '끈적끈적 슬라임 폭탄!', bye: '으앙, 녹아 버렸어…' },
  { id: 'rock_golem', name: '바위 골렘', emoji: '🪨', color: '#A9A3C9', mult: 1.4,
    hello: '쿵! 쿵! 나는 단단하다!', attack: '와르르 바위 비!', bye: '와르르… 부서졌다…' },
  { id: 'cloud_dragon', name: '구름 용', emoji: '🐉', color: '#8C6CFF', mult: 1.8,
    hello: '번쩍! 하늘의 주인은 나다!', attack: '우르릉 번개 구름!', bye: '구름처럼 사라진다…' },
];
// 한 사람당 체력: 25명이 1분에 4문제·정답률 70%로 풀 때 약 5/10/15분에 세 마리를 모두 물리치도록 맞춘 값
export const PER_PLAYER = { short: 50, normal: 110, long: 180 };
export const RULE = {
  base: 10, critChance: 0.1, intermission: 4000, missionMs: 12000, missionGap: [60000, 80000],
  missionRatio: 0.4, heal: 0.08, burst: 0.06, flushMs: 300, boardMs: 1000, endDelay: 1600,
};
export const streakMult = s => (s >= 5 ? 2 : s >= 3 ? 1.5 : 1);

const online = room => [...room.players.values()].filter(p => p.online).length;
const gap = () => RULE.missionGap[0] + Math.random() * (RULE.missionGap[1] - RULE.missionGap[0]);
// 플레이어 상태 (늦게 들어온 학생, 다시 시작한 판에서도 항상 같은 모양)
function pm(p) {
  const m = p.m || (p.m = {});
  if (!Array.isArray(m.bd)) Object.assign(m, { damage: 0, streak: 0, best: 0, crits: 0, bd: [0, 0, 0], mission: 0 });
  return m;
}
const mine = p => { const s = pm(p); return { damage: s.damage, streak: s.streak, best: s.best, crits: s.crits, correct: p.stats.ok, answered: p.stats.n }; };
const bossView = m => {
  const B = BOSSES[m.bi];
  return { bi: m.bi, n: BOSSES.length, id: B.id, name: B.name, emoji: B.emoji, color: B.color, hp: Math.max(0, m.hp), max: m.max };
};
const missionView = (m, now = Date.now()) => m.mission ? { need: m.mission.need, got: m.mission.got, left: Math.max(0, m.mission.endsAt - now), text: BOSSES[m.bi].attack } : null;
function mvp(room, k = 5, bi = null) {
  return [...room.players.values()].map(p => ({ p, d: bi == null ? pm(p).damage : pm(p).bd[bi] || 0 })).filter(x => x.d > 0)
    .sort((a, b) => b.d - a.d).slice(0, k).map(({ p, d }) => ({ pid: p.pid, name: p.name, avatar: p.avatar, damage: d }));
}
function state(room, now = Date.now()) {
  const m = room.m;
  return { boss: bossView(m), phase: m.phase, breakLeft: m.phase === 'break' ? Math.max(0, m.breakUntil - now) : 0,
    timeLeft: Math.max(0, m.endsAt - now), mission: missionView(m, now), attackers: m.attackers.size, online: online(room),
    down: m.down, total: m.total, mvp: mvp(room), over: m.over ? { win: m.win } : null };
}

function spawn(room, api, bi) {
  const m = room.m, B = BOSSES[bi], now = Date.now();
  const n = Math.max(1, online(room));
  m.bi = bi; m.max = Math.round(n * PER_PLAYER[room.settings.length] * B.mult);
  m.hp = Math.max(1, m.max - m.charge); // 쉬는 시간에 맞힌 공격은 다음 보스에게 (충전)
  m.attackers = new Set(m.chargeBy); m.charge = 0; m.chargeBy = new Set();
  m.phase = 'fight'; m.mission = null; m.nextMission = now + gap(); m.spawnedAt = now;
  api.toAll('boss', { ...state(room, now), say: B.hello });
  api.feed(`${B.emoji} ${B.name} 등장! (체력 ${m.max.toLocaleString()})`);
}

function flush(room, api) {
  const m = room.m;
  m.lastFlush = Date.now();
  if (!m.hits.length) return;
  const hits = m.hits; m.hits = [];
  api.toAll('hits', { hits, hp: Math.max(0, m.hp), max: m.max, bi: m.bi, attackers: m.attackers.size, total: m.total });
}

function finish(room, api, win) {
  const m = room.m;
  if (m.over) return;
  m.over = true; m.win = win; m.phase = 'over'; m.mission = null;
  flush(room, api);
  const B = BOSSES[m.bi];
  api.toAll('result', { win, down: m.down, n: BOSSES.length, boss: bossView(m), total: m.total, mvp: mvp(room, 3),
    text: win ? '우리 반 승리! 보스를 모두 물리쳤어요!' : '보스가 도망갔어요! 다음엔 꼭!', say: win ? B.bye : '' });
  api.feed(win ? '🏆 우리 반이 보스 3마리를 모두 물리쳤어요!' : `⏰ 시간 끝! ${B.name}이(가) 도망갔어요.`);
  setTimeout(() => { if (room.m === m && room.state === 'play') room.api.end(); }, RULE.endDelay);
}

function checkDefeat(room, api, by) {
  const m = room.m;
  if (m.phase !== 'fight' || m.hp > 0) return;
  m.hp = 0; m.down++;
  const B = BOSSES[m.bi], last = m.bi === BOSSES.length - 1;
  if (m.mission) { m.mission = null; api.toAll('mission', { state: 'cancel' }); }
  if (last) return finish(room, api, true);
  flush(room, api);
  m.phase = 'break'; m.breakUntil = Date.now() + RULE.intermission;
  const N = BOSSES[m.bi + 1];
  api.toAll('defeat', { bi: m.bi, name: B.name, emoji: B.emoji, say: B.bye, by, top: mvp(room, 3, m.bi), down: m.down,
    next: { id: N.id, name: N.name, emoji: N.emoji, color: N.color }, breakLeft: RULE.intermission });
  api.feed(`🎉 ${B.name} 처치! 마지막 한 방: ${by}`);
}

function missionStart(room, api, now) {
  const m = room.m, n = Math.max(1, online(room));
  m.mission = { need: Math.max(1, Math.ceil(n * RULE.missionRatio)), got: 0, endsAt: now + RULE.missionMs, who: new Map() };
  api.toAll('mission', { state: 'start', ...missionView(m, now) });
  api.feed(`⚠️ ${BOSSES[m.bi].name}의 반격! 방어 미션: ${m.mission.need}문제 맞히기`);
}
function missionEnd(room, api, ok, now = Date.now(), by = '🛡️ 반사 공격') {
  const m = room.m, ms = m.mission;
  m.mission = null; m.nextMission = now + gap();
  if (ok) {
    // 반사 공격: 미션 때 맞힌 친구들이 나눠 가진다 (기여도에 들어감)
    const bonus = Math.max(1, Math.round(m.max * RULE.burst)), who = [...ms.who.keys()];
    const share = Math.floor(bonus / who.length), extra = bonus - share * who.length;
    who.forEach((pid, k) => {
      const p = room.players.get(pid); if (!p) return;
      const d = share + (k === 0 ? extra : 0), s = pm(p);
      s.damage += d; s.bd[m.bi] += d; s.mission++; p.score = s.damage;
      api.toPlayer(pid, 'mbonus', { dmg: d, ...mine(p) });
    });
    m.hp -= bonus; m.total += bonus;
    api.toAll('mission', { state: 'ok', bonus, hp: Math.max(0, m.hp), max: m.max, helpers: who.length });
    api.feed(`🛡️ 방어 성공! 반사 공격 -${bonus}`);
    checkDefeat(room, api, by);
  } else {
    const heal = Math.round(m.max * RULE.heal), before = m.hp;
    m.hp = Math.min(m.max, m.hp + heal);
    api.toAll('mission', { state: 'fail', heal: m.hp - before, hp: m.hp, max: m.max, got: ms.got, need: ms.need });
    api.feed(`💚 방어 실패… ${BOSSES[m.bi].name}이(가) 체력을 ${m.hp - before} 회복했어요`);
  }
}

export default {
  id: 'raid',
  name: '다 함께 보스전',
  selfPaced: true,
  settings: s => ({
    length: Object.hasOwn(PER_PLAYER, s.length) ? s.length : 'normal',
    minutes: [5, 10, 15, 20].includes(+s.minutes) ? +s.minutes : 15,
  }),
  start(room, api) {
    const now = Date.now();
    room.m = { bi: 0, hp: 1, max: 1, phase: 'fight', endsAt: now + room.settings.minutes * 60e3, hits: [], lastFlush: now, lastBoard: 0,
      attackers: new Set(), charge: 0, chargeBy: new Set(), mission: null, nextMission: 0, down: 0, total: 0, over: false, win: false };
    for (const p of room.players.values()) { p.m = {}; pm(p); }
    spawn(room, api, 0);
  },
  onJoin(room, p) { p.m = {}; pm(p); },
  canAsk: (room, p) => !!room.m?.max && !room.m.over && room.m.phase === 'fight' && Date.now() < room.m.endsAt,
  onAnswer(room, p, res, api) {
    const m = room.m;
    if (!m?.max || m.over) return;
    const s = pm(p);
    if (!res.ok) { s.streak = 0; api.toPlayer(p.pid, 'atk', { miss: true, ...mine(p) }); return; }
    s.streak++; s.best = Math.max(s.best, s.streak);
    const mult = streakMult(s.streak), crit = Math.random() < RULE.critChance;
    const dmg = Math.round(RULE.base * mult * (crit ? 2 : 1));
    s.damage += dmg; if (crit) s.crits++; p.score = s.damage; m.total += dmg;
    let charged = false;
    if (m.phase === 'fight') {
      m.hp -= dmg; s.bd[m.bi] += dmg; m.attackers.add(p.pid);
      m.hits.push({ pid: p.pid, name: p.name, dmg, crit, streak: s.streak });
    } else { // 보스 사이 쉬는 시간: 다음 보스에게 충전
      charged = true; m.charge += dmg; m.chargeBy.add(p.pid);
      if (m.bi + 1 < BOSSES.length) s.bd[m.bi + 1] += dmg;
    }
    api.toPlayer(p.pid, 'atk', { dmg, crit, mult, charged, ...mine(p) });
    if (crit && dmg >= 40) api.feed(`💥 ${p.name} ${s.streak}연속 크리티컬! -${dmg}`);
    if (m.phase === 'fight' && m.hp <= 0) return checkDefeat(room, api, p.name); // 처치하면 미션은 취소
    if (m.mission && m.phase === 'fight') {
      m.mission.got++; m.mission.who.set(p.pid, (m.mission.who.get(p.pid) || 0) + 1);
      if (m.mission.got >= m.mission.need) missionEnd(room, api, true, Date.now(), p.name);
      else api.toAll('mission', { state: 'progress', got: m.mission.got, need: m.mission.need });
    }
  },
  onTeacher(room, type, data, api, ack) {
    // 모든 조작은 셸(t:end)로 충분. 수업 중 문제가 생기면 'mission'으로 미션을 바로 시작할 수 있게 둔다.
    const m = room.m;
    if (type === 'mission' && m?.phase === 'fight' && !m.mission && !m.over) { missionStart(room, api, Date.now()); return ack?.({ ok: true }); }
    ack?.({ ok: false });
  },
  tick(room, api) {
    const m = room.m;
    if (!m?.max || m.over) return;
    const now = Date.now();
    if (now - m.lastFlush >= RULE.flushMs) flush(room, api);
    if (now >= m.endsAt) return finish(room, api, false);
    if (m.phase === 'break' && now >= m.breakUntil) spawn(room, api, m.bi + 1);
    else if (m.phase === 'fight') {
      if (m.mission && now >= m.mission.endsAt) missionEnd(room, api, false, now);
      else if (!m.mission && now >= m.nextMission && m.endsAt - now > RULE.missionMs + 3000) missionStart(room, api, now);
    }
    if (now - m.lastBoard >= RULE.boardMs) {
      m.lastBoard = now;
      api.toAll('board', { mvp: mvp(room), attackers: m.attackers.size, online: online(room), hp: Math.max(0, m.hp), max: m.max, bi: m.bi,
        timeLeft: Math.max(0, m.endsAt - now), phase: m.phase, total: m.total, mission: missionView(m, now) });
    }
  },
  ranking(room) {
    const m = room.m || {};
    const list = [...room.players.values()].map(p => {
      const s = pm(p);
      return { pid: p.pid, name: p.name, score: s.damage,
        extra: { correct: p.stats.ok, answered: p.stats.n, damage: s.damage, crits: s.crits, bestStreak: s.best,
          bossesHelped: s.bd.filter(d => d > 0).length, missions: s.mission, classWin: !!m.win, bossesDown: m.down || 0 } };
    }).sort((a, b) => b.score - a.score || b.extra.correct - a.extra.correct);
    list.forEach((r, i) => { r.rank = i && list[i - 1].score === r.score ? list[i - 1].rank : i + 1; });
    return list;
  },
  snapshot(room, p) {
    if (!room.m?.max) return null;
    return { ...state(room), me: p ? mine(p) : null };
  },
};
