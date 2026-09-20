const STORAGE_KEY = 'fitin-view-mode';

function applyMode(mode) {
  document.documentElement.dataset.viewMode = mode;
  document.querySelectorAll('.view-toggle button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
  });
}

// Mounts a Desktop/Tablet/Phone switcher into #<mountId> and wires it to
// the CSS in assets/view-toggle.css. Call once per page, after the mount
// element exists in the DOM.
export function initViewToggle(mountId = 'view-toggle-mount') {
  const mount = document.getElementById(mountId);
  if (!mount) return;

  mount.className = 'view-toggle';
  mount.innerHTML =
    '<button type="button" data-mode="auto" title="Desktop view"><i class="ph ph-desktop"></i></button>' +
    '<button type="button" data-mode="tablet" title="Tablet view"><i class="ph ph-device-tablet"></i></button>' +
    '<button type="button" data-mode="phone" title="Phone view"><i class="ph ph-device-mobile"></i></button>';

  mount.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-mode]');
    if (!btn) return;
    localStorage.setItem(STORAGE_KEY, btn.dataset.mode);
    applyMode(btn.dataset.mode);
  });

  applyMode(localStorage.getItem(STORAGE_KEY) || 'auto');
}
