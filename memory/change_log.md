# Change Log

## 2026-04-14

### Hermes-style Codex 운영 구조 추가

- `codex/roles/`에 planner, implementer, reviewer, tester, memory_manager 역할 정의 추가
- `codex/skills/`에 inspect_task, make_plan, safe_edit, run_verification, summarize_changes, update_memory 추가
- `codex/workflow/contract.md`와 `codex/workflow/sample_task_flow.md` 추가
- `HERMES_CODEX.md` 추가
- `AGENTS.md` 추가
- `memory/` 초기 파일 생성
- `README.md`에 Hermes-style Codex 운영 구조 섹션 연결
- 작업 루프에 `review`를 필수 게이트로 승격
- 샘플 흐름을 `inspect -> planner -> implementer -> reviewer -> tester -> memory_manager -> final report`로 확장

### 기존 워크스페이스 상태

- 공식 API 무료 라우팅과 기존 Artemis UI는 유지
- 오케스트레이션 화면은 중심 허브형 시각 구조로 재정리
- 결과 노드 3개가 캔버스 밖으로 밀리던 문제를 수정
- 출력 노드의 세부 칩을 제거해 중앙 허브 집중도를 높임
