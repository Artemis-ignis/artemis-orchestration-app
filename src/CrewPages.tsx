import { Suspense, lazy, type ReactNode } from 'react'
import type { PageId } from './crewData'
import { ChatPage } from './features/chat/ChatPage'

const DeferredInsightsPage = lazy(async () => {
  const module = await import('./pages/InsightsPage')
  return { default: module.InsightsPage }
})

const DeferredSignalsPage = lazy(async () => {
  const module = await import('./pages/SignalsPage')
  return { default: module.SignalsPage }
})

const DeferredSkillsPage = lazy(async () => {
  const module = await import('./pages/SkillsPage')
  return { default: module.SkillsPage }
})

const DeferredActivityPage = lazy(async () => {
  const module = await import('./pages/ActivityPage')
  return { default: module.ActivityPage }
})

const DeferredSettingsPage = lazy(async () => {
  const module = await import('./pages/SettingsPage')
  return { default: module.SettingsPage }
})

const DeferredGuidePage = lazy(async () => {
  const module = await import('./pages/GuidePage')
  return { default: module.GuidePage }
})

const DeferredFilesPage = lazy(async () => {
  const module = await import('./pages/FilesPage')
  return { default: module.FilesPage }
})

const DeferredOrchestrationPage = lazy(async () => {
  const module = await import('./pages/OrchestrationPage')
  return { default: module.OrchestrationPage }
})

function DeferredPageShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <section className="page page-loading">
          <div className="panel-card panel-card--muted page-loading__card">
            <strong>{title} 준비 중</strong>
            <p>필요한 화면 코드와 실제 로컬 상태를 불러오고 있습니다.</p>
          </div>
        </section>
      }
    >
      {children}
    </Suspense>
  )
}

export function CrewPage({
  page,
  onNavigate,
}: {
  page: PageId
  onNavigate: (page: PageId) => void
}) {
  switch (page) {
    case 'chat':
      return <ChatPage onNavigate={onNavigate} />
    case 'files':
      return (
        <DeferredPageShell title="내 파일">
          <DeferredFilesPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'insights':
      return (
        <DeferredPageShell title="인사이트">
          <DeferredInsightsPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'signals':
      return (
        <DeferredPageShell title="시그널">
          <DeferredSignalsPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'tools':
      return (
        <DeferredPageShell title="스킬">
          <DeferredSkillsPage />
        </DeferredPageShell>
      )
    case 'agents':
      return (
        <DeferredPageShell title="오케스트레이션">
          <DeferredOrchestrationPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'activity':
      return (
        <DeferredPageShell title="활동">
          <DeferredActivityPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'settings':
      return (
        <DeferredPageShell title="설정">
          <DeferredSettingsPage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    case 'guide':
      return (
        <DeferredPageShell title="가이드">
          <DeferredGuidePage onNavigate={onNavigate} />
        </DeferredPageShell>
      )
    default:
      return <ChatPage onNavigate={onNavigate} />
  }
}
