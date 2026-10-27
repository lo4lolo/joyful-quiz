// 사용법 탭 + 주소 복사 + 게임 소개 카드
import { $, $$, esc } from './common.js';
import { MODES } from './modes/info.js';

const tabs = $$('.tab'), panels = $$('.panel');
function open(name) {
  if (!panels.some(p => p.id === name)) name = 'intro';
  tabs.forEach(t => t.classList.toggle('on', t.dataset.tab === name));
  panels.forEach(p => p.classList.toggle('on', p.id === name));
}
tabs.forEach(t => t.onclick = () => { history.replaceState(null, '', '#' + t.dataset.tab); open(t.dataset.tab); });
window.addEventListener('hashchange', () => open(location.hash.slice(1)));
open(location.hash.slice(1));

const base = location.origin + location.pathname.replace(/guide\.html$/, '');
$('#t-url').textContent = base.replace(/^https?:\/\//, '') + 'teacher.html';
$('#s-url').textContent = base.replace(/^https?:\/\//, '');
$$('.copy').forEach(b => b.onclick = async () => {
  const text = 'http://' + $('#' + b.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(text); b.textContent = '복사했어요 ✔'; b.classList.add('done'); } catch { b.textContent = text; }
  setTimeout(() => { b.textContent = '주소 복사'; b.classList.remove('done'); }, 2000);
});
$('#g-modes').innerHTML = MODES.map(m => `<div class="card gm" style="--mc:${m.color}"><div class="em">${m.emoji}</div><h3>${esc(m.name)}</h3>
  <p class="sys">${esc(m.teacher)}</p><div class="tags"><span>${m.players}</span><span>${m.pace}</span><span>${m.when}</span></div></div>`).join('');
