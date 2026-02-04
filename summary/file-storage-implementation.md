# File Storage & DB Integrity 구현 결과

## 개요

Cloudflare R2(S3 호환)와 Supabase PostgreSQL을 연동한 파일 스토리지 시스템 구현 완료.
DB를 단일 진실 소스(Single Source of Truth)로 사용하며, orphan 파일이 발생하지 않도록 설계됨.

---

## 설치된 패키지

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

---

## 생성된 파일 목록

### 1. 라이브러리

| 파일 | 설명 |
|------|------|
| `lib/r2.ts` | R2 S3 SDK 클라이언트 및 유틸리티 함수 |
| `lib/supabase-server.ts` | 서버용 Supabase 클라이언트 (service role key 사용) |
| `lib/files.ts` | 클라이언트에서 사용할 파일 API 헬퍼 함수 |

### 2. 타입 정의

| 파일 | 설명 |
|------|------|
| `types/files.ts` | 파일 관련 TypeScript 타입 정의 |

### 3. API Routes (Next.js App Router)

| 파일 | Method | Endpoint | 설명 |
|------|--------|----------|------|
| `app/api/files/route.ts` | POST | `/api/files` | 파일 업로드 |
| `app/api/files/[id]/route.ts` | GET | `/api/files/[id]` | 파일 정보 조회 |
| `app/api/files/[id]/route.ts` | DELETE | `/api/files/[id]` | 파일 삭제 |
| `app/api/files/cleanup/route.ts` | POST | `/api/files/cleanup` | pending 파일 정리 |

---

## 핵심 설계 원칙 준수

### DB First (DB as Authority)

모든 파일은 DB 레코드가 먼저 생성된 후 R2에 업로드됨.

```
1. Generate file ID → 2. DB INSERT (pending) → 3. R2 Upload → 4. DB UPDATE (uploaded)
```

### Strong Consistency

- 업로드 실패 시 DB 레코드 롤백
- 삭제 시 R2 → DB 순서로 처리
- 트랜잭션 실패 시 일관성 유지

### Orphan Object Zero-Tolerance

- R2에만 존재하는 파일 방지
- pending 상태 파일 주기적 정리 (cleanup API)

---

## 환경변수 설정

`.env.local` 파일에 다음 환경변수 추가 필요:

```bash
# Supabase (서버용 - 추가)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Cloudflare R2 (신규)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key-id
R2_SECRET_ACCESS_KEY=your-r2-secret-access-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://your-custom-subdomain.example.com
```

### Cloudflare R2 설정 방법

1. Cloudflare Dashboard → R2 → Manage R2 API Tokens
2. Create API Token 클릭
3. Object Read & Write 권한 선택
4. Access Key ID와 Secret Access Key 복사

---

## API 상세 사양

### POST /api/files

파일 업로드 (DB First Flow)

**Request:**
```
Content-Type: multipart/form-data

file: File (required)
ownerId: string (optional)
```

**Response:**
```json
{
  "success": true,
  "file": {
    "id": "uuid",
    "url": "https://...",
    "originalFilename": "photo.png",
    "contentType": "image/png",
    "size": 12345
  }
}
```

### GET /api/files/[id]

파일 정보 조회

**Response:**
```json
{
  "success": true,
  "file": {
    "id": "uuid",
    "url": "https://...",
    "originalFilename": "photo.png",
    "contentType": "image/png",
    "size": 12345,
    "createdAt": "2024-01-01T00:00:00Z",
    "uploadedAt": "2024-01-01T00:00:01Z"
  }
}
```

### DELETE /api/files/[id]

파일 삭제 (DB → R2 순서)

**Response:**
```json
{
  "success": true
}
```

### POST /api/files/cleanup

pending 파일 정리 (cron job용)

**Query Parameters:**
- `maxAgeMinutes`: pending 파일 최대 보관 시간 (기본값: 60)
- `dryRun`: true면 실제 삭제 없이 대상만 조회

**Response:**
```json
{
  "success": true,
  "cleaned": 5,
  "errors": 0,
  "details": ["Cleaned up pending file: ..."]
}
```

---

## 클라이언트 사용 예시

### 파일 업로드

```typescript
import { uploadFile } from '@/lib/files';

const input = document.querySelector('input[type="file"]');
const result = await uploadFile(input.files[0], 'user-123');

if (result.success) {
  console.log('Uploaded:', result.file.url);
}
```

### Base64 이미지 업로드

```typescript
import { uploadBase64Image } from '@/lib/files';

// Canvas에서 캡처한 이미지 업로드
const canvas = document.querySelector('canvas');
const base64 = canvas.toDataURL('image/png');
const result = await uploadBase64Image(base64, 'capture.png');
```

### 파일 조회

```typescript
import { getFileInfo } from '@/lib/files';

const info = await getFileInfo('file-uuid');
console.log(info.file.url);
```

### 파일 삭제

```typescript
import { deleteFile } from '@/lib/files';

const result = await deleteFile('file-uuid');
if (result.success) {
  console.log('Deleted');
}
```

---

## Object Key 규칙

사용자 입력 파일명 사용 금지. UUID 기반으로 생성:

```
files/{yyyy}/{mm}/{uuid}
```

예: `files/2024/01/550e8400-e29b-41d4-a716-446655440000`

---

## 다음 단계

1. **DB 마이그레이션**: `/migrations/001_create_files_table.sql` 실행
2. **환경변수 설정**: `.env.local`에 R2 및 Supabase 키 추가
3. **Cron Job 설정**: `/api/files/cleanup` 주기적 호출 (선택)

---

## 관련 문서

- [Cloudflare R2 S3 API 문서](https://developers.cloudflare.com/r2/api/s3/)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
