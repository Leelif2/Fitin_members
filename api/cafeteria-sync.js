// Vercel Cron (vercel.json, 매주 일요일 21:00 KST) — IGC 카페테리아 식단 페이지를
// 오늘부터 8일치 읽어서 Supabase cafeteria_menus에 저장한다. 원본은 날짜별 HTML 페이지이고
// 메뉴마다 영어(<dt>)·한국어(<dd>) 이름이 같이 있어서 둘 다 저장한다.
// 공개 데이터라 누구나 호출할 수 있지만, 마지막 실행 후 30분 안에는 다시 수집하지 않는다(학교 서버 보호).
// CRON_SECRET 환경변수가 있고 "Authorization: Bearer $CRON_SECRET"이 맞으면(Vercel Cron) 이 제한 없이 실행.
const SOURCE = 'https://housing.igc.or.kr/about/cafeteria_menu.do';
const DAYS = 8;
const MIN_INTERVAL_MS = 30 * 60 * 1000;
const MEALS = { Breakfast: 'breakfast', Lunch: 'lunch', Dinner: 'dinner' };

function decode(s) {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

// 페이지 한 장 → [{ meal, time_range, price, items: [{ en, ko }] }]
// 그 날짜의 페이지가 맞는지 확인할 수 없으면 null (DB를 건드리지 않음)
function parseMenuPage(html, date) {
  if (!html.includes('sub_cont cafeteria') || !html.includes(`first_day">${date}<`)) return null;
  const list = html.match(/<ul class="menu clearFix">([\s\S]*?)<\/ul>/);
  if (!list) return [];
  const meals = [];
  for (const block of list[1].split(/<li>/).slice(1)) {
    const name = block.match(/<div class="cell">\s*(Breakfast|Lunch|Dinner)\s*<\/div>/);
    if (!name) continue;
    const time = block.match(/<dt>\s*Time\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
    const price = block.match(/<dt>\s*Price\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
    const con = block.split('class="con"')[1] || '';
    const items = [];
    for (const m of con.matchAll(/<dl>\s*<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>\s*<\/dl>/g)) {
      const en = decode(m[1]);
      const ko = decode(m[2]);
      if (en || ko) items.push({ en: en || ko, ko: ko || en });
    }
    const digits = price ? decode(price[1]).replace(/[^\d]/g, '') : '';
    meals.push({
      meal: MEALS[name[1]],
      time_range: time ? decode(time[1]) || null : null,
      price: digits ? Number(digits) : null,
      items,
    });
  }
  return meals;
}

function kstDates(count) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  return Array.from({ length: count }, (_, i) => fmt.format(new Date(Date.now() + i * 86400000)));
}

async function fetchDay(date) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${SOURCE}?c_date=${date}`, {
      headers: { 'User-Agent': 'FitinConnection menu bot (+https://www.fitinconnection.com)' },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return parseMenuPage(await res.text(), date);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'server not configured' });
    return;
  }
  const trusted = Boolean(CRON_SECRET) && req.headers.authorization === `Bearer ${CRON_SECRET}`;

  const db =(path, init = {}) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
      ...init.headers,
    },
  });

  const last = await db('cafeteria_sync_runs?select=ran_at&order=ran_at.desc&limit=1');
  if (!last.ok) {
    res.status(500).json({ error: 'cafeteria tables missing (run 0022 SQL)' });
    return;
  }
  const [lastRun] = await last.json();
  if (!trusted && lastRun && Date.now() - new Date(lastRun.ran_at).getTime() < MIN_INTERVAL_MS) {
    res.status(429).json({ error: 'synced recently', last_run: lastRun.ran_at });
    return;
  }

  const report = [];
  for (const date of kstDates(DAYS)) {
    const meals = await fetchDay(date);   // 학교 서버에 부담 주지 않도록 하루씩 차례로
    if (meals === null) {
      report.push({ date, ok: false });
      continue;
    }
    // 그 날짜 메뉴를 원본과 똑같이 맞춘다 (원본에서 빠진 끼니는 지움)
    const del = await db(`cafeteria_menus?menu_date=eq.${date}`, { method: 'DELETE' });
    const rows = meals.filter((m) => m.items.length).map((m) => ({
      menu_date: date, ...m, source_url: `${SOURCE}?c_date=${date}`, fetched_at: new Date().toISOString(),
    }));
    const ins = rows.length ? await db('cafeteria_menus', { method: 'POST', body: JSON.stringify(rows) }) : { ok: true };
    report.push({ date, ok: del.ok && ins.ok, meals: rows.length });
  }

  const failed = report.filter((r) => !r.ok).length;
  console.log('cafeteria-sync', JSON.stringify(report));
  await db('cafeteria_sync_runs', { method: 'POST', body: JSON.stringify({ ok: failed === 0, detail: report }) });
  res.status(failed === report.length ? 502 : 200).json({ ok: failed === 0, days: report });
}

module.exports = handler;
module.exports.parseMenuPage = parseMenuPage;
