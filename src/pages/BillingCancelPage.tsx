import type { PageId } from '../crewData'
import { MarketingShell } from './MarketingShell'

export function BillingCancelPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <MarketingShell currentPage="billing-cancel" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pageIntro site-pageIntro--compact">
        <div>
          <span className="site-kicker">결제 취소</span>
          <h1>결제를 멈췄다면, 다시 비교하고 이어가기 쉽게 정리해 두었습니다.</h1>
          <p>가격을 다시 보고, 문의로 방향을 바꾸거나, 계정 화면으로 돌아갈 수 있습니다.</p>
        </div>
      </section>

      <section className="site-accountLayout">
        <article className="site-panel site-panel--accountPrimary">
          <div className="site-panel__header">
            <span className="site-kicker">다음 선택</span>
            <h2>Free로 먼저 확인하거나, Plus와 Pro를 다시 검토할 수 있습니다.</h2>
          </div>
          <ul className="site-asideList">
            <li>가격을 다시 보고 Free, Plus, Pro 차이를 다시 확인합니다.</li>
            <li>도입 범위가 애매하면 문의 페이지에서 바로 정리합니다.</li>
            <li>이미 로그인했다면 계정 화면으로 돌아가 다음 행동을 고를 수 있습니다.</li>
          </ul>
        </article>

        <article className="site-panel site-panel--accountSecondary">
          <div className="site-actions">
            <button className="site-button site-button--primary" onClick={() => onNavigate('pricing')} type="button">
              가격 다시 보기
            </button>
            <button className="site-button site-button--secondary" onClick={() => onNavigate('contact')} type="button">
              도입 문의하기
            </button>
            <button className="site-button site-button--secondary" onClick={() => onNavigate('account')} type="button">
              계정 보기
            </button>
          </div>
        </article>
      </section>
    </MarketingShell>
  )
}

export default BillingCancelPage
