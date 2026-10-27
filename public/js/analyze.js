// 분석실: 기록 파일을 이 브라우저에서만 열어 분석한다 (서버로 아무것도 보내지 않음)
import { $, $$, esc, h, toast, store } from './common.js';
import {
  readRecordFile, recordsFromJSON, validateRecord, folderInfo, chooseFolder, listFolderRecords, saveFiles, saveRecord,
  recordsToWorkbook, workbookBytes, XLSX_MIME, bundle, safeName, listDrafts, draftToRecord, liveDraft,
} from './record.js';
import {
  analyze, studentDetail, anonymizer, scrubNames, modeLabel, MODE_INFO, dateText, secText, NO_ANSWER, sortSessions,
  coopAnalysis, COOP, REFLECT, ALERT_KIND, resultText, extraText,
} from './stats.js';

// ---------- 상태 ----------
const S = {
  recs: new Map(),      // id → record
  off: new Set(),       // 빼 둔 기록 id
  hide: false,          // 화면에서 이름 가리기
  qSort: 'low', sSort: 'name', hSort: 'name', coopIdx: -1,
  openQ: new Set(),     // 펼친 문항
  A: null,              // 분석 결과
};
const C = { lo: '#eb6834', hi: '#2a78d6', other: '#9aa0bf', grid: '#e4e6f5', base: '#c8cbe4', ink: '#1d2140', ink2: '#6b7099', first: '#a3a6c2', last: '#5b3bd6', track: '#f0f0f8' };
const P = r => `${Math.round(r * 100)}%`;
const fmtN = n => Number(n || 0).toLocaleString('ko-KR');
const shortDate = iso => { const d = new Date(iso); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()}`; };
const cut = (s, n) => { const a = [...String(s)]; return a.length > n ? a.slice(0, n - 1).join('') + '…' : String(s); };
let anon = n => n;               // 화면용 이름 바꾸기
const nm = name => (S.hide ? anon(name) : name);

// ---------- 기록 넣기 ----------
function addRecords(list, from = '') {
  let added = 0, dup = 0;
  for (const r of list) {
    if (S.recs.has(r.id)) { dup++; continue; }
    S.recs.set(r.id, r); added++;
  }
  if (added) toast(`📄 기록 ${added}개를 열었어요${from ? ` (${from})` : ''}`);
  else if (dup) toast('이미 열려 있는 기록이에요');
  render();
  if (added) setTimeout(() => $('#report').scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
}
async function openFiles(files) {
  const ok = [], bad = [];
  for (const f of [...files].slice(0, 60)) {
    try { ok.push(...(await readRecordFile(f))); } catch (e) { bad.push(`${f.name}: ${e.message}`); }
  }
  if (bad.length) toast(`⚠️ 열지 못한 파일 ${bad.length}개 — ${bad[0]}`, 4200);
  if (ok.length) addRecords(ok);
}
async function openSamples() {
  try {
    const list = [];
    for (const n of [1, 2, 3]) {
      const res = await fetch(`samples/sample-record-${n}.json`, { cache: 'no-store' }); // 이 앱에 들어 있는 예시 파일
      if (!res.ok) throw new Error('예시 파일이 없어요');
      list.push(...recordsFromJSON(await res.json()));
    }
    addRecords(list, '예시');
  } catch (e) { toast('예시 기록을 불러오지 못했어요: ' + e.message, 3500); }
}
// 선생님 화면에서 방금 끝난 기록 (analyze.html?from=last)
function openLast() {
  if (new URLSearchParams(location.search).get('from') !== 'last') return;
  try {
    const raw = localStorage.getItem('jq_last_record');
    if (!raw) return toast('방금 끝난 퀴즈 기록을 찾지 못했어요. 저장된 파일을 열어 주세요.', 3500);
    addRecords([validateRecord(JSON.parse(raw))], '방금 끝난 퀴즈');
  } catch (e) { toast('방금 끝난 기록을 열지 못했어요: ' + e.message, 3500); }
  history.replaceState(null, '', location.pathname);
}

// ---------- 폴더 ----------
async function refreshFolderNote() {
  const info = await folderInfo();
  const note = $('#folder-note'), b1 = $('#btn-folder'), b2 = $('#btn-folder2');
  if (!info.supported) {
    note.textContent = '📁 폴더 연결은 크롬·엣지(컴퓨터)에서만 쓸 수 있어요. 다른 브라우저에서는 ‘기록 파일 열기’를 눌러 주세요.';
    b1.disabled = true; b2.hidden = true; return;
  }
  b2.hidden = !info.name;
  note.textContent = info.name ? `💾 연결한 기록 폴더: ${info.name}` : '💡 선생님 화면에서 ‘기록 폴더’를 연결해 두면, 여기서 한 번에 불러올 수 있어요.';
  b1.textContent = info.name ? `📁 ‘${cut(info.name, 14)}’ 폴더에서 불러오기` : '📁 기록 폴더 연결하고 불러오기';
}
async function fromFolder() {
  let info = await folderInfo();
  if (!info.name) {
    const r = await chooseFolder();
    if (!r.ok) { if (r.reason !== 'cancel') toast('폴더를 연결하지 못했어요'); return; }
    info = await folderInfo(); refreshFolderNote();
  }
  const res = await listFolderRecords({ ask: true });
  if (!res.ok) return toast(res.reason === 'denied' ? '폴더를 열 권한이 없어요. 다시 눌러 ‘허용’을 골라 주세요.' : '연결한 폴더가 없어요');
  const files = res.files;
  const body = $('#folder-body');
  $('#folder-title').textContent = `📁 ‘${res.name}’ 폴더의 기록`;
  if (!files.length) body.innerHTML = '<p class="an-empty">이 폴더에는 아직 기록 파일이 없어요.</p>';
  else {
    body.innerHTML = `<p class="small muted sys">열 기록을 골라 주세요. (엑셀 파일은 같은 기록이 겹칠 수 있어 처음엔 빼 두었어요)</p>
      <div class="row an-tools"><button class="btn sm ghost" id="f-all" type="button">모두 고르기</button><button class="btn sm ghost" id="f-none" type="button">모두 빼기</button></div>
      <div class="an-flist">${files.map((f, i) => `<label class="an-fitem"><input type="checkbox" value="${i}" ${/\.json$/i.test(f.name) ? 'checked' : ''}>
        <span class="grow">${/\.xlsx$/i.test(f.name) ? '📗' : '📄'} ${esc(f.name)}</span><small class="sys muted">${esc(dateText(new Date(f.lastModified).toISOString()))}</small></label>`).join('')}</div>
      <div class="row an-tools"><span class="grow"></span><button class="btn y big" id="f-open" type="button">📂 고른 기록 열기</button></div>`;
    $('#f-all').onclick = () => $$('.an-fitem input', body).forEach(c => { c.checked = true; });
    $('#f-none').onclick = () => $$('.an-fitem input', body).forEach(c => { c.checked = false; });
    $('#f-open').onclick = async () => {
      const pick = $$('.an-fitem input:checked', body).map(c => files[+c.value].file);
      closeModal($('#folder-modal'));
      if (pick.length) await openFiles(pick);
    };
  }
  openModal($('#folder-modal'));
}

// ---------- 임시 기록 (게임 중 새로고침 등으로 저장 못 한 기록) ----------
function renderDrafts() {
  const box = $('#drafts'), list = listDrafts().filter(d => d.answers > 0);
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="an-draft"><h3>🧯 아직 파일로 저장하지 않은 퀴즈 기록이 있어요</h3>
    <p class="small muted sys">게임 중에 이 컴퓨터에 잠깐 보관해 둔 기록이에요. 게임이 아직 진행 중이면 그대로 두세요.</p>
    ${list.map(d => `<div class="an-ditem" data-id="${esc(d.id)}"><span class="grow">📝 <b>${esc(d.title)}</b> <small class="sys muted">${esc(dateText(new Date(d.savedAt).toISOString()))} · 응답 ${fmtN(d.answers)}개</small></span>
      <button class="btn sm ghost" data-act="open" type="button">👀 열어 보기</button><button class="btn sm g" data-act="save" type="button">💾 파일로 저장</button><button class="btn sm ghost" data-act="del" type="button">🗑️ 지우기</button></div>`).join('')}</div>`;
  $$('.an-ditem', box).forEach(row => {
    const d = list.find(x => x.id === row.dataset.id);
    row.onclick = async e => {
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
      if (act === 'open') { try { addRecords([draftToRecord(d.data)], '임시 기록'); } catch (err) { toast(err.message); } }
      if (act === 'save') {
        try { const r = await saveRecord(draftToRecord(d.data)); toast(r.where === 'folder' ? `💾 ‘${r.folderName}’ 폴더에 저장했어요` : '📥 내려받기로 저장했어요'); }
        catch (err) { toast('저장하지 못했어요: ' + err.message); }
      }
      if (act === 'del' && confirm('이 임시 기록을 지울까요? (게임이 진행 중이면 지우지 마세요)')) { liveDraft.clear(d.id); renderDrafts(); }
    };
  });
}

// ---------- 그리기 ----------
function active() { return sortSessions([...S.recs.values()]).filter(r => !S.off.has(r.id)); }

function render() {
  const has = S.recs.size > 0;
  $('#report').hidden = !has;
  $('#open-card').classList.toggle('compact', has);
  $('#plan-empty').hidden = has;
  renderSessions();
  const recs = active();
  if (!has) { S.A = null; return; }
  if (!recs.length) {
    S.A = null;
    for (const id of ['#sec-summary', '#sec-top', '#q-list', '#s-groups', '#s-scatter', '#s-table', '#heat', '#sec-cmp', '#sec-coop']) $(id).innerHTML = '';
    S.C = null; $('#sec-coop').hidden = true; $('#nav-coop').hidden = true;
    $('#sec-summary').innerHTML = '<div class="card an-empty">✅ 위 목록에서 분석할 기록을 하나 이상 골라 주세요.</div>';
    return;
  }
  S.A = analyze(recs);
  S.C = coopAnalysis(recs);
  anon = anonymizer([...S.A.ds.students].map(s => s.name).sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })));
  renderSummary(); renderTop(); renderQuestions(); renderStudents(); renderHeat(); renderCompare(); renderCoop(); renderAiTypes();
}

function renderSessions() {
  const list = sortSessions([...S.recs.values()]);
  $('#ses-count').textContent = `${list.length}개 · 분석에 ${list.filter(r => !S.off.has(r.id)).length}개`;
  $('#ses-list').innerHTML = list.map((r, i) => {
    const on = !S.off.has(r.id), n = new Set(r.answers.map(a => String(a.pid))).size;
    return `<div class="an-ses ${on ? '' : 'off'}" data-id="${esc(r.id)}">
      <label class="an-ses-main"><input type="checkbox" ${on ? 'checked' : ''} aria-label="분석에 넣기">
        <span class="an-ses-no">${i + 1}</span>
        <span class="an-ses-t"><b>${esc(r.title)}</b><small class="sys">${esc(dateText(r.startedAt))} · ${esc(modeLabel(r))}${r.unit ? ' · ' + esc(r.unit) : ''}</small></span></label>
      <span class="badge">${n}명 · ${r.questions.length}문제 · 응답 ${fmtN(r.answers.length)}</span>
      <button class="btn sm ghost" data-rm type="button" aria-label="이 기록 닫기">✕</button></div>`;
  }).join('');
  $$('.an-ses').forEach(row => {
    const id = row.dataset.id;
    $('input', row).onchange = e => { e.target.checked ? S.off.delete(id) : S.off.add(id); render(); };
    $('[data-rm]', row).onclick = () => { S.recs.delete(id); S.off.delete(id); render(); };
  });
}

function renderSummary() {
  const s = S.A.sum;
  const tile = (ico, label, val, unit, extra = '') => `<div class="an-tile"><div class="an-tile-ico" aria-hidden="true">${ico}</div><div class="an-tile-l">${label}</div><div class="an-tile-v">${val}<small>${unit}</small></div>${extra}</div>`;
  const meter = `<svg class="an-meter" width="100%" height="10" role="img" aria-label="전체 정답률 ${P(s.rate)}"><rect width="100%" height="10" rx="5" fill="${C.track}"/><rect width="${Math.max(0.5, s.rate * 100)}%" height="10" rx="5" fill="${C.hi}"/></svg>`;
  $('#sec-summary').innerHTML = [
    tile('🧒', '참여 학생', fmtN(s.students), '명'),
    tile('❓', '문항 수', fmtN(s.questions), '개'),
    tile('✅', '전체 정답률', Math.round(s.rate * 100), '%', meter),
    tile('⏱️', '평균 응답 시간', s.avgMs == null ? '-' : (s.avgMs / 1000).toFixed(1), '초'),
    tile('✍️', '응답 수', fmtN(s.responses), '개'),
  ].join('');
}

function renderTop() {
  const { top, mis } = S.A;
  const box = $('#sec-top');
  const misc = mis.filter(q => !top.includes(q)).slice(0, 4);
  box.innerHTML = `<h2>🔁 다시 가르칠 문제 TOP 3</h2>
    ${top.length ? `<div class="an-top3">${top.map((q, i) => `<button class="an-t3" data-q="${esc(q.key)}" type="button">
      <span class="an-t3-rank">${['🥇', '🥈', '🥉'][i]}</span>
      <span class="an-t3-rate">${P(q.rate)}<small>정답률</small></span>
      <span class="an-t3-q">${q.no}. ${esc(q.q)}</span>
      <span class="an-t3-a">✅ 정답: ${esc(q.answer)}</span>
      ${q.topWrong ? `<span class="an-t3-w">🤔 많이 고른 답: <b>${esc(q.topWrong.given)}</b> (${P(q.topWrong.share)})</span>` : ''}</button>`).join('')}</div>`
      : '<p class="an-empty">🎉 정답률이 80%보다 낮은 문제가 없어요. 모두 잘 알고 있어요!</p>'}
    ${misc.length ? `<h3>🤔 그 밖의 오개념 후보</h3><ul class="an-mis">${misc.map(q => `<li><button class="linkish" data-q="${esc(q.key)}" type="button">${q.no}. ${esc(cut(q.q, 46))}</button> → <b>“${esc(q.topWrong.given)}”</b> ${P(q.topWrong.share)}가 골랐어요</li>`).join('')}</ul>` : ''}
    <div class="row an-tools"><span class="grow"></span><button class="btn v" data-ai="lesson" type="button">🤖 이 문제들로 다음 차시 수업 설계 프롬프트 만들기</button></div>`;
  $$('[data-q]', box).forEach(b => b.onclick = () => jumpQuestion(b.dataset.q));
}
function jumpQuestion(key) {
  S.openQ.add(key); renderQuestions();
  const el = $(`.qrow[data-key="${CSS.escape(key)}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); el?.classList.add('flash'); setTimeout(() => el?.classList.remove('flash'), 1400);
}

// 정답률 막대 (SVG, 끝만 둥글게)
function bar(r, color, label) {
  const w = Math.max(0, Math.min(1, r)) * 100;
  return `<svg class="an-bar" width="100%" height="16" role="img" aria-label="${esc(label)}"><rect width="100%" height="16" rx="4" fill="${C.track}"/>${w > 0 ? `<rect width="${w}%" height="16" rx="4" fill="${color}"/><rect width="${Math.min(w, 2)}%" height="16" fill="${color}"/>` : ''}</svg>`;
}

function renderQuestions() {
  const { qs, top, mis, ds } = S.A;
  const multi = ds.sessions.length > 1;
  const list = [...qs].filter(q => q.n > 0);
  if (S.qSort === 'low') list.sort((a, b) => a.rate - b.rate || a.no - b.no); else list.sort((a, b) => a.no - b.no);
  const unanswered = qs.filter(q => q.n === 0);
  $('#q-list').innerHTML = list.map(q => {
    const isTop = top.includes(q), isMis = mis.includes(q), open = S.openQ.has(q.key);
    const color = q.rate < 0.5 ? C.lo : C.hi;
    const tip = `${q.no}번 정답률 ${P(q.rate)} (${q.correct}/${q.n})\n평균 ${secText(q.avgMs)}${q.topWrong ? `\n많이 고른 오답: ${q.topWrong.given} ${P(q.topWrong.share)}` : ''}`;
    let detail = '';
    if (open) {
      const maxC = Math.max(...q.choices.map(c => c.count), 1);
      // 마지막 답이 틀린 학생 (여러 번 푼 경우 마지막 기준)
      const uniqWrong = ds.students.filter(st => { const c = S.A.mx.get(st.key, q.key); return c && !c.last; }).map(st => st.name);
      const per = multi ? ds.sessions.map(s => { const rs = ds.rows.filter(r => r.qk === q.key && r.s === s.idx); return rs.length ? `${s.idx + 1}번 기록 ${P(rs.filter(r => r.ok).length / rs.length)}` : null; }).filter(Boolean) : [];
      detail = `<div class="qdetail">
        <div class="qd-h">학생들이 고른 답 <small class="sys muted">(응답 ${q.n}개)</small></div>
        <div class="qd-dist">${q.choices.map(c => `<div class="qd-row ${c.ok ? 'ok' : ''}"><span class="qd-g">${c.ok ? '✅' : c.given === NO_ANSWER ? '⌛' : '❌'} ${esc(c.given)}</span>
          ${bar(c.count / maxC, c.ok ? C.hi : c.given === NO_ANSWER ? C.other : C.lo, `${c.given} ${c.count}명`)}<span class="qd-c">${c.count}<small>(${P(c.count / q.n)})</small></span></div>`).join('')}</div>
        ${q.explain ? `<p class="qd-ex">💡 ${esc(q.explain)}</p>` : ''}
        ${per.length ? `<p class="small sys">📈 기록별 정답률: ${esc(per.join(' → '))}</p>` : ''}
        ${uniqWrong.length ? `<p class="small sys"><b>마지막 답이 틀린 학생 ${uniqWrong.length}명:</b> ${uniqWrong.sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })).map(n => `<button class="linkish" data-stu="${esc(n)}" type="button">${esc(nm(n))}</button>`).join(', ')}</p>` : ''}
      </div>`;
    }
    return `<div class="qrow ${open ? 'open' : ''}" data-key="${esc(q.key)}">
      <button class="qhead" type="button" aria-expanded="${open}" data-tip="${esc(tip)}">
        <span class="qno">${q.no}</span>
        <span class="qtxt">${esc(q.q)}${isTop ? ' <span class="badge r">🔁 다시 가르치기</span>' : ''}<small class="sys">정답: ${esc(q.answer)}</small></span>
        <span class="qbar">${bar(q.rate, color, `정답률 ${P(q.rate)}`)}<b class="qrate">${P(q.rate)}</b></span>
        <span class="qmis">${q.topWrong ? `<span class="${isMis ? 'mis-on' : ''}">${isMis ? '🤔 오개념 후보' : '많이 고른 오답'}<b>${esc(cut(q.topWrong.given, 22))}</b><small>${P(q.topWrong.share)}</small></span>` : '<span class="muted">—</span>'}</span>
        <span class="qtime">⏱️ ${secText(q.avgMs)}</span>
      </button>${detail}</div>`;
  }).join('') + (unanswered.length ? `<p class="small muted sys">아무도 풀지 않은 문제 ${unanswered.length}개: ${unanswered.map(q => q.no + '번').join(', ')}</p>` : '');
  $$('.qrow').forEach(row => {
    $('.qhead', row).onclick = () => { const k = row.dataset.key; S.openQ.has(k) ? S.openQ.delete(k) : S.openQ.add(k); renderQuestions(); };
    $$('[data-stu]', row).forEach(b => b.onclick = () => openStudent(b.dataset.stu));
  });
}

function renderStudents() {
  const { ss, groups } = S.A;
  const person = s => `<button class="an-pchip" data-stu="${esc(s.name)}" type="button">${esc(nm(s.name))}<small>${P(s.rate)} · ${s.n}개 · ${secText(s.avgMs)}</small></button>`;
  $('#s-groups').innerHTML = `
    <div class="an-group help"><h3>🤝 도움이 필요한 학생 <span class="badge">${groups.help.length}명</span></h3>
      <p class="small sys muted">정답률 60%보다 낮아요 (응답 ${groups.minAttempts}개 이상). 짝 활동이나 짧은 개별 도움을 추천해요.</p>
      <div class="an-pchips">${groups.help.length ? groups.help.map(person).join('') : '<span class="muted small">해당하는 학생이 없어요 👏</span>'}</div></div>
    <div class="an-group chal"><h3>🚀 도전 과제를 줄 학생 <span class="badge">${groups.challenge.length}명</span></h3>
      <p class="small sys muted">정답률 85% 이상이면서 반 평균보다 빨리 풀었어요. 심화 문제나 ‘또래 선생님’ 역할을 맡겨 보세요.</p>
      <div class="an-pchips">${groups.challenge.length ? groups.challenge.map(person).join('') : '<span class="muted small">해당하는 학생이 없어요</span>'}</div></div>
    ${groups.few.length ? `<p class="small sys muted an-few">ℹ️ 응답이 ${groups.minAttempts}개보다 적어 판단을 미룬 학생: ${groups.few.map(s => esc(nm(s.name))).join(', ')}</p>` : ''}`;
  $$('#s-groups [data-stu]').forEach(b => b.onclick = () => openStudent(b.dataset.stu));
  renderScatter();
  // 표
  const list = [...ss];
  const byName = (a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true });
  const sorters = { name: byName, low: (a, b) => (a.n ? a.rate : 2) - (b.n ? b.rate : 2) || byName(a, b), high: (a, b) => b.rate - a.rate || byName(a, b), fast: (a, b) => (a.avgMs ?? 1e9) - (b.avgMs ?? 1e9) };
  list.sort(sorters[S.sSort]);
  if (S.hide && S.sSort === 'name') list.sort((a, b) => nm(a.name).localeCompare(nm(b.name), 'ko', { numeric: true }));
  const help = new Set(groups.help.map(s => s.key)), chal = new Set(groups.challenge.map(s => s.key));
  const res = s => (s.results.length ? s.results.map(r => esc(resultText(r))).join(' · ') : '-');
  $('#s-table').innerHTML = `<thead><tr><th>이름</th><th class="num">응답</th><th class="num">정답</th><th class="an-colbar">정답률</th><th class="num">평균 시간</th><th>순위 · 점수 · 기여</th></tr></thead>
    <tbody>${list.map(s => `<tr>
      <td><button class="linkish an-sname" data-stu="${esc(s.name)}" type="button">${esc(nm(s.name))}</button>${help.has(s.key) ? ' <span class="badge p" title="도움이 필요한 학생">🤝</span>' : ''}${chal.has(s.key) ? ' <span class="badge g" title="도전 과제를 줄 학생">🚀</span>' : ''}</td>
      <td class="num">${s.n}</td><td class="num">${s.correct}</td>
      <td class="an-colbar">${s.n ? `<span class="an-cb">${bar(s.rate, s.rate < 0.5 ? C.lo : C.hi, `정답률 ${P(s.rate)}`)}<b>${P(s.rate)}</b></span>` : '<span class="muted">응답 없음</span>'}</td>
      <td class="num">${secText(s.avgMs)}</td><td class="sys small">${res(s)}</td></tr>`).join('')}</tbody>`;
  $$('#s-table [data-stu]').forEach(b => b.onclick = () => openStudent(b.dataset.stu));
}

// 정답률 × 평균 시간 산점도
function renderScatter() {
  const { ss, groups } = S.A;
  const box = $('#s-scatter');
  const pts = ss.filter(s => s.n > 0 && s.avgMs != null);
  if (pts.length < 2) { box.innerHTML = ''; return; }
  const W = Math.max(300, Math.min(1000, box.clientWidth || 640)), H = W < 520 ? 290 : 340;
  const m = { l: 46, r: 14, t: 34, b: 40 };
  const maxS = Math.max(...pts.map(p => p.avgMs / 1000)) * 1.08;
  const step = maxS > 24 ? 5 : maxS > 10 ? 2 : 1;
  const xMax = Math.ceil(maxS / step) * step;
  const X = v => m.l + (v / xMax) * (W - m.l - m.r), Y = r => m.t + (1 - r) * (H - m.t - m.b);
  const help = new Set(groups.help.map(s => s.key)), chal = new Set(groups.challenge.map(s => s.key));
  const medT = (groups.medianMs ?? 0) / 1000;
  let g = '';
  for (let r = 0; r <= 1.0001; r += 0.25) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(r)}" y2="${Y(r)}" stroke="${r === 0 ? C.base : C.grid}" stroke-width="1"/><text x="${m.l - 8}" y="${Y(r) + 4}" text-anchor="end" class="ax">${r * 100}%</text>`;
  for (let v = 0; v <= xMax + 1e-9; v += step) if ((v / step) % (W < 520 ? 2 : 1) === 0) g += `<text x="${X(v)}" y="${H - m.b + 18}" text-anchor="middle" class="ax">${v}초</text>`;
  g += `<text x="${(m.l + W - m.r) / 2}" y="${H - 4}" text-anchor="middle" class="ax2">평균 응답 시간 →  (왼쪽일수록 빨라요)</text>`;
  if (medT) g += `<line x1="${X(medT)}" x2="${X(medT)}" y1="${m.t - 6}" y2="${H - m.b}" stroke="${C.base}" stroke-width="1"/>`;
  g += `<text x="${m.l + 4}" y="16" class="qd">⚡ 빠르고 정확해요</text><text x="${W - m.r}" y="16" text-anchor="end" class="qd">🐢 천천히, 정확해요</text>`;
  g += `<text x="${W - m.r - 6}" y="${Y(0) - 8}" text-anchor="end" class="qd">🤝 함께 살펴봐요</text><text x="${m.l + 6}" y="${Y(0) - 8}" class="qd">💨 서두르다 틀려요</text>`;
  const order = [...pts].sort((a, b) => (help.has(a.key) || chal.has(a.key) ? 1 : 0) - (help.has(b.key) || chal.has(b.key) ? 1 : 0));
  for (const p of order) {
    const col = help.has(p.key) ? C.lo : chal.has(p.key) ? C.hi : C.other;
    g += `<g class="dot" data-stu="${esc(p.name)}" data-tip="${esc(`${nm(p.name)}\n정답률 ${P(p.rate)} (${p.correct}/${p.n})\n평균 ${secText(p.avgMs)}`)}" tabindex="0" role="button" aria-label="${esc(nm(p.name))} 정답률 ${P(p.rate)}">
      <circle cx="${X(p.avgMs / 1000)}" cy="${Y(p.rate)}" r="14" fill="transparent"/><circle cx="${X(p.avgMs / 1000)}" cy="${Y(p.rate)}" r="6.5" fill="${col}" stroke="#fff" stroke-width="2"/></g>`;
  }
  box.innerHTML = `<div class="an-legend"><i class="lg hi"></i>도전 과제를 줄 학생 <i class="lg lo"></i>도움이 필요한 학생 <i class="lg ot"></i>그 밖의 학생${medT ? ` <span class="an-med">│ 세로선: 반 중간값 ${medT.toFixed(1)}초</span>` : ''}</div>
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="학생별 정답률과 평균 응답 시간 산점도">${g}</svg>`;
  $$('.dot', box).forEach(d => { d.onclick = () => openStudent(d.dataset.stu); d.onkeydown = e => { if (e.key === 'Enter') openStudent(d.dataset.stu); }; });
}

function renderHeat() {
  const { ds, ss, mx, qs } = S.A;
  const st = new Map(ss.map(s => [s.key, s]));
  let studs = ds.students.filter(s => st.get(s.key)?.n > 0);
  const byName = (a, b) => nm(a.name).localeCompare(nm(b.name), 'ko', { numeric: true });
  studs.sort(S.hSort === 'rate' ? (a, b) => st.get(b.key).rate - st.get(a.key).rate || byName(a, b) : byName);
  const qrate = new Map(qs.map(q => [q.key, q]));
  const cols = ds.questions.filter(q => qrate.get(q.key)?.n > 0);
  const head = `<thead><tr><th class="hn">이름</th>${cols.map(q => `<th class="hq" data-tip="${esc(`${q.no}. ${q.q}\n정답: ${(q.answers || [])[0] ?? ''}`)}">${q.no}</th>`).join('')}<th class="hr">정답률</th></tr></thead>`;
  const body = studs.map(S2 => {
    const s = st.get(S2.key);
    return `<tr><th class="hn"><button class="linkish" data-stu="${esc(S2.name)}" type="button">${esc(nm(S2.name))}</button></th>${cols.map(q => {
      const c = mx.get(S2.key, q.key);
      if (!c) return '<td class="hc n" aria-label="안 풂">-</td>';
      const last = c.givens[c.givens.length - 1];
      const tip = `${nm(S2.name)} · ${q.no}번\n${c.n > 1 ? `${c.n}번 중 ${c.ok}번 맞음\n` : ''}마지막 답: ${last?.given === '' ? NO_ANSWER : last?.given ?? ''}`;
      return `<td class="hc ${c.last ? 'o' : 'x'}" data-tip="${esc(tip)}">${c.last ? 'O' : 'X'}${c.ok > 0 && c.ok < c.n ? `<sub>${c.ok}/${c.n}</sub>` : ''}</td>`;
    }).join('')}<td class="hr">${P(s.rate)}</td></tr>`;
  }).join('');
  const foot = `<tfoot><tr><th class="hn">정답률</th>${cols.map(q => { const r = qrate.get(q.key).rate; return `<td class="hf ${r < 0.5 ? 'lo' : ''}">${Math.round(r * 100)}</td>`; }).join('')}<td class="hr">${P(S.A.sum.rate)}</td></tr></tfoot>`;
  $('#heat').innerHTML = `<table class="heat">${head}<tbody>${body}</tbody>${foot}</table>`;
  $$('#heat [data-stu]').forEach(b => b.onclick = () => openStudent(b.dataset.stu));
}

function renderCompare() {
  const box = $('#sec-cmp'), { cmp, ds } = S.A;
  if (ds.sessions.length < 2) {
    box.innerHTML = `<h2>📈 차시 비교</h2><p class="an-empty">같은 단원의 기록을 <b>2개 이상</b> 열면 차시마다 정답률이 어떻게 달라졌는지 보여 드려요.<br><small class="sys">예: 1차시 골든벨(사전 진단) → 3차시 카트 레이스(복습)</small></p>`;
    return;
  }
  // 1) 차시별 정답률 세로 막대
  const W = Math.max(300, Math.min(900, (box.clientWidth || 700) - 40)), H = 230, m = { l: 40, r: 10, t: 22, b: 52 };
  const n = cmp.sessions.length, band = (W - m.l - m.r) / n, bw = Math.min(56, band * 0.5);
  const Y = r => m.t + (1 - r) * (H - m.t - m.b);
  let g = '';
  for (let r = 0; r <= 1.0001; r += 0.25) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(r)}" y2="${Y(r)}" stroke="${r === 0 ? C.base : C.grid}"/><text x="${m.l - 6}" y="${Y(r) + 4}" text-anchor="end" class="ax">${r * 100}%</text>`;
  cmp.sessions.forEach((s, i) => {
    const cx = m.l + band * (i + 0.5), y = Y(s.rate), x = cx - bw / 2, hgt = Y(0) - y;
    const path = hgt > 4 ? `M${x},${Y(0)} V${y + 4} Q${x},${y} ${x + 4},${y} H${x + bw - 4} Q${x + bw},${y} ${x + bw},${y + 4} V${Y(0)} Z` : `M${x},${Y(0)} V${y} H${x + bw} V${Y(0)} Z`;
    g += `<g data-tip="${esc(`${i + 1}. ${s.title}\n${dateText(s.startedAt)} · ${modeLabel(s)}\n정답률 ${P(s.rate)} · 학생 ${s.students}명 · 응답 ${s.n}개`)}"><rect x="${cx - band / 2}" y="${m.t}" width="${band}" height="${H - m.t - m.b}" fill="transparent"/>
      <path d="${path}" fill="${C.last}"/><text x="${cx}" y="${y - 6}" text-anchor="middle" class="val">${P(s.rate)}</text>
      <text x="${cx}" y="${H - m.b + 18}" text-anchor="middle" class="ax">${i + 1}. ${esc(shortDate(s.startedAt))} ${esc(MODE_INFO[s.mode]?.icon || '🎮')}</text>
      <text x="${cx}" y="${H - m.b + 34}" text-anchor="middle" class="ax">${esc(cut(s.title, Math.max(4, Math.floor(band / 13))))}</text></g>`;
  });
  const colChart = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="기록별 전체 정답률">${g}</svg>`;
  // 2) 같은 문제 처음 → 마지막 (덤벨)
  const dumb = cmp.same.map(x => {
    const a = x.first.rate * 100, b = x.last.rate * 100, lo = Math.min(a, b), hi = Math.max(a, b);
    const d = Math.round(x.diff * 100);
    return `<div class="db-row" data-tip="${esc(`${x.no}. ${x.q}\n${x.first.s + 1}번 기록 ${P(x.first.rate)} → ${x.last.s + 1}번 기록 ${P(x.last.rate)}`)}">
      <span class="db-q"><b>${x.no}</b> ${esc(cut(x.q, 34))}</span>
      <svg class="db-svg" width="100%" height="22" role="img" aria-label="${x.no}번 ${P(x.first.rate)}에서 ${P(x.last.rate)}">
        <line x1="0" x2="100%" y1="11" y2="11" stroke="${C.grid}"/><line x1="${lo}%" x2="${hi}%" y1="11" y2="11" stroke="${C.base}" stroke-width="3"/>
        <circle cx="${a}%" cy="11" r="6" fill="${C.first}" stroke="#fff" stroke-width="2"/><circle cx="${b}%" cy="11" r="6" fill="${C.last}" stroke="#fff" stroke-width="2"/></svg>
      <span class="db-d ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : '='} ${Math.abs(d)}%p</span></div>`;
  }).join('');
  const up = cmp.students.filter(s => s.diff > 0.05).slice(0, 6);
  const f = cmp.sessions[0], l = cmp.sessions[cmp.sessions.length - 1], dAll = Math.round((l.rate - f.rate) * 100);
  box.innerHTML = `<h2>📈 차시 비교 <span class="badge ${dAll >= 0 ? 'g' : 'r'}">처음 ${P(f.rate)} → 마지막 ${P(l.rate)} (${dAll >= 0 ? '+' : ''}${dAll}%p)</span></h2>
    <h3>기록별 전체 정답률</h3><div class="an-chart">${colChart}</div>
    ${cmp.same.length ? `<h3>같은 문제, 얼마나 나아졌을까요? <small class="sys muted">(두 기록 이상에 나온 문제 ${cmp.same.length}개)</small></h3>
      <div class="an-legend"><i class="lg first"></i>처음 나온 기록 <i class="lg last"></i>마지막 기록</div>
      <div class="db-axis"><span></span><span class="db-scale"><span>0%</span><span>50%</span><span>100%</span></span><span></span></div>
      <div class="db">${dumb}</div>` : '<p class="small muted">기록끼리 같은 문제가 없어요. (문제 글자가 같아야 같은 문제로 봐요)</p>'}
    ${up.length ? `<h3>🌱 많이 나아진 학생</h3><div class="an-pchips">${up.map(s => `<button class="an-pchip" data-stu="${esc(s.name)}" type="button">${esc(nm(s.name))}<small>${P(s.first)} → ${P(s.last)}</small></button>`).join('')}</div>` : ''}`;
  $$('[data-stu]', box).forEach(b => b.onclick = () => openStudent(b.dataset.stu));
}

// ---------- 모둠 협력 ----------
const RAMP = ['#0d366b', '#256abf', '#5598e7', '#86b6ef']; // 성찰 4단계: 진할수록 '많이 보탰어요'
const RAMP_TXT = ['#fff', '#fff', '#fff', '#1B2A4A'];
const fmtDelay = ms => { if (ms == null) return '-'; const s = Math.round(ms / 1000); return s < 60 ? `${s}초` : `${Math.floor(s / 60)}분 ${s % 60}초`; };
const swatch = (color, size = 16) => `<svg class="co-sw" width="${size}" height="${size}" aria-hidden="true"><rect x="1.5" y="1.5" width="${size - 3}" height="${size - 3}" rx="4" fill="${esc(color || '#c8cfe0')}" stroke="#1B2A4A" stroke-width="2"/></svg>`;
function coopSel() {
  const ss = S.C.sessions;
  if (!(S.coopIdx >= 0 && S.coopIdx < ss.length)) S.coopIdx = ss.length - 1;
  return ss[S.coopIdx];
}
// 100% 누적 막대 (성찰 분포)
function reflectBar(counts, label) {
  const tot = REFLECT.reduce((a, x) => a + (counts[x.v] || 0), 0);
  if (!tot) return `<span class="muted small">성찰 기록 없음</span>`;
  let x = 0, g = '';
  REFLECT.forEach((r, i) => {
    const n = counts[r.v] || 0; if (!n) return;
    const w = (n / tot) * 100;
    g += `<g data-tip="${esc(`${label}\n${r.icon} ${r.label}: ${n}명 (${P(n / tot)})`)}"><rect x="${x}%" y="0" width="${w}%" height="26" fill="${RAMP[i]}"/>
      ${w >= 9 ? `<text x="${x + w / 2}%" y="18" text-anchor="middle" class="co-seg" fill="${RAMP_TXT[i]}">${n}</text>` : ''}</g>
      <rect x="${x + w}%" y="0" width="2" height="26" fill="#fff"/>`;
    x += w;
  });
  return `<svg class="co-rbar" width="100%" height="26" role="img" aria-label="${esc(label)} 성찰 분포: ${REFLECT.map(r => `${r.label} ${counts[r.v] || 0}명`).join(', ')}">${g}</svg>`;
}
function renderCoop() {
  const box = $('#sec-coop'), has = !!S.C?.sessions.length;
  box.hidden = !has; $('#nav-coop').hidden = !has;
  if (!has) { box.innerHTML = ''; return; }
  const C = S.C, s = coopSel(), multi = C.sessions.length > 1;
  const lo = COOP.lowShare, hi = COOP.dominance;
  const perSes = C.alerts.total / C.sessions.length;
  const kpi = (ico, label, val, sub = '') => `<div class="co-kpi"><span class="co-kpi-i" aria-hidden="true">${ico}</span><small>${label}</small><b>${val}</b>${sub ? `<em>${sub}</em>` : ''}</div>`;
  const metricLabel = s.metric === 'contrib' ? '공동 진행에 쓰인 정답' : '정답 수 (협력 기여 기록 없음)';
  const teams = s.teams.map(t => {
    const flags = [t.dom ? '<span class="badge r">📣 독주</span>' : '', t.zero ? `<span class="badge r">🔈 기여 0명 ${t.zero}</span>` : '', !t.zero && t.low ? `<span class="badge y">🔈 기여 적음 ${t.low}</span>` : '',
      !t.dom && !t.low && t.balance != null && t.balance >= 0.85 ? '<span class="badge g">🤝 고르게</span>' : ''].join('');
    const members = [...t.members].sort((a, b) => b.share - a.share).map(m => `<div class="co-m ${m.dom ? 'dom' : ''} ${m.low ? 'low' : ''}" data-tip="${esc(`${nm(m.name)}\n기여 ${m.contrib} (모둠의 ${P(m.share)})\n응답 ${m.n} · 정답 ${m.correct}${m.reflect ? `\n성찰: ${REFLECT.find(r => r.v === m.reflect)?.label || ''}` : ''}`)}">
        <button class="linkish co-mn" data-stu="${esc(m.name)}" type="button">${esc(nm(m.name))}</button>
        <svg class="co-mbar" width="100%" height="18" role="img" aria-label="${esc(nm(m.name))} 모둠 안 몫 ${P(m.share)}">
          <rect width="100%" height="18" rx="5" fill="#F1F6FF" stroke="#D6E2F2"/>
          ${m.share > 0 ? `<rect width="${m.share * 100}%" height="18" rx="5" fill="${esc(t.color || '#3D8BFF')}" stroke="#1B2A4A" stroke-width="2"/>` : ''}
          <line x1="${lo * 100}%" x2="${lo * 100}%" y1="0" y2="18" stroke="#4A5878" stroke-width="1.5"/><line x1="${hi * 100}%" x2="${hi * 100}%" y1="0" y2="18" stroke="#4A5878" stroke-width="1.5"/></svg>
        <span class="co-mv">${P(m.share)}${m.dom ? ' 📣' : m.zero ? ' 🔇' : m.low ? ' 🔈' : ''}</span></div>`).join('');
    const routes = Object.entries(t.routes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${esc(k)} ${v}`).join(' · ');
    const facts = [
      `🪢 공동 진행 <b>${t.shared.n}</b>회${t.shared.meanDistinct != null ? ` · 평균 <b>${t.shared.meanDistinct.toFixed(1)}</b>명이 함께${t.shared.meanNeed != null ? ` (필요 ${Math.round(t.shared.meanNeed * 10) / 10}명)` : ''}` : ''}`,
      `🤲 도움 준 <b>${t.help.given}</b> · 받은 <b>${t.help.received}</b>`,
      t.choices ? `🧭 작전 ${routes || t.choices + '번'}${t.refusals ? ` · 거절 <b>${t.refusals}</b>` : ''}` : '',
      t.roleHolders ? `🎌 역할 맡은 모둠원 <b>${t.roleHolders}</b>/${t.size}명` : '',
      t.caught ? `👀 들킴 <b>${t.caught}</b>` : '', t.goals ? `🏁 모둠 목표 <b>${t.goals}</b>번` : '',
    ].filter(Boolean).map(f => `<li>${f}</li>`).join('');
    return `<article class="co-team">
      <header class="co-th">${swatch(t.color, 20)}<b>${esc(t.name)}</b><small class="muted">${t.size}명</small><span class="grow"></span>${flags}</header>
      <div class="co-nums">
        <span><small>균형 지수</small><b>${t.balance == null ? '-' : t.balance.toFixed(2)}</b></span>
        <span class="${t.maxShare != null && t.maxShare >= hi ? 'warn' : ''}"><small>가장 큰 몫</small><b>${t.maxShare == null ? '-' : P(t.maxShare)}</b></span>
        <span class="${t.zero ? 'warn' : ''}"><small>기여 0명</small><b>${t.zero}</b></span>
        <span><small>${s.metric === 'contrib' ? '기여 합' : '정답'}</small><b>${t.contrib}</b></span></div>
      <div class="co-scale" aria-hidden="true"><span></span><span class="co-scale-t"><i class="l1">15%</i><i class="l2">50%</i></span><span></span></div>
      <div class="co-members">${members || '<span class="muted small">모둠원 없음</span>'}</div>
      <ul class="co-facts">${facts}</ul>
      <div class="co-refl"><small>성찰</small>${reflectBar(t.reflect, `${t.name} 성찰`)}</div>
    </article>`;
  }).join('');
  const kinds = Object.keys(ALERT_KIND).concat(Object.keys(C.alerts.byKind).filter(k => !ALERT_KIND[k]));
  const alertRows = kinds.filter(k => C.alerts.byKind[k] || C.acks.byKind[k]).map(k => {
    const a = C.acks.byKind[k];
    return `<tr><td>${ALERT_KIND[k]?.icon || '🔔'} ${esc(ALERT_KIND[k]?.label || k)}</td><td class="num">${C.alerts.byKind[k] || 0}</td><td class="num">${a?.n || 0}</td><td class="num">${fmtDelay(a?.mean)}</td></tr>`;
  }).join('');
  box.innerHTML = `<h2>🤝 모둠 협력 <span class="badge">기준: 기여 적음 ${lo * 100}% 미만 · 독주 ${hi * 100}% 이상</span></h2>
    <p class="an-lead small">전통놀이 협력 모드 기록이에요. 진행은 <b>서로 다른 모둠원</b>의 정답으로 일어나요. 등수 대신 <span class="hl">모둠에 보탠 몫</span>이 고르게 나뉘었는지 봐요.</p>
    <div class="co-kpis">
      ${kpi('🏆', '우리 반 목표 성공', C.classWin.known ? `${C.classWin.won}/${C.classWin.known}` : '-', '차시')}
      ${kpi('⚖️', '모둠 균형 지수 평균', C.meanBalance == null ? '-' : C.meanBalance.toFixed(2), '1에 가까울수록 고르게')}
      ${kpi('🔎', '살펴볼 모둠원', `${C.flagged.low}`, `기여 0명 ${C.flagged.zero} · 독주 ${C.flagged.dom}`)}
      ${kpi('🔔', '교사 알림', `${C.alerts.total}`, `차시당 ${Math.round(perSes * 10) / 10}건${perSes > 12 ? ' ⚠️ 많아요' : ''}`)}
      ${kpi('🚶', '알림 → 교사 도착', fmtDelay(C.acks.meanDelay), `확인 ${C.acks.n}/${C.alerts.total}건`)}
    </div>
    ${multi ? `<div class="chips co-ses" role="group" aria-label="협력 기록 고르기">${C.sessions.map((x, i) => `<button class="chip ${i === S.coopIdx ? 'on' : ''}" data-i="${i}" type="button">${i + 1}. ${esc(shortDate(x.startedAt))} ${esc(cut(x.title, 16))}</button>`).join('')}</div>` : ''}
    <h3>${esc(s.title)} <small class="muted sys">${esc(dateText(s.startedAt))} · ${esc(s.modeName || MODE_INFO[s.mode]?.name || s.mode)} · ${s.classWin == null ? '' : s.classWin ? '🏆 우리 반 목표 성공' : '🌧️ 우리 반 목표 다음에 다시'}</small></h3>
    <p class="small muted sys">막대 = 모둠 안에서 보탠 몫(${metricLabel}). 세로선은 15%·50% 기준이에요.${s.unassigned ? ` 모둠이 없는 학생 ${s.unassigned}명은 빼고 셌어요.` : ''}</p>
    <div class="co-teams">${teams}</div>
    <div class="co-bottom">
      <div class="co-panel"><h3>💭 성찰: 오늘 내가 모둠에 보탠 몫</h3>
        <div class="an-legend">${REFLECT.map((r, i) => `<i class="lg" data-c="${i}"></i>${r.icon} ${r.label}`).join(' ')}</div>
        <div class="co-rrow"><span>우리 반${multi ? ' (모든 차시)' : ''}</span>${reflectBar(C.reflect, '우리 반')}<em>${C.reflectN}명</em></div>
        ${C.reflectByTeam.map(t => `<div class="co-rrow"><span>${swatch(t.color, 14)} ${esc(t.name)}</span>${reflectBar(t, t.name)}<em>${REFLECT.reduce((a, r) => a + t[r.v], 0)}명</em></div>`).join('')}
      </div>
      <div class="co-panel"><h3>🔔 교사 알림과 도착</h3>
        ${alertRows ? `<table class="tbl co-atbl"><thead><tr><th>알림</th><th class="num">건수</th><th class="num">찾아감</th><th class="num">평균 도착</th></tr></thead><tbody>${alertRows}</tbody></table>` : '<p class="an-empty">알림 기록이 없어요.</p>'}
        ${multi ? `<p class="small sys">차시별 알림: ${C.sessions.map((x, i) => `${i + 1}. ${x.alerts.total}건`).join(' · ')}</p>` : ''}
        <p class="small muted sys">알림 기준: 정체 4분 · 연속 오답 2번 · 기여 적음 15% · 독주 50%. 차시당 12건 이하가 알맞아요.</p>
      </div>
    </div>
    <div class="row an-tools"><span class="grow"></span><button class="btn grape" data-ai="coop" type="button">🤖 모둠 협력 돌아보기 프롬프트 만들기</button></div>`;
  $$('.co-ses .chip', box).forEach(b => b.onclick = () => { S.coopIdx = +b.dataset.i; renderCoop(); });
  $$('[data-stu]', box).forEach(b => b.onclick = () => openStudent(b.dataset.stu));
}
// AI 프롬프트용: 모둠 통계만 (이름 없음)
function coopPromptLines() {
  const C = S.C; if (!C?.sessions.length) return ['[모둠 협력 기록 없음]'];
  const L = ['[모둠 협력 기록] (학생 이름 없이 통계만)', `- 협력 모드 기록 ${C.sessions.length}개, 우리 반 목표 성공 ${C.classWin.won}/${C.classWin.known || C.sessions.length}`,
    `- 판단 기준: 모둠 안 몫 15% 미만 = 기여 적음, 50% 이상 = 독주, 균형 지수 = 1 − 지니(1에 가까울수록 고르게)`];
  for (const s of C.sessions) {
    L.push('', `■ ${s.modeName || s.mode} (${shortDate(s.startedAt)}) — 진행은 서로 다른 모둠원의 정답으로 일어남`);
    for (const t of s.teams) {
      const shares = [...t.members].sort((a, b) => b.share - a.share).map(m => P(m.share)).join(', ');
      L.push(`- ${t.name} 모둠(${t.size}명): 모둠원별 몫 [${shares}], 균형 지수 ${t.balance == null ? '-' : t.balance.toFixed(2)}${t.dom ? ', 독주 있음' : ''}${t.zero ? `, 기여 0명 ${t.zero}명` : ''}${t.low && !t.zero ? `, 기여 적음 ${t.low}명` : ''}; 공동 진행 ${t.shared.n}회(평균 ${t.shared.meanDistinct == null ? '-' : t.shared.meanDistinct.toFixed(1)}명 함께); 도움 준 ${t.help.given}·받은 ${t.help.received}${t.choices ? `; 작전 ${Object.entries(t.routes).map(([k, v]) => `${k} ${v}`).join(', ')}${t.refusals ? `, 거절 ${t.refusals}` : ''}` : ''}`);
    }
  }
  L.push('', `[성찰: 오늘 내가 모둠에 보탠 몫] ${REFLECT.map(r => `${r.label} ${C.reflect[r.v]}명`).join(', ')}`);
  const worst = [...C.reflectByTeam].map(t => ({ n: t.name, next: t.next + t.little, tot: REFLECT.reduce((a, r) => a + t[r.v], 0) })).filter(t => t.tot).sort((a, b) => b.next / b.tot - a.next / a.tot)[0];
  if (worst) L.push(`- '조금/다음엔 더'가 가장 많은 모둠: ${worst.n} (${worst.next}/${worst.tot}명)`);
  L.push('', `[교사 알림] 모두 ${C.alerts.total}건 (${Object.entries(C.alerts.byKind).map(([k, v]) => `${ALERT_KIND[k]?.label || k} ${v}`).join(', ') || '없음'}), 교사가 찾아간 알림 ${C.acks.n}건, 알림 → 교사 도착 평균 ${fmtDelay(C.acks.meanDelay)}`);
  return L;
}

// ---------- 학생 자세히 ----------
let stuOrder = [], stuIdx = -1;
function openStudent(name) {
  if (!S.A) return;
  stuOrder = [...S.A.ss].filter(s => s.n > 0).sort((a, b) => nm(a.name).localeCompare(nm(b.name), 'ko', { numeric: true })).map(s => s.name);
  stuIdx = stuOrder.indexOf(name);
  if (stuIdx < 0) { stuOrder.push(name); stuIdx = stuOrder.length - 1; }
  showStudent();
  openModal($('#stu-modal'));
}
function showStudent() {
  const name = stuOrder[stuIdx], { ds, ss } = S.A;
  const s = ss.find(x => x.name === name); if (!s) return;
  const det = studentDetail(ds, s.key), multi = ds.sessions.length > 1;
  $('#stu-title').textContent = `🧒 ${nm(name)}`;
  const res = s.results.map(r => { const x = extraText(r.extra); return `${multi ? `${r.s + 1}번 기록 ` : ''}${resultText(r)}${x ? ` (${x})` : ''}`; }).join(' · ');
  $('#stu-body').innerHTML = `<div class="an-stu-sum">
      <span class="an-mini"><small>정답률</small><b>${P(s.rate)}</b></span><span class="an-mini"><small>응답</small><b>${s.n}개</b></span>
      <span class="an-mini"><small>정답</small><b>${s.correct}개</b></span><span class="an-mini"><small>평균 시간</small><b>${secText(s.avgMs)}</b></span></div>
    ${res ? `<p class="small sys">🏁 ${esc(res)}</p>` : ''}
    <table class="tbl an-dtbl"><thead><tr><th>번호</th><th>문제</th><th>${esc(nm(name))}의 답</th><th class="desk">정답</th></tr></thead><tbody>
    ${det.map(d => `<tr class="${d.tries.length ? (d.tries[d.tries.length - 1].ok ? 'ok' : 'no') : 'none'}"><td class="num">${d.no}</td><td>${esc(d.q)}<small class="mob">정답: ${esc(d.answer)}</small></td>
      <td>${d.tries.length ? d.tries.map(t => `<span class="try ${t.ok ? 'o' : 'x'}" title="${esc(secText(t.ms))}">${t.ok ? '⭕' : '❌'} ${esc(t.given === '' ? '(무응답)' : t.given)}${multi ? `<small>${t.s + 1}번 기록</small>` : ''}</span>`).join('') : '<span class="muted">안 풂</span>'}</td>
      <td class="desk">${esc(d.answer)}</td></tr>`).join('')}</tbody></table>`;
  $('#stu-prev').disabled = stuIdx <= 0; $('#stu-next').disabled = stuIdx >= stuOrder.length - 1;
}

// ---------- 모달 ----------
let lastFocus = null;
function openModal(m) { lastFocus = document.activeElement; m.hidden = false; setTimeout(() => $('[data-close]', m)?.focus(), 30); }
function closeModal(m) { m.hidden = true; lastFocus?.focus?.(); }
$$('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
});
document.addEventListener('keydown', e => {
  const m = $$('.modal').find(x => !x.hidden); if (!m) return;
  if (e.key === 'Escape') closeModal(m);
  if (m.id === 'stu-modal' && e.key === 'ArrowLeft' && stuIdx > 0) { stuIdx--; showStudent(); }
  if (m.id === 'stu-modal' && e.key === 'ArrowRight' && stuIdx < stuOrder.length - 1) { stuIdx++; showStudent(); }
});
$('#stu-prev').onclick = () => { if (stuIdx > 0) { stuIdx--; showStudent(); } };
$('#stu-next').onclick = () => { if (stuIdx < stuOrder.length - 1) { stuIdx++; showStudent(); } };

// ---------- 말풍선 ----------
const tip = $('#tip');
function placeTip(x, y) {
  const r = tip.getBoundingClientRect();
  let left = x + 14, top = y + 16;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 12;
  tip.style.left = Math.max(8, left) + 'px'; tip.style.top = Math.max(8, top) + 'px';
}
document.addEventListener('pointerover', e => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.dataset.tip; tip.hidden = false; placeTip(e.clientX, e.clientY);
});
document.addEventListener('pointermove', e => { if (!tip.hidden) placeTip(e.clientX, e.clientY); });
document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true, capture: true });
document.addEventListener('focusin', e => {
  const t = e.target.closest?.('[data-tip]'); if (!t) return;
  const r = t.getBoundingClientRect(); tip.textContent = t.dataset.tip; tip.hidden = false; placeTip(r.left + r.width / 2, r.bottom);
});
document.addEventListener('focusout', () => { tip.hidden = true; });

// ---------- AI 프롬프트 ----------
const AI = {
  lesson: { icon: '🧑‍🏫', name: '다음 차시 수업 설계', desc: '도입·전개·정리 흐름으로, 약한 문제와 오개념을 중심에' },
  fix: { icon: '🔧', name: '오개념 바로잡기 활동', desc: '학생들이 왜 그렇게 생각했는지와 짧은 활동 아이디어' },
  quiz: { icon: '📝', name: '보충·심화 문제 만들기', desc: '즐거운 퀴즈에 바로 올릴 수 있는 엑셀 표 형식' },
  feedback: { icon: '💌', name: '학부모·학생 피드백 문구', desc: '반 전체 결과 안내, 학생별 격려 문구(가명)' },
  coop: { icon: '🤝', name: '모둠 협력 돌아보기', desc: '참여 형평성·성찰·교사 알림으로 다음 모둠 활동 다듬기', coopOnly: true },
};
const aiKinds = () => Object.entries(AI).filter(([, v]) => !v.coopOnly || S.C?.sessions.length);
const ai = { kind: 'lesson', grade: '', minutes: 40, count: 10, level: 'both', fbTarget: 'parent', topN: 5 };
function guessGrade() {
  const units = S.A.ds.sessions.map(s => `${s.unit} ${s.title}`).join(' ');
  const m = units.match(/([1-6])\s*학년/); return m ? `${m[1]}학년` : '';
}
function renderAiTypes() {
  $('#ai-types').innerHTML = aiKinds().map(([k, v]) => `<button class="an-ai-type" data-ai="${k}" type="button"><span class="ico">${v.icon}</span><b>${v.name}</b><small>${v.desc}</small></button>`).join('');
}
function openAI(kind) {
  if (!S.A) return toast('먼저 기록을 열어 주세요');
  ai.kind = kind || ai.kind; if (!ai.grade) ai.grade = guessGrade();
  $('#ai-real').checked = false; $('#ai-real-warn').hidden = true;
  renderAiForm(); openModal($('#ai-modal'));
}
function renderAiForm() {
  if (AI[ai.kind]?.coopOnly && !S.C?.sessions.length) ai.kind = 'lesson';
  $('#ai-kind').innerHTML = aiKinds().map(([k, v]) => `<button class="chip ${ai.kind === k ? 'on' : ''}" data-k="${k}" type="button">${v.icon} ${v.name}</button>`).join('');
  $$('#ai-kind .chip').forEach(b => b.onclick = () => { ai.kind = b.dataset.k; renderAiForm(); });
  const sel = (id, label, opts, val) => `<label class="field"><span>${label}</span><select class="input" id="${id}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
  const grades = [['', '학년 고르기'], ...[1, 2, 3, 4, 5, 6].map(g => [`${g}학년`, `${g}학년`])];
  let o = sel('ai-grade', '학년', grades, ai.grade);
  if (ai.kind === 'lesson') o += sel('ai-min', '수업 시간', [[40, '40분 (초등 1차시)'], [80, '80분 (블록 수업)']], ai.minutes);
  if (ai.kind !== 'feedback' && ai.kind !== 'coop') o += sel('ai-top', '넣을 약한 문제 수', [[3, '3개'], [5, '5개'], [8, '8개']], ai.topN);
  if (ai.kind === 'quiz') o += sel('ai-count', '만들 문제 수', [[10, '10문제'], [15, '15문제'], [20, '20문제']], ai.count) + sel('ai-level', '문제 수준', [['both', '보충 + 심화 섞어서'], ['easy', '보충(기초 다지기)'], ['hard', '심화(도전)']], ai.level);
  if (ai.kind === 'feedback') o += sel('ai-fb', '누구에게', [['parent', '학부모 안내문 (반 전체 결과)'], ['class', '학생들에게 (반 전체 격려)'], ['each', '학생별 짧은 격려 문구 (가명)']], ai.fbTarget);
  $('#ai-opts').innerHTML = o;
  $('.an-switch').hidden = ai.kind === 'coop';
  if (ai.kind === 'coop') { $('#ai-real').checked = false; $('#ai-real-warn').hidden = true; }
  const bind = (id, key, numeric) => { const el = $('#' + id); if (el) el.onchange = () => { ai[key] = numeric ? +el.value : el.value; buildPrompt(); }; };
  bind('ai-grade', 'grade'); bind('ai-min', 'minutes', 1); bind('ai-top', 'topN', 1); bind('ai-count', 'count', 1); bind('ai-level', 'level'); bind('ai-fb', 'fbTarget');
  const steps = ['아래 <b>📋 복사하기</b> 버튼을 눌러요.', '학교에서 허용한 AI(ChatGPT · Gemini · Claude 등) 채팅 창을 열어요.', '입력 칸에 <b>붙여 넣기(Ctrl+V)</b> 하고 보내요.',
    ai.kind === 'coop' ? 'AI의 제안 가운데 우리 반에 맞는 것만 골라 다음 모둠 활동에 써 봐요. 특정 학생을 탓하는 말은 쓰지 않아요.' : ai.kind === 'quiz' ? '나온 표를 복사해서 즐거운 퀴즈 <b>선생님 화면 → 문제 넣기</b>에 붙여 넣거나, 엑셀에 붙여 저장한 뒤 올려요. 꼭 내용을 확인해 주세요!' : 'AI가 준 답을 그대로 쓰지 말고, 우리 반에 맞게 살펴보고 고쳐 써요.'];
  $('#ai-steps').innerHTML = steps.map(s => `<li>${s}</li>`).join('');
  buildPrompt();
}
function buildPrompt() {
  const A = S.A, real = $('#ai-real').checked;
  const allNames = A.ds.students.map(s => s.name);
  const pa = anonymizer([...allNames].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true })));
  const who = n => (real ? n : pa(n));
  const units = [...new Set(A.ds.sessions.map(s => s.unit).filter(Boolean))];
  const subj = units.join(', ') || [...new Set(A.ds.sessions.map(s => s.title))].join(', ');
  const acts = A.ds.sessions.map(s => `${MODE_INFO[s.mode]?.name || s.modeName || s.mode}(${shortDate(s.startedAt)})`).join(', ');
  const weak = [...A.qs].filter(q => q.n >= 3).sort((a, b) => a.rate - b.rate).slice(0, ai.topN);
  const grade = ai.grade || '초등학교';
  const L = [];
  L.push(`[우리 반 퀴즈 결과 요약]`);
  L.push(`- 학년 · 단원: ${subj.includes(grade) ? subj : `${grade} ${subj}`}`);
  L.push(`- 한 활동: ${acts} (게임형 퀴즈)`);
  L.push(`- 참여 학생 ${A.sum.students}명, 문항 ${A.sum.questions}개, 전체 정답률 ${P(A.sum.rate)}, 평균 응답 시간 ${secText(A.sum.avgMs)}`);
  if (A.ds.sessions.length > 1) L.push(`- 기록별 정답률 변화: ${A.cmp.sessions.map(s => P(s.rate)).join(' → ')}`);
  const weakLines = weak.map((q, i) => `${i + 1}. ${q.q}\n   - 정답: ${q.answer} / 정답률 ${P(q.rate)}${q.topWrong ? ` / 가장 많이 고른 오답: "${q.topWrong.given}" (${P(q.topWrong.share)})` : ''}`);
  const misLines = A.mis.slice(0, 5).map(q => `- "${q.q}" → 정답은 "${q.answer}", 그런데 응답의 ${P(q.topWrong.share)}가 "${q.topWrong.given}"을(를) 고름`);
  const strong = [...A.qs].filter(q => q.n >= 3 && q.rate >= 0.85).map(q => cut(q.q, 40));
  const groups = `- 도움이 더 필요한 학생 ${A.groups.help.length}명, 심화 도전이 가능한 학생 ${A.groups.challenge.length}명`;
  let ask = [];
  if (ai.kind === 'lesson') {
    L.push('', '[정답률이 낮은 문제]', ...weakLines);
    if (misLines.length) L.push('', '[오개념으로 보이는 응답]', ...misLines);
    if (strong.length) L.push('', `[이미 잘 아는 내용] ${strong.slice(0, 6).join(' / ')}`);
    L.push('', '[학생 구성]', groups);
    ask = [`당신은 ${grade} 담임 교사를 돕는 수업 설계 전문가입니다.`, `위 결과를 바탕으로 다음 차시 ${ai.minutes}분 수업을 설계해 주세요.`,
      '1. 수업 목표(1~2개)', '2. 도입(약 5분): 학생들의 오개념을 끌어내는 질문이나 장면', `3. 전개(약 ${ai.minutes - 10}분): 정답률이 낮은 개념을 다시 배우는 활동 2개 (실험·시범·모둠 토의 등 직접 해 보는 활동 포함)`,
      '4. 정리(약 5분): 확인 질문 3개와 예상 답', '5. 도움이 더 필요한 학생과 심화 도전 학생을 위한 활동 차이', `6. 준비물`, `${grade} 학생이 이해할 수 있는 쉬운 말로, 표나 목록으로 정리해 주세요.`];
  } else if (ai.kind === 'fix') {
    L.push('', '[오개념으로 보이는 응답]', ...(misLines.length ? misLines : weakLines));
    ask = [`당신은 ${grade} 교과 지도와 학생 오개념에 밝은 교사 연수 강사입니다.`, '위의 오개념마다 다음을 알려 주세요.',
      '1. 학생들이 왜 그렇게 생각했을지 (생활 경험·말의 뜻 등)', '2. 5~10분 안에 할 수 있는 바로잡기 활동 (간단한 시범·실험·그림·비유)', '3. 활동 중에 던질 질문 2~3개',
      '4. 학생이 제대로 이해했는지 확인하는 짧은 질문 1개', '안전에 주의할 점이 있으면 함께 적어 주세요.'];
  } else if (ai.kind === 'quiz') {
    L.push('', '[정답률이 낮은 문제]', ...weakLines);
    if (misLines.length) L.push('', '[오개념으로 보이는 응답]', ...misLines);
    const lv = { both: `보충 문제 ${Math.ceil(ai.count / 2)}개(기초 다지기)와 심화 문제 ${Math.floor(ai.count / 2)}개(한 단계 더 생각하기)`, easy: `보충 문제 ${ai.count}개(기초 다지기)`, hard: `심화 문제 ${ai.count}개(한 단계 더 생각하기)` }[ai.level];
    ask = [`당신은 ${grade} 교사를 돕는 평가 문항 출제 도우미입니다.`, `위 결과에서 학생들이 어려워한 개념으로 ${lv}를 만들어 주세요.`,
      '', '[꼭 지킬 형식]', '- 아래 6칸 표 하나로만 답해 주세요. 표 밖에 다른 설명은 쓰지 마세요.', '| 문제 | 정답 | 오답1 | 오답2 | 오답3 | 해설 |',
      '- 정답은 하나만 쓰고, 오답 3개는 그럴듯하게 (위 오개념을 오답으로 활용하면 좋아요).', '- O/X 문제는 정답 칸에 O 또는 X만 쓰고 오답 칸은 비워 두세요.',
      '- 단답형 문제는 오답 칸을 비우고, 정답이 여러 표현이면 정답 칸에 "/"로 나눠 쓰세요 (예: 귀 체온계/체온계).', `- 문제는 40자 안팎, ${grade} 학생이 읽기 쉬운 말로 써 주세요.`, '- 해설은 한두 문장으로, 왜 그 답인지 알려 주세요.', '- 교과서 내용에서 벗어나지 않게, 사실이 정확한지 한 번 더 확인해 주세요.'];
  } else if (ai.kind === 'coop') {
    L.push('', ...coopPromptLines());
    ask = [`당신은 ${grade} 협동학습과 게이미피케이션 수업 설계에 밝은 교사 연구자입니다.`, '위 모둠 협력 기록(이름 없는 통계)을 보고 다음을 정리해 주세요.',
      '1. 잘된 점 2~3가지 (모둠 진행에 여러 명이 함께 보탰는지 중심으로)', '2. 걱정되는 점: 한 명에게 몰린 모둠(독주), 기여가 적거나 0인 모둠원이 있는 모둠, 정체·연속 오답 알림',
      '3. 다음 차시에 바꿔 볼 것: 역할 돌리기, 모둠 구성 원칙(이름 없이 원칙만), "서로 다른 모둠원 n명이 맞혀야 진행" 같은 규칙 조정, 도움 주고받기 장치',
      '4. 교사가 게임 중에 모둠을 찾아가 던질 짧은 질문 3개', '5. 게임 뒤 성찰 시간(5분)에 쓸 질문 3개 ("모둠에 보탠 몫"을 돌아보는 질문)',
      '- 학생끼리 비교하거나 등수를 매기는 방법은 제안하지 마세요. 학생 모두가 게임(도깨비)과 함께 겨루는 협력 구조를 지켜 주세요.', `- ${grade} 교실에서 바로 쓸 수 있게 짧은 목록으로 써 주세요.`];
  } else {
    if (ai.fbTarget === 'each') {
      L.push('', '[학생별 결과] (이름은 가명입니다. 그대로 써 주세요)');
      const byName = [...A.ss].filter(s => s.n > 0).sort((a, b) => who(a.name).localeCompare(who(b.name), 'ko', { numeric: true }));
      for (const s of byName) {
        const det = studentDetail(A.ds, s.key).filter(d => d.tries.length);
        const good = det.filter(d => d.tries.every(t => t.ok)).map(d => d.no), bad = det.filter(d => !d.tries[d.tries.length - 1].ok).map(d => d.no);
        L.push(`- ${who(s.name)}: 정답률 ${P(s.rate)} (응답 ${s.n}개), 잘한 문제 ${good.length ? good.slice(0, 6).join('·') + '번' : '없음'}, 다시 볼 문제 ${bad.length ? bad.slice(0, 6).join('·') + '번' : '없음'}`);
      }
      L.push('', '[문제 번호]', ...A.qs.filter(q => q.n).map(q => `${q.no}번: ${cut(q.q, 40)}`));
      ask = [`당신은 따뜻한 ${grade} 담임 교사입니다.`, '위 학생마다 2문장 안팎의 격려 문구를 써 주세요.', '- 잘한 점을 먼저 구체적으로 칭찬하고, 다시 볼 내용은 "다음엔 ~을 함께 확인해 봐요"처럼 부드럽게 써 주세요.',
        '- 점수·순위·다른 친구와의 비교는 쓰지 마세요.', `- 학생 이름 자리는 "${real ? '학생 이름' : '학생 A'}"처럼 위에 쓴 그대로 두세요.`];
    } else {
      L.push('', '[잘한 내용]', strong.length ? strong.slice(0, 6).map(s => '- ' + s).join('\n') : '- (정답률 85% 넘는 문제 없음)');
      L.push('', '[더 연습할 내용]', ...weak.slice(0, 3).map(q => `- ${cut(q.q, 50)} (정답: ${q.answer})`));
      ask = ai.fbTarget === 'parent'
        ? [`당신은 ${grade} 담임 교사입니다.`, '위 결과로 학부모님께 보낼 학급 안내문(5~7문장)을 써 주세요.', '- 반 전체의 결과만 이야기하고, 특정 학생은 언급하지 마세요.', '- 단원에서 배운 내용, 잘한 점, 가정에서 함께 해 볼 수 있는 쉬운 활동 1~2가지를 넣어 주세요.', '- 점수 경쟁이 아니라 배움의 과정을 강조하는 따뜻한 말투로 써 주세요.']
        : [`당신은 ${grade} 담임 교사입니다.`, '위 결과로 우리 반 학생들에게 들려줄 격려 말(4~6문장)을 써 주세요.', '- 반 전체가 잘한 점을 칭찬하고, 더 연습할 내용을 "함께 도전해 봐요"처럼 즐겁게 소개해 주세요.', `- ${grade} 학생이 이해할 수 있는 쉬운 말로 써 주세요.`, '- 특정 학생 이름이나 점수·순위는 넣지 마세요.'];
    }
  }
  // 역할 → 우리 반 결과 → 부탁할 일 순서
  let text = [ask[0], '', ...L, '', '[부탁할 일]', ...ask.slice(1)].join('\n');
  if (!real) {
    const forms = allNames.flatMap(n => [n, n.replace(/^\d+\s*/, '')]).filter(x => x.length >= 2);
    text = scrubNames(text, forms, n => pa(allNames.find(f => f === n || f.replace(/^\d+\s*/, '') === n) || n));
  }
  $('#ai-text').value = text;
  // 가명 대조표 (이 화면에만 보임, 프롬프트에는 안 들어감)
  const key = $('#ai-key');
  key.hidden = real || !(ai.kind === 'feedback' && ai.fbTarget === 'each');
  if (!key.hidden) {
    $('#ai-key-list').innerHTML = [...allNames].sort((a, b) => a.localeCompare(b, 'ko', { numeric: true }))
      .map(n => `<span class="an-keyitem"><b>${esc(pa(n))}</b> = ${esc(n)}</span>`).join('');
  }
  $('#ai-len').textContent = `${text.length.toLocaleString()}자 · ${ai.kind === 'coop' ? '🔒 모둠 통계만 넣었어요 (학생 이름 없음)' : real ? '⚠️ 실제 이름 포함' : '🔒 이름은 학생 A, B…로 바꿨어요'}`;
}
$('#ai-real').onchange = e => {
  if (e.target.checked && !confirm('학생의 실제 이름이 AI 서비스로 보내지게 돼요.\n개인정보 보호를 위해 권장하지 않아요. 그래도 넣을까요?')) e.target.checked = false;
  $('#ai-real-warn').hidden = !e.target.checked; buildPrompt();
};
$('#ai-copy').onclick = async () => {
  const ta = $('#ai-text');
  try { await navigator.clipboard.writeText(ta.value); }
  catch { ta.select(); document.execCommand('copy'); }
  toast('📋 복사했어요! AI 채팅 창에 붙여 넣어 주세요');
};

// ---------- 수업 설계 도우미 ----------
function planHTML() {
  const st = [
    ['도입', '🔔', '골든벨 라이브', '사전 진단', '모두 같은 문제를 동시에 풀며 무엇을 알고 오는지 확인해요.'],
    ['전개', '🎁', '보물 상자', '스스로 연습', '자기 속도로 풀고 상자를 열며 개념을 익혀요.'],
    ['정리', '🏎️', '카트 레이스 · 🗺️ 땅따먹기', '신나는 복습', '배운 내용을 게임으로 되짚으며 기억을 굳혀요.'],
    ['확인', '📊', '분석실', '다시 가르칠 문제', '기록을 열어 약한 문제와 오개념을 찾고 다음 차시를 준비해요.'],
  ];
  return `<h2>🧭 수업 설계 도우미 <small class="badge">한 단원을 이렇게 써 보세요</small></h2>
    <ol class="an-plan">${st.map(([ph, ic, mode, what, d], i) => `<li><span class="an-plan-ph">${i + 1}. ${ph}</span><span class="an-plan-ic" aria-hidden="true">${ic}</span><b>${mode}</b><span class="an-plan-w">${what}</span><small class="sys">${d}</small></li>`).join('')}</ol>
    <p class="small sys">🤝 모둠 활동을 하는 날에는 ‘다 함께 줄다리기’ 같은 <b>전통놀이 협력 모드</b>로 정리해 보세요. 분석실의 ‘모둠 협력’에서 모둠원 모두가 고르게 보탰는지 볼 수 있어요.</p>
    <p class="small sys muted">💡 같은 문제로 도입과 정리를 하면 ‘차시 비교’에서 얼마나 나아졌는지 바로 보여요. 기록 파일은 선생님 컴퓨터에만 저장돼요.</p>
    <div class="row"><a class="btn y" href="teacher.html">🎮 선생님 화면에서 퀴즈 만들기</a><button class="btn ghost" data-ai="quiz" type="button">📝 AI로 보충 문제 만들기</button></div>`;
}

// ---------- 내보내기 ----------
function exportBase() {
  const recs = active(); const f = recs[0], l = recs[recs.length - 1];
  const name = recs.length > 1 ? (f.unit || f.title) : f.title;
  const d = x => dateText(x.startedAt, false);
  return `${safeName(name)}_${recs.length > 1 ? `${d(f)}~${d(l)}_${recs.length}개` : d(f)}`;
}
async function exportXlsx() {
  const recs = active(); if (!recs.length) return toast('분석할 기록을 골라 주세요');
  if (!window.XLSX) return toast('엑셀 도구를 불러오지 못했어요 (vendor/xlsx.full.min.js)');
  try {
    const bytes = workbookBytes(recordsToWorkbook(recs));
    const r = await saveFiles([{ name: `즐거운퀴즈_분석_${exportBase()}.xlsx`, data: bytes, type: XLSX_MIME }]);
    toast(r.where === 'folder' ? `📥 ‘${r.folderName}’ 폴더에 엑셀을 저장했어요` : '📥 엑셀 파일을 내려받았어요');
  } catch (e) { toast('엑셀을 만들지 못했어요: ' + e.message); }
}
async function exportBundle() {
  const recs = active(); if (!recs.length) return toast('분석할 기록을 골라 주세요');
  const r = await saveFiles([{ name: `즐거운퀴즈_기록묶음_${exportBase()}.json`, data: JSON.stringify(bundle(recs)), type: 'application/json' }]);
  toast(r.where === 'folder' ? `📄 ‘${r.folderName}’ 폴더에 합친 기록을 저장했어요` : '📄 합친 기록 파일을 내려받았어요');
}
function doPrint() { window.print(); }

// ---------- 이벤트 ----------
function bindChips(id, key, after) {
  $$(`#${id} .chip`).forEach(b => b.onclick = () => { S[key] = b.dataset.v; $$(`#${id} .chip`).forEach(x => x.classList.toggle('on', x === b)); after(); });
}
function init() {
  $('#file').onchange = e => { openFiles(e.target.files); e.target.value = ''; };
  $('#file2').onchange = e => { openFiles(e.target.files); e.target.value = ''; };
  $('#btn-sample').onclick = openSamples;
  $('#btn-folder').onclick = fromFolder; $('#btn-folder2').onclick = fromFolder;
  $('#btn-clear').onclick = () => { if (confirm('열린 기록을 모두 닫을까요? (파일은 지워지지 않아요)')) { S.recs.clear(); S.off.clear(); S.openQ.clear(); render(); scrollTo({ top: 0, behavior: 'smooth' }); } };
  $('#btn-xlsx').onclick = exportXlsx; $('#btn-bundle').onclick = exportBundle; $('#btn-print').onclick = doPrint;
  $('#btn-hide').onclick = e => { S.hide = !S.hide; e.currentTarget.classList.toggle('on', S.hide); e.currentTarget.setAttribute('aria-pressed', S.hide); e.currentTarget.textContent = S.hide ? '🙈 이름 가림' : '🙈 이름 가리기'; store.set('jq_an_hide', S.hide); render(); };
  if (store.get('jq_an_hide', false)) $('#btn-hide').click();
  bindChips('q-sort', 'qSort', renderQuestions); bindChips('s-sort', 'sSort', renderStudents); bindChips('h-sort', 'hSort', renderHeat);
  document.addEventListener('click', e => { const b = e.target.closest('[data-ai]'); if (b) openAI(b.dataset.ai); });
  renderAiTypes();
  $('#sec-plan').innerHTML = planHTML(); $('#plan-empty').innerHTML = planHTML();
  // 끌어다 놓기
  let depth = 0; const mask = $('#dropmask');
  const isFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
  addEventListener('dragenter', e => { if (!isFiles(e)) return; e.preventDefault(); depth++; mask.hidden = false; });
  addEventListener('dragover', e => { if (isFiles(e)) e.preventDefault(); });
  addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; mask.hidden = true; } });
  addEventListener('drop', e => { if (!isFiles(e)) return; e.preventDefault(); depth = 0; mask.hidden = true; openFiles(e.dataTransfer.files); });
  // 크기 바뀌면 차트 다시
  let lastW = innerWidth, tmr = 0;
  addEventListener('resize', () => { clearTimeout(tmr); tmr = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 30 && S.A) { lastW = innerWidth; renderScatter(); renderCompare(); } }, 200); });
  addEventListener('beforeprint', () => { if (S.A) { renderScatter(); renderCompare(); } });
  refreshFolderNote(); renderDrafts(); render(); openLast();
}
init();
