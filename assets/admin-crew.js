// 관리자 화면 3단계 탭: 반·출석(+휴강 주) / 게더링·등산·이벤트 / 제휴 장소 / 매출·통계(+예산·성비·설정).
// 쓰기는 관리자 RLS 정책(0015 *_admin_write), 계산은 관리자 전용 DB 함수(0018)가 담당한다.
import { tr, textEl, el, datePair, dateTimePair, weekdaysPair, EVENT_KIND, kstToday, addDays } from './membership-ui.js';

const DAY_INDEX = (iso) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; };
const mondayOf = (iso) => addDays(iso, 1 - DAY_INDEX(iso));
const won = (n) => `${Number(n).toLocaleString('ko-KR')}`;
const KO_ERR = {
  max_open_classes: ['Only 3 regular classes can be open at once.', '일반 반은 최대 3개까지 열 수 있어요.'],
  admin_only: ['Administrators only.', '관리자만 사용할 수 있어요.'],
  slot_in_use: ['Members are assigned to this slot. Move them to another slot first.', '이 시간대에 배정된 멤버가 있어요. 먼저 다른 시간대로 옮겨 주세요.'],
  capacity_below_assigned: ['Capacity can’t be lower than the members already assigned.', '이미 배정된 인원보다 정원을 작게 할 수 없어요.'],
  one_weekday_mon_fri: ['Pick one weekday from Monday to Friday.', '월~금 중 요일 하나를 골라 주세요.'],
  invalid_time: ['Start between 06:00 and 22:00, and 30–180 minutes long.', '시작은 06:00~22:00, 운동 시간은 30~180분으로 정해 주세요.'],
  same_weekday: ['The two slots must be on different days.', '두 시간대는 서로 다른 요일이어야 해요.'],
  max_two_slots: ['A member can have at most 2 slots.', '멤버 한 명에게 시간대는 최대 2개예요.'],
  slot_full: ['That slot is full. Raise its capacity or pick another slot.', '그 시간대 정원이 다 찼어요. 정원을 늘리거나 다른 시간대를 골라 주세요.'],
  invalid_class: ['That slot is closed or no longer exists.', '닫혔거나 없는 시간대예요.'],
  not_found: ['That membership has ended or was cancelled.', '끝났거나 취소된 멤버십이에요.'],
};

// 그달 마지막 금요일 (게더링 기본 날짜)
export function lastFridayOf(year, month0) {
  const d = new Date(Date.UTC(year, month0 + 1, 0));
  while (d.getUTCDay() !== 5) d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
function nextGatheringDate() {
  const today = kstToday();
  const [y, m] = today.split('-').map(Number);
  const thisMonth = lastFridayOf(y, m - 1);
  return thisMonth >= today ? thisMonth : lastFridayOf(m === 12 ? y + 1 : y, m === 12 ? 0 : m);
}

function field(labelEn, labelKo, input) {
  const wrap = el('div', 'field');
  const label = textEl('label', '', labelEn, labelKo);
  if (!input.id) input.id = `f-${Math.random().toString(36).slice(2, 9)}`;
  label.htmlFor = input.id;
  wrap.append(label, input);
  return wrap;
}
function input(type, attrs = {}) {
  const i = document.createElement(type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input');
  if (type !== 'textarea' && type !== 'select') i.type = type;
  i.className = 'input';
  Object.assign(i, attrs);
  return i;
}
function option(value, en, ko, selected = false) {
  const o = textEl('option', '', en, ko);
  o.value = value;
  o.selected = selected;
  return o;
}
function button(en, ko, cls = 'btn btn-secondary') {
  const b = textEl('button', cls, en, ko);
  b.type = 'button';
  return b;
}
function sectionTitle(en, ko) {
  const h = textEl('h2', '', en, ko);
  h.style.cssText = 'font-size:17px;margin:26px 0 10px';
  return h;
}
function table(headers) {
  const wrap = el('div', 'table-wrap');
  const t = el('table', 'admin-table');
  const tr0 = el('tr');
  for (const [en, ko] of headers) tr0.append(textEl('th', '', en, ko));
  const body = el('tbody');
  t.append(el('thead', '', [tr0]), body);
  wrap.append(t);
  return { wrap, body };
}
function emptyRow(body, cols, en, ko) {
  const td = textEl('td', 'empty', en, ko);
  td.colSpan = cols;
  body.append(el('tr', '', [td]));
}
const safeUrl = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };

export function initAdminCrew({ supabase, panels, getProfiles, setMessage }) {
  const state = { classes: [], holidays: [], assignments: [], exceptions: [], capacity: 12, events: [], places: [], expenses: [] };
  const profileName = (id) => {
    const p = getProfiles().find((x) => x.id === id);
    return p ? ([p.first_name, p.last_name].filter(Boolean).join(' ') || tr('Unnamed', '이름 없음')) : tr('Unknown', '알 수 없음');
  };
  const ok = (en, ko) => setMessage(tr(en, ko), 'success');
  const fail = (error) => {
    const code = Object.keys(KO_ERR).find((k) => (error?.message || '').includes(k));
    setMessage(code ? tr(...KO_ERR[code]) : (error?.message || tr('Something went wrong.', '문제가 생겼어요.')), 'error');
  };
  async function write(promise, en, ko) {
    const { error } = await promise;
    if (error) { fail(error); return false; }
    ok(en, ko);
    return true;
  }

  // ===================================================================
  // 1. 운동 일정: 멤버십 정원 · 운동 시간대 · 멤버 고정 요일 배정 · 날짜별 예외 (0044) + 출석 · 휴강 주
  //    규칙(요일 하나, 2개까지, 서로 다른 요일, 정원)은 DB가 검사하고 여기서는 보여주고 연결만 한다.
  // ===================================================================
  const cp = panels.classes;
  const DAYS = [[1, 'Mon', '월요일'], [2, 'Tue', '화요일'], [3, 'Wed', '수요일'], [4, 'Thu', '목요일'], [5, 'Fri', '금요일']];
  const daySelect = (value) => {
    const s = input('select');
    for (const [d, en, ko] of DAYS) s.append(option(String(d), en, ko, d === value));
    return s;
  };
  const hhmm = (t) => (t || '').slice(0, 5);
  const slots = () => state.classes.filter((c) => c.kind === 'regular' && !c.archived);
  const assignedCount = (id) => state.assignments.filter((a) => a.class_ids.includes(id)).length;

  // 멤버십 신청 정원
  const capInput = input('number', { min: 0, max: 500 });
  capInput.style.width = '90px';
  const capSave = button('Save', '저장', 'btn btn-primary');
  const capInfo = el('span', 'muted');

  // 운동 시간대 추가
  const newDay = daySelect(1);
  const newTime = input('time', { value: '19:00', step: 300 });
  const newDur = input('number', { value: 60, min: 30, max: 180 });
  newDur.style.width = '80px';
  const newCap = input('number', { value: 6, min: 1, max: 30 });
  newCap.style.width = '70px';
  const slotAdd = button('Add time slot', '시간대 추가', 'btn btn-primary');
  const slotTable = table([['Day', '요일'], ['Start', '시작'], ['Minutes', '운동 시간(분)'], ['Capacity', '정원'], ['Assigned', '배정'], ['Open', '운영'], ['', '']]);

  // 멤버 배정
  const assignBox = el('div', '');

  // 날짜별 예외
  const sxSlot = input('select');
  const sxDate = input('date', { value: kstToday() });
  const sxKind = input('select');
  sxKind.append(option('time', 'Change time', '시간 변경'), option('cancel', 'No workout that day', '그날 휴강'));
  const sxTime = input('time', { value: '19:00', step: 300 });
  const sxTimeField = field('New start', '바뀐 시작 시간', sxTime);
  const sxNote = input('text', { maxLength: 80, placeholder: tr('e.g. Gym maintenance', '예: 체육관 점검') });
  const sxAdd = button('Add change', '예외 추가', 'btn btn-primary');
  const sxTable = table([['Date', '날짜'], ['Slot', '시간대'], ['Change', '변경'], ['Note', '메모'], ['', '']]);

  // 출석 · 휴강 주
  const attDate = input('date', { value: kstToday() });
  const attBox = el('div', '');
  const holDate = input('date', { value: kstToday() });
  const holNote = input('text', { placeholder: tr('e.g. Midterms', '예: 중간고사'), maxLength: 40 });
  const holAdd = button('Add break week', '휴강 주 추가', 'btn btn-primary');
  const holTable = table([['Week', '주'], ['Note', '메모'], ['', '']]);
  const setupNote = el('div', '');

  cp.append(
    setupNote,
    sectionTitle('Membership capacity', '멤버십 신청 정원'),
    textEl('p', 'muted',
      'How many people can hold a membership at once (awaiting payment included). When it’s full, new people can only join the waitlist.',
      '동시에 멤버십을 가질 수 있는 인원이에요(입금 대기 포함). 다 차면 새로 오는 사람은 대기 등록만 할 수 있어요.'),
    el('div', 'toolbar', [field('Capacity', '정원(명)', capInput), capSave, capInfo]),
    sectionTitle('Workout time slots', '운동 시간대'),
    textEl('p', 'muted',
      'Only you can add or change these. One slot = one weekday. Each member comes to the 2 slots you assign, every week (twice a week, 8 times per 4 weeks). Friday slots skip the last Friday of each month (crew gathering).',
      '나만 추가·수정할 수 있어요. 시간대 하나 = 요일 하나예요. 멤버는 내가 배정한 시간대 2개에 매주 와요(주 2회, 4주 8회). 금요일 시간대는 매달 마지막 금요일(게더링)에 쉬어요.'),
    el('div', 'toolbar', [field('Day', '요일', newDay), field('Start', '시작', newTime), field('Minutes', '운동 시간(분)', newDur), field('Capacity', '정원', newCap), slotAdd]),
    slotTable.wrap,
    sectionTitle('Member workout days', '멤버 운동 요일 배정'),
    textEl('p', 'muted',
      'Pick 2 slots on different days for each member. Members can’t change this themselves and get a notice when you save.',
      '멤버마다 서로 다른 요일의 시간대 2개를 골라 주세요. 멤버는 직접 바꿀 수 없고, 저장하면 알림이 가요.'),
    assignBox,
    sectionTitle('One-day changes', '날짜별 예외'),
    textEl('p', 'muted',
      'Move one day’s workout to another time, or cancel just that day. Assigned members get a notice. A one-day cancellation doesn’t extend memberships — use break weeks for that.',
      '하루만 시간을 바꾸거나 그날만 쉴 수 있어요. 배정된 멤버에게 알림이 가요. 하루 휴강은 멤버십 기간을 늘리지 않아요(기간 연장은 휴강 주로).'),
    el('div', 'toolbar', [field('Slot', '시간대', sxSlot), field('Date', '날짜', sxDate), field('Change', '변경', sxKind), sxTimeField, field('Note', '메모', sxNote), sxAdd]),
    sxTable.wrap,
    sectionTitle('Attendance', '출석 체크'),
    el('div', 'toolbar', [field('Date', '날짜', attDate)]),
    attBox,
    sectionTitle('Break weeks (exam periods)', '휴강 주 (시험 기간)'),
    textEl('p', 'muted', 'No workouts that week, and every active membership is extended by one week.', '그 주에는 운동이 없고, 이용 중인 모든 회원의 만료일이 1주 늘어나요.'),
    el('div', 'toolbar', [field('Any day in that week', '그 주의 아무 날짜', holDate), field('Note', '메모', holNote), holAdd]),
    holTable.wrap,
  );

  function renderCapacity() {
    capInput.value = String(state.capacity);
    const used = state.assignments.length;
    capInfo.dataset.i18nEn = `${used} holding a membership · ${Math.max(state.capacity - used, 0)} left`;
    capInfo.dataset.i18nKo = `${used}명 이용 중 · 남은 자리 ${Math.max(state.capacity - used, 0)}`;
    capInfo.textContent = tr(capInfo.dataset.i18nEn, capInfo.dataset.i18nKo);
  }

  function renderSlots() {
    slotTable.body.innerHTML = '';
    const list = slots();
    if (!list.length) emptyRow(slotTable.body, 7, 'No time slots yet. Add one above.', '아직 시간대가 없어요. 위에서 추가해 주세요.');
    for (const c of list) {
      const n = assignedCount(c.id);
      const day = daySelect(c.weekdays[0]);
      day.disabled = n > 0;
      if (n > 0) day.title = tr('Move assigned members first to change the day.', '요일을 바꾸려면 배정된 멤버를 먼저 옮겨 주세요.');
      const time = input('time', { value: hhmm(c.start_time), step: 300 });
      const dur = input('number', { value: c.duration_min, min: 30, max: 180 });
      dur.style.width = '80px';
      const cap = input('number', { value: c.capacity, min: 1, max: 30 });
      cap.style.width = '70px';
      const open = input('select');
      open.append(option('true', 'Open', '열림', c.is_open), option('false', 'Closed', '닫힘', !c.is_open));
      const save = button('Save', '저장');
      save.addEventListener('click', async () => {
        const ok2 = await write(supabase.from('pt_classes').update({
          weekdays: [Number(day.value)], start_time: time.value, duration_min: Number(dur.value), capacity: Number(cap.value), is_open: open.value === 'true',
        }).eq('id', c.id), 'Time slot saved.', '시간대를 저장했어요.');
        if (ok2) loadClasses();
      });
      const del = button('Delete', '삭제', 'btn btn-ghost');
      del.addEventListener('click', async () => {
        if (!window.confirm(tr(`Delete ${c.name_en}?`, `${c.name_ko} 시간대를 삭제할까요?`))) return;
        const { data, error } = await supabase.rpc('admin_delete_slot', { p_class_id: c.id });
        if (error) { fail(error); return; }
        if (data === 'archived') ok('It has past records, so it was hidden instead of deleted.', '예전 출석 기록이 있어서 삭제 대신 숨겼어요.');
        else ok('Time slot deleted.', '시간대를 삭제했어요.');
        loadClasses();
      });
      slotTable.body.append(el('tr', '', [
        el('td', '', [day]), el('td', '', [time]), el('td', '', [dur]), el('td', '', [cap]),
        el('td', '', [`${n}/${c.capacity}`]), el('td', '', [open]), el('td', '', [save, ' ', del]),
      ]));
    }
    // 예외 추가용 시간대 목록
    const keep = sxSlot.value;
    sxSlot.innerHTML = '';
    for (const c of list) sxSlot.append(option(String(c.id), c.name_en, c.name_ko, String(c.id) === keep));
  }

  function renderAssign() {
    assignBox.innerHTML = '';
    if (!state.assignments.length) {
      assignBox.append(textEl('div', 'ms-card ms-notice', 'No one holds a membership right now.', '지금 멤버십을 가진 회원이 없어요.'));
      return;
    }
    const { wrap, body } = table([['Member', '회원'], ['Status', '상태'], ['Period', '기간'], ['Workout day 1', '운동 요일 1'], ['Workout day 2', '운동 요일 2'], ['', '']]);
    const rows = [...state.assignments].sort((a, b) => (a.class_ids.length >= 2) - (b.class_ids.length >= 2));
    const list = slots();
    for (const a of rows) {
      const pick = (current) => {
        const s = input('select');
        s.append(option('', '— None —', '— 선택 안 함 —', !current));
        for (const c of list) {
          const label = `${c.name_ko} (${assignedCount(c.id)}/${c.capacity})${c.is_open ? '' : ' · 닫힘'}`;
          const labelEn = `${c.name_en} (${assignedCount(c.id)}/${c.capacity})${c.is_open ? '' : ' · closed'}`;
          s.append(option(String(c.id), labelEn, label, c.id === current));
        }
        return s;
      };
      const s1 = pick(a.class_ids[0]);
      const s2 = pick(a.class_ids[1]);
      const save = button('Save', '저장', a.class_ids.length < 2 ? 'btn btn-primary' : 'btn btn-secondary');
      save.addEventListener('click', async () => {
        const ids = [s1.value, s2.value].filter(Boolean).map(Number);
        const { error } = await supabase.rpc('admin_set_member_slots', { p_membership_id: a.membership_id, p_class_ids: ids });
        if (error) { fail(error); return; }
        ok('Workout days saved. The member got a notice.', '운동 요일을 저장했어요. 회원에게 알림이 갔어요.');
        loadClasses();
      });
      const [sEn, sKo] = datePair(a.starts_on, false);
      const [eEn, eKo] = datePair(a.ends_on, false);
      body.append(el('tr', '', [
        el('td', '', [el('strong', '', [a.member_name || profileName(a.user_id)]),
          a.class_ids.length < 2 ? textEl('div', 'ms-tag', 'Needs days', '배정 필요') : null]),
        textEl('td', '', a.status === 'active' ? 'Active' : 'Awaiting payment', a.status === 'active' ? '이용 중' : '입금 대기'),
        textEl('td', '', `${sEn} – ${eEn}`, `${sKo} – ${eKo}`),
        el('td', '', [s1]), el('td', '', [s2]), el('td', '', [save]),
      ]));
    }
    assignBox.append(wrap);
  }

  function renderExceptions() {
    sxTimeField.hidden = sxKind.value !== 'time';
    sxTable.body.innerHTML = '';
    const rows = state.exceptions.filter((x) => x.session_date >= kstToday());
    if (!rows.length) emptyRow(sxTable.body, 5, 'No upcoming changes.', '앞으로 예정된 변경이 없어요.');
    for (const x of rows) {
      const c = state.classes.find((k) => k.id === x.class_id);
      const del = button('Undo', '되돌리기');
      del.addEventListener('click', async () => {
        if (await write(supabase.from('class_session_exceptions').delete().eq('class_id', x.class_id).eq('session_date', x.session_date), 'Back to the usual time.', '원래 일정으로 되돌렸어요.')) loadClasses();
      });
      sxTable.body.append(el('tr', '', [
        textEl('td', '', ...datePair(x.session_date)),
        textEl('td', '', c ? c.name_en : '-', c ? c.name_ko : '-'),
        x.cancelled ? textEl('td', '', 'No workout', '휴강') : textEl('td', '', `Moved to ${hhmm(x.new_start_time)}`, `${hhmm(x.new_start_time)}(으)로 변경`),
        el('td', '', [x.note || '']),
        el('td', '', [del]),
      ]));
    }
  }

  function renderClasses() {
    renderCapacity();
    renderSlots();
    renderAssign();
    renderExceptions();
  }

  async function renderAttendance() {
    const date = attDate.value;
    attBox.innerHTML = '';
    if (!date) return;
    const dow = DAY_INDEX(date);
    if (state.holidays.some((h) => h.week_start === mondayOf(date))) {
      attBox.append(textEl('div', 'ms-card ms-notice', 'Break week — no workouts.', '휴강 주라 운동이 없어요.'));
      return;
    }
    const isLastFriday = dow === 5 && addDays(date, 7).slice(5, 7) !== date.slice(5, 7);
    const todays = slots().filter((c) => c.is_open && c.weekdays.includes(dow));
    if (!todays.length) { attBox.append(textEl('div', 'ms-card ms-notice', 'No workouts on this day.', '이 날은 운동이 없어요.')); return; }
    for (const c of todays) {
      const x = state.exceptions.find((e) => e.class_id === c.id && e.session_date === date);
      if (c.skip_last_friday && isLastFriday) {
        attBox.append(textEl('div', 'ms-card ms-notice', `${c.name_en}: no workout — crew gathering day.`, `${c.name_ko}: 오늘은 운동 대신 게더링이에요.`));
        continue;
      }
      if (x && x.cancelled) {
        attBox.append(textEl('div', 'ms-card ms-notice', `${c.name_en}: cancelled for this day.`, `${c.name_ko}: 이 날은 휴강이에요.`));
        continue;
      }
      const card = el('div', 'ms-card');
      card.style.marginBottom = '12px';
      const timeNote = x && x.new_start_time ? [` → ${hhmm(x.new_start_time)}`, ` → ${hhmm(x.new_start_time)} (변경)`] : ['', ''];
      card.append(textEl('strong', '', c.name_en + timeNote[0], c.name_ko + timeNote[1]));
      const { data, error } = await supabase.rpc('admin_class_roster', { p_class_id: c.id, p_date: date });
      if (error) { card.append(el('div', 'muted', error.message)); attBox.append(card); continue; }
      if (!data.length) card.append(textEl('div', 'muted', 'No one is assigned.', '이 시간대에 배정된 회원이 없어요.'));
      const list = el('ul', 'ms-list');
      for (const r of data) {
        const name = r.member_name || tr('Unnamed', '이름 없음');
        const who = el('span', '', [el('strong', '', name), ' ', el('span', 'muted', [r.university || ''])]);
        const btns = el('span', '');
        for (const [status, en, ko] of [['attended', 'Present', '출석'], ['absent', 'Absent', '결석']]) {
          const b = button(en, ko, r.attendance === status ? 'btn btn-primary' : 'btn btn-secondary');
          b.setAttribute('aria-pressed', String(r.attendance === status));
          b.addEventListener('click', async () => {
            const req = r.attendance === status
              ? supabase.from('class_attendance').delete().eq('class_id', c.id).eq('session_date', date).eq('user_id', r.user_id)
              : supabase.from('class_attendance').upsert({ class_id: c.id, session_date: date, user_id: r.user_id, status, checked_at: new Date().toISOString() }, { onConflict: 'class_id,session_date,user_id' });
            if (await write(req, 'Attendance saved.', '출석을 저장했어요.')) renderAttendance();
          });
          btns.append(b, ' ');
        }
        list.append(el('li', 'ms-row', [who, btns]));
      }
      card.append(list);
      attBox.append(card);
    }
  }

  function renderHolidays() {
    holTable.body.innerHTML = '';
    if (!state.holidays.length) emptyRow(holTable.body, 3, 'No break weeks yet.', '지정한 휴강 주가 없어요.');
    for (const h of state.holidays) {
      const [sEn, sKo] = datePair(h.week_start, false);
      const [eEn, eKo] = datePair(addDays(h.week_start, 6), false);
      const del = button('Remove', '삭제');
      del.addEventListener('click', async () => {
        if (!window.confirm(tr('Remove this break week? Memberships go back to their earlier end dates.', '이 휴강 주를 삭제할까요? 늘어났던 만료일이 원래대로 돌아가요.'))) return;
        if (await write(supabase.from('holiday_weeks').delete().eq('week_start', h.week_start), 'Break week removed.', '휴강 주를 삭제했어요.')) loadClasses();
      });
      holTable.body.append(el('tr', '', [textEl('td', '', `${sEn} – ${eEn}`, `${sKo} – ${eKo}`), el('td', '', [h.note || '']), el('td', '', [del])]));
    }
  }

  capSave.addEventListener('click', async () => {
    const n = Number(capInput.value);
    if (!Number.isInteger(n) || n < 0 || n > 500) { setMessage(tr('Enter a number from 0 to 500.', '0~500 사이 숫자를 넣어 주세요.'), 'error'); return; }
    if (await write(supabase.from('site_settings').upsert({ key: 'membership_capacity', value: n }, { onConflict: 'key' }), 'Capacity saved.', '멤버십 정원을 저장했어요.')) loadClasses();
  });

  slotAdd.addEventListener('click', async () => {
    if (await write(supabase.from('pt_classes').insert({
      kind: 'regular', weekdays: [Number(newDay.value)], start_time: newTime.value, duration_min: Number(newDur.value),
      capacity: Number(newCap.value), is_open: true, code: '', name_ko: '-', name_en: '-',
    }), 'Time slot added.', '시간대를 추가했어요.')) loadClasses();
  });

  sxKind.addEventListener('change', renderExceptions);
  sxAdd.addEventListener('click', async () => {
    const c = state.classes.find((k) => String(k.id) === sxSlot.value);
    if (!c || !sxDate.value) return;
    if (DAY_INDEX(sxDate.value) !== c.weekdays[0]) {
      setMessage(tr(`That date isn’t a ${DAYS[c.weekdays[0] - 1][1]}.`, `그 날짜는 ${DAYS[c.weekdays[0] - 1][2]}이 아니에요.`), 'error');
      return;
    }
    const cancel = sxKind.value === 'cancel';
    if (!cancel && !sxTime.value) return;
    if (await write(supabase.from('class_session_exceptions').upsert({
      class_id: c.id, session_date: sxDate.value, cancelled: cancel, new_start_time: cancel ? null : sxTime.value, note: sxNote.value.trim() || null,
    }, { onConflict: 'class_id,session_date' }), 'Saved. Assigned members got a notice.', '저장했어요. 배정된 멤버에게 알림이 갔어요.')) {
      sxNote.value = '';
      loadClasses();
    }
  });

  holAdd.addEventListener('click', async () => {
    if (!holDate.value) return;
    const week = mondayOf(holDate.value);
    if (await write(supabase.from('holiday_weeks').insert({ week_start: week, note: holNote.value.trim() || null }), 'Break week added.', '휴강 주를 추가했어요.')) {
      holNote.value = '';
      loadClasses();
    }
  });
  attDate.addEventListener('change', renderAttendance);

  async function loadClasses() {
    const [classes, holidays, assignments, exceptions, capacity] = await Promise.all([
      supabase.from('pt_classes').select('id, code, name_ko, name_en, kind, weekdays, start_time, duration_min, capacity, is_open, sort, skip_last_friday, archived').order('sort'),
      supabase.from('holiday_weeks').select('week_start, note').order('week_start', { ascending: false }),
      supabase.rpc('admin_assignment_list'),
      supabase.from('class_session_exceptions').select('class_id, session_date, cancelled, new_start_time, note').gte('session_date', addDays(kstToday(), -31)).order('session_date'),
      supabase.from('site_settings').select('value').eq('key', 'membership_capacity').maybeSingle(),
    ]);
    if (classes.error || holidays.error) { fail(classes.error || holidays.error); return; }
    // 0044 SQL을 아직 실행하지 않은 경우
    const missing = assignments.error || exceptions.error || classes.data.some((c) => c.archived === undefined);
    setupNote.replaceChildren(missing ? textEl('div', 'ms-card ms-notice', 'Run supabase/migrations/0044_admin_assigned_schedule.sql in the Supabase SQL Editor to use the new schedule.', '새 운동 일정을 쓰려면 Supabase SQL Editor에서 0044_admin_assigned_schedule.sql을 실행해 주세요.') : '');
    state.classes = classes.data;
    state.holidays = holidays.data;
    state.assignments = assignments.error ? [] : assignments.data.map((a) => ({ ...a, class_ids: (a.class_ids || []).map(Number) }));
    state.exceptions = exceptions.error ? [] : exceptions.data;
    state.capacity = Number(capacity.data?.value ?? 12);
    renderClasses();
    renderHolidays();
    renderAttendance();
  }

  // ===================================================================
  // 2. 게더링 · 등산 · 이벤트
  // ===================================================================
  const ep = panels.events;
  const f = {
    id: null,
    kind: input('select'),
    title: input('text', { maxLength: 80 }),
    date: input('date'),
    time: input('time'),
    place: input('text', { maxLength: 80 }),
    partner: input('select'),
    capacity: input('number', { min: 1, max: 200 }),
    extra: input('checkbox'),
    costNote: input('text', { maxLength: 80, placeholder: tr('e.g. transport ~KRW 10,000', '예: 교통비 약 1만 원') }),
    desc: input('textarea', { rows: 2, maxLength: 500 }),
  };
  f.kind.append(option('gathering', ...EVENT_KIND.gathering), option('hiking', ...EVENT_KIND.hiking), option('event', ...EVENT_KIND.event));
  f.extra.className = '';
  const saveEvent = button('Create', '만들기', 'btn btn-primary');
  const resetEvent = button('New', '새로 작성');
  const formTitle = textEl('h2', '', 'New gathering / hike / event', '새 게더링 · 등산 · 이벤트');
  formTitle.style.cssText = 'font-size:17px;margin:6px 0 10px';
  const formCard = el('div', 'ms-card');
  const extraWrap = el('label', '', [f.extra, ' ', textEl('span', '', 'Extra cost (paid separately)', '실비 별도')]);
  extraWrap.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:13px';
  formCard.append(formTitle,
    el('div', 'toolbar', [field('Type', '종류', f.kind), field('Title', '제목', f.title), field('Date', '날짜', f.date), field('Time', '시간', f.time)]),
    el('div', 'toolbar', [field('Partner place', '제휴 장소', f.partner), field('Place', '장소', f.place), field('Capacity', '정원', f.capacity)]),
    el('div', 'toolbar', [extraWrap, field('Cost note', '실비 메모', f.costNote)]),
    field('Description', '설명', f.desc),
    el('div', '', [saveEvent, ' ', resetEvent]));
  formCard.querySelector('textarea').style.width = '100%';
  const eventTable = table([['When', '일시'], ['Event', '일정'], ['Joined', '신청'], ['Status', '상태'], ['', '']]);
  ep.append(formCard, sectionTitle('Upcoming & recent', '다가오는 일정 · 최근 일정'), eventTable.wrap);

  // 게더링: 그달 마지막 주 금요일 20:00, 정원 7명 (사용자 결정)
  function defaultsFor(kind) {
    const date = kind === 'gathering' ? nextGatheringDate() : addDays(kstToday(), 14);
    const mm = Number(date.slice(5, 7));
    const byKind = {
      gathering: { title: tr(`${mm} gathering`, `${mm}월 게더링`), time: '20:00', capacity: 7 },
      hiking: { title: tr('Mountain hike', '명산 등산'), time: '08:00', capacity: 15 },
      event: { title: tr('Crew event', '크루 이벤트'), time: '19:00', capacity: 20 },
    };
    return { ...(byKind[kind] || byKind.event), date };
  }
  function resetForm(kind = f.kind.value || 'gathering') {
    const d = defaultsFor(kind);
    f.id = null;
    f.kind.value = kind;
    f.kind.disabled = false;
    f.title.value = d.title;
    f.date.value = d.date;
    f.time.value = d.time;
    f.capacity.value = d.capacity;
    f.place.value = '';
    f.partner.value = '';
    f.extra.checked = kind === 'hiking';
    f.costNote.value = '';
    f.desc.value = '';
    saveEvent.replaceChildren(textEl('span', '', 'Create', '만들기'));
    formTitle.dataset.i18nEn = 'New gathering / hike / event';
    formTitle.dataset.i18nKo = '새 게더링 · 등산 · 이벤트';
    formTitle.textContent = tr(formTitle.dataset.i18nEn, formTitle.dataset.i18nKo);
  }
  function fillForm(e, copy = false) {
    const kst = new Date(new Date(e.starts_at).getTime() + 9 * 3600e3).toISOString();
    f.id = copy ? null : e.id;
    f.kind.value = e.kind;
    f.title.value = copy ? e.title.replace(/(\d+)조/, (_, n) => `${Number(n) + 1}조`) : e.title;
    if (copy && f.title.value === e.title) f.title.value = `${e.title} ${tr('(group 2)', '2조')}`;
    f.date.value = kst.slice(0, 10);
    f.time.value = kst.slice(11, 16);
    f.place.value = e.place || '';
    f.partner.value = e.partner_place_id || '';
    f.capacity.value = e.capacity;
    f.extra.checked = e.extra_cost;
    f.costNote.value = e.cost_note || '';
    f.desc.value = e.description || '';
    saveEvent.replaceChildren(copy ? textEl('span', '', 'Create', '만들기') : textEl('span', '', 'Save changes', '수정 저장'));
    formTitle.dataset.i18nEn = copy ? 'New group (copied)' : 'Edit event';
    formTitle.dataset.i18nKo = copy ? '같은 일정 다른 조 만들기' : '일정 수정';
    formTitle.textContent = tr(formTitle.dataset.i18nEn, formTitle.dataset.i18nKo);
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  f.kind.addEventListener('change', () => { if (!f.id) resetForm(f.kind.value); });
  f.partner.addEventListener('change', () => {
    const p = state.places.find((x) => String(x.id) === f.partner.value);
    if (p) f.place.value = p.name;
  });
  resetEvent.addEventListener('click', () => resetForm());
  saveEvent.addEventListener('click', async () => {
    if (!f.title.value.trim() || !f.date.value || !f.time.value) { setMessage(tr('Title, date and time are required.', '제목, 날짜, 시간을 입력해 주세요.'), 'error'); return; }
    const row = {
      kind: f.kind.value,
      title: f.title.value.trim(),
      starts_at: new Date(`${f.date.value}T${f.time.value}:00+09:00`).toISOString(),
      place: f.place.value.trim() || null,
      partner_place_id: f.partner.value ? Number(f.partner.value) : null,
      capacity: Number(f.capacity.value) || 1,
      extra_cost: f.extra.checked,
      cost_note: f.costNote.value.trim() || null,
      description: f.desc.value.trim() || null,
    };
    const req = f.id ? supabase.from('crew_events').update(row).eq('id', f.id) : supabase.from('crew_events').insert(row);
    if (await write(req, f.id ? 'Event updated.' : 'Event created.', f.id ? '일정을 수정했어요.' : '일정을 만들었어요.')) { resetForm(); loadEvents(); }
  });

  async function renderEvents() {
    eventTable.body.innerHTML = '';
    if (!state.events.length) emptyRow(eventTable.body, 5, 'No events yet.', '만든 일정이 없어요.');
    const ids = state.events.map((e) => e.id);
    const regs = ids.length ? await supabase.from('event_registrations').select('event_id, user_id, created_at').in('event_id', ids).is('cancelled_at', null).order('created_at') : { data: [] };
    const byEvent = new Map();
    for (const r of regs.data || []) { if (!byEvent.has(r.event_id)) byEvent.set(r.event_id, []); byEvent.get(r.event_id).push(r); }
    for (const e of state.events) {
      const people = byEvent.get(e.id) || [];
      const [tEn, tKo] = dateTimePair(e.starts_at);
      const status = input('select');
      status.append(option('open', 'Open', '모집 중', e.status === 'open'), option('closed', 'Closed', '마감', e.status === 'closed'), option('cancelled', 'Cancelled', '취소', e.status === 'cancelled'));
      status.addEventListener('change', async () => {
        if (status.value === 'cancelled' && !window.confirm(tr('Cancel this event? Members will no longer see it.', '이 일정을 취소할까요? 회원 화면에서 사라져요.'))) { status.value = e.status; return; }
        if (await write(supabase.from('crew_events').update({ status: status.value }).eq('id', e.id), 'Status updated.', '상태를 바꿨어요.')) loadEvents();
      });
      const names = el('div', 'muted');
      names.hidden = true;
      names.textContent = people.length ? people.map((r, i) => `${i + 1}. ${profileName(r.user_id)}`).join('  ') : tr('No sign-ups yet.', '아직 신청자가 없어요.');
      const show = button(`${people.length}/${e.capacity}`, `${people.length}/${e.capacity}명`);
      show.title = tr('Show who joined', '신청자 보기');
      show.addEventListener('click', () => { names.hidden = !names.hidden; });
      const edit = button('Edit', '수정');
      edit.addEventListener('click', () => fillForm(e));
      const actions = el('td', '', [edit]);
      if (e.kind === 'gathering') {
        const copy = button('Add group', '조 추가');
        copy.addEventListener('click', () => fillForm(e, true));
        actions.append(' ', copy);
      }
      eventTable.body.append(el('tr', '', [
        textEl('td', '', tEn, tKo),
        el('td', '', [textEl('span', 'ms-tag', ...EVENT_KIND[e.kind]), ' ', el('strong', '', e.title), e.place ? el('div', 'muted', e.place) : null,
          e.extra_cost ? textEl('div', 'muted', `Extra cost${e.cost_note ? ': ' + e.cost_note : ''}`, `실비 별도${e.cost_note ? ': ' + e.cost_note : ''}`) : null, names]),
        el('td', '', [show]),
        el('td', '', [status]),
        actions,
      ]));
    }
  }

  async function loadEvents() {
    const from = new Date(Date.now() - 30 * 86400e3).toISOString();
    const { data, error } = await supabase.from('crew_events')
      .select('id, kind, title, description, starts_at, place, partner_place_id, capacity, extra_cost, cost_note, status')
      .gte('starts_at', from).order('starts_at').limit(200);
    if (error) { fail(error); return; }
    state.events = data;
    await renderEvents();
  }

  // ===================================================================
  // 3. 제휴 장소 (사진은 지금은 주소 붙여넣기, 업로드는 나중에)
  // ===================================================================
  const pp = panels.places;
  const pf = {
    id: null,
    name: input('text', { maxLength: 60 }),
    category: input('select'),
    address: input('text', { maxLength: 120 }),
    map: input('url', { placeholder: 'https://naver.me/...' }),
    photo: input('url', { placeholder: 'https://.../photo.jpg' }),
    ko: input('textarea', { rows: 2, maxLength: 300 }),
    en: input('textarea', { rows: 2, maxLength: 300 }),
    sort: input('number', { value: 0 }),
  };
  pf.category.append(option('cafe', 'Café', '카페'), option('restaurant', 'Restaurant', '식당'), option('other', 'Other', '기타'));
  const preview = el('div', 'place-preview');
  preview.style.cssText = 'width:120px;aspect-ratio:4/3;border:1px solid var(--color-divider);border-radius:6px;overflow:hidden;display:grid;place-items:center;font-size:12px;color:var(--color-neutral-500)';
  const savePlace = button('Add place', '장소 추가', 'btn btn-primary');
  const resetPlace = button('New', '새로 작성');
  const placeTitle = textEl('h2', '', 'Add a partner place', '제휴 장소 추가');
  placeTitle.style.cssText = 'font-size:17px;margin:6px 0 10px';
  const placeCard = el('div', 'ms-card', [placeTitle,
    el('div', 'toolbar', [field('Name', '이름', pf.name), field('Type', '종류', pf.category), field('Address', '주소', pf.address), field('Order', '순서', pf.sort)]),
    el('div', 'toolbar', [field('Map link', '지도 링크', pf.map), field('Photo link (paste URL)', '사진 주소 (링크 붙여넣기)', pf.photo), preview]),
    el('div', 'toolbar', [field('Description (Korean)', '소개 (한국어)', pf.ko), field('Description (English)', '소개 (영어)', pf.en)]),
    el('div', '', [savePlace, ' ', resetPlace])]);
  const placeTable = table([['Photo', '사진'], ['Place', '장소'], ['Shown', '공개'], ['', '']]);
  pp.append(placeCard, textEl('p', 'muted', 'Paste a photo link for now — direct upload will come later.', '지금은 사진 주소(링크)를 붙여넣어 주세요. 사진 직접 업로드는 나중에 추가해요.'), placeTable.wrap);

  function updatePreview() {
    preview.innerHTML = '';
    const src = safeUrl(pf.photo.value.trim());
    if (!src) { preview.append(textEl('span', '', 'No photo', '사진 없음')); return; }
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.style.cssText = 'width:100%;height:100%;object-fit:cover';
    img.onerror = () => { preview.replaceChildren(textEl('span', '', 'Can’t load', '불러올 수 없음')); };
    preview.append(img);
  }
  pf.photo.addEventListener('input', updatePreview);

  function resetPlaceForm() {
    pf.id = null;
    for (const k of ['name', 'address', 'map', 'photo', 'ko', 'en']) pf[k].value = '';
    pf.category.value = 'cafe';
    pf.sort.value = 0;
    savePlace.replaceChildren(textEl('span', '', 'Add place', '장소 추가'));
    placeTitle.dataset.i18nEn = 'Add a partner place';
    placeTitle.dataset.i18nKo = '제휴 장소 추가';
    placeTitle.textContent = tr(placeTitle.dataset.i18nEn, placeTitle.dataset.i18nKo);
    updatePreview();
  }
  resetPlace.addEventListener('click', resetPlaceForm);

  savePlace.addEventListener('click', async () => {
    if (!pf.name.value.trim()) { setMessage(tr('Please enter a name.', '이름을 입력해 주세요.'), 'error'); return; }
    for (const k of ['map', 'photo']) {
      if (pf[k].value.trim() && !safeUrl(pf[k].value.trim())) { setMessage(tr('Links must start with http:// or https://', '링크는 http:// 또는 https:// 로 시작해야 해요.'), 'error'); return; }
    }
    const row = {
      name: pf.name.value.trim(), category: pf.category.value, address: pf.address.value.trim() || null,
      map_url: pf.map.value.trim() || null, photo_url: pf.photo.value.trim() || null,
      description_ko: pf.ko.value.trim() || null, description_en: pf.en.value.trim() || null, sort: Number(pf.sort.value) || 0,
    };
    const req = pf.id ? supabase.from('partner_places').update(row).eq('id', pf.id) : supabase.from('partner_places').insert(row);
    if (await write(req, pf.id ? 'Place updated.' : 'Place added.', pf.id ? '장소를 수정했어요.' : '장소를 추가했어요.')) { resetPlaceForm(); loadPlaces(); }
  });

  function renderPlaces() {
    placeTable.body.innerHTML = '';
    f.partner.innerHTML = '';
    f.partner.append(option('', '— none —', '— 선택 안 함 —'));
    for (const p of state.places) f.partner.append(option(String(p.id), p.name, p.name));
    if (!state.places.length) emptyRow(placeTable.body, 4, 'No partner places yet.', '등록한 제휴 장소가 없어요.');
    for (const p of state.places) {
      const thumb = el('div', '');
      thumb.style.cssText = 'width:64px;aspect-ratio:4/3;border-radius:4px;overflow:hidden;background:var(--color-surface)';
      const src = p.photo_url && safeUrl(p.photo_url);
      if (src) { const img = document.createElement('img'); img.src = src; img.alt = ''; img.style.cssText = 'width:100%;height:100%;object-fit:cover'; img.onerror = () => img.remove(); thumb.append(img); }
      const vis = input('select');
      vis.append(option('true', 'Shown', '공개', p.is_visible), option('false', 'Hidden', '숨김', !p.is_visible));
      vis.addEventListener('change', async () => { if (await write(supabase.from('partner_places').update({ is_visible: vis.value === 'true' }).eq('id', p.id), 'Saved.', '저장했어요.')) loadPlaces(); });
      const edit = button('Edit', '수정');
      edit.addEventListener('click', () => {
        pf.id = p.id;
        pf.name.value = p.name; pf.category.value = p.category; pf.address.value = p.address || ''; pf.map.value = p.map_url || '';
        pf.photo.value = p.photo_url || ''; pf.ko.value = p.description_ko || ''; pf.en.value = p.description_en || ''; pf.sort.value = p.sort;
        savePlace.replaceChildren(textEl('span', '', 'Save changes', '수정 저장'));
        placeTitle.dataset.i18nEn = 'Edit partner place';
        placeTitle.dataset.i18nKo = '제휴 장소 수정';
        placeTitle.textContent = tr(placeTitle.dataset.i18nEn, placeTitle.dataset.i18nKo);
        updatePreview();
        placeCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      const del = button('Delete', '삭제');
      del.addEventListener('click', async () => {
        if (!window.confirm(tr(`Delete ${p.name}? (Tip: “Hidden” keeps it for later.)`, `${p.name}을(를) 삭제할까요? (나중에 다시 쓸 거면 "숨김"을 추천해요)`))) return;
        if (await write(supabase.from('partner_places').delete().eq('id', p.id), 'Place deleted.', '장소를 삭제했어요.')) loadPlaces();
      });
      placeTable.body.append(el('tr', '', [el('td', '', [thumb]), el('td', '', [el('strong', '', p.name), p.address ? el('div', 'muted', p.address) : null]), el('td', '', [vis]), el('td', '', [edit, ' ', del])]));
    }
  }

  async function loadPlaces() {
    const { data, error } = await supabase.from('partner_places')
      .select('id, name, category, address, map_url, photo_url, description_ko, description_en, is_visible, sort').order('sort').order('name');
    if (error) { fail(error); return; }
    state.places = data;
    renderPlaces();
  }

  // ===================================================================
  // 4. 매출 · 예산 · 성비 · 설정
  // ===================================================================
  const sp = panels.stats;
  const revTable = table([['Month', '월'], ['Membership revenue', '회비 입금'], ['Payments', '입금 건수'], ['Event budget (20%)', '이벤트 예산 (20%)'], ['Spent', '지출'], ['Left', '남은 예산']]);
  const exDate = input('date', { value: kstToday() });
  const exAmount = input('number', { min: 0, step: 1000 });
  const exMemo = input('text', { maxLength: 80, placeholder: tr('e.g. café for gathering', '예: 게더링 카페') });
  const exEvent = input('select');
  const exAdd = button('Add expense', '지출 추가', 'btn btn-primary');
  const exTable = table([['Date', '날짜'], ['Amount', '금액'], ['Memo', '메모'], ['', '']]);
  const genderTable = table([['Class', '반'], ['Men', '남'], ['Women', '여'], ['Not set', '미입력']]);
  const showGender = input('select');
  showGender.append(option('false', 'Hidden on the intro page', '소개 페이지에 숨김'), option('true', 'Shown on the intro page', '소개 페이지에 공개'));
  sp.append(
    sectionTitle('Monthly revenue & event budget', '월 매출 · 이벤트 예산'),
    textEl('p', 'muted', 'Revenue counts confirmed membership payments only (1:1 PT session fees excluded). Event budget = 20% of that month’s revenue.', '매출은 "입금 확인"된 멤버십 회비만 계산해요 (1:1 PT 이용료 제외). 이벤트 예산 = 그달 매출의 20%.'),
    revTable.wrap,
    sectionTitle('Event expenses', '이벤트 지출 기록'),
    el('div', 'toolbar', [field('Date', '날짜', exDate), field('Amount (KRW)', '금액 (원)', exAmount), field('Event', '관련 일정', exEvent), field('Memo', '메모', exMemo), exAdd]),
    exTable.wrap,
    sectionTitle('Gender ratio (active members)', '성비 (이용 중 회원)'),
    genderTable.wrap,
    el('div', 'toolbar', [field('Intro page', '소개 페이지 공개', showGender)]),
    textEl('p', 'muted', 'Payment: members are asked to DM @fitinconnection_official on Instagram for the account (no account number on the site).', '입금 안내: 계좌번호는 사이트에 없고, 회원에게 인스타그램 @fitinconnection_official 로 DM을 보내라고 안내해요.'),
  );

  exAdd.addEventListener('click', async () => {
    const amount = Number(exAmount.value);
    if (!exDate.value || !(amount >= 0) || exAmount.value === '') { setMessage(tr('Enter a date and amount.', '날짜와 금액을 입력해 주세요.'), 'error'); return; }
    const row = { spent_on: exDate.value, amount, memo: exMemo.value.trim() || null, event_id: exEvent.value ? Number(exEvent.value) : null };
    if (await write(supabase.from('event_expenses').insert(row), 'Expense added.', '지출을 추가했어요.')) { exAmount.value = ''; exMemo.value = ''; loadStats(); }
  });
  showGender.addEventListener('change', () => write(supabase.from('site_settings').upsert({ key: 'show_gender_ratio', value: showGender.value === 'true' }), 'Saved.', '저장했어요.'));

  async function loadStats() {
    const [summary, expenses, gender, settings, events] = await Promise.all([
      supabase.rpc('admin_monthly_summary', { p_months: 6 }),
      supabase.from('event_expenses').select('id, spent_on, amount, memo, event_id').order('spent_on', { ascending: false }).limit(50),
      supabase.rpc('admin_gender_stats'),
      supabase.from('site_settings').select('key, value'),
      supabase.from('crew_events').select('id, title, starts_at').neq('status', 'cancelled').order('starts_at', { ascending: false }).limit(50),
    ]);
    const err = summary.error || expenses.error || gender.error || settings.error || events.error;
    if (err) { fail(err); return; }

    revTable.body.innerHTML = '';
    for (const m of summary.data) {
      const [mEn, mKo] = [new Date(`${m.month}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' }), new Date(`${m.month}T00:00:00Z`).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', timeZone: 'UTC' })];
      const left = Number(m.budget) - Number(m.spent);
      const leftCell = el('td', '', [won(left)]);
      if (left < 0) leftCell.style.cssText = 'color:var(--danger);font-weight:500';
      revTable.body.append(el('tr', '', [textEl('td', '', mEn, mKo), el('td', '', [won(m.revenue)]), el('td', '', [String(m.paid_count)]), el('td', '', [won(m.budget)]), el('td', '', [won(m.spent)]), leftCell]));
    }

    exEvent.innerHTML = '';
    exEvent.append(option('', '— none —', '— 선택 안 함 —'));
    for (const e of events.data) exEvent.append(option(String(e.id), e.title, e.title));
    exTable.body.innerHTML = '';
    if (!expenses.data.length) emptyRow(exTable.body, 4, 'No expenses yet.', '기록한 지출이 없어요.');
    for (const x of expenses.data) {
      const del = button('Delete', '삭제');
      del.addEventListener('click', async () => { if (await write(supabase.from('event_expenses').delete().eq('id', x.id), 'Deleted.', '삭제했어요.')) loadStats(); });
      const ev = events.data.find((e) => e.id === x.event_id);
      exTable.body.append(el('tr', '', [textEl('td', '', ...datePair(x.spent_on, false)), el('td', '', [won(x.amount)]), el('td', '', [x.memo || '', ev ? el('div', 'muted', ev.title) : null]), el('td', '', [del])]));
    }

    genderTable.body.innerHTML = '';
    for (const g of gender.data) {
      genderTable.body.append(el('tr', '', [textEl('td', '', g.class_name_en, g.class_name_ko), el('td', '', [String(g.male)]), el('td', '', [String(g.female)]), el('td', '', [String(g.unknown)])]));
    }
    if (!gender.data.length) emptyRow(genderTable.body, 4, 'No active members yet.', '이용 중인 회원이 없어요.');

    const settingsMap = new Map(settings.data.map((s) => [s.key, s.value]));
    showGender.value = settingsMap.get('show_gender_ratio') === true ? 'true' : 'false';
  }

  resetForm('gathering');
  resetPlaceForm();
  window.addEventListener('fitin:lang-change', () => setTimeout(() => { renderClasses(); renderHolidays(); renderAttendance(); renderEvents(); renderPlaces(); loadStats(); }, 0));

  return {
    async load() {
      await Promise.all([loadClasses(), loadPlaces()]);
      await Promise.all([loadEvents(), loadStats()]);
    },
  };
}
