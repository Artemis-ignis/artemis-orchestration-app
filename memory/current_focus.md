# Current Focus

## Priority

1. Keep the existing Artemis workspace stable and easy to scan.
2. Reduce UI density before adding more features.
3. Make orchestration runs observable while they are still in progress.
4. Keep the Hermes-style Codex workflow files usable for future sessions.

## Current Goals

- Treat official API routing as production-like behavior instead of a demo.
- Keep chat focused on conversation, not dashboards and status clutter.
- Keep settings understandable: connect providers, choose routing, then manage agents.
- Keep orchestration interactive and verifiable instead of decorative.

## Latest Confirmed State

- `4173` preview responds normally.
- `4174` bridge responds normally.
- Ollama readiness is expected to expose only `gemma4-E4B-uncensored-q4fast:latest`.
- The official router now has both first-token timeout and stream idle-timeout handling.
- Official-router orchestration runs now require a ready official provider before the run button is enabled.
- Settings `실행기 · 에이전트 · API` is split into collapsible sections.
- Chat routing details are only shown when an actual fallback or provider error occurred.
- Settings now exposes a dedicated `0. 로컬 실행기` section before the official API section.
- The local section shows both `Ollama 로컬` and `Codex CLI` with live readiness and current model labels.
- When Ollama is temporarily unavailable, the bridge now returns the real failure detail instead of a generic `모델이 없습니다` message.
- Orchestration no longer renders absolute workspace paths in the visible run dock; public-facing screenshots should show only safe labels such as `루트 작업 폴더`.

## Next Checks

- Confirm the settings collapsible sections still read well on smaller widths.
- Decide whether the chat model picker should default to the official router or keep the current agent.
- Revisit orchestration spacing only if the interactive layout regresses again.
- Keep public screenshots regenerated from the demo workspace whenever orchestration UI labels change.

## 2026-04-15 Follow-up

- The orchestration board is back on a flowchart-style React Flow canvas instead of a fixed illustration.
- The canvas supports pan and zoom again while keeping nodes locked in place for consistent alignment.
- The saved runtime state now prefers `agent-ollama` whenever the stored model provider is already `ollama`.
- Current browser verification shows the local runtime section rendering in settings and the Ollama agent available in orchestration.
- The remaining UX risk is that Codex and Ollama still return final answers in one batch, so the live panel can only show progress logs before the final response arrives.
