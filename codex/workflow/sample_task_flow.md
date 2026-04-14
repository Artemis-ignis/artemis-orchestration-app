# Sample Task Flow

## 예시 작업

`오케스트레이션 노드 비율과 시각 계층을 더 읽히게 개선한다.`

## inspect

```md
## 읽은 파일
- `src/pages/OrchestrationPage.tsx`
- `src/OrchestrationCanvas.tsx`
- `src/App.css`
- `memory/current_focus.md`

## 확인된 사실
- 오케스트레이션 그래프는 고정 좌표 기반이다.
- 중앙 에이전트와 오른쪽 결과 노드가 시각적으로 가장 중요하다.
- 작은 화면에서는 연결선과 효과가 쉽게 줄어든다.

## 가정
- 기존 그래프 구조는 유지하고 비율과 위계만 조정하는 것이 가장 안전하다.
```

## planner

```md
## 목표
- 중앙 허브와 주변 노드가 한눈에 읽히게 만든다.

## 확인된 사실
- 흐름 그래프는 `src/OrchestrationCanvas.tsx`와 `src/App.css`에 있다.
- 현재 구조는 이미 노드/링크 데이터 기반이다.

## 작업 계획
1. 현재 그래프 노드와 링크 좌표를 점검한다.
   검증: 관련 파일 확인
2. 카드 비율, 링크, 광원, 배경을 조정한다.
   검증: 빌드 통과
3. 헤드리스로 실제 화면을 확인한다.
   검증: 스크린샷과 DOM 확인
```

## implementer

```md
## 구현 범위
- `src/OrchestrationCanvas.tsx`
- `src/App.css`

## 변경 내용
- 중심 노드 강조
- 링크 화살표와 미세 모션 추가
- 위성 노드 균형 조정
```

## reviewer

```md
## 리뷰 결과
- 상태: 통과

## 확인된 장점
- 기존 데이터 구조를 유지했다.
- 시각 계층이 더 선명해졌다.

## 남은 위험
- 작은 화면에서는 배치가 다시 눌릴 수 있다.
```

## tester

```md
## 실행한 검증
- npm run lint
- npm run build
- 헤드리스 스크린샷 확인
```

## memory_manager

```md
## 이번 변경
- 오케스트레이션 그래프 시각 계층 개선

## 다음 초점
- 채팅/설정 문구 밀도 추가 정리
```

## final report

```md
## 결과
- 중앙 허브와 결과 노드의 비율을 조정해 흐름이 더 빨리 읽히게 만들었다.

## 변경 파일
- `src/OrchestrationCanvas.tsx`
- `src/App.css`

## 실행한 검증
- `npm run lint`
- `npm run build`
- 헤드리스 스크린샷 확인

## 남은 위험요소
- 작은 화면에서는 노드 밀도가 다시 높아질 수 있다.
```
