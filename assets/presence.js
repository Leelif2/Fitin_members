// 실시간 접속 표시 (0025) — 숫자는 DB가 직접 센다 (live_presence: 승인 계정 1개 = 1행).
//   회원: 25초마다 live_ping("나 아직 보고 있어요" + 보고 있는 탭). 숫자·닉네임 목록은 live_snapshot.
//         누가 들어오거나 나가거나 탭을 바꾸면 DB가 비공개 채널 'fitin-live'로 "바뀌었어요" 신호를 보낸다.
//   방문자: live_online_count로 숫자만 (30초마다).
// 브라우저가 보내는 내용으로는 숫자를 바꿀 수 없다 — 실제 승인 계정이 있어야 1명이 늘어난다.
import { SUPABASE_PUBLIC } from './supabase-client.js';

export const LIVE_VIEWS = ['all', 'meal', 'study', 'workout'];
const PING_MS = 25000;
const REFRESH_MS = 30000;

// 방문자용: 접속자 수만. 반환값은 멈추는 함수.
export function watchOnlineCount(supabase, onCount) {
  let stopped = false;
  async function load() {
    if (stopped || document.hidden) return;
    const { data, error } = await supabase.rpc('live_online_count');
    if (!stopped) onCount(error ? null : data);
  }
  load();
  const timer = setInterval(load, REFRESH_MS);
  const onVisible = () => { if (!document.hidden) load(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    stopped = true;
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

// 승인 회원용: onChange({ total, views, hidden, people: [{ nickname, view, me }] }) — 실패하면 null.
// 반환: { setView(view), refresh(), stop() }
export function joinLive(supabase, onChange, initialView = 'all') {
  let view = LIVE_VIEWS.includes(initialView) ? initialView : 'all';
  let stopped = false;
  let token = null;
  let debounce = null;

  async function ping() {
    if (stopped || document.hidden) return; // 다른 탭·앱으로 가면 70초 뒤 자동으로 빠진다
    const { data } = await supabase.auth.getSession();
    token = data.session ? data.session.access_token : null;
    const { error } = await supabase.rpc('live_ping', { p_view: view });
    if (error && !stopped) onChange(null);
  }

  async function load() {
    if (stopped) return;
    const { data, error } = await supabase.rpc('live_snapshot');
    if (!stopped) onChange(error ? null : data);
  }
  const loadSoon = () => { clearTimeout(debounce); debounce = setTimeout(load, 300); };

  // 페이지를 닫을 때: 화면이 사라진 뒤에도 요청이 끝나도록 keepalive로 live_leave
  function leaveOnClose() {
    if (!token) return;
    try {
      fetch(`${SUPABASE_PUBLIC.url}/rest/v1/rpc/live_leave`, {
        method: 'POST',
        keepalive: true,
        headers: { apikey: SUPABASE_PUBLIC.anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: '{}',
      });
    } catch (e) { /* 70초 뒤 자동으로 빠진다 */ }
  }

  const channel = supabase.channel('fitin-live', { config: { private: true } });
  channel.on('broadcast', { event: 'changed' }, loadSoon).subscribe();

  ping().then(load);
  const pingTimer = setInterval(ping, PING_MS);
  const refreshTimer = setInterval(load, REFRESH_MS); // 신호를 놓쳤거나 누가 조용히 끊겼을 때
  const onVisible = () => { if (!document.hidden) ping().then(load); };
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pagehide', leaveOnClose);

  return {
    setView(next) {
      const v = LIVE_VIEWS.includes(next) ? next : 'all';
      if (v === view) return;
      view = v;
      ping();
    },
    refresh: load,
    stop() {
      stopped = true;
      clearInterval(pingTimer);
      clearInterval(refreshTimer);
      clearTimeout(debounce);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', leaveOnClose);
      supabase.removeChannel(channel);
      supabase.rpc('live_leave').then(() => {}, () => {});
    },
  };
}
