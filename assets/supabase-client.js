import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';

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

export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}
