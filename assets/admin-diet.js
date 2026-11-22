// 관리자 화면 "식단 상담" 탭 (0030 설문 · 0046 매크로 보내기)
// 회원 답변(신체 정보·운동량·식습관)을 보고, 권장 매크로를 시작값으로 칼로리·단백질·탄수화물·지방과
// 끼니별 가이드·물·보충제·학식 팁을 적어 "보내기" → 회원의 "내 식단" + 알림함 + 이메일. 다시 보내면 최신본으로 바뀐다.
// 상태(새로 → 연락함 → 완료)와 메모도 그대로 쓸 수 있다. 보내면 자동으로 완료.
import { tr, textEl, el, dateTimePair } from './membership-ui.js';
import { suggestMacros, macroKcal } from './diet-macros.js';

const TRAINING = { '0_1': ['0–1× a week', '주 0~1회'], '2_3': ['2–3× a week', '주 2~3회'], '4_5': ['4–5× a week', '주 4~5회'], '6_plus': ['6+ a week', '주 6회 이상'] };
const ACTIVITY = { sedentary: ['Mostly sitting', '주로 앉아 있음'], moderate: ['Moderate', '보통'], active: ['On my feet a lot', '많이 걷거나 서 있음'] };
const PLACES = { cafeteria: ['Cafeteria', '학식'], convenience: ['Convenience store', '편의점'], delivery: ['Delivery', '배달'], cook: ['Cook myself', '직접 요리'], eat_out: ['Eat out', '외식'] };
const GENDER = { male: ['Male', '남성'], female: ['Female', '여성'] };

const GOAL = {
  lose: ['Lose weight', '체중 감량'], muscle: ['Build muscle', '근육 늘리기'], gain: ['Gain weight', '체중 늘리기'],
  maintain: ['Maintain', '지금 유지'], health: ['Eat healthier', '건강하게 먹기'],
};
const CAFETERIA = { daily: ['Almost daily', '거의 매일'], sometimes: ['Sometimes', '가끔'], rarely: ['Rarely', '거의 안 먹음'] };
const STATUS = { new: ['New', '새로'], contacted: ['Contacted', '연락함'], done: ['Done', '완료'] };

export function initAdminDiet({ supabase, panel, tabLabel, setMessage, onNewCount }) {
  const state = { rows: [], filter: 'open' };

  const note = textEl('p', 'muted',
    'Diet consultation requests. Check the answers, adjust the suggested macros, and press Send — the member sees it on the site and gets a notice and an email.',
    '식단 상담 신청이에요. 답변을 보고 권장 매크로를 고쳐서 "보내기"를 누르면 회원의 "내 식단" 화면·알림함·이메일로 가요.');
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

    // 인스타그램은 선택 (0046) — 적었을 때만 DM 버튼
    let ig = null;
    if (r.instagram) {
      ig = el('a', 'btn btn-ghost');
      ig.href = `https://ig.me/m/${encodeURIComponent(r.instagram)}`;
      ig.target = '_blank';
      ig.rel = 'noopener noreferrer';
      ig.append(el('i', 'ph ph-instagram-logo'), ` @${r.instagram} · `, textEl('span', '', 'Send DM', 'DM 보내기'));
      ig.style.justifySelf = 'start';
    }
    const pair = (map, key) => (map[key] ? tr(...map[key]) : '-');
    const body = r.age ? `${r.age}${tr(' yrs', '세')} · ${r.height_cm}cm · ${r.weight_kg}kg${r.target_weight_kg ? ` → ${r.target_weight_kg}kg` : ''} · ${pair(GENDER, r.gender)}` : '-';

    box.append(
      line('Goal', '목표', tr(...GOAL[r.goal])),
      line('Body', '신체 정보', body),
      line('Training', '운동 빈도', pair(TRAINING, r.training)),
      line('Daily activity', '평소 활동', pair(ACTIVITY, r.daily_activity)),
      line('Meals a day', '하루 식사', tr(`${r.meals_per_day}${r.meals_per_day >= 4 ? '+' : ''}`, `${r.meals_per_day}끼${r.meals_per_day >= 4 ? ' 이상' : ''}`)),
      line('Cafeteria', '학식', tr(...CAFETERIA[r.cafeteria])),
      line('Usually eats', '주로 먹는 곳', (r.eat_places || []).length ? r.eat_places.map((p) => pair(PLACES, p)).join(', ') : '-'),
      line('Daily budget', '하루 식비', r.budget ? `${r.budget.toLocaleString('ko-KR')}${tr(' KRW', '원')}` : '-'),
      line("Can't eat", '못 먹는 음식', r.avoid_foods || '-'),
      line('Message', '남긴 말', r.message || '-'),
    );
    if (ig) box.append(ig);
    box.append(planForm(r));

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

  // 식단 매크로 작성 · 보내기 (0046). 보낸 적이 있으면 그 값으로 채우고 "고쳐서 다시 보내기"
  function planForm(r) {
    const wrap = el('div', '');
    wrap.style.cssText = 'border-top:1px solid var(--color-divider);margin-top:8px;padding-top:12px;display:grid;gap:10px';
    const sent = r.plan;
    const suggested = suggestMacros(r);
    const headRow = el('div', '');
    headRow.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px';
    headRow.append(textEl('strong', '', 'Meal plan to send', '보낼 식단'));
    if (sent) {
      const [sEn, sKo] = dateTimePair(sent.sent_at);
      headRow.append(textEl('span', 'tag', `Sent ${sEn}`, `보냄 ${sKo}`));
    }
    wrap.append(headRow);

    // 권장 매크로 (시작값)
    const num = (value, max) => { const i = el('input', 'input'); i.type = 'number'; i.min = '0'; i.max = String(max); i.step = '5'; i.value = value ?? ''; i.style.width = '100px'; return i; };
    const f = {
      calories: num(sent?.calories, 6000), protein: num(sent?.protein_g, 500), carbs: num(sent?.carbs_g, 1000), fat: num(sent?.fat_g, 400),
    };
    if (suggested) {
      const s = suggested;
      const hint = el('div', 'muted');
      hint.style.fontSize = '12.5px';
      hint.append(tr(
        `Suggested: ${s.calories} kcal · P ${s.protein}g · C ${s.carbs}g · F ${s.fat}g (BMR ${s.bmr}, maintenance ${s.tdee} kcal) `,
        `권장값: ${s.calories} kcal · 단백질 ${s.protein}g · 탄수화물 ${s.carbs}g · 지방 ${s.fat}g (기초대사 ${s.bmr}, 유지 ${s.tdee} kcal) `));
      const use = textEl('button', 'btn btn-ghost', 'Use suggested', '권장값 넣기');
      use.type = 'button';
      use.addEventListener('click', () => { f.calories.value = s.calories; f.protein.value = s.protein; f.carbs.value = s.carbs; f.fat.value = s.fat; check(); });
      hint.append(use);
      wrap.append(hint);
      if (!sent) { f.calories.value = s.calories; f.protein.value = s.protein; f.carbs.value = s.carbs; f.fat.value = s.fat; }
    } else {
      wrap.append(textEl('div', 'muted', 'No body info in this request (older form) — enter the numbers yourself.', '예전 설문이라 신체 정보가 없어요. 숫자를 직접 넣어 주세요.'));
    }
    const field = (en, ko, input) => { const box = el('label', ''); box.style.cssText = 'display:grid;gap:4px;font-size:12.5px'; box.append(textEl('span', 'muted', en, ko), input); return box; };
    const macros = el('div', '');
    macros.style.cssText = 'display:flex;flex-wrap:wrap;gap:10px;align-items:end';
    macros.append(field('Calories (kcal)', '칼로리(kcal)', f.calories), field('Protein (g)', '단백질(g)', f.protein), field('Carbs (g)', '탄수화물(g)', f.carbs), field('Fat (g)', '지방(g)', f.fat));
    const sum = el('div', 'muted');
    sum.style.fontSize = '12.5px';
    function check() {
      const k = macroKcal(f.protein.value, f.carbs.value, f.fat.value);
      const diff = k - Number(f.calories.value || 0);
      sum.textContent = tr(`P×4 + C×4 + F×9 = ${k} kcal (${diff >= 0 ? '+' : ''}${diff} vs. calories)`, `단백질×4 + 탄수화물×4 + 지방×9 = ${k} kcal (칼로리와 ${diff >= 0 ? '+' : ''}${diff})`);
      sum.style.color = Math.abs(diff) > 100 ? 'var(--danger, #e5484d)' : '';
    }
    Object.values(f).forEach((i) => i.addEventListener('input', check));
    check();
    wrap.append(macros, sum);

    const area = (en, ko, value, ph) => { const t = el('textarea', 'input'); t.maxLength = 600; t.rows = 2; t.value = value || ''; t.placeholder = ph; t.style.cssText = 'width:100%;min-height:54px;font:inherit'; return field(en, ko, t); };
    const g = {
      breakfast: area('Breakfast', '아침', sent?.breakfast, tr('e.g. Oatmeal + 2 eggs', '예: 오트밀 + 계란 2개')),
      lunch: area('Lunch', '점심', sent?.lunch, tr('e.g. Cafeteria Korean set + extra protein', '예: 학식 한식 + 단백질 반찬 추가')),
      dinner: area('Dinner', '저녁', sent?.dinner, tr('e.g. Half a bowl of rice + fish', '예: 밥 반 공기 + 생선')),
      snack: area('Snacks', '간식', sent?.snack, tr('e.g. Greek yogurt, a banana', '예: 그릭요거트, 바나나')),
      water: area('Water · supplements', '물 · 보충제', sent?.water_supplements, tr('e.g. 2.5 L water, 1 scoop protein after workouts', '예: 물 2.5L, 운동 후 단백질 1스쿱')),
      tips: area('Cafeteria · convenience-store tips', '학식 · 편의점 팁', sent?.cafeteria_tips, tr('e.g. Pick side dishes over soup; at CU grab chicken breast + boiled eggs', '예: 학식은 국물보다 반찬 위주, CU에서는 닭가슴살 + 삶은 달걀')),
    };
    g.tips.querySelector('textarea').maxLength = 1000;
    const guides = el('div', '');
    guides.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px';
    guides.append(...Object.values(g));
    wrap.append(guides);

    const send = textEl('button', 'btn btn-primary', sent ? 'Update and resend' : 'Send meal plan', sent ? '고쳐서 다시 보내기' : '식단 보내기');
    send.type = 'button';
    send.style.justifySelf = 'start';
    send.addEventListener('click', async () => {
      const n = (i) => (i.value === '' ? null : Math.round(Number(i.value)));
      if ([f.calories, f.protein, f.carbs, f.fat].some((i) => n(i) === null)) { setMessage(tr('Enter calories, protein, carbs and fat.', '칼로리·단백질·탄수화물·지방을 모두 넣어 주세요.'), 'error'); return; }
      const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.nickname || tr('this member', '이 회원');
      if (!window.confirm(tr(`Send this meal plan to ${name}? They'll get a notice and an email.`, `${name}님에게 식단을 보낼까요? 알림과 이메일이 가요.`))) return;
      const text = (k) => g[k].querySelector('textarea').value;
      send.disabled = true;
      const { error } = await supabase.rpc('admin_send_diet_plan', {
        p_consult_id: r.id, p_calories: n(f.calories), p_protein: n(f.protein), p_carbs: n(f.carbs), p_fat: n(f.fat),
        p_breakfast: text('breakfast'), p_lunch: text('lunch'), p_dinner: text('dinner'), p_snack: text('snack'), p_water: text('water'), p_tips: text('tips'),
      });
      send.disabled = false;
      if (error) {
        setMessage(/check constraint|violates/.test(error.message || '') ? tr('A number is out of range (calories 800–6000, protein ≤500g, carbs ≤1000g, fat ≤400g).', '숫자가 범위를 벗어났어요 (칼로리 800~6000, 단백질 500g·탄수화물 1000g·지방 400g 이하).') : error.message, 'error');
        return;
      }
      setMessage(tr('Meal plan sent. The member got a notice and an email.', '식단을 보냈어요. 회원에게 알림과 이메일이 갔어요.'), 'success');
      await load();
    });
    wrap.append(send);
    return wrap;
  }

  window.addEventListener('fitin:lang-change', () => { updateTabLabel(); render(); });
  return { load };
}
