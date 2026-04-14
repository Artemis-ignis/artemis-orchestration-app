import { useEffect, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import {
  fetchPublicSessionAccount,
  type PublicAccountSnapshot,
  signOutPublicSession,
} from '../lib/publicAccountClient'
import { publicBridgeUrl } from '../lib/publicBridge'
import {
  applyPublicAccountSnapshot,
  clearPublicProfileAuth,
  loadPublicProfile,
} from '../lib/publicProfile'
import { resetGoogleAutoSelect } from '../lib/googleIdentity'
import { customerPortalUrl } from '../lib/subscriptions'
import { MarketingShell } from './MarketingShell'

function planLabel(plan: string) {
  if (plan === 'pro') {
    return 'Pro'
  }
  if (plan === 'plus') {
    return 'Plus'
  }
  return 'Free'
}

function accountStateLabel(status: string) {
  if (status === 'active') {
    return '활성'
  }
  if (status === 'trial') {
    return '체험'
  }
  if (status === 'lead') {
    return '문의 대기'
  }
  if (status === 'cancelled') {
    return '취소됨'
  }
  return '준비 중'
}

function billingLabel(status: string) {
  if (status === 'active') {
    return '결제 활성'
  }
  if (status === 'trial') {
    return '무료 체험'
  }
  if (status === 'pending') {
    return '결제 대기'
  }
  if (status === 'cancelled') {
    return '취소됨'
  }
  return '미연결'
}

function formatDate(iso: string) {
  if (!iso) {
    return '기록 없음'
  }

  const value = new Date(iso)
  if (Number.isNaN(value.getTime())) {
    return '기록 없음'
  }

  return value.toLocaleString('ko-KR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function AccountPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const savedProfile = useMemo(() => loadPublicProfile(), [])
  const [account, setAccount] = useState<PublicAccountSnapshot | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    let active = true

    const load = async () => {
      if (!savedProfile.isAuthenticated) {
        setStatus('아직 로그인한 계정이 없습니다. 먼저 Google 로그인으로 시작해 주세요.')
        return
      }

      try {
        const nextAccount = await fetchPublicSessionAccount(publicBridgeUrl)
        if (!active) {
          return
        }

        setAccount(nextAccount)
        applyPublicAccountSnapshot({
          ...nextAccount,
          planIntent: nextAccount.selectedPlan,
          authProvider: savedProfile.authProvider,
          googleSub: savedProfile.googleSub,
          avatarUrl: nextAccount.avatarUrl || savedProfile.avatarUrl,
          isAuthenticated: true,
          authenticatedAt: savedProfile.authenticatedAt,
        })
      } catch (error) {
        if (!active) {
          return
        }

        clearPublicProfileAuth()
        setStatus(error instanceof Error ? error.message : '계정 상태를 불러오지 못했습니다.')
      }
    }

    void load()

    return () => {
      active = false
    }
  }, [savedProfile])

  const currentPlan = planLabel(account?.activePlan ?? savedProfile.activePlan)
  const selectedPlan = planLabel(account?.selectedPlan ?? savedProfile.planIntent)
  const accountState = accountStateLabel(account?.accountStatus ?? savedProfile.accountStatus)
  const billingState = billingLabel(account?.billingState ?? savedProfile.billingState)
  const displayName = account?.name || savedProfile.name || 'Artemis 계정'
  const displayEmail = account?.email || savedProfile.email || '로그인 필요'

  const handleSignOut = async () => {
    setSigningOut(true)
    try {
      await signOutPublicSession(publicBridgeUrl)
    } catch {
      // 쿠키 삭제가 실패해도 로컬 상태는 초기화한다.
    } finally {
      resetGoogleAutoSelect()
      clearPublicProfileAuth()
      setSigningOut(false)
      onNavigate('start')
    }
  }

  return (
    <MarketingShell currentPage="account" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pageIntro site-pageIntro--compact">
        <div>
          <span className="site-kicker">계정</span>
          <h1>현재 플랜과 다음 행동만 빠르게 확인할 수 있게 정리했습니다.</h1>
          <p>복잡한 설정판보다 지금 쓰는 플랜, 결제 상태, 다음 이동을 바로 읽게 하는 데 집중했습니다.</p>
        </div>
      </section>

      <section className="site-accountLayout">
        <article className="site-panel site-panel--accountPrimary">
          <div className="site-accountIdentity">
            {savedProfile.avatarUrl ? (
              <img alt="" src={savedProfile.avatarUrl} />
            ) : (
              <span>{displayName.slice(0, 1) || 'A'}</span>
            )}
            <div>
              <strong>{displayName}</strong>
              <p>{displayEmail}</p>
            </div>
          </div>

          <div className="site-accountStats">
            <div>
              <small>현재 플랜</small>
              <strong>{currentPlan}</strong>
            </div>
            <div>
              <small>계정 상태</small>
              <strong>{accountState}</strong>
            </div>
            <div>
              <small>결제 상태</small>
              <strong>{billingState}</strong>
            </div>
          </div>

          <div className="site-accountMetaList">
            <div>
              <strong>관심 플랜</strong>
              <span>{selectedPlan}</span>
            </div>
            <div>
              <strong>최근 문의 번호</strong>
              <span>{account?.lastInquiryId || '없음'}</span>
            </div>
            <div>
              <strong>최근 갱신</strong>
              <span>{formatDate(account?.updatedAt ?? savedProfile.updatedAt)}</span>
            </div>
          </div>
        </article>

        <article className="site-panel site-panel--accountSecondary">
          <div className="site-panel__header">
            <span className="site-kicker">바로 하기</span>
            <h2>다음 행동을 바로 고를 수 있게 단순하게 남겼습니다.</h2>
          </div>

          <ul className="site-asideList">
            <li>Free라면 바로 워크스페이스로 들어가 실제 작업 흐름을 확인합니다.</li>
            <li>Plus나 Pro를 더 보고 싶다면 가격 페이지에서 다시 비교합니다.</li>
            <li>결제 관련 정리가 필요하면 결제 관리 또는 문의로 이어갑니다.</li>
          </ul>

          <div className="site-actions">
            <button className="site-button site-button--primary" onClick={() => onNavigate('chat')} type="button">
              워크스페이스 열기
            </button>
            <button className="site-button site-button--secondary" onClick={() => onNavigate('pricing')} type="button">
              플랜 비교
            </button>
            {customerPortalUrl ? (
              <a className="site-button site-button--secondary" href={customerPortalUrl} rel="noreferrer" target="_blank">
                결제 관리
              </a>
            ) : (
              <button className="site-button site-button--secondary" onClick={() => onNavigate('contact')} type="button">
                결제 문의
              </button>
            )}
            <button
              className="site-button site-button--ghost"
              disabled={signingOut}
              onClick={() => {
                void handleSignOut()
              }}
              type="button"
            >
              {signingOut ? '로그아웃 중...' : '로그아웃'}
            </button>
          </div>
        </article>
      </section>

      {status ? <p className="site-status">{status}</p> : null}
    </MarketingShell>
  )
}

export default AccountPage
