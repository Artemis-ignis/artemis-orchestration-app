# Change Log

## 2026-04-15

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
