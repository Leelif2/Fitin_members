import { supabase } from './supabase-client.js';

// 홈 C단계 — 모임 열기/참여. 규칙(정원, 같은 성별, 7일 이내)은 모두
// supabase/migrations/0003_meetups.sql의 DB 함수가 강제하고, 여기서는
// 호출만 한다. 실패하면 DB가 보낸 코드('full', 'gender_required' 등)를
// Error.code로 넘겨 화면이 알맞은 안내를 고르게 한다.

const KNOWN_CODES = ['not_signed_in', 'bad_time', 'gender_required', 'gender_mismatch', 'too_many', 'full', 'closed', 'host_cannot_leave', 'forbidden'];

function toError(error) {
  const msg = (error && error.message) || '';
  const err = new Error(msg);
  err.code = KNOWN_CODES.find((c) => msg.includes(c)) || 'unknown';
  return err;
}

export async function listMeetups() {
  const { data, error } = await supabase.rpc('list_meetups');
  if (error) throw toError(error);
  return data || [];
}

export async function createMeetup(m) {
  const { error } = await supabase.from('meetups').insert({
    category: m.category,
    title: m.title,
    place: m.place,
    starts_at: m.startsAt,
    max_people: m.maxPeople,
    lang_ko: m.langKo,
    lang_en: m.langEn,
    same_gender: m.sameGender,
  });
  if (error) throw toError(error);
}

export async function joinMeetup(id) {
  const { error } = await supabase.rpc('join_meetup', { p_meetup_id: id });
  if (error) throw toError(error);
}

export async function leaveMeetup(id) {
  const { error } = await supabase.rpc('leave_meetup', { p_meetup_id: id });
  if (error) throw toError(error);
}

export async function cancelMeetup(id) {
  const { error } = await supabase.rpc('cancel_meetup', { p_meetup_id: id });
  if (error) throw toError(error);
}

// 성별은 비어 있을 때 한 번만 저장된다 (DB 트리거가 이후 변경을 막음).
export async function setMyGender(userId, gender) {
  const { error } = await supabase.from('profiles').update({ gender }).eq('id', userId);
  if (error) throw toError(error);
}
