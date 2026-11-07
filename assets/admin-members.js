// 관리자 화면 "회원 관리" 탭 (4단계, supabase/migrations/0031_member_admin_and_withdrawal.sql)
//   목록: 이름·닉네임·학교·이메일·가입일·마지막 로그인·PT 예약(참석)·멤버십·학생증 상태 — 검색·학교·정렬
//   상세: 회원을 누르면 가입 정보 / 로그인 기록 / PT 예약 / 멤버십·결제 / 식단 상담·시간표 / 관리자 메모
import { tr, textEl, el, dateTimePair, datePair } from './membership-ui.js';

const VERIFY = { approved: ['Approved', '승인'], pending: ['Pending', '확인 대기'], rejected: ['Rejected', '거절'], none: ['Not submitted', '미제출'] };
const MEMBERSHIP = { active: ['Active', '이용 중'], pending: ['Awaiting payment', '입금 대기'], expired: ['Expired', '만료'] };
const PLAN = { '1m': ['1-month', '1개월권'], '2m': ['2-month', '2개월권'], '3m': ['3-month', '3개월권'] };
const GENDER = { male: ['Male', '남'], female: ['Female', '여'] };
const EVENT = { login: ['Log in', '로그인'], logout: ['Log out', '로그아웃'], login_failed: ['Failed log-in', '로그인 실패'], signup: ['Sign up', '가입'] };
const DEPOSIT = { pending: ['Fee pending', '이용료 확인 대기'], paid: ['Fee paid', '이용료 입금'], refunded: ['Refunded', '환불'], forfeited: ['Forfeited', '환불 불가'] };
const ATTEND = { scheduled: ['Scheduled', '예약됨'], attended: ['Attended', '참석'], no_show: ['No-show', '노쇼'] };
const PAY = { pending: ['pending', '대기'], paid: ['paid', '입금'], refunded: ['refunded', '환불'], cancelled: ['cancelled', '취소'] };
const DIET_STATUS = { new: ['New', '새로'], contacted: ['Contacted', '연락함'], done: ['Done', '완료'] };
const DIET_GOAL = { lose: ['Lose weight', '감량'], muscle: ['Build muscle', '근육'], gain: ['Gain weight', '증량'], maintain: ['Maintain', '유지'], health: ['Eat healthier', '건강'] };

const pair = (map, key) => (map[key] ? tr(...map[key]) : (key || '-'));
const when = (ts) => (ts ? tr(...dateTimePair(ts)) : '-');
const day = (ts) => (ts ? tr(...datePair(new Date(ts).toISOString().slice(0, 10), false)) : '-');

export function initAdminMembers({ supabase, panel, searchInput, schoolSelect, sortSelect, schoolName, getAttendance, setMessage }) {
  const state = { rows: [], openId: null, detail: null, error: false };

  const detailBox = el('div', '');
  const tableWrap = el('div', 'table-wrap');
  panel.append(detailBox, tableWrap);

  async function load() {
    const { data, error } = await supabase.rpc('admin_member_list');
    state.error = Boolean(error);
    state.rows = data || [];
    render();
  }

  function name(r) {
    return [r.first_name, r.last_name].filter(Boolean).join(' ') || tr('Unnamed', '이름 없음');
  }

  function filtered() {
    const q = searchInput.value.trim().toLowerCase();
    const school = schoolSelect.value;
    const rows = state.rows.filter((r) => {
      if (school && schoolName(r.university) !== school) return false;
      if (!q) return true;
      return [name(r), r.nickname, r.email, r.student_no, r.instagram].some((v) => String(v || '').toLowerCase().includes(q));
    });
    const by = sortSelect.value;
    const time = (v) => (v ? new Date(v).getTime() : 0);
    rows.sort((a, b) => {
      if (by === 'login') return time(b.last_login) - time(a.last_login);
      if (by === 'bookings') return (b.booking_count || 0) - (a.booking_count || 0);
      if (by === 'name') return name(a).localeCompare(name(b));
      return time(b.created_at) - time(a.created_at);
    });
    return rows;
  }

  function render() {
    tableWrap.replaceChildren();
    if (state.error) {
      tableWrap.append(textEl('p', 'empty', 'Run 0031_member_admin_and_withdrawal.sql in Supabase to turn this on.', 'Supabase에서 0031_member_admin_and_withdrawal.sql을 실행하면 사용할 수 있어요.'));
      return;
    }
    const rows = filtered();
    const table = el('table', 'admin-table');
    const head = el('tr', '');
    for (const [en, ko] of [['Name', '이름'], ['School', '학교'], ['Email', '이메일'], ['Joined', '가입일'], ['Last log-in', '마지막 로그인'], ['PT (attended)', 'PT 예약 (참석)'], ['Membership', '멤버십'], ['Student ID', '학생증']]) {
      head.append(textEl('th', '', en, ko));
    }
    table.append(el('thead', '', [head]));
    const body = el('tbody', '');
    if (!rows.length) {
      const td = textEl('td', 'empty', 'No members to display.', '표시할 회원이 없습니다.');
      td.colSpan = 8;
      body.append(el('tr', '', [td]));
    }
    for (const r of rows) {
      const tr_ = el('tr', '');
      tr_.style.cursor = 'pointer';
      if (r.id === state.openId) tr_.style.background = 'color-mix(in srgb, var(--color-accent) 10%, transparent)';
      const nameCell = el('td', '', [el('strong', '', [name(r)])]);
      if (r.nickname) nameCell.append(el('div', 'muted', [`@${r.nickname}`]));
      if (r.role === 'admin') nameCell.append(textEl('div', 'muted', 'Admin', '관리자'));
      const att = getAttendance(r.id);
      const ms = r.membership_status ? `${pair(PLAN, r.membership_plan)} · ${pair(MEMBERSHIP, r.membership_status)}` : '-';
      tr_.append(
        nameCell,
        el('td', '', [schoolName(r.university)]),
        el('td', '', [r.email || '-']),
        el('td', '', [day(r.created_at)]),
        el('td', '', [when(r.last_login)]),
        el('td', '', [`${r.booking_count || 0} (${att?.count || 0})`]),
        el('td', '', [ms]),
        el('td', '', [pair(VERIFY, r.verify_status)]),
      );
      tr_.addEventListener('click', () => open(r.id));
      body.append(tr_);
    }
    table.append(body);
    tableWrap.append(table);
  }

  async function open(id) {
    state.openId = id;
    render();
    detailBox.replaceChildren(textEl('p', 'muted', 'Loading…', '불러오는 중…'));
    const { data, error } = await supabase.rpc('admin_member_detail', { p_user: id });
    if (error) {
      detailBox.replaceChildren();
      setMessage(error.message, 'error');
      return;
    }
    state.detail = data;
    renderDetail();
    detailBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function section(en, ko, children) {
    const box = el('div', '');
    box.style.cssText = 'padding:14px 0;border-top:1px solid var(--color-divider)';
    const h = textEl('h3', '', en, ko);
    h.style.cssText = 'margin:0 0 8px;font-size:15px';
    box.append(h, ...children);
    return box;
  }
  const empty = () => textEl('p', 'muted', 'None', '없음');
  const rowLine = (parts) => {
    const line = el('div', '', parts);
    line.style.cssText = 'display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13px;padding:3px 0';
    return line;
  };

  function renderDetail() {
    const d = state.detail;
    if (!d) { detailBox.replaceChildren(); return; }
    const p = d.profile;
    const card = el('div', 'card elev-sm');
    card.style.cssText = 'padding:18px;margin-bottom:18px';

    const head = el('div', '');
    head.style.cssText = 'display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:10px';
    const title = el('div', '', [el('h2', '', [[p.first_name, p.last_name].filter(Boolean).join(' ') || tr('Unnamed', '이름 없음')])]);
    title.firstChild.style.cssText = 'margin:0;font-size:22px';
    title.append(el('div', 'muted', [[p.nickname ? `@${p.nickname}` : null, p.email].filter(Boolean).join(' · ')]));
    const close = textEl('button', 'btn btn-ghost', 'Close', '닫기');
    close.type = 'button';
    close.addEventListener('click', () => { state.openId = null; state.detail = null; detailBox.replaceChildren(); render(); });
    head.append(title, close);
    card.append(head);

    // 가입 정보
    card.append(section('Profile', '가입 정보', [
      rowLine([textEl('span', 'muted', 'School', '학교'), el('span', '', [p.university || '-'])]),
      rowLine([textEl('span', 'muted', 'Student ID no.', '학번'), el('span', '', [p.student_no || '-']), textEl('span', 'muted', 'Status', '학생증'), el('span', '', [pair(VERIFY, p.verify_status)])]),
      rowLine([textEl('span', 'muted', 'Gender', '성별'), el('span', '', [pair(GENDER, p.gender)]), textEl('span', 'muted', 'Joined', '가입일'), el('span', '', [when(p.created_at)])]),
      rowLine([textEl('span', 'muted', 'Last sign-in', '마지막 로그인'), el('span', '', [when(p.last_sign_in_at)])]),
    ]));

    // 로그인 기록
    card.append(section('Recent log-ins', '최근 로그인 기록', d.logins.length ? d.logins.slice(0, 10).map((l) =>
      rowLine([el('span', '', [when(l.created_at)]), el('span', '', [pair(EVENT, l.event_type)]), el('span', 'muted', [l.device || '-']), el('span', 'muted', [l.ip_address || '-'])])) : [empty()]));

    // PT 예약
    card.append(section('PT bookings', 'PT 예약 내역', d.bookings.length ? d.bookings.slice(0, 15).map((b) =>
      rowLine([el('span', '', [when(b.starts_at)]),
        b.cancelled_at ? textEl('span', 'muted', 'Cancelled', '취소됨') : el('span', '', [pair(ATTEND, b.attendance_status)]),
        el('span', 'muted', [pair(DEPOSIT, b.deposit_status)])])) : [empty()]));

    // 멤버십
    card.append(section('Memberships', '멤버십 · 결제', d.memberships.length ? d.memberships.map((m) =>
      rowLine([el('strong', '', [pair(PLAN, m.plan_code)]), el('span', '', [tr(m.class_en || '-', m.class_ko || '-')]),
        el('span', '', [pair(MEMBERSHIP, m.status) || m.status]), el('span', 'muted', [day(m.starts_on)]),
        m.early_bird ? textEl('span', 'tag tag-accent', 'Early bird', '얼리버드') : null,
        el('span', 'muted', [(m.payments || []).map((x) => `${x.amount.toLocaleString('ko-KR')}${tr('', '원')} ${pair(PAY, x.status)}`).join(' · ')])])) : [empty()]));

    // 식단 상담 · 시간표
    card.append(section('Diet consults · timetable', '식단 상담 · 시간표', [
      ...(d.diet.length ? d.diet.map((x) => rowLine([el('span', '', [when(x.created_at)]), el('span', '', [pair(DIET_GOAL, x.goal)]), el('span', '', [`@${x.instagram}`]), el('span', 'muted', [pair(DIET_STATUS, x.status)])])) : [textEl('p', 'muted', 'No diet consults', '식단 상담 없음')]),
      rowLine([textEl('span', 'muted', 'Timetable uploaded', '시간표 올린 날'), el('span', '', [when(d.timetable_uploaded_at)])]),
    ]));

    // 관리자 메모
    const noteInput = el('textarea', 'input');
    noteInput.maxLength = 1000;
    noteInput.rows = 2;
    noteInput.placeholder = tr('Add a note (only admins can see it)', '메모 남기기 (관리자만 봐요)');
    noteInput.style.cssText = 'width:100%;font:inherit;resize:vertical';
    const add = textEl('button', 'btn btn-secondary', 'Add note', '메모 추가');
    add.type = 'button';
    add.style.marginTop = '6px';
    add.addEventListener('click', async () => {
      const body = noteInput.value.trim();
      if (!body) return;
      add.disabled = true;
      const { error } = await supabase.from('member_notes').insert({ member_id: p.id, body });
      add.disabled = false;
      if (error) { setMessage(error.message, 'error'); return; }
      await open(p.id);
    });
    const notes = d.notes.map((n) => {
      const del = textEl('button', 'btn btn-ghost', 'Delete', '삭제');
      del.type = 'button';
      del.addEventListener('click', async () => {
        if (!window.confirm(tr('Delete this note?', '이 메모를 지울까요?'))) return;
        const { error } = await supabase.from('member_notes').delete().eq('id', n.id);
        if (error) { setMessage(error.message, 'error'); return; }
        await open(p.id);
      });
      const line = rowLine([el('span', 'muted', [`${when(n.created_at)} · ${n.author}`]), del]);
      const text = el('div', '', [n.body]);
      text.style.cssText = 'white-space:pre-wrap;font-size:14px;margin:2px 0 8px';
      return el('div', '', [line, text]);
    });
    card.append(section('Admin notes', '관리자 메모', [noteInput, add, ...(notes.length ? notes : [])]));

    detailBox.replaceChildren(card);
  }

  searchInput.addEventListener('input', render);
  schoolSelect.addEventListener('change', render);
  sortSelect.addEventListener('change', render);
  window.addEventListener('fitin:lang-change', () => { render(); renderDetail(); });
  return { load, render };
}
