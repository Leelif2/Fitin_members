// 매크로 계산기(assets/macro/calc.js) 단위 테스트 — 작업 명세 7번 케이스. 실행: node scripts/test-macro.mjs
// 소수 1자리 반올림, 허용 오차 ±0.1
import { compute, calibrate, defaultInputs, palForRange, PAL_RANGES } from '../assets/macro/calc.js';

let pass = 0;
let fail = 0;
const near = (name, got, want, tol = 0.1) => {
  const ok = Number.isFinite(got) && Math.abs(Math.round(got * 10) / 10 - want) <= tol + 1e-9;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${ok ? '' : `→ got ${got}, want ${want}`}`);
};
const is = (name, got, want) => {
  const ok = got === want;
  ok ? pass++ : fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${ok ? '' : `→ got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};
const has = (r, code) => r.warnings.some((w) => w.code === code);
const make = (o) => ({ ...defaultInputs(), ...o });

// 1. 남 24세 175cm 72kg, 체지방 18% 입력, PAL 1.55, 감량 주 0.5%, 단백질 2.6 g/LBM, 지방 25%
const r1 = compute(make({ sex: 'male', age: 24, heightCm: 175, weightKg: 72, bfMethod: 'measured', bodyFat: 18, pal: 1.55, goal: 'cut05', proteinCut: 2.6, fatPct: 25 }));
near('1 · LBM 59.0', r1.lbm, 59.0);
near('1 · BMR 1698.8', r1.bmr, 1698.8);
near('1 · TDEE 2633.1', r1.tdee, 2633.1);
near('1 · 증감 −396.0', r1.delta, -396.0);
near('1 · 목표 2237.1', r1.target, 2237.1);
near('1 · 단백질 153.5', r1.protein.grams, 153.5);
near('1 · 지방 62.1', r1.fat, 62.1);
near('1 · 탄수 265.9', r1.carbs, 265.9);
is('1 · 경고 없음', r1.warnings.length, 0);
is('1 · 큰 숫자 10 단위 반올림 2240', r1.targetRounded, 2240);

// 2. 여 22세 163cm 58kg, 줄자 목 32·허리 70·엉덩이 96, PAL 1.85, 유지, 단백질 1.6 g/kg, 지방 25%
const r2 = compute(make({ sex: 'female', age: 22, heightCm: 163, weightKg: 58, bfMethod: 'tape', neck: 32, waist: 70, hip: 96, pal: 1.85, goal: 'maintain', proteinOther: 1.6, fatPct: 25 }));
near('2 · 체지방 25.9%', r2.bodyFat, 25.9);
near('2 · LBM 43.0', r2.lbm, 43.0);
near('2 · BMR 1327.8', r2.bmr, 1327.8);
near('2 · TDEE 2456.3', r2.tdee, 2456.3);
near('2 · 목표 2456.3', r2.target, 2456.3);
near('2 · 단백질 92.8 (체중 기준)', r2.protein.grams, 92.8);
near('2 · 지방 68.2', r2.fat, 68.2);
near('2 · 탄수 367.8', r2.carbs, 367.8);

// 3. 남 30세 180cm 85kg, 체지방 모름, PAL 2.20, 증량 주 0.25%, 단백질 1.6 g/kg, 지방 25%
const r3 = compute(make({ sex: 'male', age: 30, heightCm: 180, weightKg: 85, bfMethod: 'unknown', pal: 2.2, goal: 'gain025', proteinOther: 1.6, fatPct: 25 }));
near('3 · BMR 1830.0', r3.bmr, 1830.0);
near('3 · TDEE 4026.0', r3.tdee, 4026.0);
near('3 · 증감 +233.8', r3.delta, 233.8);
near('3 · 목표 4259.8', r3.target, 4259.8);
near('3 · 단백질 136.0', r3.protein.grams, 136.0);
near('3 · 지방 118.3', r3.fat, 118.3);
near('3 · 탄수 662.7', r3.carbs, 662.7);
is('3 · 잉여 경고 표시', has(r3, 'surplus'), true);
near('3 · 잉여 5.8%', r3.warnings.find((w) => w.code === 'surplus').pct, 5.8);

// 4. 여 27세 160cm 65kg, 체지방 모름, PAL 1.55, 감량 주 0.75%, 지방 25%
const r4 = compute(make({ sex: 'female', age: 27, heightCm: 160, weightKg: 65, bfMethod: 'unknown', pal: 1.55, goal: 'cut075', fatPct: 25 }));
near('4 · BMR 1354.0', r4.bmr, 1354.0);
near('4 · TDEE 2098.7', r4.tdee, 2098.7);
near('4 · 증감 −536.3', r4.delta, -536.3);
near('4 · 목표 1562.5', r4.target, 1562.5);
near('4 · 단백질 130.0 (2.0 g/kg 고정)', r4.protein.grams, 130.0);
is('4 · 단백질 고정 표시', r4.protein.fixed && r4.protein.coef === 2.0, true);
near('4 · 지방 43.4', r4.fat, 43.4);
near('4 · 탄수 163.0', r4.carbs, 163.0);
near('4 · 탄수 2.5 g/kg', r4.carbsPerKg, 2.5);
is('4 · 탄수화물 3 g/kg 미만 경고', has(r4, 'carbs_low'), true);

// 보정: 16일 연속
const W = [72.4, 72.1, 72.3, 71.9, 72.0, 71.8, 71.6, 71.9, 71.5, 71.4, 71.6, 71.2, 71.3, 71.0, 71.1, 70.9];
const K = [2150, 2200, 2080, 2240, 2100, 2180, 2120, 2260, 2090, 2150, 2200, 2110, 2170, 2140, 2080, 2190];
const day = (n) => new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10);
const cal = calibrate(W.map((w, n) => ({ date: day(n), weight: w, intake: K[n] })));
is('보정 · 계산됨 (16개, 16일)', cal.ok && cal.n === 16 && cal.days === 16, true);
is('보정 · 기울기 −0.09235 kg/일', Math.abs(cal.slope - -0.09235) < 0.00001, true);
near('보정 · 평균 섭취 2153.75', cal.meanIntake, 2153.8);
is('보정 · 평균 섭취 정확히 2153.75', cal.meanIntake, 2153.75);
near('보정 · 실측 TDEE 2864.9', cal.tdee, 2864.9);
const applied = compute(make({ sex: 'male', age: 24, heightCm: 175, weightKg: 72, pal: 1.55, goal: 'cut05' }), { applied: true, tdee: cal.tdee });
near('보정 적용 · 하루 소모량 = 실측값', applied.tdee, 2864.9);
is('보정 적용 · 공식값은 따로 보관', Math.round(applied.formulaTdee * 10) / 10, 2633.1);

// 미달 · 오류
const c7 = calibrate(W.slice(0, 7).map((w, n) => ({ date: day(n * 3), weight: w, intake: K[n] })));
is('기록 7개 → 보정 미계산', c7.ok, false);
is('기록 7개 · 19일 표시값', `${c7.n}개 · ${c7.days}일`, '7개 · 19일');
is('기록 8개 · 13일 → 미계산', calibrate(W.slice(0, 8).map((w, n) => ({ date: day(n), weight: w, intake: K[n] }))).ok, false);
is('빈 칸 있는 행은 제외', calibrate([...W.map((w, n) => ({ date: day(n), weight: w, intake: K[n] })), { date: day(20), weight: null, intake: 2000 }]).n, 16);
const a18 = compute(make({ sex: 'male', age: 18, heightCm: 175, weightKg: 72 }));
is('나이 18 → 결과 없음', a18.ok, false);
is('나이 18 → 나이 경고', a18.errors.age, 'age_range');
is('나이 79 → 결과 없음', compute(make({ age: 79, heightCm: 175, weightKg: 72 })).ok, false);
is('키 129 → 키 칸 오류', compute(make({ age: 30, heightCm: 129, weightKg: 72 })).errors.height, 'range');
is('체중 251 → 체중 칸 오류', compute(make({ age: 30, heightCm: 175, weightKg: 251 })).errors.weight, 'range');
is('체지방 2% → 체지방 칸 오류', compute(make({ age: 30, heightCm: 175, weightKg: 72, bfMethod: 'measured', bodyFat: 2 })).errors.bodyFat, 'range');
is('줄자 허리 ≤ 목 → 로그 오류', compute(make({ age: 30, heightCm: 175, weightKg: 72, bfMethod: 'tape', neck: 40, waist: 38 })).errors.bodyFat, 'log');
// 체중이 크고 체지방이 낮으면 단백질(제지방량×3.1)과 지방만으로 목표를 넘는다: 목표 약 1,167kcal < 단백질 1,339kcal
const neg = compute(make({ sex: 'female', age: 40, heightCm: 150, weightKg: 120, bfMethod: 'measured', bodyFat: 10, pal: 1.4, goal: 'cut1', proteinCut: 3.1, fatPct: 35 }));
is('탄수 < 0 → 경고 + 막대 0', has(neg, 'carbs_negative') && neg.kcal.carbs === 0, true);
is('탄수 < 0 이면 3 g/kg 경고는 안 냄', has(neg, 'carbs_low'), false);
is('목표 < BMR 경고', has(compute(make({ sex: 'female', age: 25, heightCm: 160, weightKg: 100, pal: 1.4, goal: 'cut1' })), 'below_bmr'), true);
is('증량 잉여 10~20% 안이면 경고 없음', has(compute(make({ sex: 'female', age: 25, heightCm: 155, weightKg: 50, pal: 1.4, goal: 'gain05' })), 'surplus'), false);
is('활동 범위를 바꾸면 그 범위 중간값', [palForRange('sedentary'), palForRange('active'), palForRange('very')].join(','), [PAL_RANGES.sedentary.def, PAL_RANGES.active.def, PAL_RANGES.very.def].join(','));

// 체형 보고 고르기 (2026-11-28): 범위 가운데 값, 열린 칸은 아래 끝 + 2, 제지방량 기준 단백질
const base = { age: 24, heightCm: 175, weightKg: 72, pal: 1.55, goal: 'cut05', proteinCut: 2.6, fatPct: 25, bfMethod: 'visual' };
const v1 = compute(make({ ...base, sex: 'male', bfVisual: 2 }));
near('체형 남 8–12% → 10.0', v1.bodyFat, 10.0);
near('체형 남 8–12% → LBM 64.8', v1.lbm, 64.8);
is('체형 선택 + 감량 → 제지방량 기준 단백질', v1.protein.basis, 'lbm');
near('체형 남 3–4% → 3.5', compute(make({ ...base, sex: 'male', bfVisual: 0 })).bodyFat, 3.5);
near('체형 남 40%+ → 42', compute(make({ ...base, sex: 'male', bfVisual: 8 })).bodyFat, 42);
near('체형 여 10–13% → 11.5', compute(make({ ...base, sex: 'female', bfVisual: 0 })).bodyFat, 11.5);
near('체형 여 50%+ → 52', compute(make({ ...base, sex: 'female', bfVisual: 8 })).bodyFat, 52);
const v0 = compute(make({ ...base, sex: 'male', bfVisual: null }));
is('체형 미선택 → 모름과 같음 (계산은 됨)', v0.ok && v0.bodyFat === null && v0.protein.fixed, true);
is('체형 칸 번호가 이상하면 모름 처리', compute(make({ ...base, sex: 'male', bfVisual: 9 })).bodyFat, null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
