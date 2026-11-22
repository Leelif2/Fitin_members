// 초보자 근성장 루틴 데이터 (beginner-routine.html). 2026-11-22 사용자 제공 루틴을 그대로 옮김.
// 운동 이름 키는 운동 기록(workout_logs.exercise)에 그대로 저장되므로 바꾸지 않는다.
//   region: upper(상체, +1~2.5kg) | lower(하체, +2.5~5kg) | core(복근·버티기)
//   unit: reps(횟수) | sec(초) · body: 맨몸 위주(무게 칸 선택)
export const EXERCISES = {
  back_squat: { en: 'Barbell back squat', ko: '바벨 백스쿼트', region: 'lower', sbd: 'squat' },
  front_squat: { en: 'Front squat', ko: '프론트 스쿼트', region: 'lower' },
  goblet_squat: { en: 'Goblet squat', ko: '고블릿 스쿼트', region: 'lower' },
  bench_press: { en: 'Barbell bench press', ko: '바벨 벤치프레스', region: 'upper', sbd: 'bench' },
  deadlift: { en: 'Conventional deadlift', ko: '컨벤셔널 데드리프트', region: 'lower', sbd: 'deadlift' },
  barbell_rdl: { en: 'Barbell Romanian deadlift', ko: '바벨 루마니안 데드리프트', region: 'lower' },
  db_rdl: { en: 'Dumbbell Romanian deadlift', ko: '덤벨 루마니안 데드리프트', region: 'lower' },
  ohp: { en: 'Barbell overhead press', ko: '바벨 오버헤드프레스', region: 'upper' },
  incline_db_press: { en: 'Incline dumbbell bench press', ko: '인클라인 덤벨 벤치프레스', region: 'upper' },
  db_bench_press: { en: 'Dumbbell bench press', ko: '덤벨 벤치프레스', region: 'upper' },
  cable_row: { en: 'Seated cable row', ko: '케이블 시티드 로우', region: 'upper' },
  barbell_row: { en: 'Barbell row', ko: '바벨 로우', region: 'upper' },
  one_arm_db_row: { en: 'One-arm dumbbell row', ko: '원암 덤벨 로우', region: 'upper' },
  lat_pulldown: { en: 'Lat pulldown', ko: '랫풀다운', region: 'upper' },
  assisted_pullup: { en: 'Assisted pull-up', ko: '어시스트 풀업', region: 'upper', body: true },
  pullup: { en: 'Pull-up', ko: '풀업', region: 'upper', body: true },
  face_pull: { en: 'Cable face pull', ko: '케이블 페이스풀', region: 'upper' },
  cable_lateral_raise: { en: 'Cable lateral raise', ko: '케이블 레터럴 레이즈', region: 'upper' },
  db_curl: { en: 'Dumbbell curl', ko: '덤벨 컬', region: 'upper' },
  cable_pushdown: { en: 'Cable pushdown', ko: '케이블 푸시다운', region: 'upper' },
  bulgarian_split_squat: { en: 'Bulgarian split squat', ko: '불가리안 스플릿 스쿼트', region: 'lower' },
  db_bulgarian_split_squat: { en: 'Dumbbell Bulgarian split squat', ko: '덤벨 불가리안 스플릿 스쿼트', region: 'lower' },
  db_lunge: { en: 'Dumbbell lunge', ko: '덤벨 런지', region: 'lower' },
  db_reverse_lunge: { en: 'Dumbbell reverse lunge', ko: '덤벨 리버스 런지', region: 'lower' },
  hip_thrust: { en: 'Barbell hip thrust', ko: '바벨 힙쓰러스트', region: 'lower' },
  calf_raise: { en: 'Calf raise', ko: '카프 레이즈', region: 'lower' },
  cable_leg_curl: { en: 'Cable leg curl', ko: '케이블 레그 컬', region: 'lower' },
  sliding_leg_curl: { en: 'Sliding leg curl', ko: '슬라이딩 레그 컬', region: 'lower', body: true },
  plank: { en: 'Plank', ko: '플랭크', region: 'core', unit: 'sec', body: true },
  cable_crunch: { en: 'Cable crunch', ko: '케이블 크런치', region: 'core' },
  hanging_knee_raise: { en: 'Hanging knee raise', ko: '행잉 니레이즈', region: 'core', body: true },
  abs: { en: 'Ab exercise of your choice', ko: '복근 운동', region: 'core', body: true },
};

// 한 줄 = 운동 1개. ex가 여러 개면 join: 'or'(둘 중 하나) | 'and'(둘 다, "각"). sets·reps는 [최소, 최대].
// side: 각 다리 · reps가 null이면 세트 수만 안내.
const row = (ex, sets, reps, extra = {}) => ({ ex: [].concat(ex), sets: [].concat(sets), reps: reps === null ? null : [].concat(reps), join: 'or', ...extra });

export const ROUTINES = {
  week3: {
    key: 'week3',
    label: ['3 days a week', '주 3일 루틴'],
    schedule: ['Mon · Wed · Fri — rest at least one day between sessions.', '월·수·금처럼 운동 사이에 하루 이상 쉬어요.'],
    who: ['Start here if you’re new to the gym.', '헬스가 처음이라면 여기서 시작하세요.'],
    restDays: ['Rest: Tue · Thu · Sat · Sun', '휴식: 화·목·토·일'],
    days: [
      {
        title: ['Squat + bench', '스쿼트 + 벤치 중심'], icon: 'ph-barbell', when: ['Mon', '월'],
        rows: [
          row('back_squat', 3, [6, 8]),
          row('bench_press', 3, [6, 8]),
          row(['cable_row', 'barbell_row'], 3, [8, 12]),
          row('db_rdl', 2, [8, 10]),
          row('plank', 2, [30, 45]),
        ],
      },
      {
        title: ['Deadlift + overhead press', '데드리프트 + 오버헤드프레스 중심'], icon: 'ph-arrow-fat-lines-up', when: ['Wed', '수'],
        rows: [
          row('deadlift', 2, 5),
          row('ohp', 3, [6, 8]),
          row(['lat_pulldown', 'assisted_pullup'], 3, [8, 12]),
          row('db_bulgarian_split_squat', 2, [8, 10], { side: true }),
          row('face_pull', 2, [12, 15]),
        ],
      },
      {
        title: ['Light squat + upper-body volume', '가벼운 스쿼트 + 상체 볼륨'], icon: 'ph-stack', when: ['Fri', '금'],
        rows: [
          row(['back_squat', 'goblet_squat'], 3, [8, 10]),
          row('incline_db_press', 3, [8, 12]),
          row(['barbell_row', 'one_arm_db_row'], 3, [8, 12]),
          row('hip_thrust', 3, [8, 12]),
          row(['cable_crunch', 'hanging_knee_raise'], 2, [10, 15]),
        ],
      },
    ],
  },
  week5: {
    key: 'week5',
    label: ['5 days a week', '주 5일 루틴'],
    schedule: ['Mon · Tue · Thu · Fri · Sat — Wednesday and Sunday are rest days.', '월·화·목·금·토 운동, 수요일과 일요일은 휴식이에요.'],
    who: ['For people who have run the 3-day plan steadily for at least 8 weeks.', '주 3일 루틴을 8주 이상 꾸준히 해 온 분께 권장해요.'],
    restDays: ['Rest: Wed · Sun', '휴식: 수·일'],
    days: [
      {
        title: ['Lower-body strength: squat', '하체 힘: 스쿼트'], icon: 'ph-barbell', when: ['Mon', '월'],
        rows: [
          row('back_squat', 3, [5, 6]),
          row('barbell_rdl', 3, 8),
          row('db_lunge', 2, 10, { side: true }),
          row('calf_raise', 2, [12, 15]),
          row('plank', 2, null),
        ],
      },
      {
        title: ['Upper-body strength: bench', '상체 힘: 벤치'], icon: 'ph-arrows-out-line-horizontal', when: ['Tue', '화'],
        rows: [
          row('bench_press', 3, [5, 6]),
          row('barbell_row', 3, [6, 8]),
          row('incline_db_press', 2, [8, 10]),
          row('lat_pulldown', 2, [8, 12]),
          row('cable_lateral_raise', 2, [12, 15]),
        ],
      },
      {
        title: ['Lower-body hypertrophy', '하체 근비대'], icon: 'ph-person-simple-run', when: ['Thu', '목'],
        rows: [
          row(['front_squat', 'goblet_squat'], 3, [8, 10]),
          row('hip_thrust', 3, [8, 12]),
          row('bulgarian_split_squat', 2, 10, { side: true }),
          row(['cable_leg_curl', 'sliding_leg_curl'], 2, [10, 15]),
          row('abs', 2, null),
        ],
      },
      {
        title: ['Upper-body hypertrophy', '상체 근비대'], icon: 'ph-stack', when: ['Fri', '금'],
        rows: [
          row('ohp', 3, [6, 8]),
          row(['pullup', 'lat_pulldown'], 3, [8, 12]),
          row('db_bench_press', 3, [8, 12]),
          row('cable_row', 2, [10, 12]),
          row(['face_pull', 'db_curl'], 2, [12, 15], { join: 'and' }),
        ],
      },
      {
        title: ['Deadlift + full-body accessories', '데드리프트 + 전신 보완'], icon: 'ph-arrow-fat-lines-up', when: ['Sat', '토'],
        rows: [
          row('deadlift', [2, 3], [4, 6]),
          row('bench_press', 3, [8, 10]),
          row('one_arm_db_row', 3, [8, 12]),
          row('db_reverse_lunge', 2, 10, { side: true }),
          row(['cable_pushdown', 'db_curl'], 2, [10, 15]),
        ],
      },
    ],
  },
};

export const PRINCIPLES = [
  { icon: 'ph-timer', title: ['Session length', '운동 시간'], value: ['55–60 min', '55~60분'], body: ['Warm-up included.', '워밍업 포함이에요.'] },
  { icon: 'ph-barbell', title: ['Core lifts', '기본 운동'], value: ['Squat · Bench · Deadlift', '스쿼트 · 벤치 · 데드'], body: ['The three big lifts (SBD) anchor every week.', '삼대운동(SBD)이 매주 중심이에요.'] },
  { icon: 'ph-gauge', title: ['Effort', '강도'], value: ['1–3 reps in reserve', '1~3회 여유'], body: ['End every set able to do 1–3 more good reps.', '매 세트 1~3회는 더 할 수 있게 남겨요.'] },
  { icon: 'ph-trend-up', title: ['Progression', '진행 방식'], value: ['Progressive overload', '점진적 과부하'], body: ['Hit the top of the rep range, then add a little weight.', '반복수를 다 채우면 무게를 조금 올려요.'] },
];

export const TIMELINE = [
  { weeks: ['Weeks 1–2', '1~2주'], title: ['Learn the movements', '자세 익히기'], body: ['Use light weights and focus on form.', '가벼운 중량으로 자세를 익혀요.'] },
  { weeks: ['Weeks 3–6', '3~6주'], title: ['Build reps', '반복수 늘리기'], body: ['Run the standard sets and add reps each session.', '기본 세트 수로 하면서 반복수를 늘려요.'] },
  { weeks: ['Week 7', '7주'], title: ['Recover if needed', '필요하면 회복 주'], body: ['If you feel run down, cut sets by 30–40%.', '피로가 크면 세트를 30~40% 줄여요.'] },
  { weeks: ['Week 8', '8주'], title: ['Next step', '다음 단계'], body: ['Recovering well? Consider moving to the 5-day plan.', '회복이 잘 되면 주 5일 루틴으로 넘어가 보세요.'] },
];

// 화면 표시용: "케이블 시티드 로우 또는 바벨 로우" / "3세트 × 6~8회"
const range = (a, sep = '–') => (a.length > 1 && a[0] !== a[1] ? `${a[0]}${sep}${a[1]}` : `${a[0]}`);
export function exerciseName(r, lang) {
  const names = r.ex.map((k) => EXERCISES[k][lang === 'ko' ? 'ko' : 'en']);
  if (names.length === 1) return names[0];
  return names.join(r.join === 'and' ? ' + ' : lang === 'ko' ? ' 또는 ' : ' or ');
}
export function setsText(r, lang) {
  const ko = lang === 'ko';
  return ko ? `${r.join === 'and' ? '각 ' : ''}${range(r.sets, '~')}세트` : `${range(r.sets)} set${r.sets[r.sets.length - 1] > 1 ? 's' : ''}${r.join === 'and' ? ' each' : ''}`;
}
export function repsText(r, lang) {
  const ko = lang === 'ko';
  if (!r.reps) return ko ? '편한 만큼' : 'your pace';
  const unit = EXERCISES[r.ex[0]].unit === 'sec' ? (ko ? '초' : ' sec') : (ko ? '회' : ' reps');
  return `${range(r.reps, ko ? '~' : '–')}${unit}${r.side ? (ko ? ' (각 다리)' : ' each leg') : ''}`;
}
