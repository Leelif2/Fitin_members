// 관리자 화면 "가입 승인" 탭 (supabase/migrations/0023_student_id_verification.sql)
// 학생증 사진은 비공개 저장소에 있어서 5분짜리 임시 링크로만 본다.
// 승인/거절할 때 그 회원의 사진을 저장소에서 먼저 지우고(remove), 그다음 DB 함수를 부른다.
// DB 함수는 사진이 남아 있으면 실행을 거부하므로, 사진 삭제를 빠뜨릴 수 없다.
import { tr, textEl, el, dateTimePair } from './membership-ui.js';

const BUCKET = 'student-ids';
const GENDER = { male: ['Male', '남'], female: ['Female', '여'] };
const ERRORS = {
  photo_not_deleted: ['The photo couldn’t be deleted, so nothing was changed. Please try again.', '사진을 지우지 못해서 처리하지 않았어요. 다시 시도해 주세요.'],
  not_pending: ['This application was already handled. Refreshing the list.', '이미 처리된 신청이에요. 목록을 새로 불러올게요.'],
};

export function initAdminVerify({ supabase, panel, tabLabel, setMessage, onPendingCount }) {
  const state = { rows: [] };

  const note = textEl('p', 'muted',
    'Check that the name, school and student ID number on the card match the application. The photo is deleted the moment you approve or reject.',
    '학생증의 이름·학교·학번이 신청 내용과 같은지 확인해 주세요. 승인하거나 거절하는 순간 사진은 삭제돼요.');
  note.style.cssText = 'margin:0 0 14px;font-size:13px';
  const list = el('div', 'verify-list');
  list.style.cssText = 'display:grid;gap:14px';
  panel.append(note, list);

  function updateTabLabel() {
    const n = state.rows.length;
    tabLabel.dataset.i18nEn = n ? `Sign-up approval (${n})` : 'Sign-up approval';
    tabLabel.dataset.i18nKo = n ? `가입 승인 (${n})` : '가입 승인';
    tabLabel.textContent = tr(tabLabel.dataset.i18nEn, tabLabel.dataset.i18nKo);
    onPendingCount?.(n);
  }

  async function load() {
    const { data, error } = await supabase.rpc('admin_pending_verifications');
    if (error) {
      // SQL(0023) 실행 전이면 탭만 비워 둔다
      state.rows = [];
      list.replaceChildren(textEl('p', 'muted', 'Run 0023_student_id_verification.sql in Supabase to turn this on.', 'Supabase에서 0023_student_id_verification.sql을 실행하면 사용할 수 있어요.'));
      updateTabLabel();
      return;
    }
    state.rows = data || [];
    updateTabLabel();
    await render();
  }

  async function render() {
    list.replaceChildren();
    if (!state.rows.length) {
      list.append(textEl('p', 'muted', 'No applications waiting.', '기다리는 신청이 없어요.'));
      return;
    }
    const paths = state.rows.map((r) => r.id_card_path).filter(Boolean);
    const urls = new Map();
    if (paths.length) {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 300);
      for (const item of data || []) if (item.signedUrl) urls.set(item.path, item.signedUrl);
    }
    for (const row of state.rows) list.append(card(row, urls.get(row.id_card_path)));
  }

  function card(row, url) {
    const box = el('div', 'card elev-sm');
    box.style.cssText = 'display:grid;grid-template-columns:minmax(0,260px) minmax(0,1fr);gap:18px;padding:16px';
    const photo = el('div', '');
    if (url) {
      const link = el('a', '');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const img = el('img', '');
      img.src = url;
      img.alt = tr('Student ID card', '학생증');
      img.style.cssText = 'width:100%;max-height:220px;object-fit:contain;border-radius:8px;background:var(--color-bg)';
      link.append(img);
      photo.append(link, textEl('div', 'muted', 'Tap to open full size (link works for 5 min)', '눌러서 크게 보기 (링크 5분 유효)'));
    } else {
      photo.append(textEl('p', 'muted', 'No photo found.', '사진이 없어요.'));
    }

    const info = el('div', '');
    info.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:0';
    const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || tr('Unnamed', '이름 없음');
    info.append(el('strong', '', name));
    const dl = el('dl', '');
    dl.style.cssText = 'display:grid;grid-template-columns:auto 1fr;gap:4px 12px;margin:0;font-size:13px';
    const add = (en, ko, value) => { dl.append(textEl('dt', 'muted', en, ko), el('dd', '', value || '-')); };
    add('School', '학교', row.university);
    add('Student ID no.', '학번', row.student_no);
    add('Email', '이메일', row.email);
    add('Gender', '성별', row.gender && GENDER[row.gender] ? tr(...GENDER[row.gender]) : '-');
    add('Applied', '신청', row.submitted_at ? tr(...dateTimePair(row.submitted_at)) : '-');
    for (const d of dl.querySelectorAll('dd')) d.style.cssText = 'margin:0;overflow-wrap:anywhere';
    info.append(dl);
    if (row.same_name_approved > 0) {
      const warn = textEl('p', '', `Heads-up: ${row.same_name_approved} approved member(s) at this school already have the same name — check it isn’t a second account.`,
        `주의: 같은 학교에 이름이 같은 승인 회원이 ${row.same_name_approved}명 있어요. 두 번째 계정이 아닌지 확인해 주세요.`);
      warn.style.cssText = 'margin:4px 0 0;font-size:12px;color:var(--color-accent-300)';
      info.append(warn);
    }

    const reason = document.createElement('input');
    reason.className = 'input';
    reason.maxLength = 200;
    reason.placeholder = tr('Reason if rejecting (shown to the member)', '거절 사유 (회원에게 보여요)');
    reason.style.cssText = 'margin-top:6px';
    const actions = el('div', '');
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:4px';
    const approve = el('button', 'btn btn-primary', [el('i', 'ph ph-check'), textEl('span', '', 'Approve', '승인')]);
    const reject = el('button', 'btn btn-secondary', [el('i', 'ph ph-x'), textEl('span', '', 'Reject', '거절')]);
    approve.type = reject.type = 'button';
    approve.addEventListener('click', () => decide(row, true, '', [approve, reject]));
    reject.addEventListener('click', () => {
      if (!reason.value.trim()) {
        reason.focus();
        setMessage(tr('Please write a reason so the member knows what to fix.', '회원이 무엇을 고칠지 알 수 있게 거절 사유를 적어 주세요.'), 'error');
        return;
      }
      decide(row, false, reason.value.trim(), [approve, reject]);
    });
    actions.append(approve, reject);
    info.append(reason, actions);

    box.append(photo, info);
    if (window.matchMedia('(max-width: 640px)').matches) box.style.gridTemplateColumns = '1fr';
    return box;
  }

  async function decide(row, approve, note, buttons) {
    for (const b of buttons) b.disabled = true;
    // 1) 그 회원 폴더의 사진을 모두 삭제
    const { data: files } = await supabase.storage.from(BUCKET).list(row.id, { limit: 100 });
    const paths = (files || []).map((f) => `${row.id}/${f.name}`);
    if (row.id_card_path && !paths.includes(row.id_card_path)) paths.push(row.id_card_path);
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    // 2) 승인/거절 (사진이 남아 있으면 DB가 거부)
    const { error } = await supabase.rpc('admin_review_verification', { p_user: row.id, p_approve: approve, p_note: note || null });
    if (error) {
      const key = Object.keys(ERRORS).find((k) => error.message.includes(k));
      setMessage(key ? tr(...ERRORS[key]) : error.message, 'error');
      for (const b of buttons) b.disabled = false;
      if (key === 'not_pending') await load();
      return;
    }
    setMessage(approve ? tr(`Approved ${row.first_name || ''}. The photo was deleted.`, `${row.first_name || ''} 님을 승인했어요. 사진은 삭제됐어요.`)
      : tr('Rejected. The member can upload again. The photo was deleted.', '거절했어요. 회원이 다시 올릴 수 있어요. 사진은 삭제됐어요.'), 'success');
    await load();
  }

  window.addEventListener('fitin:lang-change', () => { updateTabLabel(); render(); });
  return { load };
}
