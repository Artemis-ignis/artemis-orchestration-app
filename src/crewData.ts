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
  'guide' | 'home' | 'pricing' | 'contact' | 'privacy' | 'terms' | 'start' | 'account' | 'billing-success' | 'billing-cancel'
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
    title: '브리핑',
    description: '오늘 중요한 AI 흐름과 오픈소스 변화를 짧게 정리해줘',
  },
  {
    title: '코드',
    description: '현재 프로젝트 구조를 분석하고 개선 포인트를 정리해줘',
  },
  {
    title: '파일',
    description: '업로드한 파일을 읽고 다음 작업 순서를 정리해줘',
  },
  {
    title: '문서',
    description: '회의 메모를 바탕으로 실행 가능한 문서 초안을 만들어줘',
  },
]

export const signalCategories = [
  '전체',
  'AI 및 기술',
  '연구',
  '오픈소스',
  '비즈니스',
] as const

export const settingsTabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'profile', label: '프로필' },
  { id: 'models', label: '실행기 · 에이전트 · API' },
  { id: 'preferences', label: '환경' },
]
