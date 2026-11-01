# PROGRESS

## 프로젝트 정보
- 프레임워크: 없음 — 순수 정적 HTML/CSS/JS, 빌드 도구 없음
- 폴더 구조: 루트에 페이지별 `.html` (`index.html`, `Fitin Main.dc.html`, `login.html`, `booking.html`), 공용 JS/CSS는 `assets/`, 디자인 시스템은 `_ds/nocturne-.../styles.css`, DB 스키마는 `supabase/schema.sql`
- 스타일 방식: "Nocturne" 디자인 시스템 — **1단계 완료로 화이트/블랙/그레이 톤 + Pretendard 폰트로 전면 교체됨** (`_ds/nocturne-.../styles.css` 토큰만 교체, 컴포넌트 구조는 동일)
- 배포 환경: GitHub(`Leelif2/Fitin_members`) `main` 브랜치 push → Vercel 자동 배포(`fitin-members.vercel.app`) — **2026-10-31부터 공식 주소 `https://www.fitinconnection.com`** (Cloudflare에서 산 도메인, DNS는 Cloudflare·프록시 끔, `fitinconnection.com` → www로 308 이동. 예전에 이 도메인을 쓰던 별도 대시보드 앱(러닝·헬스·SBD, 다른 Vercel 계정)은 자기 vercel.app 주소로만 사용)
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
3. 영업 요일/시간: **월~금 17:00~22:00** (17·18·19·20·21시 시작 1시간 세션, 하루 5개), 주말 휴무 — 2026-10-15 변경 (이전: 08:00~22:00)
8. (2026-10-15 추가) 예약 방식: **선착순 즉시 확정** — 관리자 confirm 단계 없음. 6·8단계 알림은 이 방식에 맞춰 붙이고, 7단계(관리자 confirm)는 필요 시 관리자 취소 기능 위주로 축소 검토
9. (2026-10-15 추가) 학생 1명당 **주 1회** 예약, 예약 가능 기간은 **이번 주만** (일요일 08:00 KST에 다음 주로 넘어감)
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
- [x] 5단계 PT 예약 — **팀원(심이한) 구현(pt_slots/bookings + 예약금·동의·관리자 대시보드)을 유지하고 규칙만 변경 (2026-10-30, 사용자 결정 "B")**
  - 규칙: 월~금, 17:00~22:00 (17~21시 시작), 이번 주 + 다음 주까지, 취소는 시작 24시간 전까지 (이후 취소 불가). 환불 문구도 24시간 기준으로 통일 (사용자 결정)
  - `supabase/migrations/0013_booking_rules.sql`: `ensure_pt_slots()`(이번 주·다음 주 칸 자동 생성 — 0006 시드는 12/6까지만이었음), `pt_slots_public` 월~금·17~21시만, 예약 트리거에 요일/시간/2주 제한 추가, 취소 정책 24시간(`booking_cancellable()`)
  - `booking.html`: 5열(월~금), 21시 칸, 다음 주까지만 이동, 24시간 이내 내 예약은 "취소 불가", 성공/오류 안내가 바로 지워지던 문제 수정
  - 2026-10-30 실수 기록: Claude가 10-15 기준 옛 버전(pt_reservations)으로 덮어썼다가 5분 만에 되돌림(25cce84). 그 사이 예약 없음. `pt_reservations` 테이블·함수는 Supabase에 남아 있지만 사용 안 함, 옛 버전은 로컬 브랜치 `claude/booking-first-come`에만 있음
  - 0013은 2026-10-30 Supabase에 실행됨 (ensure_pt_slots 존재 확인)
  - **취소 기록 보존 (2026-10-30 사용자 요청)** — `supabase/migrations/0014_booking_cancel_history.sql`: 취소해도 행을 지우지 않고 `bookings.cancelled_at` 기록, 시간당 "취소 안 된 예약 1개"(부분 유니크 인덱스 `bookings_one_active_per_slot`, 기존 `bookings_slot_id_key` 제거), 취소는 `cancel_booking()` 함수로만(본인 + 24시간 전), 회원 직접 삭제 정책 제거. 기존 예약 데이터는 그대로
  - `admin.html`: "예약 상태" 칸(예약 중 / 취소됨 + 취소 시각 + 환불 안내), 예약 상태 필터, "취소 · 환불 확인 필요" 요약 숫자(취소 + 입금 확인됨/확인 대기), 취소 건은 출석 상태 잠금, 예약은 전부 페이지 단위로 읽고 시간 칸은 예약에 연결된 것만 읽음(1000개 제한으로 오래된 예약이 빠지던 문제 해결)
  - **주의: 0014 SQL을 먼저 실행한 뒤 화면을 올려야 함** (화면이 cancelled_at 칸을 읽기 때문에, SQL 전이면 예약·관리자 화면이 오류)
  - 0014 이전에 학생이 취소한 예약은 이미 지워져서 복구 불가
- [ ] 6단계 관리자 예약 알림
- [ ] 7단계 관리자 Confirm + 시간대 차단
- [ ] 8단계 회원 확정 알림
- [ ] 9단계 최종 점검과 배포

## 홈 개편 (2026-10-30) — "오늘 뭐 같이 할까?" 앱형 홈 + 모임
작업 폴더 메모: 2026-10-30에 예전 사본 폴더(`Downloads/IGC Member 피트니스 플랫폼`)에서 A·C단계를 먼저 만들었다가, 최신 main 위로 이 폴더(`Fitin_Connection Team Member`)에 옮겨 합침. **앞으로는 이 폴더만 사용.**
레퍼런스: 앱형 홈 "오늘 저녁, 뭐 같이 할까?" + 카테고리 카드 3개 + 오늘의 학식 + 실시간 모임.
결정 사항:
- 색상은 화이트/블랙/그레이 유지, 글자 대비 높임 (바탕 #f4f4f2 / 카드 #ffffff / 보조 텍스트 진하게, 카테고리 카드는 무채색 3단계)
- 카테고리: 밥 / 스터디 / 운동. 운동 카드 → "같이 운동할 모임 만들기" + "트레이너 PT 예약(booking.html)" 두 갈래
- 기존 메인 내용(시간표 업로드, 소개 등)은 새 홈 아래 "Fitin 소개"로 그대로 유지. 헤더는 팀원 버전(회원가입/내 계정/로그아웃) 유지
- 실시간: 비로그인 = "지금 N명 접속 중" 숫자만 / 로그인 회원 = 이름 첫 글자 아바타 + 열린 모임
- 필터: 전체/밥/스터디/운동/같은 성별/English
- 홈·학식은 누구나 보기, 모임 열기/참여는 로그인 회원만. 언어 한국어/영어 전환 유지
- 성별: 회원가입(`signup.html`)에서 **선택 항목, 남/여만** ("선택 안 함" 삭제). 성별이 없거나 예전 'undisclosed'인 회원은 같은 성별 모임에 처음 참여/개설할 때 한 번만 물어봄. 한 번 남/여로 정하면 본인 변경 불가(관리자만)
- 같은 성별 모임은 같은 성별(또는 성별 미입력) 회원에게만 보임
- 진행 언어: 모임 열 때 한국어 / English 체크 (둘 다 가능, 최소 1개). 기존 회원에게 추가 가입 정보 받지 않음
- 최대 인원 2~10명(연 사람 포함), 기본 2명 / 지금부터 7일 이내만 / 1인당 열린 모임 최대 5개
- "알림 켜기" 배너는 나중에. 학식 카페테리아 사이트 URL은 사용자가 마지막에 전달 예정
하위 단계:
- [x] A. 메인 홈 화면 디자인 — 완료 (2026-10-30)
- [x] C. 모임 열기 / 참여 — 완료 (2026-10-30), **사용자가 `0012_meetups.sql` 실행 대기 중**
- [ ] D. 실시간 접속자 수 / 실시간 모임 (Supabase Realtime Presence) — 다음 차례. 지금 "12명 접속 중"·아바타는 예시 값
- [x] B. 오늘의 학식 자동 수집 — 구현 (2026-11-01). 원본 `https://housing.igc.or.kr/about/cafeteria_menu.do?c_date=YYYY-MM-DD` (날짜별 HTML, 메뉴마다 영어 `<dt>`·한국어 `<dd>`, 평일만 운영).
  - 결정: 영어·한국어 둘 다 저장·표시 (고른 언어 크게 + 다른 언어 작게), **매주 일요일 21:00 KST** 업데이트 (`vercel.json` crons `0 12 * * 0` UTC — Vercel 무료 플랜은 21시~21시 59분 사이 실행될 수 있음)
  - `api/cafeteria-sync.js`: 오늘부터 8일치를 하루씩 읽어 `cafeteria_menus`에 저장(그 날짜 행을 원본과 똑같이 교체, 날짜 확인 안 되는 페이지는 건드리지 않음), 결과는 `cafeteria_sync_runs`에 기록. 누구나 호출 가능하지만 30분에 1번만 실행(CRON_SECRET 환경변수가 있으면 Vercel Cron은 이 제한 없이 실행 — Vercel 환경변수 권한이 없어 지금은 미설정)
  - `api/cafeteria.js`: 오늘부터 7일치 반환, CDN 5분 캐시. 홈은 오늘 메뉴, 없으면(주말) 가장 가까운 다음 날 메뉴 + "오늘은 학식이 없어요" 안내, 실패/미게시 안내, "원본 보기" 링크
  - `supabase/migrations/0022_cafeteria_menus.sql`: 메뉴는 누구나 읽기·서버만 쓰기, 수집 기록은 관리자만 읽기 — **Supabase 실행 필요**
  - 테스트: 실제 IGC 페이지 파싱(평일 3끼·금요일 2끼·주말 없음·날짜 불일치 차단), PGlite RLS 9개, 동기화 함수(저장 14끼·30분 제한·비밀값), 브라우저 화면(한/영, 390px, 다음 날 메뉴·실패·미게시)
  - 원본 오타(예: 11/6 점심 "Pasta Salad/포기김치")는 원본 그대로 보여줌
파일: `Fitin Main.dc.html`(홈·모임 목록·열기 폼·성별 질문, 로그인 회원에게만 Supabase 번들 지연 로드), `assets/meetups.js`(신규), `supabase/migrations/0012_meetups.sql`(신규), `_ds/nocturne-.../styles.css`(대비), `signup.html`·`assets/signup.css`·`assets/signup.js`(성별 남/여 선택 항목, 동의 문구에 모임 서비스 추가)
테스트: 로컬 Postgres(PGlite)에서 schema + 0001~0012 전체 실행 후 SQL 40개 시나리오 통과, 브라우저(가짜 Supabase 응답)로 화면 21개 시나리오 통과.

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
- `routine.html` (신규, 루틴 트랙) — 선호도 조사 → 시간표 사진 업로드/직접 입력 → Push·Pull·Leg 추천 → 저장
- `assets/routine-plan.js` (신규, 루틴 트랙) — 공강 계산·세션 배정·종목 표 (순수 함수), `scripts/test-routine-plan.mjs` 테스트 13개
- `api/read-timetable.js` (신규, 루틴 트랙) — Claude(claude-opus-5-5)로 사진에서 수업 목록만 추출, 로그인 회원만 호출 가능. 기존 데모 `api/generate-routine.js`는 삭제
- `supabase/migrations/0007_routine_plans.sql` (신규, 루틴 트랙)
- `Fitin Main.dc.html` (수정, 루틴 트랙) — "Upload your timetable" 버튼을 routine.html 링크로, 데모 루틴 대화상자/코드 제거

## DB 테이블 목록과 관계 (현재 기준)
- `profiles` (id → auth.users, first_name, last_name, date_of_birth, university, phone, role[member/admin], experience_level, fitness_goal, created_at) — RLS: 본인만 select/insert/update, role이 admin인 사용자는 전체 select. `role`은 트리거로 본인이 직접 못 바꿈. 가입 시 `handle_new_user()` 트리거가 자동 생성.
- `pt_slots` (id, starts_at, ends_at, trainer, created_at) — RLS: 전체 select만, insert/update는 대시보드에서만
- `bookings` (id, slot_id → pt_slots unique, user_id → auth.users, created_at) — RLS: 본인만 select/insert/delete
- `pt_slots_public` 뷰 + `slot_is_booked()` 함수 — 예약 여부만 노출, 예약자 신원은 숨김
- `pt_reservations` (id, user_id → auth.users, reservation_date, start_time, end_time, status[pending/confirmed/rejected/cancelled, 기본 confirmed], memo, week_start(자동), created_at, confirmed_at, cancelled_at) — 부분 유니크 인덱스 2개: 같은 날짜·시간 confirmed 1개, 학생별 주 confirmed 1개. RLS: 본인만 select, admin 전체 select, 쓰기 정책 없음 → `book_pt_session()` / `cancel_pt_reservation()` 함수로만 예약·취소. `get_pt_taken_slots()`는 이번 주 마감 시간만(신원 없이) 반환. 기존 `pt_slots`/`bookings`는 더 이상 화면에서 안 씀(삭제 안 함)
- `routine_plans` (id, user_id → auth.users, preferences jsonb{duration 30/50, sessionsPerWeek 3~5, level, timePref, goal}, classes jsonb[{day,start,end,title}], plan jsonb, created_at) — RLS: 본인만 select/insert/delete, admin 전체 select, 수정 없음. 사진 원본은 저장 안 함
- `login_events` (id, user_id → auth.users nullable, attempted_email, event_type[login/logout/login_failed/signup], ip_address, user_agent, device, created_at) — RLS: 본인만 select, admin은 전체 select, insert는 없음(서버 함수 전용)
- (0012) `profiles.gender` (male/female/undisclosed/null; 새 가입은 male/female/null만) — 남/여로 정해진 뒤엔 본인 변경 불가 트리거. 'undisclosed'는 미입력으로 취급
- (0012) `meetups` (id, host_id, category[meal/study/workout], title, place, starts_at, max_people 2~10, lang_ko, lang_en, same_gender, host_gender, status[open/cancelled], created_at) — RLS: 로그인 회원은 열린 모임 select(같은 성별 모임은 같은 성별/미입력자만), insert는 본인 것만(트리거가 7일·성별·5개 제한 강제), update/delete 정책 없음
- (0012) `meetup_members` (meetup_id, user_id, joined_at) — RLS: 본인 행 + admin만 select, 쓰기는 함수로만
- (0012) 함수: `list_meetups()`(이름 첫 글자만 노출), `join_meetup()`(행 잠금으로 정원 초과 방지), `leave_meetup()`, `cancel_meetup()`(연 사람/admin), `my_gender()` — 모두 authenticated만 실행

## 작업 환경 (2026-10-06 변경)
- 작업 폴더를 `Downloads\Fitin_Connection Team Member` 로 이전 (git 연결, origin/main 추적). 이전 폴더 `IGC Member 피트니스 플랫폼`은 사용 중지.
- 로컬 미리보기: `npm run dev` (`scripts/dev-server.js`, 의존성 없음, 포트 5173)
- 사진 폴더: `assets/images/{hero,trainer,facility,program}/`

## 별도 트랙: 온보딩 페이지 사진 작업 (틀 완료, 사진 대기)
- 목표: Fitin 실제 사진으로 메인 온보딩 페이지(`Fitin Main.dc.html`)에 전문성 있는 인상 부여
- 2026-10-10: 숫자 띠 아래에 `#gallery` "Inside Fitin / Fitin 둘러보기" 섹션(사진 4칸 그리드 + 클릭 시 원본 확대 보기) 추가. 사진 파일은 아직 없음 → 사용자가 4장 보내주면 `assets/images/onboarding/photo-1~4.jpg`로 최적화(가로 1600px, 300KB 이하)해서 넣으면 끝. 아직 commit/push 안 함. 2026-10-15: 팀원(심이한) 커밋 3개 pull 후 합침 — 충돌 없음, 전 페이지 콘솔 오류 없음, 확대 보기 클릭 테스트 통과.

## 별도 트랙: 시간표 → 운동 루틴 추천 (2026-10-15 구현, 키·SQL 대기)
- 흐름: 선호도 조사(운동 시간 30/50분, 주 3~5회, 경험 수준, 선호 시간대, 목표) → 시간표 사진 → AI가 수업만 추출 → 학생이 확인·수정 → 규칙으로 공강(월~금 08:00~21:00, 2시간 이상) 계산 → 요일당 1회, 요일 분산, 선호 시간대 우선으로 Push→Pull→Leg 순환 배정
- 결정: 종목은 **트레이너 고정 표**(AI 생성 아님), **로그인 필요 + 결과 저장**, 사진 원본 미저장
- 종목 표(`assets/routine-plan.js`의 EXERCISES, GOAL_SCHEMES)는 Claude가 만든 **초안** → 트레이너 검토 필요
- 선호도 조사 "기타" 항목: 사용자가 선택했지만 내용 미정 → 추가 질문 확인 필요
- 저장된 루틴은 불러올 때 수업+답변으로 다시 계산 (종목 표를 고치면 기존 학생 화면에도 반영)

## 멤버십 서비스 (2026-10-30 시작) — 그룹 PT 반 + 보강 + 게더링·등산 + 제휴 장소
기획: 사용자가 준 "FitinConnection 멤버십 예약 서비스" 명세. 작업 순서 ① 데이터 구조·화면 흐름 제안(승인됨) → ② 회원 예약 기능 → ③ 관리자 페이지

**결정 사항 (2026-10-30)**
- 기존 1:1 PT 예약(booking.html, pt_slots/bookings)은 **그대로 유지** — 멤버십과 같이 운영
- 결제: 계좌이체 + 관리자 입금 확인. 분할은 회차별 입금 확인. 1회차 입금 확인 시 멤버십 시작(트리거)
- 1개월권 80,000원 = **4주 · 주 2회 = 8회** / 3개월권 = 12주 (일시불 또는 3회 분할). **3개월권 가격: 189,000원(63,000원×3) → 2026-10-30 150,000원(50,000원×3)으로 변경** (`0017_three_month_price.sql`, 입금 대기 신청도 새 금액, 이미 입금 확인된 회원은 기존 금액 유지)
- 회원 정보는 기존 profiles 그대로 (추가 항목 없음)
- 언어: 한국어/영어 전환 지원
- 대기자 3명 이상 알림: 관리자 화면 알림(admin_alerts). 이메일은 6단계 때
- (2026-10-30 사용자 확인) 1개월 = 4주 × 주 2회 = 8회, 보강도 4주 주기마다 2회 / 게더링 = 달력 기준 매달 1회, **매달 마지막 주 금요일** 진행 (관리자 게더링 생성 시 기본 날짜로 쓸 것) / 입금 대기 신청도 반 자리를 차지 → **입금 안 하면 관리자가 취소** / 입금 계좌 Toss 1002-3847-1558 맞음 / 시작 주 = 이번 주(첫 수업 전에만) 또는 다음 주 월요일
- (2026-10-30 사용자 결정) **그룹 반 수업 시간에는 1:1 PT 예약 불가** — A반 월·목 19시, B반 화·금 19시 (`0016_block_pt_during_classes.sql`: 열린 일반 반 시간과 겹치는 1:1 칸 숨김 + 예약 거절, 휴강 주에는 다시 열림, C반을 열면 자동 반영, 기존 예약은 유지)
- 운영: 입금 확인 · 게더링·등산 올리기는 사용자(관리자)가 직접

**② 회원 예약 기능 — 구현 완료 (2026-10-30), SQL 실행 + 푸시 대기**
- `supabase/migrations/0015_membership.sql`: membership_plans, pt_classes(A 월·목 19, B 화·금 19, W 수 19 보강 전용, C 월·목 20:30 닫힘, 일반 반 최대 3개 열림 트리거), holiday_weeks, memberships, membership_payments, class_attendance, makeup_bookings, class_waitlist, admin_alerts, partner_places, crew_events, event_registrations, event_expenses, site_settings + RLS(본인만/관리자 전체, 회원 쓰기는 함수로만) + 회원 함수(membership_overview, create_membership, cancel_pending_membership, join_waitlist, leave_waitlist, my_membership, makeup_options, book_makeup, cancel_makeup, list_crew_events, register_event, cancel_event_registration, my_pt_sessions). 휴강 주만큼 만료일 자동 연장(membership_end_on). anon에 is_admin() 실행 권한 추가(공개 읽기 정책용)
- 화면: `membership.html`(소개·가치 비교·혜택·요금제·반별 남은 자리·성비·가입 흐름·대기 등록·입금 안내), `calendar.html`(내 PT·보강·휴강·게더링·등산·이벤트, 바로 신청/취소), `places.html`(제휴 장소, 비로그인 열람), `mypage.html`에 "내 멤버십"(`assets/my-membership.js`: 남은 PT·보강·만료일·다음 수업·보강 신청·이벤트 신청 내역·분할 결제 내역·입금 전 신청 취소), 공용 `assets/membership-ui.js`, `assets/membership.css`. 메인 메뉴에 "멤버십" 링크
- 테스트: PGlite로 SQL 시나리오 40여 개(정원·대기·알림·보강 4주 2회·휴강 연장·게더링 월 1회·권한), 가짜 데이터로 화면 8개 상태 + 클릭 4개 흐름
- 0015 SQL 실행 확인 (2026-10-30, membership_overview 응답 확인)
- **관리자 "멤버십 신청" 탭 먼저 추가 (2026-10-30, 사용자 요청)** — `assets/admin-memberships.js` + `admin.html` 탭: 회차별 입금 상태 변경(1회차 입금 확인 → 트리거가 이용 중으로), 입금 대기 신청 취소(자리 반납), 대기자 알림 확인. 관리자 RLS 정책으로 직접 수정
- (2026-10-30 사용자 결정) 수요일 19시(보강 전용)도 1:1 PT **항상 막기** / 게더링 기본 = 매달 마지막 주 금요일 **20:00** / 매출·이벤트 예산 20% = **멤버십 회비 입금만** / 제휴 장소 사진 = 지금은 **사진 주소 붙여넣기**, 업로드는 나중에
- **③ 관리자 페이지 — 구현 완료 (2026-10-30), SQL(0017·0018) 실행 + 푸시 대기**
  - `supabase/migrations/0018_admin_tools.sql`: slot_conflicts_class를 보강 전용 반까지 확장(수 19시 1:1 차단), admin_class_roster(출석 명단), admin_monthly_summary(월 매출·예산 20%·지출), admin_gender_stats(성비 전체·반별) — 모두 관리자 전용
  - `assets/admin-crew.js` + `admin.html` 탭 4개: **반·출석**(반 열기/닫기·정원, 날짜별 명단 출석/결석, 휴강 주 추가/삭제), **게더링·이벤트**(만들기·수정·모집중/마감/취소, 게더링 기본 마지막 주 금 20:00·정원 7, "조 추가" 복사, 신청자 명단), **제휴 장소**(추가·수정·공개/숨김·삭제, 사진 링크 미리보기, http(s)만 허용), **매출·통계**(6개월 매출·예산·지출·남은 예산, 지출 기록, 성비, 소개 페이지 성비 공개, 입금 계좌 변경)
- (2026-10-30 사용자 결정) **매달 마지막 주 금요일만 B반 수업 대신 게더링**, **보충 없음** (그 날이 들어간 4주는 B반 7회, 만료일 연장 없음) — `0019_b_class_gathering_friday.sql`: pt_classes.skip_last_friday(B반만 true), is_last_friday(), class_session_dates에서 그날을 "수업 없음"(is_holiday=true)으로 → 남은 회차·보강·캘린더 자동 반영, membership_overview에 표시값 추가. 화면: 소개 페이지 B반 안내, 캘린더 "수업 대신 게더링", 관리자 출석 탭 안내
- **SQL 실행 순서 주의**: 0017 → 0018 → 0019 실행 후 푸시 (관리자 반·출석 탭이 0019의 skip_last_friday 칸을 읽음)

## 사이트 정비 5가지 (2026-10-31 ~ 11-01)
- **개인정보처리방침·쿠키 정책**: `privacy.html`, `cookies.html` (한/영, `assets/legal.css`), `vercel.json`으로 `/privacy`·`/cookies` 주소 연결(그 두 주소만). 문의처 dlwotjr546112@gmail.com, 개인정보 보호책임자 fitin_운영자, 서버 Supabase 서울 리전(사용자 지정), 위탁·국외이전 Supabase/Vercel/Anthropic. 보관: 회원정보·예약·모임 기록 탈퇴 시 파기, **로그인 기록은 회원인 동안 보관·탈퇴 시 함께 파기(계정과 연결 안 된 기록은 1년)** (2026-11-01 사용자 결정 A안), 결제·입금 5년. 쿠키 미사용(localStorage: sb-…-auth-token, fitin-lang, fitin-view-mode)
- 모든 페이지 하단 링크: 메인은 기존 푸터에 직접, 나머지는 `assets/legal-footer.js` (개인정보처리방침·쿠키 정책·인스타그램)
- 회원가입 동의: "[필수] 개인정보 수집·이용 동의" + 수집 항목·목적·보유기간·거부 시 불이익 안내 + 방침 링크
- **회원가입 한/영**: `signup.html`·`assets/signup.js`를 기존 `assets/i18n.js` 구조로 전환(라벨·placeholder·버튼·오류 메시지·Supabase 서버 오류까지), 언어 유지
- **인스타그램**: https://www.instagram.com/fitinconnection_official/ , target=_blank rel="noopener noreferrer" (사이트 전체 1곳 + 공용 푸터)
- **로그인 후 이동** — 원인: ① 로그인 성공 시 무조건 mypage.html ② requireSession이 원래 주소를 안 넘김 ③ 메인이 처음 열릴 때만 로그인 확인(팝업 로그인 반영 안 됨) ④ 그래서 메인이 손님으로 판단해 모임 예약 시 로그인 페이지로 보냄. 수정: `assets/supabase-client.js`에 safeNext/currentPage/finishSignIn(같은 사이트 주소만 허용, 팝업이면 원래 창 이동 후 팝업 닫기), requireSession이 `login.html?next=원래주소`로, `login.html`은 이미 로그인 상태면 바로 이동, `assets/auth-navigation.js`·메인이 다른 창 로그인/로그아웃(storage 이벤트)과 창 포커스 시 재확인, 무효 세션이면 손님 화면
- **예약 후 이동**: 1:1 PT 예약 완료 → `calendar.html?date=날짜&booked=시간칸`으로 이동, 방금 예약 강조 + 안내. 캘린더에 1:1 PT(내 예약 + 다른 회원 예약 "예약됨"만, 이름 없음)와 필터 추가. 크루 정규모임은 그대로(사용자 결정)
- `supabase/migrations/0020_login_events_retention.sql` (2026-11-01 A안으로 다시 작성): login_events.user_id를 on delete cascade로 바꿔 계정 삭제 시 로그인 기록도 삭제, user_id 없는 기록만 1년 지나면 자동 삭제 — **Supabase 실행 필요**
- `supabase/migrations/0021_payment_records_retention.sql` (2026-11-01): 결제 기록 5년 보관을 DB에서 보장. 계정 삭제 시 membership_payments·bookings는 지우지 않고 user_id(·membership_id)만 비움(on delete set null), 결제 행에 plan_code 따로 저장, 탈퇴 회원의 미래 1:1 PT 예약은 자동 취소(시간 다시 열림), 회원 연결이 끊긴 결제 기록은 5년 뒤 자동 삭제. PGlite 테스트 통과(익명화·매출 유지·시간대 재오픈·5년 정리). 개인정보처리방침 결제 기록 행 문구도 "분리 보관 후 파기"로 수정 — **Supabase 실행 필요**
- **사용자 할 일**: 0020 → 0021 SQL 실행 (Supabase URL Configuration 새 도메인 추가는 2026-11-01 완료). GitHub 저장소 About → Website를 `https://www.fitinconnection.com`으로 변경
- 법적 불일치(결제 기록이 계정 삭제 시 함께 지워지던 문제)는 0021로 해결 — 단, 0021 실행 전까지는 결제 기록이 있는 계정을 직접 지우지 말 것
- 문서 정리: SETUP.md의 옛 주소(fitin-members.vercel.app, GitHub Pages) → www.fitinconnection.com / Vercel 자동 배포로 변경

## 남은 이슈 / 다음에 할 일
- **사용자가 해야 할 일 — 2026-10-15 실제 Supabase 조회로 확인한 상태**:
  - [x] 0001 (profiles.role 컬럼 존재), 0003 (gender 컬럼 존재), 0005 팀원 수정 (`is_admin()` 존재)
  - [x] 0006 선착순 예약 (`get_pt_taken_slots`, `pt_active_week_start` 동작), 0007 루틴 저장 (`routine_plans` 존재)
  - [x] Vercel `ANTHROPIC_API_KEY` — 기존 키 그대로 사용 (사용자 확인)
  - [ ] **0002 `login_events` 테이블 없음** → 로그인 기록이 안 쌓임 (로그인 자체는 정상). `0002_login_events.sql` 실행 필요
  - [ ] 확인 못 함: 0004 팀원 가입 트리거 복구, admin 지정, reset-password redirect URL, Vercel `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
  - [x] 루틴 추천 + 갤러리 틀(숨김)은 GitHub main에 올림 (2026-10-15). 예약은 위 5단계 결정 대기
- SQL 파일 번호: 팀원 0004·0005·0006과 겹치지 않게 루틴 저장은 `0007_routine_plans.sql` (Supabase에 이미 실행됨, 재실행 불필요)
- 팀원 변경(2026-10-15) 반영: 모든 페이지는 `assets/vendor/supabase-js.js`를 먼저 로드해야 함, 상단 로그인 메뉴는 `assets/auth-navigation.js` (data-auth-guest / data-auth-member) 공통 사용
- 4단계(회원정보 트래킹/관리자 회원 관리)부터 계속 진행

## 브랜드 디자인 리뉴얼 (2026-11-01) — FIC 엠블럼 기반
- 사용자 결정: 로고(차콜 바탕 · 골드 월계관 · 버건디 크라운 · FIC 블랙레터 · fitin connection 세리프) 기준으로 전체 분위기 변경, 기능은 그대로. **1단계의 "화이트/블랙/그레이만" 규칙을 이 결정이 대체함**
- 선택: 다크 차콜 + 샴페인 골드(추천안), 제목 클래식 세리프(영어 Cormorant Garamond, 한글 Noto Serif KR), 본문·버튼·표는 Pretendard, 헤더 로고만 새 엠블럼으로 교체
- 토큰: 바탕 #131418 / 카드 #1b1c21 / 글자 #ece6d8 / 골드 #c9a54e(--color-accent, --gold-sheen) / 버건디 #8e2430(--color-accent-2, 포인트 전용) / 구분선 골드 20%
- 파일: `_ds/.../styles.css`(토큰·버튼), `Fitin Main.dc.html`(홈 꾸밈), `assets/logo.png`(엠블럼 원형 크롭 256px), 각 페이지 헤더 로고 원형+골드 링, 활성 탭·선택 상태 골드, 오류/성공 글자색 밝게(#f0868b / #7cc99a)
- 확인: 메인(PC·390px 한/영), 로그인·회원가입·예약·일정·멤버십·루틴·제휴 장소·개인정보처리방침 화면 캡처 확인

## 학생증 확인 후 가입 승인 (2026-11-01)
- 목적: IGC 학생만, 한 사람 한 계정 (다른 이메일로 중복 계정 방지)
- 사용자 결정(모두 추천안): 기존 회원 자동 승인 / 학번 입력받아 같은 학교+학번 중복 자동 차단 / 학생증 사진은 승인·거절 즉시 삭제 / 관리자 페이지 탭에 대기 수 표시(이메일 알림 없음)
- 흐름: 회원가입(학번+학생증 사진) → 확인 대기(verify.html) → 관리자 "가입 승인" 탭에서 사진 보고 승인/거절(사유) → 승인되면 이용. 거절되면 사유 보고 다시 제출
- `supabase/migrations/0023_student_id_verification.sql` — **Supabase 실행 필요**
  - profiles: student_no, verify_status(none/pending/approved/rejected), verify_note, verify_submitted_at, verified_at, verified_by, id_card_path. 실행 전 가입자는 approved
  - 같은 학교+학번 유니크(거절 제외), 학번은 공백·하이픈 제거 후 대문자로 저장
  - 회원은 확인 상태·학번을 직접 못 바꿈(트리거), 제출은 submit_student_id 함수로만
  - 비공개 저장소 student-ids: 회원은 제출 전/거절 후에만 자기 폴더에 올리기(실패 시 정리용 읽기·지우기), 관리자만 보기·지우기
  - admin_review_verification: 그 회원 사진이 저장소에 남아 있으면 실행 거부 → 사진 삭제를 빠뜨릴 수 없음
  - 승인 전 회원은 bookings·memberships·meetups·meetup_members·event_registrations·makeup_bookings·class_waitlist·routine_plans 신청이 DB에서 막힘(require_verified_member 트리거)
- 화면: `signup.html`·`assets/signup.js`(학번·사진, 동의 문구), `verify.html`(신규, 대기/거절/제출), `assets/student-id.js`(신규, 사진 1600px JPEG로 줄여 올림 — 위치정보 제거), `assets/admin-verify.js`(신규)·`admin.html`(가입 승인 탭), `assets/supabase-client.js`(getVerification·afterSignIn, requireSession이 미승인 회원을 verify.html로), `login.html`(로그인 후 미승인이면 verify.html), `Fitin Main.dc.html`(미승인 회원에게 안내 띠), `privacy.html`(학번·학생증 사진 항목/목적/보유기간)
- 테스트: PGlite 38개 시나리오(자동 승인·자기 승인 차단·미승인 신청 차단·중복 학번·사진 경로 검사·사진 남으면 승인 불가·거절 후 재제출 등), 가짜 Supabase로 화면(회원가입·대기·거절·제출(EN)·관리자 탭·메인 안내 띠) 확인
- 한계: 확인 대기 중에 계정을 지우면 그 사진은 저장소에 남음 → Supabase Storage에서 직접 삭제. 남이 먼저 내 학번으로 가입하면 관리자가 그 계정을 거절해야 진짜 학생이 가입 가능
