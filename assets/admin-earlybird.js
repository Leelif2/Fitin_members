// 관리자 화면 "얼리버드" 탭 (supabase/migrations/0039_early_bird_claims.sql)
// 신청 인원(예: 3/10)·남은 자리·구독권별 신청자 목록을 보고, 사이트 회원(이미 결제한 학생)이나
// 오프라인 신청을 직접 추가하고, 신청을 수정·취소한다.
// 관리자 확인은 DB 함수(admin_early_bird*)가 한다 — 이 화면을 숨기는 것만으로 막는 게 아니다.
import { tr, textEl, el, dateTimePair } from './membership-ui.js';

const PLAN = { '1m': ['1-month', '1개월권'], '2m': ['2-month', '2개월권'], '3m': ['3-month', '3개월권'] };
const PLAN_ORDER = ['1m', '2m', '3m'];
const MS_STATUS = { pending: ['Awaiting payment', '입금 대기'], active: ['Active', '이용 중'], expired: ['Ended', '종료'], cancelled: ['Cancelled', '취소'] };
const ERRORS = {
  early_bird_full: ['All early-bird spots are taken.', '얼리버드 자리가 다 찼어요.'],
  already_claimed: ['This member already has an early-bird spot.', '이 회원은 이미 얼리버드 자리가 있어요.'],
  name_required: ['Enter a name (or pick a member).', '이름을 입력하거나 회원을 골라 주세요.'],
  invalid_plan: ['Pick a plan.', '구독권을 골라 주세요.'],
  admin_only: ['Only administrators can do this.', '관리자만 할 수 있어요.'],
};
const errText = (error) => {
  const code = Object.keys(ERRORS).find((c) => (error?.message || '').includes(c));
  return code ? tr(...ERRORS[code]) : (error?.message || tr('Something went wrong.', '문제가 생겼어요.'));
};
// datetime-local 입력값 <-> ISO
const pad = (n) => String(n).padStart(2, '0');
const toLocalInput = (iso) => { const d = iso ? new Date(iso) : new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null);

export function initAdminEarlyBird({ supabase, panel, tabLabel, getProfiles, setMessage }) {
  const state = { data: null, editing: null, showCancelled: false };

  const note = textEl('p', 'muted',
    'Early-bird spots are shared by all plans. Spots left = capacity − active sign-ups (calculated from the list below). Members only ever see how many spots are left.',
    '얼리버드 자리는 모든 구독권이 함께 써요. 남은 자리 = 정원 − 유효 신청 수 (아래 목록에서 계산). 회원에게는 남은 자리 수만 보여요.');
  note.style.cssText = 'margin:0 0 12px;font-size:13px';
  const summary = el('div', 'card elev-sm');
  summary.style.cssText = 'padding:16px;margin-bottom:14px;display:grid;gap:6px';
  const addBox = el('div', 'card elev-sm');
  addBox.style.cssText = 'padding:16px;margin-bottom:14px;display:grid;gap:10px';
  const list = el('div', '');
  list.style.cssText = 'display:grid;gap:16px';
  panel.append(note, summary, addBox, list);

  function updateTabLabel() {
    const d = state.data;
    tabLabel.dataset.i18nEn = d ? `Early bird (${d.active}/${d.seats})` : 'Early bird';
    tabLabel.dataset.i18nKo = d ? `얼리버드 (${d.active}/${d.seats})` : '얼리버드';
    tabLabel.textContent = tr(tabLabel.dataset.i18nEn, tabLabel.dataset.i18nKo);
  }

  async function load() {
    const { data, error } = await supabase.rpc('admin_early_bird');
    if (error) {
      state.data = null;
      summary.replaceChildren(textEl('p', 'muted', 'Run 0039_early_bird_claims.sql in Supabase to turn this on.', 'Supabase에서 0039_early_bird_claims.sql을 실행하면 사용할 수 있어요.'));
      addBox.hidden = true;
      list.replaceChildren();
      updateTabLabel();
      return;
    }
    state.data = data;
    addBox.hidden = false;
    updateTabLabel();
    render();
  }

  function render() {
    renderSummary();
    renderAdd();
    renderList();
  }

  function renderSummary() {
    const d = state.data;
    const active = (d.claims || []).filter((c) => c.status === 'active');
    const big = el('div', '');
    big.style.cssText = 'display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px';
    const count = el('strong', '', [`${d.active} / ${d.seats}`]);
    count.style.cssText = 'font-size:30px;color:var(--color-accent)';
    big.append(
      el('span', '', [count, ' ', textEl('span', 'muted', 'signed up', '명 신청')]),
      textEl('strong', '', `${d.seats_left} spots left`, `남은 자리 ${d.seats_left}명`),
      textEl('span', 'muted', `Discount ₩${Number(d.discount).toLocaleString('en-US')} on every plan`, `모든 구독권 ${Number(d.discount).toLocaleString('ko-KR')}원 할인`),
    );
    const byPlan = PLAN_ORDER.map((k) => tr(`${PLAN[k][0]} ${active.filter((c) => c.plan_code === k).length}`, `${PLAN[k][1]} ${active.filter((c) => c.plan_code === k).length}명`)).join(' · ');
    summary.replaceChildren(big, el('div', 'muted', [byPlan]));
  }

  function planSelect(value) {
    const sel = el('select', 'input');
    for (const k of PLAN_ORDER) sel.append(new Option(tr(...PLAN[k]), k));
    sel.value = value || '1m';
    return sel;
  }

  function field(labelEn, labelKo, input) {
    const wrap = el('label', '');
    wrap.style.cssText = 'display:grid;gap:4px;font-size:13px;flex:1 1 180px;min-width:0';
    wrap.append(textEl('span', 'muted', labelEn, labelKo), input);
    return wrap;
  }

  function renderAdd() {
    const taken = new Set((state.data.claims || []).filter((c) => c.status === 'active' && c.user_id).map((c) => c.user_id));
    const who = el('select', 'input');
    who.append(new Option(tr('Not a site member (offline)', '사이트 회원 아님 (오프라인)'), ''));
    const people = (getProfiles() || [])
      .filter((p) => !taken.has(p.id))
      .map((p) => ({ id: p.id, label: [[p.first_name, p.last_name].filter(Boolean).join(' ') || tr('(no name)', '(이름 없음)'), p.university].filter(Boolean).join(' · ') }))
      .sort((a, b) => a.label.localeCompare(b.label));
    for (const p of people) who.append(new Option(p.label, p.id));
    const name = el('input', 'input');
    name.maxLength = 60;
    name.placeholder = tr('Name', '이름');
    const ig = el('input', 'input');
    ig.maxLength = 30;
    ig.placeholder = '@instagram';
    const plan = planSelect('1m');
    const when = el('input', 'input');
    when.type = 'datetime-local';
    when.value = toLocalInput();
    const memo = el('input', 'input');
    memo.maxLength = 300;
    memo.placeholder = tr('Memo (e.g. paid by DM)', '메모 (예: DM으로 결제)');
    const nameField = field('Name (offline only)', '이름 (오프라인만)', name);
    const syncWho = () => { nameField.hidden = Boolean(who.value); };
    who.addEventListener('change', syncWho);
    syncWho();

    const add = textEl('button', 'btn btn-primary', 'Add early-bird sign-up', '얼리버드 신청 추가');
    add.type = 'button';
    const full = state.data.seats_left <= 0;
    add.disabled = full;
    add.addEventListener('click', async () => {
      add.disabled = true;
      const { error } = await supabase.rpc('admin_early_bird_add', {
        p_user: who.value || null, p_name: name.value, p_instagram: ig.value, p_plan: plan.value,
        p_claimed_at: fromLocalInput(when.value), p_note: memo.value,
      });
      add.disabled = false;
      if (error) { setMessage(errText(error), 'error'); return; }
      setMessage(tr('Added.', '추가했어요.'), 'success');
      await load();
    });

    const row1 = el('div', 'toolbar', [field('Site member', '사이트 회원', who), nameField, field('Instagram', '인스타그램', ig)]);
    const row2 = el('div', 'toolbar', [field('Plan', '구독권', plan), field('Signed up at', '신청 시각', when), field('Memo', '메모', memo)]);
    for (const r of [row1, row2]) r.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;margin:0';
    addBox.replaceChildren(...[
      textEl('strong', '', 'Add a sign-up (students who already paid, offline sign-ups)', '신청 직접 추가 (이미 결제한 학생 · 오프라인 신청)'),
      row1, row2,
      full ? textEl('p', 'muted', 'All spots are taken — cancel a sign-up first to add someone.', '자리가 다 찼어요. 추가하려면 먼저 신청 하나를 취소해 주세요.') : null,
      add,
    ].filter(Boolean));
    add.style.justifySelf = 'start';
  }

  function renderList() {
    const claims = state.data.claims || [];
    const active = claims.filter((c) => c.status === 'active');
    const cancelled = claims.filter((c) => c.status === 'cancelled');
    list.replaceChildren();
    if (!claims.length) {
      list.append(textEl('p', 'muted', 'No early-bird sign-ups yet.', '아직 얼리버드 신청이 없어요.'));
      return;
    }
    for (const k of PLAN_ORDER) {
      const rows = active.filter((c) => c.plan_code === k);
      const section = el('div', '');
      section.style.cssText = 'display:grid;gap:8px';
      section.append(textEl('h3', '', `${PLAN[k][0]} · ${rows.length}`, `${PLAN[k][1]} · ${rows.length}명`));
      if (!rows.length) section.append(textEl('p', 'muted', 'None.', '없어요.'));
      for (const c of rows) section.append(card(c));
      list.append(section);
    }
    if (cancelled.length) {
      const toggle = textEl('button', 'btn btn-secondary', state.showCancelled ? `Hide cancelled (${cancelled.length})` : `Show cancelled (${cancelled.length})`, state.showCancelled ? `취소된 신청 숨기기 (${cancelled.length})` : `취소된 신청 보기 (${cancelled.length})`);
      toggle.type = 'button';
      toggle.style.justifySelf = 'start';
      toggle.addEventListener('click', () => { state.showCancelled = !state.showCancelled; renderList(); });
      list.append(toggle);
      if (state.showCancelled) for (const c of cancelled) list.append(card(c));
    }
  }

  function card(c) {
    const box = el('div', 'card elev-sm');
    box.style.cssText = 'padding:14px 16px;display:grid;gap:6px' + (c.status === 'cancelled' ? ';opacity:.65' : '');
    const head = el('div', '');
    head.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px';
    const title = el('div', '', [el('strong', '', [c.name || tr('(withdrawn member)', '(탈퇴한 회원)')])]);
    const sub = [c.nickname ? `@${c.nickname}` : null, c.university, c.email].filter(Boolean).join(' · ');
    if (sub) title.append(el('div', 'muted', [sub]));
    const tags = el('div', '');
    tags.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px';
    tags.append(textEl('span', 'tag', ...(c.source === 'web' ? ['Website', '사이트 신청'] : ['Added by admin', '관리자 추가'])));
    if (c.status === 'cancelled') tags.append(textEl('span', 'tag', 'Cancelled', '취소'));
    else tags.append(textEl('span', 'tag tag-accent', ...PLAN[c.plan_code] || [c.plan_code, c.plan_code]));
    if (c.membership_status) tags.append(textEl('span', 'tag', ...(MS_STATUS[c.membership_status] || [c.membership_status, c.membership_status])));
    head.append(title, tags);
    const [en, ko] = dateTimePair(c.claimed_at);
    const meta = el('div', 'muted', [tr(`Signed up ${en}`, `신청 ${ko}`), c.instagram ? ` · @${c.instagram}` : '', c.note ? ` · ${c.note}` : '']);
    meta.style.fontSize = '13px';
    box.append(head, meta);

    if (state.editing === c.id) {
      box.append(editForm(c));
    } else {
      const edit = textEl('button', 'btn btn-secondary', 'Edit / cancel', '수정 · 취소');
      edit.type = 'button';
      edit.style.justifySelf = 'start';
      edit.addEventListener('click', () => { state.editing = c.id; renderList(); });
      box.append(edit);
    }
    return box;
  }

  function editForm(c) {
    const wrap = el('div', '');
    wrap.style.cssText = 'display:grid;gap:10px;margin-top:6px';
    const plan = planSelect(c.plan_code);
    const name = el('input', 'input');
    name.maxLength = 60;
    name.value = c.user_id ? '' : (c.name || '');
    const ig = el('input', 'input');
    ig.maxLength = 30;
    ig.value = c.instagram || '';
    const when = el('input', 'input');
    when.type = 'datetime-local';
    when.value = toLocalInput(c.claimed_at);
    const memo = el('input', 'input');
    memo.maxLength = 300;
    memo.value = c.note || '';
    const status = el('select', 'input');
    status.append(new Option(tr('Signed up', '신청'), 'active'), new Option(tr('Cancelled (frees the spot)', '취소 (자리 반납)'), 'cancelled'));
    status.value = c.status;

    const row = el('div', '', [
      field('Plan', '구독권', plan),
      c.user_id ? null : field('Name', '이름', name),
      field('Instagram', '인스타그램', ig),
      field('Signed up at', '신청 시각', when),
      field('Memo', '메모', memo),
      field('Status', '상태', status),
    ].filter(Boolean));
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px';
    const save = textEl('button', 'btn btn-primary', 'Save', '저장');
    save.type = 'button';
    const back = textEl('button', 'btn btn-secondary', 'Close', '닫기');
    back.type = 'button';
    back.addEventListener('click', () => { state.editing = null; renderList(); });
    save.addEventListener('click', async () => {
      if (status.value === 'cancelled' && c.status === 'active'
          && !window.confirm(tr('Cancel this early-bird sign-up? The spot goes back to the pool.', '이 얼리버드 신청을 취소할까요? 자리가 다시 열려요.'))) return;
      save.disabled = true;
      const { error } = await supabase.rpc('admin_early_bird_update', {
        p_id: c.id, p_plan: plan.value, p_name: name.value, p_instagram: ig.value,
        p_claimed_at: fromLocalInput(when.value), p_note: memo.value, p_status: status.value,
      });
      save.disabled = false;
      if (error) { setMessage(errText(error), 'error'); return; }
      state.editing = null;
      setMessage(tr('Saved.', '저장했어요.'), 'success');
      await load();
    });
    const actions = el('div', '', [save, back]);
    actions.style.cssText = 'display:flex;gap:8px';
    wrap.append(row, actions);
    return wrap;
  }

  window.addEventListener('fitin:lang-change', () => { updateTabLabel(); if (state.data) render(); });
  return { load };
}
