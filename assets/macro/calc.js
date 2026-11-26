// 근거 기반 매크로 계산기 — 계산 로직 (화면과 분리된 순수 함수). 숫자는 작업 명세 2번을 그대로 옮김.
// 화면(assets/macro.js)은 이 모듈의 결과만 쓴다. 테스트: scripts/test-macro.mjs
// 출처 번호 [1]~[11]은 SOURCES 순서(화면 "출처" 목록과 같음).

// ── 입력 범위 ───────────────────────────────────────────────────────────────
export const LIMITS = {
  age: [19, 78], // [1] Mifflin 공식을 만든 데이터 범위
  height: [130, 230],
  weight: [35, 250],
  bodyFat: [3, 60],
};

// ── 활동 수준 PAL [3] FAO/WHO/UNU 2004 표 5.3 ────────────────────────────────
export const PAL_RANGES = {
  sedentary: { min: 1.4, max: 1.69, def: 1.55 },
  active: { min: 1.7, max: 1.99, def: 1.85 },
  very: { min: 2.0, max: 2.4, def: 2.2 },
};
export const PAL_STEP = 0.01;

// ── 목표 (주당 체중 대비 %) [7] Helms 2014 · [8] Iraki 2019 ─────────────────────
export const GOALS = {
  cut1: { pct: -1, kind: 'cut' },
  cut075: { pct: -0.75, kind: 'cut' },
  cut05: { pct: -0.5, kind: 'cut' },
  maintain: { pct: 0, kind: 'maintain' },
  gain025: { pct: 0.25, kind: 'gain' },
  gain05: { pct: 0.5, kind: 'gain' },
};
export const GOAL_DEFAULT = 'cut05';
export const KCAL_PER_KG = 7700; // [11] Hall 2008 (근사값)
export const DAYS_PER_WEEK = 7;

// ── 단백질 g/kg ────────────────────────────────────────────────────────────
export const PROTEIN = {
  cutLbm: { min: 2.3, max: 3.1, step: 0.1, def: 2.6 }, // [7] Helms 2014 (제지방량 kg당)
  cutNoBodyFat: 2.0, // [5] ISSN 2017 상단 (체중 kg당, 고정)
  other: { min: 1.4, max: 2.0, step: 0.1, def: 1.6 }, // [5] ISSN 2017 · [6] Morton 2018 (체중 kg당)
};

// ── 지방 비율 % [9] IOM AMDR ────────────────────────────────────────────────
export const FAT = { min: 20, max: 35, step: 1, def: 25 };
export const KCAL_PER_G = { protein: 4, carbs: 4, fat: 9 };

// ── 경고 기준 ───────────────────────────────────────────────────────────────
export const CARB_MIN_PER_KG = 3; // [10] ACSM 2016 가벼운 운동 3~5 g/kg
export const SURPLUS_PCT = [10, 20]; // [8] Iraki 2019

// ── 2주 보정 ────────────────────────────────────────────────────────────────
export const CALIBRATION = { minLogs: 8, minDays: 14 };

// ── 공식 계수 ───────────────────────────────────────────────────────────────
export const MIFFLIN = { kg: 10, cm: 6.25, age: 5, male: 5, female: -161 }; // [1]
export const NAVY = { // [4] Hodgdon & Beckett 1984 (cm, log10)
  male: { a: 1.0324, b: 0.19077, c: 0.15456 },
  female: { a: 1.29579, b: 0.35004, c: 0.221 },
  numerator: 495,
  minus: 450,
};

export const SOURCES = [
  { text: 'Mifflin MD, St Jeor ST 외. A new predictive equation for resting energy expenditure in healthy individuals. Am J Clin Nutr 1990;51:241–7.', links: ['https://pubmed.ncbi.nlm.nih.gov/2305711/'] },
  { text: 'Frankenfield D 외. Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults: a systematic review. J Am Diet Assoc 2005;105:775–89.', links: ['https://pubmed.ncbi.nlm.nih.gov/15883556/'] },
  { text: 'FAO/WHO/UNU. Human energy requirements (2001 Expert Consultation, 2004), 표 5.3.', links: ['https://www.fao.org/3/y5686e/y5686e07.htm'] },
  { text: 'Hodgdon JA, Beckett MB. Prediction of percent body fat for U.S. Navy men / women from body circumferences and height. NHRC Report 84-11, 84-29 (1984).', links: ['https://apps.dtic.mil/sti/pdfs/ADA143890.pdf', 'https://apps.dtic.mil/sti/pdfs/ADA146456.pdf'] },
  { text: 'Jäger R 외. ISSN Position Stand: protein and exercise. JISSN 2017;14:20.', links: ['https://pubmed.ncbi.nlm.nih.gov/28642676/'] },
  { text: 'Morton RW 외. Protein supplementation and resistance training-induced gains: meta-analysis. Br J Sports Med 2018;52:376–84.', links: ['https://pubmed.ncbi.nlm.nih.gov/28698222/'] },
  { text: 'Helms ER, Aragon AA, Fitschen PJ. Evidence-based recommendations for natural bodybuilding contest preparation. JISSN 2014;11:20.', links: ['https://pubmed.ncbi.nlm.nih.gov/24864135/'] },
  { text: 'Iraki J 외. Nutrition recommendations for bodybuilders in the off-season. Sports 2019;7:154.', links: ['https://pubmed.ncbi.nlm.nih.gov/31247944/'] },
  { text: 'Institute of Medicine. Dietary Reference Intakes for Energy, Carbohydrate, Fiber, Fat, Fatty Acids, Cholesterol, Protein, and Amino Acids (2002/2005), AMDR.', links: ['https://nap.nationalacademies.org/read/11537/chapter/7'] },
  { text: 'Thomas DT, Erdman KA, Burke LM. Position of AND, DC, ACSM: Nutrition and Athletic Performance. 2016.', links: ['https://pubmed.ncbi.nlm.nih.gov/26917108/'] },
  { text: 'Hall KD. What is the required energy deficit per unit weight loss? Int J Obes 2008;32:573–6.', links: ['https://pubmed.ncbi.nlm.nih.gov/17848938/'] },
];

// ── 기본 입력값 ─────────────────────────────────────────────────────────────
export function defaultInputs() {
  return {
    sex: 'male', age: null, heightCm: null, weightKg: null,
    bfMethod: 'unknown', bodyFat: null, neck: null, waist: null, hip: null,
    palRange: 'sedentary', pal: PAL_RANGES.sedentary.def,
    goal: GOAL_DEFAULT, proteinCut: PROTEIN.cutLbm.def, proteinOther: PROTEIN.other.def, fatPct: FAT.def,
  };
}
// 다른 활동 범위를 고르면 그 범위의 중간값으로
export const palForRange = (range) => PAL_RANGES[range].def;

const inRange = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;

// ── 체지방률 ────────────────────────────────────────────────────────────────
// 줄자 추정 [4]. 로그 안 값이 0 이하이면 { error: 'log' }
export function navyBodyFat({ sex, heightCm, neck, waist, hip }) {
  const k = NAVY[sex];
  const inner = sex === 'female' ? waist + hip - neck : waist - neck;
  if (!(inner > 0) || !(heightCm > 0)) return { error: 'log' };
  const value = NAVY.numerator / (k.a - k.b * Math.log10(inner) + k.c * Math.log10(heightCm)) - NAVY.minus;
  return { value };
}
// 쓰는 체지방률: 모름이면 null, 오류면 { error }
export function bodyFatOf(i) {
  if (i.bfMethod === 'measured') return inRange(i.bodyFat, LIMITS.bodyFat) ? { value: i.bodyFat } : { error: 'range' };
  if (i.bfMethod === 'tape') {
    const need = i.sex === 'female' ? [i.neck, i.waist, i.hip] : [i.neck, i.waist];
    if (need.some((v) => !Number.isFinite(v))) return { error: 'missing' };
    const r = navyBodyFat(i);
    if (r.error) return r;
    return inRange(r.value, LIMITS.bodyFat) ? r : { error: 'range', value: r.value };
  }
  return null;
}

// ── 공식 ────────────────────────────────────────────────────────────────────
export const lbmOf = (weightKg, bodyFat) => weightKg * (1 - bodyFat / 100);
export const bmrOf = ({ sex, weightKg, heightCm, age }) => MIFFLIN.kg * weightKg + MIFFLIN.cm * heightCm - MIFFLIN.age * age + (sex === 'male' ? MIFFLIN.male : MIFFLIN.female);
export const dailyDeltaOf = (pct, weightKg) => ((pct / 100) * weightKg * KCAL_PER_KG) / DAYS_PER_WEEK;

// 입력 검증: 칸별 오류 + 나이 범위 밖이면 계산하지 않음
export function validate(i) {
  const errors = {};
  if (i.age != null && !inRange(i.age, LIMITS.age)) errors.age = 'age_range';
  if (i.heightCm != null && !inRange(i.heightCm, LIMITS.height)) errors.height = 'range';
  if (i.weightKg != null && !inRange(i.weightKg, LIMITS.weight)) errors.weight = 'range';
  const bf = bodyFatOf(i);
  if (bf && bf.error && bf.error !== 'missing') errors.bodyFat = bf.error;
  const complete = [i.age, i.heightCm, i.weightKg].every(Number.isFinite);
  return { errors, ok: complete && Object.keys(errors).length === 0 };
}

// 단백질: 감량 + 체지방률 있음 → 제지방량 기준 / 감량 + 모름 → 체중 2.0 고정 / 유지·증량 → 체중 기준
export function proteinOf(i, goalKind, lbm) {
  if (goalKind === 'cut' && lbm != null) return { grams: i.proteinCut * lbm, coef: i.proteinCut, basis: 'lbm', fixed: false };
  if (goalKind === 'cut') return { grams: PROTEIN.cutNoBodyFat * i.weightKg, coef: PROTEIN.cutNoBodyFat, basis: 'weight', fixed: true };
  return { grams: i.proteinOther * i.weightKg, coef: i.proteinOther, basis: 'weight', fixed: false };
}

// ── 전체 계산 ───────────────────────────────────────────────────────────────
// calibration = { applied: boolean, tdee: number } (3번 실측 보정)
export function compute(i, calibration = null) {
  const v = validate(i);
  if (!v.ok) return { ok: false, errors: v.errors };
  const bf = bodyFatOf(i);
  const bodyFat = bf && !bf.error ? bf.value : null;
  const lbm = bodyFat == null ? null : lbmOf(i.weightKg, bodyFat);
  const bmr = bmrOf(i);
  const formulaTdee = bmr * i.pal;
  const applied = Boolean(calibration && calibration.applied && Number.isFinite(calibration.tdee));
  const tdee = applied ? calibration.tdee : formulaTdee;
  const goal = GOALS[i.goal];
  const delta = dailyDeltaOf(goal.pct, i.weightKg);
  const target = tdee + delta;
  const protein = proteinOf(i, goal.kind, lbm);
  const fat = (target * (i.fatPct / 100)) / KCAL_PER_G.fat;
  const carbs = (target - protein.grams * KCAL_PER_G.protein - fat * KCAL_PER_G.fat) / KCAL_PER_G.carbs;
  const carbsPerKg = carbs / i.weightKg;

  const warnings = [];
  if (carbs < 0) warnings.push({ code: 'carbs_negative' });
  if (target < bmr) warnings.push({ code: 'below_bmr' });
  if (carbs >= 0 && carbsPerKg < CARB_MIN_PER_KG) warnings.push({ code: 'carbs_low', perKg: carbsPerKg });
  if (goal.kind === 'gain') {
    const surplusPct = (delta / tdee) * 100;
    if (surplusPct < SURPLUS_PCT[0] || surplusPct > SURPLUS_PCT[1]) warnings.push({ code: 'surplus', pct: surplusPct });
  }

  const kcal = { protein: protein.grams * KCAL_PER_G.protein, fat: fat * KCAL_PER_G.fat, carbs: Math.max(carbs, 0) * KCAL_PER_G.carbs };
  const kcalSum = kcal.protein + kcal.fat + kcal.carbs;
  return {
    ok: true, bodyFat, lbm, bmr, pal: i.pal, formulaTdee, tdee, applied,
    goal: i.goal, goalKind: goal.kind, goalPct: goal.pct, delta, target, targetRounded: Math.round(target / 10) * 10,
    protein, fat, carbs, carbsPerKg, kcal,
    share: { protein: kcal.protein / kcalSum, fat: kcal.fat / kcalSum, carbs: kcal.carbs / kcalSum },
    warnings,
  };
}

// ── 3번 실측 보정 (2주 기록) ─────────────────────────────────────────────────
const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
// rows = [{ date: 'YYYY-MM-DD', weight, intake }] — 셋 다 있는 행만 사용
export function calibrate(rows) {
  const used = rows.filter((r) => r.date && Number.isFinite(r.weight) && Number.isFinite(r.intake)).sort((a, b) => (a.date < b.date ? -1 : 1));
  const n = used.length;
  const days = n ? dayNumber(used[n - 1].date) - dayNumber(used[0].date) + 1 : 0;
  if (n < CALIBRATION.minLogs || days < CALIBRATION.minDays) return { ok: false, n, days };
  const x0 = dayNumber(used[0].date);
  const xs = used.map((r) => dayNumber(r.date) - x0);
  const ys = used.map((r) => r.weight);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let k = 0; k < n; k++) { sxy += (xs[k] - mx) * (ys[k] - my); sxx += (xs[k] - mx) ** 2; }
  const slope = sxy / sxx; // kg/일
  const meanIntake = used.reduce((a, r) => a + r.intake, 0) / n;
  return { ok: true, n, days, slope, meanIntake, tdee: meanIntake - slope * KCAL_PER_KG };
}
