import { useEffect, useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import { GoogleSignInButton } from '../components/GoogleSignInButton'
import { hasGoogleClientId } from '../lib/googleIdentity'
import {
  fetchPublicSessionAccount,
  signInWithGoogle,
  startPublicAccount,
} from '../lib/publicAccountClient'
import { publicBridgeUrl } from '../lib/publicBridge'
import {
  applyPublicAccountSnapshot,
  loadPublicProfile,
  resetPublicProfile,
} from '../lib/publicProfile'
import { MarketingShell } from './MarketingShell'

function planLabel(planIntent: 'free' | 'plus' | 'pro') {
  if (planIntent === 'pro') {
    return 'Pro'
  }
  if (planIntent === 'plus') {
    return 'Plus'
  }
  return 'Free'
}

export function StartPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const savedProfile = useMemo(() => loadPublicProfile(), [])
  const [form, setForm] = useState(savedProfile)
  const [status, setStatus] = useState<string | null>(null)
  const [authenticating, setAuthenticating] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const isFreePlan = form.planIntent === 'free'
  const isAuthenticated = form.isAuthenticated && Boolean(form.email)
  const currentPlanLabel = planLabel(form.planIntent)
  const isLocalPreview =
    typeof window !== 'undefined' &&
    ['127.0.0.1', 'localhost'].includes(window.location.hostname)

  useEffect(() => {
    let active = true

    if (savedProfile.isAuthenticated) {
      return () => {
        active = false
      }
    }

    const restoreSession = async () => {
      try {
        const account = await fetchPublicSessionAccount(publicBridgeUrl)
        if (!active) {
          return
        }

        applyPublicAccountSnapshot({
          ...account,
          planIntent: account.selectedPlan,
          authProvider: 'google',
          googleSub: account.googleSub,
          avatarUrl: account.avatarUrl,
          isAuthenticated: true,
        })

        setForm((current) => ({
          ...current,
          name: account.name,
          email: account.email,
          teamSize: account.teamSize,
          role: account.role,
          useCase: account.useCase,
          planIntent: account.selectedPlan,
          activePlan: account.activePlan,
          accountId: account.accountId,
          accountStatus: account.accountStatus,
          billingState: account.billingState,
          avatarUrl: account.avatarUrl,
          googleSub: account.googleSub,
          authProvider: 'google',
          isAuthenticated: true,
        }))
      } catch {
        // 공개 시작 화면에서는 세션이 없을 수 있으므로 조용히 무시한다.
      }
    }

    void restoreSession()

    return () => {
      active = false
    }
  }, [savedProfile.isAuthenticated])

  const handleGoogleCredential = async (credential: string) => {
    setAuthenticating(true)
    setStatus(null)

    try {
      const result = await signInWithGoogle(publicBridgeUrl, {
        credential,
        planIntent: form.planIntent,
        teamSize: form.teamSize,
        role: form.role,
        useCase: form.useCase,
      })

      applyPublicAccountSnapshot({
        ...result.account,
        planIntent: result.account.selectedPlan,
        authProvider: 'google',
        googleSub: result.account.googleSub,
        avatarUrl: result.account.avatarUrl,
        isAuthenticated: true,
        authenticatedAt: result.authenticatedAt,
      })

      setForm((current) => ({
        ...current,
        name: result.account.name || current.name,
        email: result.account.email,
        teamSize: result.account.teamSize || current.teamSize,
        role: result.account.role || current.role,
        useCase: result.account.useCase || current.useCase,
        activePlan: result.account.activePlan,
        accountId: result.account.accountId,
        accountStatus: result.account.accountStatus,
        billingState: result.account.billingState,
        avatarUrl: result.account.avatarUrl,
        googleSub: result.account.googleSub,
        authProvider: 'google',
        isAuthenticated: true,
        authenticatedAt: result.authenticatedAt,
      }))

      setStatus('Google 계정이 연결되었습니다. 아래 정보만 확인하면 바로 시작할 수 있습니다.')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Google 로그인을 완료하지 못했습니다.')
    } finally {
      setAuthenticating(false)
    }
  }

  const handleContinue = async () => {
    if (!isAuthenticated) {
      setStatus('먼저 Google 계정으로 로그인해 주세요.')
      return
    }

    setSubmitting(true)
    setStatus(null)

    try {
      const account = await startPublicAccount(publicBridgeUrl, {
        teamSize: form.teamSize,
        role: form.role,
        useCase: form.useCase,
        planIntent: form.planIntent,
      })

      applyPublicAccountSnapshot({
        ...account,
        planIntent: account.selectedPlan,
        authProvider: 'google',
        googleSub: form.googleSub,
        avatarUrl: form.avatarUrl,
        isAuthenticated: true,
        authenticatedAt: form.authenticatedAt,
      })

      if (isFreePlan) {
        setStatus('워크스페이스를 준비했습니다. 바로 작업 화면으로 이동합니다.')
        window.setTimeout(() => onNavigate('chat'), 180)
      } else {
        setStatus('도입 정보를 저장했습니다. 이어서 문의 화면으로 이동합니다.')
        window.setTimeout(() => onNavigate('contact'), 180)
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '시작 정보를 저장하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MarketingShell currentPage="start" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pageIntro site-pageIntro--compact">
        <div>
          <span className="site-kicker">시작하기</span>
          <h1>Google로 가입하고 바로 시작합니다.</h1>
          <p>로그인은 Google이 맡고, 여기서는 필요한 정보만 남깁니다.</p>
        </div>
      </section>

      <section className="site-startSurface">
        <div className="site-startSurface__header">
          <div>
            <span className="site-kicker">Free · Plus · Pro</span>
            <h2>가입은 짧게, 시작은 바로, 전환은 같은 흐름으로 이어집니다.</h2>
          </div>

          <div className="site-startBadgeRow">
            <span className="site-startBadge">{currentPlanLabel}</span>
            <span className="site-startBadge">{isAuthenticated ? 'Google 연결됨' : 'Google 로그인 필요'}</span>
          </div>
        </div>

        <div className="site-startSurface__body">
          <section className="site-startAuth">
            <div className="site-stepBlock__head">
              <span className="site-kicker">1. 로그인</span>
              <h3>Google 계정으로 계속</h3>
              <p>이름과 이메일은 Google 기준으로 가져오고 그대로 이어갑니다.</p>
            </div>

            {hasGoogleClientId() ? (
              <GoogleSignInButton
                disabled={authenticating || isAuthenticated}
                onCredential={(credential) => {
                  void handleGoogleCredential(credential)
                }}
                onError={(message) => setStatus(message)}
              />
            ) : (
              <div className="site-authNotice">
                <strong>이 미리보기에는 운영용 Google 로그인이 아직 연결되지 않았습니다.</strong>
                <p>Google 클라이언트 ID와 세션 키를 넣으면 바로 활성화됩니다.</p>

                {isLocalPreview ? (
                  <details className="site-authNotice__details">
                    <summary>개발 환경 설정 값 보기</summary>
                    <code className="site-inlineCode">
                      VITE_GOOGLE_CLIENT_ID=...
                      {'\n'}
                      GOOGLE_CLIENT_ID=...
                    </code>
                  </details>
                ) : null}
              </div>
            )}

            {isAuthenticated ? (
              <div className="site-authIdentity">
                {form.avatarUrl ? <img alt="" src={form.avatarUrl} /> : <span>{form.name.slice(0, 1) || 'A'}</span>}
                <div>
                  <strong>{form.name || 'Google 계정'}</strong>
                  <p>{form.email}</p>
                </div>
              </div>
            ) : null}

            <ul className="site-startTrust">
              <li>Google 이메일 검증 계정만 연결합니다.</li>
              <li>가입 뒤에는 팀 규모와 용도만 남기면 됩니다.</li>
              <li>Free는 바로 시작하고, Plus와 Pro는 문의로 이어집니다.</li>
            </ul>
          </section>

          <section className="site-startFields">
            <div className="site-stepBlock__head">
              <span className="site-kicker">2. 시작 정보</span>
              <h3>딱 필요한 정보만 남기기</h3>
              <p>계정 식별은 Google이 맡고, 여기서는 팀 규모와 용도만 남기면 됩니다.</p>
            </div>

            <div className="site-formGrid">
              <label>
                <span>Google 이름</span>
                <input disabled placeholder="Google 로그인 후 자동으로 채워집니다" type="text" value={form.name} />
              </label>
              <label>
                <span>Google 이메일</span>
                <input disabled placeholder="Google 로그인 후 자동으로 채워집니다" type="email" value={form.email} />
              </label>
              <label>
                <span>팀 규모</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, teamSize: event.target.value }))}
                  placeholder="예: 1명 또는 5명"
                  type="text"
                  value={form.teamSize}
                />
              </label>
              <label>
                <span>팀 역할</span>
                <input
                  onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                  placeholder="예: 개발, 운영, PM"
                  type="text"
                  value={form.role}
                />
              </label>
              <label>
                <span>플랜</span>
                <select
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      planIntent: event.target.value as typeof current.planIntent,
                    }))
                  }
                  value={form.planIntent}
                >
                  <option value="free">Free</option>
                  <option value="plus">Plus</option>
                  <option value="pro">Pro</option>
                </select>
              </label>
            </div>

            <label className="site-formField site-formField--full">
              <span>주요 용도</span>
              <textarea
                onChange={(event) => setForm((current) => ({ ...current, useCase: event.target.value }))}
                placeholder="예: 브리핑 요약, 파일 수정, 실행 로그 정리를 한 화면에서 처리하고 싶습니다."
                rows={5}
                value={form.useCase}
              />
            </label>
          </section>
        </div>

        <div className="site-startSurface__footer">
          <div className="site-startSummary">
            <div>
              <strong>선택 플랜</strong>
              <span>{currentPlanLabel}</span>
            </div>
            <div>
              <strong>다음 단계</strong>
              <span>{isFreePlan ? '워크스페이스 열기' : '도입 문의로 이어가기'}</span>
            </div>
          </div>

          <div className="site-actions">
            <button
              className="site-button site-button--primary"
              disabled={!isAuthenticated || submitting || authenticating}
              onClick={() => {
                void handleContinue()
              }}
              type="button"
            >
              {submitting ? '준비 중...' : isFreePlan ? '워크스페이스 시작' : '문의로 이어가기'}
            </button>
            <button className="site-button site-button--secondary" onClick={() => onNavigate('pricing')} type="button">
              요금제 다시 보기
            </button>
            {isAuthenticated ? (
              <button
                className="site-button site-button--ghost"
                onClick={() => {
                  resetPublicProfile()
                  setForm(loadPublicProfile())
                  setStatus('저장한 공개 프로필을 초기화했습니다.')
                }}
                type="button"
              >
                다시 입력
              </button>
            ) : null}
          </div>
        </div>

        {status ? <p className="site-status">{status}</p> : null}
      </section>
    </MarketingShell>
  )
}

export default StartPage
