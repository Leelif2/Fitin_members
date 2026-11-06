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
- [x] 4단계 회원정보 트래킹 (관리자 회원 관리) — 완료 (2026-11-06), **0031 SQL 실행 필요** (아래 "4단계" 절)
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
- [x] 6단계 관리자 알림 — 구현 (2026-11-06), **0032 SQL 실행 + Resend 가입·Vercel 환경변수 등록 필요** (아래 "6단계" 절)
- [x] 7단계 관리자 예약 취소 + 시간대 차단 — 완료 (2026-11-06), **0033 SQL 실행 필요**
- [x] 8단계 회원 알림(알림함 + 이메일) — 완료 (2026-11-06), **0034 SQL 실행 + Resend 도메인 인증 필요(이메일만)**
- [x] 9단계 최종 점검 — 완료 (2026-11-06), 아래 "9단계" 절

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
- [x] D. 실시간 접속자 수 — 완료 (2026-11-04, 0025, 아래 "닉네임 + 실시간 접속 표시" 절 — DB가 직접 세는 방식)
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

## 닉네임 + 실시간 접속 표시 (2026-11-04)
- 사용자 결정(모두 추천안): 닉네임은 회원이 직접 정함 / 로그인 안 한 방문자에게는 접속자 수만 / 이 기능을 회원 시간표 관리자 기능보다 먼저
- 메인 "실시간 모임"의 예시 숫자(12명, J·M·S·A)를 실제 접속자로 교체. 기준은 메인 페이지를 열어 둔 사람
  - 승인 회원: "지금 N명 접속 중" + 닉네임 첫 글자 동그라미(최대 5, 나머지 +N) → 누르면 접속자 닉네임 목록, 밥·스터디·운동 탭 옆에 보고 있는 사람 수, "밥 2명 · 운동 3명을 보고 있어요"
  - 방문자: "지금 N명 접속 중" 숫자만 (SDK는 첫 화면 후 1.2초 뒤에 불러옴)
  - 닉네임 없는 회원은 메인에서 "닉네임을 정해 주세요" 창이 뜸(나중에 가능)
- `supabase/migrations/0025_nickname_and_presence.sql` — **Supabase 실행 필요**
  - profiles: nickname(2~12자 한글·영문·숫자·_, 대소문자 무시 유니크), show_presence(기본 true)
  - handle_new_user: 가입 메타데이터의 닉네임 저장(이미 쓰이면 비워 두고 가입 진행)
  - 함수: nickname_available(가입 화면용, 방문자도), my_live_profile, set_my_live_profile, is_live_member
  - **접속자 수는 DB가 직접 셈 (2026-11-04 사용자 요청: 숫자 조작 방지)** — live_presence 표(승인 계정 1개 = 1행, 기본키 user_id, 직접 읽기·쓰기 불가)
    - live_ping(보고 있는 탭): 화면이 25초마다 호출(화면을 보고 있을 때만), 10초 안 같은 내용은 무시. 70초 넘게 소식 없으면 접속 끝
    - live_leave: 페이지 닫을 때(keepalive) / 로그아웃 때
    - live_online_count(누구나, 숫자만) / live_snapshot(승인 회원만: 수·탭별 수·숨긴 수·닉네임 목록, 회원 id 없음)
    - 들어옴·나감·탭 바꿈 때만 DB가 비공개 채널 'fitin-live'로 내용 없는 "changed" 신호(realtime.send) → 화면이 live_snapshot 다시 읽음. 회원은 채널로 보낼 수 없음(realtime.messages RLS: 승인 회원 읽기만)
    - 예전 방식(브라우저끼리 Presence, 공개 채널 'fitin-online', live_nicknames)은 없앰
- 화면: `assets/presence.js`(신규), `assets/supabase-client.js`(SUPABASE_PUBLIC 내보내기), `Fitin Main.dc.html`(실시간 표시·접속자 목록·닉네임 창), `signup.html`·`assets/signup.js`(닉네임 칸·중복 확인·동의 문구), `mypage.html`(닉네임·접속 중 표시 켜기/끄기), `privacy.html`(수집 항목·이용 목적)
- 테스트: PGlite 36개 시나리오(닉네임 중복·형식, 미승인·방문자 ping 차단, 표 직접 접근 차단, 50번 연속 ping해도 1행·신호 0, 탭 변경·나가기 신호, 70초 지나면 빠짐, 숨긴 회원은 수만, 채널 보내기 차단), 가짜 Supabase로 화면(회원 KO·접속자 목록 EN·닉네임 창·방문자·회원가입·마이페이지) 확인
- 한계: 숫자를 늘리려면 실제 승인 계정(학생증 승인)이 필요 — 계정 1개당 1명. 탭을 닫으면 바로, 휴대폰을 잠그거나 다른 앱으로 가면 최대 70초 뒤 빠짐. 방문자 숫자는 30초마다 새로 고침

## 회원 시간표 관리자 보기 + 알림 (2026-11-04)
- 사용자 결정(추천안 위주): 알림은 관리자 페이지에만 / 사진 원본은 저장 안 함, 읽은 시간표만 / 운동 팀 편성용 "겹치는 공강" 보기 추가
- 흐름: 회원이 루틴 페이지에서 시간표 사진 올림 → 수업 확인·수정 → "루틴 만들기"(routine_plans 저장) → 관리자 알림 → 관리자 "회원 시간표" 탭
- `supabase/migrations/0026_timetable_admin_alerts.sql` — **Supabase 실행 필요**
  - admin_alerts.member_user_id 추가, kind='timetable' 미확인 알림은 회원당 1건(부분 유니크). 다시 올리면 시각·문구만 갱신
  - routine_plans 저장 트리거 → 알림 (알림 실패해도 루틴 저장은 됨)
  - admin_member_timetables(관리자만: 회원별 최신 시간표·올린 횟수·새 알림 여부), admin_resolve_timetable_alert(관리자만)
- 화면: `assets/admin-timetables.js`(신규) · `admin.html`("새 시간표 N건" 배너, "회원 시간표 (새 N)" 탭, 1분마다 새로 고침)
  - 회원별: 월~금 08:00~21:00 주간 표(수업 회색 / 2시간 이상 공강 골드, 과목 이름), 추천 루틴, "확인했어요"
  - 겹치는 공강: 학교 필터·회원 고르기, 30분 칸마다 비어 있는 회원 수(진하기), 칸 누르면 가능한/수업 중 회원 이름, "2시간 이상 공강만 세기" 선택
- `routine.html`·`privacy.html`: 루틴을 만들면 운영자가 팀 편성·운동 일정 안내를 위해 수업 시간표를 볼 수 있다는 안내 추가
- 테스트: PGlite 13개(알림 생성·1건으로 묶기·확인 후 새 알림·미승인 저장 차단·회원은 목록/확인/알림 읽기 불가), 가짜 데이터로 관리자 화면(회원별 KO·겹치는 공강+칸 선택 EN·폰 390px) 확인
- 한계: 알림은 관리자 페이지를 열어야 보임(휴대폰 알림 없음). 회원이 "루틴 만들기"를 눌러야 저장·알림됨(사진만 올리고 나가면 없음). 이 기능 전에 저장된 시간표는 목록에는 나오지만 알림은 없음

## 버그 수정: 메인 "Fitin Main: Failed to execute 'removeChild'" 오류 (2026-11-06)
- 원인: 메인 페이지 스크립트가 화면 엔진(support.js)이 마크업을 복사하기 전(DOMContentLoaded 전)에 EN/KO·화면 버튼을 넣는 경우가 있었음 → 엔진(React)이 그 버튼을 자기 것으로 알고 있다가, 버튼을 다시 넣는 코드가 바꿔 버린 뒤 업데이트하면서 오류. 가끔만 생김(실제 사이트 재현 1/6)
- 수정: `Fitin Main.dc.html` 첫 버튼 넣기를 엔진이 페이지를 넘겨받은 뒤(DOMContentLoaded 다음)로 미룸. 헤더 로고 링크를 "#" → 메인 페이지로
- 확인: 실제 데이터로 18번 불러오기(한/영, 로그인/비로그인, 언어 바꾸기·로고 클릭 반복) 오류 0건, 버튼·번역 정상

## 버그 수정: 메인 닉네임 입력칸에 글자가 안 써짐 (2026-11-06)
- 원인: 메인 템플릿의 입력칸이 value만 묶여 있고 onChange가 없어서 React가 입력을 바로 되돌림(읽기 전용처럼 동작). 모임 열기 창의 날짜·시간 칸도 같은 문제
- 수정: `Fitin Main.dc.html` 닉네임 칸 onChange → nickAsk.value 저장, 날짜·시간 칸 onChange → form.date/time 저장. 접속 표시 버튼도 상태 기준으로
- 확인: 실제 키보드 입력과 같은 방식(insertText)으로 입력 → 예전 코드는 바로 빈칸, 수정 후 입력 유지·저장 후 창 닫힘·중복 닉네임 안내·형식 오류 안내 정상
- 참고: 템플릿에서 입력칸에 value="{{ }}"를 쓰면 반드시 onChange도 함께 달 것

## 비속어·부적절한 닉네임 막기 (2026-11-06)
- `supabase/migrations/0027_nickname_banned_words.sql` — **Supabase 실행 필요**
  - banned_nickname_words 표(관리자만): 한국어 욕설·성적·혐오, 영어 욕설·성적·혐오, 운영자 사칭(admin·관리자·운영자·fitin·핏인·official 등) 약 100개. SQL 한 줄로 더하기/빼기(파일 맨 아래 예시)
  - nickname_is_banned: 금지어가 "들어 있으면" 막음. 대소문자·밑줄 무시, 숫자 끼워 넣기(시1발), 흔한 바꿔 쓰기(sh1t, fvck) 잡음
  - DB 트리거로 어떤 경로든 차단(nickname_banned), set_my_live_profile·가입 트리거·nickname_available도 반영, 가입 화면용 nickname_check(ok/invalid/banned/taken)
  - 이미 쓰이던 금지어 닉네임은 비움 → 메인에서 다시 정하게 됨
  - 오탐 줄이려고 뺀 단어: 호로(호로록), 성기(성기훈), rape(grape), 졸라
- 화면: 닉네임 정하는 곳(가입·메인 창·마이페이지)에 "욕설·비속어, 성적·혐오 표현, 운영자 사칭 닉네임은 쓸 수 없어요" 안내, 금지어면 "사용할 수 없는 단어가 들어 있어요" 오류
- 테스트: PGlite 막힘 16개·허용 12개(호로록·성기훈·grape·시바견·classic·assist 등)·직접 수정 우회 차단·가입 시 비움·회원은 목록 못 봄, 화면(메인 창 안내·금지어 오류·가입 안내) 확인
- 한계: 목록에 없는 새 표현·띄어 쓴 변형은 못 잡을 수 있음 → 발견하면 표에 추가

## 모임 날짜 범위: 7일 → 이번 주 + 다음 주 (2026-11-06)
- 원인: 모임 열기 날짜가 화면·DB 모두 "지금부터 7일 이내"로 제한 → 다음 주 후반 모임을 열 수 없었음 (그 전에는 날짜 칸 입력 자체도 안 됐음 — 386a24a에서 수정)
- `supabase/migrations/0028_meetup_two_week_window.sql` — **Supabase 실행 필요**: meetup_window_end() = 다음 주 일요일 끝(한국 시간), meetups_before_insert가 이 기준으로 bad_time
- `Fitin Main.dc.html`: 날짜 고르기 최대값·확인을 meetupLastDay()(다음 주 일요일)로, 안내 문구 "지금부터 다음 주 일요일까지"
- 테스트: PGlite(1시간 뒤·8일 뒤·다음 주 일요일 23:59 가능, 다다음 주 월요일·과거 막힘), 날짜 계산(금→다음 주 일요일, 일요일 밤→다음 주 일요일, 월→다다음 주 일요일)

## 멤버십 가격 변경 + 얼리버드 + 영어 달러 표시 (2026-11-06)
- 사용자 결정: 일반 PT 비교 1회 5~10만 원 / 1개월권 80,000원, 2개월권 110,000원(새로, 8주), 3개월권 140,000원 / 분할 결제 없앰(모두 일시불) / 얼리버드 선착순 10명은 모든 요금제 30,000원 할인(50,000·80,000·110,000원), 신청 순서로 자리, 입금 전 취소되면 반납, 1인 1회 / 영어는 달러+원화, 환율 고정 $1=₩1,400
- `supabase/migrations/0029_membership_prices_early_bird.sql` — **Supabase 실행 필요**: 요금제 가격·2개월권, site_settings.early_bird {seats:10, discount:30000}, memberships.early_bird, create_membership에서 할인(잠금으로 동시 신청에도 10명 초과 안 됨), membership_overview에 early_bird(seats_left·used)
- 화면: `membership.html`(비교 카드·얼리버드 띠·정가 취소선·할인가·신청 요약), `assets/membership-ui.js`(usd, wonPair 영어=달러+원화), `assets/my-membership.js`(결제 금액 달러+원화)
- 테스트: PGlite(10명 할인·11번째 정가·분할 거부·취소 시 자리 반납·다음 사람 할인), 화면(한/영 비교 카드·요금제·신청 폼)
- 그대로 둔 것: 이미 들어온 신청 금액, 관리자 화면(원화), PT 예약 예약금 표시(KRW 10,000)
- (추가) 가격 강조: 비교 카드·요금제 카드에 "정가 한 달 8만 원"(취소선, 크게) → 골드 "얼리버드 · 선착순 10명만 · 남은 N명" 배지 → 골드 할인가. 얼리버드가 끝나면 정가만 보임

## 메인 카드 정리: Eat → 식단 상담 설문, Study 없앰 (2026-11-06)
- 사용자 결정: 첫 화면 카드는 Eat·Workout 둘만 / Eat은 트레이너 식단 컨설팅 유도 설문 / 설문은 승인 회원만 / 받는 곳은 관리자 페이지 탭+알림 / 연락은 인스타그램 DM / 스터디 모임도 없앰 (Workout은 그대로)
- `supabase/migrations/0030_diet_consult.sql` — **Supabase 실행 필요**
  - diet_consults(목표, 하루 식사 횟수, 학식 빈도, 하루 식비, 못 먹는 음식+건강정보 동의, 인스타 아이디, 남긴 말, 상태 new/contacted/done, 관리자 메모). 회원은 본인 것만 읽기, 쓰기는 submit_diet_consult로만
  - 답 기다리는 중 다시 보내면 같은 행을 고침, 관리자 알림(kind=diet) 회원당 1건, 연락함/완료로 바꾸면 알림 닫힘
  - admin_diet_consults / admin_update_diet_consult (관리자만)
  - meetups_before_insert: category가 meal·workout이 아니면 bad_category (이미 열린 스터디 모임은 그대로)
- 화면: `diet.html`(신규 설문, 보낸 뒤 "접수됐어요"·내용 고치기), `assets/admin-diet.js`(신규)·`admin.html`("새 식단 상담 N건" 배너, "식단 상담 (새 N)" 탭, DM 보내기 버튼 ig.me/m/아이디, 상태·메모), `Fitin Main.dc.html`(카드 2개, Eat → diet.html "식단 상담 받기", 스터디 탭·모임 열기 선택지 없앰), `privacy.html`(식단 상담 항목·목적·보유기간)
- 테스트: PGlite(미승인·방문자 차단, 인스타 형식, 알레르기 동의 필수, 다시 보내면 1건 유지·알림 문구 갱신, 회원 직접 쓰기·상태 변경 불가, 관리자 목록·연락함 처리 시 알림 닫힘, 스터디 모임 차단·밥 모임 가능), 화면(메인 카드·설문·관리자 탭·실시간 모임 탭)

## 4단계 회원정보 트래킹 — 관리자 회원 관리 + 회원 탈퇴 (2026-11-06)
- 사용자 결정: 회원이 마이페이지에서 직접 바로 탈퇴(추천) / 이용 중 멤버십이 있어도 탈퇴 허용(남은 기간·예약은 환불 없음 동의 체크) / 연락처는 전화번호 없이 이메일·인스타(식단 상담에 남긴 것)만
- `supabase/migrations/0031_member_admin_and_withdrawal.sql` — **Supabase 실행 필요**
  - member_notes(관리자만 읽기·쓰기, 쓴 사람 자동 기록)
  - admin_member_list: 이름·닉네임·이메일·학교·학번·학생증 상태·가입일·마지막 로그인·PT 예약 수(취소 제외)·최근 멤버십·인스타
  - admin_member_detail: 가입 정보 + 최근 로그인 30 + PT 예약 50 + 멤버십·결제(얼리버드 표시) + 식단 상담 + 시간표 올린 날 + 메모
  - my_withdrawal_info: 탈퇴 전 경고용(이용 중/입금 대기 멤버십, 예정 예약 수, 관리자 여부)
- `api/delete-account.js`(신규, service_role 키는 서버에서만): 로그인 토큰으로 본인 확인 → 관리자 계정은 거부 → 확인 대기 중 학생증 사진 삭제 → auth 계정 삭제. 연결 데이터는 on delete 규칙대로 함께 삭제, 입금된 결제 기록만 0021 규칙으로 이름 없이 5년 보관
- 화면: `assets/admin-members.js`(신규)·`admin.html` 회원 관리 탭(검색: 이름·닉네임·이메일·학번·인스타, 학교 필터, 정렬: 가입·로그인·예약·이름, 행을 누르면 상세+메모 추가·삭제. 옛 표 코드 삭제), `mypage.html`("회원 탈퇴" 접힘 칸: 삭제되는 것 안내, 경고, "탈퇴" 입력 + 필요 시 환불 없음 동의 → 탈퇴 후 로그아웃·홈), `privacy.html`(마이페이지에서 바로 탈퇴 안내)
- 테스트: PGlite(회원은 목록·상세·메모 접근 불가, 관리자 목록·상세 값, 메모 작성자 자동, 탈퇴 정보, 계정 삭제 시 프로필·예약·멤버십·식단·메모·로그인 기록 삭제 + 입금된 결제만 익명 보관), 서버 함수 8가지(방법·확인문구·토큰·관리자 거부·사진 정리·삭제 실패), 화면(회원 목록·상세·마이페이지 탈퇴)
- 한계: 내 정보 수정은 기존 마이페이지(이름·학교·성별·닉네임·접속 표시). 관리자 계정 탈퇴는 Supabase 대시보드에서

## 6단계 관리자 알림 (2026-11-06)
- 사용자 결정: 채널 = 이메일(Resend) + 관리자 페이지 / 대상 = 새 PT 예약, PT 예약 취소, 멤버십 신청, 식단 상담, 학생증 제출
- 방식(대시보드 웹훅 대신): DB 트리거 → pg_net `net.http_post`로 `/api/notify-admin`에 {kind, id}만 보냄 → 서버가 service_role로 DB를 다시 읽어 메일 작성·발송 → notification_logs 기록. 받은 값은 믿지 않고, 10분 안에 생긴 일만, 이벤트당 1번(유니크) → 주소를 아무나 불러도 가짜·중복 메일 없음. 비밀값 불필요
- `supabase/migrations/0032_admin_notifications.sql` — **Supabase 실행 필요**: pg_net 확장, notification_logs(관리자만 읽기), site_settings.notify_url, 트리거(bookings insert/cancelled_at, memberships insert, diet_consults insert(다시 보내기는 알림 없음), profiles verify_status→pending). 트리거는 실패를 무시 → 알림이 고장나도 예약·신청은 저장
- `api/notify-admin.js`(신규): 메일 내용 = 회원 이름·닉네임·학교·이메일·인스타, 예약 시간·예약금 / 요금제·반·시작일·금액 / 식단 답변 + DM 링크 / 학번 + 관리자 페이지 링크. 환경변수 RESEND_API_KEY, ADMIN_NOTIFY_EMAIL, (선택) NOTIFY_FROM
- 관리자 페이지: `assets/admin-notify.js`(신규) — 최근 7일 알림 실패가 있으면 배너, 펼치면 최근 알림 기록과 실패 원인
- `privacy.html`: 처리 위탁에 Resend 추가
- 테스트: PGlite(5종 트리거 호출, 식단 다시 보내기는 호출 없음, 회원은 기록 읽기·쓰기 불가, 알림 서버 고장이어도 예약 저장), 서버 함수 9가지(잘못된 종류, 새 예약 메일 내용, 같은 일 두 번 → 1통, 오래된 일·없는 일 건너뜀, 취소 메일, 키 없음·Resend 오류 → 실패 기록), 관리자 페이지 오류 없음
- 한계: 기본 발신 주소(onboarding@resend.dev)는 Resend에 가입한 이메일로만 보낼 수 있음 → 받는 주소 = Resend 가입 이메일. 회원에게 보내는 8단계 메일은 fitinconnection.com 도메인 인증 필요

## 7단계 관리자 예약 취소 + 시간대 차단 (2026-11-06)
- 사용자 결정: 선착순 즉시 확정 유지(10/15 결정 그대로) + 관리자 취소. 관리자 Confirm 단계는 만들지 않음
- 중복 확정 방지는 0014의 부분 유니크 인덱스(bookings_one_active_per_slot, 취소 안 된 예약 1개)가 DB에서 보장 — 동시에 눌러도 1명만
- `supabase/migrations/0033_admin_cancel_booking.sql` — **Supabase 실행 필요**: bookings.cancelled_by(member/admin)·cancel_reason, 취소자 자동 기록 트리거, admin_cancel_booking(사유 필수, 최대 200자)
- `admin.html` PT 예약 현황: "관리" 칸 → 예약 취소(사유 입력) → 그 시간 다시 열림, 상태 칸에 회원/관리자 취소 + 사유. 관리자가 직접 취소한 건은 관리자 메일 생략
- 확정된 시간대는 예약 화면에서 "예약 불가"로만 보이고 다른 회원 정보는 노출 안 됨(기존 pt_slots_public.is_booked)

## 8단계 회원 알림 — 사이트 알림함 + 이메일 (2026-11-06)
- 사용자 결정: 대상 = PT 예약 확정(예약 즉시), 관리자 취소(사유), 멤버십 입금 확인(이용 시작), 학생증 승인·거절(사유) / 채널 = 이메일 + 알림함 / 장소·준비물 = IGC 체육관(헬스장) · 운동복, 실내 운동화, 물, 수건 (site_settings.pt_info로 변경 가능)
- `supabase/migrations/0034_member_notifications.sql` — **Supabase 실행 필요**: notifications(본인만 읽기, 쓰기는 DB 트리거만, 같은 일 1번), mark_my_notifications_read, supabase_realtime 등록, 트리거 4종(예약·취소·멤버십 active·학생증 결과) → 알림함 작성 + 서버 호출(member_*)
- `api/notify-admin.js`: member_* 이벤트는 알림함 글을 그대로 한/영 메일로 회원에게(channel email_member, 발신 MEMBER_FROM 기본 noreply@fitinconnection.com)
- 화면: `assets/inbox.js`(신규) — 마이페이지 "알림함"(최근 30개, 열면 읽음, 새 알림 실시간), 메인 헤더 종 아이콘 + 안 읽은 수(실시간)
- 이메일은 Resend에서 fitinconnection.com 도메인 인증 후 발송됨. 인증 전엔 알림함만 동작하고 메일은 notification_logs에 실패로 기록(관리자 페이지 배너)
- `privacy.html`: Resend 위탁 범위(회원 알림), 알림함 보유 기간

## 9단계 최종 점검 (2026-11-06)
- 보안 점검
  - RLS: 스키마·마이그레이션의 public 표 29개 모두 enable row level security 확인 (정책은 "본인만 / 관리자 전체", 쓰기 민감한 곳은 security definer 함수로만)
  - 비밀키: 브라우저 코드에는 anon 키(role=anon)만. service_role·Resend 키는 api/*.js에서 process.env로만 읽음, Git에 없음, .gitignore에 .env
  - 관리자 경로: admin.html·admin-login-events.html은 화면에서 role 확인 + 모든 관리자 데이터는 is_admin() 검사 함수/RLS로 서버에서 막힘(비로그인 호출 시 permission denied / admin_only 확인)
  - 입력값: 닉네임 형식·금지어, 학번 형식·중복, 인스타 아이디 형식, 메모·사유 길이, 모임 시간·인원, 식단 동의 등 DB 제약/함수에서 검사
- 마이그레이션 재실행 점검: 빈 DB에 schema.sql + 0001~0034(35개)를 순서대로 두 번씩 실행 → 실패 0
- 시나리오 22개 모두 통과 (가입→학번 중복 차단→금지어 닉네임→승인 전 예약 차단→학생증 제출·승인→예약 확정→같은 시간 중복 차단→타인 데이터 차단→관리자 함수 차단→관리자 알림 호출→알림함 확정→관리자 취소·사유 알림→시간대 다시 열림→알림 실패해도 신청 저장→얼리버드 금액→탈퇴 시 개인정보 삭제·결제 익명 보관→방문자 접속자 수만)
- 배포 후 확인 체크리스트(사용자): 아래 "배포 체크리스트"
- 남은 개선 아이디어(우선순위): 1) PT 하루 전 리마인드 알림(cron) 2) 예약금 입금 확인 자동화/결제 연동 3) 구글 캘린더 내보내기(ics) 4) 관리자 알림 텔레그램 추가 5) 학생증 대기 중 계정 삭제 시 사진 자동 정리 6) 출석 체크 QR

### 배포 체크리스트
1. Supabase SQL: 0033, 0034 실행 (0001~0032는 실행 완료)
2. Vercel 환경변수(Production): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY, RESEND_API_KEY, ADMIN_NOTIFY_EMAIL (+ 도메인 인증 후 선택 MEMBER_FROM / NOTIFY_FROM) → Redeploy
3. Resend 도메인 인증(fitinconnection.com, Cloudflare DNS 레코드, 프록시 끔) → 회원 메일 발송
4. 확인: 테스트 계정으로 가입·학생증 → 관리자 승인 → 예약(관리자 메일 + 회원 알림함/메일) → 관리자 취소(사유) → 마이페이지 알림함·탈퇴

## 입금 안내를 인스타그램 DM으로 (2026-11-06 사용자 결정)
- 계좌번호를 사이트·DB에서 없앰. 예약금·회비는 회원이 인스타그램 @fitinconnection_official 로 DM → 운영자가 계좌·입금 방법을 직접 안내
- `supabase/migrations/0035_payment_via_instagram_dm.sql` — **Supabase 실행 필요**: site_settings.bank_account 삭제(my_membership의 계좌도 비게 됨), PT 확정 알림 문구에 DM 안내 추가. 0015의 계좌 기본값 줄도 삭제(다시 실행해도 안 생기게)
- 화면: `booking.html`(예약 창 "입금 방법" → DM 링크), `membership.html`(신청 요약·신청 후 안내·입금 대기 카드에 금액 + DM 버튼), `assets/my-membership.js`(결제 내역 아래 DM 안내), `assets/membership-ui.js`(PAY_DM_URL·payDmBox 공용), `assets/admin-crew.js`(입금 계좌 설정 칸 삭제, 안내 문구로 대체), `privacy.html`(DM 안내 문구)
- 참고: 예전 커밋 기록(Git 히스토리)에는 계좌번호가 남아 있음

## 색 리뉴얼: 미드나이트 블랙 · 퓨어 화이트 · 라임 그린 (2026-11-07)
- 사용자 요청: 레퍼런스(검은 바탕 + 세리프 제목 + 라임 이탤릭 강조 + 옅은 라임 빛)처럼 세 가지 색만. **2026-11-01 골드 리뉴얼 색을 대체** (구조·기능은 그대로)
- 사용자 결정: 로고는 원래 골드 엠블럼 그대로(테두리만 라임) / 제목 세리프 유지 + 두 번째 줄 라임 이탤릭 / 라이트 모드 유지(화이트 바탕 + 블랙 글씨)
- `_ds/.../styles.css` 토큰: 바탕 #0B0B0C, 카드 #141416, 글자 #FFFFFF, 강조 #C6F432, 버건디(accent-2)는 회색으로, 새 토큰 --color-on-accent(라임 면 위 글자 = 블랙), --accent-fill-hover/active, --accent-glow. --gold-sheen 이름은 그대로 두고 라임 면으로
  - 라이트 모드: 바탕 #FFFFFF, 글자 #0B0B0C, 라임 면(버튼)은 그대로 밝게, 글자·선으로 쓰는 라임은 진하게(#4f6d00)
- 페이지: 라임 면 위 글자 블랙으로(멤버십·가입·캘린더·루틴·메인·관리자 시간표·언어 버튼), 메인 카드 아이콘 바탕을 토큰 기반으로, 실시간 점 라임, 메인 위쪽 라임 빛, 제목 둘째 줄 이탤릭, 알림 메일 버튼 라임
- 확인: 메인(PC·폰, 비로그인·회원), 멤버십(다크·라이트), 메인 라이트 화면 캡처

## 식단 상담 = 멤버십 회원 전용 + 얼리버드 가입 유도 (2026-11-07)
- 사용자 결정: 식단 상담은 멤버십 구매한 사람만. 지금은 얼리버드 이벤트 중이니 보내기를 누르면 멤버십 가입으로 유도
- 전략: 설문을 먼저 다 쓰게 하고(시간을 들인 뒤) 보내기에서 안내 → 답변은 기기에 임시 저장해 두고 "가입 후 다시 와서 보내기만 하면 돼요"로 이탈을 줄임. 얼리버드 남은 자리·정가 취소선·혜택 목록·"얼리버드로 멤버 되기" 버튼(membership.html#join). 자리가 다 차면 정가 안내로 자동 전환
- `supabase/migrations/0036_diet_consult_members_only.sql` — **Supabase 실행 필요**: diet_access()(ok / membership_pending / membership_required — 이용 중(입금 확인) 멤버십만 ok, 관리자 예외), submit_diet_consult가 이 검사를 먼저 함(0030과 나머지 동일)
- 화면: `diet.html`("핏인 멤버 전용 혜택" 표시, 보내기 전 확인 → 안내 카드 / 입금 전이면 DM 안내, 임시 저장·복원), `membership.html`(혜택에 "1:1 식단 상담 (멤버 전용)" 추가)
- 테스트: 전체 시나리오 29개 통과(멤버십 없음 차단·입금 전 대기·입금 확인 후 가능·관리자 예외), 화면(설문 작성 → 보내기 → 얼리버드 안내 카드)
