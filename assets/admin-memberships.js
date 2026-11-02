// 관리자 화면 "멤버십 신청" 탭: 회차별 입금 확인, 입금하지 않은 신청 취소, 대기자 알림 확인.
// 쓰기는 관리자 RLS 정책(0015 *_admin_write)으로 허용된다. 1회차를 "입금 확인"으로 바꾸면
// DB 트리거(activate_membership_on_payment)가 멤버십을 "이용 중"으로 바꾼다.
import { tr, textEl, el, datePair, weekdaysPair, PAYMENT_STATUS } from './membership-ui.js';

const STATUS = {
  pending: ['Awaiting transfer', '입금 대기'],
  active: ['Active', '이용 중'],
  expired: ['Expired', '만료'],
  cancelled: ['Cancelled', '취소'],
};
const GENDER = { male: ['Male', '남'], female: ['Female', '여'] };

// DB의 membership_end_on과 같은 계산: 기간 안의 휴강 주만큼 주 단위 연장
function endOn(startsOn, weeks, holidays) {
  let total = weeks;
  for (let i = 0; i < 20; i++) {
    const limit = new Date(`${startsOn}T00:00:00Z`);
    limit.setUTCDate(limit.getUTCDate() + total * 7);
    const inside = holidays.filter((h) => h >= startsOn && h < limit.toISOString().slice(0, 10)).length;
    if (weeks + inside === total) break;
    total = weeks + inside;
  }
  const end = new Date(`${startsOn}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + total * 7 - 1);
  return { end: end.toISOString().slice(0, 10), extended: total - weeks };
}

export function initAdminMemberships({ supabase, panel, tabLabel, getProfiles, setMessage }) {
  const state = { memberships: [], payments: [], classes: new Map(), plans: new Map(), alerts: [], holidays: [] };

  const toolbar = el('div', 'toolbar');
  const field = el('div', 'field');
  const label = textEl('label', '', 'Status', '신청 상태');
  label.htmlFor = 'membership-status-filter';
  const filter = document.createElement('select');
  filter.className = 'input';
  filter.id = 'membership-status-filter';
  for (const [value, en, ko] of [['open', 'Awaiting + active', '입금 대기 + 이용 중'], ['pending', ...STATUS.pending], ['active', ...STATUS.active], ['cancelled', ...STATUS.cancelled], ['all', 'All', '전체']]) {
    const opt = textEl('option', '', en, ko);
    opt.value = value;
    filter.append(opt);
  }
  field.append(label, filter);
  toolbar.append(field);

  const alertsBox = el('div', '');
  const note = textEl('p', 'muted', 'Mark payment 1 as “Paid” to start the membership. Cancel applications that never paid to free the seat.', '1회차를 "입금 확인"으로 바꾸면 멤버십이 시작돼요. 입금하지 않은 신청은 "신청 취소"로 자리를 비워 주세요.');
  note.style.cssText = 'margin:0 0 14px;font-size:13px';
  const wrap = el('div', 'table-wrap');
  const table = el('table', 'admin-table');
  const thead = el('thead');
  const headRow = el('tr');
  for (const [en, ko] of [['Applied', '신청일'], ['Member', '회원'], ['Plan · class', '요금제 · 반'], ['Period', '기간'], ['Payments', '결제'], ['Status', '상태'], ['', '']]) headRow.append(textEl('th', '', en, ko));
  thead.append(headRow);
  const body = el('tbody');
  table.append(thead, body);
  wrap.append(table);
  panel.append(alertsBox, note, toolbar, wrap);

  filter.addEventListener('change', render);

  function memberCell(userId) {
    const p = getProfiles().find((x) => x.id === userId);
    if (!p) return textEl('span', 'muted', 'Unknown member', '알 수 없는 회원');
    const name = [p.first_name, p.last_name].filter(Boolean).join(' ') || tr('Unnamed', '이름 없음');
    const cell = el('div', '', [el('strong', '', name)]);
    const extra = [p.university, p.gender && GENDER[p.gender] ? tr(...GENDER[p.gender]) : null].filter(Boolean).join(' · ');
    if (extra) cell.append(el('div', 'muted', extra));
    return cell;
  }

  async function savePayment(payment, status) {
    const update = { status, paid_at: status === 'paid' ? new Date().toISOString() : null };
    const { error } = await supabase.from('membership_payments').update(update).eq('id', payment.id);
    if (error) { setMessage(error.message, 'error'); await load(); return; }
    await load();
    setMessage(tr('Payment status updated.', '입금 상태를 바꿨어요.'), 'success');
  }

  async function cancelMembership(m) {
    if (!window.confirm(tr('Cancel this unpaid application? The seat will open up for others.', '입금하지 않은 이 신청을 취소할까요? 자리가 다른 학생에게 열려요.'))) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('memberships').update({ status: 'cancelled', cancelled_at: now }).eq('id', m.id).eq('status', 'pending');
    if (!error) await supabase.from('membership_payments').update({ status: 'cancelled' }).eq('membership_id', m.id).eq('status', 'pending');
    await load();
    if (error) setMessage(error.message, 'error');
    else setMessage(tr('Application cancelled.', '신청을 취소했어요.'), 'success');
  }

  async function resolveAlert(alert) {
    const { error } = await supabase.from('admin_alerts').update({ resolved_at: new Date().toISOString() }).eq('id', alert.id);
    await load();
    if (error) setMessage(error.message, 'error');
  }

  function renderAlerts() {
    alertsBox.innerHTML = '';
    for (const a of state.alerts) {
      const box = el('div', 'ms-card ms-row');
      box.style.marginBottom = '10px';
      const ok = textEl('button', 'btn btn-secondary', 'Mark as read', '확인');
      ok.type = 'button';
      ok.addEventListener('click', () => resolveAlert(a));
      box.append(el('span', '', [el('strong', '', '🔔 '), textEl('span', '', a.message_en, a.message_ko)]), ok);
      alertsBox.append(box);
    }
  }

  function render() {
    renderAlerts();
    const pendingCount = state.memberships.filter((m) => m.status === 'pending').length;
    tabLabel.dataset.i18nEn = `Memberships${pendingCount ? ` (${pendingCount})` : ''}`;
    tabLabel.dataset.i18nKo = `멤버십 신청${pendingCount ? ` (${pendingCount})` : ''}`;
    tabLabel.textContent = tr(tabLabel.dataset.i18nEn, tabLabel.dataset.i18nKo);

    const f = filter.value;
    const rows = state.memberships
      .filter((m) => f === 'all' || (f === 'open' ? ['pending', 'active'].includes(m.status) : m.status === f))
      // 입금 대기를 맨 위로, 그 안에서는 최근 신청 순
      .sort((a, b) => (b.status === 'pending') - (a.status === 'pending') || b.created_at.localeCompare(a.created_at));
    body.innerHTML = '';
    if (!rows.length) {
      const tr0 = el('tr');
      const td = textEl('td', 'empty', 'No applications yet.', '신청 내역이 없어요.');
      td.colSpan = 7;
      tr0.append(td);
      body.append(tr0);
      return;
    }
    for (const m of rows) {
      const c = state.classes.get(m.class_id);
      const p = state.plans.get(m.plan_code);
      const { end, extended } = endOn(m.starts_on, m.weeks, state.holidays);
      const row = el('tr');

      row.append(el('td', '', [textEl('span', '', ...datePair(m.created_at.slice(0, 10), false))]));
      row.append(el('td', '', [memberCell(m.user_id)]));

      const [dEn, dKo] = c ? weekdaysPair(c.weekdays) : ['', ''];
      row.append(el('td', '', [
        textEl('div', '', `${p ? p.name_en : m.plan_code} · ${c ? c.name_en : ''}`, `${p ? p.name_ko : m.plan_code} · ${c ? c.name_ko : ''}`),
        textEl('div', 'muted', `${dEn} ${c ? c.start_time.slice(0, 5) : ''} · ${m.payment_option === 'installment' ? 'installments' : 'one payment'}`, `${dKo} ${c ? c.start_time.slice(0, 5) : ''} · ${m.payment_option === 'installment' ? '분할' : '일시불'}`),
      ]));

      const [sEn, sKo] = datePair(m.starts_on, false);
      const [eEn, eKo] = datePair(end, false);
      row.append(el('td', '', [
        textEl('div', '', `${sEn} – ${eEn}`, `${sKo} – ${eKo}`),
        extended ? textEl('div', 'muted', `+${extended} wk break`, `휴강 ${extended}주 연장`) : null,
      ]));

      const payCell = el('td', '');
      for (const pay of state.payments.filter((x) => x.membership_id === m.id).sort((a, b) => a.installment_no - b.installment_no)) {
        const line = el('div', '');
        line.style.cssText = 'display:flex;align-items:center;gap:6px;margin:2px 0';
        const [duEn, duKo] = datePair(pay.due_on, false);
        line.append(textEl('span', '', `#${pay.installment_no} KRW ${pay.amount.toLocaleString('en-US')} (${duEn})`, `${pay.installment_no}회차 ${pay.amount.toLocaleString('ko-KR')}원 (${duKo})`));
        const sel = document.createElement('select');
        for (const [value, [en, ko]] of Object.entries(PAYMENT_STATUS)) {
          const opt = textEl('option', '', en, ko);
          opt.value = value;
          opt.selected = value === pay.status;
          sel.append(opt);
        }
        sel.disabled = m.status === 'cancelled';
        sel.addEventListener('change', () => { sel.disabled = true; savePayment(pay, sel.value); });
        line.append(sel);
        payCell.append(line);
      }
      row.append(payCell);

      row.append(el('td', '', [textEl('span', m.status === 'active' ? 'ms-tag is-strong' : 'ms-tag', ...STATUS[m.status])]));

      const actions = el('td', '');
      if (m.status === 'pending') {
        const cancel = textEl('button', 'btn btn-secondary', 'Cancel application', '신청 취소');
        cancel.type = 'button';
        cancel.addEventListener('click', () => cancelMembership(m));
        actions.append(cancel);
      }
      row.append(actions);
      body.append(row);
    }
  }

  async function load() {
    const [ms, pays, classes, plans, alerts, holidays] = await Promise.all([
      supabase.from('memberships').select('id, user_id, plan_code, class_id, payment_option, status, starts_on, weeks, created_at').order('created_at', { ascending: false }).limit(1000),
      supabase.from('membership_payments').select('id, membership_id, installment_no, amount, due_on, status, paid_at').limit(3000),
      supabase.from('pt_classes').select('id, code, name_ko, name_en, weekdays, start_time'),
      supabase.from('membership_plans').select('code, name_ko, name_en'),
      supabase.from('admin_alerts').select('id, kind, message_ko, message_en, created_at').eq('kind', 'waitlist').is('resolved_at', null).order('created_at', { ascending: false }),
      supabase.from('holiday_weeks').select('week_start'),
    ]);
    const err = ms.error || pays.error || classes.error || plans.error || alerts.error || holidays.error;
    if (err) {
      body.innerHTML = '';
      const tr0 = el('tr');
      const td = textEl('td', 'empty', 'Membership tables aren’t set up yet (run 0015 SQL).', '멤버십 DB가 아직 준비되지 않았어요 (0015 SQL 실행 필요).');
      td.colSpan = 7;
      tr0.append(td);
      body.append(tr0);
      return;
    }
    state.memberships = ms.data;
    state.payments = pays.data;
    state.classes = new Map(classes.data.map((c) => [c.id, c]));
    state.plans = new Map(plans.data.map((p) => [p.code, p]));
    state.alerts = alerts.data;
    state.holidays = holidays.data.map((h) => h.week_start);
    render();
  }

  window.addEventListener('fitin:lang-change', () => setTimeout(render, 0));
  return { load };
}
