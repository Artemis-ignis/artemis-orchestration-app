# Change Log

## 2026-04-15

### Premium UI shell follow-up

- Continued the UI-only redesign work on the dedicated `feat/premium-ui-shell` worktree without mixing in the non-UI bridge and signals changes from the other branch.
- Replaced `src/pages/SettingsPage.tsx` with a small tab-shell page and moved the entire models/runtime/provider section into `src/features/settings/SettingsModelsPane.tsx`.
- Rewrote `src/features/settings/SettingsProfilePane.tsx` and `src/features/settings/SettingsPreferencesPane.tsx` so the copy and field hierarchy match the premium control-room UI language.
- Refined the design system with calmer interaction rules:
  - removed the lift-on-hover motion from shared buttons and chips,
  - added disabled-state consistency in `base.css`,
  - flattened settings/runtime/provider panels further.
- Improved chat idle UX:
  - shortened visible workspace context to a folder label,
  - added a proper hero surface for the empty conversation state,
  - kept the route/model/status summary visible without overwhelming the page.
- Improved files UX:
  - widened the browser/inspector split,
  - added clearer list hover feedback,
  - made the empty inspector area feel like an intentional product state,
  - replaced the always-visible absolute root-path input with a collapsed root summary card plus an explicit edit mode.
- Improved orchestration UX:
  - increased canvas emphasis,
  - reduced right-rail visual weight,
  - made the control rail sticky on desktop so the graph stays the hero surface.
- Re-ran desktop, tablet, and mobile Playwright screenshots after the second pass and confirmed that:
  - settings now reads as one system instead of stacked legacy cards,
  - chat idle state no longer feels like an unfinished blank workspace,
  - files and orchestration match the same shell, spacing, and panel language.
- Refreshed `docs/screenshots/chat.png`, `files.png`, `settings.png`, `orchestration.png` and the matching `public/marketing/workspace-*.png` assets from the latest reviewed premium-shell captures.
- Ran a tracked-text privacy scan for the literal local workspace path, username, and obvious key prefixes before preparing the branch for publish; no tracked text matches were found for the local path or username.

### Orchestration flow and readiness fix

- Replaced the noisy orchestration graph with an execution-first flow that keeps only `input`, `parallel hub`, selected workers, and one `result` node.
- Removed decorative side nodes such as memory, files, insights, activity, and merge branches from the main parallel canvas so the run path is easier to understand at a glance.
- Added explicit canvas-side worker readiness input from `OrchestrationPage.tsx` so the graph can distinguish runtime availability from run history.
- Changed worker badge resolution to separate real runtime readiness from execution history:
  - connected runtime with no run -> `connected`
  - connected runtime after a session exists but before that worker starts -> `execution standby`
  - unavailable runtime -> `not ready`
  - running, success, or error -> live run state
- Fixed the Codex CLI worker so it no longer shows a misleading idle badge simply because no recent run object exists while the runtime is actually connected.
- Verified in browser that the orchestration worker badges now render as `connected` for ready workers before execution, and that the simplified graph no longer looks like a decorative systems map.

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

### UI/UX simplification pass

- Reduced shell and page chrome by removing heavy card shadows from the main workspace surfaces and tightening the page intro hierarchy.
- Reworked the settings models tab to start with three compact overview cards and short actions instead of a rule-strip plus multiple equally loud instruction blocks.
- Renamed the settings disclosures to task-based titles and left `공식 API 키와 연결` collapsed by default so routine model selection is easier to scan.
- Removed the provider step-flow strip from each official provider card and kept only the fields and status that affect real execution.
- Reworked chat to show a compact status rail for readiness, warnings, and bridge errors instead of stacking multiple full-width banners ahead of the conversation.
- Reworked orchestration to show compact per-model readiness tiles, group runner warnings into one status list, and keep a permanent `실행 결과` area visible before the first run.
- Verified in Playwright that:
  - settings renders 3 overview cards and keeps 2 disclosure sections collapsed on first open,
  - orchestration shows compact model status tiles and a dedicated result area even before execution,
  - chat renders the new status rail while keeping the conversation-first layout.

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

### Signals auto-post generator

- Added a new auto-post pipeline under `local-bridge/auto-posts/` with separate modules for normalization, scoring, media collection, generation, storage, candidate collection, and scheduling.
- Reused the existing signal query and source collectors from `local-bridge/server.mjs` by adding a raw `collectSignalItems(category)` path that feeds both the live signal UI and the auto-post scheduler.
- Added candidate normalization and dedupe handling for canonical URLs, arXiv ids, and YouTube ids so the scheduler can skip repeated topics across runs.
- Added scoring that blends recency, source quality, AI-topic relevance, community signals, media presence, and category weights before selecting the top candidates.
- Added source-specific enrichment for Hacker News, GitHub, arXiv, and generic webpages, including OG metadata extraction and related source stats.
- Added a media pipeline that tries oEmbed first, then OG image/video metadata, then cached remote assets, and finally Playwright screenshots as a fallback.
- Added a Korean long-form article generator with:
  - a versioned prompt builder
  - Codex-backed structured JSON generation
  - a rules-based HTML fallback when the model call fails
- Added persistent storage for:
  - generated HTML articles
  - JSON metadata
  - index and scheduler state
  - scheduler settings
  - media cache files
- Added bridge APIs for:
  - listing auto-posts
  - fetching details
  - manual run
  - regenerate
  - export
  - reveal folder
  - scheduler state
  - settings patch
  - media asset serving
- Reworked `src/pages/SignalsPage.tsx` into two tabs so the UI now supports both the existing real-time signal feed and the new auto-generated article workflow.
- Added a full article management panel in the signals page with scheduler state, editable settings, recent post cards, HTML preview, media/source sections, regenerate, export, and folder-open actions.
- Added frontend types and bridge client helpers for the new auto-post API surface.
- Documented the feature in `README.md`, added a verified screenshot, and added `generated-posts/` plus `media-cache/` to `.gitignore`.
- Verified end-to-end that:
  - `POST /api/auto-posts/run` creates a real article,
  - saved HTML/JSON files exist on disk,
  - list/detail/state/export APIs respond,
  - the signals auto-post tab renders the saved article preview in the browser.

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
