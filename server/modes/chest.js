// 보물 상자: 각자 문제를 풀고, 맞히면 상자 3개 중 하나를 연다. 골드·두 배·뺏기·바꾸기 등 깜짝 결과.
const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function roll(p, room) {
  const g = p.score, friendly = !room.settings.steal;
  const table = [
    ['gold', 34], ['gold+', 14], ['big', 4], ['x2', 7], ['x3', 1.5], ['nothing', 6],
    ['lose', friendly ? 0 : 6], ['steal', friendly ? 0 : 10], ['swap', friendly ? 0 : 3], ['gift', friendly ? 6 : 0], ['bonusq', 5],
  ].filter(([k, w]) => w > 0 && !(g === 0 && ['lose', 'x2', 'x3', 'swap'].includes(k)));
  const sum = table.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * sum;
  let kind = table.find(([, w]) => (r -= w) < 0)?.[0] || 'gold';
  if (['steal', 'swap'].includes(kind) && !others(room, p).length) kind = 'gold';
  const res = { kind };
  if (kind === 'gold') res.amount = R(1, 5) * 10;
  if (kind === 'gold+') res.amount = R(6, 9) * 10;
  if (kind === 'big') res.amount = R(12, 20) * 10;
  if (kind === 'lose') res.pct = Math.random() < 0.7 ? 25 : 50;
  if (kind === 'steal') res.pct = [10, 15, 20, 25][R(0, 3)];
  if (kind === 'gift') res.amount = R(3, 6) * 10; // 착한 모드: 친구와 나눠 갖기 (둘 다 받음)
  return res;
}
const others = (room, p) => [...room.players.values()].filter(o => o.pid !== p.pid);

function apply(room, p, res, api) {
  const before = p.score;
  if (res.amount && ['gold', 'gold+', 'big'].includes(res.kind)) {
    if (p.m.lucky) { res.amount *= 2; res.lucky = true; p.m.lucky = false; }
    p.score += res.amount;
  }
  if (res.kind === 'bonusq') p.m.lucky = true;
  if (res.kind === 'x2') p.score *= 2;
  if (res.kind === 'x3') p.score *= 3;
  if (res.kind === 'lose') p.score -= Math.round(p.score * res.pct / 100);
  res.delta = p.score - before;
  if (res.kind === 'big' || res.kind === 'x3') api.feed(`🎉 ${p.name} ${res.kind === 'x3' ? '골드 세 배!' : `+${res.amount} 대박 상자!`}`);
}

function checkGoal(room, api) {
  const goal = room.settings.goal;
  if (goal && [...room.players.values()].some(p => p.score >= goal)) setTimeout(() => api.end(), 1500);
}

function scores(room) {
  return [...room.players.values()].map(p => ({ pid: p.pid, name: p.name, avatar: p.avatar, score: p.score, n: p.stats.n, ok: p.stats.ok, online: p.online }))
    .sort((a, b) => b.score - a.score);
}

export default {
  id: 'chest',
  name: '보물 상자',
  selfPaced: true,
  settings: s => ({
    minutes: [3, 5, 7, 10, 15].includes(+s.minutes) ? +s.minutes : 7,
    goal: [0, 1000, 2000, 5000, 10000].includes(+s.goal) ? +s.goal : 0,
    steal: s.steal !== false,
  }),
  start(room, api) {
    room.m = { endsAt: Date.now() + room.settings.minutes * 60e3 + 3000, lastBoard: 0 };
    for (const p of room.players.values()) p.m = { picking: null, targeting: null };
    api.toAll('start', { endsAt: room.m.endsAt, steal: room.settings.steal, goal: room.settings.goal });
  },
  onJoin(room, p) { p.m = { picking: null, targeting: null }; },
  canAsk: (room, p) => !p.m.picking && !p.m.targeting && Date.now() < room.m.endsAt,
  onAnswer(room, p, res, api) {
    if (res.ok) {
      p.m.picking = [roll(p, room), roll(p, room), roll(p, room)];
      api.toPlayer(p.pid, 'pick', { n: 3 });
    }
  },
  onStudent(room, p, type, data, api, ack) {
    if (type === 'pick' && p.m.picking) {
      const i = Math.max(0, Math.min(2, data.i | 0));
      const all = p.m.picking, res = all[i];
      p.m.picking = null;
      if (res.kind === 'steal' || res.kind === 'swap' || res.kind === 'gift') {
        p.m.targeting = res;
        const list = others(room, p).map(o => ({ pid: o.pid, name: o.name, avatar: o.avatar, score: o.score })).sort((a, b) => b.score - a.score);
        ack({ res, all, target: list });
      } else {
        apply(room, p, res, api);
        ack({ res, all, score: p.score });
        checkGoal(room, api);
      }
    } else if (type === 'targets' && p.m.targeting) {
      ack({ res: p.m.targeting, target: others(room, p).map(o => ({ pid: o.pid, name: o.name, avatar: o.avatar, score: o.score })).sort((a, b) => b.score - a.score) });
    } else if (type === 'target' && p.m.targeting) {
      const res = p.m.targeting, o = room.players.get(data.pid);
      if (!o || o === p) return ack({ error: '친구를 다시 골라요' });
      p.m.targeting = null;
      let text = '';
      if (res.kind === 'steal') {
        const amt = Math.round(o.score * res.pct / 100);
        o.score -= amt; p.score += amt; res.delta = amt;
        text = `🦝 ${p.name} → ${o.name}의 골드 ${amt}를 가져갔어요!`;
        api.toPlayer(o.pid, 'stolen', { by: p.name, amount: amt, score: o.score });
      } else if (res.kind === 'swap') {
        const a = p.score; p.score = o.score; o.score = a; res.delta = p.score - a;
        text = `🔄 ${p.name} ↔ ${o.name} 골드를 바꿨어요!`;
        api.toPlayer(o.pid, 'swapped', { by: p.name, score: o.score });
      } else if (res.kind === 'gift') {
        p.score += res.amount; o.score += res.amount; res.delta = res.amount;
        text = `🎁 ${p.name} → ${o.name}에게 선물! 둘 다 +${res.amount}`;
        api.toPlayer(o.pid, 'gift', { by: p.name, amount: res.amount, score: o.score });
      }
      api.feed(text);
      ack({ res, score: p.score, target: o.name });
      checkGoal(room, api);
    }
  },
  tick(room, api) {
    const now = Date.now();
    if (now >= room.m.endsAt) return api.end();
    if (now - room.m.lastBoard > 1000) { room.m.lastBoard = now; api.toAll('board', { top: scores(room).slice(0, 40), endsAt: room.m.endsAt }); }
  },
  ranking(room) {
    return scores(room).map((s, i, arr) => ({ pid: s.pid, name: s.name, score: s.score, rank: i && arr[i - 1].score === s.score ? null : i + 1,
      extra: { correct: s.ok, answered: s.n } })).map((r, i, arr) => ({ ...r, rank: r.rank ?? arr.slice(0, i).reverse().find(x => x.rank)?.rank ?? 1 }));
  },
  snapshot(room, p) {
    return { endsAt: room.m.endsAt, steal: room.settings.steal, goal: room.settings.goal, score: p?.score ?? null,
      picking: !!p?.m?.picking, targeting: p?.m?.targeting ? true : false, top: scores(room).slice(0, 40) };
  },
};
