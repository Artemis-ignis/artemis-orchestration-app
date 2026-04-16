# Open Questions

## Current Assumptions

- Master is prioritizing the existing Artemis workspace UX over a separate public landing experience.
- Hermes-style workflow documents and memory files should stay lightweight and practical instead of growing into a large framework.
- Local Ollama remains a single-model runtime for now unless more local models are intentionally added.

## Still Unresolved

- Confirm one real X user-context publish on this branch once live credentials are available.
- Decide whether approval mode should keep scheduler-only slot assignment or expose a manual `schedule now` operator action too.
- Decide whether skipped queue items should remain in the main queue list or move into a separate audit history after a retention period.
- Verify the remaining official-provider paths end to end, especially Google, OpenRouter, and Gemini flows.
- Decide whether the secondary navigation groups should collapse by default to reduce first-screen density further.
- Re-check public screenshots whenever workspace labels, runtime cards, or orchestration labels change again.

## 2026-04-15 Auto-post Follow-ups

- Decide whether auto-post generation should always create one deep-dive article or optionally create a bundled multi-topic article when the top candidates are too weak individually.
- Decide whether detailed auto-post JSON responses should stop returning absolute local `htmlFilePath` and `jsonFilePath` values.
- Decide whether a second lighter fallback model should be configured when `gpt-5.4-mini` generation is slow or temporarily unavailable.
- Decide whether old generated posts should be pruned automatically after a retention window or kept indefinitely in the local workspace.
