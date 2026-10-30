// 멤버십 화면(membership.html, calendar.html, places.html, mypage.html) 공용 도구.
// 규칙과 계산은 전부 DB 함수(supabase/migrations/0015_membership.sql)에 있고,
// 여기는 보여주기(한국어/영어, 금액·날짜 형식, 오류 문구)만 담당한다.

export const isKo = () => document.documentElement.lang === 'ko';
export const tr = (en, ko) => (isKo() ? ko : en);

// EN/KO 전환을 따라가는 요소 (i18n.js가 data-i18n-en / data-i18n-ko를 읽는다)
export function textEl(tag, className, en, ko) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.dataset.i18nEn = en;
  el.dataset.i18nKo = ko;
  el.textContent = tr(en, ko);
  return el;
}

export function el(tag, className, children = []) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const won = (n) => `${Number(n).toLocaleString('ko-KR')}${tr(' KRW', '원')}`;
export const wonPair = (n) => [`KRW ${Number(n).toLocaleString('en-US')}`, `${Number(n).toLocaleString('ko-KR')}원`];

const DAY_EN = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_KO = ['', '월', '화', '수', '목', '금', '토', '일'];
export const weekdaysPair = (days) => [days.map((d) => DAY_EN[d]).join(' · '), days.map((d) => DAY_KO[d]).join('·')];

// 'YYYY-MM-DD' (한국 날짜) → 표시용
export function datePair(iso, withDay = true) {
  const d = new Date(`${iso}T00:00:00Z`);
  const opts = { month: 'short', day: 'numeric', timeZone: 'UTC', ...(withDay ? { weekday: 'short' } : {}) };
  return [d.toLocaleDateString('en-US', opts), d.toLocaleDateString('ko-KR', opts)];
}

export function dateTimePair(ts) {
  const d = new Date(ts);
  const opts = { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Seoul' };
  return [d.toLocaleString('en-US', opts), d.toLocaleString('ko-KR', opts)];
}

export function kstToday() {
  return new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
}

export function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// DB 함수가 돌려주는 오류 코드 → 안내 문구
const ERRORS = {
  not_signed_in: ['Please log in first.', '먼저 로그인해 주세요.'],
  no_profile: ['Only signed-up members can do this.', '회원가입한 회원만 이용할 수 있어요.'],
  invalid_plan: ['That plan isn’t available.', '선택할 수 없는 요금제예요.'],
  invalid_option: ['That payment option isn’t available for this plan.', '이 요금제는 분할 결제를 할 수 없어요.'],
  invalid_class: ['That class isn’t available.', '선택할 수 없는 반이에요.'],
  invalid_start: ['Please choose a start week.', '시작 주를 선택해 주세요.'],
  start_passed: ['This week’s first class has already started. Please start next week.', '이번 주 첫 수업이 이미 지나서, 다음 주부터 시작할 수 있어요.'],
  already_member: ['You already have a membership (or one awaiting payment).', '이미 이용 중이거나 입금 대기 중인 멤버십이 있어요.'],
  class_full: ['This class just filled up. You can join the waitlist.', '방금 정원이 찼어요. 대기 등록을 할 수 있어요.'],
  seats_available: ['There are still seats in this class — you can sign up now.', '아직 자리가 있어서 바로 신청할 수 있어요.'],
  not_found: ['Nothing to cancel.', '취소할 내역이 없어요.'],
  already_paid: ['Payment is already confirmed — please contact the trainer to cancel.', '이미 입금이 확인되어 직접 취소할 수 없어요. 트레이너에게 문의해 주세요.'],
  membership_not_active: ['Available once your payment is confirmed.', '입금이 확인된 회원만 이용할 수 있어요.'],
  no_membership: ['You need a membership first.', '멤버십 가입 후 이용할 수 있어요.'],
  no_session: ['There’s no class at that time (holiday week).', '그 시간에는 수업이 없어요 (휴강 주).'],
  session_passed: ['That class has already started.', '이미 시작한 수업이에요.'],
  outside_membership: ['That date is outside your membership period.', '멤버십 기간 밖의 날짜예요.'],
  makeup_limit: ['You’ve used both make-up classes for this 4-week period.', '이번 4주 동안 보강 2회를 모두 사용했어요.'],
  session_full: ['That class just filled up.', '방금 자리가 찼어요.'],
  already_booked: ['You’ve already booked that class.', '이미 신청한 수업이에요.'],
  event_closed: ['Registration for this event is closed.', '신청이 마감된 일정이에요.'],
  event_passed: ['This event has already started.', '이미 지난 일정이에요.'],
  already_registered: ['You’re already registered.', '이미 신청했어요.'],
  event_full: ['This event is full.', '정원이 찼어요.'],
  gathering_limit: ['You can join one gathering per month.', '게더링은 한 달에 1회만 참여할 수 있어요.'],
};

export function errorText(error) {
  const msg = error?.message || '';
  const code = Object.keys(ERRORS).find((k) => msg.includes(k));
  if (code) return tr(...ERRORS[code]);
  if (/function .* does not exist|Could not find the function|schema cache/i.test(msg)) {
    return tr('Membership is being set up — please check back soon.', '멤버십 기능을 준비 중이에요. 잠시 후 다시 확인해 주세요.');
  }
  return tr('Something went wrong. Please try again.', '문제가 생겼어요. 다시 시도해 주세요.');
}

export const EVENT_KIND = {
  gathering: ['Gathering', '게더링'],
  hiking: ['Hiking', '등산'],
  event: ['Event', '이벤트'],
};

export const PAYMENT_STATUS = {
  pending: ['Awaiting transfer', '입금 대기'],
  paid: ['Paid', '입금 확인'],
  refunded: ['Refunded', '환불 완료'],
  cancelled: ['Cancelled', '취소'],
};

// 탭을 다시 볼 때 최신 정보로 (남은 자리·정원 실시간 반영)
export function refreshOnReturn(fn, intervalMs = 60000) {
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fn(); });
  setInterval(() => { if (!document.hidden) fn(); }, intervalMs);
}
