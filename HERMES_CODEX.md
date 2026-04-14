# Hermes-style Codex Operating Mode

이 저장소는 Hermes가 네이티브로 설치된 환경이 아니다. 대신 Codex 안에서 실제로 운용 가능한 형태로 Hermes-style 작업 방식을 재현한다.

## 세션 시작 순서

1. 저장소 루트 `AGENTS.md`를 읽는다.
2. 이 파일 `HERMES_CODEX.md`를 읽는다.
3. `memory/current_focus.md`와 `memory/open_questions.md`를 읽는다.
4. 관련 파일을 직접 확인한 뒤 작업을 시작한다.

## 필수 작업 루프

1. inspect
2. plan
3. implement
4. review
5. verify
6. update memory
7. report

이 순서를 건너뛰지 않는다.

## 역할 사용 위치

- 계획: `codex/roles/planner.md`
- 구현: `codex/roles/implementer.md`
- 리뷰: `codex/roles/reviewer.md`
- 검증: `codex/roles/tester.md`
- 메모 정리: `codex/roles/memory_manager.md`

## 재사용 스킬

- 점검: `codex/skills/inspect_task.md`
- 계획: `codex/skills/make_plan.md`
- 안전 수정: `codex/skills/safe_edit.md`
- 검증: `codex/skills/run_verification.md`
- 변경 요약: `codex/skills/summarize_changes.md`
- 메모 업데이트: `codex/skills/update_memory.md`

## 메모 파일 규칙

- 프로젝트 전반 상태: `memory/project_overview.md`
- 고정 결정: `memory/decisions.md`
- 현재 초점: `memory/current_focus.md`
- 실제 변경 이력: `memory/change_log.md`
- 남은 질문: `memory/open_questions.md`

의미 있는 변경 뒤에는 최소 `current_focus.md`, `change_log.md`, `open_questions.md`를 다시 본다.

## 완료 조건

아래를 모두 만족해야 완료로 본다.

- 관련 파일을 읽었다.
- 짧은 계획을 세웠다.
- 필요한 파일만 수정했다.
- reviewer 관점 점검을 거쳤다.
- 최소 1개 이상의 실제 검증을 실행했다.
- 메모 파일을 갱신했다.
- 결과 / 변경 파일 / 검증 / 남은 위험을 보고했다.

## 샘플 흐름

샘플은 `codex/workflow/sample_task_flow.md`에 정리돼 있다.
