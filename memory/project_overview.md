# Project Overview

## 프로젝트 설명

Artemis Orchestration은 채팅, 로컬 파일 작업, 공식 API 무료 라우팅, 오케스트레이션 시각화, 설정/메모 흐름을 한 화면 경험으로 묶는 Codex 기반 워크스페이스다.

## 현재 스택

- 프런트엔드: React 19, TypeScript, Vite
- 주요 스타일: `src/App.css`
- 브리지 서버: `local-bridge/server.mjs`
- AI 라우팅: `local-bridge/ai/`
- 로컬 저장: SQLite 기반 브리지 저장소 + 프런트 상태 저장

## 핵심 경로

- 앱 셸: `src/App.tsx`
- 워크스페이스 메인: `src/CrewPages.tsx`
- 오케스트레이션 캔버스: `src/OrchestrationCanvas.tsx`
- 설정 화면: `src/pages/SettingsPage.tsx`
- 브리지 서버: `local-bridge/server.mjs`
- 공식 API 라우팅: `local-bridge/ai/`

## 현재 모델/공급자 정책

- 로컬 Ollama는 `gemma4-E4B-uncensored-q4fast:latest` 1개만 유지
- 공식 API 공급자는 아래 3개만 지원
  - OpenRouter
  - NVIDIA Build
  - Gemini Developer API

## 운영 문서

- 세션 진입 지침: `AGENTS.md`
- Hermes-style Codex 운영: `HERMES_CODEX.md`
- 역할 정의: `codex/roles/`
- 재사용 스킬: `codex/skills/`
- 워크플로우 계약: `codex/workflow/contract.md`
- 지속 메모: `memory/`

## 기본 실행 명령

```powershell
npm run bridge
npm run dev
npm run lint
npm run build
```
