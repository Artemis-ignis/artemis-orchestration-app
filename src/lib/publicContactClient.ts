import type { PublicAccountSnapshot } from './publicAccountClient'

export type PublicInquiryPayload = {
  name: string
  email: string
  teamSize: string
  plan: string
  useCase: string
}

export async function submitPublicInquiry(bridgeUrl: string, payload: PublicInquiryPayload) {
  const response = await fetch(`${bridgeUrl}/api/public/contact`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean
    error?: string
    id?: string
    account?: PublicAccountSnapshot
  }

  if (!response.ok || !data.ok) {
    throw new Error(data.error || '문의 제출에 실패했습니다.')
  }

  return data
}
