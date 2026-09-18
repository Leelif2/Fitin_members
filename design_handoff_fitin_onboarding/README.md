# Handoff: Fitin — 온보딩 메인 페이지 (Onboarding Main)

Target repo: `github.com/Leelif2/Fitin_members` (branch `main`, currently contains only `README.md`).

## Overview

Fitin is a fitness scheduling service for students at four international campuses at Incheon Global Campus: University of Utah Asia Campus, George Mason University Korea, SUNY Korea, Ghent University Global Campus.

Students upload their class timetable; the service finds every free block of **2 hours or more** and fills it with a workout routine matched to their level (Beginner / Intermediate / Advanced, 3–5 sessions a week). A Fitin admin releases PT booking slots **every Sunday 21:00 KST**. After each PT session, a weekly feedback Google Form is sent automatically to the students who attended.

This handoff covers the **onboarding main page (landing)** only. Other screens (timetable upload, weekly calendar, admin console) are not designed yet.

## About the Design Files

`design/Fitin Main.dc.html` is a **design reference created in HTML** — a prototype showing intended look and behavior. It is not production code to copy. The task is to **recreate this design in the target codebase's environment**, using that codebase's patterns and libraries. `Fitin_members` has no app code yet, so pick the stack (Next.js + TypeScript is a sensible default for this project — server routes are needed for the Sunday-21:00 job and the form dispatch) and implement the design there.

The HTML prototype uses a small in-browser component runtime (`support.js`) — ignore it. What matters is the markup structure, the inline styles, and the logic class at the bottom of the file (state, slot data, level plans, countdown math). Read those directly.

## Fidelity

**High-fidelity.** Final colors, typography, spacing and interactions. Recreate it pixel-accurately, but source every color/space/radius value from the design-system tokens in `design/_ds/nocturne/styles.css` (port them to CSS variables or your theme layer) rather than re-typing hex codes inline.

Visual style is bound to the **Nocturne** design system: dark near-neutral blue-grey ground, Inter 400/500, 8px radii, a single blurple accent used as outline and glow — never as a large fill. Buttons are **outlined, not filled**. `design/_ds/nocturne/readme.md` is the full style guide; follow it.

Structure and information hierarchy were benchmarked against butfitground.com (left-aligned oversized hero, icon-led feature cards, full-bleed stat band), but all color and type come from Nocturne.

## Screens / Views

### Onboarding main (single scrolling page)

Purpose: explain the service in one scroll and let a student act — upload a timetable or look at this week's PT slots.

Page shell: `background: var(--color-bg)`, `color: var(--color-text)`, `font-family: var(--font-body)`, `min-height: 100vh`. Every section is a `max-width: 1180px` centered container with `padding: 0 24px`. The stat band is the only full-bleed element. Copy is bilingual: English primary, Korean secondary line in a muted neutral. Korean lines are behind a `showKorean` flag (default on).

**1. Header** — `position: sticky; top: 0; z-index: 20`, `backdrop-filter: blur(12px)`, background `color-mix(in srgb, var(--color-bg) 88%, transparent)`, `border-bottom: 1px solid var(--color-divider)`. Inner row: `padding: 12px 24px`, `display:flex; align-items:center; gap:24px`.
- Brand: filled Phosphor `barbell` icon at 22px in `var(--color-accent)` + wordmark "FITIN", heading font, weight 600, 19px, `letter-spacing:-0.02em`.
- Nav: ghost buttons — Schedule, Routines, PT Booking, Feedback — anchoring to `#schedule`, `#routine`, `#booking`, `#workflow`.
- Right: outline tag "KST" with a `globe` icon, then primary button "Sign in".

**2. Hero** — `padding: 72px 24px 56px`, grid `repeat(auto-fit, minmax(320px, 1fr))`, `gap: 48px`, `align-items:center`.
- Left column: accent tag with `graduation-cap` icon, text "4 campuses, one gym floor". H1 "Train in the gaps / between classes." (explicit `<br>`), `font-size: clamp(38px, 5.2vw, 64px)`, `letter-spacing:-0.03em`, `text-wrap: pretty`. Lead paragraph 18px `var(--color-neutral-300)`, `max-width: 46ch`: "Upload your timetable. Fitin finds every free block of two hours or more and fills it with a routine matched to your level." Korean line 16px `var(--color-neutral-500)`: "시간표를 올리면 2시간 이상 공강을 찾아 레벨에 맞는 운동 루틴을 채워 드립니다." Two CTAs at `padding:12px 20px; font-size:16px` — primary "Upload your timetable" (`upload-simple`), secondary "This week's PT slots" (`calendar-check`). Below, four neutral tags with the campus names, in the order listed in the Overview.
- Right column: a `.card .elev-md` "week preview", `padding:0; overflow:hidden`. Header row (`padding:16px 18px`, bottom divider): `calendar-dots` accent icon, "Week of Sep 21", accent tag "3 gaps found" pushed right. Body rows are a `44px 1fr auto` grid, `gap:12px`, each with a bottom divider: uppercase 12px day label (`letter-spacing:0.08em`, neutral-500), then title 14px/500 + time 12px neutral-500, then a 20px accent-400 icon. Rows: Mon / Full body machines / "11:00 – 13:00 gap · 45 min" / `barbell`; Wed / Lower body + core / "14:00 – 16:30 gap · 45 min" / `person-simple-run`; Fri / PT session with Fitin / "16:00 – 18:00 gap · 50 min" / `user-check`. Footnote 12px neutral-500: "Gaps under 2 hours are left alone. 2시간 미만 공강은 제외."

**3. Stat band** — full-bleed `background: var(--color-section)` (#262a60) with dividers top and bottom; the one saturated field on the page. Inner `padding: 36px 24px`, grid `repeat(auto-fit, minmax(180px, 1fr))`, `gap: 28px`. Each item: 34px heading-font figure (`letter-spacing:-0.02em`) over a 13px `var(--color-accent-200)` caption.
- `2h+` — "minimum usable gap · 사용 가능 공강"
- `3–5×` — "routines per week · 주간 루틴"
- `3` — "levels: beginner to advanced"
- `Sun 21:00` — "PT booking opens, KST · 예약 오픈"

**4. How it works** (`#schedule`) — `padding: 64px 24px 8px`. H6 kicker "How it works" in `var(--color-accent-300)`, H2 "Three steps from timetable to gym floor." (`max-width:22ch`, 32px bottom margin). Three `.card`s in a `repeat(auto-fit, minmax(240px,1fr))` grid, `gap:16px`. Each: 26px accent Phosphor icon, `.card-kicker` "Step 01/02/03", `.card-title`, `.card-body`, `.card-meta` Korean line.
- 01 `upload-simple` — "Upload your class schedule" / "Drop a screenshot or paste your course list. Fitin reads days, times and campus." / "수업 시간표 업로드"
- 02 `lightning` — "Get a routine in every gap" / "Each free block of two hours or more gets a session: what to train, how long, which machines." / "공강마다 운동 루틴 배정"
- 03 `user-check` — "Book PT, log feedback" / "Reserve a slot when booking opens Sunday 21:00 KST. After the session, the feedback form arrives automatically." / "PT 예약 후 자동 피드백"

**5. Routines** (`#routine`) — kicker "Routines", H2 "Pick a level. Keep the week." On the same row, pushed right, a three-button level switcher: the active level is `.btn.btn-primary`, the others `.btn.btn-ghost`.
- Below: grid `repeat(auto-fit, minmax(300px,1fr))`, `align-items:start`. Left cell holds the session cards in a nested `repeat(auto-fit, minmax(200px,1fr))` grid, `gap:12px`; each card (`padding:16px`) shows an 18px accent-400 icon + uppercase day label, then focus title (heading font, 17px), detail 13px neutral-400, and duration 12px `var(--color-accent-300)` with `margin-top:10px`.
- Right cell: `.card .elev-sm`, `padding:18px` — `.card-kicker` with the level name, 20px heading line with the frequency, 13px neutral-400 note, then three 13px rows each with an accent-400 icon: `clock` "Fits a 2-hour gap, shower included", `repeat` "Rolls over if you miss a day", `users-three` "Shared with your campus group".
- Level data (verbatim, from the logic class — keep it, it is the product's actual prescription):
  - **Beginner** — "3 sessions a week"; note "Machines and bodyweight only. Every session ends with 10 minutes of walking." Sessions: Mon / Full body machines / "Leg press, chest press, row, lat pulldown — 2 sets each" / "45 min · 2h gap" / `barbell`; Wed / Lower body + core / "Goblet squat, hip thrust, plank, dead bug" / "45 min · 2h gap" / `person-simple-run`; Fri / Upper body + cardio / "Push-up progression, row, 15 min incline walk" / "50 min · 2h gap" / `heartbeat`.
  - **Intermediate** (default) — "4 sessions a week"; note "Free weights enter the plan. One session a week is coached PT." Sessions: Mon / Push / "Bench press, incline DB press, lateral raise, triceps" / "60 min · 2h gap" / `barbell`; Tue / Pull / "Barbell row, pulldown, face pull, curls" / "60 min · 2h gap" / `arrows-in-line-vertical`; Thu / Legs / "Back squat, RDL, split squat, calf raise" / "65 min · 2.5h gap" / `person-simple-run`; Fri / PT session / "Technique review with the Fitin trainer" / "50 min · booked slot" / `user-check`.
  - **Advanced** — "5 sessions a week"; note "Loads are prescribed as a percentage of your last tested max. Deload every fourth week." Sessions: Mon / Squat focus / "Back squat 5×5 @80%, front squat, leg curl" / "75 min · 2.5h gap" / `barbell`; Tue / Bench focus / "Bench 5×5 @80%, OHP, dips, triceps" / "70 min · 2h gap" / `arrows-out-line-horizontal`; Wed / Conditioning / "Intervals 8×400m, sled push, carries" / "45 min · 2h gap" / `heartbeat`; Thu / Deadlift focus / "Deadlift 4×4 @82%, row, back extension" / "75 min · 2.5h gap" / `arrows-in-line-vertical`; Fri / PT session / "Max testing and programme review" / "60 min · booked slot" / `user-check`.

**6. PT booking** (`#booking`) — kicker "PT booking", then one `.card .elev-md` (`padding:0; overflow:hidden`).
- Card header (`padding:18px 20px`, bottom divider, wrapping flex): left "Week 12 · Sep 21 – Sep 25" (heading font, 20px) over 13px neutral-500 "Released by Fitin admin every Sunday 21:00 KST · 매주 일요일 21시 오픈". Right: a status tag — accent tag "Booking open" when open, outline tag "Opens in 12h 04m 33s" (live countdown) when closed — plus a secondary "Simulate" button (`arrows-clockwise`) that flips the open/closed state. In production the tag reads real server state; `Simulate` is a prototype affordance and can be dropped or kept behind an admin flag.
- Slot grid (`padding:18px 20px`): columns `repeat(auto-fit, minmax(150px,1fr))`, one per weekday Mon–Fri. Each column has an uppercase 12px neutral-500 day label and a vertical `gap:8px` stack of full-width buttons (`justify-content: space-between`) showing the time on the left and an 11px `opacity:0.75` state note on the right. Times: 10:00, 13:00, 16:00, 19:00.
  - States: **open** → `.btn-secondary`, note "open"; **selected** → `.btn-primary`, note "selected"; **full** → `.btn-ghost`, note "full"; **locked** (booking closed) → `.btn-ghost`, note "locked".
  - Prototype's taken slots: Mon 13:00, Tue 10:00, Wed 19:00, Thu 16:00, Fri 10:00, Fri 13:00. In production these come from the server.
  - Selection is **single-select, one slot per student per week**. Clicking the selected slot deselects it.
- Card footer (top divider, `margin-top:20px; padding-top:16px`): left a 14px neutral-300 summary line, right a ghost "Clear" and a primary "Confirm booking" (`check`). Summary text: closed → "Slots unlock Sunday 21:00 KST · 일요일 21시 오픈"; a slot selected → "Selected: Mon at 13:00 · 50 min with the Fitin trainer"; nothing selected → "Pick one slot per week · 주 1회 선택".

**7. After the session** (`#workflow`) — `padding: 64px 24px 88px`. Kicker "After the session". Grid `repeat(auto-fit, minmax(320px,1fr))`, `gap:24px`, `align-items:start`.
- Left: H2 "The feedback form sends itself."; paragraph (neutral-400, `max-width:52ch`) "When a PT session is marked complete, Fitin sends the weekly feedback form to every student who attended. No chasing, no reminders in the group chat."; Korean line (neutral-500) "PT 세션이 종료되면 참석 학생에게 피드백 폼이 자동 발송됩니다."; then three steps, each an 18px accent icon + bold-500 label + neutral-500 tail: `check-circle` "Session ends — trainer taps complete"; `paper-plane-tilt` "Form goes out — email + app notification, within 10 minutes"; `chart-line-up` "Answers land with Fitin — next week's routine adjusts".
- Right: `.card .elev-md` (`padding:18px`) notification preview. Header: filled `bell` accent icon, "Notification preview", outline tag "Simulated" right-aligned. Body panel: `1px solid var(--color-divider)`, `border-radius: var(--radius-md)`, `padding:14px`, background `color-mix(in srgb, var(--color-accent) 7%, transparent)` — 13px neutral-400 "Fitin · to you", 16px heading "How was today's PT session?", 13px neutral-400 "Two minutes, seven questions. Your answers set next week's load.", then a primary button (`arrow-up-right`) "Open feedback form" linking to **https://forms.gle/qcTqoCznB4gGMN9bA** (`target="_blank" rel="noopener"`). Below the panel: a secondary `.btn-block` "Mark session complete & send" (`paper-plane-tilt`), then a 12px `var(--color-accent-300)` status line (`min-height:18px`) that reads "Sent to 6 students · forms.gle/qcTqoCznB4gGMN9bA" after firing.

**8. Footer** — top divider, `padding: 28px 24px`, 13px neutral-500 flex row: brand mark (filled `barbell` + "FITIN", in `--color-text`), "Incheon Global Campus · 인천글로벌캠퍼스", and right-aligned "All times KST".

**Toast** — `position: fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:40; pointer-events:none`. A `.card .elev-lg` (`padding:12px 18px`, `white-space:nowrap`) with a filled `check-circle` accent icon and 14px message, entering with `fitinRise` (opacity 0→1, `translateY(8px)`→0, 220ms ease-out), auto-dismissing after 2600ms.

## Interactions & Behavior

- **Level switch** — sets the active level; session cards and the side summary re-render. Default `Intermediate`.
- **Slot click** — full slot → toast "That slot is full — 이미 마감된 시간입니다"; booking closed → toast "Booking opens Sunday 21:00 KST"; otherwise select/deselect (single select).
- **Confirm booking** — closed → toast "Booking is not open yet"; nothing selected → toast "Pick a slot first"; otherwise toast "Booked Mon at 13:00 — 예약 완료". In production this POSTs the reservation and should then show the confirmed state persistently, not just a toast.
- **Simulate** — flips booking open/closed and clears the selection when closing. Prototype only.
- **Mark session complete & send** — sets the status line and fires the toast "Feedback form sent to 6 students". Prototype stand-in for the real dispatch.
- **Countdown** — recomputed every second to the next Sunday 21:00 **KST (UTC+9)**, rendered as `Hh MMm SSs`. Compute in UTC and add 9h; never rely on the browser's local timezone — students are on the same campus but devices may be set to other zones. See `countdown()` in the prototype's logic class for the exact math.
- **Anchor nav** — plain in-page anchors with smooth scrolling.
- **Responsive** — every multi-column grid is `repeat(auto-fit, minmax(…, 1fr))`, so columns collapse without media queries; the hero H1 is `clamp()`. Keep it that way: the page must work from ~360px to wide desktop. Touch targets: buttons stay at least 44px tall on mobile.

## Backend behavior to implement (not visible in the prototype)

1. **Weekly slot release** — a scheduled job at `Sun 21:00 Asia/Seoul` publishes the next week's slot inventory and notifies students. Store the schedule server-side; the client only reads `open`/`closed` and the inventory. Use a timezone-aware cron (not UTC arithmetic at the app level) and make the job idempotent.
2. **Post-session form dispatch** — when a trainer marks a session complete, send https://forms.gle/qcTqoCznB4gGMN9bA to every attendee by email + push, within 10 minutes; record who was sent what so the form is not sent twice. Prefill the student and session identity via Google Form prefilled-link parameters if you want the responses to be attributable without asking.
3. **Timetable → gap detection** — parse an uploaded timetable into busy blocks per weekday, then emit free blocks of ≥120 minutes as candidate session windows; a routine session is assigned to each, capped at the level's weekly frequency (3/4/5).

## State Management

Prototype state: `level` (Beginner|Intermediate|Advanced), `selected` (slot id `"Mon-13:00"` or null), `open` (bool), `toast` (string), `sendStatus` (string), `now` (ms, for the countdown tick).

In production: `level` and `selected` belong to the server (student profile, reservation); `open` and the slot inventory come from the weekly release; `toast`/`sendStatus`/`now` stay client-side.

## Design Tokens

All tokens are in `design/_ds/nocturne/styles.css` — port that file (or its `:root` block) rather than transcribing values. The ones this page leans on:

- Ground `--color-bg` #161826 · surface `--color-surface` #232532 · text `--color-text` #e9e9ed
- Accent `--color-accent` #9184d9; ramp steps used: accent-200 #e7e5fe, accent-300 #d2cefd, accent-400 #b5abfc
- Neutrals used: neutral-300 #cfd3e5, neutral-400 #b2b6ca, neutral-500 #9397ab
- Stat-band ground `--color-section` #262a60 (the only saturated fill allowed)
- Divider `--color-divider` = `color-mix(in srgb, #e9e9ed 16%, transparent)`
- Type: Inter, headings weight 500 (brand wordmark 600), body 15px/1.55 weight 400; scale h1 42 / h2 32 / h3 25 / h4 20 / h5 16 / h6 13 uppercase `0.08em`
- Spacing scale (0.70× density): 2.8 / 5.6 / 8.4 / 11.2 / 16.8 / 22.4px; section rhythm 64px, container 1180px, gutters 24px
- Radii 4 / 8 / 14px · shadows `--shadow-sm/md/lg` (hairline edge + ambient darkness — do not stack heavier shadows)
- Contrast rule: the accent on this ground is ~3:1 — fine for icons and large text, not for body copy. Paragraph-size accent text uses `--color-accent-300`.

## Assets

- **Icons**: Phosphor (https://phosphoricons.com), regular and fill weights, loaded from the `@phosphor-icons/web@2.1.1` CDN in the prototype. In a React app install `@phosphor-icons/react` instead. Glyphs used: barbell, graduation-cap, upload-simple, calendar-check, calendar-dots, person-simple-run, user-check, lightning, clock, repeat, users-three, arrows-clockwise, arrows-in-line-vertical, arrows-out-line-horizontal, heartbeat, check, check-circle, bell, paper-plane-tilt, chart-line-up, arrow-up-right, globe.
- **Fonts**: Inter (Google Fonts), weights 400/500/600/700.
- **Photography**: none yet. Nocturne expects photographs shot on dark backgrounds, wrapped in `.lighten` (`mix-blend-mode: lighten`). If real gym photos from the campuses are added later, use that wrapper.
- No logo file exists — the wordmark is type plus the Phosphor barbell glyph.

## Files

- `design/Fitin Main.dc.html` — the full prototype. Markup with inline styles in the `<x-dc>` body; the `class Component extends DCLogic` block at the bottom holds the level data, slot data, countdown math and interaction handlers.
- `design/_ds/nocturne/styles.css` — the design-system token sheet and component classes (`.btn`, `.tag`, `.card`, `.seg`, `.table`, `.dialog`, `.lighten`).
- `design/_ds/nocturne/readme.md` — the Nocturne style guide: direction, color, type, interaction states, do's and don'ts. Read before styling anything new.
- `design/support.js` — the prototype's runtime. Not part of the deliverable; ignore.

## Suggested first commits

1. Scaffold the app (framework choice, Inter + Phosphor, Nocturne tokens as CSS variables or theme).
2. Static onboarding main page — sections 1–4 and 8.
3. Routines section with the level data above.
4. Booking grid against a mocked inventory endpoint, including the KST countdown.
5. Feedback-workflow section and the form dispatch stub.
