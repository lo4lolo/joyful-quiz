// 기존 모달의 hidden 전환을 그대로 사용하면서 키보드와 초점을 관리한다.
export function installDialogs() {
  const dialogs = [...document.querySelectorAll('.modal[data-cancel]')];
  const shell = document.querySelector('.shell');
  let active = null, opener = null, lastOutside = null, previousOverflow = '';
  const focusables = dialog => [...dialog.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), summary, [tabindex="0"]')].filter(el => el.getClientRects().length && !el.closest('[hidden]'));
  document.addEventListener('focusin', event => { if (!event.target.closest('.modal')) lastOutside = event.target; });
  function sync() {
    const next = dialogs.filter(dialog => !dialog.hidden).at(-1) || null;
    if (next === active) return;
    const previous = active;
    active = next;
    if (next) {
      if (!previous) {
        opener = lastOutside || document.activeElement;
        previousOverflow = document.body.style.overflow;
      }
      if (shell) shell.inert = true;
      document.body.style.overflow = 'hidden';
      const initial = next.querySelector('[data-initial-focus]') || document.getElementById(next.dataset.cancel) || focusables(next)[0];
      initial?.focus();
    } else {
      if (shell) shell.inert = false;
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected && opener.getClientRects().length && (!document.activeElement || previous?.contains(document.activeElement) || document.activeElement === document.body)) opener.focus();
      opener = null;
    }
  }
  for (const dialog of dialogs) {
    dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    new MutationObserver(sync).observe(dialog, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.addEventListener('keydown', event => {
    if (!active) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); document.getElementById(active.dataset.cancel)?.click(); }
    else if (event.key === 'Tab') {
      const items = focusables(active), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !items.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !items.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
  }, true);
  sync();
}
