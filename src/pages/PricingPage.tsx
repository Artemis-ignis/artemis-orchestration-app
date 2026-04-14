import type { PageId } from '../crewData'
import { customerPortalUrl, pricingFaqs, subscriptionPlans } from '../lib/subscriptions'
import { setPublicPlanIntent } from '../lib/publicProfile'
import { MarketingShell } from './MarketingShell'

const compareRows = [
  ['추천 대상', '처음 확인하는 개인', '매일 반복 작업을 줄이고 싶은 개인', '운영 흐름까지 관리해야 하는 팀'],
  ['핵심 가치', '구조와 흐름 확인', '실제 작업 속도와 맥락 유지', '운영 기록과 추적 강화'],
  ['시작 방식', '바로 시작', '결제 또는 문의', '문의 후 도입 정리'],
] as const

function planButtonLabel(planId: 'free' | 'plus' | 'pro') {
  if (planId === 'free') {
    return 'Free 시작'
  }
  if (planId === 'plus') {
    return 'Plus 시작'
  }
  return 'Pro 문의'
}

function PricingPlanCard({
  plan,
  onAction,
}: {
  plan: (typeof subscriptionPlans)[number]
  onAction: (planId: 'free' | 'plus' | 'pro') => void
}) {
  return (
    <article className={`site-pricingCard ${plan.featured ? 'is-featured' : ''}`}>
      <div className="site-pricingCard__top">
        <div>
          <small>{plan.highlight}</small>
          <strong>{plan.name}</strong>
        </div>
        <span>{plan.priceLabel}</span>
      </div>
      <p>{plan.summary}</p>
      <ul>
        {plan.features.map((feature) => (
          <li key={feature}>{feature}</li>
        ))}
      </ul>
      <div className="site-pricingCard__meta">
        <span>{plan.audience}</span>
        <span>{plan.billingNote}</span>
      </div>
      <button className="site-button site-button--primary" onClick={() => onAction(plan.id)} type="button">
        {planButtonLabel(plan.id)}
      </button>
    </article>
  )
}

export function PricingPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  const handlePlanIntent = (planId: 'free' | 'plus' | 'pro') => {
    setPublicPlanIntent(planId)

    const plan = subscriptionPlans.find((item) => item.id === planId)

    if (planId === 'free') {
      onNavigate('start')
      return
    }

    if (planId === 'plus' && plan?.href) {
      window.open(plan.href, '_blank', 'noopener,noreferrer')
      return
    }

    if (planId === 'pro' && plan?.href) {
      window.open(plan.href, '_blank', 'noopener,noreferrer')
      return
    }

    onNavigate('contact')
  }

  return (
    <MarketingShell currentPage="pricing" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pricingHero">
        <div className="site-pricingHero__copy">
          <span className="site-kicker">가격</span>
          <h1>Free로 확인하고, Plus와 Pro로 넓히면 됩니다.</h1>
          <p>Free는 체험, Plus는 개인 유료 사용, Pro는 팀 운영용입니다.</p>

          <div className="site-actions">
            <button
              className="site-button site-button--primary"
              onClick={() => handlePlanIntent('free')}
              type="button"
            >
              Free 시작
            </button>
            {customerPortalUrl ? (
              <a className="site-button site-button--secondary" href={customerPortalUrl} rel="noreferrer" target="_blank">
                결제 관리
              </a>
            ) : (
              <button className="site-button site-button--secondary" onClick={() => onNavigate('contact')} type="button">
                도입 문의
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="site-pricingCards" aria-label="플랜 목록">
        {subscriptionPlans.map((plan) => (
          <PricingPlanCard key={plan.id} onAction={handlePlanIntent} plan={plan} />
        ))}
      </section>

      <section className="site-pricingCompare">
        <div className="site-sectionHeading">
          <span className="site-kicker">빠른 비교</span>
          <h2>차이는 기능 수보다 쓰는 방식에 있습니다.</h2>
        </div>

        <div className="site-compareTable">
          <div className="site-compareTable__head">
            <span>항목</span>
            <span>Free</span>
            <span>Plus</span>
            <span>Pro</span>
          </div>
          {compareRows.map(([label, free, plus, pro]) => (
            <div key={label} className="site-compareTable__row">
              <strong>{label}</strong>
              <span>{free}</span>
              <span>{plus}</span>
              <span>{pro}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="site-faqRow">
        {pricingFaqs.map((item) => (
          <article key={item.question} className="site-faqItem">
            <strong>{item.question}</strong>
            <p>{item.answer}</p>
          </article>
        ))}
      </section>
    </MarketingShell>
  )
}

export default PricingPage
