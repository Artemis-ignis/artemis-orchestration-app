# Current Focus

## Priority

1. Keep the Artemis workspace stable and easy to scan.
2. Keep chat simple and conversation-first.
3. Make orchestration clearly single-model in chat, parallel in orchestration.
4. Prevent public screenshots and docs from leaking local machine details.

## Current Goals

- Keep the official API flow simple: connect provider, save one model, run it directly.
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
- The old official free-routing UI is gone; settings now keeps only official provider connection plus a saved default model target.
- A fresh browser session now pulls the saved official provider/model from bridge AI settings and applies it to the official API agent on boot.
- Chat now shows the saved official target as `공식 API`, and official execution failures surface as `선택한 공식 API 호출이 실패했습니다.` instead of the old free-candidate failure copy.
- Orchestration now shows the official worker as the real saved model label (`DeepSeek R1` in the current setup) instead of collapsing to `free`.
- Orchestration progress logs were cleaned up so live status text is readable Korean instead of mojibake.
- The settings quick-pick list now keeps the current official model plus saved custom model ids visible first, so custom OpenRouter entries such as `openrouter/elephant-alpha` no longer disappear behind the top-8 cutoff.
- Settings now starts with a compact overview card row, keeps `로컬 실행기 상태` and `기본 공식 모델` frontmost, and leaves provider-key editing collapsed by default so the page is less step-heavy.
- Chat now uses a compact status rail instead of stacking multiple warning/info banners before the conversation surface.
- Orchestration now keeps a permanent `실행 결과` area visible even before the first run, so users can see where results will appear without guessing.
- Orchestration now shows per-model readiness as compact status tiles instead of repeating full-width banners.
- Public screenshots were regenerated after the flow change and no longer expose absolute workspace paths.
- The public settings screenshot was regenerated after the local runtime stability fix.

## Next Checks

- Keep orchestration labels readable without truncation.
- Keep official direct-model labels short enough to scan at a glance.
- Re-check screenshots whenever orchestration labels or workspace labels change.
- Watch whether local-health warnings should eventually be separated from the shared app-wide `bridgeError` channel.
- Revisit orchestration spacing only if the interactive layout regresses again.
- Revisit provider preflight detail strings stored in bridge state so stale saved status text also loses the legacy free-candidate wording at the API level.
- Decide later whether the chat workspace-write hint should become prompt-aware instead of always showing for non-Codex models when a workspace is connected.
- Decide later whether the sidebar itself should collapse secondary menus by default; this pass reduced density but did not change the navigation model yet.

## 2026-04-15 Follow-up

- The orchestration board now behaves in two states:
  - idle: minimal flow
  - draft/running: parallel worker flow
- The current worker labels verified in-browser are:
  - `GPT-5.4`
  - `DeepSeek R1`
  - `gemma4 E4B`
- The latest public orchestration screenshot shows the parallel worker state instead of the old all-nodes-everywhere layout.
- Public settings screenshots now use a dedicated doc-screenshot mode that strips saved provider state before capture.
