const form = document.getElementById('signup-form');
const school = document.getElementById('signup-school');
const otherSchool = document.getElementById('signup-school-other');
const password = document.getElementById('signup-password');
const toggle = document.getElementById('password-toggle');
const button = document.getElementById('signup-submit');
const message = document.getElementById('signup-msg');

school.addEventListener('change', () => {
  const other = school.value === 'other';
  document.getElementById('school-other-field').hidden = !other;
  otherSchool.disabled = !other;
  otherSchool.required = other;
  if (other) otherSchool.focus();
});

toggle.addEventListener('click', () => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  const label = visible ? '비밀번호 숨기기' : '비밀번호 표시';
  toggle.setAttribute('aria-label', label);
  toggle.title = label;
  toggle.setAttribute('aria-pressed', String(visible));
  toggle.firstElementChild.className = visible ? 'ph ph-eye-slash' : 'ph ph-eye';
});

function showMessage(text, kind) {
  message.textContent = text;
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
    showMessage('학교와 이름을 입력해 주세요.', 'error');
    return;
  }
  const categories = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((rule) => rule.test(password.value)).length;
  if (password.value.length < 10 || categories < 3) {
    showMessage('비밀번호는 10자 이상이며 대문자·소문자·숫자·특수문자 중 3종류 이상을 포함해야 합니다.', 'error');
    password.focus();
    return;
  }
  button.disabled = true;
  button.querySelector('span').textContent = '가입 중…';
  try {
    const { supabase, logEvent } = await import('./supabase-client.js');
    const { data, error } = await supabase.auth.signUp({
      email: document.getElementById('signup-email').value.trim(),
      password: password.value,
      options: {
        emailRedirectTo: new URL('../login.html', import.meta.url).href,
        data: { first_name: name, last_name: '', university, gender: form.elements.gender.value || null },
      },
    });
    if (error) throw error;
    password.value = '';
    for (const element of form.elements) element.disabled = true;
    button.querySelector('span').textContent = '가입 신청 완료';
    if (!data.session) {
      showMessage('가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.', 'success');
      return;
    }
    await logEvent('signup', { access_token: data.session.access_token });
    showMessage('회원가입이 완료되었습니다.', 'success');
    document.getElementById('signup-continue').hidden = false;
  } catch (error) {
    showMessage(error.message || '가입 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.', 'error');
    button.disabled = false;
    button.querySelector('span').textContent = '가입하기';
  }
});
