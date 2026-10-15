// 루틴 추천 규칙 테스트 — 실행: node scripts/test-routine-plan.mjs
import assert from 'node:assert/strict';
import { findFreeBlocks, assignSessions, buildWorkout, buildPlan, cleanClasses } from '../assets/routine-plan.js';

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok -', name);
}

test('수업이 없으면 08:00~21:00 전체가 공강', () => {
  const blocks = findFreeBlocks([]);
  assert.equal(blocks.length, 5);
  assert.deepEqual(blocks[0], { day: 'Mon', start: '08:00', end: '21:00', minutes: 780 });
});

test('2시간 미만 빈 시간은 제외, 2시간 정확히는 포함', () => {
  const blocks = findFreeBlocks([
    { day: 'Mon', start: '08:00', end: '10:00' },
    { day: 'Mon', start: '11:59', end: '13:00' }, // 10:00~11:59 = 119분 → 제외
    { day: 'Mon', start: '15:00', end: '21:00' }, // 13:00~15:00 = 120분 → 포함
  ]);
  const mon = blocks.filter((b) => b.day === 'Mon');
  assert.deepEqual(mon.map((b) => `${b.start}-${b.end}`), ['13:00-15:00']);
});

test('겹치는 수업은 합쳐서 계산, 08~21시 밖 수업은 잘라서 계산', () => {
  const blocks = findFreeBlocks([
    { day: 'Tue', start: '07:00', end: '09:00' },
    { day: 'Tue', start: '12:00', end: '14:00' },
    { day: 'Tue', start: '13:00', end: '15:00' },
    { day: 'Tue', start: '20:00', end: '22:00' },
  ]);
  const tue = blocks.filter((b) => b.day === 'Tue').map((b) => `${b.start}-${b.end}`);
  assert.deepEqual(tue, ['09:00-12:00', '15:00-20:00']);
});

test('잘못된 수업 행(주말, 형식 오류, 시작>=끝)은 무시', () => {
  const clean = cleanClasses([
    { day: 'Sat', start: '09:00', end: '10:00' },
    { day: 'Mon', start: '9시', end: '10:00' },
    { day: 'Mon', start: '11:00', end: '10:00' },
    { day: 'Mon', start: '9:00', end: '10:30', title: 'Calc' },
  ]);
  assert.deepEqual(clean, [{ day: 'Mon', start: '09:00', end: '10:30', title: 'Calc' }]);
});

test('주 3회: 요일을 띄워서 Push → Pull → Leg 순서로 배정', () => {
  const { sessions } = assignSessions(findFreeBlocks([]), { duration: 50, sessionsPerWeek: 3, timePref: 'any' });
  assert.deepEqual(sessions.map((s) => s.day), ['Mon', 'Wed', 'Fri']);
  assert.deepEqual(sessions.map((s) => s.split), ['Push', 'Pull', 'Leg']);
});

test('주 4·5회는 Push/Pull/Leg를 반복', () => {
  const { sessions } = assignSessions(findFreeBlocks([]), { duration: 30, sessionsPerWeek: 5, timePref: 'any' });
  assert.deepEqual(sessions.map((s) => s.split), ['Push', 'Pull', 'Leg', 'Push', 'Pull']);
});

test('세션은 항상 공강 안에 들어가고 길이는 30/50분', () => {
  const classes = [
    { day: 'Mon', start: '08:00', end: '13:00' },
    { day: 'Mon', start: '15:00', end: '21:00' },
    { day: 'Wed', start: '09:00', end: '19:00' },
  ];
  for (const duration of [30, 50]) {
    for (const timePref of ['morning', 'midday', 'afternoon', 'any']) {
      const plan = buildPlan(classes, { duration, sessionsPerWeek: 5, timePref, level: 'beginner', goal: 'hypertrophy' });
      for (const s of plan.sessions) {
        const block = plan.freeBlocks.find((b) => b.day === s.day && `${b.start}–${b.end}` === s.gap);
        assert.ok(block, 'session must come from a free block');
        assert.ok(s.start >= block.start && s.end <= block.end, `${s.day} ${s.start}-${s.end} outside ${s.gap}`);
        const [sh, sm] = s.start.split(':').map(Number);
        const [eh, em] = s.end.split(':').map(Number);
        assert.equal(eh * 60 + em - (sh * 60 + sm), duration);
      }
    }
  }
});

test('수업 직후 공강은 이동 시간 10분 뒤에 시작', () => {
  const otherDaysBusy = DAYS_ALL(['08:00', '21:00']).filter((c) => c.day !== 'Mon');
  const plan = buildPlan([...otherDaysBusy, { day: 'Mon', start: '08:00', end: '13:00' }, { day: 'Mon', start: '15:00', end: '21:00' }],
    { duration: 50, sessionsPerWeek: 1, timePref: 'any', level: 'beginner', goal: 'hypertrophy' });
  const mon = plan.sessions.find((s) => s.day === 'Mon');
  assert.equal(mon?.start, '13:10');
});

test('선호 시간대(오후)와 겹치는 공강을 우선 선택', () => {
  const classes = DAYS_ALL(['08:00', '10:00'], ['12:00', '14:00']); // 매일 10~12시, 14~21시 공강
  const { sessions } = assignSessions(findFreeBlocks(classes), { duration: 50, sessionsPerWeek: 3, timePref: 'afternoon' });
  assert.ok(sessions.every((s) => s.start >= '14:00'), JSON.stringify(sessions));
  const morning = assignSessions(findFreeBlocks(classes), { duration: 50, sessionsPerWeek: 3, timePref: 'morning' });
  assert.ok(morning.sessions.every((s) => s.start < '12:00'), JSON.stringify(morning.sessions));
});

test('공강 요일이 원하는 횟수보다 적으면 가능한 만큼만 + 부족한 횟수 알려줌', () => {
  const busy = DAYS_ALL(['08:00', '21:00']).filter((c) => c.day !== 'Tue');
  const plan = buildPlan(busy, { duration: 50, sessionsPerWeek: 3, timePref: 'any', level: 'beginner', goal: 'strength' });
  assert.equal(plan.sessions.length, 1);
  assert.equal(plan.shortBy, 2);
});

test('공강이 하나도 없으면 세션 0개', () => {
  const plan = buildPlan(DAYS_ALL(['08:00', '21:00']), { duration: 30, sessionsPerWeek: 3, timePref: 'any', level: 'advanced', goal: 'fatloss' });
  assert.equal(plan.sessions.length, 0);
  assert.equal(plan.shortBy, 3);
});

test('종목 수: 30분은 3~4개, 50분은 5~6개 / 30분은 최대 3세트', () => {
  assert.equal(buildWorkout('Push', { duration: 30, level: 'beginner', goal: 'hypertrophy' }).exercises.length, 3);
  assert.equal(buildWorkout('Pull', { duration: 30, level: 'advanced', goal: 'strength' }).exercises.length, 4);
  assert.equal(buildWorkout('Leg', { duration: 50, level: 'beginner', goal: 'fatloss' }).exercises.length, 5);
  assert.equal(buildWorkout('Leg', { duration: 50, level: 'intermediate', goal: 'fatloss' }).exercises.length, 6);
  const short = buildWorkout('Push', { duration: 30, level: 'advanced', goal: 'strength' });
  assert.ok(short.exercises.every((e) => e.sets <= 3));
});

test('목표에 따라 반복 수가 바뀌고, 초보자 근력 목표는 8–10회', () => {
  assert.equal(buildWorkout('Leg', { duration: 50, level: 'advanced', goal: 'strength' }).exercises[0].reps, '4–6');
  assert.equal(buildWorkout('Leg', { duration: 50, level: 'advanced', goal: 'fatloss' }).exercises[0].reps, '12–15');
  assert.equal(buildWorkout('Leg', { duration: 50, level: 'beginner', goal: 'strength' }).exercises[0].reps, '8–10');
});

function DAYS_ALL(...ranges) {
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].flatMap((day) => ranges.map(([start, end]) => ({ day, start, end })));
}

console.log(`\n${passed}개 테스트 통과`);
