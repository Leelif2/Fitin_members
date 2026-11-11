import { supabase, requireSession } from './supabase-client.js';
import { initViewToggle } from './view-toggle.js';
import { initLangToggle } from './i18n.js';
import { tr, textEl, el, dateTimePair } from './membership-ui.js';

initViewToggle();
initLangToggle();

const state = { userId: null, entries: [], best: { squat: 0, bench: 0, deadlift: 0 }, challenges: [], joined: new Set(), board: [], selectedId: null };
const $ = (id) => document.getElementById(id);
const liftNames = { squat: ['Squat', '스쿼트'], bench: ['Bench press', '벤치프레스'], deadlift: ['Deadlift', '데드리프트'] };
const kg = (n) => `${Number(n || 0).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg`;
const selected = () => state.challenges.find((c) => c.id === state.selectedId);
const isOpen = (c) => c && new Date(c.ends_at).getTime() > Date.now();
const when = (ts) => { const [en, ko] = dateTimePair(ts); return tr(en, ko); };

function message(en = '', ko = '', kind = '') {
  const node = $('lifts-message');
  node.dataset.i18nEn = en;
  node.dataset.i18nKo = ko;
  node.textContent = tr(en, ko);
  node.className = 'ms-message' + (kind ? ` is-${kind}` : '');
}

function fail(error) {
  const raw = String(error?.message || error);
  if (/schema cache|does not exist|404|not found/i.test(raw)) {
    message('The three-lift feature is being set up. Please run migration 0039 in Supabase.', '3대 운동 기능을 준비 중이에요. Supabase에서 0039 마이그레이션을 실행해 주세요.', 'error');
  } else if (/daily_limit/.test(raw)) {
    message('You can add up to 30 records a day.', '하루에 기록을 30개까지 추가할 수 있어요.', 'error');
  } else if (/duplicate key/.test(raw)) {
    message('You have already joined this challenge.', '이미 참여한 챌린지예요.', 'error');
  } else if (/verification_required|row-level security|policy|permission denied/i.test(raw)) {
    message('Only approved IGC members can use this feature.', '승인된 IGC 회원만 이용할 수 있어요.', 'error');
  } else {
    message('Something went wrong. Please try again.', '문제가 생겼어요. 다시 시도해 주세요.', 'error');
  }
  console.error('Three lifts:', error);
}

function renderMetrics() {
  const best = state.best;
  const mount = $('my-metrics');
  mount.replaceChildren();
  for (const lift of ['squat', 'bench', 'deadlift']) {
    mount.append(el('div', 'lifts-metric', [
      textEl('span', '', ...liftNames[lift]),
      el('strong', '', [kg(best[lift])]),
    ]));
  }
  mount.append(el('div', 'lifts-metric', [
    textEl('span', '', 'Total', '3대 합계'),
    el('strong', '', [kg(best.squat + best.bench + best.deadlift)]),
  ]));
  const history = $('my-history');
  history.replaceChildren();
  if (!state.entries.length) {
    history.append(textEl('p', 'lifts-note', 'No entries yet.', '아직 기록이 없어요.'));
    return;
  }
  const table = el('table');
  const body = el('tbody');
  for (const entry of state.entries.slice(0, 20)) {
    body.append(el('tr', '', [
      textEl('td', '', ...liftNames[entry.lift]),
      el('td', '', [kg(entry.weight_kg)]),
      el('td', '', [when(entry.created_at)]),
    ]));
  }
  table.append(body);
  history.append(table);
}

function renderChallenges() {
  const mount = $('challenge-list');
  mount.replaceChildren();
  if (!state.challenges.length) {
    mount.append(textEl('p', 'lifts-note', 'No challenges yet. Start one above.', '아직 챌린지가 없어요. 위에서 새로 만들어 보세요.'));
    return;
  }
  for (const challenge of state.challenges) {
    const button = el('button', 'lifts-challenge');
    button.type = 'button';
    button.setAttribute('aria-current', String(challenge.id === state.selectedId));
    const summary = el('span', '', [
      el('strong', '', [challenge.title]),
      el('small', '', [
        `${when(challenge.starts_at)} → ${when(challenge.ends_at)} · ${state.joined.has(challenge.id) ? tr('Joined', '참여 중') : (isOpen(challenge) ? tr('Open', '모집 중') : tr('Closed', '종료'))}`,
      ]),
    ]);
    button.append(summary, el('span', 'lifts-challenge-right', [kg(challenge.target_kg)]));
    button.addEventListener('click', () => choose(challenge.id));
    mount.append(button);
  }
}

function renderBoard() {
  const challenge = selected();
  const selectedBox = $('selected-challenge');
  const joinArea = $('join-area');
  const body = $('standings-body');
  const status = $('challenge-status');
  selectedBox.replaceChildren();
  joinArea.replaceChildren();
  body.replaceChildren();
  if (!challenge) {
    status.textContent = '';
    selectedBox.append(textEl('p', 'lifts-note', 'Choose a challenge above.', '위에서 챌린지를 선택해 주세요.'));
    return;
  }
  status.textContent = isOpen(challenge) ? tr('OPEN', '진행 중') : tr('CLOSED', '종료');
  selectedBox.append(el('div', 'lifts-selected', [
    el('strong', '', [challenge.title]),
    el('span', '', [tr(`Target ${kg(challenge.target_kg)} · until ${when(challenge.ends_at)}`, `목표 ${kg(challenge.target_kg)} · ${when(challenge.ends_at)}까지`)]),
  ]));
  if (!state.joined.has(challenge.id) && isOpen(challenge)) {
    const button = textEl('button', 'btn btn-primary', 'Join challenge', '챌린지 참여');
    button.type = 'button';
    button.addEventListener('click', async () => {
      button.disabled = true;
      const { error } = await supabase.from('lift_participants').insert({ challenge_id: challenge.id, user_id: state.userId });
      if (error) { fail(error); button.disabled = false; return; }
      state.joined.add(challenge.id);
      message('You joined. New entries now count toward this goal.', '참여했어요. 지금부터 입력하는 기록이 목표에 반영됩니다.', 'success');
      await loadBoard();
      renderChallenges();
    });
    joinArea.append(button);
  } else if (state.joined.has(challenge.id)) {
    joinArea.append(textEl('p', 'lifts-note', 'You joined this challenge. Add new lift records above to move toward the target.', '참여 중이에요. 위에서 새 운동 기록을 입력하면 목표에 반영됩니다.'));
    const mine = state.board.find((person) => person.is_me);
    if (mine) {
      const total = Number(mine.squat) + Number(mine.bench) + Number(mine.deadlift);
      const percent = mine.reached_at ? 100 : Math.min(99, Math.round(total / Number(challenge.target_kg) * 100));
      const progress = document.createElement('progress');
      progress.className = 'lifts-progress';
      progress.max = 100;
      progress.value = percent;
      progress.setAttribute('aria-label', tr('My progress', '내 진행률'));
      joinArea.append(el('p', 'lifts-progress-label', [tr(`My challenge total: ${kg(total)} / ${kg(challenge.target_kg)} (${percent}%)`, `내 챌린지 기록: ${kg(total)} / ${kg(challenge.target_kg)} (${percent}%)`)]), progress);
    }
  }
  if (!state.board.length) {
    body.append(el('tr', '', [textEl('td', '', 'No participants yet.', '아직 참여자가 없어요.')]));
    body.firstChild.firstChild.colSpan = 7;
    return;
  }
  let rank = 0;
  for (const person of state.board) {
    if (person.reached_at) rank += 1;
    const total = Number(person.squat) + Number(person.bench) + Number(person.deadlift);
    const minutes = Math.round(Number(person.elapsed_seconds || 0) / 60);
    const time = person.reached_at
      ? tr(`${Math.floor(minutes / 60)}h ${minutes % 60}m · ${when(person.reached_at)}`, `${Math.floor(minutes / 60)}시간 ${minutes % 60}분 · ${when(person.reached_at)}`)
      : tr('In progress', '진행 중');
    const row = el('tr', person.is_me ? 'is-me' : '', [
      el('td', '', [person.reached_at ? String(rank) : '—']),
      el('td', '', [person.nickname + (person.is_me ? tr(' (you)', ' (나)') : '')]),
      el('td', '', [kg(person.squat)]),
      el('td', '', [kg(person.bench)]),
      el('td', '', [kg(person.deadlift)]),
      el('td', '', [kg(total)]),
      el('td', '', [time]),
    ]);
    body.append(row);
  }
}

async function loadBoard() {
  const challenge = selected();
  if (!challenge) { state.board = []; renderBoard(); return; }
  const { data, error } = await supabase.rpc('lift_challenge_board', { p_challenge: challenge.id });
  if (error) { fail(error); return; }
  state.board = Array.isArray(data) ? data : [];
  renderBoard();
}

async function choose(id) {
  state.selectedId = id;
  const url = new URL(window.location.href);
  url.searchParams.set('challenge', String(id));
  window.history.replaceState({}, '', url);
  renderChallenges();
  await loadBoard();
}

async function refresh() {
  const [entries, best, challenges, joined] = await Promise.all([
    supabase.from('lift_entries').select('lift,weight_kg,created_at').eq('user_id', state.userId).order('created_at', { ascending: false }).limit(20),
    supabase.rpc('lift_my_best'),
    supabase.from('lift_challenges').select('id,title,target_kg,starts_at,ends_at').order('starts_at', { ascending: false }).limit(50),
    supabase.from('lift_participants').select('challenge_id').eq('user_id', state.userId),
  ]);
  const error = entries.error || best.error || challenges.error || joined.error;
  if (error) { fail(error); return; }
  state.entries = entries.data || [];
  state.best = best.data || { squat: 0, bench: 0, deadlift: 0 };
  state.challenges = challenges.data || [];
  state.joined = new Set((joined.data || []).map((x) => x.challenge_id));
  const requested = Number(new URLSearchParams(window.location.search).get('challenge'));
  if (!state.challenges.some((c) => c.id === state.selectedId)) {
    state.selectedId = state.challenges.some((c) => c.id === requested) ? requested : state.challenges[0]?.id ?? null;
  }
  renderMetrics();
  renderChallenges();
  await loadBoard();
}

const session = await requireSession();
if (session) {
  state.userId = session.user.id;
  $('entry-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const lift = form.elements.namedItem('lift').value;
    const weight = Number(form.elements.namedItem('weight').value);
    if (!liftNames[lift] || !Number.isFinite(weight) || weight < 1 || weight > 500 || Math.round(weight * 2) !== weight * 2) return;
    button.disabled = true;
    const { error } = await supabase.from('lift_entries').insert({ user_id: state.userId, lift, weight_kg: weight });
    button.disabled = false;
    if (error) { fail(error); return; }
    form.elements.namedItem('weight').value = '';
    message('Record added.', '기록을 추가했어요.', 'success');
    await refresh();
  });
  $('challenge-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const title = form.elements.namedItem('title').value.trim();
    const target = Number(form.elements.namedItem('target').value);
    if (title.length < 3 || title.length > 60 || !Number.isFinite(target) || target < 30 || target > 1500 || Math.round(target * 2) !== target * 2) return;
    button.disabled = true;
    const { data, error } = await supabase.from('lift_challenges').insert({ creator_id: state.userId, title, target_kg: target }).select('id').single();
    button.disabled = false;
    if (error) { fail(error); return; }
    form.reset();
    state.selectedId = data.id;
    message('Challenge created. You joined automatically.', '챌린지를 만들었어요. 자동으로 참여했습니다.', 'success');
    await refresh();
  });
  window.addEventListener('fitin:lang-change', () => { renderMetrics(); renderChallenges(); renderBoard(); });
  window.addEventListener('focus', () => { refresh(); });
  await refresh();
}
