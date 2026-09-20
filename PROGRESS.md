# PROGRESS

## 프로젝트 정보
- 프레임워크: 없음 — 순수 정적 HTML/CSS/JS, 빌드 도구 없음
- 폴더 구조: 루트에 페이지별 `.html` (`index.html`, `Fitin Main.dc.html`, `login.html`, `booking.html`), 공용 JS/CSS는 `assets/`, 디자인 시스템은 `_ds/nocturne-.../styles.css`, DB 스키마는 `supabase/schema.sql`
- 스타일 방식: "Nocturne" 디자인 시스템 — 다크 배경(#161826) + 퍼플 accent, CSS 변수 + 컴포넌트 클래스(`.btn`, `.card`, `.field`, `.input`, `.tag`, `.seg` 등). **1단계에서 화이트/블랙/그레이 톤으로 전면 교체 예정**
- 배포 환경: GitHub(`Leelif2/Fitin_members`) `main` 브랜치 push → Vercel 자동 배포(`fitin-members.vercel.app`) + GitHub Actions로 GitHub Pages도 병행 배포
- Supabase 프로젝트: `https://zcgnzgxxwhzzxpvyzidd.supabase.co` (anon key는 `assets/supabase-client.js`에 있음 — 공개용 키라 안전, service_role 키는 어디에도 없음)
- 이미 구현된 것:
  - Supabase Auth 회원가입/로그인 (`login.html`) — First/Last name, University, 생년월일, 이메일, 비밀번호(실시간 강도 체크리스트)
  - `profiles` / `pt_slots` / `bookings` 테이블 + RLS (`supabase/schema.sql`)
  - PT 예약 화면 (`booking.html`, 로그인 필수, 슬롯 단위 예약/취소)
  - 태블릿/폰 보기 강제 토글 (`assets/view-toggle.*`, 워크플로우 범위 밖의 별도 기능)
- 아직 없는 것 (이 워크플로우로 채울 부분):
  - `role`(member/admin) 구분, 관리자 전용 페이지
  - 로그인 활동 기록(`login_events`)
  - 회원 관리자 페이지, 회원 메모, 회원 탈퇴
  - `pt_reservations`로의 예약 모델 확장(현재는 슬롯 예약/해제만 있고 pending/confirmed 상태 없음), confirm 시 시간대 차단
  - 관리자 알림, 회원 확정 알림, `notification_logs`
  - `supabase/migrations/` 폴더 구조(현재는 `schema.sql` 파일 하나뿐 — 앞으로의 DB 변경부터 이 구조로 전환)

## 결정 사항
1. 트레이너: 1명 (본인)
2. 예약 시간 단위: 1시간 (기존 슬롯 방식 유지)
3. 영업 요일/시간: 월~금 08:00~22:00, 주말 휴무 (현재 시드 데이터는 매일 10/14/17/19시 4개뿐이라 5단계에서 새 영업시간에 맞게 슬롯 생성 로직을 다시 짜야 함)
4. 관리자 예약 알림 채널: 이메일 (회원용 확정 알림도 이메일 기본 — 8단계에서 발신 서비스 설정)
5. 회원가입 추가 항목: 연락처(전화번호), 운동 목표/경험 수준 — 2단계 `profiles` 테이블에 반영
6. 예약 취소: 예약 시간 24시간 전까지 허용
7. 로그인 방식: 이메일+비밀번호만 (소셜 로그인 없음)

## 단계별 상태
- [x] 0단계 — 완료 (2026-09-20)
- [ ] 1단계 디자인 시스템 변경
- [ ] 2단계 Supabase 연결 + 회원가입/로그인 (일부 선행 구현됨 — 2단계에서 role/트리거 등으로 보강)
- [ ] 3단계 로그인 활동 트래킹
- [ ] 4단계 회원정보 트래킹 (관리자 회원 관리)
- [ ] 5단계 PT 예약 기능 확장
- [ ] 6단계 관리자 예약 알림
- [ ] 7단계 관리자 Confirm + 시간대 차단
- [ ] 8단계 회원 확정 알림
- [ ] 9단계 최종 점검과 배포

## 생성/수정한 파일
- `CLAUDE.md` (신규) — 워크플로우 규칙 저장
- `PROGRESS.md` (신규) — 이 파일

## DB 테이블 목록과 관계 (현재 기준)
- `profiles` (id → auth.users, first_name, last_name, date_of_birth, university, created_at) — RLS: 본인만 select/insert/update
- `pt_slots` (id, starts_at, ends_at, trainer, created_at) — RLS: 전체 select만, insert/update는 대시보드에서만
- `bookings` (id, slot_id → pt_slots unique, user_id → auth.users, created_at) — RLS: 본인만 select/insert/delete
- `pt_slots_public` 뷰 + `slot_is_booked()` 함수 — 예약 여부만 노출, 예약자 신원은 숨김

## 남은 이슈 / 다음에 할 일
- 1단계(디자인 화이트/블랙/그레이 전환)부터 순서대로 진행 — 사용자가 "다음 단계 진행"이라고 말하면 시작
- 5단계에서 영업시간(월~금 08:00~22:00)에 맞게 슬롯 생성 로직 재작성 필요 (현재 시드 데이터는 임시)
- 이후 DB 변경분부터는 `supabase/schema.sql` 한 파일이 아니라 `supabase/migrations/NNN_설명.sql` 형태로 분리 저장
