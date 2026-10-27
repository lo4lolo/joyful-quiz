// 골든벨 라이브: 선생님이 한 문제씩 진행. 점수전(빠를수록 점수) 또는 생존전(틀리면 탈락, 패자부활 가능)
const online = room => [...room.players.values()].filter(p => p.online);

function rankingOf(room) {
  const surv = room.settings.style === 'survival';
  const list = [...room.players.values()].map(p => ({ pid: p.pid, name: p.name, score: p.score,
    extra: { correct: p.stats.ok, answered: p.stats.n, alive: !!p.m.alive, streak: p.m.best || 0 } }));
  list.sort((a, b) => (surv ? (b.extra.alive - a.extra.alive) : 0) || b.score - a.score || b.extra.correct - a.extra.correct);
  list.forEach((r, i) => { r.rank = i > 0 && list[i - 1].score === r.score && list[i - 1].extra.alive === r.extra.alive ? list[i - 1].rank : i + 1; });
  return list;
}

function phase(room, api, data) {
  room.m.phase = data.phase;
  room.m.last = data;
  api.toAll('phase', data);
}

function ask(room, api) {
  const m = room.m;
  m.idx++;
  if (m.idx >= m.order.length) return api.end();
  m.answers = Object.create(null);
  const qi = m.order[m.idx];
  const { pcView } = api.askAll(qi, room.settings.time);
  m.asked = new Set([...room.players.values()].map(p => p.pid)); // 이 문제를 받은 학생
  m.deadline = Date.now() + room.settings.time * 1000;
  phase(room, api, { phase: 'question', index: m.idx, total: m.order.length, view: pcView, deadline: m.deadline,
    alive: online(room).filter(p => p.m.alive).length });
}

function reveal(room, api) {
  const m = room.m; if (m.phase !== 'question') return;
  const Q = room.questions[m.order[m.idx]];
  const surv = room.settings.style === 'survival';
  const counts = Object.create(null);
  let okN = 0;
  for (const p of room.players.values()) {
    p.pending = null;
    const a = m.answers[p.pid];
    if (a) { counts[a.given] = (counts[a.given] || 0) + 1; if (a.ok) okN++; }
  }
  // 생존전: 틀리거나 안 낸 학생 탈락. 모두 탈락이면 다 살린다.
  let out = [];
  if (surv) {
    // 문제를 받은 학생은 접속이 끊겨도 판정한다 (나갔다 들어와 피하기 방지)
    const alive = [...room.players.values()].filter(p => p.m.alive && (p.online || m.asked?.has(p.pid)));
    out = alive.filter(p => !m.answers[p.pid]?.ok);
    if (out.length && out.length === alive.length) { out = []; m.allOut = true; api.feed('😮 모두 틀려서 모두 살아남았어요!'); }
    else m.allOut = false;
    out.forEach(p => { p.m.alive = false; });
  }
  const ranking = rankingOf(room);
  const rankOf = Object.fromEntries(ranking.map(r => [r.pid, r.rank]));
  for (const p of room.players.values()) {
    const a = m.answers[p.pid];
    api.toPlayer(p.pid, 'result', { ok: !!a?.ok, answered: !!a, gained: a?.gained || 0, score: p.score, rank: rankOf[p.pid],
      total: room.players.size, streak: p.m.streak, alive: p.m.alive, out: out.includes(p), correct: Q.answers[0], explain: Q.explain });
  }
  phase(room, api, { phase: 'reveal', index: m.idx, total: m.order.length, correct: Q.answers[0], explain: Q.explain, counts,
    answered: Object.keys(m.answers).length, okN, outNames: out.map(p => p.name), allOut: !!m.allOut,
    alive: online(room).filter(p => p.m.alive).length });
}

export default {
  id: 'live',
  name: '골든벨 라이브',
  selfPaced: false,
  settings: s => ({
    style: s.style === 'survival' ? 'survival' : 'score',
    shuffle: !!s.shuffle,
    autoNext: !!s.autoNext,
  }),
  start(room, api) {
    const order = room.questions.map(q => q.qid);
    if (room.settings.shuffle) order.sort(() => Math.random() - 0.5);
    room.m = { idx: -1, order, phase: 'ready', answers: Object.create(null) };
    for (const p of room.players.values()) p.m = { alive: true, streak: 0, best: 0 };
    phase(room, api, { phase: 'ready', total: order.length, style: room.settings.style });
  },
  onJoin(room, p) { p.m = { alive: room.state !== 'play', streak: 0, best: 0 }; },
  onTeacher(room, type, data, api, ack) {
    const m = room.m;
    if (type === 'next') {
      if (m.phase === 'question') reveal(room, api);
      else if (m.phase === 'reveal' && data.board !== false) phase(room, api, { phase: 'board', index: m.idx, total: m.order.length, top: rankingOf(room).slice(0, 10) });
      else ask(room, api);
    } else if (type === 'reveal') reveal(room, api);
    else if (type === 'ask') { if (m.phase !== 'question') ask(room, api); }
    else if (type === 'board') phase(room, api, { phase: 'board', index: m.idx, total: m.order.length, top: rankingOf(room).slice(0, 10) });
    else if (type === 'revive') {
      for (const p of room.players.values()) p.m.alive = true;
      api.feed('💖 패자부활! 모두 다시 도전해요'); api.toAll('revive', {});
    } else if (type === 'time') { // 시간 10초 더
      if (m.phase === 'question') { m.deadline += 10000; api.toAll('deadline', { deadline: m.deadline }); }
    }
    ack?.({ ok: true, phase: m.phase });
  },
  onAnswer(room, p, res, api) {
    const m = room.m; if (m.phase !== 'question') return;
    const T = room.settings.time * 1000;
    let gained = 0;
    if (res.ok) {
      p.m.streak = (p.m.streak || 0) + 1; p.m.best = Math.max(p.m.best || 0, p.m.streak);
      gained = 500 + Math.round(500 * Math.max(0, 1 - res.ms / T)) + 100 * Math.min(p.m.streak - 1, 5);
      if (room.settings.style === 'survival' && !p.m.alive) gained = 0;
    } else p.m.streak = 0;
    p.score += gained;
    m.answers[p.pid] = { given: res.given, ok: res.ok, gained };
    const n = Object.keys(m.answers).length, need = online(room).length;
    api.toTeacher('count', { answered: n, total: need });
    const idx = m.idx;
    if (n >= need) setTimeout(() => { if (room.m === m && m.idx === idx) reveal(room, api); }, 600);
  },
  tick(room, api) {
    const m = room.m;
    if (m.phase === 'question' && Date.now() > m.deadline + 400) reveal(room, api);
  },
  onLeave(room, p, api) {
    const m = room.m;
    if (m?.phase === 'question' && Object.keys(m.answers).length >= online(room).length && online(room).length) reveal(room, api);
  },
  ranking: rankingOf,
  snapshot(room, p) {
    const m = room.m;
    return { last: m.last, score: p?.score ?? null, alive: p?.m?.alive ?? null, answered: p ? !!m.answers?.[p.pid] : null };
  },
};
