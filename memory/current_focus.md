# Current Focus

## Priority

1. Keep the Artemis workspace stable and easy to scan.
2. Keep chat simple and conversation-first.
3. Make orchestration clearly single-model in chat and parallel in orchestration.
4. Prevent public screenshots and docs from leaking local machine details.

## Current Goals

- Keep the official API flow simple: connect provider, save one model, run it directly.
- Keep settings understandable: local runtimes first, official providers second.
- Keep the settings models/runtime pane split into maintainable sections instead of one giant file.
- Keep orchestration interactive and execution-first instead of decorative.
- Keep the Hermes-style Codex workflow files usable for future sessions.
- Keep the premium UI shell consistent across chat, files, settings, and orchestration.

## Latest Confirmed State

- `4173` preview responds normally.
- `4174` bridge responds normally.
- Ollama exposes only `gemma4-E4B-uncensored-q4fast:latest`.
- Settings shows dedicated local runtime cards for `Ollama` and `Codex CLI`.
- `/api/health` now returns local runtime timestamps plus stale and error fields instead of dropping Ollama state on transient failures.
- Settings keeps the last confirmed local runtime state when local health refresh fails, and the Ollama card still shows model count, current model, and the latest warning or error.
- The old official free-routing UI is gone; settings now keeps only official provider connection plus a saved default model target.
- A fresh browser session now pulls the saved official provider and model from bridge AI settings and applies it to the official API agent on boot.
- The settings quick-pick list now keeps the current official model plus saved custom model ids visible first, so custom OpenRouter entries such as `openrouter/elephant-alpha` no longer disappear behind the top-8 cutoff.
- Settings now starts with a compact overview card row, keeps local runtime state and the saved official target frontmost, and leaves provider-key editing collapsed by default.
- Chat now uses a compact status rail and shows the selected model's real readiness inline before sending.
- Files keeps the connected workspace root path visible in the connect input and now requires an extra in-app confirmation step before delete.
- Orchestration keeps the last session task, selected models, and result cards even after leaving and returning to the page.
- Orchestration now keeps a permanent result area visible even before the first run, so users can see where outputs will appear.
- The orchestration canvas supports pan and zoom.
- The orchestration canvas is now execution-first:
  - idle: `input -> parallel hub -> result`
  - draft or running: `input -> parallel hub -> workers -> result`
- The main parallel graph no longer mixes in decorative side nodes such as memory, files, insights, or activity.
- Worker badges now separate readiness from execution history:
  - connected runtime with no run -> `connected`
  - connected runtime after a session exists but before that worker starts -> `execution standby`
  - unavailable runtime -> `not ready`
  - running, success, or error -> live run state
- Codex CLI no longer falls back to a misleading idle badge just because no recent run object exists.
- Orchestration progress logs were cleaned up so live status text is readable Korean instead of mojibake.
- Public screenshots were regenerated after the flow changes and no longer expose absolute workspace paths.
- The public settings screenshot was regenerated after the local runtime stability fix.
- The premium shell branch now has a second UI pass focused on consistency instead of one-off styling:
  - `SettingsPage.tsx` was reduced to a tab shell, and the models tab moved into `src/features/settings/SettingsModelsPane.tsx`.
  - `SettingsProfilePane.tsx` and `SettingsPreferencesPane.tsx` were rewritten with cleaner copy and calmer panel hierarchy.
  - Chat now shortens visible workspace context to a folder label instead of exposing a full absolute path in the idle workspace card and bottom context rail.
  - Chat idle state now uses a proper hero block plus a quieter side context panel instead of looking like a large empty void.
  - Files now uses a wider split pane, clearer hover states, a more intentional empty inspector panel, and a collapsed root-path card so absolute local paths do not dominate the main workspace by default.
  - Orchestration now gives the canvas more breathing room and keeps the control rail visually quieter and sticky on desktop.
  - Settings cards now use flatter, more consistent surface rules and reduced nested-card noise.
  - Desktop, tablet, and mobile screenshots were re-reviewed from the premium shell branch after the second pass.
  - `docs/screenshots` and `public/marketing` now use the refreshed premium-shell captures for chat, files, settings, and orchestration.
  - A tracked-text scan for the literal local workspace path and username returned no matches before preparing the branch for push.
- The settings models/runtime tab is now split into focused section files:
  - `SettingsOverviewSection.tsx`
  - `SettingsLocalProvidersSection.tsx`
  - `SettingsOfficialProvidersSection.tsx`
  - `SettingsOfficialTargetSection.tsx`
  - `SettingsManagedAgentsSection.tsx`
  - shared helper logic in `settingsModelsShared.ts`
- `SettingsModelsPane.tsx` is now a hook-and-state container instead of the place where all settings JSX lives.

## Next Checks

- Keep orchestration labels readable without truncation.
- Keep official direct-model labels short enough to scan at a glance.
- Re-check screenshots whenever orchestration labels or workspace labels change.
- Watch whether local-health warnings should eventually be separated from the shared app-wide `bridgeError` channel.
- Re-check whether the worker badge copy should stay `execution standby` or become a shorter label after more live use.
- Revisit provider preflight detail strings stored in bridge state so stale saved status text also loses the legacy free-candidate wording at the API level.
- Decide later whether the chat workspace-write hint should become prompt-aware instead of always showing for non-Codex models when a workspace is connected.
- Decide later whether the sidebar itself should collapse secondary menus by default; this pass reduced density but did not change the navigation model yet.
- Split `CrewPages.tsx` further if another chat-focused pass is scheduled; the chat page now uses extracted sections but the file is still large.
- Split the managed-agent settings section further only if agent editing grows again; it is smaller now but still one of the denser settings areas.

## 2026-04-15 Follow-up

- The orchestration board now behaves in two states:
  - idle: minimal flow
  - draft or running: parallel worker flow
- The parallel worker flow now stays visually simple:
  - input
  - parallel hub
  - selected workers
  - one result node
- The current worker labels verified in-browser are:
  - `GPT-5.4`
  - `DeepSeek R1`
  - `gemma4 E4B`
- The current worker badges verified in-browser are:
  - `connected`
  - `execution standby`
  - `running`
  - `done`
  - `failed`
- The latest public orchestration screenshot shows the parallel worker state instead of the old all-nodes-everywhere layout.
- Public settings screenshots now use a dedicated doc-screenshot mode that strips saved provider state before capture.

## 2026-04-15 Auto-post Generator

- The signals stack now has a second lane for `auto-generated posts` built on top of the existing signal collectors instead of replacing them.
- The bridge now starts an hourly auto-post scheduler and persists scheduler state, settings, dedupe hashes, and generated post ids under `generated-posts/`.
- Auto-post runs now store both article files and metadata files:
  - `generated-posts/YYYY-MM-DD/{timestamp}-{slug}.html`
  - `generated-posts/YYYY-MM-DD/{timestamp}-{slug}.json`
  - `generated-posts/index.json`
  - `generated-posts/state.json`
- Auto-post runs now cache media assets under `media-cache/` and can fall back to Playwright screenshots when OG media is missing.
- The scheduler currently defaults to:
  - enabled
  - `intervalMs = 3600000`
  - `topK = 1`
  - `generationModel = gpt-5.4-mini`
  - screenshot fallback enabled
- The signals page now has two tabs:
  - live signals
  - auto-generated posts
- The auto-post tab now supports:
  - scheduler status
  - settings patching
  - immediate run
  - post list
  - HTML preview
  - regenerate
  - export
  - reveal folder
- Manual verification confirmed one real generated article was saved locally and rendered in the browser preview.
- Runtime-generated article files and media cache are now gitignored so test output does not pollute the repo.

## Next Checks

- Watch whether hourly generation time stays acceptable when the bridge is also serving chat and orchestration traffic.
- Decide whether the default generation model should stay `gpt-5.4-mini` or become configurable per category with a lighter fallback chain.
- Consider trimming absolute local file paths from detailed auto-post API responses if the same API is ever exposed outside localhost.
