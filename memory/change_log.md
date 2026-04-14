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

### Local runtime visibility fix

- Restored a dedicated `0. 로컬 실행기` section in settings so Ollama and Codex are visible before the official API cards.
- Added live local status cards showing readiness, current model labels, and bridge detail text.
- Updated bridge health so failed Ollama checks surface the real error detail instead of always saying no model is available.

### Flowchart orchestration pass

- Reworked the orchestration board into a compact left-to-right flowchart layout on React Flow.
- Re-enabled canvas pan and zoom while disabling node dragging so the flow stays aligned.
- Tightened node sizes and regrouped trigger, hub, memory, branch, tools, signals, and outputs into a clearer path.
- Added an inline agent switch row near the run form so runtime selection stays close to execution.
- Updated orchestration running copy so Codex and Ollama runs explain that progress logs appear before the final one-shot answer.

### Ollama default preference

- Bumped persisted runtime storage to `artemis-runtime-state/v17`.
- Migrated saved state so `agent-ollama` becomes active when the stored model provider is already `ollama`.
- Kept `gemma4-E4B-uncensored-q4fast:latest` as the only expected Ollama model.

### Public screenshot path leak fix

- Replaced visible orchestration path chips with a safe workspace label helper so the run dock no longer exposes absolute local paths.
- Regenerated the tracked `docs/screenshots/*.png` set from the demo workspace after the orchestration label change.

### Orchestration label readability fix

- Shortened the orchestration node vocabulary to concise flowchart labels such as `병렬 허브`, `Ollama`, and `분기`.
- Added a final CSS override at the end of `src/App.css` so node titles and subtitles wrap instead of collapsing into `메...` or `입...`.
- Simplified orchestration workspace chips to `작업 폴더 연결됨` instead of repeating path-like wording.
