// 모듈이나 서버가 없어도 배포용 단일 HTML에서 안내와 검색을 사용할 수 있다.
(() => {
  const all = selector => [...document.querySelectorAll(selector)];
  const entries = all('#help-list details'), search = document.getElementById('help-search');
  search.addEventListener('input', () => {
    const term = search.value.trim().toLocaleLowerCase();
    let count = 0;
    entries.forEach(entry => { entry.hidden = !entry.textContent.toLocaleLowerCase().includes(term); if (!entry.hidden) count++; });
    document.getElementById('help-count').textContent = term ? `${count}개 도움말을 찾았어요.` : '';
    document.getElementById('help-empty').hidden = count !== 0;
  });
  const checks = all('.guide-checks input');
  checks.forEach(check => check.addEventListener('change', () => { document.getElementById('check-progress').textContent = `${checks.filter(item => item.checked).length} / 5 확인${checks.every(item => item.checked) ? ' · 수업 준비 완료!' : ''}`; }));
  let printedStates = [];
  addEventListener('beforeprint', () => { printedStates = entries.map(entry => ({open:entry.open,hidden:entry.hidden})); entries.forEach(entry => {entry.open=true;entry.hidden=false;}); });
  addEventListener('afterprint', () => entries.forEach((entry,i) => { if (printedStates[i]) {entry.open=printedStates[i].open;entry.hidden=printedStates[i].hidden;} }));
  document.getElementById('guide-print').onclick = () => print();
  const updateCurrent = () => all('.guide-toc a').forEach(link => { if(link.hash === location.hash) link.setAttribute('aria-current','location'); else link.removeAttribute('aria-current'); });
  addEventListener('hashchange', updateCurrent); updateCurrent();
  if (location.protocol === 'file:') all('[data-app]').forEach(link => {link.href='http://localhost:3030/'+link.dataset.app;});
})();
