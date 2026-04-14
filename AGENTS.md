# Artemis Hermes Entry

이 저장소는 Hermes가 내장된 환경이 아니다. 대신 Codex 안에서 재현 가능한 Hermes-style 작업 구조를 사용한다.

## 세션 시작 순서

1. `HERMES_CODEX.md`를 읽는다.
2. `memory/current_focus.md`와 `memory/open_questions.md`를 읽는다.
3. 관련 코드 파일을 직접 점검한다.
4. `inspect -> plan -> implement -> review -> verify -> update memory -> report` 순서로 진행한다.

## 필수 규칙

- inspect 없이 수정하지 않는다.
- major edit 전에는 짧은 계획을 적는다.
- reviewer 관점 점검 없이 완료 처리하지 않는다.
- 최소 1개 이상의 실제 검증을 실행한다.
- 변경이 끝나면 `memory/change_log.md`와 `memory/current_focus.md`를 갱신한다.

## 구조 위치

- 역할: `codex/roles/`
- 스킬: `codex/skills/`
- 계약: `codex/workflow/contract.md`
- 샘플: `codex/workflow/sample_task_flow.md`
- 메모: `memory/`
