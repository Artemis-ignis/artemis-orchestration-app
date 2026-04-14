# Artemis Stripe 구독 연결 가이드

Artemis의 공개 가격 페이지는 `Free / Plus / Pro` 구조를 기준으로 `Stripe Payment Links`와 `Stripe Customer Portal`만 연결해도 바로 월 구독 CTA로 쓸 수 있게 구성돼 있습니다.

이 문서는 공개 랜딩과 가격 화면에 실제 결제 링크를 붙일 때 필요한 최소 설정만 정리한 문서입니다.

## 1. Stripe에서 월 구독 상품 만들기

추천 시작 구조:

- `Free`: 무료 체험
- `Plus`: `$12 / month`
- `Pro`: `$29 / month`

Stripe 대시보드에서 월간 반복 결제 상품 2개를 만들고, 각각 결제 링크를 생성합니다.

## 2. 이 프로젝트가 읽는 환경변수

루트의 [`.env.example`](../.env.example) 기준으로 아래 값만 채우면 됩니다.

- `VITE_STRIPE_PLUS_URL`
- `VITE_STRIPE_PRO_URL`
- `VITE_STRIPE_PORTAL_URL`
- `VITE_SALES_EMAIL`

설명:

- `VITE_STRIPE_PLUS_URL`: Plus 플랜 결제 링크
- `VITE_STRIPE_PRO_URL`: Pro 플랜 결제 링크
- `VITE_STRIPE_PORTAL_URL`: 구독 관리 링크
- `VITE_SALES_EMAIL`: Enterprise 문의 및 결제 링크 미연결 시 문의 fallback

## 3. 권장 운영 방식

가장 단순하고 안전한 공개 판매 구조는 아래 순서입니다.

1. 공개 랜딩에서 가치 설명
2. 가격 페이지에서 Free / Plus / Pro 제시
3. Plus / Pro는 Stripe 결제 링크로 바로 이동
4. Free는 바로 체험 화면으로 이동
5. 결제 후 구독 관리가 필요하면 Stripe Customer Portal로 이동

## 4. 고객 포털은 꼭 같이 여는 편이 좋습니다

결제 링크만 있고 구독 관리 경로가 없으면 해지, 카드 변경, 플랜 변경이 번거로워집니다.

그래서 `VITE_STRIPE_PORTAL_URL`도 같이 연결하는 편이 좋습니다.

가격 화면에서는 이 포털 링크 유무에 따라 고객에게 안내 문구가 달라집니다.

## 5. 현재 코드가 제공하는 범위

지금 공개 사이트에서 바로 가능한 것:

- 홈 랜딩
- 가격 페이지
- Stripe 결제 링크 CTA
- Stripe 고객 포털 안내
- Enterprise 문의 전환

아직 별도 구현이 필요한 것:

- 로그인/회원가입
- 웹훅 기반 구독 상태 동기화
- 플랜별 권한 제한
- 팀 좌석/워크스페이스 개념

## 6. 바로 다음 구현 순서

제품을 실제 SaaS처럼 운영하려면 다음 순서가 가장 안전합니다.

1. Stripe 링크 연결
2. 고객 포털 연결
3. 결제 완료 후 이동 페이지 추가
4. 구독 상태 저장용 백엔드와 웹훅 추가
5. 플랜별 기능 제한 연결

## 참고

- [Stripe Payment Links](https://docs.stripe.com/payment-links)
- [Stripe Customer Portal](https://docs.stripe.com/customer-management)
- [Stripe Subscriptions](https://docs.stripe.com/billing/subscriptions/overview)
