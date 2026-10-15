// Fitin 운동 루틴 추천 규칙 — 공강 계산 + Push/Pull/Leg 배정 + 종목 표.
// 순수 함수만 있어서 브라우저(routine.html)와 Node 테스트(scripts/test-routine-plan.mjs)
// 양쪽에서 그대로 쓴다. AI는 사진에서 수업 시간만 읽고, 나머지는 전부 이 규칙으로 계산한다.

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
export const WINDOW_START = 8 * 60; // 08:00
export const WINDOW_END = 21 * 60; // 21:00
export const MIN_GAP = 120; // 2시간 이상 빈 시간만 공강으로 본다
const TRAVEL_BUFFER = 10; // 수업 끝나고 체육관까지 이동

export const SPLITS = ['Push', 'Pull', 'Leg'];

// 선호 시간대 (분 단위 범위)
export const TIME_PREFS = {
  morning: [8 * 60, 12 * 60],
  midday: [11 * 60, 14 * 60],
  afternoon: [14 * 60, 21 * 60],
  any: [WINDOW_START, WINDOW_END],
};

export function toMinutes(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

export function toHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// 잘못된 행(요일 없음, 시간 형식 오류, 시작 >= 끝)은 버리고 남은 수업만 돌려준다.
export function cleanClasses(classes) {
  return (Array.isArray(classes) ? classes : [])
    .map((c) => ({ day: c?.day, start: toMinutes(c?.start), end: toMinutes(c?.end), title: String(c?.title || '').slice(0, 80) }))
    .filter((c) => DAYS.includes(c.day) && c.start !== null && c.end !== null && c.start < c.end)
    .map((c) => ({ day: c.day, start: toHHMM(c.start), end: toHHMM(c.end), title: c.title }));
}

// 요일별로 08:00~21:00 사이 2시간 이상 빈 시간을 찾는다. 겹치는 수업은 합쳐서 계산.
export function findFreeBlocks(classes) {
  const clean = cleanClasses(classes);
  const blocks = [];
  for (const day of DAYS) {
    const busy = clean
      .filter((c) => c.day === day)
      .map((c) => [Math.max(toMinutes(c.start), WINDOW_START), Math.min(toMinutes(c.end), WINDOW_END)])
      .filter(([s, e]) => s < e)
      .sort((a, b) => a[0] - b[0]);

    let cursor = WINDOW_START;
    for (const [s, e] of busy) {
      if (s - cursor >= MIN_GAP) blocks.push({ day, start: cursor, end: s });
      cursor = Math.max(cursor, e);
    }
    if (WINDOW_END - cursor >= MIN_GAP) blocks.push({ day, start: cursor, end: WINDOW_END });
  }
  return blocks.map((b) => ({ day: b.day, start: toHHMM(b.start), end: toHHMM(b.end), minutes: b.end - b.start }));
}

function overlap(aStart, aEnd, bStart, bEnd) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// 한 공강 안에서 운동 시작 시각을 정한다: 선호 시간대 안에서 가장 이른 시각,
// 단 수업 직후면 이동 시간 10분을 둔다. 5분 단위로 올림.
function placeSession(block, duration, pref) {
  const bStart = toMinutes(block.start);
  const bEnd = toMinutes(block.end);
  const [pStart] = TIME_PREFS[pref] || TIME_PREFS.any;
  const earliest = bStart === WINDOW_START ? bStart : bStart + TRAVEL_BUFFER;
  let start = Math.max(earliest, pStart);
  start = Math.ceil(start / 5) * 5;
  if (start + duration > bEnd) start = Math.ceil(earliest / 5) * 5;
  return { start, end: start + duration };
}

// 요일당 최대 1회. 선호 시간대와 많이 겹치는 공강을 고르고, 요일은 최대한 띄운다.
export function assignSessions(freeBlocks, prefs) {
  const duration = prefs.duration === 30 ? 30 : 50;
  const wanted = Math.min(Math.max(Number(prefs.sessionsPerWeek) || 3, 1), DAYS.length);
  const [pStart, pEnd] = TIME_PREFS[prefs.timePref] || TIME_PREFS.any;

  // 요일별 최고 공강 하나
  const bestByDay = new Map();
  for (const b of freeBlocks) {
    const score = overlap(toMinutes(b.start), toMinutes(b.end), pStart, pEnd) * 1000 + b.minutes;
    const cur = bestByDay.get(b.day);
    if (!cur || score > cur.score) bestByDay.set(b.day, { block: b, score });
  }
  const days = DAYS.filter((d) => bestByDay.has(d));

  // 가능한 요일 조합 중 (요일 간 최소 간격, 선호 시간대 점수) 순으로 최고를 고른다. 최대 5C2=10가지라 전부 확인.
  const take = Math.min(wanted, days.length);
  let best = null;
  const combos = (arr, k, start = 0, acc = []) => {
    if (acc.length === k) return [acc.slice()];
    const out = [];
    for (let i = start; i < arr.length; i++) {
      acc.push(arr[i]);
      out.push(...combos(arr, k, i + 1, acc));
      acc.pop();
    }
    return out;
  };
  for (const combo of take > 0 ? combos(days, take) : []) {
    const idx = combo.map((d) => DAYS.indexOf(d));
    let minGapDays = 7;
    for (let i = 1; i < idx.length; i++) minGapDays = Math.min(minGapDays, idx[i] - idx[i - 1]);
    const prefScore = combo.reduce((sum, d) => sum + bestByDay.get(d).score, 0);
    const key = [minGapDays, prefScore];
    if (!best || key[0] > best.key[0] || (key[0] === best.key[0] && key[1] > best.key[1])) best = { combo, key };
  }

  const chosen = best ? best.combo : [];
  return {
    sessions: chosen.map((day, i) => {
      const block = bestByDay.get(day).block;
      const { start, end } = placeSession(block, duration, prefs.timePref);
      return { day, split: SPLITS[i % SPLITS.length], start: toHHMM(start), end: toHHMM(end), gap: `${block.start}–${block.end}` };
    }),
    requested: wanted,
    shortBy: wanted - chosen.length,
  };
}

// ---------------------------------------------------------------------------
// 종목 표 (초안 — 트레이너 검토 후 이 표만 고치면 된다). [영어, 한국어]
// 각 목록은 중요도 순: 30분이면 앞에서 3~4개, 50분이면 5~6개를 쓴다.
export const EXERCISES = {
  Push: {
    beginner: [['Chest press machine', '체스트 프레스 머신'], ['Shoulder press machine', '숄더 프레스 머신'], ['Pec deck fly', '펙덱 플라이'], ['Cable lateral raise', '케이블 레터럴 레이즈'], ['Triceps pushdown', '트라이셉스 푸시다운'], ['Push-up', '푸시업']],
    intermediate: [['Barbell bench press', '바벨 벤치프레스'], ['Incline dumbbell press', '인클라인 덤벨 프레스'], ['Seated dumbbell shoulder press', '시티드 덤벨 숄더 프레스'], ['Lateral raise', '레터럴 레이즈'], ['Cable fly', '케이블 플라이'], ['Triceps pushdown', '트라이셉스 푸시다운']],
    advanced: [['Barbell bench press', '바벨 벤치프레스'], ['Overhead press', '오버헤드 프레스'], ['Incline dumbbell press', '인클라인 덤벨 프레스'], ['Weighted dips', '웨이티드 딥스'], ['Lateral raise', '레터럴 레이즈'], ['Skull crusher', '스컬 크러셔']],
  },
  Pull: {
    beginner: [['Lat pulldown', '랫 풀다운'], ['Seated cable row', '시티드 케이블 로우'], ['Assisted pull-up', '어시스트 풀업'], ['Face pull', '페이스 풀'], ['Dumbbell curl', '덤벨 컬'], ['Back extension', '백 익스텐션']],
    intermediate: [['Pull-up / lat pulldown', '풀업 / 랫 풀다운'], ['Barbell row', '바벨 로우'], ['One-arm dumbbell row', '원암 덤벨 로우'], ['Face pull', '페이스 풀'], ['Barbell curl', '바벨 컬'], ['Hammer curl', '해머 컬']],
    advanced: [['Weighted pull-up', '웨이티드 풀업'], ['Pendlay row', '펜들레이 로우'], ['Chest-supported row', '체스트 서포티드 로우'], ['Straight-arm pulldown', '스트레이트 암 풀다운'], ['Face pull', '페이스 풀'], ['Incline dumbbell curl', '인클라인 덤벨 컬']],
  },
  Leg: {
    beginner: [['Leg press', '레그 프레스'], ['Goblet squat', '고블릿 스쿼트'], ['Leg curl machine', '레그 컬 머신'], ['Leg extension', '레그 익스텐션'], ['Hip thrust', '힙 쓰러스트'], ['Plank', '플랭크']],
    intermediate: [['Back squat', '백 스쿼트'], ['Romanian deadlift', '루마니안 데드리프트'], ['Bulgarian split squat', '불가리안 스플릿 스쿼트'], ['Leg curl', '레그 컬'], ['Calf raise', '카프 레이즈'], ['Hanging knee raise', '행잉 니 레이즈']],
    advanced: [['Back squat', '백 스쿼트'], ['Deadlift', '데드리프트'], ['Front squat', '프론트 스쿼트'], ['Walking lunge', '워킹 런지'], ['Leg curl', '레그 컬'], ['Calf raise', '카프 레이즈']],
  },
};

// 목표별 세트·반복·휴식. 앞의 2종목(주 운동)과 나머지(보조 운동)를 다르게 준다.
export const GOAL_SCHEMES = {
  strength: { main: [4, '4–6'], accessory: [3, '8–10'], rest: ['2–3 min', '2–3분'] },
  hypertrophy: { main: [3, '8–10'], accessory: [3, '10–12'], rest: ['60–90 s', '60–90초'] },
  fatloss: { main: [3, '12–15'], accessory: [3, '12–15'], rest: ['30–45 s', '30–45초'] },
};

export function buildWorkout(split, prefs) {
  const level = EXERCISES[split][prefs.level] ? prefs.level : 'beginner';
  const scheme = GOAL_SCHEMES[prefs.goal] || GOAL_SCHEMES.hypertrophy;
  const short = prefs.duration === 30;
  const count = short ? (level === 'beginner' ? 3 : 4) : (level === 'beginner' ? 5 : 6);

  const exercises = EXERCISES[split][level].slice(0, count).map(([en, ko], i) => {
    let [sets, reps] = i < 2 ? scheme.main : scheme.accessory;
    if (level === 'beginner') {
      sets = Math.max(2, sets - 1);
      if (prefs.goal === 'strength') reps = '8–10'; // 초보자는 고중량 저반복 대신 자세 우선
    }
    if (short) sets = Math.min(sets, 3);
    return { en, ko, sets, reps };
  });

  const notes = [['5 min warm-up first', '시작 전 5분 워밍업']];
  if (prefs.goal === 'fatloss' && !short) notes.push(['Finish with 10 min incline walk', '마무리 10분 경사 걷기']);
  return { exercises, rest: scheme.rest, notes };
}

// 전체 흐름: 수업 목록 + 선호도 → 공강 + 세션(종목 포함)
export function buildPlan(classes, prefs) {
  const freeBlocks = findFreeBlocks(classes);
  const { sessions, requested, shortBy } = assignSessions(freeBlocks, prefs);
  return {
    freeBlocks,
    sessions: sessions.map((s) => ({ ...s, ...buildWorkout(s.split, prefs) })),
    requested,
    shortBy,
  };
}
