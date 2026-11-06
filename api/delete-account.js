// Vercel serverless function — 회원 탈퇴 (4단계, supabase/migrations/0031_member_admin_and_withdrawal.sql).
// 브라우저는 계정을 지울 권한이 없어서, 로그인 토큰으로 본인임을 확인한 뒤 여기서 service_role 키로 지운다.
// 계정을 지우면 DB 규칙(on delete cascade)대로 프로필·예약·모임·로그인 기록·식단 상담 등이 함께 삭제되고,
// 결제 기록만 0021 규칙대로 이름 없이 5년 보관된다. 확인 대기 중인 학생증 사진도 저장소에서 지운다.
//
// Env (Vercel → Settings → Environment Variables, never in the browser):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: KEY } = process.env;
  if (!SUPABASE_URL || !KEY) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  // 실수로 누르는 것을 막으려고 화면에서 입력한 확인 문구를 같이 받는다
  const { confirm } = req.body || {};
  if (confirm !== 'DELETE') {
    res.status(400).json({ error: 'confirm_required' });
    return;
  }

  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    res.status(401).json({ error: 'not_signed_in' });
    return;
  }

  const admin = { apikey: KEY, Authorization: `Bearer ${KEY}` };

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` } });
    if (!userRes.ok) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }
    const user = await userRes.json();
    if (!user || !user.id) {
      res.status(401).json({ error: 'not_signed_in' });
      return;
    }

    // 관리자 계정은 여기서 지우지 않는다 (운영자가 실수로 관리 권한을 잃지 않게 — Supabase 대시보드에서 직접)
    const profRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=role`, { headers: admin });
    const prof = profRes.ok ? await profRes.json() : [];
    if (prof[0] && prof[0].role === 'admin') {
      res.status(403).json({ error: 'admin_cannot_delete' });
      return;
    }

    // 확인 대기 중이던 학생증 사진 정리 (없으면 그냥 지나감)
    const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/student-ids`, {
      method: 'POST',
      headers: { ...admin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix: user.id, limit: 100 }),
    });
    const files = listRes.ok ? await listRes.json() : [];
    if (Array.isArray(files) && files.length) {
      await fetch(`${SUPABASE_URL}/storage/v1/object/student-ids`, {
        method: 'DELETE',
        headers: { ...admin, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: files.map((f) => `${user.id}/${f.name}`) }),
      });
    }

    const delRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: admin });
    if (!delRes.ok) {
      res.status(500).json({ error: 'delete_failed' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'delete_failed' });
  }
};
