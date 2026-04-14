import type { PropsWithChildren } from 'react'
import type { PageId } from '../crewData'
import { loadPublicProfile, setPublicPlanIntent } from '../lib/publicProfile'

const primaryLinks: Array<{ id: PageId; label: string }> = [
  { id: 'home', label: '제품' },
  { id: 'pricing', label: '가격' },
  { id: 'contact', label: '문의' },
]

const footerLinks: Array<{ id: PageId; label: string }> = [
  { id: 'privacy', label: '개인정보처리방침' },
  { id: 'terms', label: '이용약관' },
  { id: 'contact', label: '문의' },
]

export function MarketingShell({
  currentPage,
  onNavigate,
  mainClassName,
  children,
}: PropsWithChildren<{
  currentPage: PageId
  onNavigate: (page: PageId) => void
  mainClassName: string
}>) {
  const profile = loadPublicProfile()
  const hasAuthenticatedProfile = profile.isAuthenticated && profile.email
  const primaryActionLabel = hasAuthenticatedProfile ? '워크스페이스 열기' : '무료 시작'
  const primaryActionTarget: PageId = hasAuthenticatedProfile ? 'chat' : 'start'

  return (
    <div className="site-page">
      <header className="site-topbar">
        <button className="site-brand" onClick={() => onNavigate('home')} type="button">
          <span className="site-brand__mark">A</span>
          <span className="site-brand__text">Artemis</span>
        </button>

        <nav aria-label="공개 사이트 메뉴" className="site-topbar__nav">
          {primaryLinks.map((item) => (
            <button
              key={item.id}
              className={item.id === currentPage ? 'is-active' : undefined}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="site-topbar__actions">
          {hasAuthenticatedProfile ? (
            <button className="site-accountButton" onClick={() => onNavigate('account')} type="button">
              {profile.avatarUrl ? <img alt="" src={profile.avatarUrl} /> : <span>{profile.name.slice(0, 1) || 'A'}</span>}
              <strong>{profile.name || '계정'}</strong>
            </button>
          ) : (
            <button className="site-button site-button--ghost" onClick={() => onNavigate('start')} type="button">
              로그인
            </button>
          )}

          <button
            className="site-button site-button--primary"
            onClick={() => {
              if (!hasAuthenticatedProfile) {
                setPublicPlanIntent('free')
              }
              onNavigate(primaryActionTarget)
            }}
            type="button"
          >
            {primaryActionLabel}
          </button>
        </div>
      </header>

      <main className={`${mainClassName} site-main`}>{children}</main>

      <footer className="site-footer">
        <div className="site-footer__brand">
          <strong>Artemis</strong>
          <p>브리핑, 파일 수정, 실행 기록을 한 흐름으로 묶는 실제 작업용 AI 워크스페이스.</p>
        </div>

        <div className="site-footer__links">
          {footerLinks.map((item) => (
            <button key={item.id} onClick={() => onNavigate(item.id)} type="button">
              {item.label}
            </button>
          ))}
        </div>
      </footer>
    </div>
  )
}

export default MarketingShell
