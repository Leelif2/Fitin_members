// 홈 "오늘의 학식"용 — 오늘(한국 시간)부터 7일치 식단을 돌려준다.
// 공개 정보라 로그인 없이 누구나 호출 가능. Vercel CDN에 5분 캐시해서 DB 호출을 줄인다.
module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }

  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  const today = fmt.format(new Date());
  const until = fmt.format(new Date(Date.now() + 7 * 86400000));

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/cafeteria_menus?select=menu_date,meal,time_range,price,items,source_url,fetched_at`
        + `&menu_date=gte.${today}&menu_date=lte.${until}&order=menu_date.asc`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!r.ok) {
      res.status(502).json({ error: 'failed to load menu' });
      return;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.status(200).json({ today, menus: await r.json() });
  } catch {
    res.status(502).json({ error: 'failed to load menu' });
  }
};
