import { useMemo, useState } from 'react'
import type { PageId } from '../crewData'
import { applyPublicAccountSnapshot, loadPublicProfile } from '../lib/publicProfile'
import { publicBridgeUrl } from '../lib/publicBridge'
import { salesContactEmail } from '../lib/subscriptions'
import { submitPublicInquiry } from '../lib/publicContactClient'
import { MarketingShell } from './MarketingShell'

const defaultForm = {
  name: '',
  email: '',
  teamSize: '',
  plan: 'Plus',
  useCase: '',
}

function buildInquiryMessage(form: typeof defaultForm) {
  return [
    'Artemis 도입 문의',
    '',
    `이름: ${form.name || '미입력'}`,
    `이메일: ${form.email || '미입력'}`,
    `관심 플랜: ${form.plan}`,
    `팀 규모: ${form.teamSize || '미입력'}`,
    '',
    '주요 용도',
    form.useCase || '미입력',
  ].join('\n')
}

export function ContactPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const savedProfile = loadPublicProfile()
  const [form, setForm] = useState({
    ...defaultForm,
    name: savedProfile.name,
    email: savedProfile.email,
    teamSize: savedProfile.teamSize,
    plan:
      savedProfile.planIntent === 'pro' ? 'Pro' : savedProfile.planIntent === 'plus' ? 'Plus' : 'Free',
    useCase: savedProfile.useCase,
  })
  const [status, setStatus] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const mailtoHref = useMemo(() => {
    if (!salesContactEmail) {
      return null
    }

    const subject = encodeURIComponent(`Artemis ${form.plan} 도입 문의`)
    const body = encodeURIComponent(buildInquiryMessage(form))
    return `mailto:${salesContactEmail}?subject=${subject}&body=${body}`
  }, [form])

  const handleSubmit = async () => {
    const message = buildInquiryMessage(form)
    setDraft(message)
    setSubmitting(true)

    try {
      const result = await submitPublicInquiry(publicBridgeUrl, {
        name: form.name,
        email: form.email,
        teamSize: form.teamSize,
        plan: form.plan,
        useCase: form.useCase,
      })

      if (result.account) {
        applyPublicAccountSnapshot({
          ...result.account,
          planIntent: result.account.selectedPlan,
          authProvider: savedProfile.authProvider,
          googleSub: savedProfile.googleSub,
          avatarUrl: savedProfile.avatarUrl,
          isAuthenticated: savedProfile.isAuthenticated,
          authenticatedAt: savedProfile.authenticatedAt,
        })
      }

      setStatus(`문의가 접수되었습니다. 접수 번호: ${result.id}`)
      return
    } catch {
      try {
        await navigator.clipboard.writeText(message)
        setStatus('문의 초안을 클립보드에 복사했습니다.')
      } catch {
        setStatus('문의 초안 복사에 실패했습니다. 아래 내용을 직접 복사해 주세요.')
      }

      if (mailtoHref) {
        window.location.href = mailtoHref
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <MarketingShell currentPage="contact" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pageIntro site-pageIntro--compact">
        <div>
          <span className="site-kicker">문의</span>
          <h1>도입 문의를 짧고 빠르게 정리합니다.</h1>
          <p>팀 규모와 주요 용도만 남기면 접수번호를 발급하고 다음 안내로 이어집니다.</p>
        </div>
      </section>

      <section className="site-contactLayout">
        <div className="site-panel">
          <div className="site-panel__header">
            <span className="site-kicker">문의 정보</span>
            <h2>필요한 정보만 남기면 됩니다.</h2>
          </div>

          <div className="site-formGrid">
            <label>
              <span>이름</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="예: 김아르"
                type="text"
                value={form.name}
              />
            </label>
            <label>
              <span>이메일</span>
              <input
                disabled={savedProfile.isAuthenticated}
                onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                placeholder="name@example.com"
                type="email"
                value={form.email}
              />
            </label>
            <label>
              <span>팀 규모</span>
              <input
                onChange={(event) => setForm((current) => ({ ...current, teamSize: event.target.value }))}
                placeholder="예: 3명"
                type="text"
                value={form.teamSize}
              />
            </label>
            <label>
              <span>관심 플랜</span>
              <select
                onChange={(event) => setForm((current) => ({ ...current, plan: event.target.value }))}
                value={form.plan}
              >
                <option value="Free">Free</option>
                <option value="Plus">Plus</option>
                <option value="Pro">Pro</option>
              </select>
            </label>
          </div>

          <label className="site-formField site-formField--full">
            <span>주요 용도</span>
            <textarea
              onChange={(event) => setForm((current) => ({ ...current, useCase: event.target.value }))}
              placeholder="예: 브리핑 정리, 파일 수정, 실행 로그 정리, 후속 작업 정리를 한 흐름으로 묶고 싶습니다."
              rows={6}
              value={form.useCase}
            />
          </label>

          <div className="site-actions">
            <button
              className="site-button site-button--primary"
              onClick={() => {
                void handleSubmit()
              }}
              type="button"
            >
              {submitting ? '접수 중...' : '문의 접수하기'}
            </button>
            <button className="site-button site-button--secondary" onClick={() => onNavigate('pricing')} type="button">
              가격 다시 보기
            </button>
          </div>

          {status ? <p className="site-status">{status}</p> : null}

          {draft ? (
            <label className="site-formField site-formField--full">
              <span>문의 초안</span>
              <textarea readOnly rows={8} value={draft} />
            </label>
          ) : null}
        </div>

        <aside className="site-panel site-panel--contactAside">
          <div className="site-panel__header">
            <span className="site-kicker">빠르게 정리하려면</span>
            <h2>세 가지만 분명하면 다음 안내가 훨씬 빨라집니다.</h2>
          </div>

          <ul className="site-asideList">
            <li>지금 가장 자주 반복되는 작업이 무엇인지</li>
            <li>개인 사용인지, 팀 운영 흐름인지</li>
            <li>언제부터 도입하고 싶은지</li>
          </ul>

          <div className="site-contactMeta">
            <strong>문의 메일</strong>
            <p>{salesContactEmail || '메일 주소를 연결하면 이 자리에서 바로 안내할 수 있습니다.'}</p>
          </div>
        </aside>
      </section>
    </MarketingShell>
  )
}

export default ContactPage
