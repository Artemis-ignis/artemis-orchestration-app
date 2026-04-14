import type { PageId } from '../crewData'
import { MarketingShell } from './MarketingShell'

const termsSections = [
  {
    title: '서비스 성격',
    body: 'Artemis는 브리핑, 파일 수정, 실행 흐름 추적, 후속 작업 정리를 돕는 AI 워크스페이스입니다. 공식 운영 전에는 기능과 가격이 바뀔 수 있습니다.',
  },
  {
    title: '계정과 사용 책임',
    body: '사용자는 자신이 연결한 실행기, 파일, 외부 API 사용에 대한 책임을 집니다. 서비스는 작업을 돕지만 최종 검토 책임까지 모두 대체하지는 않습니다.',
  },
  {
    title: '결제와 해지',
    body: '유료 플랜은 표시된 가격과 청구 주기에 따라 운영되고, 결제 제공사 정책에 맞는 변경과 해지 안내를 제공합니다.',
  },
  {
    title: '제한 사항',
    body: '불법 목적, 권리 침해, 서비스 남용, 보안 우회, 악성 코드 생성 같은 용도로는 사용할 수 없습니다. 위반이 확인되면 접근 제한이나 중단이 이뤄질 수 있습니다.',
  },
] as const

export function TermsPage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <MarketingShell currentPage="terms" mainClassName="marketing-main" onNavigate={onNavigate}>
      <section className="site-pageIntro site-pageIntro--compact">
        <div>
          <span className="site-kicker">이용약관</span>
          <h1>서비스 범위와 사용 책임, 결제 원칙을 먼저 명확하게 둡니다.</h1>
          <p>아래 내용은 현재 공개 사이트 기준의 기본 운영 원칙이며, 실제 상용화 전에는 최종 법률 검토가 필요합니다.</p>
        </div>
      </section>

      <section className="site-legalGrid">
        {termsSections.map((section) => (
          <article key={section.title} className="site-legalCard">
            <strong>{section.title}</strong>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
    </MarketingShell>
  )
}

export default TermsPage
