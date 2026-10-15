const { createClient } = globalThis.FitinSupabase || {};

if (!createClient) {
  throw new Error('Supabase client failed to load.');
}

// Public project URL + anon key — safe to expose client-side.
// Access control lives in Supabase Row Level Security policies (see supabase/schema.sql).
const SUPABASE_URL = 'https://zcgnzgxxwhzzxpvyzidd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZ256Z3h4d2h6enhwdnl6aWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTA2MjksImV4cCI6MjEwNTI4NjYyOX0.DAFo4J3pUxF1CkQ23DsEKNUyr3OXb8zIZFpfbc34qXU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Redirects to login.html when there is no active session; resolves with
// the session otherwise. Use at the top of any member-only page.
export async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = 'login.html';
    return null;
  }
  return session;
}

// Best-effort call to /api/log-event (3단계 로그인 활동 기록). Never throws —
// a logging hiccup should never block someone from signing in or out.
export async function logEvent(event_type, extra = {}) {
  try {
    await fetch('/api/log-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_type, ...extra }),
    });
  } catch (e) {
    // ignore — logging must never block the auth flow
  }
}

export async function signOut() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await logEvent('logout', { access_token: session.access_token });
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

// Sends a password-reset email; the link lands the visitor on
// reset-password.html with a recovery session already active.
export async function requestPasswordReset(email) {
  const redirectTo = new URL('reset-password.html', window.location.href).toString();
  return supabase.auth.resetPasswordForEmail(email, { redirectTo });
}
