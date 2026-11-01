import { initLangToggle } from './i18n.js';

// 한국어/English 전환 (선택한 언어는 localStorage "fitin-lang"에 유지)
initLangToggle();

const form = document.getElementById('signup-form');
const school = document.getElementById('signup-school');
const otherSchool = document.getElementById('signup-school-other');
const password = document.getElementById('signup-password');
const toggle = document.getElementById('password-toggle');
const button = document.getElementById('signup-submit');
const message = document.getElementById('signup-msg');

const tr = (en, ko) => (document.documentElement.lang === 'ko' ? ko : en);

// 화면 글자 바꾸기 + 언어를 바꿔도 따라가도록 두 언어를 모두 적어 둔다 (i18n.js 규칙)
function setText(element, en, ko) {
  element.dataset.i18nEn = en;
  element.dataset.i18nKo = ko;
  element.textContent = tr(en, ko);
}

// Supabase가 영어로 돌려주는 대표 오류를 두 언어로
const SERVER_ERRORS = [
  [/already registered|already been registered|already exists/i, 'This email is already registered. Please log in instead.', '이미 가입된 이메일이에요. 로그인해 주세요.'],
  [/valid email|invalid email|email address .* invalid/i, 'Please enter a valid email address.', '올바른 이메일 주소를 입력해 주세요.'],
  [/password/i, 'That password can’t be used. Please choose a stronger one.', '사용할 수 없는 비밀번호예요. 더 안전한 비밀번호로 바꿔 주세요.'],
  [/rate limit|too many|security purposes/i, 'Too many attempts. Please wait a moment and try again.', '시도가 너무 많아요. 잠시 후 다시 시도해 주세요.'],
  [/network|fetch/i, 'Couldn’t reach the server. Check your connection and try again.', '서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.'],
];

function serverError(error) {
  const msg = error?.message || '';
  const hit = SERVER_ERRORS.find(([pattern]) => pattern.test(msg));
  return hit ? [hit[1], hit[2]] : ['Something went wrong while signing up. Please try again shortly.', '가입 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'];
}

school.addEventListener('change', () => {
  const other = school.value === 'other';
  document.getElementById('school-other-field').hidden = !other;
  otherSchool.disabled = !other;
  otherSchool.required = other;
  if (other) otherSchool.focus();
});

function updateToggleLabel() {
  const visible = password.type === 'text';
  const label = visible ? tr('Hide password', '비밀번호 숨기기') : tr('Show password', '비밀번호 표시');
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
}

toggle.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.firstElementChild.className = visible ? 'ph ph-eye-slash' : 'ph ph-eye';
  updateToggleLabel();
});
updateToggleLabel();
window.addEventListener('fitin:lang-change', updateToggleLabel);

function showMessage(en, ko, kind) {
  setText(message, en, ko);
  message.className = `signup-msg is-${kind}`;
  message.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (button.disabled) return;
  message.hidden = true;
  const name = document.getElementById('signup-name').value.trim();
  const university = school.value === 'other' ? otherSchool.value.trim() : school.value;
  if (!name || !university) {
    showMessage('Please enter your school and name.', '학교와 이름을 입력해 주세요.', 'error');
    return;
  }
  if (!document.getElementById('signup-consent').checked) {
    showMessage('Please agree to the collection and use of personal information to sign up.', '회원가입을 하려면 개인정보 수집·이용에 동의해 주세요.', 'error');
    return;
  }
  const categories = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((rule) => rule.test(password.value)).length;
  if (password.value.length < 10 || categories < 3) {
    showMessage('Your password needs at least 10 characters and 3 of: uppercase, lowercase, numbers, symbols.',
      '비밀번호는 10자 이상이며 대문자·소문자·숫자·특수문자 중 3종류 이상을 포함해야 합니다.', 'error');
    password.focus();
    return;
  }
  const label = button.querySelector('span');
  button.disabled = true;
  setText(label, 'Creating account…', '가입 중…');
  try {
    const { supabase, logEvent, finishSignIn, HOME_PAGE } = await import('./supabase-client.js');
    const { data, error } = await supabase.auth.signUp({
      email: document.getElementById('signup-email').value.trim(),
      password: password.value,
      options: {
        // 인증 메일 링크 → 로그인 화면 → (세션이 있으면) 바로 메인으로
        emailRedirectTo: new URL('../login.html', import.meta.url).href,
        data: { first_name: name, last_name: '', university, gender: form.elements.gender.value || null },
      },
    });
    if (error) throw error;
    password.value = '';
    for (const element of form.elements) element.disabled = true;
    setText(label, 'Signed up', '가입 신청 완료');
    if (!data.session) {
      showMessage('We sent you a confirmation email. Open the link in it, then log in.',
        '가입 확인 메일을 보냈습니다. 메일의 링크를 누른 뒤 로그인해 주세요.', 'success');
      return;
    }
    await logEvent('signup', { access_token: data.session.access_token });
    showMessage('Your account is ready!', '회원가입이 완료되었습니다.', 'success');
    // 시작하기 → 메인으로 (팝업이면 원래 창을 메인으로 보내고 팝업을 닫는다)
    const go = document.getElementById('signup-continue');
    go.disabled = false;
    go.hidden = false;
    go.addEventListener('click', () => finishSignIn(HOME_PAGE));
  } catch (error) {
    showMessage(...serverError(error), 'error');
    button.disabled = false;
    setText(label, 'Create account', '가입하기');
  }
});
