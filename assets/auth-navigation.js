import { supabase, signOut } from './supabase-client.js';

function setSignedInState(session) {
  const signedIn = Boolean(session);
  const label = session?.user?.email?.split('@')[0] || '내 계정';

  document.querySelectorAll('[data-auth-guest]').forEach((element) => {
    element.hidden = signedIn;
    element.style.display = signedIn ? 'none' : 'flex';
  });
  document.querySelectorAll('[data-auth-member]').forEach((element) => {
    element.hidden = !signedIn;
    element.style.display = signedIn ? 'flex' : 'none';
  });
  document.querySelectorAll('[data-auth-member-name]').forEach((element) => {
    element.textContent = label;
  });
}

export async function initAuthNavigation() {
  document.querySelectorAll('[data-signout]').forEach((button) => {
    button.addEventListener('click', () => signOut());
  });

  const { data: { session } } = await supabase.auth.getSession();
  setSignedInState(session);
  supabase.auth.onAuthStateChange((_event, nextSession) => setSignedInState(nextSession));

  // 다른 창(회원가입 팝업 등)에서 로그인·로그아웃하면 이 창의 헤더도 바로 바꾼다.
  // Supabase는 세션을 localStorage "sb-…-auth-token"에 두므로, 그 키가 바뀌는 storage 이벤트를 듣는다.
  window.addEventListener('storage', async (event) => {
    if (event.key && !/^sb-.*-auth-token$/.test(event.key)) return;
    const { data } = await supabase.auth.getSession();
    setSignedInState(data.session);
  });
}
