// 문제 정리·학생용 문제 만들기·채점 (서버 전용)
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

export const norm = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s.,!?~'"`·()[\]{}]/g, '');

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const isOX = s => /^(o|x|○|×|⭕|❌)$/i.test(String(s).trim());
const toOX = s => (/^(o|○|⭕)$/i.test(String(s).trim()) ? 'O' : 'X');

// 교사가 보낸 문제 배열을 검사해 정리. 잘못된 줄은 버린다.
export function cleanQuestions(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list.slice(0, 300)) {
    if (!raw || typeof raw !== 'object') continue;
    const q = clip(raw.q, 300);
    let answers = (Array.isArray(raw.answers) ? raw.answers : String(raw.answers ?? raw.a ?? '').split('/'))
      .flatMap(a => String(a).split('/')).map(a => clip(a, 80)).filter(Boolean).slice(0, 6);
    answers = [...new Map(answers.map(a => [norm(a), a])).values()];
    const wrong = [...new Map((Array.isArray(raw.wrong) ? raw.wrong : []).map(w => clip(w, 80))
      .filter(w => w && !answers.some(a => norm(a) === norm(w))).map(w => [norm(w), w])).values()].slice(0, 3);
    if (!q || !answers.length) continue;
    let kind = wrong.length ? 'mc' : 'short';
    if (!wrong.length && answers.length === 1 && isOX(answers[0])) { kind = 'ox'; answers = [toOX(answers[0])]; }
    out.push({ qid: out.length, q, answers, wrong, explain: clip(raw.explain, 300), kind });
  }
  return out;
}

// 학생에게 보낼 문제 (정답 표시 없음). touch 기기에는 단답형도 보기를 만든다.
export function studentView(questions, qi, device, time) {
  const Q = questions[qi];
  let choices = null, kind = Q.kind;
  if (Q.kind === 'mc') choices = shuffle([Q.answers[0], ...Q.wrong]);
  else if (Q.kind === 'ox') choices = ['O', 'X'];
  else if (device === 'touch') {
    // 다른 단답형 정답을 먼저, 모자라면 객관식 정답·오답에서 보기를 만든다
    const ok = a => !Q.answers.some(x => norm(x) === norm(a));
    const others = questions.filter(o => o.qid !== Q.qid);
    const pool = [...shuffle(others.filter(o => o.kind === 'short').map(o => o.answers[0])),
      ...shuffle(others.filter(o => o.kind === 'mc').flatMap(o => [o.answers[0], ...o.wrong]))].filter(ok);
    const uniq = [...new Set(pool)].slice(0, 3);
    if (uniq.length >= 1) { choices = shuffle([Q.answers[0], ...uniq]); kind = 'mc'; }
  }
  return { qid: Q.qid, q: Q.q, kind, choices, time };
}

export function grade(Q, given) {
  const g = norm(given);
  const ok = !!g && Q.answers.some(a => norm(a) === g);
  return { ok, correct: Q.answers[0], explain: Q.explain || '' };
}
