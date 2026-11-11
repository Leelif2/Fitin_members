import { tr, textEl, el, dateTimePair } from './membership-ui.js';

const weightLabel = (value) => `${Number(value).toLocaleString('ko-KR', { maximumFractionDigits: 1 })} kg`;
const dateLabel = (value) => tr(...dateTimePair(value));

export function initAdminLifts({ supabase, panel, setMessage, userId }) {
  const state = { rows: [] };
  const intro = textEl('p', 'muted',
    'Create a draft, then publish it when the goal is ready. Publication starts a 30-day challenge. The first member to reach the total wins.',
    '목표를 초안으로 만든 뒤 준비되면 공개하세요. 공개한 순간부터 30일간 진행되며, 목표에 가장 먼저 도달한 회원이 우승합니다.');
  intro.style.margin = '0 0 18px';

  const createForm = el('form', 'toolbar');
  const nameField = el('label', 'field');
  nameField.append(textEl('span', '', 'Challenge name', '챌린지 이름'));
  const name = el('input', 'input');
  name.name = 'title';
  name.required = true;
  name.minLength = 3;
  name.maxLength = 60;
  name.placeholder = tr('IGC 300 kg challenge', 'IGC 300kg 챌린지');
  nameField.append(name);
  const targetField = el('label', 'field');
  targetField.append(textEl('span', '', 'Three-lift target (kg)', '3대 합계 목표 (kg)'));
  const target = el('input', 'input');
  target.name = 'target';
  target.type = 'number';
  target.required = true;
  target.min = '30';
  target.max = '1500';
  target.step = '0.5';
  target.inputMode = 'decimal';
  target.placeholder = '300';
  targetField.append(target);
  const create = textEl('button', 'btn btn-primary', 'Save draft', '초안 저장');
  create.type = 'submit';
  createForm.append(nameField, targetField, create);

  const listTitle = textEl('h2', '', 'Challenges', '챌린지 목록');
  listTitle.style.cssText = 'font-size:18px;margin:28px 0 10px';
  const list = el('div', '');
  panel.append(intro, createForm, listTitle, list);

  function validTitleAndTarget(title, weight) {
    return title.length >= 3 && title.length <= 60 && Number.isFinite(weight)
      && weight >= 30 && weight <= 1500 && Math.round(weight * 2) === weight * 2;
  }

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const title = name.value.trim();
    const weight = Number(target.value);
    if (!validTitleAndTarget(title, weight)) return;
    create.disabled = true;
    const { error } = await supabase.from('lift_challenges').insert({ creator_id: userId, title, target_kg: weight });
    create.disabled = false;
    if (error) { setMessage(error.message, 'error'); return; }
    createForm.reset();
    setMessage(tr('Draft saved. Publish it to open participation.', '초안을 저장했어요. 공개하면 회원이 참여할 수 있어요.'), 'success');
    await load();
  });

  async function saveDraft(challenge, input, weightInput, button) {
    const title = input.value.trim();
    const weight = Number(weightInput.value);
    if (!validTitleAndTarget(title, weight)) {
      setMessage(tr('Check the title and target (30–1500 kg, 0.5 kg steps).', '이름과 목표 중량(30~1500kg, 0.5kg 단위)을 확인해 주세요.'), 'error');
      return;
    }
    button.disabled = true;
    const { data, error } = await supabase.from('lift_challenges')
      .update({ title, target_kg: weight }).eq('id', challenge.id).is('published_at', null).select('id');
    button.disabled = false;
    if (error || !data?.length) { setMessage(error?.message || 'Draft was already published.', 'error'); await load(); return; }
    setMessage(tr('Draft updated.', '초안을 수정했어요.'), 'success');
    await load();
  }

  async function publish(challenge, button) {
    if (!window.confirm(tr(
      `Publish “${challenge.title}” with a ${weightLabel(challenge.target_kg)} target? The 30-day clock starts now and the target cannot be edited afterward.`,
      `“${challenge.title}”을(를) 목표 ${weightLabel(challenge.target_kg)}으로 공개할까요? 지금부터 30일이 시작되고 이후 목표를 수정할 수 없어요.`))) return;
    button.disabled = true;
    const { data, error } = await supabase.from('lift_challenges')
      .update({ published_at: new Date().toISOString() }).eq('id', challenge.id).is('published_at', null).select('id');
    button.disabled = false;
    if (error || !data?.length) { setMessage(error?.message || 'Challenge was already published.', 'error'); await load(); return; }
    setMessage(tr('Challenge published. Members can join now.', '챌린지를 공개했어요. 이제 회원이 참여할 수 있어요.'), 'success');
    await load();
  }

  function render() {
    list.replaceChildren();
    if (!state.rows.length) {
      list.append(textEl('p', 'empty', 'No challenges yet.', '아직 챌린지가 없어요.'));
      return;
    }
    for (const challenge of state.rows) {
      const box = el('div', 'ms-card');
      box.style.cssText = 'margin-bottom:10px;display:grid;gap:10px';
      if (challenge.published_at) {
        const current = new Date(challenge.ends_at).getTime() > Date.now();
        box.append(
          el('strong', '', [challenge.title]),
          el('p', 'muted', [
            `${weightLabel(challenge.target_kg)} · ${tr(current ? 'Published' : 'Ended', current ? '공개 중' : '종료')} · ${dateLabel(challenge.starts_at)} → ${dateLabel(challenge.ends_at)}`,
          ]),
        );
        const link = textEl('a', 'btn btn-secondary', 'View standings', '순위 보기');
        link.href = `lifts.html?challenge=${encodeURIComponent(challenge.id)}`;
        link.style.justifySelf = 'start';
        box.append(link);
      } else {
        box.append(textEl('strong', '', 'Draft · members cannot see this yet', '초안 · 회원에게 아직 보이지 않아요'));
        const controls = el('div', 'toolbar');
        const titleInput = el('input', 'input');
        titleInput.value = challenge.title;
        titleInput.maxLength = 60;
        titleInput.setAttribute('aria-label', tr('Challenge name', '챌린지 이름'));
        const weightInput = el('input', 'input');
        weightInput.type = 'number';
        weightInput.min = '30';
        weightInput.max = '1500';
        weightInput.step = '0.5';
        weightInput.value = challenge.target_kg;
        weightInput.style.maxWidth = '150px';
        weightInput.setAttribute('aria-label', tr('Target in kg', '목표 중량(kg)'));
        const save = textEl('button', 'btn btn-secondary', 'Save changes', '수정 저장');
        save.type = 'button';
        save.addEventListener('click', () => saveDraft(challenge, titleInput, weightInput, save));
        const publishButton = textEl('button', 'btn btn-primary', 'Publish', '공개하기');
        publishButton.type = 'button';
        publishButton.addEventListener('click', () => publish(challenge, publishButton));
        controls.append(titleInput, weightInput, save, publishButton);
        box.append(controls);
      }
      list.append(box);
    }
  }

  async function load() {
    const { data, error } = await supabase.from('lift_challenges')
      .select('id,title,target_kg,starts_at,ends_at,published_at').order('id', { ascending: false }).limit(100);
    if (error) {
      list.replaceChildren(textEl('p', 'muted', 'Run migrations 0039 and 0040 in Supabase to enable challenges.', 'Supabase에서 0039와 0040 마이그레이션을 실행하면 사용할 수 있어요.'));
      return;
    }
    state.rows = data || [];
    render();
  }

  window.addEventListener('fitin:lang-change', () => {
    name.placeholder = tr('IGC 300 kg challenge', 'IGC 300kg 챌린지');
    render();
  });
  return { load };
}
