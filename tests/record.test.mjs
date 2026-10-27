// node --test tests/record.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import { buildRecord, fileBase, safeName, validateRecord, recordsFromJSON, bundle, liveDraft, listDrafts, draftToRecord, recordToWorkbook, recordsToWorkbook } from '../public/js/record.js';
import {
  mergeSessions, questionStats, studentStats, studentGroups, misconceptions, reteachTop, matrix, cellMark, sessionCompare,
  summary, anonymizer, anonLabel, scrubNames, nameKey, qKey, analysisSheets, studentDetail, NO_ANSWER,
} from '../public/js/stats.js';

const Q = [
  { qid: 0, q: '물이 끓는 온도는?', answers: ['100도'], wrong: ['50도', '0도', '200도'], explain: '', kind: 'mc' },
  { qid: 1, q: '열은 높은 곳에서 낮은 곳으로 이동한다.', answers: ['O'], wrong: [], explain: '', kind: 'ox' },
  { qid: 2, q: '고체에서 열이 이동하는 방법은?', answers: ['전도'], wrong: ['대류', '복사', '단열'], explain: '', kind: 'mc' },
];
const T = Date.UTC(2026, 9, 19, 1, 10);
function rec1() {
  const players = [{ pid: 'a', name: '1 김하늘' }, { pid: 'b', name: '2 이도윤' }, { pid: 'c', name: '3 박서연' }, { pid: 'd', name: '4 최지호' }];
  const L = (pid, name, qid, ok, given, ms, k) => ({ pid, name, qid, ok, given, ms, t: T + k * 1000 });
  const log = [
    L('a', '1 김하늘', 0, true, '100도', 3000, 1), L('b', '2 이도윤', 0, true, '100도', 5000, 2), L('c', '3 박서연', 0, false, '50도', 7000, 3), L('d', '4 최지호', 0, true, '100도', 4000, 4),
    L('a', '1 김하늘', 1, true, 'O', 2000, 5), L('b', '2 이도윤', 1, false, 'X', 6000, 6), L('c', '3 박서연', 1, false, 'X', 8000, 7), L('d', '4 최지호', 1, true, 'O', 3000, 8),
    L('a', '1 김하늘', 2, true, '전도', 2500, 9), L('b', '2 이도윤', 2, false, '대류', 6000, 10), L('c', '3 박서연', 2, false, '대류', 9000, 11), L('d', '4 최지호', 2, false, '대류', 5000, 12),
    L('c', '3 박서연', 2, false, '', 20000, 13),
  ];
  const ranking = [{ pid: 'a', name: '1 김하늘', score: 300, rank: 1 }, { pid: 'd', name: '4 최지호', score: 200, rank: 2 }, { pid: 'b', name: '2 이도윤', score: 100, rank: 3 }, { pid: 'c', name: '3 박서연', score: 0, rank: 4 }];
  return buildRecord({ title: '온도와 열: 진단?', unit: '5학년 과학', mode: 'live', modeName: '골든벨 라이브', settings: { time: 20, bad: { x: 1 } }, questions: Q, players, log, ranking, startedAt: T, endedAt: T + 60000 });
}
function rec2() {
  // 같은 문제(글자 공백 다름), 학생 pid 다름, 이름 띄어쓰기 다름
  const qs = [{ qid: 7, q: '고체에서  열이 이동하는 방법은?', answers: ['전도'], wrong: ['대류', '복사', '단열'], kind: 'mc' }, { qid: 8, q: '새 문제', answers: ['가'], wrong: ['나'], kind: 'mc' }];
  const players = [{ pid: 'x', name: '1김하늘' }, { pid: 'y', name: '3 박서연' }];
  const log = [
    { pid: 'x', name: '1김하늘', qid: 7, ok: true, given: '전도', ms: 2000, t: T + 864e5 * 3 },
    { pid: 'y', name: '3 박서연', qid: 7, ok: true, given: '전도', ms: 4000, t: T + 864e5 * 3 + 1000 },
    { pid: 'y', name: '3 박서연', qid: 8, ok: true, given: '가', ms: 4000, t: T + 864e5 * 3 + 2000 },
  ];
  return buildRecord({ title: '복습', unit: '5학년 과학', mode: 'race', questions: qs, players, log, ranking: [], startedAt: T + 864e5 * 3 });
}

test('buildRecord: 형식과 정리', () => {
  const r = rec1();
  assert.equal(r.app, 'joyful-quiz'); assert.equal(r.v, 1);
  assert.ok(typeof r.id === 'string' && r.id.length >= 16);
  assert.equal(r.questions.length, 3); assert.equal(r.players.length, 4); assert.equal(r.answers.length, 13);
  assert.ok(!('name' in r.answers[0]), 'answers 에는 이름이 없어야 함');
  assert.deepEqual(Object.keys(r.answers[0]).sort(), ['given', 'ms', 'ok', 'pid', 'qid', 't']);
  assert.equal(r.startedAt, new Date(T).toISOString());
  assert.deepEqual(r.settings, { time: 20 }, '객체 설정값은 버림');
  assert.equal(r.ranking[0].rank, 1);
  assert.notEqual(buildRecord({}).id, buildRecord({}).id);
});
test('buildRecord: log 에만 있는 학생도 players 에 추가, 제어문자 제거', () => {
  const r = buildRecord({ title: 'a\u0000b', questions: Q, players: [], log: [{ pid: 9, name: '5 정하윤\n', qid: 0, ok: 1, given: 'x'.repeat(500), ms: '12', t: 1 }] });
  assert.equal(r.title, 'ab');
  assert.deepEqual(r.players, [{ pid: 9, name: '5 정하윤' }]);
  assert.equal(r.answers[0].ok, true); assert.equal(r.answers[0].ms, 12); assert.equal(r.answers[0].given.length, 120);
});
test('fileBase / safeName', () => {
  const r = rec1();
  const d = new Date(T), p = n => String(n).padStart(2, '0');
  assert.equal(fileBase(r), `즐거운퀴즈_온도와 열 진단_${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`);
  assert.equal(safeName('a/b\\c:d*e?f"g<h>i|j'), 'a b c d e f g h i j');
  assert.equal(safeName('  ...  '), '퀴즈');
  assert.equal(safeName('CON'), '_CON');
  assert.equal(safeName('끝에 점...'), '끝에 점');
  assert.ok(!/[<>:"/\\|?*]/.test(fileBase({ title: '<>:"/\\|?*' })));
});
test('validateRecord / recordsFromJSON', () => {
  assert.throws(() => validateRecord({ app: 'other' }), /기록 파일이 아니/);
  assert.throws(() => validateRecord({ app: 'joyful-quiz', v: 99, questions: [], answers: [] }), /새로운 버전/);
  assert.throws(() => validateRecord({ app: 'joyful-quiz', v: 1 }), /망가/);
  const r = rec1();
  const back = validateRecord(JSON.parse(JSON.stringify(r)));
  assert.equal(back.id, r.id); assert.equal(back.answers.length, r.answers.length); assert.equal(back.players[2].name, '3 박서연');
  assert.equal(back.startedAt, r.startedAt);
  const both = recordsFromJSON(JSON.parse(JSON.stringify(bundle([r, rec2()]))));
  assert.equal(both.length, 2);
  // 프로토타입 오염 시도
  const evil = JSON.parse('{"app":"joyful-quiz","v":1,"questions":[],"answers":[],"settings":{"__proto__":{"x":1}}}');
  const ev = validateRecord(evil);
  assert.equal(({}).x, undefined); assert.equal(Object.keys(ev.settings).length, 0);
});

test('mergeSessions: 이름·문제 글자로 합치기', () => {
  const ds = mergeSessions([rec2(), rec1()]); // 순서 섞어도 날짜순
  assert.equal(ds.sessions[0].title, '온도와 열: 진단?');
  assert.equal(ds.sessions[0].mode, 'live');
  assert.equal(ds.questions.length, 4, '같은 문제(공백 차이)는 하나로');
  assert.equal(ds.students.length, 4, '1김하늘 = 1 김하늘');
  assert.equal(ds.rows.length, 16);
  assert.equal(nameKey(' 1 김하늘 '), nameKey('1김하늘'));
  assert.equal(qKey('고체에서  열이 이동하는 방법은?'), qKey('고체에서 열이 이동하는 방법은'));
});
test('questionStats / misconceptions / reteachTop', () => {
  const ds = mergeSessions([rec1()]);
  const qs = questionStats(ds);
  const q2 = qs.find(q => q.no === 3);
  assert.equal(q2.n, 5); assert.equal(q2.correct, 1);
  assert.equal(q2.topWrong.given, '대류'); assert.equal(q2.topWrong.count, 3);
  assert.equal(q2.topWrong.share, 3 / 5); assert.equal(q2.topWrong.shareOfWrong, 3 / 4);
  assert.equal(q2.noAnswer, 1); assert.ok(q2.choices.some(c => c.given === NO_ANSWER));
  assert.equal(q2.avgMs, (2500 + 6000 + 9000 + 5000) / 4, '무응답은 시간 평균에서 뺌');
  const mis = misconceptions(qs);
  assert.deepEqual(mis.map(q => q.no), [3]);
  const top = reteachTop(qs, 3);
  assert.deepEqual(top.map(q => q.no), [3, 2, 1]);
  assert.equal(reteachTop(qs, 3, { maxRate: 0.5 }).length, 1);
});
test('studentStats / studentGroups', () => {
  const ds = mergeSessions([rec1()]);
  const ss = studentStats(ds);
  const a = ss.find(s => s.name === '1 김하늘'), c = ss.find(s => s.name === '3 박서연');
  assert.equal(a.rate, 1); assert.equal(a.n, 3); assert.equal(a.best.rank, 1);
  assert.equal(c.n, 4); assert.equal(c.correct, 0);
  const g = studentGroups(ss, { minAttempts: 3 });
  assert.deepEqual(g.help.map(s => s.name), ['3 박서연', '2 이도윤']);
  assert.deepEqual(g.challenge.map(s => s.name), ['1 김하늘']);
});
test('matrix / studentDetail / summary', () => {
  const ds = mergeSessions([rec1(), rec2()]);
  const mx = matrix(ds);
  const sk = nameKey('3 박서연'), qk = qKey('고체에서 열이 이동하는 방법은?');
  const c = mx.get(sk, qk);
  assert.equal(c.n, 3); assert.equal(c.ok, 1); assert.equal(c.last, true, '마지막(2차시) 응답은 정답');
  assert.equal(cellMark(c), 'O'); assert.equal(cellMark(null), '-');
  assert.equal(cellMark(mx.get(nameKey('2 이도윤'), qk)), 'X');
  const det = studentDetail(ds, sk);
  assert.equal(det.length, 4); assert.equal(det.find(d => d.no === 3).tries.length, 3);
  const sum = summary(ds);
  assert.equal(sum.students, 4); assert.equal(sum.responses, 16); assert.equal(sum.correct, 9);
});
test('sessionCompare: 같은 문제 변화', () => {
  const cmp = sessionCompare(mergeSessions([rec1(), rec2()]));
  assert.equal(cmp.sessions.length, 2);
  assert.equal(cmp.same.length, 1);
  assert.equal(cmp.same[0].first.rate, 1 / 5); assert.equal(cmp.same[0].last.rate, 1);
  assert.equal(cmp.students.length, 2);
});
test('anonymize', () => {
  assert.equal(anonLabel(0), '학생 A'); assert.equal(anonLabel(25), '학생 Z'); assert.equal(anonLabel(26), '학생 AA');
  const an = anonymizer(['1 김하늘', '2 이도윤']);
  assert.equal(an('1김하늘'), '학생 A'); assert.equal(an('2 이도윤'), '학생 B');
  assert.equal(scrubNames('1 김하늘과 2 이도윤', ['1 김하늘', '2 이도윤'], an), '학생 A과 학생 B');
});
test('analysisSheets: 시트 이름과 머리줄', () => {
  const sh = analysisSheets([rec1()]);
  assert.deepEqual(sh.map(s => s.name), ['요약', '문항분석', '학생분석', '학생x문항', '응답원자료']);
  assert.deepEqual(sh[1].rows[0].slice(0, 4), ['번호', '문항', '정답', '응답 수']);
  assert.equal(sh[3].rows.length, 2 + 4);
  assert.deepEqual(sh[3].rows[2], ['1 김하늘', 'O', 'O', 'O', 100]);
  const multi = analysisSheets([rec1(), rec2()]);
  assert.ok(multi.some(s => s.name === '차시비교'));
});
// 브라우저는 public/vendor/xlsx.full.min.js(전역 XLSX), Node 테스트는 같은 판의 node_modules/xlsx 를 쓴다
const require = createRequire(import.meta.url);
let XLSXlib = null; try { XLSXlib = require('xlsx'); } catch {}
test('recordToWorkbook (SheetJS 있으면)', { skip: !XLSXlib && 'node_modules/xlsx 없음' }, () => {
  globalThis.XLSX = XLSXlib;
  const wb = recordToWorkbook(rec1());
  assert.deepEqual(wb.SheetNames, ['요약', '문항분석', '학생분석', '학생x문항', '응답원자료', '_기록원본']);
  assert.equal(wb.Workbook.Sheets[5].Hidden, 1);
  // 엑셀 → 다시 기록 (숨김 시트)
  const bytes = globalThis.XLSX.write(recordsToWorkbook([rec1(), rec2()]), { bookType: 'xlsx', type: 'array' });
  const wb2 = globalThis.XLSX.read(bytes, { type: 'array' });
  const rows = globalThis.XLSX.utils.sheet_to_json(wb2.Sheets._기록원본, { header: 1 });
  const back = recordsFromJSON(JSON.parse(rows.slice(1).map(r => r[0]).join('')));
  assert.equal(back.length, 2);
});
test('liveDraft (localStorage 흉내)', () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size; } };
  assert.equal(liveDraft.load(), null);
  const r = rec1();
  assert.equal(liveDraft.save(r), true);
  assert.equal(liveDraft.save({ ...r, id: 'other-id' }), true, '같은 게임은 id 가 바뀌어도 한 칸');
  assert.equal(listDrafts().length, 1);
  assert.equal(liveDraft.load().title, r.title);
  // 새 게임 (응답 수가 줄어듦) → 앞 게임은 따로 보관
  liveDraft.save({ ...rec2(), title: r.title });
  assert.equal(listDrafts().length, 2);
  const rec = draftToRecord(listDrafts().find(d => d.id !== 'live').data);
  assert.equal(rec.answers.length, 13);
  liveDraft.clear();
  assert.equal(liveDraft.load(), null);
  assert.equal(listDrafts().length, 1);
  delete globalThis.localStorage;
});

// ---------- 모둠 협력 ----------
import { gini, balanceIndex, hasCoop, coopSession, coopAnalysis, coopSheetRows, resultText, extraText, COOP } from '../public/js/stats.js';
function coopRec() {
  const teams = [{ id: 'cheong', name: '청룡', color: '#3D8BFF' }, { id: 'ju', name: '주작', color: '#FF6F61' }];
  const players = [
    { pid: 'a', name: '1 가', team: 0 }, { pid: 'b', name: '2 나', team: 0 }, { pid: 'c', name: '3 다', team: 0 }, { pid: 'd', name: '4 라', team: 0 },
    { pid: 'e', name: '5 마', team: 1 }, { pid: 'f', name: '6 바', team: 1 }, { pid: 'g', name: '7 사', team: 1 }, { pid: 'h', name: '8 아', team: 1 },
  ];
  // 청룡: a 가 독주(6/10), d 는 기여 0 / 주작: 고르게 3,3,3,3
  const contrib = { a: 6, b: 2, c: 2, d: 0, e: 3, f: 3, g: 3, h: 3 };
  const ranking = players.map(p => ({ pid: p.pid, name: p.name, score: contrib[p.pid], rank: 0, extra: { noRank: true, team: p.team, contrib: contrib[p.pid], classWin: true } }));
  const log = players.flatMap((p, i) => [{ pid: p.pid, name: p.name, qid: 0, ok: contrib[p.pid] > 0, given: 'x', ms: 3000, t: T + i }]);
  const E = (type, pid, team, data, dt = 0) => ({ t: T + 1000 + dt, type, pid, team, data });
  const events = [
    E('shared', null, 0, { distinct: 3, need: 3, all: 4 }), E('shared', null, 0, { distinct: 1, need: 3, all: 4 }), E('shared', null, 1, { distinct: 4, need: 3, all: 4 }),
    E('help', 'e', 1, { toTeam: 0 }), E('choice', null, 0, { route: '버티기', refused: true }), E('choice', null, 0, { route: '버티기', refused: false }), E('choice', null, 1, { route: '영차 박자' }),
    E('role', 'a', 0, { role: '기수' }), E('role', 'b', 0, { role: '기수' }), E('teamGoal', null, 1, {}), E('caught', 'c', null, {}),
    E('reflect', 'a', 0, { v: 'great' }), E('reflect', 'd', 0, { v: 'next' }), E('reflect', 'e', 1, { v: 'good' }), E('reflect', 'e', 1, { v: 'good' }),
    E('alert', 'a', 0, { kind: 'dominance' }), E('alert', 'd', 0, { kind: 'lowShare' }), E('alert', null, 1, { kind: 'stuck' }),
    E('teacher', null, 0, { action: 'visit', kind: 'dominance', delay: 30000 }), E('teacher', null, 0, { action: 'visit', kind: 'lowShare', delay: 60000 }),
  ];
  return buildRecord({ title: '줄다리기', mode: 'tug', modeName: '다 함께 줄다리기', questions: Q, players, log, ranking, startedAt: T, teams, events });
}
test('gini / balanceIndex', () => {
  assert.equal(gini([3, 3, 3, 3]), 0);
  assert.equal(gini([0, 0, 0, 0]), null);
  assert.equal(gini([0, 0, 0, 8]), 0.75);
  assert.equal(balanceIndex([5, 5]), 1);
  assert.ok(Math.abs(balanceIndex([6, 2, 2, 0]) - 0.55) < 1e-9);
});
test('hasCoop: 예전 기록은 협력 없음', () => {
  assert.equal(hasCoop(rec1()), false);
  assert.equal(hasCoop(coopRec()), true);
  assert.equal(coopAnalysis([rec1(), rec2()]).sessions.length, 0);
  assert.ok(!analysisSheets([rec1()]).some(s => s.name === '모둠협력'));
});
test('coopSession: 모둠별 형평성·공동 진행·도움·작전·성찰', () => {
  const s = coopSession(coopRec());
  assert.equal(s.metric, 'contrib'); assert.equal(s.teams.length, 2);
  const [a, b] = s.teams;
  assert.equal(a.name, '청룡'); assert.equal(a.size, 4); assert.equal(a.contrib, 10);
  assert.equal(a.maxShare, 0.6); assert.equal(a.maxMember, '1 가'); assert.equal(a.dom, true);
  assert.equal(a.zero, 1); assert.equal(a.low, 1, '기여 0명도 기여 적음');
  assert.ok(Math.abs(a.balance - 0.55) < 1e-9);
  assert.deepEqual(a.members.map(m => [m.dom, m.zero]), [[true, false], [false, false], [false, false], [false, true]]);
  assert.equal(b.dom, false); assert.equal(b.zero, 0); assert.equal(b.balance, 1); assert.equal(b.maxShare, 0.25);
  assert.equal(a.shared.n, 2); assert.equal(a.shared.meanDistinct, 2); assert.equal(a.shared.meanNeed, 3);
  assert.deepEqual(a.help, { given: 0, received: 1 }); assert.deepEqual(b.help, { given: 1, received: 0 });
  assert.deepEqual(a.routes, { 버티기: 2 }); assert.equal(a.refusals, 1); assert.equal(b.goals, 1);
  assert.equal(a.caught, 1, 'caught 는 학생의 모둠으로'); assert.equal(a.roleHolders, 2);
  assert.deepEqual(a.reflect, { great: 1, good: 0, little: 0, next: 1 });
  assert.equal(s.reflectN, 3, '같은 학생의 성찰은 한 번만');
  assert.equal(s.classWin, true);
  assert.deepEqual(s.alerts, { total: 3, byKind: { dominance: 1, lowShare: 1, stuck: 1 } });
  assert.equal(s.acks.n, 2); assert.equal(s.acks.meanDelay, 45000); assert.equal(s.acks.byKind.lowShare.mean, 60000);
});
test('coopSession: 기준값 바꾸기, 정답 수로 대신 (contrib 없음)', () => {
  const r = coopRec();
  assert.equal(coopSession(r, { dominance: 0.7 }).teams[0].dom, false);
  r.ranking = [];
  const s = coopSession(r);
  assert.equal(s.metric, 'correct'); assert.equal(s.teams[0].contrib, 3); assert.equal(s.classWin, null);
});
test('coopAnalysis / 엑셀 시트', () => {
  const c = coopAnalysis([rec1(), coopRec()]);
  assert.equal(c.sessions.length, 1);
  assert.deepEqual(c.classWin, { won: 1, known: 1, total: 1 });
  assert.equal(c.alerts.total, 3); assert.deepEqual(c.alerts.perSession, [3]);
  assert.equal(c.acks.meanDelay, 45000);
  assert.deepEqual(c.flagged, { dom: 1, zero: 1, low: 1 });
  assert.equal(c.reflectByTeam.find(t => t.name === '주작').good, 1);
  const rows = coopSheetRows(c);
  assert.ok(rows.some(r => r[0] === '청룡' && r[1] === 4));
  assert.ok(rows.some(r => r[1] === '1 가' && r[6] === '독주'));
  assert.ok(analysisSheets([rec1(), coopRec()]).some(s => s.name === '모둠협력'));
  assert.equal(COOP.lowShare, 0.15); assert.equal(COOP.dominance, 0.5);
});
test('resultText / extraText', () => {
  assert.equal(resultText({ rank: 2, score: 300 }), '2위/300점');
  assert.equal(resultText({ rank: 0, score: 6, extra: { noRank: true, contrib: 6, share: 0.6 } }), '기여 6 (모둠의 60%)');
  assert.equal(extraText('3바퀴'), '3바퀴');
  assert.equal(extraText({ noRank: true, teamName: '청룡', contrib: 3, kg: 12 }), '청룡, kg 12');
});
test('샘플 3 (줄다리기): 독주 1명·기여 0명 1명', () => {
  const r = recordsFromJSON(JSON.parse(fs.readFileSync(new URL('../public/samples/sample-record-3.json', import.meta.url), 'utf8')))[0];
  const c = coopAnalysis([r]);
  assert.equal(c.sessions[0].teams.length, 6);
  assert.equal(c.flagged.dom, 1); assert.equal(c.flagged.zero, 1);
  assert.ok(c.alerts.total >= 4 && c.alerts.total <= 12, '차시당 알림 12건 이하');
});
