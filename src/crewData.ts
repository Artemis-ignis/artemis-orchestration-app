import type { IconName } from './icons'

export type PageId =
  | 'home'
  | 'pricing'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'start'
  | 'account'
  | 'billing-success'
  | 'billing-cancel'
  | 'chat'
  | 'files'
  | 'insights'
  | 'signals'
  | 'tools'
  | 'agents'
  | 'activity'
  | 'settings'
  | 'guide'

export type VisiblePageId = Exclude<
  PageId,
  | 'guide'
  | 'home'
  | 'pricing'
  | 'contact'
  | 'privacy'
  | 'terms'
  | 'start'
  | 'account'
  | 'billing-success'
  | 'billing-cancel'
>

export type SettingsTab = 'profile' | 'models' | 'preferences'

export const navigationItems: Array<{
  id: VisiblePageId
  label: string
  hotkey: string
  icon: IconName
}> = [
  { id: 'chat', label: '채팅', hotkey: 'C', icon: 'chat' },
  { id: 'files', label: '내 파일', hotkey: 'F', icon: 'files' },
  { id: 'insights', label: '인사이트', hotkey: 'I', icon: 'insights' },
  { id: 'signals', label: '시그널', hotkey: 'S', icon: 'signals' },
  { id: 'tools', label: '스킬', hotkey: 'K', icon: 'tools' },
  { id: 'agents', label: '오케스트레이션', hotkey: 'O', icon: 'agent' },
  { id: 'activity', label: '활동', hotkey: 'A', icon: 'activity' },
  { id: 'settings', label: '설정', hotkey: 'G', icon: 'settings' },
]

export const chatPromptCards = [
  {
    title: '브리프 정리',
    description: '오늘 들어온 AI 관련 소식을 빠르게 훑고 바로 공유할 수 있는 브리프로 정리해 줘.',
  },
  {
    title: '코드 점검',
    description: '현재 프로젝트 구조를 훑고 문제 지점, 우선순위, 다음 수정 순서를 정리해 줘.',
  },
  {
    title: '파일 작업',
    description: '지금 선택한 파일을 기준으로 필요한 수정 사항과 안전한 작업 순서를 정리해 줘.',
  },
  {
    title: '문서 초안',
    description: '메모와 작업 로그를 바탕으로 바로 공유할 수 있는 문서 초안을 작성해 줘.',
  },
]

export const signalCategories = ['전체', 'AI·기술', '연구', '오픈소스', '비즈니스'] as const

export const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'profile', label: '프로필' },
  { id: 'models', label: '모델·에이전트·API' },
  { id: 'preferences', label: '환경' },
]
