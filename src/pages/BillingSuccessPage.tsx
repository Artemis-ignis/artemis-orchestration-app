import { useEffect, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import {
  activatePublicAccount,
  type PublicAccountSnapshot,
} from '../lib/publicAccountClient'
import { publicBridgeUrl } from '../lib/publicBridge'
import {
  applyPublicAccountSnapshot,
  loadPublicProfile,
} from '../lib/publicProfile'
import { MarketingShell } from './MarketingShell'

function formatPlanLabel(planIntent: string) {
  if (planIntent === 'pro') {
    return 'Pro'
  }
  if (planIntent === 'plus') {
    return 'Plus'
  }
  return 'Free'
}

function formatAccountStatus(status: string) {
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

export function BillingSuccessPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const profile = useMemo(() => loadPublicProfile(), [])
  const [account, setAccount] = useState<PublicAccountSnapshot | null>(null)
  const [status, setStatus] = useState('결제 상태를 확인하고 있습니다.')
  const [activationError, setActivationError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    const activate = async () => {
      if (!profile.isAuthenticated) {
        setActivationError('결제 완료 뒤에는 Google 로그인된 상태가 필요합니다. 먼저 다시 로그인해 주세요.')
        return
      }

      try {
        const nextAccount = await activatePublicAccount(publicBridgeUrl, {
          teamSize: profile.teamSize,
          role: profile.role,
          useCase: profile.useCase,
          planIntent: profile.planIntent,
        })

        if (!active) {
          return
        }

        setAccount(nextAccount)
        applyPublicAccountSnapshot({
          ...nextAccount,
          planIntent: nextAccount.selectedPlan,
          authProvider: profile.authProvider,
          googleSub: profile.googleSub,
          avatarUrl: profile.avatarUrl,
          isAuthenticated: profile.isAuthenticated,
          authenticatedAt: profile.authenticatedAt,
        })
        setStatus(`${formatPlanLabel(nextAccount.activePlan)} 플랜이 활성화되었습니다.`)
      } catch (error) {
        if (!active) {
          return
        }

        setActivationError(
          error instanceof Error
            ? error.message
            : '결제 활성 상태를 확인하는 중 오류가 발생했습니다.',
        )
      }
    }

    void activate()
    return () => {
      active = false
    }
  }, [profile])

  const planLabel = formatPlanLabel(account?.activePlan ?? profile.planIntent)

  return (
    <MarketingShell currentPage="billing-success" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pageIntro site-pageIntro--compact">
        <div>
          <span className="site-kicker">결제 완료</span>
          <h1>{planLabel} 준비가 끝났습니다. 이제 바로 워크스페이스로 이어가면 됩니다.</h1>
          <p>결제 후 계정 상태를 다시 확인하고, 계정 화면과 작업 화면으로 자연스럽게 이어지게 했습니다.</p>
        </div>
      </section>

      <section className="site-accountLayout">
        <article className="site-panel site-panel--accountPrimary">
          <div className="site-accountStats">
            <div>
              <small>활성 플랜</small>
              <strong>{planLabel}</strong>
            </div>
            <div>
              <small>계정 상태</small>
              <strong>{formatAccountStatus(account?.accountStatus ?? profile.accountStatus)}</strong>
            </div>
          </div>
          <p className="site-status">{activationError || status}</p>
        </article>

        <article className="site-panel site-panel--accountSecondary">
          <div className="site-panel__header">
            <span className="site-kicker">다음 행동</span>
            <h2>계정과 워크스페이스 중 원하는 화면으로 바로 이어갑니다.</h2>
          </div>

          <div className="site-actions">
            <button className="site-button site-button--primary" onClick={() => onNavigate('account')} type="button">
              계정 보기
            </button>
            <button className="site-button site-button--secondary" onClick={() => onNavigate('chat')} type="button">
              워크스페이스 열기
            </button>
          </div>
        </article>
      </section>
    </MarketingShell>
  )
}

export default BillingSuccessPage
