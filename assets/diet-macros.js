// 식단 상담 권장 매크로 계산 (관리자 화면에서 시작값으로 보여주는 용도 — 최종 숫자는 관리자가 정한다)
// 같은 계산을 api/notify-admin.js(관리자 메일)에도 복사해 두었다. 바꾸면 두 곳을 같이 바꾼다.
//   1) 기초대사량: Mifflin-St Jeor  남 10w + 6.25h − 5a + 5 / 여 … − 161 / 성별 모름 … − 78(중간값)
//   2) 활동 계수: 평소 활동(앉아 있음 1.2 · 보통 1.375 · 많이 움직임 1.55) + 운동 빈도(0~1회 0 · 2~3회 0.1 · 4~5회 0.175 · 6회+ 0.25), 최대 1.9
//   3) 목표: 감량 −15%(최대 −500) · 증량 +10% · 근육 +5% · 유지·건강 0
//   4) 단백질 g/kg(현재 체중): 감량·근육 2.0 · 증량 1.8 · 유지 1.6 · 건강 1.4 (최대 220g) / 지방 = 칼로리의 25% / 탄수화물 = 나머지
export function suggestMacros({ gender, age, height_cm: h, weight_kg: w, goal, training, daily_activity: act }) {
  const a = Number(age);
  const height = Number(h);
  const weight = Number(w);
  if (!a || !height || !weight) return null;
  const sex = gender === 'male' ? 5 : gender === 'female' ? -161 : -78;
  const bmr = 10 * weight + 6.25 * height - 5 * a + sex;
  const base = { sedentary: 1.2, moderate: 1.375, active: 1.55 }[act] ?? 1.375;
  const extra = { '0_1': 0, '2_3': 0.1, '4_5': 0.175, '6_plus': 0.25 }[training] ?? 0.1;
  const tdee = bmr * Math.min(base + extra, 1.9);
  const adjust = goal === 'lose' ? -Math.min(tdee * 0.15, 500) : goal === 'gain' ? tdee * 0.1 : goal === 'muscle' ? tdee * 0.05 : 0;
  const calories = Math.round((tdee + adjust) / 10) * 10;
  const perKg = { lose: 2.0, muscle: 2.0, gain: 1.8, maintain: 1.6, health: 1.4 }[goal] ?? 1.6;
  const protein = Math.min(Math.round((weight * perKg) / 5) * 5, 220);
  const fat = Math.round((calories * 0.25) / 9 / 5) * 5;
  const carbs = Math.max(Math.round((calories - protein * 4 - fat * 9) / 4 / 5) * 5, 0);
  return { calories, protein, carbs, fat, bmr: Math.round(bmr), tdee: Math.round(tdee) };
}

// 단백질·탄수화물·지방(g)으로 계산한 칼로리
export const macroKcal = (p, c, f) => Number(p || 0) * 4 + Number(c || 0) * 4 + Number(f || 0) * 9;
