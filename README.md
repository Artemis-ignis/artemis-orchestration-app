<!-- ARTEMIS-IGNIS-TOP:START -->
<p align="center">
  <img src="docs/assets/artemis-ignis-emblem-top.jpg" alt="Artemis-Ignis emblem" width="420" />
</p>
<!-- ARTEMIS-IGNIS-TOP:END -->

# Artemis Orchestration App

<!-- ARTEMIS-IGNIS-BADGE-BAR:START -->
<p align="center">
  <img alt="Artemis-Ignis project" src="https://img.shields.io/badge/Artemis--Ignis-Project-111111?style=for-the-badge" />
  <img alt="Local-first workspace" src="https://img.shields.io/badge/Local--First-Workspace-d20b18?style=for-the-badge" />
  <img alt="README verified" src="https://img.shields.io/badge/README-Verified-059669?style=for-the-badge" />
</p>
<!-- ARTEMIS-IGNIS-BADGE-BAR:END -->

[한국어 README](README.ko.md)

Artemis Orchestration App is a local-first AI workspace that connects chat, file context, orchestration flow, execution logs, and model/runtime status into one operator-friendly surface.

The app has two parts:

- A **Vite + React 19** frontend (`src/`).
- A **local bridge** — a Node.js HTTP server (`local-bridge/server.mjs`) that reaches the local filesystem, runs the AI router, and serves the frontend's API calls. By default it listens on `http://127.0.0.1:4174`.

## Highlights

- Chat-first workspace for giving natural-language work instructions.
- File context view for grounding tasks in the local project folder.
- Orchestration view that visualizes work as an execution flow instead of a static mockup.
- Runtime and model status surfaces for local models and provider-backed agents.
- Execution logs and activity traces for reviewing what happened after a run.
- Free API routing across OpenRouter, NVIDIA Build, and Gemini Developer API (see [README.ko.md](README.ko.md) for details).

## Requirements

- Node.js 22 or newer (the bridge uses the built-in `node:sqlite` and `node --test`).
- npm (this repo ships a `package-lock.json`; there is no `pnpm-lock.yaml`).

## Local Development

Install dependencies and copy the example environment file:

```bash
npm install
cp .env.example .env   # then fill in the values you need
```

Run the bridge server and the frontend in two terminals:

```bash
# Terminal 1 — local bridge (default: http://127.0.0.1:4174)
npm run bridge

# Terminal 2 — Vite dev server (open the URL it prints)
npm run dev
```

Useful environment variables (see `.env.example` for the full list):

- `ARTEMIS_BRIDGE_PORT` — bridge port (default `4174`).
- `APP_ENCRYPTION_KEY` — required to encrypt stored provider API keys with a private key.
- `ARTEMIS_PUBLIC_SESSION_SECRET` — keeps public sessions stable across bridge restarts.
- `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID` — needed for Google sign-in.

## Build, Lint, and Test

```bash
npm run build   # tsc -b && vite build
npm run lint    # eslint .
npm run test    # node --test over the local-bridge suites
```

## Repository Notes

- The default README is English.
- Korean documentation is maintained in [README.ko.md](README.ko.md) and is the most detailed reference.
- Visual identity assets live under docs/assets/.

<!-- ARTEMIS-IGNIS-BADGES:START -->
<p align="center">
  <img src="docs/assets/artemis-ignis-badges-footer.jpg" alt="Artemis-Ignis platform and license badges" width="520" />
</p>
<!-- ARTEMIS-IGNIS-BADGES:END -->
