# Current Focus

## 현재 우선순위

1. 기존 Artemis 워크스페이스를 더 간결하고 읽기 쉬운 구조로 정리
2. 오케스트레이션 화면의 비율, 아이콘 크기, 시각 밀도 안정화
3. 설정/채팅에서 공급자와 로컬 실행기 상태를 헷갈리지 않게 설명
4. Hermes-style Codex 운영 구조와 메모 체계를 실전 세션에서 유지

## 이번 세션 목표

- 오케스트레이션 아이콘과 배지를 축소하고 가독성을 높인다.
- Ollama 로컬 연결 상태를 실제 브리지/모델 기준으로 복구하고 검증한다.
- 최신 상태를 메모와 스크린샷에 반영한 뒤 깃허브 브랜치까지 정리한다.

## 다음 세션에서 바로 확인할 것

- `AGENTS.md`
- `HERMES_CODEX.md`
- `memory/current_focus.md`
- `memory/open_questions.md`
- `docs/screenshots/orchestration.png`

## Latest update

- Orchestration now uses compact hub modules instead of large card blocks.
- Only the center hub keeps a subtitle; side modules render as short node labels.
- Ollama health on `4174` is confirmed with `gemma4-E4B-uncensored-q4fast:latest`.

## Latest update 2

- Replaced the fixed orchestration illustration with a real React Flow canvas.
- Verified drag-to-pan and wheel-to-zoom behavior in a headless browser run.
- Tightened mini-node copy so the board reads like a tool graph instead of stacked cards.

## Latest update 3

- Orchestration now exposes a live result panel under the composer so runs no longer look stuck on `실행 중...` with no context.
- Verified the canvas viewport transform changes after drag so the board is actually pannable.
- Refreshed `docs/screenshots/orchestration.png` from the latest interactive orchestration capture.
