const STORAGE_KEY = 'fitin-lang';

function applyLang(lang) {
  document.documentElement.lang = lang === 'ko' ? 'ko' : 'en';

  document.querySelectorAll('[data-i18n-ko]').forEach((el) => {
    if (el.dataset.i18nEn === undefined) el.dataset.i18nEn = el.textContent;
    el.textContent = lang === 'ko' ? el.dataset.i18nKo : el.dataset.i18nEn;
  });

  document.querySelectorAll('[data-i18n-ko-placeholder]').forEach((el) => {
    if (el.dataset.i18nEnPlaceholder === undefined) el.dataset.i18nEnPlaceholder = el.placeholder;
    el.placeholder = lang === 'ko' ? el.dataset.i18nKoPlaceholder : el.dataset.i18nEnPlaceholder;
  });

  document.querySelectorAll('.lang-toggle button').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.lang === lang));
  });
}

// Mounts an EN/KO switcher into #<mountId> and translates every element
// carrying data-i18n-ko (and data-i18n-ko-placeholder for inputs). The
// element's own text/placeholder is kept as the English version.
export function initLangToggle(mountId = 'lang-toggle-mount') {
  const mount = document.getElementById(mountId);
  const saved = localStorage.getItem(STORAGE_KEY) || 'en';

  if (mount) {
    mount.className = 'lang-toggle';
    mount.innerHTML =
      '<button type="button" data-lang="en">EN</button>' +
      '<button type="button" data-lang="ko">KO</button>';
    mount.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-lang]');
      if (!btn) return;
      localStorage.setItem(STORAGE_KEY, btn.dataset.lang);
      applyLang(btn.dataset.lang);
    });
  }

  applyLang(saved);
}
