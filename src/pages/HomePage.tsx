import type { PageId } from '../crewData'
import { subscriptionPlans } from '../lib/subscriptions'
import { setPublicPlanIntent } from '../lib/publicProfile'
import { MarketingShell } from './MarketingShell'

const productPreviews = [
  {
    id: 'chat',
    label: '채팅',
    title: '채팅에서 요청을 받습니다.',
    description: '브리핑, 코드, 문서를 같은 흐름으로 이어갑니다.',
    image: '/marketing/workspace-chat.png',
  },
  {
    id: 'files',
    label: '내 파일',
    title: '결과는 파일과 로그로 남습니다.',
    description: '변경 파일과 다음 작업 근거를 바로 확인합니다.',
    image: '/marketing/workspace-files.png',
  },
  {
    id: 'orchestration',
    label: '오케스트레이션',
    title: '모델과 도구 흐름도 보입니다.',
    description: '입력, 분기, 결과 반영을 추적하면서 실행합니다.',
    image: '/marketing/workspace-orchestration.png',
  },
] as const

const heroHighlights = ['Google로 바로 시작', '실제 파일 반영', '실행 흐름 추적'] as const

const productReasons = [
  {
    title: '창을 덜 옮깁니다.',
    description: '채팅, 파일, 기록을 같은 흐름으로 묶습니다.',
  },
  {
    title: '결과가 남습니다.',
    description: '파일, 인사이트, 활동 로그가 다음 작업으로 이어집니다.',
  },
  {
    title: '도입은 가볍게 시작합니다.',
    description: 'Free로 확인하고, Plus와 Pro로 넓히면 됩니다.',
  },
] as const

function HomePlanCard({
  plan,
  onNavigate,
}: {
  plan: (typeof subscriptionPlans)[number]
  onNavigate: (page: PageId) => void
}) {
  const isFree = plan.id === 'free'

  return (
    <article className={`site-planCard ${plan.featured ? 'is-featured' : ''}`}>
      <div className="site-planCard__top">
        <div>
          <small>{plan.highlight}</small>
          <strong>{plan.name}</strong>
        </div>
        <span>{plan.priceLabel}</span>
      </div>
      <p>{plan.summary}</p>
      <ul>
        {plan.features.slice(0, 3).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <button
        className={`site-button ${plan.featured ? 'site-button--primary' : 'site-button--secondary'}`}
        onClick={() => {
          setPublicPlanIntent(plan.id)
          onNavigate(isFree ? 'start' : 'pricing')
        }}
        type="button"
      >
        {isFree ? 'Free로 시작' : `${plan.name} 보기`}
      </button>
    </article>
  )
}

export function HomePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <MarketingShell currentPage="home" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-homeHero site-homeHero--bleed">
        <div className="site-homeHero__inner">
          <div className="site-homeHero__copy">
            <span className="site-kicker">실제 작업용 AI 워크스페이스</span>
            <div className="site-homeHeadline">
              <h1>브리핑부터 결과 반영까지, 한 흐름으로.</h1>
              <p>채팅, 파일 수정, 실행 기록, 다음 작업 정리를 한 화면에 묶었습니다.</p>
            </div>

            <div className="site-actions">
              <button
                className="site-button site-button--primary"
                onClick={() => {
                  setPublicPlanIntent('free')
                  onNavigate('start')
                }}
                type="button"
              >
                무료로 시작
              </button>
              <button className="site-button site-button--secondary" onClick={() => onNavigate('pricing')} type="button">
                플랜 비교
              </button>
            </div>

            <ul className="site-homeProofPills" aria-label="핵심 장점">
              {heroHighlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="site-homeHero__visual">
            <figure className="site-homeStage">
              <div className="site-homeStage__chrome" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <img alt="Artemis 작업 화면" src="/marketing/workspace-chat.png" />

              <figcaption className="site-homeStage__caption">
                <span>실제 워크스페이스</span>
                <strong>채팅에서 시작한 요청이 파일과 기록으로 이어집니다.</strong>
                <p>실제 작업 화면을 그대로 보여줍니다.</p>
              </figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="site-homeWorkflow">
        <div className="site-sectionHeading">
          <span className="site-kicker">핵심 흐름</span>
          <h2>채팅, 파일, 오케스트레이션을 하나의 흐름으로 묶었습니다.</h2>
        </div>

        <div className="site-homeWorkflowGrid">
          {productPreviews.map((preview, index) => (
            <article key={preview.id} className="site-homeWorkflowCard">
              <small>{`0${index + 1}`}</small>
              <strong>{preview.title}</strong>
              <p>{preview.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-homeSupport">
        <div className="site-homeSupport__intro">
          <span className="site-kicker">왜 돈을 내고 쓰나</span>
          <h2>예쁜 데모보다, 반복 작업을 덜 헷갈리게 끝내는 데 집중했습니다.</h2>
        </div>

        <div className="site-homeSupport__grid">
          {productReasons.map((item) => (
            <article key={item.title} className="site-homeReason">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="site-homeSection site-homeSection--plans">
        <div className="site-sectionHeading site-sectionHeading--row">
          <div>
            <span className="site-kicker">Free · Plus · Pro</span>
            <h2>Free로 시작하고, 매일 쓰게 되면 Plus나 Pro로 넓히면 됩니다.</h2>
          </div>
          <button className="site-button site-button--secondary" onClick={() => onNavigate('pricing')} type="button">
            전체 가격 보기
          </button>
        </div>

        <div className="site-planGrid">
          {subscriptionPlans.map((plan) => (
            <HomePlanCard key={plan.id} onNavigate={onNavigate} plan={plan} />
          ))}
        </div>
      </section>
    </MarketingShell>
  )
}

export default HomePage
