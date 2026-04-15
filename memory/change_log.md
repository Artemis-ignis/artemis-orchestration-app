# Change Log

## 2026-04-15

### Official API direct-mode cleanup

- Removed the official free-routing UX from settings and kept only provider connection plus a saved default model target.
- Changed the official managed agent copy, chat selector, orchestration status, and settings summaries from `공식 무료` / free-router wording to `공식 API` direct-call wording.
- Synced the official managed agent from bridge AI settings during app bootstrap so a fresh browser session keeps the saved provider/model instead of falling back to the seed default.
- Kept backend execution on `routing_mode: manual` and added a synthetic direct candidate path so typed model IDs can run even when they are not part of the stored candidate list.
- Changed official execution failures to report `선택한 공식 API 호출이 실패했습니다.` and changed fallback copy from `무료 후보` to neutral `자동 후보` wording.
- Fixed orchestration canvas labels so direct model ids like `deepseek/deepseek-r1:free` render as readable worker labels such as `DeepSeek R1` instead of collapsing to `free`.
- Cleaned broken orchestration progress and routing log strings in `AppState.tsx` so live run cards now show readable Korean status text.
- Fixed the official target quick-pick grid so the current model and saved custom ids are always pinned first; `openrouter/elephant-alpha` now stays visible instead of getting dropped by the old top-8 ranked slice.
- Verified in fresh Playwright browser sessions that:
  - settings shows only direct provider/model controls for the official path,
  - chat restores the saved official target on boot and shows it as `공식 API`,
  - official chat failures now use the direct-call error copy,
  - orchestration shows `공식 API · 준비됨 · OpenRouter · deepseek/deepseek-r1:free`,
  - orchestration live logs now render readable Korean progress text.

### Routing stability audit

- Added stream idle-timeout handling in both the bridge SSE reader and the frontend SSE client.
- Kept first-token timeout handling intact.

### Local runtime visibility

- Restored a dedicated local runtime section in settings.
- Kept `Ollama 로컬` and `Codex CLI` visible ahead of the official API cards.
- Surfaced real Ollama bridge errors instead of always showing a generic missing-model message.

### Orchestration interaction

- Reworked orchestration into a two-state React Flow canvas.
- Pre-run state now shows only `입력 -> 병렬 허브 -> 출력`.
- Draft/running state now generates parallel worker blocks for the selected models.
- Re-enabled pan and zoom on the orchestration canvas while keeping node positions controlled.
- Kept chat single-model and orchestration multi-model by design.

### Orchestration readability

- Tightened compact node styling so labels no longer collapse into `메...`, `입...`, `인...`.
- Added short labels for official-router modes:
  - `auto-best-free` -> `공식 무료`
  - `auto-code-free` -> `코딩 무료`
  - `auto-fast-free` -> `빠른 무료`
- Simplified orchestration summary chips to counts and safe status labels.

### Public safety and screenshots

- Replaced visible orchestration path chips with safe workspace labels.
- Regenerated `docs/screenshots/*.png` from the demo workspace.
- Resynced `public/marketing/workspace-chat.png`, `workspace-files.png`, and `workspace-orchestration.png` from the latest safe screenshots.
- Re-scanned tracked text files for the literal local workspace path and found no remaining plain-text leaks.
- Added a dedicated doc-screenshot mode for settings so saved provider keys and personal connection state are not rendered into public screenshots.

### Local runtime health hardening

- Added an explicit Ollama health timeout in `local-bridge/server.mjs` and applied it to the `/api/tags` response body parse as well.
- Cached the last successful Ollama runtime snapshot so `/api/health` can return the last confirmed model state with `warning`, `lastError`, `stale`, and timestamp fields instead of collapsing to an empty model list.
- Changed the frontend bridge-health refresh path to preserve the last confirmed `bridgeHealth` state and update only `bridgeError` on refresh/bootstrap failures.
- Reworked the local runtime cards in settings so the section never disappears and the Ollama card always shows readiness, model count, current model, latest warning/error, and a working refresh button.
- Verified in headless Playwright that a forced `/api/health` failure no longer collapses the local runtime card to `0개 모델`.
- Regenerated `docs/screenshots/settings.png` so the public settings screenshot matches the new stable local-runtime UI.
- Removed the temporary duplicated commented block left in `src/pages/SettingsPage.tsx` after the hotfix so the file is smaller and easier to maintain.

### Orchestration state persistence

- Added a dedicated `orchestration` state slice so the current draft, selected model set, and latest orchestration session survive page navigation and reloads.
- Changed orchestration session filtering to use the persisted session start time and session agent ids instead of component-local state.
- Kept the orchestration canvas expanded for the latest session and preserved the output/result nodes after execution completes.
- Stopped blocking a new orchestration run only because an old `bridgeError` banner still exists from the last failed provider.
- Added inline selected-model status banners plus a recent-session summary so the page shows which model connected, completed, failed, or is still running without opening another menu.
- Verified in headless Playwright that:
  - running a 3-model orchestration shows live result cards,
  - the official free router failure is visible inline instead of hiding the rest of the run,
  - leaving `#/agents` for `#/settings` and coming back keeps the latest session visible.

### Service usability pass

- Added a chat status banner for the currently selected model so the user can see whether Ollama, Codex CLI, or the official free router is actually ready before sending a message.
- Downgraded the non-Codex workspace-write hint in chat from warning tone to info tone and only show it when a workspace is actually connected.
- Synced the files-page root-path input with the connected workspace root so the current path remains visible and reusable.
- Added a second in-app delete confirmation step on the files page before the browser confirm dialog, reducing accidental destructive clicks in the list and preview panes.
- Wrapped each official provider card in settings with a real form so password inputs no longer trigger DOM warnings and Enter can submit the save action.
- Added a recent-status line plus last-check timestamp to each official provider card so users can tell what was actually tested and when.
- Verified in headless Playwright that:
  - chat shows the selected-model readiness banner,
  - files shows the connected root path in the input and changes delete buttons to `삭제 확인` on first click,
  - settings no longer emits password-without-form console warnings and shows recent provider status details.
