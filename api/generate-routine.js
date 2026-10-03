// Vercel serverless function — reads an uploaded class-timetable photo with
// Claude's vision and turns the free blocks into a push/pull/leg routine.
// Needs ANTHROPIC_API_KEY set in Vercel's project environment variables;
// never exposed to the browser.
const Anthropic = require('@anthropic-ai/sdk');

// Image analysis + generation can take longer than Vercel's 10s default.
// Raise the ceiling so the function isn't killed mid-request (Hobby plan
// caps this at 60s regardless of what's requested here).
module.exports.config = { maxDuration: 60 };

const SYSTEM_PROMPT = `You read a university class-timetable photo and plan a gym routine around it.
Rules:
- Only consider free blocks of 2 hours or more, between 08:00 and 22:00, Monday through Friday.
- Pick exactly 3 of those blocks across the week for a push/pull/leg split (one session each: Push, Pull, Leg).
- Prefer spreading the 3 sessions across different days rather than stacking them close together.
- Each session is 45-75 minutes long and must fit inside its free block.
- List 4-6 concrete exercises per session appropriate for that split.
- Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly:
{"sessions":[{"day":"Mon","split":"Push","start":"14:00","end":"15:15","exercises":["..."]}],"notes":"one short sentence about the gaps you found"}
- If you cannot read a usable timetable from the image, respond with exactly: {"error":"could not read a timetable from this image"}`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const { image_base64, media_type } = req.body || {};
  if (!image_base64 || !media_type) {
    res.status(400).json({ error: 'image_base64 and media_type are required' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type, data: image_base64 } },
            { type: 'text', text: 'Here is my class timetable. Plan my push/pull/leg week around it.' },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    const raw = (textBlock?.text || '').trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      res.status(502).json({ error: 'model did not return valid JSON', raw });
      return;
    }

    res.status(200).json(parsed);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : 'AI request failed' });
  }
};
