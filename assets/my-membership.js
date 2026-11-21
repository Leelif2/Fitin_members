// 마이페이지 "내 멤버십" 영역: 관리자가 배정한 운동 요일, 남은 회차, 만료일, 게더링·이벤트 신청 내역, 결제(분할) 내역.
// 보강은 없음(0044). 운동 요일은 관리자만 배정한다.
// 규칙은 DB 함수(0015_membership.sql)가 검사하고, 여기서는 보여주고 버튼만 연결한다.
import { supabase } from './supabase-client.js';
import { tr, textEl, el, wonPair, payDmBox, datePair, dateTimePair, weekdaysPair, errorText, EVENT_KIND, PAYMENT_STATUS, kstToday, addDays, refreshOnReturn } from './membership-ui.js';

export function initMyMembership(mount) {
  const msg = el('p', 'ms-message');
  msg.setAttribute('role', 'status');

  function say(en, ko, kind = '') {
    msg.dataset.i18nEn = en;
    msg.dataset.i18nKo = ko;
    msg.textContent = tr(en, ko);
    msg.className = 'ms-message' + (kind ? ' is-' + kind : '');
  }
  function sayError(error) {
    msg.removeAttribute('data-i18n-en');
    msg.removeAttribute('data-i18n-ko');
    msg.textContent = errorText(error);
    msg.className = 'ms-message is-error';
  }

  async function act(promise, okEn, okKo) {
    const { error } = await promise;
    await load();
    if (error) sayError(error);
    else say(okEn, okKo, 'success');
  }

  function stat(kEn, kKo, bigEn, bigKo, subEn, subKo) {
    const card = el('div', 'ms-card');
    card.append(textEl('div', 'ms-kicker', kEn, kKo), textEl('div', 'ms-big', bigEn, bigKo));
    if (subEn) card.append(textEl('div', 'ms-muted', subEn, subKo));
    return card;
  }

  function renderNone(data) {
    const box = el('div', 'ms-card');
    box.append(textEl('div', 'ms-muted', 'You don’t have a membership yet.', '아직 멤버십이 없어요.'));
    for (const w of data.waitlist || []) {
      box.append(textEl('div', '', `Waitlist: ${w.name_en} — #${w.position}`, `대기 중: ${w.name_ko} — ${w.position}번째`));
      const leave = textEl('button', 'btn btn-ghost', 'Leave waitlist', '대기 취소');
      leave.type = 'button';
      leave.addEventListener('click', () => act(supabase.rpc('leave_waitlist', { p_class: w.class_code }), 'Removed from the waitlist.', '대기를 취소했어요.'));
      box.append(leave);
    }
    const link = textEl('a', 'btn btn-primary', 'See plans and join', '요금제 보고 가입하기');
    link.href = 'membership.html#join';
    link.style.marginTop = '12px';
    box.append(el('div', '', [link]));
    return box;
  }

  function renderPayments(data) {
    const box = el('div', 'ms-card');
    box.append(textEl('div', 'ms-kicker', 'Payments', '결제 내역'));
    const list = el('ul', 'ms-list');
    for (const p of data.payments) {
      const [dEn, dKo] = datePair(p.due_on, false);
      const label = data.payments.length > 1 ? [`Payment ${p.installment_no}`, `${p.installment_no}회차`] : ['Payment', '결제'];
      list.append(el('li', 'ms-row', [
        el('span', '', [textEl('span', '', ...label), ' · ', textEl('span', 'ms-muted', `due ${dEn}`, `${dKo}까지`)]),
        el('span', '', [textEl('span', '', ...wonPair(p.amount)), ' ', textEl('span', p.status === 'paid' ? 'ms-tag is-strong' : 'ms-tag', ...PAYMENT_STATUS[p.status])]),
      ]));
    }
    box.append(list);
    if (data.payments.some((p) => p.status === 'pending')) {
      box.append(payDmBox());
    }
    return box;
  }

  async function renderEvents() {
    const box = el('div', 'ms-card');
    box.append(el('div', 'ms-row', [textEl('div', 'ms-kicker', 'Gatherings & events', '게더링 · 이벤트 신청 내역'), Object.assign(textEl('a', '', 'Open calendar', '캘린더 보기'), { href: 'calendar.html' })]));
    const { data, error } = await supabase.rpc('list_crew_events', { p_from: kstToday(), p_to: addDays(kstToday(), 120) });
    const list = el('ul', 'ms-list');
    const mine = (data || []).filter((e) => e.my_registration_id);
    if (error) list.append(el('li', 'ms-muted', errorText(error)));
    else if (!mine.length) list.append(textEl('li', 'ms-muted', 'No upcoming registrations. Find one in the calendar.', '신청한 일정이 없어요. 캘린더에서 신청할 수 있어요.'));
    for (const e of mine) {
      const [tEn, tKo] = dateTimePair(e.starts_at);
      const cancel = textEl('button', 'btn btn-ghost', 'Cancel', '취소');
      cancel.type = 'button';
      cancel.addEventListener('click', () => act(supabase.rpc('cancel_event_registration', { p_event_id: e.id }), 'Registration cancelled.', '신청을 취소했어요.'));
      list.append(el('li', 'ms-row', [
        el('span', '', [textEl('span', 'ms-tag', ...EVENT_KIND[e.kind]), ' ', e.title, ' ', textEl('span', 'ms-muted', tEn, tKo)]),
        cancel,
      ]));
    }
    box.append(list);
    return box;
  }

  async function load() {
    const { data, error } = await supabase.rpc('my_membership');
    mount.innerHTML = '';
    mount.append(textEl('h2', 'profile-name', 'My membership', '내 멤버십'));
    if (error) {
      mount.append(textEl('div', 'ms-card ms-notice', 'Membership is being set up — please check back soon.', '멤버십 기능을 준비 중이에요. 잠시 후 다시 확인해 주세요.'));
      return;
    }
    const m = data.membership;
    if (!m) {
      mount.append(renderNone(data), msg);
      return;
    }

    const pending = m.status === 'pending';
    const [eEn, eKo] = datePair(m.ends_on, false);
    const head = el('div', 'ms-card');
    head.append(el('div', 'ms-row', [
      textEl('strong', '', `${m.plan_name_en} · ${m.class_name_en}`, `${m.plan_name_ko} · ${m.class_name_ko}`),
      textEl('span', pending ? 'ms-tag' : 'ms-tag is-strong', pending ? 'Awaiting transfer' : 'Active', pending ? '입금 대기' : '이용 중'),
    ]));
    if (pending) {
      const cancel = textEl('button', 'btn btn-ghost', 'Cancel application', '신청 취소');
      cancel.type = 'button';
      cancel.addEventListener('click', () => {
        if (!window.confirm(tr('Cancel this application? Your seat will be released.', '신청을 취소할까요? 잡아둔 자리가 다른 사람에게 열려요.'))) return;
        act(supabase.rpc('cancel_pending_membership'), 'Application cancelled.', '신청을 취소했어요.');
      });
      head.append(cancel);
    }

    if (m.assigned === false) {
      head.append(textEl('div', 'ms-muted', 'The trainer will assign your 2 fixed workout days soon. You’ll get a notice.', '트레이너가 주 2회 고정 운동 요일을 곧 정해 드려요. 정해지면 알림이 가요.'));
    }
    const nextPair = m.next_session ? datePair(m.next_session) : ['—', '—'];
    const stats = el('div', 'ms-grid', [
      stat('Workouts left', '남은 운동', `${m.sessions_left} / ${m.sessions_total}`, `${m.sessions_left} / ${m.sessions_total}회`),
      stat('Expires', '만료일', eEn, eKo,
        m.extended_weeks > 0 ? `+${m.extended_weeks} week(s) for breaks` : '', m.extended_weeks > 0 ? `휴강으로 ${m.extended_weeks}주 연장` : ''),
      stat('Next workout', '다음 운동', `${nextPair[0]} ${m.next_session ? m.next_start_time : ''}`, `${nextPair[1]} ${m.next_session ? m.next_start_time : ''}`),
    ]);

    const grid = el('div', '', [head, el('div', '', [stats])]);
    grid.style.display = 'grid';
    grid.style.gap = '12px';
    grid.append(await renderEvents(), renderPayments(data));
    mount.append(grid, msg);
  }

  load();
  refreshOnReturn(load);
}
