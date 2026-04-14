# Decisions

## 확정된 결정

### 2026-04-14

- 이 저장소의 Hermes-style 운영은 네이티브 Hermes 설치를 가정하지 않고 `codex/ + memory/ + HERMES_CODEX.md` 구조로 재현한다.
- 작업 루프는 항상 `inspect -> plan -> implement -> review -> verify -> update memory -> report`를 따른다.
- 역할은 planner, implementer, reviewer, tester, memory_manager 5개로 고정한다.
- 재사용 절차는 별도 스킬 문서로 관리한다.
- persistent memory는 Git으로 추적되는 로컬 파일 `memory/`에 둔다.
- 저장소 루트 `AGENTS.md`를 Hermes-style 진입 파일로 추가해 future Codex session의 시작 지침을 고정한다.
- 오케스트레이션 화면은 데이터 구조를 유지하고 시각 계층만 강화한다.
- 공개 소비자 웹 로그인 자동화는 구현하지 않는다.
- 공식 API 라우팅 지원 공급자는 OpenRouter, NVIDIA Build, Gemini Developer API 3개만 유지한다.
- 로컬 Ollama 모델은 `gemma4-E4B-uncensored-q4fast:latest` 1개만 유지한다.
