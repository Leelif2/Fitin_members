# PROGRESS

## 프로젝트 정보
- 프레임워크: 없음 — 순수 정적 HTML/CSS/JS, 빌드 도구 없음
- 폴더 구조: 루트에 페이지별 `.html` (`index.html`, `Fitin Main.dc.html`, `login.html`, `booking.html`), 공용 JS/CSS는 `assets/`, 디자인 시스템은 `_ds/nocturne-.../styles.css`, DB 스키마는 `supabase/schema.sql`
- 스타일 방식: "Nocturne" 디자인 시스템 — **1단계 완료로 화이트/블랙/그레이 톤 + Pretendard 폰트로 전면 교체됨** (`_ds/nocturne-.../styles.css` 토큰만 교체, 컴포넌트 구조는 동일)
- 배포 환경: GitHub(`Leelif2/Fitin_members`) `main` 브랜치 push → Vercel 자동 배포(`fitin-members.vercel.app`)
- Supabase 프로젝트: `https://zcgnzgxxwhzzxpvyzidd.supabase.co` (anon key는 `assets/supabase-client.js`에 있음 — 공개용 키라 안전, service_role 키는 어디에도 없음)
- 이미 구현된 것:
  - Supabase Auth 회원가입/로그인 (`login.html`) — First/Last name, University, 생년월일, 이메일, 비밀번호(실시간 강도 체크리스트)
  - `profiles` / `pt_slots` / `bookings` 테이블 + RLS (`supabase/schema.sql`)
  - PT 예약 화면 (`booking.html`, 로그인 필수, 슬롯 단위 예약/취소)
  - 태블릿/폰 보기 강제 토글 (`assets/view-toggle.*`, 워크플로우 범위 밖의 별도 기능)
- 2단계 완료로 추가된 것: `profiles`에 `phone`/`role`/`experience_level`/`fitness_goal`, 가입 시 자동 프로필 생성 트리거, `role` 자기수정 방지 트리거, 관리자 전체조회 RLS, 비밀번호 재설정(`reset-password.html`)
- 3단계 완료로 추가된 것: `login_events` 테이블, Vercel 서버리스 함수 `/api/log-event.js`(IP 기록, 이 프로젝트 최초의 서버 코드이자 `service_role` 키 사용처), 로그인/로그아웃/가입/로그인실패 자동 기록, 관리자 전용 `admin-login-events.html`
- 아직 없는 것 (이 워크플로우로 채울 부분):
  - 관리자 전용 통합 페이지/내비게이션(지금은 `admin-login-events.html` 하나뿐, role 체크는 각 페이지가 스스로 함)
  - 회원 관리자 페이지, 회원 메모, 회원 탈퇴
  - `pt_reservations`로의 예약 모델 확장(현재는 슬롯 예약/해제만 있고 pending/confirmed 상태 없음), confirm 시 시간대 차단
  - 관리자 알림, 회원 확정 알림, `notification_logs`

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
- [x] 1단계 디자인 시스템 변경 — 완료 (2026-09-20)
- [x] 2단계 Supabase 연결 + 회원가입/로그인 보강 — 완료, **사용자가 마이그레이션 SQL 실행 대기 중** (2026-09-20)
- [x] 3단계 로그인 활동 트래킹 — 완료, **사용자가 SQL 실행 + Vercel 환경변수 등록 대기 중** (2026-09-20)
- [ ] 4단계 회원정보 트래킹 (관리자 회원 관리)
- [ ] 5단계 PT 예약 기능 확장
- [ ] 6단계 관리자 예약 알림
- [ ] 7단계 관리자 Confirm + 시간대 차단
- [ ] 8단계 회원 확정 알림
- [ ] 9단계 최종 점검과 배포

## 생성/수정한 파일
- `CLAUDE.md` (신규) — 워크플로우 규칙 저장
- `PROGRESS.md` (신규) — 이 파일
- `_ds/nocturne-.../styles.css` (수정, 1단계) — 색상 토큰 화이트/블랙/그레이로 교체, Pretendard 폰트, 채워진 블랙 버튼
- `supabase/migrations/0001_profiles_role_and_trigger.sql` (신규, 2단계)
- `assets/supabase-client.js` (수정, 2단계) — `requestPasswordReset()` 추가
- `login.html` (수정, 2·3단계) — 연락처/경험수준/운동목표 필드, 비밀번호 재설정 미니폼, signUp을 트리거 기반으로 전환, 로그인/가입/실패 시 `logEvent()` 호출
- `reset-password.html` (신규, 2단계)
- `signup.html` / `assets/signup.css` / `assets/signup.js` (신규) — 학교·이름·아이콘 성별 선택·이메일 아이디·비밀번호를 받는 팝업형 회원가입 화면
- `assets/signup-window.js` (신규) — 회원가입 링크를 별도 창으로 여는 공용 처리
- `Fitin Main.dc.html`, `login.html` (수정) — 회원가입 아이콘 버튼과 새 창 연결
- `supabase/migrations/0003_signup_gender.sql` (신규) — profiles의 성별 저장과 가입 트리거 반영
- `admin-login-events.html` (수정) — 로그인되지 않은 방문 시 발생하던 관리 화면 오류 제거, 검색 범위 표기 보정
- `api/log-event.js` (수정) — 로그인·로그아웃·가입 기록은 유효한 로그인 토큰을 요구하도록 보완
- `scripts/dev-server.js` (수정) — 잘못된 요청과 로컬 포트 실행 실패를 안전하게 처리
- `supabase/migrations/0002_login_events.sql` (신규, 3단계)
- `api/log-event.js` (신규, 3단계) — Vercel 서버리스 함수, `service_role` 키 사용
- `assets/supabase-client.js` (수정, 3단계) — `logEvent()` 추가, `signOut()`이 로그아웃 기록 남기고 종료
- `admin-login-events.html` (신규, 3단계)

## DB 테이블 목록과 관계 (현재 기준)
- `profiles` (id → auth.users, first_name, last_name, date_of_birth, university, phone, role[member/admin], experience_level, fitness_goal, created_at) — RLS: 본인만 select/insert/update, role이 admin인 사용자는 전체 select. `role`은 트리거로 본인이 직접 못 바꿈. 가입 시 `handle_new_user()` 트리거가 자동 생성.
- `pt_slots` (id, starts_at, ends_at, trainer, created_at) — RLS: 전체 select만, insert/update는 대시보드에서만
- `bookings` (id, slot_id → pt_slots unique, user_id → auth.users, created_at) — RLS: 본인만 select/insert/delete
- `pt_slots_public` 뷰 + `slot_is_booked()` 함수 — 예약 여부만 노출, 예약자 신원은 숨김
- `login_events` (id, user_id → auth.users nullable, attempted_email, event_type[login/logout/login_failed/signup], ip_address, user_agent, device, created_at) — RLS: 본인만 select, admin은 전체 select, insert는 없음(서버 함수 전용)

## 작업 환경 (2026-10-06 변경)
- 작업 폴더를 `Downloads\Fitin_Connection Team Member` 로 이전 (git 연결, origin/main 추적). 이전 폴더 `IGC Member 피트니스 플랫폼`은 사용 중지.
- 로컬 미리보기: `npm run dev` (`scripts/dev-server.js`, 의존성 없음, 포트 5173)
- 사진 폴더: `assets/images/{hero,trainer,facility,program}/`

## 별도 트랙: 온보딩 페이지 사진 작업 (진행 예정)
- 목표: Fitin 실제 사진으로 메인 온보딩 페이지(`Fitin Main.dc.html`)에 전문성 있는 인상 부여

## 남은 이슈 / 다음에 할 일
- **사용자가 해야 할 일 (2단계 + 3단계 누적)**:
  1. `supabase/migrations/0001_profiles_role_and_trigger.sql` 실행
  2. `supabase/migrations/0002_login_events.sql` 실행
  3. Authentication → URL Configuration에 `reset-password.html` redirect URL 추가
  4. 본인 계정 admin 지정 SQL 실행 (0001 파일 맨 아래 참고)
  5. Vercel 프로젝트 → Settings → Environment Variables에 `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` 등록 후 재배포
- 5단계에서 영업시간(월~금 08:00~22:00)에 맞게 슬롯 생성 로직 재작성 필요 (현재 시드 데이터는 임시)
- 4단계(회원정보 트래킹/관리자 회원 관리)부터 계속 진행
