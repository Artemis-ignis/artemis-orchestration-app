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
- The orchestration canvas supports pan and zoom again.
- The pre-run orchestration flow is now reduced to `입력 -> 병렬 허브 -> 출력`.
- When a task is typed into orchestration, the selected models expand into parallel worker blocks.
- Public screenshots were regenerated after the flow change and no longer expose absolute workspace paths.

## Next Checks

- Keep orchestration labels readable without truncation.
- Keep the official-router worker label short enough to scan at a glance.
- Re-check screenshots whenever orchestration labels or workspace labels change.
- Revisit orchestration spacing only if the interactive layout regresses again.

## 2026-04-15 Follow-up

- The orchestration board now behaves in two states:
  - idle: minimal flow
  - draft/running: parallel worker flow
- The current worker labels verified in-browser are:
  - `GPT-5.4`
  - `공식 무료`
  - `gemma4 E4B`
- The latest public orchestration screenshot shows the parallel worker state instead of the old all-nodes-everywhere layout.
