# Current Focus

## Priority

1. Keep the Artemis workspace stable and easy to scan.
2. Keep chat simple and conversation-first.
3. Make orchestration clearly single-model in chat, parallel in orchestration.
4. Prevent public screenshots and docs from leaking local machine details.

## Current Goals

- Keep the official API router usable without turning the UI into a dashboard.
- Keep settings understandable: local runtimes first, official providers second.
- Keep orchestration interactive instead of decorative.
- Keep the Hermes-style Codex workflow files usable for future sessions.

## Latest Confirmed State

- `4173` preview responds normally.
- `4174` bridge responds normally.
- Ollama exposes only `gemma4-E4B-uncensored-q4fast:latest`.
- Settings shows a dedicated local runtime section for `Ollama 로컬` and `Codex CLI`.
- `/api/health` now returns local runtime timestamps plus stale/error fields instead of dropping Ollama state on transient failures.
- Settings keeps the last confirmed local runtime state when local health refresh fails, and the Ollama card still shows model count, current model, and the latest warning/error.
- The temporary duplicated comment block from the local-runtime hotfix has been removed from `SettingsPage.tsx`.
- The orchestration canvas supports pan and zoom again.
- The pre-run orchestration flow is now reduced to `입력 -> 병렬 허브 -> 출력`.
- When a task is typed into orchestration, the selected models expand into parallel worker blocks.
- Orchestration now keeps the last session task, selected models, and result cards even after leaving and returning to the page.
- Orchestration now shows per-model readiness or latest run state inline, so Codex CLI / official router / Ollama status is visible without opening settings.
- Chat now shows the currently selected model's real readiness/status inline, so Codex CLI / Ollama / official router connection state is visible before sending.
- Files now keeps the connected workspace root path visible in the connect input instead of showing an empty field after the root is already attached.
- Files delete actions now require an extra in-app confirmation click before the browser confirm dialog, reducing accidental local deletions from the list view.
- Official provider cards now show a recent status line and are wrapped in real forms, removing the repeated password-without-form browser warnings on settings.
- Public screenshots were regenerated after the flow change and no longer expose absolute workspace paths.
- The public settings screenshot was regenerated after the local runtime stability fix.

## Next Checks

- Keep orchestration labels readable without truncation.
- Keep the official-router worker label short enough to scan at a glance.
- Re-check screenshots whenever orchestration labels or workspace labels change.
- Watch whether local-health warnings should eventually be separated from the shared app-wide `bridgeError` channel.
- Revisit orchestration spacing only if the interactive layout regresses again.
- Revisit official free-router preflight so stale provider checks do not still look "ready" before a new test.
- Decide later whether the chat workspace-write hint should become prompt-aware instead of always showing for non-Codex models when a workspace is connected.

## 2026-04-15 Follow-up

- The orchestration board now behaves in two states:
  - idle: minimal flow
  - draft/running: parallel worker flow
- The current worker labels verified in-browser are:
  - `GPT-5.4`
  - `공식 무료`
  - `gemma4 E4B`
- The latest public orchestration screenshot shows the parallel worker state instead of the old all-nodes-everywhere layout.
- Public settings screenshots now use a dedicated doc-screenshot mode that strips saved provider state before capture.
