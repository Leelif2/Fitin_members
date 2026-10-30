// 마이페이지 "내 멤버십" 영역: 남은 PT 회차, 보강 남은 횟수, 만료일, 보강 신청, 게더링·이벤트 신청 내역, 결제(분할) 내역.
// 규칙은 DB 함수(0015_membership.sql)가 검사하고, 여기서는 보여주고 버튼만 연결한다.
import { supabase } from './supabase-client.js';
import { tr, textEl, el, datePair, dateTimePair, weekdaysPair, errorText, EVENT_KIND, PAYMENT_STATUS, kstToday, addDays, refreshOnReturn } from './membership-ui.js';

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
        el('span', '', [`${p.amount.toLocaleString('ko-KR')}`, textEl('span', '', ' KRW ', '원 '), textEl('span', p.status === 'paid' ? 'ms-tag is-strong' : 'ms-tag', ...PAYMENT_STATUS[p.status])]),
      ]));
    }
    box.append(list);
    if (data.payments.some((p) => p.status === 'pending')) {
      box.append(textEl('div', 'ms-muted', `Transfer to: ${data.bank_account} (sender: your name)`, `입금 계좌: ${data.bank_account} (입금자명: 본인 이름)`));
    }
    return box;
  }

  async function renderMakeups(m, data) {
    const box = el('div', 'ms-card');
    const [cEn, cKo] = datePair(m.cycle_ends_on, false);
    box.append(el('div', 'ms-row', [
      textEl('div', 'ms-kicker', 'Make-up classes', '보강'),
      textEl('span', 'ms-muted', `${m.makeups_left} left until ${cEn} (no carry-over)`, `${cKo}까지 ${m.makeups_left}회 남음 (이월 없음)`),
    ]));

    const booked = el('ul', 'ms-list');
    for (const b of data.makeups) {
      const [dEn, dKo] = datePair(b.session_date);
      const row = el('li', 'ms-row', [textEl('span', '', `${dEn} ${b.start_time} · ${b.class_name_en}`, `${dKo} ${b.start_time} · ${b.class_name_ko}`)]);
      if (b.cancellable) {
        const cancel = textEl('button', 'btn btn-ghost', 'Cancel', '취소');
        cancel.type = 'button';
        cancel.addEventListener('click', () => act(supabase.rpc('cancel_makeup', { p_id: b.id }), 'Make-up cancelled.', '보강을 취소했어요.'));
        row.append(cancel);
      }
      booked.append(row);
    }
    if (data.makeups.length) box.append(booked);

    if (m.status !== 'active') {
      box.append(textEl('div', 'ms-muted', 'Make-up booking opens once your payment is confirmed.', '입금이 확인되면 보강을 신청할 수 있어요.'));
      return box;
    }

    const toggle = textEl('button', 'btn btn-secondary', 'Book a make-up class', '보강 신청');
    toggle.type = 'button';
    const options = el('ul', 'ms-list');
    options.hidden = true;
    toggle.addEventListener('click', async () => {
      options.hidden = !options.hidden;
      if (options.hidden) return;
      options.replaceChildren(textEl('li', 'ms-muted', 'Loading…', '불러오는 중…'));
      const { data: rows, error } = await supabase.rpc('makeup_options', { p_days: 14 });
      options.innerHTML = '';
      if (error) { options.append(el('li', 'ms-muted', errorText(error))); return; }
      if (!rows.length) { options.append(textEl('li', 'ms-muted', 'No other classes in the next 2 weeks.', '앞으로 2주 안에 보강할 수 있는 수업이 없어요.')); return; }
      for (const o of rows) {
        const [dEn, dKo] = datePair(o.session_date);
        const btn = textEl('button', 'btn btn-primary', 'Book', '신청');
        btn.type = 'button';
        btn.disabled = o.free_seats <= 0 || o.cycle_full;
        btn.addEventListener('click', () => act(supabase.rpc('book_makeup', { p_class: o.class_code, p_date: o.session_date }), 'Make-up booked!', '보강을 신청했어요!'));
        options.append(el('li', 'ms-row', [
          el('span', '', [textEl('span', '', `${dEn} ${o.start_time} · ${o.class_name_en}`, `${dKo} ${o.start_time} · ${o.class_name_ko}`), ' ',
            textEl('span', 'ms-muted',
              o.free_seats > 0 ? (o.cycle_full ? '(limit reached for that period)' : `(${o.free_seats} free)`) : '(full)',
              o.free_seats > 0 ? (o.cycle_full ? '(그 4주 보강 횟수 소진)' : `(빈자리 ${o.free_seats})`) : '(마감)')]),
          btn,
        ]));
      }
    });
    box.append(el('div', '', [toggle]), options);
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
    const [daysEn, daysKo] = weekdaysPair(m.weekdays);
    const head = el('div', 'ms-card');
    head.append(el('div', 'ms-row', [
      textEl('strong', '', `${m.plan_name_en} · ${m.class_name_en} (${daysEn} ${m.start_time})`, `${m.plan_name_ko} · ${m.class_name_ko} (${daysKo} ${m.start_time})`),
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

    const nextPair = m.next_session ? datePair(m.next_session) : ['—', '—'];
    const stats = el('div', 'ms-grid', [
      stat('PT sessions left', '남은 PT', `${m.sessions_left} / ${m.sessions_total}`, `${m.sessions_left} / ${m.sessions_total}회`),
      stat('Make-ups left', '남은 보강', `${m.makeups_left}`, `${m.makeups_left}회`, 'this 4-week period', '이번 4주'),
      stat('Expires', '만료일', eEn, eKo,
        m.extended_weeks > 0 ? `+${m.extended_weeks} week(s) for breaks` : '', m.extended_weeks > 0 ? `휴강으로 ${m.extended_weeks}주 연장` : ''),
      stat('Next class', '다음 수업', `${nextPair[0]} ${m.next_session ? m.start_time : ''}`, `${nextPair[1]} ${m.next_session ? m.start_time : ''}`),
    ]);

    const grid = el('div', '', [head, el('div', '', [stats])]);
    grid.style.display = 'grid';
    grid.style.gap = '12px';
    grid.append(await renderMakeups(m, data), await renderEvents(), renderPayments(data));
    mount.append(grid, msg);
  }

  load();
  refreshOnReturn(load);
}
