// 사용법 탭 + 주소 복사 + 게임 소개 카드
import { $, $$, esc } from './common.js';
import { MODES } from './modes/info.js';

const tabs = $$('.tab'), panels = $$('.panel');
function open(name) {
  if (!panels.some(p => p.id === name)) name = 'intro';
  tabs.forEach(t => { const selected=t.dataset.tab===name; t.classList.toggle('on',selected);t.setAttribute('role','tab');t.setAttribute('aria-selected',String(selected));t.setAttribute('aria-controls',t.dataset.tab);t.id='tab-'+t.dataset.tab;t.tabIndex=selected?0:-1; });
  panels.forEach(p => { p.classList.toggle('on', p.id === name);p.setAttribute('role','tabpanel');p.setAttribute('aria-labelledby','tab-'+p.id); });
}
tabs.forEach(t => t.onclick = () => { history.replaceState(null, '', '#' + t.dataset.tab); open(t.dataset.tab); });
tabs.forEach((t,i)=>t.addEventListener('keydown',e=>{let next;if(e.key==='ArrowRight')next=(i+1)%tabs.length;else if(e.key==='ArrowLeft')next=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabs.length-1;if(next!=null){e.preventDefault();tabs[next].click();tabs[next].focus();}}));
window.addEventListener('hashchange', () => open(location.hash.slice(1)));
open(location.hash.slice(1));

const base = location.origin + location.pathname.replace(/guide\.html$/, '');
$('#t-url').textContent = base.replace(/^https?:\/\//, '') + 'teacher.html';
$('#s-url').textContent = base.replace(/^https?:\/\//, '');
$$('.copy').forEach(b => b.onclick = async () => {
  const text = new URL($('#' + b.dataset.copy).getAttribute('href'), location.href).href;
  try { await navigator.clipboard.writeText(text); b.textContent = '복사했어요 ✔'; b.classList.add('done'); } catch { b.textContent = text; }
  setTimeout(() => { b.textContent = '주소 복사'; b.classList.remove('done'); }, 2000);
});
$('#g-modes').innerHTML = MODES.map(m => `<div class="card gm" style="--mc:${m.color}"><div class="em">${m.emoji}</div><h3>${esc(m.name)}</h3>
  <p class="sys">${esc(m.teacher)}</p><div class="tags"><span>${m.players}</span><span>${m.pace}</span><span>${m.when}</span></div></div>`).join('');
