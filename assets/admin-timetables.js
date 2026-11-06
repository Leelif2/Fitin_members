// 관리자 화면 "회원 시간표" 탭 (supabase/migrations/0026_timetable_admin_alerts.sql)
// 회원이 루틴 페이지에서 올린 시간표(사진에서 읽은 수업 목록 — 사진 원본은 저장 안 함)를
//   * 회원별: 주간 표(수업 / 2시간 이상 공강)와 추천 루틴으로 보고, 새 알림을 "확인" 처리
//   * 겹치는 공강: 고른 회원들이 30분 칸마다 몇 명 비어 있는지 진하기로 보고, 칸을 누르면 이름
// 공강 계산은 루틴 페이지와 같은 규칙(assets/routine-plan.js)을 쓴다.
import { tr, textEl, el, dateTimePair } from './membership-ui.js';
import { DAYS, WINDOW_START, WINDOW_END, cleanClasses, findFreeBlocks, toMinutes } from './routine-plan.js';

const STEP = 30;
const DAY_KO = { Mon: '월', Tue: '화', Wed: '수', Thu: '목', Fri: '금' };
const SPLIT_KO = { Push: '밀기', Pull: '당기기', Leg: '하체' };

const STYLE = `
.tt-views { display: inline-flex; gap: 4px; padding: 4px; margin-bottom: 16px; border: 1px solid var(--color-divider); border-radius: 10px; background: var(--color-surface); }
.tt-views button { padding: 8px 14px; border: 0; border-radius: 7px; background: transparent; color: var(--color-neutral-500); font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.tt-views button[aria-pressed="true"] { background: var(--gold-sheen); color: var(--color-on-accent); }
.tt-layout { display: grid; grid-template-columns: minmax(220px, 300px) minmax(0, 1fr); gap: 18px; align-items: start; }
@media (max-width: 820px) { .tt-layout { grid-template-columns: minmax(0, 1fr); } }
.tt-layout > * { min-width: 0; }
.tt-list { display: grid; gap: 6px; max-height: 640px; overflow-y: auto; }
.tt-member { display: grid; gap: 2px; width: 100%; padding: 10px 12px; border: 1px solid var(--color-divider); border-radius: 8px; background: var(--color-surface); color: var(--color-text); font: inherit; text-align: left; cursor: pointer; }
.tt-member[aria-current="true"] { border-color: var(--color-accent); }
.tt-member b { font-size: 14px; display: flex; align-items: center; gap: 6px; }
.tt-member small { font-size: 12px; color: var(--color-neutral-500); }
.tt-new { padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 700; background: var(--color-accent); color: var(--color-bg); }
.tt-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; }
.tt-head h3 { margin: 0; font-size: 20px; }
.tt-grid-wrap { overflow-x: auto; border: 1px solid var(--color-divider); border-radius: 8px; background: var(--color-surface); }
.tt-grid { display: grid; grid-template-columns: 52px repeat(5, minmax(70px, 1fr)); min-width: 420px; font-size: 11px; }
.tt-grid > div { min-height: 18px; border-bottom: 1px solid color-mix(in srgb, var(--color-divider) 55%, transparent); border-left: 1px solid color-mix(in srgb, var(--color-divider) 55%, transparent); }
.tt-grid .tt-hd { padding: 6px 4px; text-align: center; font-weight: 700; font-size: 12px; background: var(--color-bg); }
.tt-grid .tt-time { padding: 0 6px; color: var(--color-neutral-500); text-align: right; border-left: 0; }
.tt-cell.is-class { background: color-mix(in srgb, var(--color-neutral-500) 28%, transparent); }
.tt-cell.is-free { background: color-mix(in srgb, var(--color-accent) 22%, transparent); }
.tt-cell .tt-title { display: block; padding: 1px 4px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-weight: 600; }
.tt-legend { display: flex; flex-wrap: wrap; gap: 14px; margin: 10px 0; font-size: 12px; color: var(--color-neutral-500); }
.tt-legend i { display: inline-block; width: 12px; height: 12px; margin-right: 5px; vertical-align: -2px; border-radius: 3px; }
.tt-sessions { display: grid; gap: 6px; margin-top: 14px; font-size: 13px; }
.tt-sessions div { padding: 8px 10px; border: 1px solid var(--color-divider); border-radius: 8px; }
button.tt-cell { padding: 0; border: 0; border-left: 1px solid color-mix(in srgb, var(--color-divider) 55%, transparent); border-bottom: 1px solid color-mix(in srgb, var(--color-divider) 55%, transparent); font: inherit; font-size: 11px; font-weight: 700; color: var(--color-text); cursor: pointer; }
button.tt-cell[aria-pressed="true"] { outline: 2px solid var(--color-accent); outline-offset: -2px; }
.tt-pick { display: grid; gap: 4px; max-height: 420px; overflow-y: auto; padding: 8px; border: 1px solid var(--color-divider); border-radius: 8px; background: var(--color-surface); }
.tt-pick label { display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer; }
.tt-pick input { accent-color: var(--color-accent); }
.tt-who { margin-top: 12px; padding: 12px; border: 1px solid var(--color-divider); border-radius: 8px; font-size: 13px; }
.tt-who b { display: block; margin-bottom: 6px; }
.tt-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.tt-chips span { padding: 3px 9px; border-radius: 999px; border: 1px solid var(--color-divider); background: var(--color-bg); }
`;

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const SLOTS = [];
for (let m = WINDOW_START; m < WINDOW_END; m += STEP) SLOTS.push(m);
const dayLabel = (d) => tr(d, DAY_KO[d]);

function fullName(r) {
  return [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || r.nickname || tr('Member', '회원');
}

// 회원 한 명의 30분 칸 상태: 'class' | 'free'(2시간 이상 공강) | 'gap'(짧은 빈 시간)
function memberGrid(classes) {
  const clean = cleanClasses(classes);
  const free = findFreeBlocks(clean);
  const grid = {};
  for (const day of DAYS) {
    grid[day] = SLOTS.map((s) => {
      const e = s + STEP;
      const inClass = clean.some((c) => c.day === day && toMinutes(c.start) < e && toMinutes(c.end) > s);
      if (inClass) return 'class';
      const inFree = free.some((b) => b.day === day && toMinutes(b.start) <= s && toMinutes(b.end) >= e);
      return inFree ? 'free' : 'gap';
    });
  }
  return { grid, clean, free };
}

export function initAdminTimetables({ supabase, panel, tabLabel, setMessage, onNewCount }) {
  if (!document.getElementById('tt-style')) {
    const style = document.createElement('style');
    style.id = 'tt-style';
    style.textContent = STYLE;
    document.head.append(style);
  }
  const state = { rows: [], view: 'member', current: null, picked: null, onlyLong: false, cell: null, school: '' };

  const note = textEl('p', 'muted',
    'Timetables members uploaded on the Routines page (class times read from the photo — the photo itself is never stored).',
    '회원이 루틴 페이지에서 올린 시간표예요 (사진에서 읽은 수업 시간만 있고, 사진 원본은 저장하지 않아요).');
  note.style.cssText = 'margin:0 0 12px;font-size:13px';
  const views = el('div', 'tt-views');
  const body = el('div', '');
  panel.append(note, views, body);

  function viewButton(key, en, ko) {
    const b = textEl('button', '', en, ko);
    b.type = 'button';
    b.addEventListener('click', () => { state.view = key; render(); });
    return b;
  }
  const memberBtn = viewButton('member', 'By member', '회원별');
  const overlapBtn = viewButton('overlap', 'Shared free time', '겹치는 공강');
  views.append(memberBtn, overlapBtn);

  function updateTabLabel() {
    const n = state.rows.filter((r) => r.is_new).length;
    tabLabel.dataset.i18nEn = n ? `Timetables (${n} new)` : 'Timetables';
    tabLabel.dataset.i18nKo = n ? `회원 시간표 (새 ${n})` : '회원 시간표';
    tabLabel.textContent = tr(tabLabel.dataset.i18nEn, tabLabel.dataset.i18nKo);
    onNewCount?.(n);
  }

  async function load() {
    const { data, error } = await supabase.rpc('admin_member_timetables');
    if (error) {
      state.rows = [];
      body.replaceChildren(textEl('p', 'muted', 'Run 0026_timetable_admin_alerts.sql in Supabase to turn this on.', 'Supabase에서 0026_timetable_admin_alerts.sql을 실행하면 사용할 수 있어요.'));
      updateTabLabel();
      return;
    }
    // 새 알림 먼저, 그다음 최근에 올린 순
    state.rows = (data || []).sort((a, b) => (b.is_new - a.is_new) || (new Date(b.uploaded_at) - new Date(a.uploaded_at)));
    if (!state.picked) state.picked = new Set(state.rows.map((r) => r.user_id));
    if (state.current && !state.rows.some((r) => r.user_id === state.current)) state.current = null;
    updateTabLabel();
    render();
  }

  function render() {
    memberBtn.setAttribute('aria-pressed', String(state.view === 'member'));
    overlapBtn.setAttribute('aria-pressed', String(state.view === 'overlap'));
    if (!state.rows.length) {
      body.replaceChildren(textEl('p', 'muted', 'No timetables uploaded yet.', '아직 올라온 시간표가 없어요.'));
      return;
    }
    body.replaceChildren(state.view === 'member' ? renderMember() : renderOverlap());
  }

  // ── 회원별 ──
  function renderMember() {
    if (!state.current) state.current = state.rows[0].user_id;
    const list = el('div', 'tt-list');
    for (const r of state.rows) {
      const b = el('button', 'tt-member');
      b.type = 'button';
      b.setAttribute('aria-current', String(r.user_id === state.current));
      const name = el('b', '', [fullName(r) + (r.nickname ? ` · @${r.nickname}` : '')]);
      if (r.is_new) name.append(textEl('span', 'tt-new', 'NEW', '새로'));
      const [en, ko] = dateTimePair(r.uploaded_at);
      b.append(name, el('small', '', [`${r.university || '-'} · ${tr(en, ko)}`]));
      b.addEventListener('click', () => { state.current = r.user_id; render(); });
      list.append(b);
    }
    const r = state.rows.find((x) => x.user_id === state.current);
    return el('div', 'tt-layout', [list, memberDetail(r)]);
  }

  function memberDetail(r) {
    const box = el('div', '');
    const { grid, clean, free } = memberGrid(r.classes);
    const head = el('div', 'tt-head');
    const title = el('div', '', [el('h3', '', [fullName(r)])]);
    const [en, ko] = dateTimePair(r.uploaded_at);
    title.append(el('div', 'muted', [`${r.university || '-'} · ${tr(`Uploaded ${en}`, `${ko} 올림`)} · ${tr(`${r.upload_count} upload(s)`, `총 ${r.upload_count}번 올림`)}`]));
    head.append(title);
    if (r.is_new) {
      const ok = textEl('button', 'btn btn-primary', 'Mark as checked', '확인했어요');
      ok.type = 'button';
      ok.addEventListener('click', async () => {
        ok.disabled = true;
        const { error } = await supabase.rpc('admin_resolve_timetable_alert', { p_user: r.user_id });
        if (error) { ok.disabled = false; setMessage(error.message, 'error'); return; }
        await load();
      });
      head.append(ok);
    }
    box.append(head);

    const gridEl = el('div', 'tt-grid');
    gridEl.append(el('div', 'tt-hd', ['']), ...DAYS.map((d) => el('div', 'tt-hd', [dayLabel(d)])));
    SLOTS.forEach((s, i) => {
      gridEl.append(el('div', 'tt-time', [s % 60 === 0 ? hhmm(s) : '']));
      for (const day of DAYS) {
        const kind = grid[day][i];
        const cell = el('div', `tt-cell${kind === 'class' ? ' is-class' : kind === 'free' ? ' is-free' : ''}`);
        // 수업이 시작하는 칸에 과목 이름
        const starting = clean.find((c) => c.day === day && toMinutes(c.start) >= s && toMinutes(c.start) < s + STEP);
        if (starting) {
          const t = el('span', 'tt-title', [starting.title || tr('Class', '수업')]);
          t.title = `${starting.title} ${starting.start}–${starting.end}`;
          cell.append(t);
        }
        gridEl.append(cell);
      }
    });
    box.append(el('div', 'tt-grid-wrap', [gridEl]));

    const legend = el('div', 'tt-legend');
    const swatch = (css) => { const i = el('i', ''); i.style.background = css; return i; };
    legend.append(
      el('span', '', [swatch('color-mix(in srgb, var(--color-neutral-500) 28%, transparent)'), tr('Class', '수업')]),
      el('span', '', [swatch('color-mix(in srgb, var(--color-accent) 22%, transparent)'), tr('Free 2h+', '2시간 이상 공강')]),
      el('span', '', [tr(`${clean.length} classes · ${free.length} free blocks`, `수업 ${clean.length}개 · 공강 ${free.length}개`)]),
    );
    box.append(legend);

    const sessions = (r.plan && Array.isArray(r.plan.sessions)) ? r.plan.sessions : [];
    if (sessions.length) {
      const wrap = el('div', 'tt-sessions');
      wrap.append(textEl('b', '', 'Recommended routine', '추천 루틴'));
      for (const s of sessions) {
        const split = s.split ? tr(s.split, SPLIT_KO[s.split] || s.split) : '';
        wrap.append(el('div', '', [`${dayLabel(s.day)} ${s.start || ''}–${s.end || ''} · ${split}`]));
      }
      box.append(wrap);
    }
    return box;
  }

  // ── 겹치는 공강 ──
  function renderOverlap() {
    const schools = [...new Set(state.rows.map((r) => r.university).filter(Boolean))].sort();
    const shown = state.rows.filter((r) => !state.school || r.university === state.school);
    const picked = shown.filter((r) => state.picked.has(r.user_id));
    const grids = new Map(picked.map((r) => [r.user_id, memberGrid(r.classes).grid]));
    const isFree = (kind) => (state.onlyLong ? kind === 'free' : kind !== 'class');

    // 왼쪽: 회원 고르기
    const side = el('div', '');
    const controls = el('div', 'toolbar');
    controls.style.marginBottom = '8px';
    const schoolSel = el('select', 'input');
    schoolSel.append(new Option(tr('All schools', '전체 학교'), ''));
    for (const s of schools) schoolSel.append(new Option(s, s));
    schoolSel.value = state.school;
    schoolSel.addEventListener('change', () => { state.school = schoolSel.value; state.cell = null; render(); });
    controls.append(schoolSel);
    const all = textEl('button', 'btn btn-ghost', 'Select all', '모두 선택');
    all.type = 'button';
    all.addEventListener('click', () => { shown.forEach((r) => state.picked.add(r.user_id)); render(); });
    const none = textEl('button', 'btn btn-ghost', 'Clear', '모두 해제');
    none.type = 'button';
    none.addEventListener('click', () => { shown.forEach((r) => state.picked.delete(r.user_id)); state.cell = null; render(); });
    controls.append(all, none);
    const pick = el('div', 'tt-pick');
    for (const r of shown) {
      const cb = el('input', '');
      cb.type = 'checkbox';
      cb.checked = state.picked.has(r.user_id);
      cb.addEventListener('change', () => { cb.checked ? state.picked.add(r.user_id) : state.picked.delete(r.user_id); render(); });
      pick.append(el('label', '', [cb, fullName(r) + (r.university ? ` · ${r.university}` : '')]));
    }
    const longLabel = el('label', 'tt-pick');
    longLabel.style.cssText = 'margin-top:8px;display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer';
    const longCb = el('input', '');
    longCb.type = 'checkbox';
    longCb.checked = state.onlyLong;
    longCb.addEventListener('change', () => { state.onlyLong = longCb.checked; render(); });
    longLabel.append(longCb, tr('Only count free blocks of 2h+', '2시간 이상 공강만 세기'));
    side.append(controls, pick, longLabel);

    // 오른쪽: 겹침 표
    const main = el('div', '');
    main.append(el('div', 'tt-head', [el('h3', '', [tr(`${picked.length} selected`, `${picked.length}명 선택`)])]));
    const gridEl = el('div', 'tt-grid');
    gridEl.append(el('div', 'tt-hd', ['']), ...DAYS.map((d) => el('div', 'tt-hd', [dayLabel(d)])));
    SLOTS.forEach((s, i) => {
      gridEl.append(el('div', 'tt-time', [s % 60 === 0 ? hhmm(s) : '']));
      for (const day of DAYS) {
        const free = picked.filter((r) => isFree(grids.get(r.user_id)[day][i]));
        const ratio = picked.length ? free.length / picked.length : 0;
        const b = el('button', 'tt-cell', [free.length ? String(free.length) : '']);
        b.type = 'button';
        b.style.background = `color-mix(in srgb, var(--color-accent) ${Math.round(ratio * 70)}%, transparent)`;
        if (ratio > 0.55) b.style.color = 'var(--color-bg)';
        b.title = `${dayLabel(day)} ${hhmm(s)}–${hhmm(s + STEP)} · ${free.length}/${picked.length}`;
        const key = `${day}-${s}`;
        b.setAttribute('aria-pressed', String(state.cell === key));
        b.addEventListener('click', () => { state.cell = state.cell === key ? null : key; render(); });
        gridEl.append(b);
      }
    });
    main.append(el('div', 'tt-grid-wrap', [gridEl]));
    main.append(textEl('p', 'muted',
      'Darker = more of the selected members are free. Tap a cell to see who.',
      '진할수록 고른 회원 중 비어 있는 사람이 많아요. 칸을 누르면 누가 비어 있는지 보여요.'));

    if (state.cell) {
      const [day, s] = state.cell.split('-');
      const i = SLOTS.indexOf(Number(s));
      const free = picked.filter((r) => isFree(grids.get(r.user_id)[day][i]));
      const busy = picked.filter((r) => !isFree(grids.get(r.user_id)[day][i]));
      const who = el('div', 'tt-who');
      who.append(el('b', '', [`${dayLabel(day)} ${hhmm(Number(s))}–${hhmm(Number(s) + STEP)} · ${tr(`${free.length} free`, `${free.length}명 가능`)}`]));
      who.append(el('div', 'tt-chips', free.map((r) => el('span', '', [fullName(r)]))));
      if (busy.length) {
        who.append(el('div', 'muted', [tr(`Busy: ${busy.map(fullName).join(', ')}`, `수업 중: ${busy.map(fullName).join(', ')}`)]));
        who.lastChild.style.marginTop = '8px';
      }
      main.append(who);
    }
    return el('div', 'tt-layout', [side, main]);
  }

  window.addEventListener('fitin:lang-change', () => { updateTabLabel(); render(); });
  return { load };
}
