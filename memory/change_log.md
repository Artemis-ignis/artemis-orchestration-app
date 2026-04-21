# Change Log

## 2026-04-21

### Activity inbox-style cleanup

- Reworked `src/pages/ActivityPage.tsx` into a flatter operator view:
  - top summary now focuses on 핵심 수치,
  - recent execution, publish, log, and activity items now share one recent stream,
  - live issue dossiers are grouped into one separate lane,
  - long English text in stream cards is clipped on the default view,
  - copy is shortened to read in Korean first.
- Verified the page file with a standalone TypeScript check:
  - `npx tsc --ignoreConfig --noEmit --pretty false --jsx react-jsx --moduleResolution bundler --module ESNext --target ES2022 src/pages/ActivityPage.tsx`

## 2026-04-17

### Deep report Korean article polish

- Reworked `local-bridge/auto-posts/collector.mjs` so translated Korean titles and summaries are preserved instead of being overwritten by later English metadata expansion.
- Reworked `local-bridge/auto-posts/media.mjs` so page snippets no longer pull raw JSON-LD or script/schema fragments into article inputs.
- Tightened `local-bridge/auto-posts/generator.mjs` so:
  - English-heavy generated titles and leads fall back to Korean article phrasing,
  - `Launch HN` / GitHub repository style source titles get better Korean fallback headlines,
  - fallback summaries, section blocks, and three-line summaries read like article copy instead of feed dumps.
- Added candidate relocalization plus timeouts in `local-bridge/auto-posts/scheduler.mjs`:
  - selected candidates are rephrased into Korean article inputs before generation when needed,
  - localization now times out safely,
  - article generation also times out cleanly into fallback mode,
  - scheduler init clears stale `inProgress` state after a bridge restart.
- Replaced the deep report iframe in `src/pages/SignalsPage.tsx` with inline article rendering via `src/features/autoPosts/AutoPostArticle.tsx`.
- Localized remaining visible Wire strings in:
  - `src/features/publisher/publisherUi.ts`
  - `src/features/publisher/PublisherOperationsPanel.tsx`
  - `src/pages/ActivityPage.tsx`
- Verified with:
  - `npm run lint`
  - `npm run build`
  - `node --test local-bridge/ai/router.test.mjs local-bridge/publisher/pipeline.test.mjs`
  - live browser screenshots under `output/playwright/wire-korean-polish/`
  - API detail checks confirming regenerated deep reports now return Korean article-style titles/leads for the `Goose` and `Kampala` entries.

### Artemis Wire live dossier clustering

- Added `local-bridge/publisher/dossiers.mjs` to cluster related draft and published records into live Artemis Wire dossiers.
- Dossier clustering now combines items using:
  - explicit `dossierId` / `dossierKey`
  - source identity matches
  - repeated `topicHash`
  - overlapping title tokens and tags for the same story thread
- Scheduler draft creation now stamps `dossierKey` and `dossierId` onto new queue entries so later lifecycle steps keep the story linkage.
- Internal published records now store `dossierId` and `dossierKey`, allowing one live dossier to track both queued and already-published posts.
- `GET /api/publisher/state` now returns:
  - `dossiers`
  - `metrics.dossierCount`
- Added dossier coverage to `local-bridge/publisher/pipeline.test.mjs` and verified that a draft plus a related published post merge into one live dossier.
- Rebuilt the Artemis Wire operator panel so it now shows:
  - dossier overview
  - live dossier list
  - draft queue
  - published history
  - a detail pane that switches between dossier, draft, and published views
- `SignalsPage.tsx` now keeps dossier selection state and lets the operator pivot directly from a dossier to drafts or published history without losing the rest of the Artemis Wire context.
- `ActivityPage.tsx` now shows a `라이브 dossier` summary block so the tracked-story view is visible outside Signals.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - `node --test local-bridge/ai/router.test.mjs local-bridge/publisher/pipeline.test.mjs`
  - live browser screenshots under `output/playwright/wire-dossier/`

## 2026-04-16

### Source-agnostic publisher

- Generalized the older X-centric autopost workflow into a source-agnostic publishing pipeline under `local-bridge/publisher/`.
- Added provider-based ingestion modules for:
  - arXiv
  - Crossref
  - Semantic Scholar
  - News API
  - configured RSS/Atom feeds
  - legacy signal collection as a compatibility input
- Added a normalized content schema that keeps:
  - source type/provider
  - canonical/source URLs
  - title/subtitle
  - authors
  - publish timestamps
  - abstract/snippet
  - DOI/arXiv ids
  - tags
  - raw metadata
- Added source-agnostic draft generation for internal website publishing with Korean summary types:
  - `breaking`
  - `brief-points`
  - `paper-intro`
- Added generic dedupe and quality gates for:
  - canonical URL duplicates
  - DOI duplicates
  - arXiv duplicates
  - near-title duplicates
  - recent topic-hash reuse
  - low novelty
  - too-short or too-generic generated drafts
- Added a publisher abstraction with:
  - `internalPublisher`
  - optional `xPublisher`
- Kept internal publishing enabled by default and X publishing disabled by default unless credentials are configured.
- Added persistent runtime storage for the generic publisher:
  - queue
  - state
  - settings
  - logs
  - published history
- Added bridge APIs for source-agnostic publishing:
  - `GET /api/publisher/state`
  - `GET /api/publisher/queue`
  - `POST /api/publisher/run`
  - `PATCH /api/publisher/settings`
  - `POST /api/publisher/:id/approve`
  - `POST /api/publisher/:id/reject`
  - `POST /api/publisher/:id/publish`
- Expanded `SignalsPage.tsx` so the operations panel now manages source-agnostic publishing instead of assuming X is the only target.
- Expanded `ActivityPage.tsx` so the recent publish summary reflects internal publishing metrics and optional publisher status.
- Added `src/types/publisher.ts` plus new bridge client helpers in `src/lib/modelClient.ts`.
- Added `local-bridge/publisher/pipeline.test.mjs` to cover:
  - provider normalization
  - DOI/arXiv/url dedupe
  - title similarity dedupe
  - novelty gating
  - approval to scheduled transitions
  - cap overflow redirecting `publish now` back to `scheduled`
  - internal publish success
  - X-disabled fallback
  - restart recovery
- Added `/publisher/` to `.gitignore` so runtime queue and published feed files do not pollute commits.

### Source-agnostic publisher reader polish

- Added `src/features/publisher/PublisherArticle.tsx` to render draft and published internal posts as readable article-style content instead of raw preformatted text.
- The new article renderer now:
  - extracts heading-like lines into sections,
  - keeps bullet lists readable,
  - shows article metadata in a calmer reader header,
  - moves source links into a dedicated footer block.
- Updated `SignalsPage.tsx` so both:
  - `게시 초안`
  - `내부 게시 본문`
  use the article-style renderer instead of a plain text dump.
- Added article reader styling to `src/styles/pages/support.css`.
- Re-verified in a live browser session that the Signals publisher panel now renders the internal post as a multi-section article view rather than a small raw text box.

### X autopost pipeline

- Added a dedicated X autopost pipeline under `local-bridge/x-autopost/` instead of overloading the article auto-post flow.
- Added persistent queue, state, settings, and log storage for X publishing workflows under the runtime `x-autopost/` workspace directory.
- Added X autopost statuses:
  - `draft`
  - `approved`
  - `scheduled`
  - `posted`
  - `failed`
  - `skipped`
- Added draft generation that reuses signal-like source items, prefers Codex-generated Korean copy, and falls back to a rules-based X post builder when needed.
- Added draft metadata fields for:
  - source url/title/summary
  - topic hash
  - novelty score
  - generated text
  - scheduled/post timestamps
  - X post id
  - retry info
  - error and skip reasons
- Added guardrails for:
  - duplicate source urls
  - duplicate topic hashes inside a cooldown window
  - near-duplicate generated copy
  - low novelty
  - missing source urls when required
  - too-short or too-generic posts
  - banned certainty/clickbait phrases
- Added an official X publisher adapter that targets `POST /2/tweets` and uses environment-variable credentials only.
- Added publisher auth handling for:
  - direct user access token
  - refresh-token-based token renewal with client id and optional client secret
  - disabled or missing-auth dry-run fallback
- Added scheduler logic for:
  - hourly and daily publish caps
  - minimum interval spacing
  - retry backoff
  - persistent queue recovery after process restart
- Wired the bridge with new APIs:
  - `GET /api/x-autopost/state`
  - `GET /api/x-autopost/queue`
  - `POST /api/x-autopost/run`
  - `PATCH /api/x-autopost/settings`
  - `POST /api/x-autopost/:id/approve`
  - `POST /api/x-autopost/:id/reject`
  - `POST /api/x-autopost/:id/publish`
- Added frontend bridge client helpers and shared types for the X autopost API surface.
- Expanded `SignalsPage.tsx` with a new `X 자동 게시` operations tab that supports:
  - queue refresh
  - queue seeding from the current category
  - mode/cap/model settings
  - per-draft approve/reject/publish actions
  - recent operator and publish logs
- Added an Activity-page summary panel for recent X autopost counts and logs.
- Added branch-local tests in `local-bridge/x-autopost/pipeline.test.mjs` for queue generation, dedupe, scheduler interval, dry-run fallback, and publish state transitions.
- Added `/x-autopost/` to `.gitignore` so runtime queue output does not pollute commits, while keeping `local-bridge/x-autopost/` tracked.
- Verified end to end on the branch-local bridge and preview servers that:
  - a draft can be created,
  - duplicate source urls are skipped,
  - approval moves to scheduled on the next scheduler tick,
  - publish-now records a dry-run post when X auth is not configured,
  - Signals and Activity both show the new operating data in the UI.

### X autopost follow-up hardening

- Changed approval handling so a newly approved draft is scheduled immediately instead of waiting for the next scheduler poll loop just to get a slot.
- Updated queue-state bookkeeping so `nextPublishAt` is recalculated from the actual scheduled queue whenever:
  - a draft is approved,
  - scheduling runs,
  - a publish succeeds,
  - a publish is delayed or retried.
- Added a publish-window guard to `publishDraftNow()` so operator-triggered `publish now` also respects:
  - hourly cap
  - daily cap
  - minimum spacing interval
- When the current publish window is full, `publish now` now:
  - keeps the draft in the queue,
  - moves it to `scheduled`,
  - stores a human-readable reason with the next eligible slot instead of forcing an over-cap publish.
- Added tests for:
  - next-eligible publish-time calculation under the hourly cap
  - manual publish being deferred into `scheduled` instead of publishing immediately when the cap is full.

## 2026-04-15

### Settings pane refactor and screenshot refresh

- Split the settings models/runtime tab into dedicated UI-only sections so the premium shell branch no longer keeps all settings runtime/provider/agent JSX in one 1000-line file.
- Added focused section files for:
  - overview summary
  - local runtime cards
  - official provider cards
  - default official target selection
  - managed chat-agent editing
- Moved shared provider/runtime labels, status copy, and model parsing helpers into `src/features/settings/settingsModelsShared.ts`.
- Kept the settings screen behavior intact while making the main `SettingsModelsPane.tsx` a smaller state container.
- Re-ran lint, build, backend router tests, and fresh Playwright captures after the split to confirm there was no UI regression.
- Refreshed the public settings/files/chat/orchestration screenshots again from the latest reviewed premium-shell build so docs and marketing assets stay current.

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

### Artemis Wire publisher polish

- Reframed the generic source-agnostic publisher lane in `SignalsPage.tsx` as `Artemis Wire` so the UI now reads like a product feature instead of an internal engine label.
- Renamed the source-agnostic publisher layout classes from the old `x-autopost-*` naming to `publisher-*` in `src/styles/pages/support.css`.
- Upgraded the article reader in `src/features/publisher/PublisherArticle.tsx` so it now:
  - supports markdown-style section headings,
  - treats `•` as a bullet marker,
  - merges wrapped lines into real paragraphs,
  - uses a narrower centered article measure for easier reading.
- Improved the Artemis Wire detail panel in `SignalsPage.tsx` with:
  - readable mode labels,
  - readable summary/source-type chips,
  - clearer draft/published headers,
  - explicit publish-target and source metadata summaries.
- Improved the Signals copy so the three lanes are now clearer:
  - `실시간 시그널`
  - `Artemis Wire`
  - `심층 리포트`
- Added a recent Artemis Wire posts summary to `ActivityPage.tsx` so internal publishing output is visible from the activity screen and not only from Signals.
- Re-ran local verification after the UI pass:
  - `npm ci`
  - `npm run lint`
  - `npm run build`
  - `node --test local-bridge/ai/router.test.mjs local-bridge/publisher/pipeline.test.mjs`
  - Playwright browser checks on `#/signals` and `#/activity`
  - full-page screenshots saved to `output/playwright/wire-verify/signals-wire.png` and `output/playwright/wire-verify/activity-wire.png`

### Artemis Wire operator refactor

- Extracted the Artemis Wire operator tab out of `src/pages/SignalsPage.tsx` into `src/features/publisher/PublisherOperationsPanel.tsx`.
- Moved generic publisher defaults and shared label copy into `src/features/publisher/publisherUi.ts` so the page no longer owns fallback state factories and status-label helpers.
- Kept the operator behavior unchanged while making the page shell smaller and easier to maintain.
- Re-verified after extraction with:
  - `npm run lint`
  - `npm run build`
  - `node --test local-bridge/ai/router.test.mjs local-bridge/publisher/pipeline.test.mjs`
  - a browser smoke check on `#/signals` confirming the Artemis Wire tab still shows overview, policy, provider status, queue, and history sections.

### Chat cleanup pass

- Removed the extra chat-only runtime summary cards, alert stack, and bottom workflow panel from `src/CrewPages.tsx`.
- Hid the app-level top status row and sidebar status footer on the `chat` route in `src/App.tsx`.
- Simplified `src/features/chat/ChatSections.tsx` so the idle state keeps only a short starter prompt and quick action chips.
- Tightened `src/styles/pages/chat.css` so the chat page reads as one message surface plus composer instead of a dashboard.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright screenshots saved under `output/playwright/chat-cleanup/`

### Chat viewport fit fix

- Reworked `src/styles/pages/chat.css` so the chat page uses a fixed viewport-height shell and keeps the composer inside the first screen.
- Moved scrolling responsibility to the message list instead of the full page, preventing long conversations from pushing the input below the fold.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright viewport checks saved under `output/playwright/chat-fit/`

### Chat header and density trim

- Removed the remaining chat page title block so the top area now leaves the model selector as the only control above the conversation.
- Tightened the model trigger, assistant badges, and message bubble density to reduce vertical noise and keep more of the conversation visible at once.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright screenshot saved to `output/playwright/chat-fit/chat-desktop-polish.png`

### Chat continue pass in new workspace path

- Confirmed the active workspace moved to `Codex Workspace/Orchestration` and continued the chat cleanup on that copy instead of the old desktop path.
- Shortened chat composer hints, reduced idle-hero height, and tightened the model selector so the first screen stays focused on conversation and input.
- Re-ran hidden preview and bridge in this workspace and verified the chat viewport with:
  - `npm run lint`
  - `npm run build`
  - Playwright screenshot saved to `output/playwright/chat-continue/chat-desktop-current.png`

### Chat structure and idle-stage pass

- Moved the chat route implementation out of `src/CrewPages.tsx` into `src/features/chat/ChatPage.tsx` so the page switch file is small again and chat-specific logic now lives beside the other chat pieces.
- Simplified `src/features/chat/ChatSections.tsx` again so the idle copy is shorter and reads like a direct starting prompt instead of a dashboard intro.
- Changed `src/styles/pages/chat.css` so the idle screen no longer renders an empty message-thread container; the starter card now lives in its own idle stage above the composer while live conversations still use the scrollable thread layout.
- Re-verified with:
  - `npm run build`
  - Playwright idle-state checks on desktop and mobile
  - Playwright live-thread check on desktop after switching the chat model to `Codex CLI`
  - screenshots saved to:
    - `output/playwright/chat-cleanup/chat-idle-desktop.png`
    - `output/playwright/chat-cleanup/chat-idle-mobile.png`
    - `output/playwright/chat-cleanup/chat-live-desktop.png`

### Chat premium visual pass

- Reworked the chat route visuals in `src/styles/pages/chat.css` so the conversation area reads more like a deliberate dark stage instead of a plain panel:
  - layered grid-and-glow background,
  - stronger model selector capsule,
  - more distinct assistant/master message bubbles,
  - a heavier composer dock with clearer send emphasis.
- Expanded `src/features/chat/ChatSections.tsx` into a more intentional idle hero with:
  - current route badge,
  - compact model/input hints,
  - two-column action tiles for common starts.
- Kept the mobile first-screen compact by hiding the idle meta row and trimming the action tiles on narrow widths so the starter hero stays above the composer instead of being clipped.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright viewport measurements confirming the mobile idle hero ends before the composer starts
  - screenshots saved to:
    - `output/playwright/chat-style/chat-idle-desktop-premium.png`
    - `output/playwright/chat-style/chat-idle-mobile-premium.png`

### Chat live conversation pass

- Tuned the live conversation state in `src/features/chat/ChatPage.tsx` and `src/styles/pages/chat.css` so the non-idle view now reads like an active thread instead of the idle layout with messages dropped into it:
  - a sticky live-thread ribbon now keeps the current route/model context visible while scrolling,
  - master messages now show compact top metadata instead of a loose timestamp footer,
  - assistant and master bubbles use tighter readable widths,
  - the live composer dock is shorter so the message stack owns more of the viewport.
- Followed up with a bubble-width correction in `src/styles/pages/chat.css` so live message bubbles shrink to their content again instead of stretching like full-width dark panels.
- Re-verified the live state with:
  - `npm run lint`
  - `npm run build`
  - Playwright desktop, tablet, and mobile captures using a temporary persisted thread state
  - screenshots saved to:
    - `output/playwright/chat-live-pass/chat-live-desktop.png`
    - `output/playwright/chat-live-pass/chat-live-tablet.png`
    - `output/playwright/chat-live-pass/chat-live-mobile.png`
    - `output/playwright/chat-live-pass/chat-live-bubble-desktop.png`
    - `output/playwright/chat-live-pass/chat-live-bubble-mobile.png`

### Chat blocked composer pass

- Tightened the unavailable-input state in `src/features/chat/ChatPage.tsx` and `src/styles/pages/chat.css` so the idle composer no longer expands into a full write dock when the selected route is blocked.
- Replaced the blocked textarea path with:
  - a slim status strip,
  - a disabled single-line field,
  - a direct recovery hint in the footer,
  - a settings jump button that stays visible without dominating the dock.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright capture and viewport measurement on the blocked chat state
  - screenshot saved to:
    - `output/playwright/chat-disabled-pass/chat-disabled-after.png`

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

### Orchestration and settings premium density pass

- Refined `src/styles/pages/orchestration.css` so the orchestration workspace reads as a more deliberate premium operator surface without changing structure:
  - stronger stage shell and canvas framing,
  - clearer sticky control rail hierarchy,
  - more intentional status tiles, result cards, and log rows,
  - tighter mobile stacking and action emphasis.
- Refined `src/styles/pages/settings.css` so the settings models/runtime screen feels denser and easier to scan:
  - overview cards now read as summary tiles instead of flat boxes,
  - provider cards use clearer icon hierarchy and internal status surfaces,
  - official model targets and managed-agent rows now read as selected tiles,
  - split panes and disclosures hold together better on tablet and mobile.
- Re-verified with:
  - `npm run build` (currently blocked by an existing Vite CSS import resolution failure outside these files)
  - Playwright screenshots on desktop, tablet, and mobile using the running preview on `127.0.0.1:4173`
  - screenshots saved to:
    - `output/playwright/orchestration-settings-pass/orchestration-desktop.png`
    - `output/playwright/orchestration-settings-pass/orchestration-tablet.png`
    - `output/playwright/orchestration-settings-pass/orchestration-mobile.png`
    - `output/playwright/orchestration-settings-pass/settings-desktop.png`
    - `output/playwright/orchestration-settings-pass/settings-tablet.png`
    - `output/playwright/orchestration-settings-pass/settings-mobile.png`

## 2026-04-20 Premium Shell Consistency Pass

- Reworked the app shell in `src/App.tsx`, `src/components/ui/AppShell.tsx`, `src/icons.tsx`, and `src/styles/shell.css` so the workspace now reads as one premium operator surface instead of separate page-level layouts.
- Desktop now keeps a stronger sidebar identity block with workspace context and shortcut rail, while compact widths use a dedicated top mobile bar plus slide-in drawer instead of stacking navigation above content.
- Removed the duplicated top status strip from the main frame so runtime and page identity live in one consistent shell location.
- Upgraded shared primitives in `src/styles/primitives.css` so page headers, panels, status pills, stat cards, and empty states share the same layered styling language.
- Tightened `src/styles/pages/settings.css` and `src/styles/pages/orchestration.css` so settings overview/provider cards and orchestration stage/control/result surfaces now align with the shell and primitive system.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright desktop captures for chat, settings, orchestration, and files
  - Playwright mobile drawer capture for settings
  - screenshots saved under `output/playwright/site-polish/`

## 2026-04-20 Signals Activity And Drawer Pass

- Reworked `src/pages/ActivityPage.tsx` so the activity route now reads as an operator surface instead of stacked generic cards:
  - summary stat strip,
  - recent internal posts and live dossier spotlight,
  - provider status and throughput blocks,
  - separate journal lanes for wire logs and workspace activity.
- Expanded `src/styles/pages/support.css` into a shared operations-screen layer for `Signals` and `Activity`:
  - premium toolbar bars for tabs and filters,
  - upgraded feed cards and loading states,
  - shared `signals-ops-*` rail/detail layout,
  - text-first publisher queue cards,
  - stronger publisher detail blocks and activity timeline styling.
- Added the new layout hooks in `src/pages/SignalsPage.tsx` and `src/features/publisher/PublisherOperationsPanel.tsx` so feed, wire, and report tabs all inherit the same operations shell and detail framing.
- Finished the compact-shell drawer accessibility pass in `src/App.tsx`, `src/components/ui/AppShell.tsx`, and `src/styles/shell.css`:
  - mobile trigger now exposes `aria-expanded` and `aria-controls`,
  - drawer uses dialog semantics with modal focus trap,
  - body and document scroll lock while open,
  - focus returns to the trigger on close.
- Verified with:
  - `npm run lint`
  - `npm run build`
  - Playwright desktop captures for:
    - `Signals` feed
    - `Signals` wire tab
    - `Signals` report tab
  - `Activity`
  - Playwright mobile closed/open drawer capture plus drawer-state assertions
  - screenshots saved under `output/playwright/site-polish-pass2/`

## 2026-04-20 Artemis Clean Theme Pass

- Toned the premium shell down into a calmer Artemis direction instead of the earlier glow-heavy treatment:
  - `src/styles/tokens.css` now uses a muted charcoal and steel-blue palette,
  - `src/styles/shell.css` reduces frame/sidebar border contrast and heavy shadows,
  - `src/styles/primitives.css` removes extra header/stat/empty-state decoration so panels read as layout first.
- Reworked page-level styling to stop the UI from feeling overdesigned:
  - `src/styles/pages/support.css` now uses flatter operations panels and quieter status surfaces,
  - `src/styles/pages/settings.css` and `src/styles/pages/orchestration.css` were toned down to match the calmer shell and primitive system.
- Fixed the chat regressions that were making the refresh look worse than before:
  - `src/styles/pages/chat.css` now restores a neutral dark surface, simplifies the model trigger/composer chrome, and keeps the idle hero compact,
  - `src/styles/legacy.css` now overrides the old late-loading warm chat background/composer rules that were forcing the brown tint back in,
  - the mobile model menu no longer inherits the old `flex-basis: 220px` behavior, so the idle hero sits near the top instead of leaving a large empty block.
- Verification for this pass ran through hidden background processes only:
  - hidden preview on `127.0.0.1:4175`
  - hidden bridge on `127.0.0.1:4174`
  - headless Playwright captures saved under `output/playwright/theme-clean-pass/`
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - headless desktop/mobile Playwright captures for chat plus desktop captures for settings, signals, and activity

## 2026-04-20 Open WebUI Direction Pass

- Switched the chat route away from the earlier decorated premium treatment and toward a cleaner Open WebUI-style layout:
  - central single-column reading width,
  - near-empty page background,
  - much flatter surface hierarchy,
  - simpler blocked composer and prompt suggestions.
- Replaced `src/features/chat/ChatSections.tsx` with a shorter idle hero so the start state now behaves more like a real chat workspace instead of a dashboard card stack.
- Added late-loading chat overrides in `src/styles/legacy.css` so the older warm brown background/composer rules no longer win over the newer neutral layout direction.
- Simplified the shell again in `src/styles/shell.css`:
  - weaker frame/sidebar borders,
  - no shadow-heavy shell chrome,
  - primary action and active nav states now read closer to Open WebUI-style neutral controls.
- Re-verified with hidden preview/bridge processes and headless Playwright captures saved under `output/playwright/openwebui-pass/`:
  - `chat-desktop.png`
  - `chat-mobile.png`
  - `activity-desktop.png`
  - `settings-nav.png`

## 2026-04-20 Declutter Pass

- Reduced visible chrome further so the workspace reads cleaner at a glance instead of showing every secondary status block all the time.
- The sidebar now keeps only brand, new-chat action, and the navigation list as primary visible elements:
  - context card is hidden,
  - shortcut rail is hidden,
  - section labels and hotkey suffixes are hidden,
  - the mobile bar no longer shows the extra runtime status pill.
- The chat idle state was compressed again:
  - only two starter prompts stay visible by default,
  - the remaining prompt cards moved behind `예시 더 보기`,
  - the route chip under the starter hero is hidden.
- The blocked composer path is now one compact strip instead of several stacked boxes:
  - one status box,
  - one short recovery sentence,
  - one settings action.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - hidden preview and bridge processes
  - headless captures saved under `output/playwright/declutter-pass/`

## 2026-04-20 Sidebar Collapse Pass

- Collapsed the secondary workspace navigation behind one quiet `more` toggle so the shell no longer shows all support routes by default.
- Kept the always-visible navigation trimmed to the three core work surfaces:
  - `chat`
  - `files`
  - `orchestration`
- Updated the shared sidebar renderer in `src/components/ui/AppShell.tsx` so sections can opt into a collapsed state without changing drawer accessibility behavior.
- Updated `src/App.tsx` to mark the support navigation group as collapsible instead of always visible.
- Added flat toggle styling in `src/styles/shell.css` so the new control reads like a text row, not another card.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - hidden preview and bridge processes
  - headless captures saved under `output/playwright/declutter-pass2/`
  - desktop visible-nav check:
    - `chat/files/orchestration`
  - mobile drawer visible-nav check:
    - `chat/files/orchestration`

## 2026-04-21 Netflix Theme Pass

- Reframed the shared Artemis shell around a Netflix-like dark cinema direction instead of the earlier neutral operator palette:
  - deeper black surfaces,
  - restrained off-white typography,
  - red action and selection accents,
  - reduced blue glow leftovers.
- Updated the global design tokens in `src/styles/tokens.css` so the whole workspace now inherits:
  - darker base surfaces,
  - warmer text values,
  - red-first accent tokens,
  - slightly tighter radii and heavier shadows.
- Restyled the shared shell in `src/styles/shell.css`:
  - sidebar and main frame now read as matte black theater panels,
  - the primary action is now a strong red CTA,
  - active navigation uses a red rail instead of soft blue fill,
  - the accidental white focus outline around the main frame was removed.
- Restyled shared primitives in `src/styles/primitives.css`:
  - headers, panels, pills, notices, inputs, and buttons now follow the same cinema-dark system,
  - accent states now use the red token consistently instead of the older steel-blue.
- Restyled the chat route in `src/styles/pages/chat.css`:
  - idle hero now behaves more like a title poster than a dashboard card,
  - starter tiles now use dark film-strip surfaces instead of leftover blue cards,
  - live and blocked composer surfaces now match the shell,
  - master and assistant bubbles now sit inside a red/black conversation palette.
- Restyled settings, orchestration, signals, and activity surfaces in:
  - `src/styles/pages/settings.css`
  - `src/styles/pages/orchestration.css`
  - `src/styles/pages/support.css`
  so route-specific panels no longer pull the old blue gradients back into the UI.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - hidden preview and bridge processes
  - headless screenshots saved under `output/playwright/netflix-theme-pass/`
    - `chat-desktop-netflix.png`
    - `chat-mobile-netflix.png`
    - `settings-desktop-netflix.png`
    - `orchestration-desktop-netflix.png`
    - `signals-desktop-netflix.png`
    - `activity-desktop-netflix.png`

## 2026-04-21 Inline Image Delivery Guardrail

- Re-tested the Windows Codex desktop app image path after the first guardrail and confirmed that:
  - local filesystem markdown images are still unreliable,
  - direct raster `data:image/jpeg/png...` previews are also unstable for real screenshots,
  - tiny top-level `data:image/svg+xml...` images do render.
- Replaced the intermediate localhost-server attempt with a tighter rule based on the only confirmed-working entry point.
- Updated `scripts/build-inline-image-preview.ps1` so it now:
  - generates a <=10 KB JPEG thumbnail beside the source image,
  - wraps that raster thumbnail inside a top-level SVG payload,
  - prints ready-to-paste markdown that uses `data:image/svg+xml;base64,...`.
- Followed up by tuning the preview script for legibility instead of minimum payload:
  - raised the default preview width/quality,
  - switched the guardrail from raster byte size alone to final SVG data URI length,
  - kept the output under a safer inline ceiling while preserving more UI text detail.
- Captured the new operating rule in `memory/current_focus.md`:
  - inline preview via SVG wrapper,
  - original full-resolution capture still attached as a normal file link/card.

## 2026-04-21 Windows Inline Image Path Fix

- Reverse-engineered the current Windows Codex desktop markdown image path and confirmed the earlier SVG-wrapper rule was wrong.
- Verified from the extracted app bundle that the markdown image component:
  - accepts local filesystem paths that match the app's local-path check,
  - then reads those files through `read-file-binary`,
  - so the screenshot should be sent as a real filesystem path instead of a URL-form path.
- Confirmed the working Windows shape is:
  - `![alt](<C:/.../image.png>)`
- Confirmed the broken variants were caused by sending URL-style values instead of filesystem paths:
  - `</C:/...>`
  - `/C:/...`
  - `/@fs/...`
  - `file:///...`
  - percent-encoded spaces such as `%20`
  - SVG/data-URI wrappers for full screenshots
- Replaced `scripts/build-inline-image-preview.ps1` so it now:
  - normalizes the original source file into Codex's accepted inline-image path,
  - emits the ready-to-paste markdown image line,
  - emits the matching file-link line,
  - stops generating SVG wrapper thumbnails.
- Updated `memory/current_focus.md` so future sessions keep using the raw Windows filesystem image path rule.

## 2026-04-21 Windows Inline Image Root Cause Correction

- Corrected the previous Windows inline-image conclusion after tracing the failure from markdown parsing into the desktop app renderer.
- Confirmed with CommonMark that the markdown image form we were using:
  - `![alt](<C:/.../Codex Workspace/...png>)`
  automatically rewrites the space-containing path to:
  - `C:/.../Codex%20Workspace/...png`
- Confirmed from the extracted Codex desktop bundles that:
  - the renderer accepts local image sources that pass the app local-path check,
  - the image component then requests `read-file-binary`,
  - the main process normalizes Windows `/C:/...` paths back to a filesystem path before reading,
  - so the breakage was not the local-file reader itself, but the markdown destination being percent-encoded before it ever reached that reader.
- This explains why inline images used to work and later broke:
  - the earlier workspace path likely had no spaces,
  - the current `Codex Workspace` path introduces a space,
  - the markdown image destination encoding turns that space into `%20`,
  - the app then tries to read a non-existent local file path.
- Updated `scripts/build-inline-image-preview.ps1` again so it now emits:
  - a raw HTML image tag with a quoted local path source such as `<img src="/C:/.../Codex Workspace/...png" alt="..." />`,
  - the matching original file-link line for the capture.
- Updated `memory/current_focus.md` so future sessions keep using the raw HTML `img` rule instead of markdown image syntax for local Windows paths with spaces.

## 2026-04-21 Windows Inline Image Final Delivery Fix

- Corrected the raw HTML fallback immediately after verifying it in the desktop app:
  - assistant replies render `<img ...>` as literal text in this environment,
  - so HTML tags are not a viable inline-image transport here.
- Kept the confirmed root cause:
  - markdown image destinations with spaces under `Codex Workspace` get rewritten to `%20`,
  - that makes the app try to read a non-existent local file path.
- Updated `scripts/build-inline-image-preview.ps1` again so screenshot delivery now prefers paths with no spaces:
  - first use the real Windows short path returned by `Scripting.FileSystemObject`,
  - if no usable short path exists, copy the image to a no-space cache file under the temp directory and use that staged path,
  - always keep the original capture as a normal file link/card.
- Re-verified the current sample capture path generation:
  - `DELIVERY_MODE=short-path`
  - `INLINE_PATH=C:/Users/50106/Desktop/CODEXW~1/ORCHES~1/output/PLAYWR~1/NETFLI~1/CHAT-D~1.PNG`
  - `PASSES_APP_LOCAL_PATH_CHECK=true`
- Updated `memory/current_focus.md` so future sessions keep using the no-space markdown image rule instead of the earlier HTML fallback.

## 2026-04-21 Windows Inline Image Rule Locked

- Confirmed with the user that the short-path markdown image finally renders correctly in the Codex desktop app.
- Locked the operating rule in memory:
  - inline screenshots must use the no-space short path first,
  - the original full path stays only as a file link/card,
  - do not retry older failed transports in normal operation.

## 2026-04-21 Netflix Cleanup Follow-up

- Continued the Artemis shell/chat cleanup after the inline-image issue was resolved.
- Rewrote `src/features/chat/ChatSections.tsx` into a smaller idle entry block:
  - removed the older idle status-pill and `예시 더 보기` flow,
  - kept only route/model chips,
  - fixed the starter area to three direct action rows.
- Added a final cleanup pass in `src/styles/shell.css`:
  - reduced leftover cinema glow intensity,
  - flattened the sidebar and main frame surfaces,
  - toned down the `새 채팅` primary action shadow,
  - simplified active nav treatment and collapsed-section copy.
- Added a final cleanup pass in `src/styles/pages/chat.css`:
  - reduced hero framing and surface weight,
  - switched the starter prompts to flatter rows,
  - tightened the composer and model trigger,
  - kept the chat lane darker and quieter overall.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - hidden preview on `127.0.0.1:4175`
  - headless captures saved under `output/playwright/netflix-clean-pass/`
    - `chat-desktop-clean.png`
    - `chat-mobile-clean.png`
    - `settings-desktop-clean.png`

## 2026-04-21 Orchestration First-Viewport Cleanup

- Simplified `src/features/orchestration/OrchestrationSections.tsx`:
  - removed the old summary-pill header treatment from the stage,
  - collapsed the right rail into one `지금 실행` dock,
  - moved model status into the disclosure details area,
  - rewrote the visible section copy into shorter operator-focused Korean.
- Rebuilt `src/pages/OrchestrationPage.tsx` around the simpler orchestration shape:
  - removed the stage summary prop,
  - moved status tiles out of the first viewport and into details,
  - shortened the intro, template labels, run-state copy, and empty-state copy,
  - kept session logic, agent availability checks, and result rendering intact.
- Added a final cleanup override block to `src/styles/pages/orchestration.css`:
  - flattened panel and canvas surfaces,
  - widened the canvas relative to the right rail,
  - reduced padding, shadows, and decorative framing,
  - tightened chips, textarea, alert strip, and run button sizing,
  - added a dedicated detail-only status grid layout.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - headless Playwright captures under `output/playwright/orchestration-clean-pass/`
    - `orchestration-desktop-clean.png`
    - `orchestration-mobile-clean.png`
- Locked one more image-delivery guard after the user-facing regression:
  - long-path image previews shown during internal verification can still surface as broken media in the Codex desktop app,
  - future progress reporting should stay text-only unless a short-path markdown image is intentionally sent to the user.

## 2026-04-21 Internal Image Workflow Guard

- Tightened `scripts/build-inline-image-preview.ps1` so it now emits:
  - `SAFE_LOCAL_PATH`
  - the markdown line for user-facing delivery
  - the original file-link line
  - an explicit rule string warning against using the original long `SOURCE` path with `view_image`.
- Updated `memory/current_focus.md` to lock the workflow:
  - user-facing screenshots should stay text-only unless a short-path markdown image is intentionally sent,
  - internal image inspection must use only the script-emitted `SAFE_LOCAL_PATH`,
  - never call `view_image` with a long path that still contains spaces.

## 2026-04-21 Netflix Final Theme Pass

- Pushed the shell onto a stricter Netflix-like black/red system in `src/styles/shell.css`:
  - reduced the lingering cool glow,
  - flattened the main frame and sidebar,
  - simplified the active nav state,
  - removed the old blue-leaning focus feel.
- Flattened shared primitives in `src/styles/primitives.css` so cards, pills, inputs, disclosures, and buttons no longer read like a separate cold design language.
- Reworked the orchestration route surfaces in `src/styles/pages/orchestration.css`:
  - darker canvas shell and dock,
  - less decorative framing,
  - tighter agent chips and status tiles,
  - calmer detail panels.
- Corrected the orchestration canvas board tint in `src/OrchestrationCanvas.tsx` by replacing the previous cool-blue background dots with a neutral white-dot field.
- Overrode the late legacy flow styling in `src/styles/legacy.css` so the orchestration graph finally follows the same theme:
  - hub node now uses a red-dark emphasis,
  - worker nodes are matte black,
  - controls are darker and flatter,
  - edges use neutral/red state colors instead of icy blue.
- Re-verified the final theme pass with:
  - `npm run lint`
  - `npm run build`
  - headless captures under `output/playwright/netflix-final-pass/`
    - `orchestration-desktop-final.png`
    - `settings-desktop-final.png`
    - `chat-desktop-final.png`
- Reconfirmed live local runtime health after the pass:
  - preview `http://127.0.0.1:4173/` returned `200`
  - bridge `http://127.0.0.1:4174/api/health` returned `200`

## 2026-04-21 Branch And GitHub Cleanup

- Removed the stray untracked `decoded.txt` temp file before staging.
- Staged the current Artemis workspace changes as one intentional publish set instead of leaving them split across old branch history.
- Re-ran:
  - `npm run lint`
  - `npm run build`
- Committed the full workspace/publisher/UI cleanup on `feat/source-agnostic-publisher` as:
  - `7c63e99` `feat: consolidate Artemis workspace polish`
- Pushed the updated branch to GitHub.
- Deleted already-contained stale branches both locally and on GitHub:
  - `codex/artemis-routing-ui-polish`
  - `codex/ollama-health-stability`
  - `feat/premium-ui-shell`
  - `feat/x-autopost-pipeline`
- The repo branch surface is now intentionally reduced to:
  - `main`
  - `feat/source-agnostic-publisher`

## 2026-04-21 Orchestration Layout-First Pass

- Re-applied the orchestration route using the actual `frontend-skill` rules instead of only changing colors:
  - one primary workspace,
  - one slim execution dock,
  - no intro banner ahead of the task surface,
  - hidden results until the operator actually runs something.
- Updated `src/features/orchestration/OrchestrationSections.tsx`:
  - removed the stage `PanelCard` wrapper,
  - turned the right side into a simpler dock wrapper,
  - made the results panel return `null` until there is a running or completed session,
  - flattened the disclosure internals into simpler detail blocks instead of nested cards.
- Updated `src/pages/OrchestrationPage.tsx`:
  - removed `PageIntro` from the route,
  - let the orchestration stage become the first viewport immediately.
- Updated `src/styles/pages/orchestration.css`:
  - replaced the card-heavy first viewport with a layout-first composition,
  - widened the canvas and visually demoted the dock,
  - turned template actions and notices into lighter list-like treatments,
  - simplified result cards and detail blocks into divided sections.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - headless screenshot under `output/playwright/orchestration-layout-pass/orchestration-desktop-layout.png`

## 2026-04-21 Orchestration Dock Compression Pass

- Rebuilt `src/features/orchestration/OrchestrationSections.tsx` cleanly after the accidental delete and kept the route in the same workspace-first direction.
- Simplified the orchestration structure again:
  - the stage header no longer competes with the canvas,
  - the execution dock keeps only one active alert,
  - templates are trimmed to the first two quick starts,
  - quick starts disappear once the operator types into the task field,
  - results still stay hidden until a run is active or has completed,
  - details remain pushed below the fold inside one disclosure block.
- Tightened the dock surface in `src/styles/pages/orchestration.css`:
  - smaller chip height,
  - shorter textarea,
  - subtler placeholder,
  - less spacing around the dock and detail blocks.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - preview `http://127.0.0.1:4173/` returned `200`
  - bridge `http://127.0.0.1:4174/api/health` returned `200`
  - headless captures under `output/playwright/orchestration-dock-pass/`
    - `orchestration-desktop-dock.png`
    - `orchestration-desktop-dock-final.png`

## 2026-04-21 Orchestration Node Density Pass

- Tightened the orchestration graph without changing the underlying flow structure:
  - worker nodes now use concise titles through `conciseAgentLabel()` in `src/OrchestrationCanvas.tsx`,
  - official router nodes now read `공식 API`,
  - the gemma worker now reads `gemma4`,
  - worker and output nodes no longer render their subtitle rows.
- Added late flow-specific overrides in `src/styles/legacy.css` so the React Flow node sizes match the new quieter orchestration surface:
  - narrower worker/output node widths,
  - slightly smaller node titles,
  - smaller badges.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - headless capture under `output/playwright/orchestration-node-pass/orchestration-desktop-node-clean.png`

## 2026-04-21 Orchestration Minimal Surface Pass

- Flattened the orchestration route further without changing the flow model:
  - removed the canvas help chip from `src/OrchestrationCanvas.tsx`,
  - removed the stage and dock section headers from `src/features/orchestration/OrchestrationSections.tsx`,
  - stopped rendering info-only orchestration alerts,
  - hid the results panel until there is actual output instead of showing an empty running placeholder,
  - shortened the disclosure label to one `상세 보기` row.
- Tightened the first viewport again in `src/styles/pages/orchestration.css`:
  - wider canvas / narrower dock split,
  - cardless dock section treatment,
  - hidden flow controls until the canvas is hovered,
  - worker/output node badges hidden,
  - orchestration disclosure reduced to a thin divider row.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - preview `http://127.0.0.1:4173/` returned `200`
  - bridge `http://127.0.0.1:4174/api/health` returned `200`
  - headless captures under `output/playwright/orchestration-minimal-pass/`
    - `orchestration-desktop-minimal-final.png`
    - `orchestration-mobile-minimal-final.png`

## 2026-04-21 Orchestration Mobile Ordering Pass

- Continued the orchestration cleanup specifically for narrow layouts:
  - mobile now places the execution rail before the canvas by reordering the split-pane grid items,
  - the inline starter template row is hidden on narrow widths to reduce clutter,
  - the mobile canvas height is reduced so the first scroll covers more of the actionable UI,
  - flow zoom controls are hidden on mobile,
  - the agent chip label in `src/pages/OrchestrationPage.tsx` now renders through a dedicated label span so long model names truncate cleanly.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - headless capture under `output/playwright/orchestration-mobile-pass3/orchestration-mobile-pass3.png`

## 2026-04-21 Workspace Overhaul Final

- Reworked the workspace around the user's direct complaints instead of continuing the earlier theme-only pass.
- Added `src/components/ui/FormattedText.tsx` and switched chat/orchestration rich text surfaces to it so raw markdown markers no longer leak into visible output.
- Rewrote `src/pages/SkillsPage.tsx` into a simpler store-like list:
  - icon,
  - title,
  - one-line purpose summary,
  - source label,
  - toggle,
  - hidden detail disclosure for examples and paths.
- Rewrote `src/pages/ActivityPage.tsx` into a smaller operations view with summary stats, recent execution flow, and live tracked issue bundles.
- Rebuilt `src/features/publisher/PublisherOperationsPanel.tsx` into a much simpler operator rail:
  - overview,
  - pending review queue,
  - dossier list,
  - published history,
  - collapsed settings and source status.
- Simplified `src/pages/SignalsPage.tsx` top-level copy and labels:
  - `실시간`,
  - `게시 큐`,
  - `생성 글`,
  - shorter search placeholders and action labels,
  - removed the earlier `아르테미스 와이어` / `심층 리포트` naming from the visible surface.
- Fixed workspace bootstrap fallback:
  - `src/state/AppState.tsx` now retries with default workspace root when a persisted root/path is stale,
  - `local-bridge/workspace.mjs` now resolves back to `DEFAULT_WORKSPACE_ROOT` when a requested root no longer exists.
- Cleaned follow-up build blockers introduced during the rewrite pass:
  - removed an unused import in `src/pages/ActivityPage.tsx`,
  - memoized `officialProviderStates` in `src/pages/OrchestrationPage.tsx`,
  - tightened the orchestration alert action typing in `src/features/orchestration/OrchestrationSections.tsx`,
  - repaired corrupted routing helper strings in `src/state/AppState.tsx`.
- Re-verified with:
  - `npm run lint`
  - `npm run build`
  - headless Playwright captures under `output/playwright/workspace-overhaul-final/`
    - `skills-final.png`
    - `activity-final.png`
    - `signals-publisher-final.png`
    - `orchestration-final.png`

## 2026-04-22 Workspace UX Reset

- Created a new cleanup branch: `codex/workspace-ux-reset`.
- Added dedicated page stylesheet imports in `src/App.css` for:
  - `src/styles/pages/skills.css`
  - `src/styles/pages/activity.css`
- Rewrote `src/pages/SkillsPage.tsx` again around a stricter operator-friendly surface:
  - icon
  - skill name
  - one-line summary
  - source/state pills
  - single toggle action
  - collapsed detail for path/example only
- Rewrote `src/pages/ActivityPage.tsx` into a smaller operations inbox:
  - summary strip
  - recent execution flow
  - live tracked dossier list
  - runtime status stack
- Reworked orchestration support surfaces in `src/features/orchestration/OrchestrationSections.tsx`:
  - the dock is now one `실행 준비` block,
  - result cards parse and de-noise raw JSON error payloads,
  - detail disclosure copy was rewritten in clean Korean.
- Tightened the orchestration first-screen scan in `src/pages/OrchestrationPage.tsx`:
  - shortened selected model chip labels,
  - kept only two starter templates,
  - preserved direct run flow.
- Added final orchestration style overrides in `src/styles/pages/orchestration.css` to make the board + dock composition flatter and less card-heavy.
- Verified the reset branch with:
  - `npm run lint`
  - `npm run build`
  - headless Playwright captures under `output/playwright/workspace-ux-reset/`
    - `orchestration-desktop.png`
    - `skills-desktop.png`
    - `activity-desktop.png`
    - `orchestration-mobile.png`
    - `skills-mobile.png`
    - `activity-mobile.png`
## 2026-04-22 Workspace UX Reset - Pass 2

- Rebuilt the orchestration route again around a top command rail instead of the previous right-side dock.
- Rewrote `src/pages/OrchestrationPage.tsx` with clean Korean operator copy and safer alert/status wording.
- Rebuilt `src/features/orchestration/OrchestrationSections.tsx` so the orchestration surface now renders:
  - command rail
  - results panel
  - compact details disclosure
  with simpler visual hierarchy.
- Tightened the flow board in `src/OrchestrationCanvas.tsx`:
  - smaller board dimensions
  - tighter `fitView`
  - hidden default flow controls.
- Reworked `src/pages/SkillsPage.tsx` into grouped catalog sections using path-family grouping instead of flat list sorting.
- Removed the default per-item disclosure block from the skills list and compressed the row structure in `src/styles/pages/skills.css`.
- Added/updated verification captures under:
  - `output/playwright/workspace-ux-reset-pass2/`
    - `orchestration-desktop.png`
    - `skills-desktop.png`
    - `activity-desktop.png`
    - `orchestration-mobile.png`
    - `skills-mobile.png`
- Verification:
  - `npm run lint`
  - `npm run build`
  - preview `http://127.0.0.1:4173/` = 200
  - bridge `http://127.0.0.1:4174/api/health` = 200

## 2026-04-22 Workspace UX Reset - Pass 3

- Added shared UI sanitation helpers in `src/crewPageHelpers.ts` for clipped text, provider display names, routing failure labels, and raw error cleanup.
- Rewrote `src/state/runtimeReducer.ts` to stop appending raw backend errors directly into chat/activity surfaces.
- Updated `src/state/AppState.tsx` so bridge/workspace/chat/orchestration failures now pass through Korean operator-facing fallback messages.
- Cleaned `src/features/chat/ChatPage.tsx` routing meta text so provider names and retry reasons render as readable Korean labels.
- Updated `src/features/publisher/PublisherOperationsPanel.tsx` and `src/features/publisher/publisherUi.ts` to remove provider slug leakage and sanitize draft/source/runtime errors.
- Repaired the remaining corrupted Korean strings in `src/pages/SignalsPage.tsx`, including:
  - real-time feed actions
  - scheduler state
  - generation settings
  - generated posts list/detail
  - media/source/log sections
- Normalized the remaining mixed-language CTA in `src/pages/ActivityPage.tsx`.
- Verification:
  - `npm run lint`
  - `npm run build`
  - preview `http://127.0.0.1:4173/` = 200
  - bridge `http://127.0.0.1:4174/api/health` = 200
  - headless Playwright captures under `output/playwright/workspace-ux-reset-pass3/`

## 2026-04-22 Workspace UX Reset - Pass 4

- Reworked the generated-posts screen in `src/pages/SignalsPage.tsx` and `src/styles/pages/support.css` around a narrower left rail plus a wider reading workspace.
- Moved generated-post settings behind a soft disclosure and added dedicated layout hooks:
  - `signals-ops-shell--posts`
  - `signals-posts-rail`
  - `signals-posts-workspace`
  - `signals-posts-settings-disclosure`
  - `signals-post-hero__facts`
- Rebuilt `OrchestrationResultCard` in `src/features/orchestration/OrchestrationSections.tsx` into a split layout:
  - left rail for title/provider/status/meta
  - right content area for formatted body + recent logs
- Updated `src/pages/OrchestrationPage.tsx` to use `conciseAgentLabel(agent)` in the result cards so long model titles no longer dominate the row.
- Added final result-panel overrides in `src/styles/pages/orchestration.css` so orchestration results render as a vertical list instead of equal-width cards.
- Verification:
  - `npm run lint`
  - `npm run build`
  - preview `http://127.0.0.1:4173/` = 200
  - bridge `http://127.0.0.1:4174/api/health` = 200
  - headless Playwright captures under `output/playwright/workspace-ux-reset-pass4/`
    - `signals-posts-desktop.png`
    - `signals-posts-mobile.png`
    - `orchestration-results-desktop.png`
    - `orchestration-results-mobile.png`
