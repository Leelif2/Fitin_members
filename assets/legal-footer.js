// 모든 페이지 하단에 개인정보처리방침 · 쿠키 정책 링크를 단다.
// 이미 링크가 있는 페이지(메인 푸터의 [data-legal-links])는 건드리지 않는다.
// 사용: <script type="module" src="assets/legal-footer.js"></script>
const INSTAGRAM = 'https://www.instagram.com/fitinconnection_official/';

function link(href, en, ko, external = false) {
  const a = document.createElement('a');
  a.href = href;
  a.dataset.i18nEn = en; // i18n.js가 언어를 바꿀 때 이 두 값을 쓴다
  a.dataset.i18nKo = ko;
  a.textContent = document.documentElement.lang === 'ko' ? ko : en;
  if (external) {
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
  }
  return a;
}

function mount() {
  if (document.querySelector('[data-legal-links]')) return;
  const footer = document.createElement('footer');
  footer.className = 'legal-footer';
  footer.setAttribute('data-legal-links', '');
  footer.style.cssText = 'border-top:1px solid var(--color-divider);margin-top:40px';
  const inner = document.createElement('div');
  inner.style.cssText = 'max-width:1180px;margin:0 auto;padding:20px 24px;display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center;font-size:12px;color:var(--color-neutral-500)';
  const brand = document.createElement('span');
  brand.textContent = '© FitinConnection';
  inner.append(brand,
    link('privacy.html', 'Privacy Policy', '개인정보처리방침'),
    link('cookies.html', 'Cookie Policy', '쿠키 정책'),
    link(INSTAGRAM, 'Instagram', '인스타그램', true));
  for (const a of inner.querySelectorAll('a')) a.style.color = 'var(--color-neutral-500)';
  footer.append(inner);
  document.body.append(footer);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
else mount();
