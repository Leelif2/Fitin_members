import { supabase, signOut } from './supabase-client.js';

function setSignedInState(session) {
  const signedIn = Boolean(session);
  const label = session?.user?.email?.split('@')[0] || '내 계정';

  document.querySelectorAll('[data-auth-guest]').forEach((element) => {
    element.hidden = signedIn;
  });
  document.querySelectorAll('[data-auth-member]').forEach((element) => {
    element.hidden = !signedIn;
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
}
