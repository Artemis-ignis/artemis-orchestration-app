# update_memory

## 목적

작업 결과를 외부 파일 메모리에 남겨 다음 세션이 바로 이어받게 한다.

## 대상 파일

- `memory/project_overview.md`
- `memory/decisions.md`
- `memory/current_focus.md`
- `memory/change_log.md`
- `memory/open_questions.md`

## 실행 절차

1. 프로젝트 전반 정보가 바뀌면 `project_overview.md`를 갱신한다.
2. 새로 고정된 원칙은 `decisions.md`에 추가한다.
3. 다음 작업 우선순위는 `current_focus.md`에 남긴다.
4. 실제 변경은 날짜와 함께 `change_log.md`에 적는다.
5. 가정이나 미확인 사항은 `open_questions.md`에 적는다.

## 출력 템플릿

```md
## 메모 업데이트
- project_overview: ...
- decisions: ...
- current_focus: ...
- change_log: ...
- open_questions: ...
```

## 금지

- 방금 안 한 일을 했다고 기록하지 않는다.
- 다음 세션에 불필요한 장문 회고를 남기지 않는다.
