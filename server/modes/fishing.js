// 낚시 대회: 각자 문제를 풀고, 맞히면 낚싯대를 던져(cast) 물고기를 낚는다. 감기(reel) 타이밍으로 무게 보너스.
// 점수 = 모은 무게(kg, 소수 한 자리). 연속 정답은 미끼 레벨(1~5)을 올려 귀한 물고기가 잘 나온다.
// 반 전체 이벤트: 🐟 물고기 떼(15초, 무게 ×2), ✨ 황금 잉어(가장 먼저 낚은 사람이 황금 잉어).

// 물고기 표 (id 는 public/assets/fish/<id>.png 그림과 같다). kg 범위는 감기 보너스·물고기 떼 전의 기본 무게.
export const FISH = [
  { id: 'minnow', name: '송사리', rarity: 'common', min: 0.3, max: 1.5 },
  { id: 'goldfish', name: '금붕어', rarity: 'common', min: 0.5, max: 2.2 },
  { id: 'mackerel', name: '고등어', rarity: 'common', min: 1.2, max: 3.8 },
  { id: 'carp', name: '붕어', rarity: 'common', min: 2, max: 6 },
  { id: 'clownfish', name: '흰동가리', rarity: 'rare', min: 1, max: 3.5 },
  { id: 'pufferfish', name: '복어', rarity: 'rare', min: 3, max: 8 },
  { id: 'squid', name: '오징어', rarity: 'rare', min: 4, max: 10 },
  { id: 'rainbow_trout', name: '무지개송어', rarity: 'rare', min: 5, max: 12 },
  { id: 'octopus2', name: '문어', rarity: 'epic', min: 10, max: 25 },
  { id: 'swordfish', name: '황새치', rarity: 'epic', min: 20, max: 45 },
  { id: 'whale_baby', name: '아기고래', rarity: 'legendary', min: 40, max: 80, w: 2 },
  { id: 'golden_koi', name: '황금 잉어', rarity: 'legendary', min: 30, max: 60, w: 1 },
  { id: 'boot', name: '낡은 장화', rarity: 'junk', min: 0.1, max: 0.6 },
  { id: 'can', name: '빈 깡통', rarity: 'junk', min: 0.1, max: 0.3 },
];
export const FISH_BY_ID = Object.fromEntries(FISH.map(f => [f.id, f]));
// 미끼 레벨 1 → 5 로 갈수록 귀한 등급이 잘 나온다 (사이 레벨은 직선으로 나눔). 잡동사니는 늘 조금.
export const RARITY_W = {
  common: [70, 30], rare: [20, 40], epic: [4, 20], legendary: [0.6, 5], junk: [5, 5],
};
export const QUALITY = { perfect: 1.5, good: 1.2, miss: 1 };
export const LURE_MAX = 5, LURE_STEP = 2; // 연속 2번 맞힐 때마다 미끼 +1
export const FRENZY_MS = 15000, KOI_MS = 20000, WARN_MS = 5000, FRENZY_X = 2;
const KOI_BONUS = { min: 40, max: 70 };

const rnd = (a, b) => a + Math.random() * (b - a);
const round1 = x => Math.round(x * 10) / 10;
const pickW = list => { const sum = list.reduce((s, x) => s + x[1], 0); let r = Math.random() * sum; return (list.find(x => (r -= x[1]) < 0) || list[0])[0]; };

export function rarityWeights(lure) {
  const k = (Math.max(1, Math.min(LURE_MAX, lure | 0)) - 1) / (LURE_MAX - 1);
  return Object.fromEntries(Object.entries(RARITY_W).map(([r, [a, b]]) => [r, a + (b - a) * k]));
}
// 무게는 범위 안에서 작은 쪽이 더 자주 (큰 놈이 나오면 더 신나게)
const weigh = f => Math.max(0.1, round1(f.min + (f.max - f.min) * Math.random() ** 1.5));
export function rollCatch(lure) {
  const rarity = pickW(Object.entries(rarityWeights(lure)));
  const pool = FISH.filter(f => f.rarity === rarity);
  const f = pickW(pool.map(x => [x, x.w || 1]));
  return { id: f.id, name: f.name, rarity: f.rarity, base: weigh(f) };
}

const JUNK_MSG = { boot: ['누가 장화를 버렸지? 👢', '한 짝만 낚였어요. 나머지 한 짝은 어디에?'], can: ['깡통 줍기 완료! 바다가 깨끗해졌어요 ♻️', '딸그락! 빈 깡통이에요'] };

function initP(p) {
  p.m = { kg: 0, count: 0, lure: 1, xp: 0, streak: 0, canCast: false, castFrenzy: 0, castKoi: 0, hook: null, dex: {}, best: null };
}
const P = p => { if (!p.m || p.m.kg == null) initP(p); return p.m; };

// ---------- 이벤트 ----------
const evPublic = (ev, now = Date.now()) => ev ? { id: ev.id, kind: ev.kind, phase: ev.phase, startsIn: Math.max(0, ev.startsAt - now), leftMs: Math.max(0, ev.endsAt - now), dur: ev.endsAt - ev.startsAt } : null;
const evOn = (room, kind, now = Date.now()) => { const ev = room.m.ev; return !!ev && ev.kind === kind && ev.phase === 'on' && now < ev.endsAt; };

function scheduleEvent(room, kind, startsAt, api) {
  const dur = kind === 'koi' ? KOI_MS : FRENZY_MS;
  room.m.ev = { id: ++room.m.evSeq, kind, phase: 'warn', startsAt, endsAt: startsAt + dur, winner: null };
  if (kind === 'koi') room.m.koiCount++;
  room.m.lastKinds.push(kind);
  api.toAll('event', evPublic(room.m.ev));
}
function endEvent(room, api, now) {
  const ev = room.m.ev; if (!ev) return;
  room.m.ev = null;
  if (ev.kind === 'koi') {
    room.m.lastKoi = { id: ev.id, winner: ev.winner, endsAt: ev.endsAt };
    if (!ev.winner) api.feed('✨ 황금 잉어가 도망갔어요… 다음에 또 와요!');
  } else api.feed('🐟 물고기 떼가 지나갔어요.');
  api.toAll('event', { id: ev.id, kind: null, ended: ev.kind, winner: ev.winner || null, escaped: ev.kind === 'koi' && !ev.winner });
  room.m.nextEv = room.settings.frenzy ? now + rnd(60e3, 85e3) : Infinity; // 시작부터 다음 시작까지 대략 75~100초
}
function pickKind(room) {
  const k = room.m.lastKinds;
  if (k.length >= 2 && k.slice(-2).every(x => x === 'frenzy')) return 'koi'; // 물고기 떼만 계속 나오지 않게
  if (k[k.length - 1] === 'koi') return 'frenzy';
  return Math.random() < 0.3 ? 'koi' : 'frenzy';
}

// ---------- 낚기 ----------
function cast(room, p, api) {
  const m = P(p), now = Date.now(), ev = room.m.ev, lf = room.m.lastFrenzy, lk = room.m.lastKoi;
  const c = rollCatch(m.lure);
  // 물고기 떼: 지금 진행 중이거나, 진행 중에 맞히고 곧바로 던진 경우 (감기 시간 때문에 억울하지 않게)
  c.frenzy = evOn(room, 'frenzy', now) || (!!m.castFrenzy && (ev?.id === m.castFrenzy || (lf?.id === m.castFrenzy && now < lf.endsAt + 8000)));
  // 황금 잉어: 이벤트 중(또는 이벤트 중에 맞히고 곧바로 던짐) 가장 먼저 낚은 사람
  const koiNow = ev && ev.kind === 'koi' && ev.phase === 'on' && !ev.winner && (now < ev.endsAt || m.castKoi === ev.id);
  const koiLate = !koiNow && lk && !lk.winner && m.castKoi === lk.id && now < lk.endsAt + 8000;
  if (koiNow || koiLate) {
    const f = FISH_BY_ID.golden_koi;
    Object.assign(c, { id: f.id, name: f.name, rarity: f.rarity, base: round1(rnd(KOI_BONUS.min, KOI_BONUS.max)), koi: true, frenzy: false });
    if (koiNow) { ev.winner = p.name; endEvent(room, api, now); } else lk.winner = p.name;
  }
  m.canCast = false; m.castFrenzy = 0; m.castKoi = 0;
  m.hook = { ...c, t: now };
  return m.hook;
}
const hookPublic = h => h && { id: h.id, name: h.name, rarity: h.rarity, base: h.base, frenzy: !!h.frenzy, koi: !!h.koi };

function land(room, p, quality, api) {
  const m = P(p), h = m.hook; if (!h) return null;
  m.hook = null;
  const q = Object.hasOwn(QUALITY, quality) ? quality : 'miss';
  const kg = Math.max(0.1, round1(h.base * QUALITY[q] * (h.frenzy ? FRENZY_X : 1)));
  m.kg = round1(m.kg + kg); m.count++;
  p.score = m.kg;
  const d = m.dex[h.id] || (m.dex[h.id] = { n: 0, best: 0 });
  const isNew = d.n === 0;
  d.n++; d.best = Math.max(d.best, kg);
  if (h.rarity !== 'junk' && (!m.best || kg > m.best.kg)) m.best = { id: h.id, name: h.name, kg };
  const res = { id: h.id, name: h.name, rarity: h.rarity, kg, base: h.base, quality: q, mult: QUALITY[q], frenzy: !!h.frenzy, koi: !!h.koi, isNew, total: m.kg, count: m.count };
  if (h.rarity === 'junk') res.msg = JUNK_MSG[h.id]?.[Math.random() * 2 | 0] || '이건 물고기가 아니에요!';
  room.m.dirty = true;
  // 오늘의 대어 (잡동사니 빼고 무거운 순 6마리)
  if (h.rarity !== 'junk') {
    const big = room.m.big;
    if (big.length < 6 || kg > big[big.length - 1].kg) {
      big.push({ pid: p.pid, name: p.name, id: h.id, fish: h.name, rarity: h.rarity, kg, t: Date.now() });
      big.sort((a, b) => b.kg - a.kg); big.length = Math.min(big.length, 6);
    }
  }
  room.m.total = round1(room.m.total + kg); room.m.catches++;
  api.toTeacher('catch', { ...res, pid: p.pid, player: p.name });
  if (h.koi) {
    api.feed(`✨ ${p.name} 황금 잉어 ${kg}kg! 황금 잉어의 주인이 되었어요!`);
    api.toAll('koi', { pid: p.pid, name: p.name, kg });
  } else if (h.rarity === 'legendary' || h.rarity === 'epic' || kg >= 20) {
    api.feed(`${EMOJI[h.id] || '🐟'} ${p.name} ${h.name} ${kg}kg!`);
    if (h.rarity === 'legendary') api.toStudents('big', { pid: p.pid, name: p.name, fish: h.name, id: h.id, kg });
  } else if (h.rarity === 'junk') api.feed(`${EMOJI[h.id]} ${p.name} ${h.name}을(를) 낚았어요 ㅋㅋ`);
  const goal = room.settings.goal;
  if (goal && m.kg >= goal && !room.m.ending) {
    room.m.ending = true;
    api.feed(`🏆 ${p.name} 목표 ${goal}kg 달성!`);
    api.toAll('goal', { pid: p.pid, name: p.name, goal });
    setTimeout(() => { if (room.state === 'play') api.end(); }, 2500);
  }
  return res;
}
const EMOJI = { minnow: '🐟', goldfish: '🐠', mackerel: '🐟', carp: '🐟', clownfish: '🐠', pufferfish: '🐡', squid: '🦑', rainbow_trout: '🐟', octopus2: '🐙', swordfish: '🦈', whale_baby: '🐋', golden_koi: '🐠', boot: '👢', can: '🥫' };

// 던지지 않았거나 감지 않은 물고기는 그냥 낚은 것으로 (아이들은 늘 물고기를 받는다)
function settle(room, p, api) {
  const m = P(p);
  if (m.canCast && !m.hook) cast(room, p, api);
  if (m.hook) return land(room, p, 'miss', api);
  return null;
}

function standings(room) {
  return [...room.players.values()].map(p => { const m = P(p); return { pid: p.pid, name: p.name, avatar: p.avatar, kg: m.kg, count: m.count, lure: m.lure, best: m.best, online: p.online, n: p.stats.n, ok: p.stats.ok }; })
    .sort((a, b) => b.kg - a.kg || b.count - a.count);
}
function board(room) {
  const s = standings(room), now = Date.now();
  return { top: s.slice(0, 15), all: s.map(x => [x.pid, x.kg, x.count]), big: room.m.big, endsIn: Math.max(0, room.m.endsAt - now),
    total: room.m.total, catches: room.m.catches, ev: evPublic(room.m.ev, now), goal: room.settings.goal };
}

export default {
  id: 'fishing',
  name: '낚시 대회',
  selfPaced: true,
  settings: s => ({
    minutes: [5, 7, 10, 15].includes(+s.minutes) ? +s.minutes : 7,
    goal: [0, 100, 300, 1000].includes(+s.goal) ? +s.goal : 0,
    frenzy: s.frenzy !== false && s.frenzy !== 'false',
  }),
  start(room, api) {
    const now = Date.now();
    room.m = { endsAt: now + room.settings.minutes * 60e3 + 3000, lastBoard: 0, dirty: true, big: [], total: 0, catches: 0,
      ev: null, evSeq: 0, nextEv: room.settings.frenzy ? now + rnd(60e3, 80e3) : Infinity, lastKinds: [], koiCount: 0, lastKoi: null, lastFrenzy: null, ending: false };
    for (const p of room.players.values()) initP(p);
    api.toAll('start', { endsIn: room.m.endsAt - now, goal: room.settings.goal, frenzy: room.settings.frenzy });
  },
  onJoin(room, p) { initP(p); if (room.m) room.m.dirty = true; },
  canAsk(room, p) {
    if (room.m.ending || Date.now() >= room.m.endsAt) return false;
    settle(room, p, room.api); // 낚싯대를 안 던지고 다음 문제로 가면 자동으로 낚기
    return true;
  },
  onAnswer(room, p, res, api) {
    const m = P(p);
    if (res.ok) {
      m.streak++; m.xp++;
      let up = false;
      if (m.lure < LURE_MAX && m.xp >= LURE_STEP) { m.lure++; m.xp = 0; up = true; }
      if (m.lure >= LURE_MAX) m.xp = 0;
      m.canCast = true;
      if (evOn(room, 'frenzy')) m.castFrenzy = room.m.ev.id;
      if (evOn(room, 'koi') && !room.m.ev.winner) m.castKoi = room.m.ev.id;
      api.toPlayer(p.pid, 'lure', { lure: m.lure, xp: m.xp, streak: m.streak, up, canCast: true });
    } else {
      const down = m.lure > 1;
      m.streak = 0; m.xp = 0; m.lure = Math.max(1, m.lure - 1);
      api.toPlayer(p.pid, 'lure', { lure: m.lure, xp: 0, streak: 0, down, tangled: true });
    }
  },
  onStudent(room, p, type, data, api, ack) {
    const m = P(p);
    if (type === 'cast') {
      if (m.hook) return ack({ ok: true, again: true, catch: hookPublic(m.hook), lure: m.lure }); // 응답을 못 받고 다시 보낸 경우: 같은 물고기
      if (!m.canCast) return ack({ error: '먼저 문제를 맞혀요!' });
      if (Date.now() >= room.m.endsAt) return ack({ error: '시간이 끝났어요' });
      const h = cast(room, p, api);
      return ack({ ok: true, catch: hookPublic(h), lure: m.lure });
    }
    if (type === 'reel') {
      if (!m.hook) return ack({ error: '감을 물고기가 없어요' });
      const res = land(room, p, String(data.quality || ''), api);
      return ack({ ok: true, res, lure: m.lure, xp: m.xp, dex: m.dex });
    }
    if (type === 'state') return ack({ ok: true, ...this.snapshot(room, p) });
    ack?.({ error: '?' });
  },
  onTeacher(room, type, data, api, ack) {
    if (type === 'endnow') api.end();
    else if (type === 'event') { // 선생님이 직접 이벤트 부르기
      const kind = data.kind === 'koi' ? 'koi' : 'frenzy', now = Date.now();
      if (room.m.ev) return ack?.({ error: '이미 이벤트가 진행 중이에요' });
      if (now + WARN_MS + 3000 > room.m.endsAt) return ack?.({ error: '남은 시간이 너무 짧아요' });
      scheduleEvent(room, kind, now + WARN_MS, api);
      return ack?.({ ok: true, ev: evPublic(room.m.ev) });
    }
    ack?.({ ok: true });
  },
  tick(room, api) {
    const now = Date.now(), M = room.m;
    if (now >= M.endsAt) {
      for (const p of room.players.values()) settle(room, p, api);
      return api.end();
    }
    // 이벤트 진행
    if (M.ev) {
      if (M.ev.phase === 'warn' && now >= M.ev.startsAt) {
        M.ev.phase = 'on'; api.toAll('event', evPublic(M.ev, now));
        api.feed(M.ev.kind === 'koi' ? '✨ 황금 잉어 출현! 가장 먼저 낚는 사람이 주인!' : '🐟 물고기 떼가 왔어요! 15초 동안 무게 ×2');
        if (M.ev.kind === 'frenzy') M.lastFrenzy = { id: M.ev.id, endsAt: M.ev.endsAt };
      } else if (M.ev.phase === 'on' && now >= M.ev.endsAt) endEvent(room, api, now);
    } else if (now >= M.nextEv - WARN_MS) {
      const kind = pickKind(room), dur = kind === 'koi' ? KOI_MS : FRENZY_MS;
      if (M.nextEv + dur + 5000 < M.endsAt) scheduleEvent(room, kind, Math.max(now + 1000, M.nextEv), api);
      else M.nextEv = Infinity; // 끝나기 직전에는 이벤트 없음
    }
    if (now - M.lastBoard > (M.dirty ? 1000 : 3000)) { M.lastBoard = now; M.dirty = false; api.toAll('board', board(room)); }
  },
  ranking(room) {
    const list = standings(room).map(s => ({ pid: s.pid, name: s.name, score: s.kg,
      extra: { correct: s.ok, answered: s.n, kg: s.kg, count: s.count, biggest: s.best ? `${s.best.name} ${s.best.kg}kg` : '' } }));
    list.forEach((r, i) => { r.rank = i && list[i - 1].score === r.score ? list[i - 1].rank : i + 1; });
    return list;
  },
  snapshot(room, p) {
    const b = board(room);
    if (!p) return { ...b, frenzy: room.settings.frenzy };
    const m = P(p);
    return { ...b, frenzy: room.settings.frenzy, kg: m.kg, count: m.count, lure: m.lure, xp: m.xp, streak: m.streak,
      canCast: !!m.canCast, hook: hookPublic(m.hook), dex: m.dex, best: m.best };
  },
};
