# Change Log

## 2026-04-14

### Hermes-style Codex 운영 구조 추가

- `codex/roles/`에 planner, implementer, reviewer, tester, memory_manager 역할 정의 추가
- `codex/skills/`에 inspect_task, make_plan, safe_edit, run_verification, summarize_changes, update_memory 추가
- `codex/workflow/contract.md`, `codex/workflow/sample_task_flow.md` 추가
- `HERMES_CODEX.md`, `AGENTS.md` 추가
- `memory/` 초기 파일 생성 및 README 연결
- 작업 루프에 `review`를 필수 게이트로 고정

### 기존 워크스페이스 정리

- 공식 API 무료 라우팅과 기존 Artemis UI 흐름 통합
- 오케스트레이션을 중앙 허브형 시각 구조로 재정리
- 결과 노드가 캔버스 밖으로 밀리던 문제 수정
- 출력 노드 정보칩 제거로 오른쪽 과밀 완화

### 이번 추가 수정

- 오케스트레이션 아이콘, 배지, 디테일칩 비율 축소
- 문서용 오케스트레이션 스크린샷 최신화
- `4174` 브리지 재기동으로 Ollama 상태 복구
- 브리지 헬스 기준으로 Ollama `gemma4-E4B-uncensored-q4fast:latest` 준비 상태 확인
### Compact hub module pass

- Replaced large orchestration cards with smaller hub-and-module nodes.
- Hid subtitles on side modules so the graph reads like a real orchestration board.
- Refreshed `docs/screenshots/orchestration.png` with the latest compact layout.

### Interactive orchestration canvas pass

- Replaced the fixed orchestration SVG/card layout with a real `@xyflow/react` canvas.
- Verified the viewport transform changes on drag and zoom in a headless browser run.
- Reduced per-node copy so the graph reads as compact modules instead of heavy content cards.

### Live orchestration result pass

- Added a live result panel below the orchestration composer to surface route logs and streamed output while a run is in progress.
- Kept partial output visible on failures instead of overwriting the run output with a generic error string.
- Updated the documentation screenshot to the latest interactive orchestration capture.
