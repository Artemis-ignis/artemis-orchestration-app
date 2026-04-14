export type SubscriptionPlan = {
  id: 'free' | 'plus' | 'pro'
  name: string
  priceLabel: string
  summary: string
  audience: string
  highlight: string
  features: string[]
  billingNote: string
  supportNote: string
  href: string | null
  ctaLabel: string
  featured?: boolean
}

export type SubscriptionFaq = {
  question: string
  answer: string
}

const salesEmail = import.meta.env.VITE_SALES_EMAIL?.trim() || ''
export const salesContactEmail = salesEmail

const plusCheckoutUrl =
  import.meta.env.VITE_STRIPE_PLUS_URL?.trim() ||
  import.meta.env.VITE_STRIPE_SOLO_URL?.trim() ||
  ''
const proCheckoutUrl = import.meta.env.VITE_STRIPE_PRO_URL?.trim() || ''
export const customerPortalUrl = import.meta.env.VITE_STRIPE_PORTAL_URL?.trim() || ''

function buildMailto(planName: string) {
  if (!salesEmail) {
    return null
  }

  const subject = encodeURIComponent(`Artemis ${planName} 도입 문의`)
  const body = encodeURIComponent(
    `${planName} 플랜 도입을 검토 중입니다.\r\n팀 규모:\r\n주요 용도:\r\n희망 시작 시점:\r\n`,
  )

  return `mailto:${salesEmail}?subject=${subject}&body=${body}`
}

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: 'free',
    name: 'Free',
    priceLabel: '무료',
    summary: '제품 흐름을 바로 체험하는 시작 플랜',
    audience: '처음 확인하는 개인',
    highlight: '가볍게 시작',
    features: ['기본 워크스페이스', '결과 반영 확인', '바로 시작'],
    billingNote: '비용 없이 구조를 먼저 확인합니다.',
    supportNote: '구매 전 적합도를 확인하는 가장 가벼운 시작입니다.',
    href: null,
    ctaLabel: 'Free 시작',
  },
  {
    id: 'plus',
    name: 'Plus',
    priceLabel: '$15 / 월',
    summary: '개인 작업을 매일 이어가는 기본 유료 플랜',
    audience: '매일 쓰는 개인',
    highlight: '가장 추천',
    features: ['한 화면 작업 흐름', '결과와 변경 추적', 'Codex CLI와 로컬 모델'],
    billingNote: '반복 작업 시간을 줄이는 데 맞춘 플랜입니다.',
    supportNote: '반복 업무를 매일 이어가는 개인에게 가장 잘 맞습니다.',
    href: plusCheckoutUrl || buildMailto('Plus'),
    ctaLabel: plusCheckoutUrl ? 'Plus 시작' : 'Plus 문의하기',
    featured: true,
  },
  {
    id: 'pro',
    name: 'Pro',
    priceLabel: '$39 / 월',
    summary: '팀 실행 흐름과 기록까지 관리하는 상위 플랜',
    audience: '팀 운영과 기록 관리',
    highlight: '운영용 플랜',
    features: ['여러 흐름 관리', '결과와 로그 추적', '도입 범위 상담'],
    billingNote: '여러 사람의 작업 흐름을 함께 볼 때 강해집니다.',
    supportNote: '운영 흐름까지 안정적으로 정리하려는 팀에 맞습니다.',
    href: proCheckoutUrl || buildMailto('Pro'),
    ctaLabel: proCheckoutUrl ? 'Pro 시작' : 'Pro 문의하기',
  },
]

export const subscriptionTrustPoints = [
  {
    title: 'Free로 먼저 확인',
    detail: '처음부터 결제를 강요하지 않고, Free에서 제품 구조와 작업 흐름을 먼저 확인할 수 있습니다.',
  },
  {
    title: '결제와 제품을 분리',
    detail: customerPortalUrl
      ? '결제와 구독 관리는 별도 포털에서 처리하고, 제품 안에서는 작업 흐름에만 집중합니다.'
      : '결제 링크 또는 문의 흐름을 분리해서 제품 화면이 불필요하게 복잡해지지 않게 했습니다.',
  },
  {
    title: '실제 작업 기준',
    detail: '예쁜 데모보다 브리핑, 파일 수정, 실행 기록, 다음 작업 정리에 초점을 맞췄습니다.',
  },
] as const

export const pricingFaqs: SubscriptionFaq[] = [
  {
    question: 'Free와 Plus의 차이는 무엇인가요?',
    answer: 'Free는 구조 확인용이고, Plus는 매일 쓰는 개인용 유료 플랜입니다.',
  },
  {
    question: 'Pro는 누구에게 맞나요?',
    answer: '여러 실행 흐름과 기록을 같이 관리해야 하는 팀에 맞습니다.',
  },
  {
    question: '아직 결제 링크가 없으면 어떻게 시작하나요?',
    answer: 'Free는 바로 시작하고, Plus와 Pro는 문의로 이어집니다.',
  },
]

export const subscriptionNotice =
  plusCheckoutUrl || proCheckoutUrl
    ? 'Free로 먼저 확인하고, 매일 쓰게 되면 Plus 또는 Pro로 올리면 됩니다.'
    : 'Free는 바로 시작하고, Plus와 Pro는 도입 문의로 이어집니다.'

export const hasLiveCheckout = Boolean(plusCheckoutUrl || proCheckoutUrl)
