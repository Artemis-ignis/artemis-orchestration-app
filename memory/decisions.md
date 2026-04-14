# Decisions

## 확정된 결정

### 2026-04-14

- 이 저장소는 Hermes를 설치한 척하지 않고 `codex/ + memory/ + HERMES_CODEX.md` 구조로 Hermes-style 운영을 재현한다.
- 작업 루프는 항상 `inspect -> plan -> implement -> review -> verify -> update memory -> report`를 따른다.
- 역할은 planner, implementer, reviewer, tester, memory_manager 다섯 개로 고정한다.
- 지속 메모는 Git으로 추적되는 `memory/` 폴더에 저장한다.
- 세션 진입 파일은 저장소 루트 `AGENTS.md`로 고정한다.
- 공식 API 무료 라우팅 공급자는 OpenRouter, NVIDIA Build, Gemini Developer API 세 개만 지원한다.
- 로컬 Ollama는 `gemma4-E4B-uncensored-q4fast:latest` 한 모델만 유지한다.
- 오케스트레이션은 현재 저장소의 고정형 캔버스 구조를 유지하되, 시각 품질과 비율을 계속 보강한다.
- 공개 랜딩보다 기존 Artemis 워크스페이스 UI를 우선한다.

### 이번 추가 결정

- Ollama 미연결처럼 보였던 문제는 로컬 모델 부재가 아니라 `4174 브리지 프로세스가 오래된 상태`였고, 브리지 재기동으로 해결한다.
- 오케스트레이션 아이콘과 배지는 현재 그래프 경험을 해치지 않는 범위에서 한 단계 축소해 시각 밀도를 줄인다.
