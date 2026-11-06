// 관리자 화면: 알림 메일 발송 결과 (6단계, supabase/migrations/0032_admin_notifications.sql)
// 최근 7일 안에 실패한 알림이 있으면 배너로 보여주고, 누르면 최근 알림 기록(성공·실패)을 펼친다.
import { tr, textEl, el, dateTimePair } from './membership-ui.js';

const KIND = {
  booking_created: ['New PT booking', '새 PT 예약'],
  booking_cancelled: ['PT booking cancelled', 'PT 예약 취소'],
  membership_created: ['Membership application', '멤버십 신청'],
  diet_submitted: ['Diet consult', '식단 상담'],
  verification_submitted: ['Student ID submitted', '학생증 제출'],
};
const STATUS = { sent: ['Sent', '보냄'], failed: ['Failed', '실패'], pending: ['Sending', '보내는 중'], skipped: ['Skipped', '건너뜀'] };

export function initAdminNotify({ supabase, mount }) {
  const details = el('details', 'verification-alert');
  details.style.cssText = 'display:block;cursor:default';
  details.hidden = true;
  const summary = el('summary', 'verification-alert-copy');
  summary.style.cursor = 'pointer';
  const list = el('div', '');
  list.style.cssText = 'margin-top:10px;display:grid;gap:4px;font-size:13px;font-weight:400';
  details.append(summary, list);
  mount.append(details);
  let rows = [];

  async function load() {
    const since = new Date(Date.now() - 7 * 86400000).toISOString();
    const { data, error } = await supabase.from('notification_logs')
      .select('event_kind, ref_id, status, error, subject, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(50);
    if (error) { details.hidden = true; return; } // 0032 실행 전
    rows = data || [];
    render();
  }

  function render() {
    const failed = rows.filter((r) => r.status === 'failed');
    details.hidden = failed.length === 0;
    summary.replaceChildren(el('i', 'ph ph-warning'), ' ',
      textEl('span', '', `${failed.length} notification email${failed.length === 1 ? '' : 's'} failed in the last 7 days — tap to see why`,
        `최근 7일 알림 메일 실패 ${failed.length}건 — 눌러서 원인 보기`));
    list.replaceChildren(...rows.map((r) => {
      const line = el('div', '', [
        el('span', 'muted', [tr(...dateTimePair(r.created_at))]), ' · ',
        el('span', '', [tr(...(KIND[r.event_kind] || [r.event_kind, r.event_kind]))]), ' · ',
        textEl('strong', '', ...(STATUS[r.status] || [r.status, r.status])),
      ]);
      if (r.status === 'failed' && r.error) {
        const why = el('div', 'muted', [r.error]);
        why.style.cssText = 'margin:2px 0 6px;overflow-wrap:anywhere';
        return el('div', '', [line, why]);
      }
      return line;
    }));
  }

  window.addEventListener('fitin:lang-change', render);
  return { load };
}
