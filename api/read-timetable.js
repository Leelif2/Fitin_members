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

async function verifyMember(req) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!token || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return false;
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_SERVICE_ROLE_KEY },
  });
  return userRes.ok;
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

  try {
    if (!(await verifyMember(req))) {
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
