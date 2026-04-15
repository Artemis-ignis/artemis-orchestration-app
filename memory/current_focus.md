# Current Focus

## Priority

1. Keep the Artemis workspace stable and easy to scan.
2. Keep chat simple and conversation-first.
3. Make orchestration clearly single-model in chat and parallel in orchestration.
4. Prevent public screenshots and docs from leaking local machine details.

## Current Goals

- Keep the official API flow simple: connect provider, save one model, run it directly.
- Keep settings understandable: local runtimes first, official providers second.
- Keep orchestration interactive and execution-first instead of decorative.
- Keep the Hermes-style Codex workflow files usable for future sessions.

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

## Next Checks

- Keep orchestration labels readable without truncation.
- Keep official direct-model labels short enough to scan at a glance.
- Re-check screenshots whenever orchestration labels or workspace labels change.
- Watch whether local-health warnings should eventually be separated from the shared app-wide `bridgeError` channel.
- Re-check whether the worker badge copy should stay `execution standby` or become a shorter label after more live use.
- Revisit provider preflight detail strings stored in bridge state so stale saved status text also loses the legacy free-candidate wording at the API level.
- Decide later whether the chat workspace-write hint should become prompt-aware instead of always showing for non-Codex models when a workspace is connected.
- Decide later whether the sidebar itself should collapse secondary menus by default; this pass reduced density but did not change the navigation model yet.

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
