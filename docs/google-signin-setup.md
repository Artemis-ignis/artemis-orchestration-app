# Google 로그인 설정

Artemis 공개 사이트에서 `Google로 계속` 버튼을 실제로 쓰려면 Google Cloud Console에서 웹용 OAuth 클라이언트 ID를 발급해야 합니다.

## 1. Google Cloud Console에서 준비

1. Google Cloud Console에서 프로젝트를 만들거나 기존 프로젝트를 선택합니다.
2. `Google Auth Platform` 또는 `API 및 서비스 > 사용자 인증 정보`에서 `OAuth 클라이언트 ID`를 생성합니다.
3. 애플리케이션 유형은 `웹 애플리케이션`을 선택합니다.
4. 승인된 JavaScript 원본에 아래 주소를 넣습니다.
   - `http://127.0.0.1:4173`
   - 필요하면 `http://localhost:4173`
5. 동의 화면의 앱 이름, 지원 이메일, 개인정보처리방침 링크, 이용약관 링크를 채웁니다.

## 2. 환경변수 연결

루트에 `.env.local` 파일을 만들고 아래 값을 채웁니다.

```env
VITE_GOOGLE_CLIENT_ID=발급받은_웹_클라이언트_ID
GOOGLE_CLIENT_ID=발급받은_웹_클라이언트_ID
ARTEMIS_PUBLIC_SESSION_SECRET=충분히_긴_랜덤_문자열
```

## 3. 실행

```powershell
npm run bridge
npm run dev
```

또는 현재 쓰는 프리뷰/브리지 실행 방식에 맞춰 재시작합니다.

## 4. 확인

1. `#/start`로 이동합니다.
2. `Google로 계속` 버튼이 보이는지 확인합니다.
3. 로그인 후 이름/이메일이 자동으로 채워지는지 확인합니다.
4. `#/account`에서 현재 플랜과 계정 상태가 보이는지 확인합니다.
