# Fitin — VSCode + Git 자동 저장 워크플로우

한 번만 설정하면, 파일은 VSCode가 알아서 저장하고, 커밋·푸시하면 GitHub Pages에 자동 배포됩니다.

## 0. 빠른 시작 (Windows · 현재 작업 폴더)

작업 폴더: `C:\Users\dlwot\Downloads\Fitin_Connection Team Member`
(이전 폴더 `IGC Member 피트니스 플랫폼`은 더 이상 쓰지 않습니다 — 두 곳에서 동시에 고치면 충돌납니다.)

| 하고 싶은 일 | VSCode | 터미널 |
| --- | --- | --- |
| 사이트 미리보기 | Ctrl+Shift+P → Tasks: Run Task → **Preview site** | `npm run dev` → http://localhost:5173 |
| 저장 + GitHub 푸시 + 자동 배포 | **Ctrl+Shift+B** | `bash scripts/save.sh "메시지"` |
| Fitin 사진 추가 | `assets/images/` 폴더에 넣기 (규칙: `assets/images/README.md`) | |

미리보기는 파일 저장 후 브라우저 새로고침만 하면 반영됩니다. `/api/*` 서버 함수는 로컬에서 동작하지 않으니 배포본(https://www.fitinconnection.com)에서 확인하세요.

## 1. 최초 설정 (한 번만)

```bash
git clone https://github.com/Leelif2/Fitin_members.git
cd Fitin_members
# 이 프로젝트 파일 전체를 이 폴더에 복사 (다운로드한 zip 압축 해제)
chmod +x scripts/*.sh
code .
```

VSCode가 열리면 우하단에 "권장 확장 프로그램 설치" 알림이 뜹니다 — 설치하세요 (GitLens, Live Server, Prettier, Claude Code).

배포는 Vercel이 GitHub `main` 브랜치와 연결되어 자동으로 합니다 (GitHub Pages는 사용하지 않음).

## 2. 3단계 자동 저장

### 1단계 — 파일 자동 저장 (설정 완료됨)
`.vscode/settings.json`에서 `files.autoSave: afterDelay` (0.8초). 타이핑을 멈추면 디스크에 저장됩니다. Cmd+S 누를 필요 없음.

### 2단계 — 커밋 후 자동 푸시 (설정 완료됨)
`git.postCommitCommand: "push"` — VSCode 소스 제어 패널에서 커밋하면 푸시가 자동으로 따라갑니다. 커밋만 하면 끝.

터미널파를 위한 한 줄 명령:
```bash
bash scripts/save.sh "루틴 카드 수정"
# 메시지 생략하면 날짜·시간이 들어갑니다
bash scripts/save.sh
```
VSCode에서는 **Cmd+Shift+B** 한 번이면 같은 동작을 합니다.

### 3단계 — 푸시하면 사이트 자동 배포
Vercel이 `main` 브랜치 푸시를 감지해 1~2분 안에 자동 배포합니다.
공식 주소: **https://www.fitinconnection.com** (`fitinconnection.com`으로 들어와도 www로 자동 이동)

## 3. 완전 자동 (커밋도 자동)

커밋조차 하기 싫다면 백그라운드 감시를 켜세요 — 5분마다 변경분을 자동 커밋·푸시합니다.

```bash
bash scripts/autosave-watch.sh        # 5분 간격
bash scripts/autosave-watch.sh 60     # 1분 간격
```
VSCode: Cmd+Shift+P → "Tasks: Run Task" → **Watch & auto-commit**. 중지는 Ctrl-C.

커밋 이력이 지저분해지는 대가가 있으니, 평소엔 2단계를 쓰고 집중 작업 중에만 켜는 걸 권합니다.

## 4. Claude Code와 함께 쓰기

```bash
cd Fitin_members
claude
```
`design_handoff_fitin_onboarding/README.md`가 온보딩 메인 페이지의 전체 스펙입니다. Claude Code에게 그 파일을 읽히고 구현을 맡기면 됩니다. Claude Code는 로컬에서 직접 커밋·푸시할 수 있습니다.

## 5. 저와 동기화

푸시한 뒤 이 대화에서 "sync"라고 말씀하시면, 제가 repo의 최신 상태를 읽어 다음 화면 디자인을 이어갑니다. `github.md`가 동기화 기록입니다.

## 파일 목록

| 파일 | 역할 |
| --- | --- |
| `.vscode/settings.json` | 파일 자동 저장, 커밋 후 자동 푸시, 자동 fetch |
| `.vscode/tasks.json` | Cmd+Shift+B = 저장·커밋·푸시 |
| `.vscode/extensions.json` | 권장 확장 프로그램 |
| `scripts/save.sh` | 한 줄로 add + commit + pull --rebase + push |
| `scripts/autosave-watch.sh` | N초마다 자동 커밋·푸시 |
| `.github/workflows/pages.yml` | 푸시 시 GitHub Pages 배포 |
| `.gitignore` | node_modules, .env, .DS_Store 제외 |
| `index.html` | 루트 접속 시 온보딩 메인으로 이동 |
