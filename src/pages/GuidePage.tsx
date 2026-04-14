import type { PageId } from '../crewData'
import { PageIntro } from '../crewPageShared'

export function GuidePage({ onNavigate }: { onNavigate: (page: PageId) => void }) {
  return (
    <section className="page">
      <PageIntro
        description="현재 남아 있는 메뉴만 실제 동작 중심으로 사용합니다."
        icon="settings"
        title="가이드"
      />
      <div className="stack-grid">
        {[
          {
            title: '채팅',
            body: '실제 연결된 로컬 모델과 외부 에이전트로 대화를 실행합니다.',
            page: 'chat' as PageId,
          },
          {
            title: '내 파일',
            body: '업로드와 생성 산출물을 같은 로컬 저장소에서 관리합니다.',
            page: 'files' as PageId,
          },
          {
            title: '시그널',
            body: '실시간 공개 피드를 읽고 워치리스트를 관리합니다.',
            page: 'signals' as PageId,
          },
          {
            title: '오케스트레이션',
            body: '에이전트, 모델, 스킬, 출력 흐름을 시각화하고 직접 실행합니다.',
            page: 'agents' as PageId,
          },
          {
            title: '설정',
            body: '에이전트, API 키, 모델, 환경 설정을 한곳에서 관리합니다.',
            page: 'settings' as PageId,
          },
        ].map((item) => (
          <article key={item.title} className="guide-card">
            <strong>{item.title}</strong>
            <p>{item.body}</p>
            <button className="ghost-button" onClick={() => onNavigate(item.page)} type="button">
              열기
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

export default GuidePage
