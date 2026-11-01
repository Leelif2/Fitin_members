const { createClient } = globalThis.FitinSupabase || {};

if (!createClient) {
  throw new Error('Supabase client failed to load.');
}

// Public project URL + anon key — safe to expose client-side.
// Access control lives in Supabase Row Level Security policies (see supabase/schema.sql).
const SUPABASE_URL = 'https://zcgnzgxxwhzzxpvyzidd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjZ256Z3h4d2h6enhwdnl6aWRkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3MTA2MjksImV4cCI6MjEwNTI4NjYyOX0.DAFo4J3pUxF1CkQ23DsEKNUyr3OXb8zIZFpfbc34qXU';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const HOME_PAGE = 'Fitin%20Main.dc.html';

// Only same-site page paths are accepted as a post-login destination
// (e.g. "booking.html?x=1"), so ?next= can't be used to bounce people
// to another website.
export function safeNext(raw) {
  const value = String(raw || '').trim();
  if (!value || value.includes('//') || value.includes('\\') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return HOME_PAGE;
  if (!/^[A-Za-z0-9%._ -]+\.html([?#].*)?$/.test(value)) return HOME_PAGE;
  if (/^(login|signup)\.html/i.test(value)) return HOME_PAGE;
  return value;
}

// The page the visitor is on now, as a relative path for ?next=.
export function currentPage() {
  const file = window.location.pathname.split('/').pop() || HOME_PAGE;
  return file + window.location.search;
}

// Where to go once signed in. When sign-in happened inside the sign-up
// popup, send the window that opened it to the destination (so its header
// shows the signed-in state) and close the popup; otherwise just navigate.
export function finishSignIn(next) {
  const target = new URL(safeNext(next), window.location.href).href;
  try {
    if (window.opener && !window.opener.closed && window.opener.location.origin === window.location.origin) {
      window.opener.location.href = target;
      window.close();
      return;
    }
  } catch (e) {
    // opener on another origin — fall through and navigate this window
  }
  window.location.replace(target);
}

// Redirects to login.html when there is no active session; resolves with
// the session otherwise. Use at the top of any member-only page. The
// current page rides along as ?next= so login can bring the visitor back.
export async function requireSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = `login.html?next=${encodeURIComponent(currentPage())}`;
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
