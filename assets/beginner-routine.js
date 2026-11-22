// 초보자 근성장 루틴 화면 (beginner-routine.html)
// 루틴은 누구나 볼 수 있고, "기록하기"는 로그인한 회원만 쓸 수 있다(workout_logs, 0047 — 본인 기록만 읽기·쓰기·지우기).
// 회원이 쓴 메모 등은 모두 textContent로만 넣는다.
import { supabase, currentPage } from './supabase-client.js';
import { initViewToggle } from './view-toggle.js';
import { initLangToggle } from './i18n.js';
import { tr, textEl, el, datePair, kstToday, addDays } from './membership-ui.js';
import { EXERCISES, ROUTINES, PRINCIPLES, TIMELINE, exerciseName, setsText, repsText } from './beginner-routine-data.js';

initViewToggle();
initLangToggle();

const $ = (id) => document.getElementById(id);
const lang = () => (document.documentElement.lang === 'ko' ? 'ko' : 'en');
const pick = (pair) => tr(pair[0], pair[1]);
const state = { plan: 'week3', session: null, logs: [], logsReady: false };

function say(en, ko, kind = '') {
  const m = $('br-message');
  m.dataset.i18nEn = en;
  m.dataset.i18nKo = ko;
  m.textContent = tr(en, ko);
  m.className = 'ms-message' + (kind ? ' is-' + kind : '');
}

// ── 핵심 원칙 · 타임라인 ───────────────────────────────────────────────
function renderPrinciples() {
  $('principles').replaceChildren(...PRINCIPLES.map((p) => el('div', 'br-principle', [
    el('i', `ph ${p.icon}`),
    textEl('span', 'ms-kicker', ...p.title),
    textEl('strong', '', ...p.value),
    textEl('p', '', ...p.body),
  ])));
  $('principles').querySelectorAll('i').forEach((i) => i.setAttribute('aria-hidden', 'true'));
}
function renderTimeline() {
  $('timeline').replaceChildren(...TIMELINE.map((t) => el('li', '', [textEl('span', 'ms-kicker', ...t.weeks), textEl('strong', '', ...t.title), textEl('p', '', ...t.body)])));
}

// ── 주 3일 / 주 5일 ───────────────────────────────────────────────────
function renderPlan() {
  const plan = ROUTINES[state.plan];
  document.querySelectorAll('.br-tab').forEach((t) => {
    const on = t.dataset.plan === state.plan;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  });
  $('panel-routine').setAttribute('aria-labelledby', `tab-${state.plan}`);
  const info = (icon, pair) => el('div', '', [Object.assign(el('i', `ph ${icon}`), { ariaHidden: 'true' }), textEl('span', '', ...pair)]);
  $('plan-info').replaceChildren(info('ph-calendar-check', plan.schedule), info('ph-user-focus', plan.who), info('ph-bed', plan.restDays));

  $('plan-days').replaceChildren(...plan.days.map((day, i) => {
    const head = el('div', 'br-day-head', [
      el('span', 'br-day-icon', [Object.assign(el('i', `ph ${day.icon}`), { ariaHidden: 'true' })]),
      el('div', '', [textEl('span', 'ms-kicker', `Day ${i + 1}`, `Day ${i + 1}`), textEl('h3', '', ...day.title)]),
      textEl('span', 'br-day-when', `e.g. ${day.when[0]}`, `예: ${day.when[1]}요일`),
    ]);
    const list = el('ol', 'br-rows');
    day.rows.forEach((r, k) => {
      const name = el('div', 'br-row-name', [exerciseName(r, lang())]);
      if (r.ex.some((x) => EXERCISES[x].sbd)) name.append(textEl('span', 'ms-tag', 'Big 3', '3대'));
      const dose = el('span', 'br-dose', [el('span', 'sets', [setsText(r, lang())]), el('span', '', [repsText(r, lang())])]);
      dose.setAttribute('aria-label', `${setsText(r, lang())}, ${repsText(r, lang())}`);
      const log = textEl('button', 'btn btn-ghost br-log-btn', 'Log', '기록하기');
      log.type = 'button';
      log.setAttribute('aria-label', tr(`Log ${exerciseName(r, 'en')}`, `${exerciseName(r, 'ko')} 기록하기`));
      log.addEventListener('click', () => openLog(r));
      list.append(el('li', 'br-row', [el('span', 'br-row-no', [String(k + 1).padStart(2, '0')]), name, dose, log]));
    });
    return el('article', 'br-day', [head, list]);
  }));
}

function selectPlan(key, scroll) {
  if (!ROUTINES[key]) return;
  state.plan = key;
  renderPlan();
  if (scroll) $('routines').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
document.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', (e) => {
  if (b.tagName === 'A') e.preventDefault();
  selectPlan(b.dataset.plan, b.tagName === 'A');
  if (b.tagName === 'A') history.replaceState(null, '', `#${b.dataset.plan}`);
}));
// 탭: 왼쪽·오른쪽 화살표로 이동
document.querySelector('.br-tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  const next = state.plan === 'week3' ? 'week5' : 'week3';
  selectPlan(next, false);
  $(`tab-${next}`).focus();
});

// ── 기록 ──────────────────────────────────────────────────────────────
const SETS_FMT = (log) => log.reps.map((r, i) => (Number(log.weights[i]) > 0 ? `${Number(log.weights[i])}kg×${r}` : `${r}${log.unit === 'sec' ? tr('s', '초') : ''}`)).join(' · ');

async function loadLogs() {
  if (!state.session) return;
  const { data, error } = await supabase.from('workout_logs')
    .select('id, performed_on, exercise, weights, reps, unit, note, created_at')
    .order('performed_on', { ascending: false }).order('id', { ascending: false }).limit(200);
  state.logsReady = !error;
  state.logs = error ? [] : data;
  renderLogArea(error);
}

function renderLogArea(error) {
  const area = $('log-area');
  if (!state.session) {
    const login = textEl('a', 'btn btn-primary', 'Log in to keep a workout log', '로그인하고 운동 기록하기');
    login.href = `login.html?next=${encodeURIComponent(currentPage())}`;
    area.replaceChildren(el('div', 'br-card', [textEl('p', 'ms-muted', 'Your log shows your last weights and tells you when to add weight.', '기록을 남기면 지난 무게와 증량할 때를 알려드려요.'), login]));
    area.querySelector('p').style.margin = '0 0 12px';
    return;
  }
  if (error) {
    area.replaceChildren(textEl('div', 'br-card ms-muted', 'The workout log is being set up — please check back soon.', '운동 기록 기능을 준비 중이에요. 잠시 후 다시 확인해 주세요.'));
    return;
  }
  if (!state.logs.length) {
    area.replaceChildren(textEl('div', 'br-card ms-muted', 'No workouts yet. Tap “Log” next to an exercise above.', '아직 기록이 없어요. 위의 운동 옆 "기록하기"를 눌러 보세요.'));
    return;
  }
  const list = el('ul', 'br-log-list');
  for (const log of state.logs.slice(0, 20)) {
    const ex = EXERCISES[log.exercise];
    const del = textEl('button', 'btn btn-ghost br-log-btn', 'Delete', '삭제');
    del.type = 'button';
    del.addEventListener('click', async () => {
      if (!window.confirm(tr('Delete this entry?', '이 기록을 지울까요?'))) return;
      const { error: e } = await supabase.from('workout_logs').delete().eq('id', log.id);
      if (e) { say('Couldn’t delete it. Please try again.', '지우지 못했어요. 다시 시도해 주세요.', 'error'); return; }
      say('Deleted.', '지웠어요.', 'success');
      loadLogs();
    });
    const body = el('div', '', [el('strong', '', [ex ? ex[lang()] : log.exercise]), el('span', 'sets', [SETS_FMT(log) + (log.note ? ` — ${log.note}` : '')])]);
    list.append(el('li', '', [textEl('span', 'when', ...datePair(log.performed_on)), body, del]));
  }
  area.replaceChildren(el('div', 'br-card', [list]));
}

// 지난 기록으로 다음 목표 계산 (더블 프로그레션)
function nextTarget(row, last) {
  if (!last || !row.reps) return null;
  const top = row.reps[row.reps.length - 1];
  const ex = EXERCISES[last.exercise];
  const done = last.reps.length >= row.sets[0] && last.reps.every((r) => r >= top);
  const weight = Math.max(...last.weights.map(Number));
  if (!done) return { add: 0, weight, top };
  const step = ex.region === 'lower' ? 2.5 : ex.region === 'upper' ? 2.5 : 0;
  return { add: weight > 0 ? step : 0, weight: weight > 0 ? weight + step : 0, top, region: ex.region };
}

const dialog = $('log-dialog');
const form = $('log-form');

function openLog(row) {
  form.replaceChildren();
  const closeBtn = el('button', 'btn btn-ghost', [Object.assign(el('i', 'ph ph-x'), { ariaHidden: 'true' })]);
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', tr('Close', '닫기'));
  closeBtn.addEventListener('click', () => dialog.close());
  const title = el('h2', '', [exerciseName(row, lang())]);
  title.id = 'log-title';
  form.append(el('div', 'br-dialog-head', [el('div', '', [title, el('div', 'ms-muted', [`${setsText(row, lang())} × ${repsText(row, lang())}`])]), closeBtn]));

  if (!state.session) {
    const login = textEl('a', 'btn btn-primary', 'Log in', '로그인하기');
    login.href = `login.html?next=${encodeURIComponent(currentPage())}`;
    form.append(textEl('p', 'ms-muted', 'Log in to save your workouts.', '로그인하면 운동을 기록할 수 있어요.'), el('div', 'br-dialog-actions', [login]));
    dialog.showModal();
    return;
  }
  if (!state.logsReady) {
    form.append(textEl('p', 'ms-muted', 'The workout log is being set up — please check back soon.', '운동 기록 기능을 준비 중이에요. 잠시 후 다시 확인해 주세요.'));
    dialog.showModal();
    return;
  }

  // 둘 중 하나 / 둘 다인 줄은 어떤 운동을 했는지 고른다
  let exKey = row.ex[0];
  const choose = el('select', 'input');
  if (row.ex.length > 1) {
    for (const k of row.ex) { const o = document.createElement('option'); o.value = k; o.textContent = EXERCISES[k][lang()]; choose.append(o); }
    const f = el('label', 'br-field', [textEl('span', '', 'Exercise', '운동'), choose]);
    form.append(f);
  }
  const last = el('div', 'br-last');
  const date = el('input', 'input');
  date.type = 'date';
  date.value = kstToday();
  date.max = kstToday();
  date.min = addDays(kstToday(), -60);
  form.append(last, el('label', 'br-field', [textEl('span', '', 'Date', '날짜'), date]));

  const sets = el('div', 'br-set-table');
  const unitSec = () => EXERCISES[exKey].unit === 'sec';
  const head = el('div', 'br-set br-set-head', [textEl('span', '', 'Set', '세트'), textEl('span', '', 'Weight (kg)', '무게(kg)'), el('span', '', []), el('span', '', [])]);
  const repHead = head.children[2];
  const setRow = (w = '', r = '') => {
    const weight = el('input', 'input');
    Object.assign(weight, { type: 'number', inputMode: 'decimal', min: '0', max: '500', step: '0.5', value: w, placeholder: EXERCISES[exKey].body ? tr('optional', '선택') : 'kg' });
    const reps = el('input', 'input');
    Object.assign(reps, { type: 'number', inputMode: 'numeric', min: '1', max: '300', step: '1', value: r });
    const remove = el('button', 'btn btn-ghost br-icon-btn', [Object.assign(el('i', 'ph ph-minus'), { ariaHidden: 'true' })]);
    remove.type = 'button';
    remove.setAttribute('aria-label', tr('Remove set', '세트 지우기'));
    const line = el('div', 'br-set', [el('span', 'no', []), weight, reps, remove]);
    remove.addEventListener('click', () => { if (sets.querySelectorAll('.br-set:not(.br-set-head)').length > 1) { line.remove(); number(); } });
    sets.append(line);
    number();
  };
  const number = () => sets.querySelectorAll('.br-set:not(.br-set-head)').forEach((l, i) => {
    l.firstChild.textContent = String(i + 1);
    const [w, r] = l.querySelectorAll('input');
    w.setAttribute('aria-label', tr(`Set ${i + 1} weight in kg`, `${i + 1}세트 무게(kg)`));
    r.setAttribute('aria-label', tr(`Set ${i + 1} ${unitSec() ? 'seconds' : 'reps'}`, `${i + 1}세트 ${unitSec() ? '초' : '횟수'}`));
  });
  const addSet = textEl('button', 'btn btn-ghost', '+ Add set', '+ 세트 추가');
  addSet.type = 'button';
  addSet.addEventListener('click', () => { if (sets.querySelectorAll('.br-set:not(.br-set-head)').length < 10) setRow(); });
  const note = el('input', 'input');
  Object.assign(note, { type: 'text', maxLength: 200, placeholder: tr('e.g. Felt easy, keep elbows tucked', '예: 가볍게 됐음, 팔꿈치 붙이기') });
  form.append(sets, addSet, el('label', 'br-field', [textEl('span', '', 'Note (optional)', '메모 (선택)'), note]));

  const err = el('p', 'ms-message');
  err.setAttribute('role', 'status');
  const save = textEl('button', 'btn btn-primary', 'Save', '저장');
  save.type = 'submit';
  const cancel = textEl('button', 'btn btn-ghost', 'Cancel', '취소');
  cancel.type = 'button';
  cancel.addEventListener('click', () => dialog.close());
  const actions = el('div', 'br-dialog-actions', [cancel, save]);
  if (EXERCISES[exKey].sbd) {
    const lift = textEl('a', 'btn btn-ghost', 'Post a best to the Big 3 challenge', '3대 챌린지에 최고 기록 올리기');
    lift.href = 'lifts.html';
    actions.prepend(lift);
  }
  form.append(err, actions);

  // 고른 운동에 맞춰 지난 기록·다음 목표·세트 칸을 채운다
  function prepare() {
    exKey = row.ex.length > 1 ? choose.value : row.ex[0];
    repHead.dataset.i18nEn = unitSec() ? 'Seconds' : 'Reps';
    repHead.dataset.i18nKo = unitSec() ? '초' : '횟수';
    repHead.textContent = tr(repHead.dataset.i18nEn, repHead.dataset.i18nKo);
    const prev = state.logs.find((l) => l.exercise === exKey);
    const target = nextTarget(row, prev);
    last.replaceChildren();
    if (!prev) {
      last.append(textEl('span', '', 'First time logging this one — start light and focus on form.', '처음 기록하는 운동이에요. 가볍게 시작해서 자세에 집중하세요.'));
    } else {
      const [dEn, dKo] = datePair(prev.performed_on);
      last.append(el('div', '', [textEl('strong', '', `Last time (${dEn})`, `지난 기록 (${dKo})`), ' ', SETS_FMT(prev)]));
      if (target) {
        const hint = target.add > 0
          ? [`Every set hit ${target.top}! Try ${target.weight} kg today (+${target.add} kg).`, `모든 세트 ${target.top}회 달성! 오늘은 ${target.weight}kg (+${target.add}kg) 해 보세요.`]
          : target.weight > 0 && prev.reps.every((r) => r >= target.top)
            ? [`Every set hit ${target.top}! Add a little load or reps.`, `모든 세트 ${target.top}회 달성! 조금 더 어렵게 해 보세요.`]
            : [`Same weight — try one more rep on a set (aim for ${target.top} on every set).`, `같은 무게로, 한 세트라도 1회 더 해 보세요 (목표: 모든 세트 ${target.top}회).`];
        last.append(textEl('div', 'br-hint', ...hint));
      }
    }
    sets.replaceChildren(head);
    const count = row.sets[0];
    const w = target ? target.weight || '' : prev ? Math.max(...prev.weights.map(Number)) || '' : '';
    for (let i = 0; i < count; i++) setRow(w, '');
  }
  choose.addEventListener('change', prepare);
  prepare();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const lines = [...sets.querySelectorAll('.br-set:not(.br-set-head)')];
    const weights = [];
    const reps = [];
    for (const l of lines) {
      const [w, r] = l.querySelectorAll('input');
      if (r.value === '' && w.value === '') continue;
      const rv = Number(r.value);
      const wv = w.value === '' ? 0 : Number(w.value);
      if (!Number.isInteger(rv) || rv < 1 || rv > 300 || !(wv >= 0 && wv <= 500)) {
        err.className = 'ms-message is-error';
        err.textContent = tr('Check the numbers: reps 1–300, weight 0–500 kg.', '숫자를 확인해 주세요: 횟수 1~300, 무게 0~500kg.');
        return;
      }
      weights.push(Math.round(wv * 10) / 10);
      reps.push(rv);
    }
    if (!reps.length) { err.className = 'ms-message is-error'; err.textContent = tr('Enter at least one set.', '세트를 하나 이상 입력해 주세요.'); return; }
    if (!date.value || date.value > kstToday() || date.value < addDays(kstToday(), -60)) {
      err.className = 'ms-message is-error';
      err.textContent = tr('Pick a date within the last 60 days.', '최근 60일 안의 날짜를 골라 주세요.');
      return;
    }
    save.disabled = true;
    const { error } = await supabase.from('workout_logs').insert({
      performed_on: date.value, exercise: exKey, weights, reps, unit: unitSec() ? 'sec' : 'reps', note: note.value.trim() || null,
    });
    save.disabled = false;
    if (error) {
      err.className = 'ms-message is-error';
      err.textContent = /too_many_logs/.test(error.message || '') ? tr('That’s a lot for one day — try again tomorrow.', '하루에 남길 수 있는 기록을 넘었어요. 내일 다시 기록해 주세요.')
        : /invalid_date/.test(error.message || '') ? tr('Pick a date within the last 60 days.', '최근 60일 안의 날짜를 골라 주세요.')
          : tr('Couldn’t save it. Please try again.', '저장하지 못했어요. 다시 시도해 주세요.');
      return;
    }
    dialog.close();
    say('Saved to your workout log.', '운동 기록에 저장했어요.', 'success');
    await loadLogs();
  };
  dialog.showModal();
}

// 바깥(배경)을 누르면 닫기
dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

// ── 시작 ──────────────────────────────────────────────────────────────
function renderAll() {
  renderPrinciples();
  renderTimeline();
  renderPlan();
  renderLogArea(state.logsReady ? null : (state.session ? true : null));
}

const fromHash = location.hash.replace('#', '');
if (ROUTINES[fromHash]) state.plan = fromHash;
renderPrinciples();
renderTimeline();
renderPlan();
if (ROUTINES[fromHash]) requestAnimationFrame(() => $('routines').scrollIntoView({ block: 'start' }));

const { data: { session } } = await supabase.auth.getSession();
state.session = session;
if (session) await loadLogs();
else renderLogArea();

window.addEventListener('fitin:lang-change', () => {
  if (dialog.open) dialog.close();
  renderAll();
});
