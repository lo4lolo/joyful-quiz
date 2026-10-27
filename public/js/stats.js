// 분석실 통계 (DOM 없음 · Node 테스트 가능)
// 여러 기록(record)을 학생 이름·문제 글자로 합쳐서 문항/학생/차시 통계를 만든다.

export const MODE_INFO = {
  live: { icon: '🔔', name: '골든벨 라이브' },
  chest: { icon: '🎁', name: '보물 상자' },
  territory: { icon: '🗺️', name: '땅따먹기' },
  race: { icon: '🏎️', name: '카트 레이스' },
  tug: { icon: '🪢', name: '다 함께 줄다리기' },
};
export const modeLabel = r => {
  const m = MODE_INFO[r?.mode];
  return `${m?.icon || '🎮'} ${r?.modeName || m?.name || r?.mode || '퀴즈'}`;
};

/** 이름 맞추기 키: 공백 없애고 NFC, 소문자 */
export const nameKey = s => String(s ?? '').normalize('NFC').replace(/\s+/g, '').toLowerCase();
/** 문제 맞추기 키: 공백·문장부호 없애고 NFC, 소문자 */
export const qKey = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/[\s.,!?·~'"“”‘’()[\]{}:;]+/g, '');
/** 응답 글자 맞추기 키 */
export const givenKey = s => String(s ?? '').normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

export const rate = (a, b) => (b ? a / b : 0);
export const pctText = (a, b) => `${Math.round(rate(a, b) * 100)}%`;
export const secText = ms => (ms == null || !isFinite(ms) ? '-' : `${(ms / 1000).toFixed(1)}초`);
const avg = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
export function median(xs) {
  const a = xs.filter(x => x != null && isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/** 학생 A, 학생 B … Z, AA, AB … */
export function anonLabel(i) {
  let s = '', n = i + 1;
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return `학생 ${s}`;
}
/** 이름 목록 → Map(이름키 → '학생 A') (주어진 순서대로) */
export function anonymizer(names) {
  const map = new Map();
  for (const n of names) { const k = nameKey(n); if (!map.has(k)) map.set(k, anonLabel(map.size)); }
  return name => map.get(nameKey(name)) || '학생';
}
/** 글 속의 실명을 모두 가명으로 바꾼다 (긴 이름부터) */
export function scrubNames(text, names, anon) {
  const list = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
  let out = String(text);
  for (const n of list) out = out.split(n).join(anon(n));
  return out;
}

const sessionTime = r => Date.parse(r.startedAt || r.endedAt || '') || 0;
export function sortSessions(records) {
  return [...records].sort((a, b) => sessionTime(a) - sessionTime(b) || String(a.title).localeCompare(String(b.title)));
}

/**
 * 여러 기록 → 하나의 분석 자료
 * sessions: [{id,title,unit,mode,modeName,startedAt,endedAt, idx}]
 * questions: [{key,no,q,answers,wrong,explain,kind, sessions:Set<idx>}]
 * students: [{key,name, sessions:Set<idx>, results:[{s,rank,score,extra,of}] }]
 * rows: [{s, sk, qk, ok, given, ms, t}]
 */
export function mergeSessions(records) {
  const sessions = sortSessions(records).map((r, idx) => ({
    idx, id: r.id, title: r.title || '퀴즈', unit: r.unit || '', mode: r.mode || '', modeName: r.modeName || '',
    startedAt: r.startedAt || '', endedAt: r.endedAt || '', rec: r,
  }));
  const qmap = new Map(), smap = new Map(), rows = [];
  for (const s of sessions) {
    const r = s.rec, qByQid = new Map(), sByPid = new Map();
    for (const q of r.questions || []) {
      const key = qKey(q.q);
      if (!key) continue;
      let Q = qmap.get(key);
      if (!Q) {
        Q = { key, no: qmap.size + 1, q: q.q, answers: q.answers || [], wrong: q.wrong || [], explain: q.explain || '', kind: q.kind || '', sessions: new Set() };
        qmap.set(key, Q);
      }
      Q.sessions.add(s.idx); qByQid.set(String(q.qid), key);
    }
    const addStudent = (pid, name) => {
      const key = nameKey(name);
      if (!key) return null;
      let S = smap.get(key);
      if (!S) { S = { key, name: String(name).trim(), sessions: new Set(), results: [] }; smap.set(key, S); }
      S.sessions.add(s.idx); if (pid != null) sByPid.set(String(pid), key);
      return key;
    };
    for (const p of r.players || []) addStudent(p.pid, p.name);
    const rankN = (r.ranking || []).length;
    for (const k of r.ranking || []) {
      const key = sByPid.get(String(k.pid)) || addStudent(k.pid, k.name);
      if (key) smap.get(key).results.push({ s: s.idx, rank: k.rank, score: k.score, extra: k.extra ?? '', of: rankN });
    }
    const qKind = new Map((r.questions || []).map(q => [String(q.qid), q.kind || '']));
    const mine = [];
    for (const a of r.answers || []) {
      const qk = qByQid.get(String(a.qid)), sk = sByPid.get(String(a.pid));
      if (!qk || !sk) continue;
      const given = a.given ?? '';
      mine.push({ s: s.idx, sk, qk, ok: !!a.ok, given, ms: isFinite(a.ms) ? +a.ms : null, t: +a.t || 0,
        try: Number.isInteger(a.try) && a.try > 0 ? a.try : null, seq: Number.isInteger(a.seq) && a.seq > 0 ? a.seq : null,
        streak: Number.isInteger(a.streak) && a.streak >= 0 ? a.streak : null, skip: !!a.skip || String(given).trim() === '',
        kind: ['mc', 'ox', 'short'].includes(a.kind) ? a.kind : qKind.get(String(a.qid)) || '', dev: a.dev === 't' || a.dev === 'p' ? a.dev : '' });
    }
    // 예전 기록: 몇 번째 만남·순서·직전 연속 정답을 시간 순서로 채운다
    for (const list of groupBy(mine, x => x.sk).values()) {
      list.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || a.t - b.t);
      const met = new Map(); let run = 0;
      list.forEach((x, i) => {
        const n = (met.get(x.qk) || 0) + 1; met.set(x.qk, n);
        if (x.try == null) x.try = n;
        if (x.seq == null) x.seq = i + 1;
        if (x.streak == null) x.streak = run;
        run = x.ok ? run + 1 : 0;
      });
    }
    rows.push(...mine);
  }
  sessions.forEach(s => { delete s.rec; });
  return { sessions, questions: [...qmap.values()], students: [...smap.values()], rows };
}

const groupBy = (xs, f) => { const m = new Map(); for (const x of xs) { const k = f(x); (m.get(k) || m.set(k, []).get(k)).push(x); } return m; };

/** 전체 요약 */
export function summary(ds) {
  const answered = new Set(ds.rows.map(r => r.sk));
  const ok = ds.rows.filter(r => r.ok).length;
  return {
    sessions: ds.sessions.length,
    students: answered.size || ds.students.length,
    questions: new Set(ds.rows.map(r => r.qk)).size || ds.questions.length,
    responses: ds.rows.length,
    correct: ok,
    rate: rate(ok, ds.rows.length),
    avgMs: avg(ds.rows.filter(r => r.ms != null && r.given !== '').map(r => r.ms)),
  };
}

export const NO_ANSWER = '(무응답·시간 초과)';
/**
 * 문항별 통계. 오답 분포는 응답 글자로 묶는다.
 * topWrong: {given, count, share(전체 응답 중), shareOfWrong}
 */
export function questionStats(ds) {
  const byQ = groupBy(ds.rows, r => r.qk);
  return ds.questions.map(Q => {
    const rs = byQ.get(Q.key) || [];
    const ok = rs.filter(r => r.ok).length;
    const dist = new Map();
    for (const r of rs) {
      const label = r.given === '' ? NO_ANSWER : String(r.given).trim();
      const k = r.given === '' ? '\u0000' : givenKey(r.given);
      const d = dist.get(k) || { given: label, count: 0, ok: r.ok };
      d.count++; dist.set(k, d);
    }
    const choices = [...dist.values()].sort((a, b) => b.count - a.count);
    const wrongs = choices.filter(c => !c.ok && c.given !== NO_ANSWER);
    const nWrong = rs.length - ok;
    const top = wrongs[0];
    const times = rs.filter(r => r.ms != null && r.given !== '').map(r => r.ms);
    return {
      key: Q.key, no: Q.no, q: Q.q, answer: (Q.answers || [])[0] ?? '', answers: Q.answers, wrong: Q.wrong, explain: Q.explain, kind: Q.kind,
      n: rs.length, correct: ok, rate: rate(ok, rs.length), students: new Set(rs.map(r => r.sk)).size,
      avgMs: avg(times), medMs: median(times),
      noAnswer: rs.filter(r => r.given === '').length,
      choices,
      topWrong: top ? { given: top.given, count: top.count, share: rate(top.count, rs.length), shareOfWrong: rate(top.count, nWrong) } : null,
    };
  });
}

/** 오개념 후보: 한 가지 오답으로 몰린 문항 */
export function misconceptions(qstats, { minShare = 0.25, minCount = 3 } = {}) {
  return qstats
    .filter(q => q.topWrong && q.topWrong.count >= minCount && q.topWrong.share >= minShare)
    .sort((a, b) => b.topWrong.share - a.topWrong.share);
}

/** 다시 가르칠 문제: 정답률이 낮은 순 (응답이 너무 적은 문제는 뺀다) */
export function reteachTop(qstats, n = 3, { minResponses = 3, maxRate = 0.8 } = {}) {
  return qstats.filter(q => q.n >= minResponses && q.rate < maxRate)
    .sort((a, b) => a.rate - b.rate || (b.topWrong?.share || 0) - (a.topWrong?.share || 0))
    .slice(0, n);
}

/** 학생별 통계 */
export function studentStats(ds) {
  const byS = groupBy(ds.rows, r => r.sk);
  return ds.students.map(S => {
    const rs = byS.get(S.key) || [];
    const ok = rs.filter(r => r.ok).length;
    const times = rs.filter(r => r.ms != null && r.given !== '').map(r => r.ms);
    const best = S.results.length ? S.results.reduce((a, b) => ((a.rank || 1e9) <= (b.rank || 1e9) ? a : b)) : null;
    const last = S.results.length ? S.results.reduce((a, b) => (a.s >= b.s ? a : b)) : null;
    return {
      key: S.key, name: S.name, n: rs.length, correct: ok, rate: rate(ok, rs.length),
      avgMs: avg(times), medMs: median(times), questions: new Set(rs.map(r => r.qk)).size,
      sessions: S.sessions.size, results: S.results, best, last,
    };
  });
}

/**
 * 도움이 필요한 학생(정답률 낮고 응답이 충분) / 도전 과제를 줄 학생(정답률 높고 빠름)
 */
export function studentGroups(sstats, { lowRate = 0.6, highRate = 0.85, minAttempts } = {}) {
  const active = sstats.filter(s => s.n > 0);
  const medN = median(active.map(s => s.n)) || 0;
  const need = minAttempts ?? Math.max(3, Math.ceil(medN * 0.5));
  const medT = median(active.map(s => s.avgMs).filter(x => x != null));
  const enough = active.filter(s => s.n >= need);
  return {
    minAttempts: need, medianMs: medT,
    help: enough.filter(s => s.rate < lowRate).sort((a, b) => a.rate - b.rate),
    challenge: enough.filter(s => s.rate >= highRate && (medT == null || s.avgMs == null || s.avgMs <= medT))
      .sort((a, b) => b.rate - a.rate || a.avgMs - b.avgMs),
    few: active.filter(s => s.n < need),
  };
}

/**
 * 학생×문항 표. cell: {n, ok, last(ok of latest attempt), lastGiven} | null
 */
export function matrix(ds) {
  const cells = new Map();
  const sorted = [...ds.rows].sort((a, b) => a.s - b.s || a.t - b.t);
  for (const r of sorted) {
    const k = r.sk + '\u0001' + r.qk;
    const c = cells.get(k) || { n: 0, ok: 0, last: false, lastGiven: '', givens: [] };
    c.n++; if (r.ok) c.ok++; c.last = r.ok; c.lastGiven = r.given;
    if (c.givens.length < 6) c.givens.push({ given: r.given, ok: r.ok, s: r.s, ms: r.ms });
    cells.set(k, c);
  }
  return { get: (sk, qk) => cells.get(sk + '\u0001' + qk) || null };
}
/** 칸 기호: 마지막 응답 기준 O / X, 응답 없으면 - */
export const cellMark = c => (!c ? '-' : c.last ? 'O' : 'X');

/** 한 학생의 문항별 응답 */
export function studentDetail(ds, sk) {
  const qs = new Map(ds.questions.map(q => [q.key, q]));
  const rs = ds.rows.filter(r => r.sk === sk).sort((a, b) => a.s - b.s || a.t - b.t);
  const byQ = groupBy(rs, r => r.qk);
  return ds.questions.filter(q => byQ.has(q.key)).map(q => ({
    no: q.no, q: q.q, answer: (q.answers || [])[0] ?? '', tries: byQ.get(q.key).map(r => ({ s: r.s, ok: r.ok, given: r.given, ms: r.ms })),
  })).concat(ds.questions.filter(q => !byQ.has(q.key) && qs.has(q.key)).map(q => ({ no: q.no, q: q.q, answer: (q.answers || [])[0] ?? '', tries: [] })))
    .sort((a, b) => a.no - b.no);
}

/** 차시(기록)별 비교 */
export function sessionCompare(ds) {
  const byS = groupBy(ds.rows, r => r.s);
  const per = ds.sessions.map(s => {
    const rs = byS.get(s.idx) || [];
    const ok = rs.filter(r => r.ok).length;
    return { ...s, n: rs.length, correct: ok, rate: rate(ok, rs.length), students: new Set(rs.map(r => r.sk)).size,
      avgMs: avg(rs.filter(r => r.ms != null && r.given !== '').map(r => r.ms)) };
  });
  // 같은 문제: 처음 나온 차시 vs 마지막 차시
  const byQS = groupBy(ds.rows, r => r.qk + '\u0001' + r.s);
  const same = [];
  for (const Q of ds.questions) {
    const ss = [...Q.sessions].filter(i => byQS.has(Q.key + '\u0001' + i)).sort((a, b) => a - b);
    if (ss.length < 2) continue;
    const at = i => { const rs = byQS.get(Q.key + '\u0001' + i); return { s: i, n: rs.length, rate: rate(rs.filter(r => r.ok).length, rs.length) }; };
    const first = at(ss[0]), last = at(ss[ss.length - 1]);
    same.push({ key: Q.key, no: Q.no, q: Q.q, first, last, diff: last.rate - first.rate, points: ss.map(at) });
  }
  same.sort((a, b) => b.diff - a.diff);
  // 학생: 처음 참여 차시 vs 마지막 참여 차시
  const bySS = groupBy(ds.rows, r => r.sk + '\u0001' + r.s);
  const studentsChange = [];
  for (const S of ds.students) {
    const ss = [...S.sessions].filter(i => bySS.has(S.key + '\u0001' + i)).sort((a, b) => a - b);
    if (ss.length < 2) continue;
    const at = i => { const rs = bySS.get(S.key + '\u0001' + i); return rate(rs.filter(r => r.ok).length, rs.length); };
    studentsChange.push({ key: S.key, name: S.name, first: at(ss[0]), last: at(ss[ss.length - 1]), diff: at(ss[ss.length - 1]) - at(ss[0]) });
  }
  studentsChange.sort((a, b) => b.diff - a.diff);
  return { sessions: per, same, students: studentsChange };
}

/** 한 번에 모든 분석 */
export function analyze(records) {
  const ds = mergeSessions(records);
  const qs = questionStats(ds), ss = studentStats(ds);
  return { ds, sum: summary(ds), qs, ss, groups: studentGroups(ss), mis: misconceptions(qs), top: reteachTop(qs), cmp: sessionCompare(ds), mx: matrix(ds) };
}

/** 순위 한 줄: 협력 모드(noRank)는 등수 대신 '모둠에 보탠 몫' */
export function resultText(r) {
  const x = r?.extra && typeof r.extra === 'object' ? r.extra : null;
  if (x?.noRank) return `기여 ${x.contrib ?? r.score ?? 0}${typeof x.share === 'number' ? ` (모둠의 ${Math.round(x.share * 100)}%)` : ''}`;
  return `${r?.rank || '-'}위/${r?.score ?? 0}점`;
}
/** 순위의 추가 정보를 짧은 글로 (예전: 글자, 새: 객체) */
export function extraText(e) {
  if (e == null || e === '') return '';
  if (typeof e !== 'object') return String(e);
  const out = [];
  if (e.teamName) out.push(e.teamName);
  for (const [k, v] of Object.entries(e)) {
    if (['noRank', 'team', 'teamName', 'contrib', 'teamContrib', 'share', 'classWin'].includes(k)) continue;
    if (typeof v === 'number' || (typeof v === 'string' && v)) out.push(`${k} ${v}`);
  }
  return out.join(', ');
}

/** 날짜 글자 (YYYY-MM-DD HH:mm, 로컬 시간) */
export function dateText(iso, withTime = true) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}${withTime ? ` ${p(d.getHours())}:${p(d.getMinutes())}` : ''}`;
}

/**
 * 엑셀 시트용 2차원 배열들 (XLSX 없이 만들 수 있게 순수 함수)
 * 반환: [{name, rows:[[...]], cols:[width...]}]
 */
export function analysisSheets(records, { title } = {}) {
  const A = analyze(records), { ds, sum, qs, ss } = A;
  const multi = ds.sessions.length > 1;
  const P = x => Math.round(x * 1000) / 10; // 퍼센트 숫자 (소수 1자리)
  const sec = ms => (ms == null ? '' : Math.round(ms / 100) / 10);
  const sheets = [];
  const first = ds.sessions[0] || {};
  const info = [
    ['즐거운 퀴즈 기록 요약'],
    [],
    ['제목', title || (multi ? `${first.title} 외 ${ds.sessions.length - 1}개 기록` : first.title || '')],
    ['단원', [...new Set(ds.sessions.map(s => s.unit).filter(Boolean))].join(', ')],
    ['게임 방식', [...new Set(ds.sessions.map(s => s.modeName || MODE_INFO[s.mode]?.name || s.mode).filter(Boolean))].join(', ')],
    ['날짜', ds.sessions.map(s => dateText(s.startedAt)).filter(Boolean).join(', ')],
    ['기록 수(차시)', ds.sessions.length],
    ['참여 학생', sum.students],
    ['문항 수', sum.questions],
    ['응답 수', sum.responses],
    ['정답 수', sum.correct],
    ['전체 정답률(%)', P(sum.rate)],
    ['평균 응답 시간(초)', sec(sum.avgMs)],
    [],
    ['다시 가르칠 문제 TOP 3'],
    ...A.top.map((q, i) => [`${i + 1}. ${q.q}`, `정답률 ${P(q.rate)}%`, q.topWrong ? `많이 고른 오답: ${q.topWrong.given} (${P(q.topWrong.share)}%)` : '']),
    [],
    ['※ 이 파일에는 학생 이름이 들어 있어요. 학교 밖으로 보내지 마세요.'],
  ];
  sheets.push({ name: '요약', rows: info, cols: [26, 40, 46] });
  sheets.push({
    name: '문항분석', cols: [6, 50, 20, 9, 9, 9, 26, 12, 14],
    rows: [['번호', '문항', '정답', '응답 수', '정답 수', '정답률(%)', '가장 많이 고른 오답', '오답 비율(%)', '평균 응답 시간(초)'],
      ...qs.map(q => [q.no, q.q, q.answer, q.n, q.correct, P(q.rate), q.topWrong?.given ?? '', q.topWrong ? P(q.topWrong.share) : '', sec(q.avgMs)])],
  });
  const resText = s => (s.results.length ? s.results.map(resultText).join(', ') : '');
  sheets.push({
    name: '학생분석', cols: [18, 9, 9, 10, 14, 22],
    rows: [['이름', '응답 수', '정답 수', '정답률(%)', '평균 응답 시간(초)', multi ? '순위/점수(차시별)' : '순위/점수'],
      ...[...ss].sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true })).map(s => [s.name, s.n, s.correct, P(s.rate), sec(s.avgMs), resText(s)])],
  });
  const studs = [...ds.students].sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  sheets.push({
    name: '학생x문항', cols: [18, ...ds.questions.map(() => 5), 10],
    rows: [['이름', ...ds.questions.map(q => `${q.no}번`), '정답률(%)'],
      ['(문항)', ...ds.questions.map(q => q.q), ''],
      ...studs.map(S => {
        const marks = ds.questions.map(q => cellMark(A.mx.get(S.key, q.key)));
        const st = ss.find(x => x.key === S.key);
        return [S.name, ...marks, st ? P(st.rate) : ''];
      })],
  });
  if (multi) {
    sheets.push({
      name: '차시비교', cols: [6, 34, 18, 18, 10, 10],
      rows: [['차시', '제목', '게임 방식', '날짜', '참여 학생', '정답률(%)'],
        ...A.cmp.sessions.map(s => [s.idx + 1, s.title, s.modeName || s.mode, dateText(s.startedAt), s.students, P(s.rate)]),
        [], ['같은 문제 변화', '문항', '처음 정답률(%)', '마지막 정답률(%)', '변화(%p)'],
        ...A.cmp.same.map(x => [x.no, x.q, P(x.first.rate), P(x.last.rate), P(x.diff)])],
    });
  }
  sheets.push({ name: '학습행동', cols: [18, 12, 10, 12, 12, 12, 12, 10, 10, 10, 10, 10, 10, 10, 10, 12], rows: behaviorSheetRows(behaviorAnalysis(records, { ds })) });
  if (records.some(hasCoop)) sheets.push({ name: '모둠협력', cols: [24, 16, 9, 12, 12, 9, 12, 12, 12, 8, 8, 30, 6, 6, 9, 10, 10, 10, 12], rows: coopSheetRows(coopAnalysis(records)) });
  const qByKey = new Map(ds.questions.map(q => [q.key, q])), sByKey = new Map(ds.students.map(s => [s.key, s]));
  sheets.push({
    name: '응답원자료', cols: multi ? [6, 18, 6, 44, 20, 6, 10, 20] : [18, 6, 44, 20, 6, 10, 20],
    rows: [[...(multi ? ['차시'] : []), '이름', '번호', '문항', '학생 응답', '정오', '응답 시간(초)', '시각'],
      ...[...ds.rows].sort((a, b) => a.s - b.s || a.t - b.t).map(r => {
        const q = qByKey.get(r.qk);
        return [...(multi ? [r.s + 1] : []), sByKey.get(r.sk)?.name ?? '', q?.no ?? '', q?.q ?? '', r.given === '' ? NO_ANSWER : r.given, r.ok ? 'O' : 'X', sec(r.ms), r.t ? dateText(new Date(r.t).toISOString()) + ':' + String(new Date(r.t).getSeconds()).padStart(2, '0') : ''];
      })],
  });
  return sheets;
}

// ======================================================================
// 모둠 협력 분석 (docs/COOP_DESIGN.md). 예전 기록(teams/events 없음)은 빈 결과.
// ======================================================================
/** 연구 기준값: 기여 적음 15% 미만, 독주 50% 이상 */
export const COOP = { lowShare: 0.15, dominance: 0.5 };
export const REFLECT = [
  { v: 'great', icon: '🌟', label: '크게 보탰어요' },
  { v: 'good', icon: '🙂', label: '잘 보탰어요' },
  { v: 'little', icon: '🌱', label: '조금 보탰어요' },
  { v: 'next', icon: '💪', label: '다음엔 더 보탤래요' },
];
export const ALERT_KIND = {
  stuck: { icon: '⏳', label: '정체' },
  fail: { icon: '❌', label: '연속 오답' },
  lowShare: { icon: '🔈', label: '기여 적음' },
  dominance: { icon: '📣', label: '독주' },
};
const TEAM_FALLBACK = ['청룡', '주작', '봉황', '해치', '백호', '현무'];

/** 지니 계수 (0 = 모두 같음, 1에 가까울수록 한 명에게 몰림). 합이 0이면 null */
export function gini(xs) {
  const a = xs.filter(x => Number.isFinite(x) && x >= 0);
  const n = a.length, sum = a.reduce((s, x) => s + x, 0);
  if (!n || !sum) return null;
  let d = 0;
  for (const x of a) for (const y of a) d += Math.abs(x - y);
  return d / (2 * n * sum);
}
/** 균형 지수 = 1 − 지니 (1에 가까울수록 고르게 기여) */
export const balanceIndex = xs => { const g = gini(xs); return g == null ? null : 1 - g; };

/** 이 기록에 모둠·협력 기록이 있나 */
export const hasCoop = r => !!r && ((r.teams || []).length > 0 || (r.events || []).length > 0 || (r.players || []).some(p => Number.isInteger(p.team)));
const tally = (arr, key) => arr.reduce((m, x) => { const k = key(x); if (k != null && k !== '') m[k] = (m[k] || 0) + 1; return m; }, {});
const emptyReflect = () => Object.fromEntries(REFLECT.map(x => [x.v, 0]));
const truthy = v => v === true || v === 1 || v === 'true';

/**
 * 한 기록의 모둠 협력 분석
 * teams[]: { idx, id, name, color, size, members[], n, correct, contrib, maxShare, maxMember, zero, low, dom, balance,
 *            shared:{n, meanDistinct, meanNeed}, help:{given, received}, choices, routes{}, refusals, caught, goals, roleHolders, reflect{} }
 * members[]: { pid, name, n, correct, contrib, share, low, dom, zero, reflect }
 */
export function coopSession(r, opt = {}) {
  const { lowShare, dominance } = { ...COOP, ...opt };
  const ev = r.events || [], players = r.players || [];
  const rk = new Map((r.ranking || []).map(x => [String(x.pid), x]));
  const usesContrib = (r.ranking || []).some(x => typeof x.extra?.contrib === 'number');
  const byPid = new Map();
  for (const a of r.answers || []) {
    const o = byPid.get(String(a.pid)) || { n: 0, correct: 0 };
    o.n++; if (a.ok) o.correct++; byPid.set(String(a.pid), o);
  }
  const pidTeam = new Map(players.map(p => {
    const x = rk.get(String(p.pid))?.extra;
    return [String(p.pid), Number.isInteger(p.team) ? p.team : Number.isInteger(x?.team) ? x.team : null];
  }));
  const idxs = new Set([...pidTeam.values()].filter(Number.isInteger));
  (r.teams || []).forEach((_, i) => idxs.add(i));
  for (const e of ev) if (Number.isInteger(e.team)) idxs.add(e.team);
  const reflectByPid = new Map(ev.filter(e => e.type === 'reflect' && e.pid != null).map(e => [String(e.pid), e.data?.v]));
  const evTeam = e => (Number.isInteger(e.team) ? e.team : e.pid != null ? pidTeam.get(String(e.pid)) ?? null : null);
  const teams = [...idxs].sort((a, b) => a - b).map(idx => {
    const T = (r.teams || [])[idx] || {};
    const members = players.filter(p => pidTeam.get(String(p.pid)) === idx).map(p => {
      const s = byPid.get(String(p.pid)) || { n: 0, correct: 0 };
      const x = rk.get(String(p.pid))?.extra;
      const contrib = usesContrib ? (typeof x?.contrib === 'number' ? x.contrib : 0) : s.correct;
      return { pid: p.pid, name: p.name, n: s.n, correct: s.correct, contrib, share: 0, reflect: reflectByPid.get(String(p.pid)) || null };
    });
    const contrib = members.reduce((a, m) => a + m.contrib, 0);
    for (const m of members) {
      m.share = contrib ? m.contrib / contrib : 0;
      m.zero = m.contrib === 0;
      m.low = members.length >= 2 && contrib > 0 && m.share < lowShare;
      m.dom = members.length >= 3 && m.share >= dominance;
    }
    const top = members.reduce((a, m) => (!a || m.share > a.share ? m : a), null);
    const tev = ev.filter(e => evTeam(e) === idx);
    const shared = tev.filter(e => e.type === 'shared');
    const dist = shared.map(e => +e.data?.distinct).filter(Number.isFinite);
    const need = shared.map(e => +(e.data?.need ?? e.data?.needed ?? e.data?.all)).filter(Number.isFinite);
    const choices = tev.filter(e => e.type === 'choice');
    const refl = emptyReflect(); for (const m of members) if (m.reflect in refl) refl[m.reflect]++;
    return {
      idx, id: T.id || String(idx), name: T.name || TEAM_FALLBACK[idx] || `모둠 ${idx + 1}`, color: T.color || '',
      size: members.length, members,
      n: members.reduce((a, m) => a + m.n, 0), correct: members.reduce((a, m) => a + m.correct, 0), contrib,
      maxShare: top && contrib ? top.share : null, maxMember: top && contrib ? top.name : null,
      zero: members.filter(m => m.zero).length, low: members.filter(m => m.low).length, dom: members.some(m => m.dom),
      balance: balanceIndex(members.map(m => m.contrib)),
      shared: { n: shared.length, meanDistinct: avg(dist), meanNeed: avg(need) },
      help: { given: tev.filter(e => e.type === 'help').length, received: ev.filter(e => e.type === 'help' && e.data?.toTeam != null && +e.data.toTeam === idx).length },
      choices: choices.length, routes: tally(choices.filter(e => e.data?.route != null), e => String(e.data.route)),
      refusals: choices.filter(e => truthy(e.data?.refused)).length,
      caught: tev.filter(e => e.type === 'caught').length,
      goals: tev.filter(e => e.type === 'teamGoal').length,
      roleHolders: new Set(tev.filter(e => e.type === 'role' && e.pid != null).map(e => String(e.pid))).size,
      reflect: refl,
    };
  });
  const alerts = ev.filter(e => e.type === 'alert');
  const acks = ev.filter(e => e.type === 'teacher' && (e.data?.action ?? 'visit') === 'visit');
  const ackByKind = {};
  const delays = [];
  for (const e of acks) {
    const k = e.data?.kind || 'etc', d = +e.data?.delay;
    const o = ackByKind[k] || (ackByKind[k] = { n: 0, ds: [] });
    o.n++; if (Number.isFinite(d) && d >= 0) { o.ds.push(d); delays.push(d); }
  }
  for (const o of Object.values(ackByKind)) { o.mean = avg(o.ds); o.timed = o.ds.length; delete o.ds; }
  const classGoals = ev.filter(e => e.type === 'classGoal');
  const winFlags = (r.ranking || []).map(x => x.extra?.classWin).filter(v => typeof v === 'boolean');
  const classWin = winFlags.length ? winFlags.some(Boolean) : classGoals.length ? classGoals.some(e => e.data?.win !== false && e.data?.ok !== false) : null;
  const reflect = emptyReflect();
  for (const v of reflectByPid.values()) if (v in reflect) reflect[v]++;
  return {
    id: r.id, title: r.title || '퀴즈', mode: r.mode || '', modeName: r.modeName || '', startedAt: r.startedAt || '',
    metric: usesContrib ? 'contrib' : 'correct', teams, classWin, classGoals: classGoals.length,
    alerts: { total: alerts.length, byKind: tally(alerts, e => e.data?.kind || 'etc') },
    acks: { n: acks.length, timed: delays.length, meanDelay: avg(delays), byKind: ackByKind },
    reflect, reflectN: Object.values(reflect).reduce((a, b) => a + b, 0),
    unassigned: players.filter(p => !Number.isInteger(pidTeam.get(String(p.pid)))).length,
  };
}

/** 여러 기록의 모둠 협력 분석 (협력 기록이 있는 기록만 봄) */
export function coopAnalysis(records, opt = {}) {
  const sessions = sortSessions(records).filter(hasCoop).map(r => coopSession(r, opt));
  const reflect = emptyReflect(), reflectByTeam = new Map(), alertsByKind = {}, ackByKind = {};
  let dSum = 0, dN = 0;
  for (const s of sessions) {
    for (const [k, v] of Object.entries(s.reflect)) reflect[k] += v;
    for (const t of s.teams) {
      const o = reflectByTeam.get(t.name) || { name: t.name, color: t.color, ...emptyReflect() };
      for (const [k, v] of Object.entries(t.reflect)) o[k] += v;
      reflectByTeam.set(t.name, o);
    }
    for (const [k, v] of Object.entries(s.alerts.byKind)) alertsByKind[k] = (alertsByKind[k] || 0) + v;
    for (const [k, o] of Object.entries(s.acks.byKind)) {
      const a = ackByKind[k] || (ackByKind[k] = { n: 0, sum: 0, timed: 0 });
      a.n += o.n; if (o.mean != null) { a.sum += o.mean * o.timed; a.timed += o.timed; }
    }
    if (s.acks.meanDelay != null) { dSum += s.acks.meanDelay * s.acks.timed; dN += s.acks.timed; }
  }
  for (const a of Object.values(ackByKind)) { a.mean = a.timed ? a.sum / a.timed : null; delete a.sum; }
  const teams = sessions.flatMap(s => s.teams);
  const known = sessions.filter(s => s.classWin != null);
  return {
    sessions,
    classWin: { won: known.filter(s => s.classWin).length, known: known.length, total: sessions.length },
    reflect, reflectN: Object.values(reflect).reduce((a, b) => a + b, 0), reflectByTeam: [...reflectByTeam.values()],
    alerts: { total: sessions.reduce((a, s) => a + s.alerts.total, 0), byKind: alertsByKind, perSession: sessions.map(s => s.alerts.total) },
    acks: { n: sessions.reduce((a, s) => a + s.acks.n, 0), meanDelay: dN ? dSum / dN : null, byKind: ackByKind },
    flagged: { dom: teams.filter(t => t.dom).length, zero: teams.reduce((a, t) => a + t.zero, 0), low: teams.reduce((a, t) => a + t.low, 0) },
    meanBalance: avg(teams.map(t => t.balance).filter(x => x != null)),
  };
}

/** 엑셀 '모둠협력' 시트 행 */
export function coopSheetRows(ca) {
  const P = x => (x == null ? '' : Math.round(x * 1000) / 10);
  const sec = ms => (ms == null ? '' : Math.round(ms / 100) / 10);
  const rows = [['모둠 협력 분석 (기여 적음: 모둠 안 몫 15% 미만 · 독주: 50% 이상 · 균형 지수 = 1 − 지니)'], []];
  rows.push(['우리 반 목표 성공', `${ca.classWin.won}/${ca.classWin.known || ca.classWin.total} 차시`]);
  rows.push(['교사 알림 수', ca.alerts.total, '차시별', ca.alerts.perSession.join(', ')]);
  rows.push(['알림 → 교사 도착 평균(초)', sec(ca.acks.meanDelay), '교사가 확인한 알림', ca.acks.n]);
  for (const [k, n] of Object.entries(ca.alerts.byKind)) rows.push([`  알림: ${ALERT_KIND[k]?.label || k}`, n, '평균 도착(초)', sec(ca.acks.byKind[k]?.mean)]);
  rows.push(['성찰(모둠에 보탠 몫)', ...REFLECT.map(x => `${x.label} ${ca.reflect[x.v]}`)]);
  for (const s of ca.sessions) {
    rows.push([], [`[${dateText(s.startedAt)}] ${s.title} · ${s.modeName || s.mode}`, s.classWin == null ? '' : s.classWin ? '우리 반 목표 성공' : '우리 반 목표 실패']);
    rows.push(['모둠', '인원', '정답 수', s.metric === 'contrib' ? '기여(공동 진행에 쓰인 정답)' : '기여(정답 수)', '가장 큰 몫(%)', '기여 0명', '균형 지수', '공동 진행 횟수', '함께한 평균 인원', '도움 준', '도움 받은', '작전 선택', '거절', '들킴', '모둠 목표', ...REFLECT.map(x => x.label)]);
    for (const t of s.teams) rows.push([t.name, t.size, t.correct, t.contrib, P(t.maxShare), t.zero, t.balance == null ? '' : Math.round(t.balance * 100) / 100,
      t.shared.n, t.shared.meanDistinct == null ? '' : Math.round(t.shared.meanDistinct * 10) / 10, t.help.given, t.help.received,
      Object.entries(t.routes).map(([k, v]) => `${k} ${v}`).join(', '), t.refusals, t.caught, t.goals, ...REFLECT.map(x => t.reflect[x.v])]);
    rows.push(['모둠', '이름', '응답 수', '정답 수', '기여', '모둠 안 몫(%)', '표시', '성찰']);
    for (const t of s.teams) for (const m of t.members) rows.push([t.name, m.name, m.n, m.correct, m.contrib, P(m.share),
      [m.dom ? '독주' : '', m.zero ? '기여 0' : m.low ? '기여 적음' : ''].filter(Boolean).join(', '), REFLECT.find(x => x.v === m.reflect)?.label || '']);
  }
  return rows;
}

// ======================================================================
// 게임 속 학습 행동 (단순 정오답 외 분석)
// 답마다: try(몇 번째 만남) · seq(순서) · streak(직전 연속 정답) · skip · kind · dev
// 예전 기록은 mergeSessions 가 시간 순서로 try/seq/streak 를 채운다.
// ======================================================================
export const BEHAV = { fastWrong: 0.3, fatigueDrop: 0.15, minAnswers: 5 };
export const QUAD = [
  { k: 'fastOk', icon: '⚡', label: '빠르고 정확', sub: '숙달' },
  { k: 'slowOk', icon: '🐢', label: '느리지만 정확', sub: '신중 · 아직 느림' },
  { k: 'slowWrong', icon: '🧗', label: '느리고 틀림', sub: '어려움' },
  { k: 'fastWrong', icon: '💨', label: '빠르게 틀림', sub: '찍기 · 성급 의심' },
];
export const KIND_LABEL = { ox: 'OX', mc: '선택형', short: '단답형' };
export const DEV_LABEL = { t: '태블릿', p: '컴퓨터' };
const r1 = x => (x == null ? null : Math.round(x * 1000) / 1000);
const accOf = rs => (rs.length ? rs.filter(r => r.ok).length / rs.length : null);
const emptyQuad = () => ({ fastOk: 0, slowOk: 0, slowWrong: 0, fastWrong: 0, n: 0 });

/** 문제별 중간 응답 시간(건너뜀 제외) → 빠름/느림 가르는 선 */
export function questionMedians(rows) {
  const m = new Map();
  for (const [qk, rs] of groupBy(rows.filter(r => !r.skip && r.ms != null), r => r.qk)) m.set(qk, median(rs.map(r => r.ms)));
  return m;
}
/** 답 하나의 4분면 (건너뜀·시간 없음은 null) */
export function quadOf(r, med) {
  if (r.skip || r.ms == null || med == null) return null;
  const fast = r.ms <= med;
  return r.ok ? (fast ? 'fastOk' : 'slowOk') : (fast ? 'fastWrong' : 'slowWrong');
}
const addQuad = (o, q) => { if (q) { o[q]++; o.n++; } };
const shareQuad = o => Object.fromEntries(QUAD.map(x => [x.k, o.n ? o[x.k] / o.n : 0]));
const topQuad = o => (o.n ? QUAD.reduce((a, x) => (o[x.k] > o[a.k] ? x : a), QUAD[0]).k : null);

/** 한 학생(또는 묶음)의 답 순서에서: 오답 뒤 정답률, 정답 뒤 정답률, 가장 긴 연속 정답 */
function flowStats(seqLists) {
  let afterWrong = 0, afterWrongOk = 0, afterOk = 0, afterOkOk = 0, longest = 0;
  for (const list of seqLists) {
    let run = 0;
    list.forEach((r, i) => {
      run = r.ok ? run + 1 : 0; if (run > longest) longest = run;
      if (r.streak != null && r.ok && r.streak + 1 > longest) longest = r.streak + 1;
      if (i === 0) return;
      const prev = list[i - 1];
      if (prev.ok) { afterOk++; if (r.ok) afterOkOk++; } else { afterWrong++; if (r.ok) afterWrongOk++; }
    });
  }
  return { afterWrongN: afterWrong, afterWrong: afterWrong ? afterWrongOk / afterWrong : null, afterOkN: afterOk, afterOk: afterOk ? afterOkOk / afterOk : null, longest };
}
/** 초반·중반·후반 (학생·기록마다 자기 답 순서를 셋으로) */
function thirdsOf(seqLists, minLen = 6) {
  const parts = [[], [], []];
  for (const list of seqLists) {
    if (list.length < minLen) continue;
    list.forEach((r, i) => parts[Math.min(2, Math.floor((i * 3) / list.length))].push(r));
  }
  return parts.map(rs => ({ n: rs.length, acc: accOf(rs), medMs: median(rs.filter(r => !r.skip && r.ms != null).map(r => r.ms)) }));
}
/** 다시 만난 문제: 처음 만남 vs 다시 만남 정답률, 처음 틀렸다가 다시 만나 맞힌 문제 */
function retryStats(rs) {
  const first = rs.filter(r => r.try === 1), later = rs.filter(r => r.try >= 2);
  const byPair = groupBy(rs, r => `${r.s}\u0001${r.sk}\u0001${r.qk}`);
  let chances = 0, recovered = 0; const recoveredKeys = [];
  for (const [k, list] of byPair) {
    const sorted = [...list].sort((a, b) => a.try - b.try || a.seq - b.seq);
    if (sorted.length < 2 || sorted[0].ok) continue;
    chances++;
    if (sorted.slice(1).some(r => r.ok)) { recovered++; recoveredKeys.push(k); }
  }
  const fa = accOf(first), la = accOf(later);
  return { firstN: first.length, firstAcc: fa, laterN: later.length, laterAcc: la, gain: fa != null && la != null ? la - fa : null, chances, recovered, recoverRate: chances ? recovered / chances : null, recoveredKeys };
}
const kindStats = rs => Object.fromEntries([...groupBy(rs, r => r.kind || '?')].map(([k, v]) => [k, { n: v.length, acc: accOf(v) }]));
const devStats = rs => Object.fromEntries([...groupBy(rs.filter(r => r.dev), r => r.dev)].map(([k, v]) => [k, { n: v.length, acc: accOf(v), short: v.filter(r => r.kind === 'short').length }]));

/** 게임 이벤트 (모드별 행동). 학생 키 → 이름 연결은 기록 players 로 */
function gameEvents(records, nameKeyOf) {
  const out = {
    caught: { n: 0, by: {} }, chest: { n: 0, risky: 0, by: {} }, buy: { n: 0, firstSec: [], items: {}, by: {} },
    reel: { n: 0, perfect: 0, good: 0, miss: 0, by: {} }, claim: { n: 0, enemy: 0, star: 0, by: {} }, item: { n: 0, kinds: {} },
    duel: { n: 0, win: 0, lose: 0, double: 0, ghostWin: 0, ghostLose: 0, ok: 0, ms: [], by: {} }, route: { short: 0, long: 0, auto: 0 },
  };
  const per = (o, sk) => (o.by[sk] ||= {});
  for (const r of records) {
    const start = Date.parse(r.startedAt) || Math.min(...(r.answers || []).map(a => a.t).filter(Boolean), Infinity);
    const name = new Map((r.players || []).map(p => [String(p.pid), p.name]));
    const firstBuy = new Map();
    for (const e of r.events || []) {
      const d = e.data || {}, nm = e.pid != null ? name.get(String(e.pid)) : null, sk = nm ? nameKeyOf(nm) : null;
      switch (e.type) {
        case 'caught': if (sk && d.by !== 'dokkaebi') { out.caught.n++; const o = per(out.caught, sk); o.n = (o.n || 0) + 1; } break;
        case 'chest': { out.chest.n++; if (d.risky) out.chest.risky++; if (sk) { const o = per(out.chest, sk); o.n = (o.n || 0) + 1; if (d.risky) o.risky = (o.risky || 0) + 1; } break; }
        case 'buy': {
          out.buy.n++; const it = String(d.item ?? '?'); out.buy.items[it] = (out.buy.items[it] || 0) + 1;
          if (sk) {
            const o = per(out.buy, sk); o.n = (o.n || 0) + 1; o.items ||= {}; o.items[it] = (o.items[it] || 0) + 1;
            if (!firstBuy.has(sk) && isFinite(start)) { firstBuy.set(sk, 1); const sec = Math.max(0, (e.t - start) / 1000); out.buy.firstSec.push(sec); o.firstSec = sec; }
          }
          break;
        }
        case 'reel': { const q = ['perfect', 'good'].includes(d.quality) ? d.quality : 'miss'; out.reel.n++; out.reel[q]++; if (sk) { const o = per(out.reel, sk); o[q] = (o[q] || 0) + 1; o.n = (o.n || 0) + 1; } break; }
        case 'claim': { out.claim.n++; if (d.enemy) out.claim.enemy++; if (d.star) out.claim.star++; if (sk) { const o = per(out.claim, sk); o.n = (o.n || 0) + 1; if (d.enemy) o.enemy = (o.enemy || 0) + 1; } break; }
        case 'item': { out.item.n++; const k = String(d.kind ?? '?'); out.item.kinds[k] = (out.item.kinds[k] || 0) + 1; break; }
        case 'duel': {
          const oc = ['win', 'lose', 'double', 'ghostWin', 'ghostLose'].includes(d.outcome) ? d.outcome : 'lose';
          out.duel.n++; out.duel[oc]++; if (d.ok) out.duel.ok++; if (Number.isFinite(+d.ms) && +d.ms > 0) out.duel.ms.push(+d.ms);
          if (sk) { const o = per(out.duel, sk); o.n = (o.n || 0) + 1; if (oc === 'win' || oc === 'ghostWin') o.win = (o.win || 0) + 1; }
          break;
        }
        case 'choice': if (d.route === 'short' || d.route === 'long') { out.route[d.route]++; if (d.auto) out.route.auto++; } break;
      }
    }
  }
  out.buy.firstMed = median(out.buy.firstSec); delete out.buy.firstSec;
  out.duel.medMs = median(out.duel.ms); delete out.duel.ms;
  return out;
}

/**
 * 게임 속 학습 행동 분석
 * 반환: { n, quad, quadShare, retry, thirds, flow, skip, kinds, devs, students[], questions[], games, flags }
 */
export function behaviorAnalysis(records, opt = {}) {
  const O = { ...BEHAV, ...opt };
  const ds = opt.ds || mergeSessions(records);
  const rows = ds.rows, med = questionMedians(rows);
  const name = new Map(ds.students.map(s => [s.key, s.name])), qinfo = new Map(ds.questions.map(q => [q.key, q]));
  const seqLists = list => [...groupBy(list, r => r.s).values()].map(l => [...l].sort((a, b) => a.seq - b.seq || a.t - b.t));
  const quad = emptyQuad(); for (const r of rows) addQuad(quad, quadOf(r, med.get(r.qk)));
  const allSeq = [...groupBy(rows, r => `${r.s}\u0001${r.sk}`).values()].map(l => [...l].sort((a, b) => a.seq - b.seq || a.t - b.t));
  const retry = retryStats(rows);
  const thirds = thirdsOf(allSeq);
  const flow = flowStats(allSeq);
  const students = [...groupBy(rows, r => r.sk)].map(([sk, rs]) => {
    const q = emptyQuad(); for (const r of rs) addQuad(q, quadOf(r, med.get(r.qk)));
    const lists = seqLists(rs);
    const th = thirdsOf(lists), fl = flowStats(lists), rt = retryStats(rs);
    const early = [...th[0].n ? [th[0]] : [], ...th[1].n ? [th[1]] : []];
    const earlyN = early.reduce((a, x) => a + x.n, 0), earlyAcc = earlyN ? early.reduce((a, x) => a + x.acc * x.n, 0) / earlyN : null;
    const drop = earlyAcc != null && th[2].n >= 3 ? earlyAcc - th[2].acc : null;
    const qs = shareQuad(q);
    return {
      key: sk, name: name.get(sk) || sk, n: rs.length, acc: accOf(rs), quad: q, quadShare: qs, top: topQuad(q),
      fastWrongFlag: q.n >= O.minAnswers && qs.fastWrong >= O.fastWrong,
      retry: { firstAcc: rt.firstAcc, laterAcc: rt.laterAcc, laterN: rt.laterN, gain: rt.gain, chances: rt.chances, recovered: rt.recovered },
      thirds: th, drop, fatigueFlag: drop != null && drop >= O.fatigueDrop,
      afterWrong: fl.afterWrong, afterWrongN: fl.afterWrongN, longest: fl.longest,
      skip: rs.filter(r => r.skip).length, skipRate: rs.length ? rs.filter(r => r.skip).length / rs.length : 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
  const questions = [...groupBy(rows, r => r.qk)].map(([qk, rs]) => {
    const q = emptyQuad(); for (const r of rs) addQuad(q, quadOf(r, med.get(r.qk)));
    const rt = retryStats(rs), Q = qinfo.get(qk) || {};
    return {
      key: qk, no: Q.no, q: Q.q || '', kind: Q.kind || '', n: rs.length, acc: accOf(rs), medMs: med.get(qk) ?? null, quad: q, quadShare: shareQuad(q),
      skip: rs.filter(r => r.skip).length, skipRate: rs.filter(r => r.skip).length / rs.length,
      retry: { firstAcc: rt.firstAcc, laterAcc: rt.laterAcc, laterN: rt.laterN, gain: rt.gain, chances: rt.chances, recovered: rt.recovered },
      recoveredBy: rt.recoveredKeys.map(k => name.get(k.split('\u0001')[1])).filter(Boolean),
    };
  }).sort((a, b) => (a.no ?? 0) - (b.no ?? 0));
  const games = gameEvents(records, nameKey);
  const skipN = rows.filter(r => r.skip).length;
  return {
    n: rows.length, quad, quadShare: shareQuad(quad), retry: { ...retry, recoveredKeys: undefined }, thirds, flow,
    skip: { n: skipN, rate: rows.length ? skipN / rows.length : 0 },
    overallAcc: accOf(rows), kinds: kindStats(rows), devs: devStats(rows),
    students, questions, games,
    hasTry: rows.some(r => r.try >= 2),
    flags: {
      fastWrong: students.filter(s => s.fastWrongFlag).map(s => s.key),
      fatigue: students.filter(s => s.fatigueFlag).map(s => s.key),
      skip: students.filter(s => s.n >= O.minAnswers && s.skipRate >= 0.2).map(s => s.key),
    },
    opt: O,
  };
}

/** 선생님에게 보여 줄 짧은 해석 + 수업에 쓰는 법 (아이를 낙인찍지 않는 말투) */
export function behaviorInsights(B) {
  const P = x => `${Math.round((x || 0) * 100)}%`, out = [];
  if (!B?.n) return out;
  const qs = B.quadShare;
  out.push({
    id: 'quad', icon: '⏱️', title: '속도와 정확도',
    text: `빠르고 정확한 답이 ${P(qs.fastOk)}, 느리지만 정확한 답이 ${P(qs.slowOk)}예요. 빠르게 틀린 답은 ${P(qs.fastWrong)}${qs.fastWrong >= B.opt.fastWrong ? '로 조금 많은 편이에요' : '예요'}.`,
    hint: qs.fastWrong >= B.opt.fastWrong ? '다음엔 시간 제한을 조금 늘리거나, 답을 고르기 전에 짝에게 ‘이유 먼저 말하기’를 해 보세요.' : '느리지만 정확한 친구들은 생각하는 중이에요. 기다려 주는 시간을 지켜 주세요.',
    level: qs.fastWrong >= B.opt.fastWrong ? 'warn' : 'ok',
  });
  if (B.hasTry && B.retry.laterN) {
    const g = B.retry.gain;
    out.push({
      id: 'retry', icon: '🔁', title: '다시 만난 문제',
      text: `처음 만났을 때 정답률 ${P(B.retry.firstAcc)} → 다시 만났을 때 ${P(B.retry.laterAcc)} (${g >= 0 ? '+' : ''}${Math.round(g * 100)}%p). 처음 틀린 문제 ${B.retry.chances}개 가운데 ${B.retry.recovered}개를 다시 만나 맞혔어요.`,
      hint: g > 0.05 ? '게임 안에서 배우고 있다는 신호예요. 해설을 보는 시간을 계속 넉넉히 주세요.' : '다시 만나도 잘 안 오르는 문제는 해설만으로는 부족해요. 수업에서 예시를 하나 더 보여 주세요.',
      level: g > 0.05 ? 'ok' : 'warn',
    });
  }
  const [a, b, c] = B.thirds;
  if (a.n && c.n) {
    const drop = (a.acc ?? 0) - (c.acc ?? 0);
    out.push({
      id: 'flow', icon: '📈', title: '게임 흐름 (초반·중반·후반)',
      text: `정답률 ${P(a.acc)} → ${P(b.acc)} → ${P(c.acc)}, 중간 응답 시간 ${secText(a.medMs)} → ${secText(b.medMs)} → ${secText(c.medMs)}.${drop >= B.opt.fatigueDrop ? ' 후반에 집중이 조금 떨어진 것 같아요.' : ''}`,
      hint: drop >= B.opt.fatigueDrop ? '게임 시간을 조금 줄이거나, 중간에 1분 몸풀기·쉬는 시간을 넣어 보세요.' : '끝까지 집중이 잘 이어졌어요. 지금 길이가 알맞아요.',
      level: drop >= B.opt.fatigueDrop ? 'warn' : 'ok',
    });
  }
  if (B.flow.afterWrongN >= 5) {
    const lo = B.flow.afterWrong < (B.overallAcc ?? 0) - 0.1;
    out.push({
      id: 'recover', icon: '🌱', title: '틀린 뒤 다시 일어서기',
      text: `틀린 바로 다음 문제의 정답률은 ${P(B.flow.afterWrong)}예요 (전체 ${P(B.overallAcc)}). 가장 긴 연속 정답은 ${B.flow.longest}개예요.`,
      hint: lo ? '틀린 뒤 흔들리는 친구들이 있어요. “틀려도 괜찮아, 해설 보고 다시!”를 자주 말해 주세요.' : '틀려도 금방 다시 맞히는 힘이 있어요. 실수를 배움으로 칭찬해 주세요.',
      level: lo ? 'warn' : 'ok',
    });
  }
  if (B.skip.n) {
    out.push({
      id: 'skip', icon: '⏳', title: '건너뜀 · 시간 초과',
      text: `모든 답의 ${P(B.skip.rate)}가 시간 초과나 빈칸이었어요.${B.flags.skip.length ? ` 20% 넘게 건너뛴 학생이 ${B.flags.skip.length}명 있어요.` : ''}`,
      hint: B.skip.rate >= 0.1 ? '문제 글이 길거나 어려웠을 수 있어요. 글을 짧게 고치거나 시간을 늘려 보세요.' : '대부분 끝까지 답했어요.',
      level: B.skip.rate >= 0.1 ? 'warn' : 'ok',
    });
  }
  const kinds = Object.entries(B.kinds).filter(([k, v]) => KIND_LABEL[k] && v.n >= 5);
  if (kinds.length >= 2) {
    const sorted = [...kinds].sort((x, y) => x[1].acc - y[1].acc);
    out.push({
      id: 'kind', icon: '🔤', title: '문제 모양별',
      text: kinds.map(([k, v]) => `${KIND_LABEL[k]} ${P(v.acc)}`).join(' · ') + '.',
      hint: sorted[0][0] === 'short' ? '단답형이 어려웠어요. 핵심 낱말을 칠판에 적어 두고 써 보는 연습을 해 보세요.' : sorted[0][0] === 'ox' ? 'OX가 오히려 낮아요. 헷갈리는 문장을 함께 고쳐 보며 왜 틀렸는지 말해 보세요.' : `${KIND_LABEL[sorted[0][0]]} 문제가 가장 낮아요. 보기 가운데 그럴듯한 오답을 함께 살펴보세요.`,
      level: 'info',
    });
  }
  const g = B.games, games = [];
  if (g.caught.n) games.push(`무궁화 들킴 ${g.caught.n}번 (${Object.keys(g.caught.by).length}명)`);
  if (g.chest.n) games.push(`보물 상자 위험 결과 ${P(g.chest.risky / g.chest.n)}`);
  if (g.buy.n) games.push(`퀴즈 부자 첫 구매 중간값 ${Math.round(g.buy.firstMed ?? 0)}초`);
  if (g.reel.n) games.push(`낚시 완벽 타이밍 ${P(g.reel.perfect / g.reel.n)}`);
  if (g.claim.n) games.push(`땅따먹기 공격 ${P(g.claim.enemy / g.claim.n)} · 확장 ${P(1 - g.claim.enemy / g.claim.n)}`);
  if (g.duel.n) games.push(`뿅망치 대결 정답 ${P(g.duel.ok / g.duel.n)}`);
  if (g.item.n) games.push(`카트 아이템 ${g.item.n}번`);
  if (g.route.short + g.route.long) games.push(`윷 지름길 ${g.route.short} · 긴 길 ${g.route.long}`);
  if (games.length) out.push({
    id: 'games', icon: '🎮', title: '게임 속 선택', text: games.join(' · ') + '.',
    hint: g.caught.n ? '무궁화에서 자주 들킨 친구는 마음이 급했을 수 있어요. ‘멈추고 생각하기’ 신호를 연습해 보세요.' : '게임 속 선택은 아이들의 마음(조심·도전·서두름)을 보여 줘요. 결과보다 이유를 물어봐 주세요.',
    level: 'info',
  });
  return out;
}

/** 엑셀 '학습행동' 시트 행 */
export function behaviorSheetRows(B, names = n => n) {
  const P = x => (x == null ? '' : Math.round(x * 1000) / 10);
  const sec = ms => (ms == null ? '' : Math.round(ms / 100) / 10);
  const rows = [['게임 속 학습 행동 (빠름/느림 = 문제마다 중간 응답 시간 기준, 건너뜀 제외)'], []];
  rows.push(['4분면', ...QUAD.map(q => `${q.label}(${q.sub})`)], ['답 수', ...QUAD.map(q => B.quad[q.k])], ['비율(%)', ...QUAD.map(q => P(B.quadShare[q.k]))], []);
  rows.push(['다시 만난 문제', '처음 만남 정답률(%)', P(B.retry.firstAcc), '다시 만남 정답률(%)', P(B.retry.laterAcc), '향상(%p)', B.retry.gain == null ? '' : P(B.retry.gain), '처음 틀린 뒤 다시 맞힘', `${B.retry.recovered}/${B.retry.chances}`]);
  rows.push(['게임 흐름', '초반 정답률(%)', P(B.thirds[0].acc), '중반(%)', P(B.thirds[1].acc), '후반(%)', P(B.thirds[2].acc), '중간 시간(초)', [0, 1, 2].map(i => sec(B.thirds[i].medMs)).join(' / ')]);
  rows.push(['오답 뒤', '바로 다음 정답률(%)', P(B.flow.afterWrong), '정답 뒤(%)', P(B.flow.afterOk), '전체(%)', P(B.overallAcc), '가장 긴 연속 정답', B.flow.longest]);
  rows.push(['건너뜀·시간 초과', B.skip.n, '비율(%)', P(B.skip.rate)]);
  rows.push(['문제 모양별(%)', ...Object.entries(B.kinds).filter(([k]) => KIND_LABEL[k]).map(([k, v]) => `${KIND_LABEL[k]} ${P(v.acc)} (${v.n})`)]);
  rows.push(['기기별(%)', ...Object.entries(B.devs).map(([k, v]) => `${DEV_LABEL[k] || k} ${P(v.acc)} (${v.n})`)]);
  rows.push([], ['이름', '응답', '정답률(%)', ...QUAD.map(q => `${q.label}(%)`), '처음 만남(%)', '다시 만남(%)', '다시 맞힘', '초반(%)', '중반(%)', '후반(%)', '오답 뒤(%)', '가장 긴 연속', '건너뜀(%)', '살펴볼 점']);
  for (const s of B.students) rows.push([names(s.name), s.n, P(s.acc), ...QUAD.map(q => P(s.quadShare[q.k])), P(s.retry.firstAcc), P(s.retry.laterAcc), `${s.retry.recovered}/${s.retry.chances}`,
    ...s.thirds.map(t => P(t.acc)), P(s.afterWrong), s.longest, P(s.skipRate),
    [s.fastWrongFlag ? '빠르게 틀림 많음' : '', s.fatigueFlag ? '후반 정답률 떨어짐' : '', s.n >= B.opt.minAnswers && s.skipRate >= 0.2 ? '건너뜀 많음' : ''].filter(Boolean).join(', ')]);
  rows.push([], ['번호', '문항', '응답', '정답률(%)', '중간 시간(초)', ...QUAD.map(q => `${q.label}(%)`), '처음 만남(%)', '다시 만남(%)', '다시 맞힌 학생 수', '건너뜀(%)']);
  for (const q of B.questions) rows.push([q.no, q.q, q.n, P(q.acc), sec(q.medMs), ...QUAD.map(x => P(q.quadShare[x.k])), P(q.retry.firstAcc), P(q.retry.laterAcc), q.retry.recovered, P(q.skipRate)]);
  const g = B.games;
  const gl = [];
  if (g.caught.n) gl.push(['무궁화 들킴', g.caught.n, '학생 수', Object.keys(g.caught.by).length]);
  if (g.chest.n) gl.push(['보물 상자', g.chest.n, '위험 결과', g.chest.risky, '비율(%)', P(g.chest.risky / g.chest.n)]);
  if (g.buy.n) gl.push(['퀴즈 부자 구매', g.buy.n, '첫 구매 중간값(초)', Math.round(g.buy.firstMed ?? 0), '물건', Object.entries(g.buy.items).map(([k, v]) => `${k} ${v}`).join(', ')]);
  if (g.reel.n) gl.push(['낚시 타이밍', g.reel.n, '완벽', g.reel.perfect, '좋음', g.reel.good, '놓침', g.reel.miss]);
  if (g.claim.n) gl.push(['땅따먹기', g.claim.n, '공격', g.claim.enemy, '확장', g.claim.n - g.claim.enemy, '별 칸', g.claim.star]);
  if (g.item.n) gl.push(['카트 아이템', g.item.n, Object.entries(g.item.kinds).map(([k, v]) => `${k} ${v}`).join(', ')]);
  if (g.duel.n) gl.push(['뿅망치 대결', g.duel.n, '이김', g.duel.win + g.duel.ghostWin, '짐', g.duel.lose + g.duel.ghostLose, '무승부', g.duel.double, '중간 시간(초)', sec(g.duel.medMs)]);
  if (g.route.short + g.route.long) gl.push(['윷 갈림길', g.route.short + g.route.long, '지름길', g.route.short, '긴 길', g.route.long]);
  if (gl.length) rows.push([], ['게임별 행동'], ...gl);
  return rows;
}
