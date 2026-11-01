const STORAGE_KEY = 'fitin-view-mode';
const THEME_STORAGE_KEY = 'fitin-theme';
const ICONS = { auto: 'ph-desktop', tablet: 'ph-device-tablet', phone: 'ph-device-mobile' };
const LABELS_EN = { auto: 'Desktop', tablet: 'Tablet', phone: 'Phone' };
const THEME_ICONS = { dark: 'ph-moon', light: 'ph-sun' };
const THEME_LABELS_EN = { dark: 'Dark', light: 'Light' };

function applyMode(mode, mount) {
  document.documentElement.dataset.viewMode = mode;
  const icon = mount.querySelector('.view-toggle-trigger i');
  if (icon) icon.className = 'ph ' + ICONS[mode];
  mount.querySelectorAll('.view-toggle-menu button[data-mode]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  });
}

function applyTheme(theme, mount) {
  document.documentElement.dataset.theme = theme;
  mount.querySelectorAll('.view-toggle-menu button[data-theme]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.theme === theme));
  });
}

// Mounts a compact display-settings menu for the persistent color theme and
// optional device-width preview without crowding the header.
export function initViewToggle(mountId = 'view-toggle-mount') {
  const mount = document.getElementById(mountId);
  if (!mount) return;
  const saved = localStorage.getItem(STORAGE_KEY) || 'auto';
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';

  mount.className = 'view-toggle';
  mount.innerHTML =
    '<button type="button" class="view-toggle-trigger" aria-haspopup="true" aria-expanded="false" title="Display settings">' +
      '<i class="ph ' + ICONS[saved] + '"></i>' +
    '</button>' +
    '<div class="view-toggle-menu" hidden>' +
      '<p class="view-toggle-label" data-i18n-ko="테마">Theme</p>' +
      '<div class="view-toggle-options">' +
        Object.keys(THEME_ICONS).map((theme) =>
          '<button type="button" data-theme="' + theme + '"><i class="ph ' + THEME_ICONS[theme] + '"></i><span data-i18n-ko="' +
          ({ dark: '다크', light: '라이트' })[theme] + '">' + THEME_LABELS_EN[theme] + '</span></button>'
        ).join('') +
      '</div>' +
      '<div class="view-toggle-divider"></div>' +
      '<p class="view-toggle-label" data-i18n-ko="화면 크기">Preview width</p>' +
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
    const themeButton = e.target.closest('button[data-theme]');
    if (themeButton) {
      localStorage.setItem(THEME_STORAGE_KEY, themeButton.dataset.theme);
      applyTheme(themeButton.dataset.theme, mount);
      return;
    }
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
  applyTheme(savedTheme, mount);
}
