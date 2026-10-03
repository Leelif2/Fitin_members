const STORAGE_KEY = 'fitin-view-mode';
const ICONS = { auto: 'ph-desktop', tablet: 'ph-device-tablet', phone: 'ph-device-mobile' };
const LABELS_EN = { auto: 'Desktop', tablet: 'Tablet', phone: 'Phone' };

function applyMode(mode, mount) {
  document.documentElement.dataset.viewMode = mode;
  const icon = mount.querySelector('.view-toggle-trigger i');
  if (icon) icon.className = 'ph ' + ICONS[mode];
  mount.querySelectorAll('.view-toggle-menu button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  });
}

// Mounts a single icon button into #<mountId>; clicking it opens a small
// dropdown with Desktop/Tablet/Phone so the three options don't have to sit
// in the header as separate persistent buttons.
export function initViewToggle(mountId = 'view-toggle-mount') {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const saved = localStorage.getItem(STORAGE_KEY) || 'auto';

  mount.className = 'view-toggle';
  mount.innerHTML =
    '<button type="button" class="view-toggle-trigger" aria-haspopup="true" aria-expanded="false" title="Preview as">' +
      '<i class="ph ' + ICONS[saved] + '"></i>' +
    '</button>' +
    '<div class="view-toggle-menu" hidden>' +
      Object.keys(ICONS).map((mode) =>
        '<button type="button" data-mode="' + mode + '"><i class="ph ' + ICONS[mode] + '"></i><span data-i18n-ko="' +
        ({ auto: '데스크톱', tablet: '태블릿', phone: '폰' })[mode] + '">' + LABELS_EN[mode] + '</span></button>'
      ).join('') +
    '</div>';

  const trigger = mount.querySelector('.view-toggle-trigger');
  const menu = mount.querySelector('.view-toggle-menu');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    trigger.setAttribute('aria-expanded', String(!menu.hidden));
  });

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    localStorage.setItem(STORAGE_KEY, btn.dataset.mode);
    applyMode(btn.dataset.mode, mount);
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });

  document.addEventListener('click', () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  });

  applyMode(saved, mount);
}
