import type { PageId } from '../crewData'
import { MarketingShell } from './MarketingShell'

const privacySections = [
  {
    title: '수집하는 정보',
    body: '문의와 시작하기 화면에서 이름, 이메일, 팀 규모, 사용 용도 같은 기본 정보를 받습니다. 제품 운영과 문의 응답에 필요한 최소 범위만 다룹니다.',
  },
  {
    title: '정보를 쓰는 이유',
    body: '문의 응답, 계정 상태 확인, 결제 안내, 제품 운영 개선을 위해 사용합니다. 명시한 목적과 무관하게 개인 정보를 확장 사용하지 않습니다.',
  },
  {
    title: '결제 정보',
    body: '카드 정보는 Stripe 같은 결제 제공사가 처리하고, Artemis가 직접 저장하지 않는 구조를 기본 전제로 합니다.',
  },
  {
    title: '보관과 삭제',
    body: '법적 의무나 정산 목적을 제외하면 불필요한 데이터는 오래 보관하지 않고, 요청 시 확인 가능한 범위에서 삭제 안내를 제공합니다.',
  },
] as const

export function PrivacyPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <MarketingShell currentPage="privacy" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pageIntro site-pageIntro--compact">
        <div>
          <span className="site-kicker">개인정보처리방침</span>
          <h1>무엇을 저장하고 왜 쓰는지 먼저 분명하게 적어 둡니다.</h1>
          <p>현재 공개 사이트 기준의 기본 운영 원칙이며, 실제 상용화 전에는 법률 검토를 거친 최종 문구가 필요합니다.</p>
        </div>
      </section>

      <section className="site-legalGrid">
        {privacySections.map((section) => (
          <article key={section.title} className="site-legalCard">
            <strong>{section.title}</strong>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
    </MarketingShell>
  )
}

export default PrivacyPage
