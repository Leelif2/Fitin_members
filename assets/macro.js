// 근거 기반 매크로 계산기 화면 (macro.html). 계산은 assets/macro/calc.js만 쓴다.
// 입력 즉시 다시 계산(제출 버튼 없음). 저장: 로그인 + "계정에 저장" 동의 → macro_profiles·macro_logs(0048),
// 그 밖에는 이 브라우저(localStorage, try/catch)에만. 사용자가 쓴 글은 모두 textContent로만 넣는다.
import { supabase, currentPage } from './supabase-client.js';
import { initViewToggle } from './view-toggle.js';
import { initLangToggle } from './i18n.js';
import { tr, textEl, el, kstToday, addDays } from './membership-ui.js';
import * as M from './macro/calc.js';

initViewToggle();
initLangToggle();

const $ = (id) => document.getElementById(id);
const LS_KEY = 'fitin-macro-v1';
const INPUT_KEYS = Object.keys(M.defaultInputs());
const state = { inputs: M.defaultInputs(), rows: [], applied: false, session: null, consent: false, dbReady: true, savedDates: new Set(), saveNote: null };

// ── 표시 형식 ─────────────────────────────────────────────────────────────
const f0 = (x) => Math.round(x).toLocaleString('en-US');
const f1 = (x) => x.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f3 = (x) => x.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const signed = (x, f = f1) => `${x > 0 ? '+' : x < 0 ? '−' : ''}${f(Math.abs(x))}`;
const icon = (name) => { const i = el('i', `ph ${name}`); i.setAttribute('aria-hidden', 'true'); return i; };
const num = (text, cls = '') => el('span', `num ${cls}`.trim(), [text]);

// ── 문구 ──────────────────────────────────────────────────────────────────
const ERR = {
  age_range: ['Ages 19–78 only (the age range of the data the formula was built on).', '나이는 19~78세 범위에서만 계산합니다 (공식을 만든 데이터 범위).'],
  height: [`Enter a height of ${M.LIMITS.height[0]}–${M.LIMITS.height[1]} cm.`, `키는 ${M.LIMITS.height[0]}~${M.LIMITS.height[1]} cm 범위로 입력해 주세요.`],
  weight: [`Enter a weight of ${M.LIMITS.weight[0]}–${M.LIMITS.weight[1]} kg.`, `체중은 ${M.LIMITS.weight[0]}~${M.LIMITS.weight[1]} kg 범위로 입력해 주세요.`],
  bf_range: [`Body fat must be ${M.LIMITS.bodyFat[0]}–${M.LIMITS.bodyFat[1]}%.`, `체지방률은 ${M.LIMITS.bodyFat[0]}~${M.LIMITS.bodyFat[1]}% 범위여야 합니다.`],
  bf_log: ['Waist (plus hip) must be larger than your neck to calculate.', '허리(여성은 허리+엉덩이)가 목보다 커야 계산할 수 있어요.'],
};
const PAL_TEXT = {
  sedentary: [['Sedentary · light', '좌식·가벼운 활동'], ['Mostly sitting to study or work, getting around on foot. Most students who train 2–3 times a week are here.', '대부분 앉아서 공부·사무, 이동은 걷기 정도. 주 2~3회 운동하는 학생 대부분이 여기에 해당합니다.']],
  active: [['Active', '활동적'], ['You work on your feet or walk a lot, and train about an hour almost every day.', '서서 일하거나 많이 걷고, 거의 매일 1시간 정도 운동합니다.']],
  very: [['Very active', '매우 활동적'], ['Physical work, or long and hard training every day. Levels above 2.40 are hard to keep up for long.', '육체노동을 하거나 매일 오래·강하게 훈련합니다. 2.40을 넘는 수준은 오래 유지하기 어렵습니다.']],
};
const GOAL_TEXT = {
  cut1: ['Lose 1%/wk', '감량 주 1%'], cut075: ['Lose 0.75%/wk', '감량 주 0.75%'], cut05: ['Lose 0.5%/wk', '감량 주 0.5%'],
  maintain: ['Maintain', '유지'], gain025: ['Gain 0.25%/wk', '증량 주 0.25%'], gain05: ['Gain 0.5%/wk', '증량 주 0.5%'],
};
const WARN = {
  carbs_negative: () => ['Protein and fat alone go over your calorie target. Lower the fat share or the protein amount.', '단백질·지방만으로 목표 칼로리를 넘습니다. 지방 비율이나 단백질 계수를 낮춰 주세요.'],
  below_bmr: () => ['Your target is below your estimated basal metabolic rate. Slow the rate of loss or talk to a professional.', '목표가 추정 기초대사량보다 낮습니다. 감량 속도를 낮추거나 전문가와 상의해 주세요.'],
  carbs_low: (w) => [`Carbs come to ${f1(w.perKg)} g per kg of body weight, below the light-training guide (3–5 g/kg, ACSM 2016). Training quality may drop.`, `탄수화물이 체중 kg당 ${f1(w.perKg)} g으로, 가벼운 운동 기준(3~5 g/kg, ACSM 2016) 아래입니다. 훈련 강도가 떨어질 수 있어요.`],
  surplus: (w) => [`Your surplus is ${f1(w.pct)}% of your energy use. The reference range is about 10–20% (Iraki 2019); check your weight trend after two weeks and adjust.`, `잉여 칼로리가 소모량의 ${f1(w.pct)}%입니다. 참고 범위는 약 10~20%(Iraki 2019)이니 2주 뒤 체중 추세를 보고 조정하세요.`],
};

// ── 부품 ──────────────────────────────────────────────────────────────────
function seg(name, options, current, onPick, labelPair) {
  const wrap = el('div', 'seg');
  wrap.setAttribute('role', 'radiogroup');
  if (labelPair) wrap.setAttribute('aria-label', tr(...labelPair));
  for (const [value, pair] of options) {
    const input = el('input');
    Object.assign(input, { type: 'radio', name, value, checked: value === current });
    input.addEventListener('change', () => onPick(value));
    wrap.append(el('label', 'seg-opt', [input, textEl('span', '', ...pair)]));
  }
  return wrap;
}
function group(labelPair, children) {
  return el('div', 'mc-group', [textEl('span', 'mc-label', ...labelPair), ...children]);
}
function numField(key, labelPair, unit, { min, max, step = 1, hintPair } = {}) {
  const id = `in-${key}`;
  const input = el('input', 'input');
  Object.assign(input, { id, type: 'number', inputMode: step < 1 ? 'decimal' : 'numeric', min: String(min), max: String(max), step: String(step) });
  if (state.inputs[key] != null) input.value = String(state.inputs[key]);
  input.addEventListener('input', () => { state.inputs[key] = input.value === '' ? null : Number(input.value); update(); });
  const label = textEl('label', '', ...labelPair);
  label.htmlFor = id;
  const err = el('p', 'mc-err');
  err.id = `${id}-err`;
  err.hidden = true;
  input.setAttribute('aria-describedby', err.id);
  const field = el('div', 'field', [label, el('div', 'mc-unit', [input, el('span', '', [unit])]), err]);
  if (hintPair) field.append(textEl('p', 'mc-hint', ...hintPair));
  return field;
}
function slider({ id, labelPair, value, min, max, step, format, onInput, disabled = false }) {
  const range = el('input');
  Object.assign(range, { id, type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), disabled });
  const out = num(format(value));
  const label = textEl('label', '', ...labelPair);
  label.htmlFor = id;
  range.addEventListener('input', () => { out.textContent = format(Number(range.value)); onInput(Number(range.value)); });
  range.setAttribute('aria-valuetext', format(value));
  range.addEventListener('input', () => range.setAttribute('aria-valuetext', out.textContent));
  return el('div', 'mc-slider', [el('div', 'mc-slider-head', [label, out]), range, el('div', 'mc-ends', [el('span', '', [format(min)]), el('span', '', [format(max)])])]);
}

// ── 입력 카드 ─────────────────────────────────────────────────────────────
const slots = {};
function renderInputs() {
  const card = $('inputs');
  card.replaceChildren();
  slots.sex = el('div');
  slots.basics = el('div', 'mc-row2');
  slots.bf = el('div', 'mc-group');
  slots.pal = el('div', 'mc-group');
  slots.goal = el('div');
  slots.protein = el('div');
  slots.fat = el('div');
  slots.save = el('div');
  card.append(slots.sex, slots.basics, slots.bf, slots.pal, slots.goal, slots.protein, slots.fat, slots.save);
  slots.sex.append(group(['Sex', '성별'], [seg('sex', [['male', ['Male', '남']], ['female', ['Female', '여']]], state.inputs.sex, (v) => { state.inputs.sex = v; renderBodyFat(); update(); }, ['Sex', '성별'])]));
  slots.basics.append(
    numField('age', ['Age', '나이'], tr('yrs', '세'), { min: 1, max: 120 }),
    numField('heightCm', ['Height', '키'], 'cm', { min: 0, max: 300, step: 0.1 }),
    numField('weightKg', ['Weight', '체중'], 'kg', { min: 0, max: 400, step: 0.1 }),
  );
  renderBodyFat();
  renderPal();
  slots.goal.append(group(['Goal', '목표'], [seg('goal', Object.entries(GOAL_TEXT), state.inputs.goal, (v) => { state.inputs.goal = v; renderProtein(); update(); }, ['Goal', '목표'])]));
  renderProtein();
  slots.fat.append(slider({ id: 'fat', labelPair: ['Fat share of calories', '지방 비율 (칼로리 대비)'], value: state.inputs.fatPct, min: M.FAT.min, max: M.FAT.max, step: M.FAT.step, format: (v) => `${v}%`, onInput: (v) => { state.inputs.fatPct = v; update(); } }));
  renderSave();
}
function renderBodyFat() {
  const i = state.inputs;
  slots.bf.replaceChildren(textEl('span', 'mc-label', 'Body fat', '체지방률'),
    seg('bfMethod', [['unknown', ['Don’t know', '모름']], ['measured', ['Enter a measurement', '측정값 입력']], ['tape', ['Estimate with a tape', '줄자로 추정']]], i.bfMethod, (v) => { i.bfMethod = v; renderBodyFat(); renderProtein(); update(); }, ['Body fat', '체지방률']));
  if (i.bfMethod === 'measured') {
    slots.bf.append(numField('bodyFat', ['Body fat (%)', '체지방률 (%)'], '%', { min: 0, max: 100, step: 0.1, hintPair: ['From InBody or another body-composition scale.', '인바디 등 체성분 측정값을 넣어요.'] }));
  } else if (i.bfMethod === 'tape') {
    const row = el('div', `mc-row2${i.sex === 'female' ? '' : ' two'}`, [
      numField('neck', ['Neck', '목'], 'cm', { min: 0, max: 100, step: 0.1 }),
      numField('waist', ['Waist', '허리'], 'cm', { min: 0, max: 250, step: 0.1 }),
    ]);
    if (i.sex === 'female') row.append(numField('hip', ['Hip', '엉덩이'], 'cm', { min: 0, max: 250, step: 0.1 }));
    slots.bf.append(row, textEl('p', 'mc-hint',
      i.sex === 'female' ? 'Waist at the narrowest point, hip at the widest. U.S. Navy formula (Hodgdon & Beckett 1984).' : 'Waist at navel height. U.S. Navy formula (Hodgdon & Beckett 1984).',
      i.sex === 'female' ? '허리는 가장 잘록한 곳, 엉덩이는 가장 넓은 곳에서 재요. 미 해군 공식(Hodgdon & Beckett 1984).' : '허리는 배꼽 높이에서 재요. 미 해군 공식(Hodgdon & Beckett 1984).'));
    slots.bfOut = el('p', 'mc-desc');
    slots.bf.append(slots.bfOut);
  }
  slots.bfErr = el('p', 'mc-err');
  slots.bfErr.hidden = true;
  slots.bf.append(slots.bfErr);
}
function renderPal() {
  const i = state.inputs;
  const r = M.PAL_RANGES[i.palRange];
  slots.pal.replaceChildren(textEl('span', 'mc-label', 'Activity level (PAL)', '활동 수준 (PAL)'),
    seg('palRange', Object.keys(M.PAL_RANGES).map((k) => [k, PAL_TEXT[k][0]]), i.palRange, (v) => { i.palRange = v; i.pal = M.palForRange(v); renderPal(); update(); }, ['Activity level', '활동 수준']),
    textEl('p', 'mc-desc', ...PAL_TEXT[i.palRange][1]),
    slider({ id: 'pal', labelPair: ['PAL in this range', '이 범위 안의 PAL'], value: i.pal, min: r.min, max: r.max, step: M.PAL_STEP, format: (v) => v.toFixed(2), onInput: (v) => { i.pal = v; update(); } }));
}
function renderProtein() {
  const i = state.inputs;
  const kind = M.GOALS[i.goal].kind;
  const hasBf = i.bfMethod !== 'unknown';
  slots.protein.replaceChildren();
  if (kind === 'cut' && hasBf) {
    const p = M.PROTEIN.cutLbm;
    slots.protein.append(slider({ id: 'protein', labelPair: ['Protein (g per kg of lean mass)', '단백질 (제지방량 kg당 g)'], value: i.proteinCut, min: p.min, max: p.max, step: p.step, format: (v) => v.toFixed(1), onInput: (v) => { i.proteinCut = v; update(); } }));
  } else if (kind === 'cut') {
    slots.protein.append(slider({ id: 'protein', labelPair: ['Protein (fixed at 2.0 g per kg of body weight · add your body fat for a more accurate number)', '단백질 (체중 kg당 2.0 g 고정 · 체지방률을 넣으면 더 정확해집니다)'], value: M.PROTEIN.cutNoBodyFat, min: M.PROTEIN.other.min, max: M.PROTEIN.other.max, step: M.PROTEIN.other.step, format: (v) => v.toFixed(1), onInput: () => {}, disabled: true }));
  } else {
    const p = M.PROTEIN.other;
    slots.protein.append(slider({ id: 'protein', labelPair: ['Protein (g per kg of body weight)', '단백질 (체중 kg당 g)'], value: i.proteinOther, min: p.min, max: p.max, step: p.step, format: (v) => v.toFixed(1), onInput: (v) => { i.proteinOther = v; update(); } }));
  }
}
function renderSave() {
  slots.save.replaceChildren();
  if (!state.session) {
    const login = textEl('a', '', 'Log in', '로그인');
    login.href = `login.html?next=${encodeURIComponent(currentPage())}`;
    slots.save.append(el('p', 'mc-hint', [textEl('span', '', 'Saved in this browser only. ', '이 브라우저에만 저장돼요. '), login, textEl('span', '', ' to keep it in your account.', '하면 내 계정에 저장할 수 있어요.')]));
    return;
  }
  if (!state.dbReady) { slots.save.append(textEl('p', 'mc-hint', 'Account saving is being set up — saved in this browser for now.', '계정 저장을 준비 중이에요. 지금은 이 브라우저에만 저장돼요.')); return; }
  const box = el('input');
  Object.assign(box, { type: 'checkbox', checked: state.consent });
  box.addEventListener('change', () => setConsent(box.checked, box));
  slots.save.append(el('label', 'mc-consent', [box, textEl('span', '',
    'Save to my account — I agree to Fitin storing the body details I enter (age, height, weight, body fat, measurements) and my two-week log in my account. Unticking deletes what’s saved there.',
    '계정에 저장 — 입력한 신체 정보(나이·키·체중·체지방·둘레)와 2주 기록을 내 계정에 저장하는 데 동의해요. 체크를 풀면 계정에 저장된 내용은 지워져요.')]));
  state.saveNote = el('p', 'mc-hint');
  slots.save.append(state.saveNote);
}

// ── 결과 · 계산 과정 · 2주 보정 ────────────────────────────────────────────
function calibration() { return M.calibrate(state.rows); }
function currentResult() {
  const cal = calibration();
  if (!cal.ok) state.applied = false;
  return { r: M.compute(state.inputs, state.applied && cal.ok ? { applied: true, tdee: cal.tdee } : null), cal };
}

function showErrors(r) {
  const set = (key, msg) => {
    const input = $(`in-${key}`);
    const err = $(`in-${key}-err`);
    if (!input || !err) return;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    err.hidden = !msg;
    err.replaceChildren(...(msg ? [icon('ph-warning-circle'), textEl('span', '', ...msg)] : []));
  };
  const e = r.ok ? {} : r.errors;
  set('age', e.age ? ERR.age_range : null);
  set('heightCm', e.height ? ERR.height : null);
  set('weightKg', e.weight ? ERR.weight : null);
  const bfMsg = e.bodyFat === 'log' ? ERR.bf_log : e.bodyFat === 'range' ? ERR.bf_range : null;
  if (state.inputs.bfMethod === 'measured') set('bodyFat', bfMsg);
  if (state.inputs.bfMethod === 'tape') { ['neck', 'waist', 'hip'].forEach((k) => $(`in-${k}`)?.setAttribute('aria-invalid', bfMsg ? 'true' : 'false')); }
  if (slots.bfErr) { slots.bfErr.hidden = !(bfMsg && state.inputs.bfMethod === 'tape'); slots.bfErr.replaceChildren(...(bfMsg && state.inputs.bfMethod === 'tape' ? [icon('ph-warning-circle'), textEl('span', '', ...bfMsg)] : [])); }
  if (slots.bfOut) {
    const bf = M.bodyFatOf(state.inputs);
    slots.bfOut.textContent = bf && !bf.error ? tr(`Estimated body fat: ${f1(bf.value)}%`, `추정 체지방률: ${f1(bf.value)}%`) : '';
  }
}

function renderResult(r) {
  const box = $('result');
  const kids = [textEl('span', 'mc-result-label', 'Daily target intake', '하루 목표 섭취량'), el('div', 'mc-big', [num(r.ok ? f0(r.targetRounded) : '–'), el('span', 'unit', ['kcal'])])];
  if (!r.ok) {
    kids.push(el('p', 'mc-meta', ['–']));
    if (r.errors.age) kids.push(el('div', 'mc-warn', [icon('ph-warning'), textEl('span', '', ...ERR.age_range)]));
    else kids.push(textEl('p', 'mc-empty', 'Enter your age, height and weight to calculate.', '나이·키·체중을 입력하면 바로 계산해요.'));
    box.replaceChildren(...kids);
    return;
  }
  kids.push(textEl('p', 'mc-meta',
    `BMR ${f0(r.bmr)} kcal · Energy use ${f0(r.tdee)} kcal · Lean mass ${r.lbm == null ? '–' : `${f1(r.lbm)} kg`}`,
    `기초대사량 ${f0(r.bmr)} kcal · 하루 소모량 ${f0(r.tdee)} kcal · 제지방량 ${r.lbm == null ? '–' : `${f1(r.lbm)} kg`}`));
  const proteinBasis = r.protein.basis === 'lbm' ? ['lean mass', '제지방량'] : ['body weight', '체중'];
  const rows = [
    ['p', ['Protein', '단백질'], r.protein.grams, r.kcal.protein, r.share.protein, [`${f0(r.kcal.protein)} kcal · ${r.protein.coef.toFixed(1)} g per kg of ${proteinBasis[0]}`, `${f0(r.kcal.protein)} kcal · ${proteinBasis[1]} kg당 ${r.protein.coef.toFixed(1)} g`]],
    ['f', ['Fat', '지방'], r.fat, r.kcal.fat, r.share.fat, [`${f0(r.kcal.fat)} kcal · ${state.inputs.fatPct}%`, `${f0(r.kcal.fat)} kcal · ${state.inputs.fatPct}%`]],
    ['c', ['Carbs', '탄수화물'], Math.max(r.carbs, 0), r.kcal.carbs, r.share.carbs, [`${f0(r.kcal.carbs)} kcal · ${f1(Math.max(r.carbsPerKg, 0))} g per kg of body weight`, `${f0(r.kcal.carbs)} kcal · 체중 kg당 ${f1(Math.max(r.carbsPerKg, 0))} g`]],
  ];
  const list = el('div', 'mc-macros');
  for (const [cls, name, g, , share, sub] of rows) {
    const bar = el('div', `mc-bar ${cls}`, [el('span')]);
    bar.setAttribute('aria-hidden', 'true');
    requestAnimationFrame(() => { bar.firstChild.style.width = `${Math.round(share * 100)}%`; });
    list.append(el('div', 'mc-macro', [textEl('span', 'name', ...name), bar, el('span', 'g num', [f0(g), el('small', '', ['g'])]), textEl('span', 'sub', ...sub)]));
  }
  kids.push(list);
  if (r.warnings.length) kids.push(el('div', 'mc-warns', r.warnings.map((w) => el('div', 'mc-warn', [icon('ph-warning'), textEl('span', '', ...WARN[w.code](w))]))));
  if (r.applied) kids.push(textEl('p', 'mc-note', `Your daily energy use is the measured correction from your two-week log (formula estimate ${f0(r.formulaTdee)} kcal).`, `하루 소모량은 2주 기록에서 계산한 실측 보정값입니다 (공식 추정 ${f0(r.formulaTdee)} kcal).`));
  else kids.push(textEl('p', 'mc-src', 'Energy use: Mifflin-St Jeor (1990) BMR × FAO/WHO/UNU (2004) activity level.', '하루 소모량: Mifflin-St Jeor(1990) 기초대사량 × FAO/WHO/UNU(2004) 활동 수준.'));
  box.replaceChildren(...kids);
}

function renderSteps(r, cal) {
  const i = state.inputs;
  const step = (n, titlePair, formulaPair, srcPair) => el('li', 'card mc-step', [
    el('div', 'mc-step-head', [num(String(n), 'mc-step-no'), textEl('h3', '', ...titlePair)]),
    textEl('p', 'mc-formula', ...formulaPair), textEl('p', 'mc-src', ...srcPair)]);
  const dash = ['–', '–'];
  const ok = r.ok;
  const sexTerm = i.sex === 'male' ? '+ 5' : '− 161';
  const bmrF = ok ? [`10 × ${f1(i.weightKg)} + 6.25 × ${f1(i.heightCm)} − 5 × ${i.age} ${sexTerm} = ${f1(r.bmr)} kcal`, `10 × ${f1(i.weightKg)} + 6.25 × ${f1(i.heightCm)} − 5 × ${i.age} ${sexTerm} = ${f1(r.bmr)} kcal`] : dash;
  let bfF = dash;
  if (ok && r.bodyFat == null) bfF = ['Body fat unknown — lean mass isn’t calculated. When cutting, protein is based on body weight.', '체지방률을 모르면 제지방량은 계산하지 않아요. 감량할 때 단백질은 체중 기준으로 계산해요.'];
  else if (ok && i.bfMethod === 'measured') bfF = [`Body fat ${f1(r.bodyFat)}% (measured) → lean mass ${f1(i.weightKg)} × (1 − ${f1(r.bodyFat)}/100) = ${f1(r.lbm)} kg`, `체지방률 ${f1(r.bodyFat)}% (측정값) → 제지방량 ${f1(i.weightKg)} × (1 − ${f1(r.bodyFat)}/100) = ${f1(r.lbm)} kg`];
  else if (ok) {
    const k = M.NAVY[i.sex];
    const inner = i.sex === 'female' ? `${f1(i.waist)} + ${f1(i.hip)} − ${f1(i.neck)}` : `${f1(i.waist)} − ${f1(i.neck)}`;
    const t = `495 ÷ (${k.a} − ${k.b} × log10(${inner}) + ${k.c} × log10(${f1(i.heightCm)})) − 450 = ${f1(r.bodyFat)}% → ${f1(i.weightKg)} × (1 − ${f1(r.bodyFat)}/100) = ${f1(r.lbm)} kg`;
    bfF = [t, t];
  }
  const tdeeF = !ok ? dash : r.applied
    ? [`Measured: average intake ${f1(cal.meanIntake)} − trend ${signed(cal.slope)} kg/day × 7,700 = ${f1(r.tdee)} kcal (formula ${f1(r.bmr)} × ${r.pal.toFixed(2)} = ${f1(r.formulaTdee)} kcal)`, `실측: 평균 섭취 ${f1(cal.meanIntake)} − 체중 추세 ${signed(cal.slope, f3)} kg/일 × 7,700 = ${f1(r.tdee)} kcal (공식 ${f1(r.bmr)} × ${r.pal.toFixed(2)} = ${f1(r.formulaTdee)} kcal)`]
    : [`${f1(r.bmr)} × PAL ${r.pal.toFixed(2)} = ${f1(r.tdee)} kcal`, `${f1(r.bmr)} × PAL ${r.pal.toFixed(2)} = ${f1(r.tdee)} kcal`];
  const goalF = !ok ? dash : r.goalPct === 0
    ? [`Maintain: no change → ${f1(r.tdee)} kcal`, `유지: 증감 없음 → ${f1(r.tdee)} kcal`]
    : [`(${signed(r.goalPct, String)} ÷ 100) × ${f1(i.weightKg)} kg × 7,700 ÷ 7 = ${signed(r.delta)} kcal → ${f1(r.tdee)} ${r.delta < 0 ? "−" : "+"} ${f1(Math.abs(r.delta))} = ${f1(r.target)} kcal`, `(${signed(r.goalPct, String)} ÷ 100) × ${f1(i.weightKg)} kg × 7,700 ÷ 7 = ${signed(r.delta)} kcal → ${f1(r.tdee)} ${r.delta < 0 ? "−" : "+"} ${f1(Math.abs(r.delta))} = ${f1(r.target)} kcal`];
  const pBase = ok && r.protein.basis === 'lbm' ? ['lean mass', '제지방량', r.lbm] : ['body weight', '체중', ok ? i.weightKg : 0];
  const proteinF = ok ? [`${pBase[0]} ${f1(pBase[2])} kg × ${r.protein.coef.toFixed(1)} g = ${f1(r.protein.grams)} g (${f1(r.kcal.protein)} kcal)`, `${pBase[1]} ${f1(pBase[2])} kg × ${r.protein.coef.toFixed(1)} g = ${f1(r.protein.grams)} g (${f1(r.kcal.protein)} kcal)`] : dash;
  const fatF = ok ? [`${f1(r.target)} × ${i.fatPct}% ÷ 9 = ${f1(r.fat)} g`, `${f1(r.target)} × ${i.fatPct}% ÷ 9 = ${f1(r.fat)} g`] : dash;
  const carbF = ok ? [`(${f1(r.target)} − ${f1(r.protein.grams)} × 4 − ${f1(r.fat)} × 9) ÷ 4 = ${f1(r.carbs)} g (${f1(r.carbsPerKg)} g per kg of body weight)`, `(${f1(r.target)} − ${f1(r.protein.grams)} × 4 − ${f1(r.fat)} × 9) ÷ 4 = ${f1(r.carbs)} g (체중 kg당 ${f1(r.carbsPerKg)} g)`] : dash;
  const goalKind = ok ? r.goalKind : M.GOALS[i.goal].kind;
  const proteinSrc = goalKind === 'cut' && i.bfMethod !== 'unknown' ? ['Helms 2014 [7]: 2.3–3.1 g per kg of lean mass when cutting.', 'Helms 2014 [7]: 감량 시 제지방량 kg당 2.3~3.1 g.']
    : goalKind === 'cut' ? ['ISSN 2017 [5], upper end: 2.0 g per kg of body weight.', 'ISSN 2017 [5] 상단: 체중 kg당 2.0 g.']
      : ['ISSN 2017 [5] · Morton 2018 [6]: 1.4–2.0 g per kg of body weight.', 'ISSN 2017 [5] · Morton 2018 [6]: 체중 kg당 1.4~2.0 g.'];
  $('steps').replaceChildren(
    step(1, ['Basal metabolic rate', '기초대사량'], bmrF, ['Mifflin-St Jeor 1990 [1] — the most likely of the compared formulas to land within ±10% of measured values [2].', 'Mifflin-St Jeor 1990 [1] — 비교한 공식 중 실측 ±10% 안에 들 가능성이 가장 높음 [2].']),
    step(2, ['Body fat · lean mass', '체지방률 · 제지방량'], bfF, ['Lean mass = weight × (1 − body fat/100). Tape estimate: Hodgdon & Beckett 1984 [4].', '제지방량 = 체중 × (1 − 체지방률/100). 줄자 추정: Hodgdon & Beckett 1984 [4].']),
    step(3, ['Daily energy use', '하루 소모량'], tdeeF, r.applied ? ['Two-week log: least-squares weight trend, 7,700 kcal/kg [11].', '2주 기록: 최소제곱 체중 추세, 7,700 kcal/kg [11].'] : ['FAO/WHO/UNU 2004, Table 5.3 [3].', 'FAO/WHO/UNU 2004, 표 5.3 [3].']),
    step(4, ['Target calories', '목표 칼로리'], goalF, ['Cutting 0.5–1%/wk: Helms 2014 [7]. Gaining 0.25–0.5%/wk: Iraki 2019 [8]. 7,700 kcal/kg: Hall 2008 [11].', '감량 주 0.5~1%: Helms 2014 [7]. 증량 주 0.25~0.5%: Iraki 2019 [8]. 7,700 kcal/kg: Hall 2008 [11].']),
    step(5, ['Protein', '단백질'], proteinF, proteinSrc),
    step(6, ['Fat', '지방'], fatF, ['IOM AMDR [9]: 20–35% of calories.', 'IOM AMDR [9]: 칼로리의 20~35%.']),
    step(7, ['Carbohydrate', '탄수화물'], carbF, ['The remaining calories. Light-training guide 3–5 g/kg: ACSM 2016 [10].', '남은 칼로리. 가벼운 운동 기준 3~5 g/kg: ACSM 2016 [10].']),
  );
}

// 2주 보정 표
function renderCalibration() {
  const wrap = $('calib');
  const cal = calibration();
  const table = el('table', 'table');
  const head = el('tr', '', [['Date', '날짜'], ['Morning weight (kg)', '아침 체중(kg)'], ['Daily intake (kcal)', '하루 섭취(kcal)'], ['', '']].map(([en, ko]) => textEl('th', '', en, ko)));
  const body = el('tbody');
  const dupes = new Set(state.rows.map((r) => r.date).filter((d, k, a) => d && a.indexOf(d) !== k));
  state.rows.forEach((row, k) => {
    const date = el('input', 'input');
    Object.assign(date, { type: 'date', value: row.date || '' });
    date.setAttribute('aria-label', tr(`Row ${k + 1} date`, `${k + 1}행 날짜`));
    if (dupes.has(row.date)) { date.setAttribute('aria-invalid', 'true'); date.title = tr('Same date twice', '같은 날짜가 두 번 있어요'); }
    const w = el('input', 'input');
    Object.assign(w, { type: 'number', inputMode: 'decimal', step: '0.1', min: String(M.LIMITS.weight[0]), max: String(M.LIMITS.weight[1]), value: row.weight ?? '' });
    w.setAttribute('aria-label', tr(`Row ${k + 1} morning weight in kg`, `${k + 1}행 아침 체중(kg)`));
    const c = el('input', 'input');
    Object.assign(c, { type: 'number', inputMode: 'numeric', step: '1', min: '0', value: row.intake ?? '' });
    c.setAttribute('aria-label', tr(`Row ${k + 1} intake in kcal`, `${k + 1}행 하루 섭취(kcal)`));
    date.addEventListener('change', () => { row.date = date.value || null; changedRows(true); });
    w.addEventListener('input', () => { row.weight = w.value === '' ? null : Number(w.value); changedRows(false); });
    c.addEventListener('input', () => { row.intake = c.value === '' ? null : Number(c.value); changedRows(false); });
    const del = el('button', 'btn btn-secondary btn-icon', [icon('ph-trash')]);
    del.type = 'button';
    del.setAttribute('aria-label', tr(`Delete row ${k + 1}`, `${k + 1}행 삭제`));
    del.addEventListener('click', () => { state.rows.splice(k, 1); changedRows(true); });
    body.append(el('tr', '', [el('td', '', [date]), el('td', '', [w]), el('td', '', [c]), el('td', '', [del])]));
  });
  table.append(el('thead', '', [head]), body);
  const add = textEl('button', 'btn btn-secondary', '+ Add row', '+ 행 추가');
  add.type = 'button';
  add.addEventListener('click', () => {
    const last = [...state.rows].reverse().find((r) => r.date);
    state.rows.push({ date: last ? addDays(last.date, 1) : kstToday(), weight: null, intake: null });
    changedRows(true);
  });
  const clear = textEl('button', 'btn btn-secondary', 'Clear all', '모두 지우기');
  clear.type = 'button';
  clear.disabled = !state.rows.length;
  clear.addEventListener('click', () => { if (window.confirm(tr('Clear every row?', '기록을 모두 지울까요?'))) { state.rows = []; state.applied = false; changedRows(true); } });

  wrap.replaceChildren(
    textEl('h2', '', 'Correct your real energy use with two weeks of logs', '2주 기록으로 실제 소모량 보정'),
    textEl('p', 'mc-desc', 'Log your morning weight and what you ate each day. From your weight trend and average intake we work out what you actually burn. Only rows with a date, weight and intake are used.', '매일 아침 체중과 하루 섭취 칼로리를 적어요. 체중 추세와 평균 섭취로 실제 소모량을 계산해요. 날짜·체중·섭취가 모두 있는 행만 써요.'),
    el('div', 'mc-table-wrap', [table]),
    el('div', 'mc-actions', [add, clear]),
    statusBox);
  renderCalStatus();
}
const statusBox = el('div', 'mc-calib');
statusBox.setAttribute('aria-live', 'polite');
function renderCalStatus() {
  const cal = calibration();
  if (!cal.ok) {
    statusBox.replaceChildren(textEl('p', 'mc-desc', `${cal.n} entries · ${cal.days} days. We calculate once there are at least 14 days and 8 entries.`, `기록 ${cal.n}개 · ${cal.days}일. 14일 이상, 8개 이상이 쌓이면 계산합니다.`));
    return;
  }
  const toggle = textEl('button', state.applied ? 'btn btn-secondary' : 'btn btn-primary', state.applied ? 'Back to the formula value' : 'Recalculate my target with this value', state.applied ? '공식값으로 되돌리기' : '이 값으로 목표 다시 계산');
  toggle.type = 'button';
  toggle.addEventListener('click', () => { state.applied = !state.applied; renderCalStatus(); update(); });
  statusBox.replaceChildren(
    textEl('span', 'mc-label', 'Measured daily energy use', '실측 하루 소모량'),
    el('div', 'mc-big', [num(f0(cal.tdee)), el('span', 'unit', ['kcal'])]),
    textEl('p', 'mc-desc', `Average intake ${f1(cal.meanIntake)} kcal − weight trend ${signed(cal.slope * 7, f3)} kg/wk × 7,700 ÷ 7 · ${cal.n} entries, ${cal.days} days`, `평균 섭취 ${f1(cal.meanIntake)} kcal − 체중 추세 ${signed(cal.slope * 7, f3)} kg/주 × 7,700 ÷ 7 · 기록 ${cal.n}개, ${cal.days}일`),
    el('div', 'mc-actions', [toggle]));
}
function changedRows(rerenderTable) {
  if (rerenderTable) renderCalibration(); else renderCalStatus();
  update(false);
  scheduleSave();
}

function update(save = true) {
  const { r, cal } = currentResult();
  showErrors(r);
  renderResult(r);
  renderSteps(r, cal);
  if (save) scheduleSave();
}

function renderSources() {
  $('sources').replaceChildren(...M.SOURCES.map((s) => {
    const li = el('li', '', [s.text, ' ']);
    s.links.forEach((href, k) => {
      if (k) li.append(' · ');
      const a = el('a', '', [href]);
      Object.assign(a, { href, target: '_blank', rel: 'noopener noreferrer' });
      li.append(a);
    });
    return li;
  }));
}

// ── 저장 ──────────────────────────────────────────────────────────────────
const cleanInputs = () => Object.fromEntries(INPUT_KEYS.map((k) => [k, state.inputs[k] ?? null]));
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ inputs: cleanInputs(), rows: state.rows, applied: state.applied })); } catch (e) { /* 저장 불가 환경 */ }
}
function readLocal() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) { return null; }
}
function clearLocal() { try { localStorage.removeItem(LS_KEY); } catch (e) { /* 무시 */ } }

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 700);
}
async function save() {
  if (!(state.session && state.consent && state.dbReady)) { saveLocal(); return; }
  const uid = state.session.user.id;
  const { error } = await supabase.from('macro_profiles').upsert({ user_id: uid, inputs: cleanInputs(), calibration_applied: state.applied, consent: true }, { onConflict: 'user_id' });
  if (error) return note('Couldn’t save to your account.', '계정에 저장하지 못했어요.');
  const seen = new Set();
  const rows = state.rows.filter((r) => r.date && !seen.has(r.date) && seen.add(r.date))
    .map((r) => ({ user_id: uid, log_date: r.date, weight_kg: Number.isFinite(r.weight) ? r.weight : null, intake_kcal: Number.isFinite(r.intake) ? Math.round(r.intake) : null }));
  const gone = [...state.savedDates].filter((d) => !seen.has(d));
  if (gone.length) await supabase.from('macro_logs').delete().eq('user_id', uid).in('log_date', gone);
  if (rows.length) {
    const { error: e2 } = await supabase.from('macro_logs').upsert(rows, { onConflict: 'user_id,log_date' });
    if (e2) return note('Some log rows couldn’t be saved (check the numbers).', '일부 기록을 저장하지 못했어요 (숫자를 확인해 주세요).');
  }
  state.savedDates = seen;
  note('Saved to your account.', '계정에 저장했어요.');
}
function note(en, ko) { if (state.saveNote) { state.saveNote.dataset.i18nEn = en; state.saveNote.dataset.i18nKo = ko; state.saveNote.textContent = tr(en, ko); } }

async function setConsent(on, box) {
  if (on) {
    state.consent = true;
    await save();
    clearLocal();
    return;
  }
  if (!window.confirm(tr('Stop saving to your account and delete what’s saved there?', '계정 저장을 그만하고, 계정에 저장된 입력값과 기록을 지울까요?'))) { box.checked = true; return; }
  const uid = state.session.user.id;
  await supabase.from('macro_logs').delete().eq('user_id', uid);
  await supabase.from('macro_profiles').delete().eq('user_id', uid);
  state.consent = false;
  state.savedDates = new Set();
  saveLocal();
  note('Deleted from your account. Saved in this browser only.', '계정에서 지웠어요. 이제 이 브라우저에만 저장돼요.');
}

// ── 시작 ──────────────────────────────────────────────────────────────────
function renderAll() {
  renderInputs();
  renderSources();
  renderCalibration();
  update(false);
}

async function start() {
  const { data: { session } } = await supabase.auth.getSession();
  state.session = session;
  let loaded = null;
  if (session) {
    const prof = await supabase.from('macro_profiles').select('inputs, calibration_applied').eq('user_id', session.user.id).maybeSingle();
    if (prof.error) state.dbReady = false;
    else if (prof.data) {
      const logs = await supabase.from('macro_logs').select('log_date, weight_kg, intake_kcal').eq('user_id', session.user.id).order('log_date');
      loaded = {
        inputs: prof.data.inputs, applied: prof.data.calibration_applied,
        rows: (logs.data || []).map((l) => ({ date: l.log_date, weight: l.weight_kg == null ? null : Number(l.weight_kg), intake: l.intake_kcal })),
      };
      state.consent = true;
      state.savedDates = new Set(loaded.rows.map((r) => r.date));
    }
  }
  if (!loaded) loaded = readLocal();
  if (loaded) {
    for (const k of INPUT_KEYS) if (loaded.inputs && loaded.inputs[k] !== undefined) state.inputs[k] = loaded.inputs[k];
    if (!M.PAL_RANGES[state.inputs.palRange]) state.inputs.palRange = 'sedentary';
    if (!M.GOALS[state.inputs.goal]) state.inputs.goal = M.GOAL_DEFAULT;
    state.rows = Array.isArray(loaded.rows) ? loaded.rows.map((r) => ({ date: r.date || null, weight: Number.isFinite(r.weight) ? r.weight : null, intake: Number.isFinite(r.intake) ? r.intake : null })) : [];
    state.applied = Boolean(loaded.applied);
  }
  renderAll();
}

window.addEventListener('fitin:lang-change', () => renderAll());
start();
