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
    for (const a of r.answers || []) {
      const qk = qByQid.get(String(a.qid)), sk = sByPid.get(String(a.pid));
      if (!qk || !sk) continue;
      rows.push({ s: s.idx, sk, qk, ok: !!a.ok, given: a.given ?? '', ms: isFinite(a.ms) ? +a.ms : null, t: +a.t || 0 });
    }
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
