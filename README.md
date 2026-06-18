# My YouTube List
구독 채널의 최신 영상을 먼저 확인하기 위한 웹앱입니다.
 - Demo: https://my-youtube-list.elly1000chun.workers.dev
<img width="70%" height="70%" alt="스크린샷 2026-06-18 095941" src="https://github.com/user-attachments/assets/0a10a9ea-e145-4256-b7ae-a60c0db3d55e" />

## Project Description
 - 유튜브는 자체적인 알고리즘에 기반한 추천 영상 리스트를 우선적으로 보여주기 때문에 사용자가 보지 않아도 되는 영상에 너무 많이 노출됩니다.
 - 이 웹앱은 구독 채널의 영상만 확인할 수 있습니다.
 - 이 웹앱은 별도 Backend를 두지 않고, Frontend도 javascript와 html 최소 스택으로 개발되었습니다.
 - 사용자의 작업 내용은 사용자 계정의 Google Drive 애플리케이션 데이터 폴더에 저장함으로써, 사용자의 개인적인 관심사나 취향이 외부에 노출될 위험성을 최소화합니다.

## MVP 기능
- Google OAuth 로그인
- YouTube 구독 채널 동기화
- 구독 채널별 최근 3일 영상 조회
- Shorts 후보 포함 여부 선택
- 최신순 영상 목록 표시
- 영상 재생, YouTube에서 열기, 목록 제외
- 카테고리 생성/삭제
- 채널을 카테고리에 등록/해제
- 미분류 채널 자동 관리

## 실행 준비

1. Google Cloud Console에서 OAuth 2.0 Client ID를 생성합니다.
2. 승인된 JavaScript origin에 로컬 개발 주소를 추가합니다.
   - 예: `http://localhost:8080`
3. YouTube Data API v3와 Google Drive API를 활성화합니다.
4. `config.example.js`를 `config.js`로 복사한 뒤 Client ID를 입력합니다.

```js
window.APP_CONFIG = {
    googleClientId: "YOUR_GOOGLE_OAUTH_CLIENT_ID.apps.googleusercontent.com",
};
```

`config.js`는 `.gitignore`에 포함되어 있어 저장소에 커밋되지 않습니다.

## 로컬 실행

정적 파일 서버로 실행하면 됩니다. Python이 있다면 외부 의존성 없이 바로 실행할 수 있습니다.

```bash
python -m http.server 8080 --bind 127.0.0.1
```

또는 원하는 정적 서버로 프로젝트 루트를 열어도 됩니다.

## 구현 메모

- 인증은 Google Identity Services token model을 사용합니다.
- API 호출은 브라우저에서 YouTube Data API v3와 Google Drive API REST 엔드포인트로 직접 보냅니다.
- 최근 영상 조회는 `search.list` 대신 채널의 uploads playlist를 `playlistItems.list`로 읽어 search quota를 사용하지 않습니다.
- Shorts 여부를 알려주는 명확한 API 필드가 없어 `contentDetails.duration`이 3분 이하인 영상을 Shorts 후보로 보고, UI 설정에 따라 표시 여부를 결정합니다.
- 사용자 카테고리, 채널 매핑, 제외한 영상은 먼저 브라우저 `localStorage`에 저장하고, 로그인한 Google 계정의 Drive `appDataFolder`에 동기화합니다.
