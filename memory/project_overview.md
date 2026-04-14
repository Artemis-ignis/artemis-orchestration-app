# Project Overview

## 한 줄 설명

Artemis Orchestration은 채팅, 로컬 파일 작업, 공식 API 라우팅, 시그널, 오케스트레이션 흐름을 한 화면 집합으로 묶는 로컬 중심 워크스페이스다.

## 현재 스택

- 프런트엔드: React 19, TypeScript, Vite
- 스타일: 단일 `src/App.css` 중심
- 백엔드 브리지: `local-bridge/server.mjs`
- 저장: SQLite 기반 브리지 저장소 + 로컬 상태 저장

## 핵심 경로

- 워크스페이스 셸: `src/App.tsx`
- 채팅/페이지 라우팅: `src/CrewPages.tsx`
- 오케스트레이션 캔버스: `src/OrchestrationCanvas.tsx`
- 설정: `src/pages/SettingsPage.tsx`
- 로컬 브리지: `local-bridge/server.mjs`
- AI 라우팅: `local-bridge/ai/`

## 현재 지원 모델/공급자 원칙

- 로컬 Ollama는 `gemma4-E4B-uncensored-q4fast:latest` 1개만 유지
- 공식 API 라우팅은 아래 3개만 지원
  - OpenRouter
  - NVIDIA Build
  - Gemini Developer API

## 현재 운영 문서

- 세션 진입 지침: `AGENTS.md`
- Codex Hermes 모드 진입: `HERMES_CODEX.md`
- 역할 정의: `codex/roles/`
- 재사용 스킬: `codex/skills/`
- 워크플로우 계약: `codex/workflow/contract.md`

## 기본 실행 명령

```powershell
npm run bridge
npm run dev
npm run lint
npm run build
```
