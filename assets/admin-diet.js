// 관리자 화면 "식단 상담" 탭 (supabase/migrations/0030_diet_consult.sql)
// 회원이 diet.html에서 보낸 설문을 보고, 인스타그램 DM으로 연락한 뒤 상태(새로 → 연락함 → 완료)와 메모를 남긴다.
// 연락함/완료로 바꾸면 그 회원의 관리자 알림이 닫힌다.
import { tr, textEl, el, dateTimePair } from './membership-ui.js';

const GOAL = {
  lose: ['Lose weight', '체중 감량'], muscle: ['Build muscle', '근육 늘리기'], gain: ['Gain weight', '체중 늘리기'],
  maintain: ['Maintain', '지금 유지'], health: ['Eat healthier', '건강하게 먹기'],
};
const CAFETERIA = { daily: ['Almost daily', '거의 매일'], sometimes: ['Sometimes', '가끔'], rarely: ['Rarely', '거의 안 먹음'] };
const STATUS = { new: ['New', '새로'], contacted: ['Contacted', '연락함'], done: ['Done', '완료'] };

export function initAdminDiet({ supabase, panel, tabLabel, setMessage, onNewCount }) {
  const state = { rows: [], filter: 'open' };

  const note = textEl('p', 'muted',
    'Diet consultation requests from the home page Eat card. DM them on Instagram, then mark them Contacted or Done.',
    '메인 Eat 카드에서 들어온 식단 상담 신청이에요. 인스타그램 DM으로 연락한 뒤 "연락함" 또는 "완료"로 바꿔 주세요.');
  note.style.cssText = 'margin:0 0 12px;font-size:13px';
  const filterSel = el('select', 'input');
  filterSel.style.cssText = 'max-width:220px;margin-bottom:14px';
  const list = el('div', '');
  list.style.cssText = 'display:grid;gap:12px';
  panel.append(note, filterSel, list);
  filterSel.addEventListener('change', () => { state.filter = filterSel.value; render(); });

  function fillFilter() {
    filterSel.innerHTML = '';
    filterSel.append(new Option(tr('Not done yet', '완료 전'), 'open'), new Option(tr('All', '전체'), 'all'), new Option(tr('Done', '완료'), 'done'));
    filterSel.value = state.filter;
  }

  function updateTabLabel() {
    const n = state.rows.filter((r) => r.status === 'new').length;
    tabLabel.dataset.i18nEn = n ? `Diet consults (${n} new)` : 'Diet consults';
    tabLabel.dataset.i18nKo = n ? `식단 상담 (새 ${n})` : '식단 상담';
    tabLabel.textContent = tr(tabLabel.dataset.i18nEn, tabLabel.dataset.i18nKo);
    onNewCount?.(n);
  }

  async function load() {
    const { data, error } = await supabase.rpc('admin_diet_consults');
    if (error) {
      state.rows = [];
      list.replaceChildren(textEl('p', 'muted', 'Run 0030_diet_consult.sql in Supabase to turn this on.', 'Supabase에서 0030_diet_consult.sql을 실행하면 사용할 수 있어요.'));
      updateTabLabel();
      return;
    }
    state.rows = data || [];
    updateTabLabel();
    render();
  }

  function render() {
    fillFilter();
    const rows = state.rows.filter((r) => state.filter === 'all' || (state.filter === 'done' ? r.status === 'done' : r.status !== 'done'));
    list.replaceChildren();
    if (!rows.length) {
      list.append(textEl('p', 'muted', 'No requests here.', '해당하는 신청이 없어요.'));
      return;
    }
    for (const r of rows) list.append(card(r));
  }

  function line(labelEn, labelKo, value) {
    const row = el('div', '');
    row.style.cssText = 'display:grid;grid-template-columns:120px minmax(0,1fr);gap:10px;font-size:13px;padding:4px 0';
    const label = textEl('span', 'muted', labelEn, labelKo);
    row.append(label, value instanceof Node ? value : el('span', '', [value]));
    return row;
  }

  function card(r) {
    const box = el('div', 'card elev-sm');
    box.style.cssText = 'padding:16px;display:grid;gap:8px';
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.nickname || tr('Member', '회원');
    const head = el('div', '');
    head.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px';
    const title = el('div', '', [el('strong', '', [name + (r.nickname ? ` · @${r.nickname}` : '')])]);
    const [en, ko] = dateTimePair(r.updated_at || r.created_at);
    title.append(el('div', 'muted', [`${r.university || '-'} · ${tr(en, ko)}`]));
    const tag = textEl('span', 'tag' + (r.status === 'new' ? ' tag-accent' : ''), ...STATUS[r.status]);
    head.append(title, tag);
    box.append(head);

    const ig = el('a', 'btn btn-primary');
    ig.href = `https://ig.me/m/${encodeURIComponent(r.instagram)}`;
    ig.target = '_blank';
    ig.rel = 'noopener noreferrer';
    ig.append(el('i', 'ph ph-instagram-logo'), ` @${r.instagram} · `, textEl('span', '', 'Send DM', 'DM 보내기'));
    ig.style.justifySelf = 'start';

    box.append(
      line('Goal', '목표', tr(...GOAL[r.goal])),
      line('Meals a day', '하루 식사', tr(`${r.meals_per_day}${r.meals_per_day >= 4 ? '+' : ''}`, `${r.meals_per_day}끼${r.meals_per_day >= 4 ? ' 이상' : ''}`)),
      line('Cafeteria', '학식', tr(...CAFETERIA[r.cafeteria])),
      line('Daily budget', '하루 식비', r.budget ? `${r.budget.toLocaleString('ko-KR')}${tr(' KRW', '원')}` : '-'),
      line("Can't eat", '못 먹는 음식', r.avoid_foods || '-'),
      line('Message', '남긴 말', r.message || '-'),
      ig,
    );

    // 상태 + 메모
    const controls = el('div', 'toolbar');
    controls.style.margin = '6px 0 0';
    const statusSel = el('select', 'input');
    for (const [k, pair] of Object.entries(STATUS)) statusSel.append(new Option(tr(...pair), k));
    statusSel.value = r.status;
    const memo = el('input', 'input');
    memo.placeholder = tr('Memo (only admins see this)', '메모 (관리자만 봐요)');
    memo.maxLength = 500;
    memo.value = r.admin_note || '';
    memo.style.flex = '1 1 220px';
    const save = textEl('button', 'btn btn-secondary', 'Save', '저장');
    save.type = 'button';
    save.addEventListener('click', async () => {
      save.disabled = true;
      const { error } = await supabase.rpc('admin_update_diet_consult', { p_id: r.id, p_status: statusSel.value, p_note: memo.value });
      save.disabled = false;
      if (error) { setMessage(error.message, 'error'); return; }
      setMessage(tr('Saved.', '저장했어요.'), 'success');
      await load();
    });
    controls.append(statusSel, memo, save);
    box.append(controls);
    return box;
  }

  window.addEventListener('fitin:lang-change', () => { updateTabLabel(); render(); });
  return { load };
}
