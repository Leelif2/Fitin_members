// Vercel serverless function — 6단계 관리자 알림 (supabase/migrations/0032_admin_notifications.sql).
// DB 트리거(pg_net)가 { kind, id } 만 보내면, 여기서 DB 내용을 service_role로 다시 읽고 관리자에게 이메일(Resend)을 보낸다.
//   * 받은 값은 믿지 않는다: 실제로 있는 일이고, 10분 안에 생긴 일일 때만 보낸다.
//   * 같은 일은 한 번만: notification_logs (event_kind, ref_id, channel) 유니크 — 먼저 기록을 잡은 요청만 보낸다.
//   * 보내기 실패는 notification_logs에 남기고, 예약·신청 자체에는 영향이 없다.
//
// Env (Vercel → Settings → Environment Variables, never in the browser):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ADMIN_NOTIFY_EMAIL
//   NOTIFY_FROM (선택, 기본 "Fitin <onboarding@resend.dev>" — 이 기본 주소는 Resend 가입 이메일로만 보낼 수 있다)
const SITE = 'https://www.fitinconnection.com';
const FRESH_MS = 10 * 60 * 1000;
const KINDS = new Set(['booking_created', 'booking_cancelled', 'membership_created', 'diet_submitted', 'verification_submitted']);

const kst = (iso, withTime = true) => new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short',
  ...(withTime ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}),
}).format(new Date(iso));
const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fresh = (iso) => iso && Date.now() - new Date(iso).getTime() <= FRESH_MS;

const GOAL = { lose: '체중 감량', muscle: '근육 늘리기', gain: '체중 늘리기', maintain: '지금 유지', health: '건강하게 먹기' };
const CAFETERIA = { daily: '거의 매일', sometimes: '가끔', rarely: '거의 안 먹음' };
const DEPOSIT = { pending: '확인 대기', paid: '입금 확인', refunded: '환불 완료', forfeited: '환불 불가' };
const PLAN = { '1m': '1개월권', '2m': '2개월권', '3m': '3개월권' };

function db(url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  return {
    async get(path) {
      const r = await fetch(`${url}/rest/v1/${path}`, { headers });
      if (!r.ok) throw new Error(`read ${path.split('?')[0]} ${r.status}`);
      return r.json();
    },
    async email(userId) {
      const r = await fetch(`${url}/auth/v1/admin/users/${userId}`, { headers });
      return r.ok ? (await r.json()).email || null : null;
    },
    // 먼저 기록을 잡는다: 이미 있으면(다른 요청이 보냈거나 보내는 중) false
    async claim(row) {
      const r = await fetch(`${url}/rest/v1/notification_logs`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      if (r.status === 409) return null;
      if (!r.ok) throw new Error(`log ${r.status}`);
      return (await r.json())[0];
    },
    async finish(id, patch) {
      await fetch(`${url}/rest/v1/notification_logs?id=eq.${id}`, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch),
      });
    },
  };
}

async function member(api, userId) {
  const [p] = await api.get(`profiles?id=eq.${userId}&select=first_name,last_name,nickname,university,student_no`);
  const [diet] = await api.get(`diet_consults?user_id=eq.${userId}&select=instagram&order=created_at.desc&limit=1`).catch(() => []);
  const email = await api.email(userId);
  const name = [p?.first_name, p?.last_name].filter(Boolean).join(' ') || '이름 없음';
  return { name, nickname: p?.nickname, university: p?.university, studentNo: p?.student_no, email, instagram: diet?.instagram };
}

function memberRows(m) {
  return [
    ['회원', `${m.name}${m.nickname ? ` (@${m.nickname})` : ''}`],
    ['학교', m.university || '-'],
    ['이메일', m.email || '-'],
    ...(m.instagram ? [['인스타그램', `@${m.instagram}`]] : []),
  ];
}

// 이벤트별 내용. 알릴 필요가 없으면(오래됨·없음) null
async function build(api, kind, id) {
  if (kind === 'booking_created' || kind === 'booking_cancelled') {
    const [b] = await api.get(`bookings?id=eq.${Number(id)}&select=id,user_id,created_at,cancelled_at,deposit_status,pt_slots(starts_at,ends_at)`);
    if (!b) return null;
    const at = kind === 'booking_created' ? b.created_at : b.cancelled_at;
    if (!fresh(at)) return null;
    const m = await member(api, b.user_id);
    const slot = b.pt_slots || {};
    const time = `${kst(slot.starts_at)}~${slot.ends_at ? kst(slot.ends_at).split(' ').pop() : ''}`;
    const created = kind === 'booking_created';
    return {
      subject: `[Fitin] ${created ? '새 PT 예약' : 'PT 예약 취소'} · ${kst(slot.starts_at)} · ${m.name}`,
      title: created ? '새 PT 예약이 들어왔어요' : 'PT 예약이 취소됐어요',
      rows: [...memberRows(m), ['예약 시간', time], ['예약금', DEPOSIT[b.deposit_status] || b.deposit_status],
        [created ? '예약한 시각' : '취소한 시각', kst(at)]],
      note: created ? '' : '예약금 입금 여부를 확인하고, 환불이 필요하면 처리해 주세요.',
      link: `${SITE}/admin.html`,
    };
  }
  if (kind === 'membership_created') {
    const [ms] = await api.get(`memberships?id=eq.${Number(id)}&select=id,user_id,plan_code,starts_on,created_at,early_bird,pt_classes(name_ko),membership_payments(amount,installment_no)`);
    if (!ms || !fresh(ms.created_at)) return null;
    const m = await member(api, ms.user_id);
    const total = (ms.membership_payments || []).reduce((s, p) => s + (p.amount || 0), 0);
    return {
      subject: `[Fitin] 멤버십 신청 · ${PLAN[ms.plan_code] || ms.plan_code} · ${m.name}`,
      title: '멤버십 신청이 들어왔어요',
      rows: [...memberRows(m), ['요금제', `${PLAN[ms.plan_code] || ms.plan_code}${ms.early_bird ? ' (얼리버드)' : ''}`],
        ['반', ms.pt_classes?.name_ko || '-'], ['시작일', kst(ms.starts_on, false)], ['입금할 금액', won(total)]],
      note: '입금을 확인하면 관리자 페이지 "멤버십 신청" 탭에서 입금 확인을 눌러 주세요.',
      link: `${SITE}/admin.html`,
    };
  }
  if (kind === 'diet_submitted') {
    const [d] = await api.get(`diet_consults?id=eq.${Number(id)}&select=id,user_id,created_at,goal,meals_per_day,cafeteria,budget,avoid_foods,instagram,message`);
    if (!d || !fresh(d.created_at)) return null;
    const m = await member(api, d.user_id);
    return {
      subject: `[Fitin] 식단 상담 신청 · ${m.name} (@${d.instagram})`,
      title: '식단 상담 신청이 들어왔어요',
      rows: [...memberRows({ ...m, instagram: d.instagram }), ['목표', GOAL[d.goal] || d.goal], ['하루 식사', `${d.meals_per_day}끼`],
        ['학식', CAFETERIA[d.cafeteria] || d.cafeteria], ['하루 식비', d.budget ? won(d.budget) : '-'],
        ['못 먹는 음식', d.avoid_foods || '-'], ['남긴 말', d.message || '-']],
      note: '인스타그램 DM으로 연락한 뒤 관리자 페이지 "식단 상담" 탭에서 상태를 바꿔 주세요.',
      link: `https://ig.me/m/${encodeURIComponent(d.instagram)}`,
      linkLabel: 'DM 보내기',
    };
  }
  if (kind === 'verification_submitted') {
    const userId = String(id).split(':')[0];
    if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
    const [p] = await api.get(`profiles?id=eq.${userId}&select=verify_status,verify_submitted_at`);
    if (!p || p.verify_status !== 'pending' || !fresh(p.verify_submitted_at)) return null;
    const m = await member(api, userId);
    return {
      subject: `[Fitin] 학생증 확인 요청 · ${m.name}`,
      title: '학생증 확인 요청이 들어왔어요',
      rows: [...memberRows(m), ['학번', m.studentNo || '-'], ['제출 시각', kst(p.verify_submitted_at)]],
      note: '관리자 페이지 "가입 승인" 탭에서 사진을 보고 승인 또는 거절해 주세요.',
      link: `${SITE}/admin.html`,
    };
  }
  return null;
}

function html(c) {
  const rows = c.rows.map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#777;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:6px 0">${esc(v)}</td></tr>`).join('');
  return `<div style="font-family:-apple-system,Segoe UI,Apple SD Gothic Neo,sans-serif;font-size:15px;color:#1b1c21;max-width:520px">
  <h2 style="margin:0 0 14px;font-size:20px">${esc(c.title)}</h2>
  <table style="border-collapse:collapse">${rows}</table>
  ${c.note ? `<p style="margin:14px 0 0;color:#555">${esc(c.note)}</p>` : ''}
  <p style="margin:18px 0 0"><a href="${esc(c.link)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#c9a54e;color:#131418;text-decoration:none;font-weight:600">${esc(c.linkLabel || '관리자 페이지 열기')}</a></p>
  <p style="margin:18px 0 0;font-size:12px;color:#999">FitinConnection 자동 알림</p></div>`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const { kind, id } = req.body || {};
  if (!KINDS.has(kind) || !id || String(id).length > 80) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, ADMIN_NOTIFY_EMAIL } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }
  const api = db(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  try {
    const content = await build(api, kind, String(id));
    if (!content) {
      res.status(200).json({ ok: true, skipped: 'not_found_or_old' });
      return;
    }
    const log = await api.claim({ event_kind: kind, ref_id: String(id), channel: 'email', recipient: ADMIN_NOTIFY_EMAIL || null, subject: content.subject });
    if (!log) {
      res.status(200).json({ ok: true, skipped: 'already_sent' });
      return;
    }
    if (!RESEND_API_KEY || !ADMIN_NOTIFY_EMAIL) {
      await api.finish(log.id, { status: 'failed', error: 'RESEND_API_KEY / ADMIN_NOTIFY_EMAIL 환경변수가 없어요' });
      res.status(200).json({ ok: false, error: 'email_not_configured' });
      return;
    }
    const send = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.NOTIFY_FROM || 'Fitin <onboarding@resend.dev>',
        to: [ADMIN_NOTIFY_EMAIL],
        subject: content.subject,
        html: html(content),
      }),
    });
    if (!send.ok) {
      const detail = (await send.text()).slice(0, 300);
      await api.finish(log.id, { status: 'failed', error: `Resend ${send.status}: ${detail}` });
      res.status(200).json({ ok: false, error: 'send_failed' });
      return;
    }
    await api.finish(log.id, { status: 'sent', sent_at: new Date().toISOString() });
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'failed' });
  }
};
