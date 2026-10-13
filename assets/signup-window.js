document.addEventListener('click', (event) => {
  const link = event.target.closest('a[data-signup-window]');
  if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const width = Math.min(560, window.screen.availWidth);
  const height = Math.min(860, window.screen.availHeight);
  const popup = window.open(link.href, 'fitin-signup', `popup,width=${width},height=${height},resizable=yes,scrollbars=yes`);
  if (popup) popup.focus();
  else window.location.assign(link.href);
});
