# Change Log

## 2026-04-15

### Routing stability audit

- Added stream idle-timeout handling in both the bridge SSE reader and the frontend SSE client.
- Ensured trailing SSE buffer chunks are still parsed after stream end.
- Kept first-token timeout behavior intact.

### Orchestration readiness audit

- Sorted `activeAgentRuns` by latest timestamp before reading the latest run.
- Made official-router orchestration gating depend on actual official provider readiness instead of only local provider health.

### Settings UX audit

- Split the `실행기 · 에이전트 · API` pane into collapsible sections:
  - 공식 API 공급자
  - 무료 라우팅 정책
  - 무료 후보 관리
  - 채팅 에이전트

### Chat UX audit

- Routing detail toggles now appear only when there was a real fallback or provider error.
- Streaming meta now avoids showing noisy attempt counts unless fallback actually happened.
