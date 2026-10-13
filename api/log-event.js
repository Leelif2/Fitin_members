// Vercel serverless function — the only place that touches the Supabase
// service_role key. The browser can't see its own public IP, so this has to
// happen server-side; it also stops a visitor from writing fake log rows,
// since login_events has no insert policy for the anon/authenticated role.
const ALLOWED_EVENTS = new Set(['login', 'logout', 'login_failed', 'signup']);

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const { event_type, access_token, email } = req.body || {};
  if (!ALLOWED_EVENTS.has(event_type)) {
    res.status(400).json({ error: 'invalid event_type' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor || '').split(',')[0].trim() || null;
  const userAgent = req.headers['user-agent'] || null;
  const device = userAgent && /Mobi|Android|iPhone|iPad/i.test(userAgent) ? 'mobile' : 'desktop';

  let user_id = null;
  let attempted_email = null;

  try {
    if (access_token) {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${access_token}`, apikey: SERVICE_ROLE_KEY },
      });
      if (!userRes.ok) {
        res.status(401).json({ error: 'invalid access token' });
        return;
      }
      const user = await userRes.json();
      user_id = user.id ?? null;
    } else if (event_type === 'login_failed' && email) {
      attempted_email = String(email).slice(0, 320);
    } else {
      res.status(401).json({ error: 'access token is required for this event' });
      return;
    }

    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/login_events`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id,
        attempted_email,
        event_type,
        ip_address: ip,
        user_agent: userAgent,
        device,
      }),
    });

    if (!insertRes.ok) {
      res.status(502).json({ error: 'failed to record event' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch {
    res.status(502).json({ error: 'failed to record event' });
  }
}
