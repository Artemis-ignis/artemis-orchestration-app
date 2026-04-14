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

## Next Checks

- Confirm the settings collapsible sections still read well on smaller widths.
- Decide whether the chat model picker should default to the official router or keep the current agent.
- Revisit orchestration spacing only if the interactive layout regresses again.
