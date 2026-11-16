// 관리자 화면 "사진" 탭 (supabase/migrations/0042_site_photos.sql)
// 메인 페이지의 사진 칸 4개(맨 위 큰 사진 + 사진 3칸)를 관리자가 올리고, 바꾸고, 지운다.
// 사진은 올리기 전에 브라우저에서 긴 변 2000px 이하 JPG로 줄여서(휴대폰 원본은 너무 큼) 저장소 'site-photos'에 넣고,
// site_photos 표에 "어느 칸 = 어느 파일"을 적는다. 관리자만 쓸 수 있는지는 DB 규칙(RLS)이 확인한다.
import { tr, textEl, el, dateTimePair } from './membership-ui.js';

const BUCKET = 'site-photos';
const MAX_SIDE = 2000;
const MAX_BYTES = 5 * 1024 * 1024;
const SLOTS = [
  { key: 'hero', name: ['Hero photo', '맨 위 큰 사진'], where: ['Top of the home page, under the headline. Shown as a wide strip — landscape photos work best.', '메인 맨 위, 제목 바로 아래에 가로로 길게 보여요. 가로 사진이 잘 어울려요.'] },
  { key: 'gallery1', name: ['Photo 1 (large)', '사진 1 (큰 칸)'], where: ['"See where you\'ll train" — the large frame on the left.', '"어디서 운동하는지 보세요" 왼쪽 큰 칸'] },
  { key: 'gallery2', name: ['Photo 2', '사진 2'], where: ['"See where you\'ll train" — top right.', '"어디서 운동하는지 보세요" 오른쪽 위'] },
  { key: 'gallery3', name: ['Photo 3', '사진 3'], where: ['"See where you\'ll train" — bottom right.', '"어디서 운동하는지 보세요" 오른쪽 아래'] },
];

// 사진 파일 → 긴 변 MAX_SIDE 이하 JPG (회전 정보 반영)
async function toJpeg(file) {
  let source;
  try {
    source = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    source = await new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode_failed')); };
      img.src = url;
    });
  }
  const w = source.width || source.naturalWidth;
  const h = source.height || source.naturalHeight;
  if (!w || !h) throw new Error('decode_failed');
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  if (source.close) source.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) throw new Error('decode_failed');
  return blob;
}

export function initAdminPhotos({ supabase, panel, setMessage }) {
  const state = { photos: {}, busy: null };

  const note = el('div', '');
  note.style.cssText = 'display:grid;gap:4px;margin:0 0 14px;font-size:13px';
  note.append(
    textEl('p', 'muted', 'Photos on the home page. Upload a new one any time — it replaces the old one right away. Frames without a photo are simply not shown to visitors.',
      '메인 페이지에 보이는 사진이에요. 언제든 새 사진을 올리면 바로 바뀌어요. 사진이 없는 칸은 방문자에게 보이지 않아요.'),
    textEl('p', 'muted', 'Photos are shown in black and white on the site, and are cropped to fill each frame. Please only upload photos whose subjects agreed to be shown.',
      '사이트에서는 흑백으로, 칸에 맞게 잘려서 보여요. 사진에 나온 사람의 동의를 받은 사진만 올려 주세요.'),
  );
  for (const p of note.children) p.style.margin = '0';
  const list = el('div', '');
  list.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr));gap:12px';
  panel.append(note, list);

  const publicUrl = (path) => supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  async function load() {
    const { data, error } = await supabase.from('site_photos').select('slot, path, updated_at');
    if (error) {
      state.photos = {};
      list.replaceChildren(textEl('p', 'muted', 'Run 0042_site_photos.sql in Supabase to turn this on.', 'Supabase에서 0042_site_photos.sql을 실행하면 사용할 수 있어요.'));
      return;
    }
    state.photos = Object.fromEntries((data || []).map((r) => [r.slot, r]));
    render();
  }

  function render() {
    list.replaceChildren(...SLOTS.map(card));
  }

  async function upload(slot, file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) {
      setMessage(tr('Please choose a photo file (JPG or PNG).', '사진 파일(JPG, PNG)을 골라 주세요.'), 'error');
      return;
    }
    state.busy = slot.key;
    render();
    const old = state.photos[slot.key];
    let path = null;
    try {
      const blob = await toJpeg(file);
      if (blob.size > MAX_BYTES) throw new Error('too_large');
      path = `${slot.key}-${Date.now()}.jpg`;
      const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (up.error) throw up.error;
      const row = await supabase.from('site_photos').upsert({ slot: slot.key, path }, { onConflict: 'slot' });
      if (row.error) {
        await supabase.storage.from(BUCKET).remove([path]); // 칸 등록에 실패하면 올린 파일을 치운다
        throw row.error;
      }
      if (old && old.path && old.path !== path) await supabase.storage.from(BUCKET).remove([old.path]); // 예전 사진 파일 정리 (실패해도 화면엔 영향 없음)
      setMessage(tr('Photo updated. It now shows on the home page.', '사진을 바꿨어요. 메인 페이지에 바로 보여요.'), 'success');
    } catch (e) {
      const msg = (e && e.message) || '';
      setMessage(
        msg === 'decode_failed' ? tr("This photo couldn't be read. Please try a JPG or PNG file.", '이 사진을 읽지 못했어요. JPG나 PNG 파일로 올려 주세요.')
          : msg === 'too_large' ? tr('This photo is too large. Please try a smaller one.', '사진이 너무 커요. 더 작은 사진으로 올려 주세요.')
          : tr(`Upload failed: ${msg}`, `올리지 못했어요: ${msg}`),
        'error');
    }
    state.busy = null;
    await load();
  }

  async function remove(slot) {
    const cur = state.photos[slot.key];
    if (!cur) return;
    if (!window.confirm(tr(`Remove "${slot.name[0]}"? Visitors will no longer see this frame.`, `"${slot.name[1]}"을 지울까요? 방문자에게 이 칸이 보이지 않게 돼요.`))) return;
    state.busy = slot.key;
    render();
    const { error } = await supabase.from('site_photos').delete().eq('slot', slot.key);
    if (error) {
      setMessage(tr(`Couldn't remove it: ${error.message}`, `지우지 못했어요: ${error.message}`), 'error');
    } else {
      await supabase.storage.from(BUCKET).remove([cur.path]);
      setMessage(tr('Photo removed.', '사진을 지웠어요.'), 'success');
    }
    state.busy = null;
    await load();
  }

  function card(slot) {
    const cur = state.photos[slot.key];
    const busy = state.busy === slot.key;
    const box = el('div', 'card elev-sm');
    box.style.cssText = 'padding:16px;display:grid;gap:10px;align-content:start';

    const frame = el('div', '');
    frame.style.cssText = 'position:relative;aspect-ratio:16/9;border-radius:var(--r-input);overflow:hidden;background:var(--surface-2);display:grid;place-items:center';
    if (cur) {
      const img = document.createElement('img');
      img.src = publicUrl(cur.path);
      img.alt = tr(...slot.name);
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover';
      frame.append(img);
    } else {
      frame.append(textEl('span', 'muted', 'No photo yet', '아직 사진이 없어요'));
    }

    const title = el('div', '', [textEl('strong', '', ...slot.name)]);
    title.append(textEl('div', 'muted', ...slot.where));
    title.lastChild.style.fontSize = '13px';
    if (cur) {
      const [en, ko] = dateTimePair(cur.updated_at);
      const when = textEl('div', 'muted', `Updated ${en}`, `${ko}에 올림`);
      when.style.fontSize = '12px';
      title.append(when);
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/*';
    input.hidden = true;
    input.addEventListener('change', () => { const file = input.files && input.files[0]; input.value = ''; upload(slot, file); });

    const pick = textEl('button', 'btn btn-secondary btn-sm',
      busy ? 'Working…' : cur ? 'Replace photo' : 'Upload photo',
      busy ? '처리 중…' : cur ? '사진 바꾸기' : '사진 올리기');
    pick.type = 'button';
    pick.disabled = busy;
    pick.addEventListener('click', () => input.click());

    const actions = el('div', '', [pick]);
    actions.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px';
    if (cur) {
      const del = textEl('button', 'btn btn-ghost btn-sm', 'Remove', '지우기');
      del.type = 'button';
      del.disabled = busy;
      del.addEventListener('click', () => remove(slot));
      actions.append(del);
    }
    box.append(frame, title, actions, input);
    return box;
  }

  window.addEventListener('fitin:lang-change', () => { if (list.children.length) render(); });
  return { load };
}
