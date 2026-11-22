// Vercel serverless function — the only place that touches the Supabase
// service_role key. The browser can't see its own public IP, so this has to
// happen server-side; it also stops a visitor from writing fake log rows,
// since login_events has no insert policy for the anon/authenticated role.
const ALLOWED_EVENTS = new Set(['login', 'logout', 'login_failed', 'signup']);

// 15분 구간 안에서 기준을 넘었으면 true. 확인 자체가 실패하면(0045 미실행 등) 기록은 계속 남긴다.
async function rateLimited(url, key, buckets) {
  try {
    for (const [bucket, limit] of buckets) {
      const r = await fetch(`${url}/rest/v1/rpc/hit_rate_limit`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_bucket: bucket.slice(0, 200), p_limit: limit, p_window_seconds: 900 }),
      });
      if (!r.ok) return false;
      if ((await r.json()) !== true) return true;
    }
    return false;
  } catch {
    return false;
  }
}

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
      // 횟수 제한 (0045): IP당 15분 30건 · 이메일당 15분 10건까지만 저장 → 가짜 실패 기록 대량 쌓기 차단
      const over = await rateLimited(SUPABASE_URL, SERVICE_ROLE_KEY, [
        [`login_failed:ip:${ip || 'unknown'}`, 30],
        [`login_failed:email:${attempted_email.trim().toLowerCase()}`, 10],
      ]);
      if (over) {
        res.status(429).json({ error: 'rate_limited' });
        return;
      }
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
