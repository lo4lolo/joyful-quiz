// 학생 셸 v0.2: 게임 코드 → 이름 → 스티커 친구 고르기 → 대기실 → (모드 화면) → 결과·칭찬 도장
import { $, $$, esc, store, toast, connect, emit, avatarHTML, randomAvatar, COLORS, HATS, sound, music, showQuiz, soundButton, fx, onImgFail } from './common.js';
import { setMuted } from './fx.js';
import { CHARS, CHAR, RARITY, charImg } from './chars.js';
import { album } from './album.js';
import { MODE } from './modes/info.js';

sound.on = store.get('jq_sound_student', false); // 교실 소음 방지: 학생 기기는 기본 꺼짐
setMuted(!sound.on);
const sbtn = soundButton();
sbtn.addEventListener('click', () => store.set('jq_sound_student', sound.on));

const socket = connect();
const params = new URLSearchParams(location.search);
let me = null, room = null, avatar = store.get('jq_avatar', null) || randomAvatar();
if (!avatar.char || !album.owns(avatar.char)) avatar = { ...avatar, ...randomAvatar(), color: avatar.color || '#3D8BFF' };
let device = store.get('jq_device', matchMedia('(pointer: coarse)').matches ? 'touch' : 'pc');
let unmount = null, mountedFor = null, snapshot = null, startKey = 0;
const handlers = new Map(), roomFns = new Set(), qFns = new Set();
let waitQ = null;
let mounting = false, buffer = []; // 모드 화면을 불러오는 동안 온 메시지는 모아 두었다가 전달
let lastScreen = 'code';

function show(name) { $$('.screen').forEach(s => s.classList.toggle('on', s.id === 's-' + name)); if (name !== 'album') lastScreen = name; window.scrollTo(0, 0); }
const err = (sel, text) => { const e = $(sel); e.textContent = text || ''; e.hidden = !text; if (text) fx.shake(e.closest('.card')); };

// ---------- 1. 게임 코드 ----------
const saved = store.get('jq_join', null);
$('#j-code').value = params.get('code') || '';
$('#j-name').value = saved?.typed || '';
$('#j-code').oninput = e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); };
let code = '';
$('#code-form').onsubmit = async e => {
  e.preventDefault(); sound.unlock();
  code = $('#j-code').value.trim();
  if (code.length !== 4) return err('#j-err', '게임 코드 4자리를 써 주세요.');
  err('#j-err', '');
  // 같은 기기에서 이미 들어왔던 방이면 바로 복귀
  if (saved?.code === code && saved.token) { const r = await join(code, saved.typed, saved.token); if (!r.error) return afterJoin(); }
  show('name'); setTimeout(() => $('#j-name').focus(), 50);
};
// QR 로 들어오면 코드 단계를 건너뛴다
if (params.get('code')?.length === 4) { code = params.get('code'); if (!(saved?.code === code && saved.token)) show('name'); }

// ---------- 2. 이름 ----------
const setDevice = v => { device = v; $$('.device-row .chip').forEach(c => { c.classList.toggle('on', c.dataset.v === v); c.setAttribute('aria-checked', c.dataset.v === v); }); };
setDevice(device);
$$('.device-row .chip').forEach(c => c.onclick = () => { setDevice(c.dataset.v); fx.light(c); });
$('#n-back').onclick = () => show('code');
async function join(c, name, token) {
  const r = await emit(socket, 's:join', { code: c, name, device, avatar, token });
  if (r.error) return r;
  me = { pid: r.pid, name: r.name, realName: r.realName, avatar: r.avatar, device, token: r.token };
  store.set('jq_join', { code: c, typed: name, token: r.token });
  store.set('jq_device', device);
  room = r.room; snapshot = r.snapshot;
  if (r.ranking && r.room.state === 'end') me.endRanking = r.ranking;
  return r;
}
$('#name-form').onsubmit = async e => {
  e.preventDefault(); sound.unlock();
  const name = $('#j-name').value.trim();
  if (!name) return err('#n-err', '이름을 써 주세요.');
  $('#j-go').disabled = true;
  const r = await join(code, name, saved?.code === code && saved?.typed === name ? saved.token : null);
  $('#j-go').disabled = false;
  if (r.error) return err('#n-err', r.error);
  err('#n-err', '');
  afterJoin();
};
function afterJoin() {
  sound.play('join');
  if (room.state === 'lobby') openAvatar(); else if (room.state === 'end' && me.endRanking) showEnd(me.endRanking); else route();
}

// ---------- 3. 스티커 친구 ----------
function openAvatar() {
  const owned = album.get().owned;
  const pv = () => {
    $('#a-preview').innerHTML = avatarHTML(avatar, 'xl');
    const c = CHAR[avatar.char];
    $('#a-name').textContent = c ? c.name : '친구를 골라요';
    $('#a-rarity').innerHTML = c ? `<span class="badge" style="background:${RARITY[c.rarity].color};color:#fff">${RARITY[c.rarity].name}</span> 친구들에게 보일 이름: <b>${esc(me.name)}</b>` : '';
  };
  $('#a-count').textContent = `${owned.length} / ${CHARS.length}`;
  $('#a-chars').innerHTML = CHARS.map(c => {
    const has = owned.includes(c.id);
    return `<button class="char ${c.rarity} ${has ? '' : 'locked'} ${avatar.char === c.id ? 'on' : ''}" data-v="${c.id}" ${has ? '' : 'aria-disabled="true"'} title="${esc(c.name)}">
      ${c.rarity !== 'common' ? `<i class="tag">${RARITY[c.rarity].name}</i>` : ''}<img src="${charImg(c.id)}" alt="" data-em="${c.emoji}"><span>${has ? esc(c.name) : '???'}</span></button>`;
  }).join('');
  fixImgs($('#a-chars'));
  $('#a-color').innerHTML = COLORS.map(c => `<button data-v="${c}" class="${avatar.color === c ? 'on' : ''}" style="background:${c}" aria-label="색 ${c}"></button>`).join('');
  $('#a-hat').innerHTML = HATS.map((t, i) => `<button data-v="${i}" class="${(avatar.hat | 0) === i ? 'on' : ''}">${t || '·'}</button>`).join('');
  $$('#a-chars .char').forEach(b => b.onclick = () => {
    if (b.classList.contains('locked')) { fx.shake(b); return toast('스티커 뽑기로 모을 수 있어요!'); }
    avatar.char = b.dataset.v; avatar.face = CHAR[avatar.char].emoji;
    $$('#a-chars .char').forEach(x => x.classList.toggle('on', x === b)); pv(); fx.light(b);
  });
  const bind = (sel, key, conv = v => v) => $$(sel + ' button').forEach(b => b.onclick = () => {
    avatar[key] = conv(b.dataset.v); $$(sel + ' button').forEach(x => x.classList.toggle('on', x === b)); pv(); fx.light(b);
  });
  bind('#a-color', 'color'); bind('#a-hat', 'hat', Number);
  pv(); show('avatar');
}
function fixImgs(el) {
  $$('img[data-em]', el).forEach(img => onImgFail(img, () => { const s = document.createElement('div'); s.className = 'em'; s.textContent = img.dataset.em; img.replaceWith(s); }));
}
$('#a-done').onclick = async () => {
  avatar.kart = Math.max(0, COLORS.indexOf(avatar.color)) % 8;
  store.set('jq_avatar', avatar);
  const r = await emit(socket, 's:avatar', { avatar });
  if (r?.error) return toast(r.error);
  me.avatar = avatar; fx.medium($('#a-preview'), '준비 완료!');
  if (room.state === 'lobby') { renderWait(); show('wait'); } else route();
};
$('#w-edit').onclick = openAvatar;

// ---------- 4. 대기실 ----------
function renderWait() {
  const M = MODE[room.mode];
  $('#w-me').innerHTML = avatarHTML(me.avatar, 'xl');
  $('#w-name').textContent = me.name;
  const mine = room.players.find(p => p.pid === me.pid), T = room.teamCount && room.teams?.[mine?.team];
  $('#w-name').insertAdjacentHTML('beforeend', T ? ` <span class="team-badge" style="--tc:${T.color}">${T.emoji} ${esc(T.name)} 모둠</span>` : '');
  $('#w-room').textContent = room.state === 'end' ? '다음 게임을 기다려요' : '선생님이 시작할 때까지 기다려요';
  $('#w-game').innerHTML = `<div class="art"><img src="assets/modes/${M.id}.webp" alt=""></div>
    <div><h2>${M.emoji} ${esc(M.name)}</h2><ol>${M.student.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`;
  onImgFail($('#w-game img'), img => { img.parentElement.innerHTML = `<div class="art-fallback">${M.emoji}</div>`; });
  const ps = room.players;
  $('#w-count').textContent = ps.filter(p => p.online).length + '명';
  $('#w-players').innerHTML = ps.map(p => `<span class="pl ${p.online ? '' : 'off'}">${avatarHTML(p.avatar, 'sm')}${esc(p.name)}</span>`).join('');
}

// ---------- 모드 ----------
function route() {
  if (!me || !room) return;
  if (room.state === 'play') { if (mountedFor !== room.code + ':' + room.mode + ':' + startKey) mountMode(); return; }
  if (unmount) { try { unmount(); } catch {} unmount = null; mountedFor = null; }
  if (room.state === 'lobby') { renderWait(); if (!['avatar', 'album'].some(s => $('#s-' + s).classList.contains('on'))) show('wait'); }
}
async function mountMode() {
  if (unmount) { try { unmount(); } catch {} unmount = null; }
  const key = room.code + ':' + room.mode + ':' + startKey;
  mountedFor = key; mounting = true;
  let mod;
  try { mod = await import(`./modes/${room.mode}.js`); } catch (e) { console.error(e); mounting = false; toast('게임을 불러오지 못했어요. 새로고침 해 주세요.', 4000); return; }
  if (mountedFor !== key) return;
  const el = $('#game'); el.innerHTML = ''; el.className = 'mode-' + room.mode;
  show('game');
  try { unmount = mod.mountStudent(el, makeCtx()) || null; } catch (e) { console.error(e); toast('게임 화면을 여는 중 문제가 생겼어요. 새로고침 해 주세요.'); }
  snapshot = null; mounting = false;
  const b = buffer; buffer = [];
  b.forEach(([k, a]) => (k === 'm' ? dispatchM(a) : dispatchQ(a)));
}
const dispatchM = ({ type, data }) => handlers.get(type)?.forEach(f => f(data));
const dispatchQ = v => { if (waitQ) waitQ(v); else qFns.forEach(f => f(v)); };
function makeCtx() {
  return {
    socket, me, get room() { return room; }, snapshot,
    on(type, fn) { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); return () => handlers.get(type)?.delete(fn); },
    onRoom(fn) { roomFns.add(fn); return () => roomFns.delete(fn); },
    onQuestion(fn) { qFns.add(fn); return () => qFns.delete(fn); },
    send: (type, data) => emit(socket, 's:mode', { type, data }),
    ask() {
      return new Promise(async resolve => {
        if (waitQ) waitQ(null);
        const timer = setTimeout(() => { waitQ = null; resolve(null); }, 6000);
        waitQ = v => { clearTimeout(timer); waitQ = null; resolve(v); };
        const r = await emit(socket, 's:ask', {});
        if (r?.error && waitQ) { clearTimeout(timer); waitQ = null; resolve(null); }
      });
    },
    answer: (qid, given) => emit(socket, 's:answer', { qid, given }),
    async quiz(opts = {}) { const v = await this.ask(); if (!v) return null; return showQuiz(v, { ...opts, onAnswer: g => this.answer(v.qid, g) }); },
    sound, music, toast, showQuiz, fx,
  };
}

// ---------- 소켓 ----------
socket.on('room', r => {
  const prev = room?.state;
  room = r;
  if (prev && prev !== 'play' && r.state === 'play') { startKey++; mounting = true; buffer = []; }
  roomFns.forEach(f => f(r));
  if (!me) return;
  if ($('#s-wait').classList.contains('on') || r.state !== 'end') route();
});
socket.on('m', m => (mounting ? buffer.push(['m', m]) : dispatchM(m)));
socket.on('q', v => (mounting ? buffer.push(['q', v]) : dispatchQ(v)));
socket.on('end', ({ ranking }) => showEnd(ranking));
socket.on('kicked', ({ reason }) => {
  if (unmount) { try { unmount(); } catch {} unmount = null; }
  const msg = { kick: '선생님이 방에서 내보냈어요.', other: '다른 기기에서 같은 이름으로 들어왔어요.', expired: '게임이 끝나 방이 닫혔어요.', closed: '선생님이 방을 닫았어요.' }[reason] || '방이 닫혔어요.';
  if (reason !== 'other') store.del('jq_join');
  me = null; $('#m-text').textContent = msg; show('msg');
});
$('#m-home').onclick = () => { location.href = location.pathname; };
socket.on('disconnect', () => { $('#conn').hidden = false; });
socket.on('connect', async () => {
  $('#conn').hidden = true;
  const s = store.get('jq_join', null);
  if (me && s) { // 다시 연결
    const r = await join(s.code, s.typed, s.token);
    if (r.error) { me = null; show('code'); return; }
    if (r.room.state === 'play') { startKey++; mountedFor = null; }
    if (r.room.state === 'end' && r.ranking) showEnd(r.ranking); else route();
  } else if (!me && s?.token && (!params.get('code') || params.get('code') === s.code)) { // 새로고침 자동 복귀
    const r = await join(s.code, s.typed, s.token);
    if (!r.error) { code = s.code; afterJoin(); }
  }
});

// ---------- 결과 + 칭찬 도장 ----------
function showEnd(ranking) {
  if (unmount) { try { unmount(); } catch {} unmount = null; }
  mountedFor = null;
  if (!me || !ranking) return;
  const mine = ranking.find(r => r.pid === me.pid);
  if (mine?.extra?.noRank) return showCoopEnd(mine, ranking);
  $('#e-podium').hidden = false;
  const top = ranking.slice(0, 3);
  $$('.class-result').forEach(e => e.remove());
  $('#e-rank').innerHTML = mine ? `<small>${ranking.length}명 중</small>${mine.rank}등` : '끝!';
  const ava = pid => room?.players.find(p => p.pid === pid)?.avatar;
  $('#e-podium').innerHTML = [top[1], top[0], top[2]].map((r, k) => r ? `<div class="pod p${[2, 1, 3][k]}"><div class="who">${avatarHTML(ava(r.pid), 'lg')}${esc(r.name)}</div><div class="block">${[2, 1, 3][k]}</div></div>` : '').join('');
  const x = mine?.extra || {};
  const stats = [];
  if (x.correct != null) stats.push(['맞힌 문제', `${x.correct}${x.answered != null ? ' / ' + x.answered : ''}`]);
  const SCORE = { chest: '골드', shop: '모은 돈', fishing: '낚은 무게(kg)', raid: '공격력', royale: '점수', territory: '점수', race: '점수', live: '점수' };
  if (mine) stats.push([SCORE[room?.mode] || '점수', (mine.score || 0).toLocaleString()]);
  if (x.classWin != null) $('#e-rank').insertAdjacentHTML('beforebegin', `<div class="class-result ${x.classWin ? 'win' : ''}">${x.classWin ? '🎉 우리 반이 보스를 모두 물리쳤어요!' : `보스 ${x.bossesDown | 0}마리 처치! 다음엔 꼭!`}</div>`);
  if (x.teamName) stats.push(['우리 팀', `${x.teamName} ${x.teamRank}등`]);
  if (x.hearts != null && room?.mode === 'royale') stats.push([x.champion ? '🏆 챔피언' : '남은 하트', x.champion ? '우승!' : '❤️'.repeat(x.hearts) || '응원석'], ['이긴 대결', `${x.wins | 0}번`]);
  if (x.biggest && typeof x.biggest === 'object') stats.push(['가장 큰 물고기', `${x.biggest.name || ''} ${x.biggest.kg ?? ''}kg`]);
  $('#e-stats').innerHTML = stats.map(([k, v]) => `<div class="stat"><b>${esc(v)}</b>${esc(k)}</div>`).join('');
  // 칭찬 도장: 맞힌 문제 수 + 3등 안 보너스 (이 기기에만 저장)
  const earned = Math.min(30, (x.correct | 0) + (mine?.rank === 1 ? 5 : mine?.rank <= 3 ? 3 : 1));
  const got = album.award(earned, `${room?.code}:${room?.startedAt}`);
  $('#e-reward').innerHTML = `<div class="stampbox">⭐ 칭찬 도장 +${got || earned} <small class="muted">(모두 ${album.get().stamps}개)</small>
    <button class="btn sm grape" id="e-album">스티커 뽑기</button></div>`;
  $('#e-album').onclick = openAlbum;
  show('end');
  if (mine && mine.rank === 1) fx.heavy('1등!', '#FF6F61'); else if (mine && mine.rank <= 3) fx.heavy(`${mine.rank}등!`, '#3D8BFF'); else fx.stamp('잘했어요!', '#2ED3A0');
}

// ---------- 스티커북 ----------
function openAlbum() {
  const a = album.get();
  $('#al-stamps').textContent = `⭐ 칭찬 도장 ${a.stamps}개`;
  $('#al-grid').innerHTML = CHARS.map(c => {
    const has = a.owned.includes(c.id);
    return `<div class="char ${c.rarity} ${has ? '' : 'locked'}">${c.rarity !== 'common' ? `<i class="tag">${RARITY[c.rarity].name}</i>` : ''}<img src="${charImg(c.id)}" alt="" data-em="${c.emoji}"><span>${has ? esc(c.name) : '???'}</span></div>`;
  }).join('');
  fixImgs($('#al-grid'));
  show('album');
}
$('#al-open').onclick = () => {
  const r = album.draw();
  if (r.error) { fx.shake($('#al-open')); return toast(r.error); }
  const c = r.char;
  $('#al-result').innerHTML = `<div class="got"><img src="${charImg(c.id)}" alt="" data-em="${c.emoji}"><div><div class="display" style="font-size:30px">${esc(c.name)}</div>
    <span class="badge" style="background:${RARITY[c.rarity].color};color:#fff">${RARITY[c.rarity].name}</span> ${r.dup ? '<p class="muted small">이미 있는 친구라 도장 3개를 돌려받았어요.</p>' : '<p class="small">새 친구를 모았어요!</p>'}</div></div>`;
  fixImgs($('#al-result'));
  if (c.rarity === 'legendary') fx.heavy('전설!', '#FFB800'); else if (c.rarity === 'rare') fx.heavy('희귀!', '#3D8BFF'); else fx.medium($('#al-result'), '+1');
  openAlbumKeepResult();
};
function openAlbumKeepResult() { const keep = $('#al-result').innerHTML; openAlbum(); $('#al-result').innerHTML = keep; fixImgs($('#al-result')); }
$('#go-album').onclick = e => { e.preventDefault(); openAlbum(); };
$('#al-back').onclick = () => show(lastScreen === 'album' ? 'code' : lastScreen);

// ---------- 협력 게임 결과: 등수 대신 "모둠에 보탠 몫" + 성찰 ----------
function showCoopEnd(mine, ranking) {
  const x = mine.extra || {};
  $$('.class-result').forEach(e => e.remove());
  const T = room?.teams?.[x.team];
  $('#e-rank').innerHTML = `<small>${T ? `${T.emoji} ${esc(T.name)} 모둠` : '우리 모둠'}</small>${x.classWin ? '우리 반 성공!' : '다음엔 꼭!'}`;
  $('#e-podium').hidden = true; $('#e-podium').innerHTML = '';
  const share = Math.round((x.share || 0) * 100);
  $('#e-stats').innerHTML = `<div class="stat"><b>${x.contrib | 0}번</b>모둠에 보탠 정답</div>
    <div class="stat"><b>${x.teamContrib | 0}번</b>모둠 전체</div>
    ${x.correct != null ? `<div class="stat"><b>${x.correct}</b>맞힌 문제</div>` : ''}`;
  const earned = Math.min(30, (x.contrib | 0) + (x.classWin ? 5 : 2));
  const got = album.award(earned, `${room?.code}:${room?.startedAt}`);
  $('#e-reward').innerHTML = `<div class="reflect card">
      <h3>오늘 나는 모둠에 얼마나 보탰나요?</h3>
      <div class="reflect-row">${[['great', '😄', '많이 보탰어요'], ['good', '🙂', '조금 보탰어요'], ['little', '😅', '아쉬웠어요'], ['next', '💪', '다음엔 더 보탤래요']]
        .map(([v, e, t]) => `<button class="btn ghost" data-v="${v}"><span>${e}</span>${t}</button>`).join('')}</div>
      <p class="muted small" id="rf-msg">고르면 선생님께 전해져요. 친구들에게는 보이지 않아요.</p></div>
    <div class="stampbox">⭐ 칭찬 도장 +${got || earned} <small class="muted">(모두 ${album.get().stamps}개)</small> <button class="btn sm grape" id="e-album">스티커 뽑기</button></div>`;
  $$('.reflect-row .btn').forEach(b => b.onclick = async () => {
    $$('.reflect-row .btn').forEach(x => x.classList.toggle('on', x === b));
    const r = await emit(socket, 's:reflect', { v: b.dataset.v });
    $('#rf-msg').textContent = r?.ok ? '고마워요! 선생님께 전했어요.' : '전하지 못했어요. 다시 눌러 주세요.';
    if (r?.ok) fx.medium(b, '💌');
  });
  $('#e-album').onclick = openAlbum;
  show('end');
  if (x.classWin) fx.heavy('우리 반 성공!', '#2ED3A0'); else fx.stamp('잘했어요!', '#3D8BFF');
}
