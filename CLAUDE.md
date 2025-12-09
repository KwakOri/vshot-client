# VShot v2 Client - API 인증 가이드

## 📌 개요

VShot v2 클라이언트는 서버와의 모든 API 통신 시 **API 키 기반 인증**을 사용합니다.
프로덕션 환경에서 클라이언트와 서버가 별도의 플랫폼에 배포되므로, 인증을 통해 안전한 통신을 보장합니다.

---

## 🔐 API 인증 방식

### 1. 인증 방법

모든 API 요청은 HTTP 헤더에 API 키를 포함해야 합니다.

```
X-API-Key: your-api-key-here
```

### 2. 환경 변수 설정

클라이언트의 `.env.local` 파일에 API 키를 설정합니다:

```bash
# .env.local
NEXT_PUBLIC_API_KEY=your-secure-api-key-here
```

**⚠️ 중요:**
- 이 API 키는 **서버의 `.env` 파일에 설정된 `API_KEY`와 동일**해야 합니다.
- 프로덕션 환경에서는 **보안이 강화된 랜덤 문자열**을 사용하세요.
- API 키 생성 예시: `openssl rand -hex 32`

### 3. 서버 측 환경 변수

서버의 `.env` 파일에도 동일한 API 키를 설정합니다:

```bash
# server/.env
API_KEY=your-secure-api-key-here
```

---

## 🛠️ 코드 구현

### API 헤더 유틸리티 사용

프로젝트는 `client/lib/api.ts`에 API 인증 헤더를 생성하는 유틸리티 함수를 제공합니다:

#### 1. JSON 요청용 헤더

```typescript
import { getApiHeaders } from '@/lib/api';

const response = await fetch(`${API_URL}/api/photo/upload`, {
  method: 'POST',
  headers: getApiHeaders(),
  body: JSON.stringify(data)
});
```

#### 2. FormData/Multipart 요청용 헤더

```typescript
import { getApiHeadersMultipart } from '@/lib/api';

const formData = new FormData();
formData.append('video', blob);

const response = await fetch(`${API_URL}/api/video/upload`, {
  method: 'POST',
  headers: getApiHeadersMultipart(),
  body: formData
});
```

---

## 📋 인증이 필요한 엔드포인트

다음 API 엔드포인트는 모두 인증이 필요합니다:

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/api/ice-servers` | GET | ICE/TURN 서버 설정 조회 |
| `/api/photo/upload` | POST | 사진 업로드 |
| `/api/photo/merge` | POST | 사진 병합 |
| `/api/photo/room/:roomId` | GET | 방별 사진 조회 |
| `/api/video/upload` | POST | 동영상 업로드 |
| `/api/video/:filename` | GET | 동영상 다운로드 |

**✅ 인증 불필요:**
- `/` - 서버 정보
- `/health` - 헬스 체크
- `/uploads/*` - 정적 파일 (이미지, 동영상)

---

## 🚀 프로덕션 배포 체크리스트

### 1. 서버 설정

```bash
# server/.env (프로덕션)
API_KEY=<강력한-랜덤-문자열>
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-client-domain.com
```

### 2. 클라이언트 설정

```bash
# client/.env.local (프로덕션)
NEXT_PUBLIC_API_KEY=<서버와-동일한-API-키>
NEXT_PUBLIC_WS_URL=wss://your-server-domain.com/signaling
NEXT_PUBLIC_API_URL=https://your-server-domain.com
```

### 3. 보안 권장사항

- ✅ API 키는 최소 32자 이상의 랜덤 문자열 사용
- ✅ 서버와 클라이언트의 API 키가 정확히 일치하는지 확인
- ✅ `.env` 파일은 절대 Git에 커밋하지 않기 (`.gitignore`에 포함)
- ✅ 프로덕션 환경에서는 HTTPS/WSS 사용
- ✅ CORS 설정에서 허용 도메인을 명시적으로 지정

---

## 🐛 문제 해결

### 1. 401 Unauthorized 오류

**원인:** API 키가 요청 헤더에 포함되지 않음

**해결:**
- `.env.local` 파일에 `NEXT_PUBLIC_API_KEY`가 설정되어 있는지 확인
- 서버 재시작 후 재시도

### 2. 403 Forbidden 오류

**원인:** API 키가 일치하지 않음

**해결:**
- 클라이언트와 서버의 API 키가 정확히 동일한지 확인
- 앞뒤 공백이 없는지 확인

### 3. API 키가 undefined

**원인:** 환경 변수가 로드되지 않음

**해결:**
- Next.js 개발 서버 재시작: `npm run dev`
- 환경 변수명이 `NEXT_PUBLIC_` 접두사로 시작하는지 확인

---

## 📝 API 키 생성 방법

### Linux/Mac

```bash
openssl rand -hex 32
```

### Windows (PowerShell)

```powershell
-join ((48..57) + (97..102) | Get-Random -Count 64 | ForEach-Object {[char]$_})
```

### Node.js

```javascript
require('crypto').randomBytes(32).toString('hex')
```

---

## 🔗 관련 파일

- `client/lib/api.ts` - API 헤더 유틸리티
- `client/.env.local` - 클라이언트 환경 변수
- `server/src/middleware/apiKeyAuth.ts` - 서버 인증 미들웨어
- `server/.env` - 서버 환경 변수

---

**📌 참고:** API 키는 민감한 정보이므로 절대 코드에 하드코딩하거나 공개 저장소에 커밋하지 마세요.
