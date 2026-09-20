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
(0단계 질문 답변 후 기록 예정)

## 단계별 상태
- [~] 0단계 — 진행 중 (현황 파악 완료, 질문 답변 대기)
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
- 0단계 질문 7개에 대한 답변 수집
- 답변 확정 후 1단계(디자인 화이트/블랙/그레이 전환)부터 순서대로 진행
- 이후 DB 변경분부터는 `supabase/schema.sql` 한 파일이 아니라 `supabase/migrations/NNN_설명.sql` 형태로 분리 저장
