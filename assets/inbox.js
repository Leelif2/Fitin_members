// 사이트 알림함 (8단계, supabase/migrations/0034_member_notifications.sql)
//   watchUnread: 안 읽은 알림 수를 세고, 새 알림이 오면(Realtime) 바로 다시 센다 — 메인 헤더 숫자용
//   initInbox:   마이페이지 알림함 목록. 열어 보면 읽음으로 표시
import { tr, textEl, el, dateTimePair } from './membership-ui.js';

export function watchUnread(supabase, userId, onCount) {
  let stopped = false;
  async function count() {
    const { count: n, error } = await supabase.from('notifications')
      .select('id', { count: 'exact', head: true }).is('read_at', null);
    if (!stopped) onCount(error ? 0 : n || 0);
  }
  count();
  const channel = supabase.channel(`inbox:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, count)
    .subscribe();
  return () => { stopped = true; supabase.removeChannel(channel); };
}

export function initInbox({ supabase, userId, mount }) {
  const head = el('div', '');
  head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px';
  const title = textEl('h2', 'profile-name', 'Notifications', '알림함');
  const list = el('div', '');
  list.style.cssText = 'display:grid;gap:8px';
  head.append(title);
  mount.append(head, list);
  let rows = [];

  async function load() {
    const { data, error } = await supabase.from('notifications')
      .select('id, kind, title_ko, title_en, body_ko, body_en, link, read_at, created_at')
      .order('created_at', { ascending: false }).limit(30);
    if (error) { mount.hidden = true; return; } // 0034 실행 전
    mount.hidden = false;
    rows = data || [];
    render();
    // 열어서 봤으면 읽음으로
    if (rows.some((r) => !r.read_at)) await supabase.rpc('mark_my_notifications_read', { p_ids: null });
  }

  function render() {
    list.replaceChildren();
    if (!rows.length) {
      list.append(textEl('p', 'profile-email', 'No notifications yet.', '아직 알림이 없어요.'));
      return;
    }
    for (const r of rows) {
      const card = el(r.link ? 'a' : 'div', '');
      if (r.link) card.href = r.link;
      card.style.cssText = `display:block;padding:12px 14px;border:1px solid var(--color-divider);border-radius:10px;text-decoration:none;color:inherit;${r.read_at ? '' : 'border-color:var(--color-accent);background:color-mix(in srgb, var(--color-accent) 8%, transparent)'}`;
      const top = el('div', '');
      top.style.cssText = 'display:flex;justify-content:space-between;gap:10px;align-items:baseline';
      const t = textEl('strong', '', r.title_en, r.title_ko);
      t.style.fontSize = '14px';
      const when = el('span', 'profile-email', [tr(...dateTimePair(r.created_at))]);
      when.style.whiteSpace = 'nowrap';
      top.append(t, when);
      const body = textEl('p', 'profile-email', r.body_en, r.body_ko);
      body.style.cssText = 'margin:4px 0 0;line-height:1.6';
      card.append(top, body);
      list.append(card);
    }
  }

  const channel = supabase.channel(`inbox-list:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, load)
    .subscribe();
  window.addEventListener('fitin:lang-change', render);
  load();
  return { load, stop: () => supabase.removeChannel(channel) };
}
