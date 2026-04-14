# Artemis Hermes-style Workflow Contract

이 저장소는 Hermes가 설치된 것처럼 가장하지 않는다. 대신 Codex 안에서 재현 가능한 구조로 아래 루프를 강제한다.

## 필수 실행 루프

1. `inspect`
   - 관련 파일과 현재 상태를 확인한다.
   - 확인된 사실과 가정을 분리한다.
2. `plan`
   - 짧은 계획과 검증 기준을 적는다.
3. `implement`
   - 작은 변경을 적용한다.
   - 관련 없는 파일은 건드리지 않는다.
4. `review`
   - reviewer 관점으로 위험, 누락, 과도한 변경을 다시 본다.
   - 리뷰에서 나온 수정이 있으면 작은 단위로 반영한다.
5. `verify`
   - 린트, 빌드, 테스트, 헤드리스 확인 중 맞는 검증을 실행한다.
6. `update memory`
   - 결정, 현재 초점, 변경 이력, 열린 질문을 기록한다.
7. `report`
   - 결과 / 변경 파일 / 검증 / 남은 위험을 보고한다.

## 역할 적용 규칙

- 계획은 `codex/roles/planner.md`
- 구현은 `codex/roles/implementer.md`
- 리뷰는 `codex/roles/reviewer.md`
- 검증은 `codex/roles/tester.md`
- 메모 정리는 `codex/roles/memory_manager.md`

## 완료 게이트

아래를 모두 만족해야 완료로 본다.

- 관련 파일을 실제로 읽었다.
- 작업 계획을 적었다.
- 변경을 작은 단위로 적용했다.
- reviewer 관점 점검을 거쳤다.
- 최소 1개 이상의 실제 검증을 실행했다.
- `memory/` 파일을 갱신했다.
- 남은 불확실성을 보고했다.

## 금지

- 검증 없이 완료 처리
- 대규모 무계획 리팩터링
- 추정 사실의 확정 보고
- 메모 업데이트 누락
