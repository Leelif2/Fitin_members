// Vercel serverless function — reads a class-timetable photo with Claude's
// vision and returns only the class list (day + start/end). Free-block math
// and the Push/Pull/Leg routine are computed in the browser by
// assets/routine-plan.js, so the student can check/fix the classes first.
//
// Env (Vercel → Settings → Environment Variables, never in the browser):
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Only signed-in members can call it (keeps AI spend to members).
const Anthropic = require('@anthropic-ai/sdk');

// Image reading can take a while; Hobby plan caps this at 60s.
module.exports.config = { maxDuration: 60 };

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_BASE64_CHARS = 4_000_000; // ~3 MB image; the page resizes photos before sending

const SYSTEM_PROMPT = `You read photos and screenshots of university class timetables.
List every weekly class meeting that falls on Monday through Friday.
- day: one of Mon, Tue, Wed, Thu, Fri. A class that meets on several days is one entry per day.
- start / end: 24-hour HH:MM (convert 1:30 PM to 13:30). If the timetable shows period numbers instead of times, use the period times printed on the timetable.
- title: the course name or code as printed, or an empty string if unreadable.
Skip weekend classes and anything without a readable time.
Set readable to false only when the image is not a timetable or no class times can be read at all.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    readable: { type: 'boolean' },
    classes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          day: { type: 'string', enum: DAYS },
          start: { type: 'string' },
          end: { type: 'string' },
          title: { type: 'string' },
        },
        required: ['day', 'start', 'end', 'title'],
        additionalProperties: false,
      },
    },
  },
  required: ['readable', 'classes'],
  additionalProperties: false,
};

function normalizeTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

// 로그인한 회원이면 회원 ID, 아니면 null
async function verifyMember(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return null;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
  });
  if (!userRes.ok) return null;
  const user = await userRes.json();
  return typeof user.id === 'string' && /^[0-9a-f-]{36}$/i.test(user.id) ? user.id : null;
}

// 요청 횟수 제한 (0045): 회원 1명당 1시간 5회 · 하루 10회. 넘으면 AI를 부르기 전에 거절한다.
// DB에서 세므로 서버 함수가 여러 개 떠 있어도 같은 숫자를 본다.
const LIMITS = [
  { name: 'hour', limit: 5, seconds: 3600 },
  { name: 'day', limit: 10, seconds: 86400 },
];
async function hitLimit(bucket, limit, seconds) {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hit_rate_limit`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_bucket: bucket, p_limit: limit, p_window_seconds: seconds }),
  });
  if (!r.ok) throw new Error(`rate limit check failed: ${r.status}`);
  return (await r.json()) === true;
}
// 넘은 구간 이름('hour' | 'day') 또는 null(허용)
async function overLimit(userId) {
  for (const w of LIMITS) {
    if (!(await hitLimit(`timetable:${userId}:${w.name}`, w.limit, w.seconds))) return w.name;
  }
  return null;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  let userId;
  try {
    userId = await verifyMember(req);
    if (!userId) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
  } catch {
    res.status(502).json({ error: 'auth_check_failed' });
    return;
  }

  const { image_base64, media_type } = req.body || {};
  if (typeof image_base64 !== 'string' || !MEDIA_TYPES.has(media_type)) {
    res.status(400).json({ error: 'bad_image' });
    return;
  }
  if (image_base64.length > MAX_BASE64_CHARS) {
    res.status(413).json({ error: 'image_too_large' });
    return;
  }

  // 횟수 확인은 AI 호출 바로 앞에서. 확인 자체가 실패하면 AI 요금 보호를 위해 부르지 않는다.
  try {
    const over = await overLimit(userId);
    if (over) {
      res.setHeader('Retry-After', over === 'hour' ? '3600' : '86400');
      res.status(429).json({ error: over === 'hour' ? 'rate_limited_hour' : 'rate_limited_day' });
      return;
    }
  } catch {
    res.status(503).json({ error: 'busy' });
    return;
  }

  try {
    const client = new Anthropic();
    // Server-side refusal fallback (beta): if the model declines, the API
    // re-runs the request on a fallback model inside the same call.
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'medium',
        format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'List the classes in this timetable.' },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') {
      res.status(422).json({ error: 'unreadable' });
      return;
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    let parsed;
    try {
      parsed = JSON.parse(textBlock ? textBlock.text : '');
    } catch {
      res.status(502).json({ error: 'bad_ai_output' });
      return;
    }

    const classes = (Array.isArray(parsed.classes) ? parsed.classes : [])
      .map((c) => ({
        day: DAYS.includes(c.day) ? c.day : null,
        start: normalizeTime(c.start),
        end: normalizeTime(c.end),
        title: String(c.title || '').slice(0, 80),
      }))
      .filter((c) => c.day && c.start && c.end && c.start < c.end)
      .slice(0, 80);

    if (!parsed.readable || classes.length === 0) {
      res.status(422).json({ error: 'unreadable' });
      return;
    }

    res.status(200).json({ classes });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      res.status(429).json({ error: 'busy' });
    } else if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      res.status(503).json({ error: 'not_configured' });
    } else if (err instanceof Anthropic.BadRequestError) {
      res.status(400).json({ error: 'bad_image' });
    } else {
      res.status(502).json({ error: 'ai_failed' });
    }
  }
};
