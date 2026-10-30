// 순위와 별개인 개인 학습 기록. 서버에서는 방 메모리, 연습에서는 탭 메모리에만 둔다.
export function newLearning() { return { seq: 0, streak: 0, deck: [], items: Object.create(null) }; }

export function recordAnswer(state, qid, ok, given = '') {
  state.seq++;
  state.streak = ok ? state.streak + 1 : 0;
  const item = state.items[qid] ||= { attempts: 0, correct: 0, firstOk: ok, misses: 0, lastOk: false, due: 0, given: '' };
  item.attempts++; item.correct += +ok; item.lastOk = ok;
  if (!ok) { item.misses++; item.given = String(given).slice(0, 80); }
  item.due = ok ? 0 : state.seq + 2; // 다른 두 문제를 생각한 뒤 다시 만난다.
  return item;
}

export function nextQuestion(state, ids, last = -1, retry = true, random = Math.random) {
  if (!ids.length) return null;
  const due = retry && state.seq - (state.lastRetry ?? -3) >= 3 ? ids.filter(id => id !== last && state.items[id]?.due && state.items[id].due <= state.seq)
    .sort((a, b) => state.items[a].due - state.items[b].due) : [];
  if (due.length) {
    const id = due[0];
    state.lastRetry = state.seq; // 오답이 많아도 새 문제 두 개를 사이에 두어 전체 범위를 만나게 한다.
    state.deck = state.deck.filter(q => q !== id);
    return id;
  }
  if (!state.deck.length) {
    state.deck = [...ids];
    for (let i = state.deck.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [state.deck[i], state.deck[j]] = [state.deck[j], state.deck[i]];
    }
    if (state.deck.length > 1 && state.deck.at(-1) === last) state.deck.unshift(state.deck.pop());
  }
  return state.deck.pop();
}

export function learningSummary(state, total) {
  const items = Object.values(state?.items || {});
  return { total, seen: items.length, secure: items.filter(i => i.lastOk).length,
    review: items.filter(i => !i.lastOk).length, recovered: items.filter(i => i.misses && i.lastOk).length,
    firstCorrect: items.filter(i => i.firstOk).length, attempts: state?.seq || 0,
    correct: items.reduce((sum, i) => sum + i.correct, 0), streak: state?.streak || 0 };
}

export function reviewCards(state, questions) {
  return questions.filter(q => state?.items[q.qid]?.misses).map(q => ({ qid: q.qid, q: q.q,
    correct: q.answers[0], explain: q.explain || '', given: state.items[q.qid].given,
    recovered: state.items[q.qid].lastOk }));
}
