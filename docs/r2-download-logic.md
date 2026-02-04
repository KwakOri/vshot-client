# R2 스토리지 다운로드 로직 분석

> 마지막 업데이트: 2026-02-03

이 문서는 Lucent Management 프로젝트의 R2 스토리지 다운로드 시스템을 분석하고 정리한 문서입니다.

---

## 목차

1. [전체 아키텍처](#1-전체-아키텍처)
2. [핵심 컴포넌트](#2-핵심-컴포넌트)
3. [다운로드 흐름도](#3-다운로드-흐름도)
4. [API 엔드포인트](#4-api-엔드포인트)
5. [보안 메커니즘](#5-보안-메커니즘)
6. [현재 구현 상태](#6-현재-구현-상태)
7. [사용 예시](#7-사용-예시)

---

## 1. 전체 아키텍처

시스템은 **3-Layer 아키텍처**로 구성되어 있습니다:

```
API Route (app/api/*)
    ↓
Service Layer (lib/server/services/*)
    ↓
R2 Utility (lib/server/utils/r2.ts)
    ↓
Cloudflare R2 / Google Drive
```

### 핵심 파일 위치

| 파일 | 역할 | 주요 함수 |
|------|------|---------|
| `lib/server/utils/r2.ts` | R2 클라이언트 + 유틸리티 | uploadFile, downloadFile, generateSignedUrl, deleteFile, listFiles |
| `app/api/orders/[id]/items/[itemId]/download/route.ts` | 주문 기반 다운로드 API | GET handler |
| `app/api/download/[productId]/route.ts` | 상품 기반 다운로드 API | GET handler |
| `lib/server/services/order.service.ts` | 주문 비즈니스 로직 | generateDownloadLink |
| `lib/server/services/log.service.ts` | 로깅 | logDigitalProductDownload |

---

## 2. 핵심 컴포넌트

### 2.1 R2 클라이언트 설정

**파일:** `lib/server/utils/r2.ts`

AWS SDK의 S3Client를 사용하여 Cloudflare R2에 연결합니다.

```typescript
import { S3Client } from '@aws-sdk/client-s3';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});
```

### 2.2 주요 함수

#### `generateSignedUrl` - Signed URL 생성

임시 다운로드 링크를 생성합니다. 기본 만료 시간은 1시간(3600초)입니다.

```typescript
export async function generateSignedUrl(options: SignedUrlOptions): Promise<string> {
  const { key, expiresIn = 3600, filename } = options;

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: filename
      ? `attachment; filename="${encodeURIComponent(filename)}"`
      : 'attachment',
  });

  const signedUrl = await getSignedUrl(r2Client, command, { expiresIn });
  return signedUrl;
}
```

#### `downloadFile` - 파일 다운로드

R2에서 파일 바이너리를 직접 읽어옵니다.

```typescript
export async function downloadFile(key: string): Promise<Buffer | null> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await r2Client.send(command);
  const bodyContents = await response.Body?.transformToByteArray();
  return bodyContents ? Buffer.from(bodyContents) : null;
}
```

#### `uploadFile` - 파일 업로드

```typescript
export async function uploadFile(options: UploadOptions): Promise<string> {
  const { key, body, contentType } = options;

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await r2Client.send(command);
  return getPublicUrl(key);
}
```

#### `getPublicUrl` - 공개 URL 생성

```typescript
export function getPublicUrl(key: string): string {
  return `${R2_PUBLIC_URL}/${key}`;
}
```

#### 기타 유틸리티 함수

- `deleteFile(key)` - R2에서 파일 삭제
- `listFiles(prefix)` - 버킷의 파일 목록 조회
- `getMimeType(filename)` - MIME 타입 추론
- `formatFileSize(bytes)` - 파일 크기 포맷팅

---

## 3. 다운로드 흐름도

```
사용자 다운로드 요청
    ↓
[인증 확인]
    ├─ 미인증 → 401 에러 반환
    └─ 인증 성공 ↓
[권한 확인]
    ├─ 본인이 아님 → 403 에러 + 로그 기록
    └─ 권한 있음 ↓
[주문 상태 확인]
    ├─ PAID 미만 → 403 에러
    └─ PAID 이상 ↓
[상품 타입 확인]
    ├─ 디지털 상품 아님 → 400 에러
    └─ VOICE_PACK ↓
[파일 존재 확인]
    ├─ digital_file_url 없음 → 404 에러
    └─ URL 있음 ↓
[다운로드 횟수 증가]
    ↓
[로그 기록]
    ↓
[Google Drive URL 반환 또는 리다이렉트]
    ↓
사용자 다운로드 완료
```

---

## 4. API 엔드포인트

### 4.1 주문 기반 다운로드 API

**경로:** `GET /api/orders/:orderId/items/:itemId/download`

**파일:** `app/api/orders/[id]/items/[itemId]/download/route.ts`

**특징:**
- 보안 수준: **높음** (인증 + 권한 확인 + 주문 상태 확인)
- 목적: 구매한 디지털 상품의 다운로드 링크 생성
- 현재 Google Drive 링크 반환 (R2 Signed URL은 주석 처리됨)

**동작 흐름:**
1. 사용자 인증 확인 (미인증시 401)
2. 주문 아이템 조회
3. 권한 확인 (본인 주문만 가능)
4. 주문 상태 확인 (PAID 이상만 다운로드 가능)
5. 디지털 상품 확인 (VOICE_PACK 타입만)
6. digital_file_url 검증
7. 다운로드 횟수 증가 (DB 업데이트)
8. 로그 기록
9. Google Drive 링크 반환

**응답 예시:**
```json
{
  "downloadUrl": "https://drive.google.com/...",
  "expiresIn": 3600,
  "expiresAt": "2025-02-03T15:00:00Z",
  "filename": "미루루보이스팩.zip"
}
```

### 4.2 상품 기반 다운로드 API

**경로:** `GET /api/download/:productId`

**파일:** `app/api/download/[productId]/route.ts`

**특징:**
- 보안 수준: **중간** (간단한 구매 확인)
- 목적: 구매한 상품을 빠르게 다운로드
- Google Drive로 자동 리다이렉트

**동작 흐름:**
1. 사용자 인증 확인
2. 상품 정보 조회
3. digital_file_url 확인
4. 구매 내역 확인 (order_items + orders 조인)
   - 주문 상태: DONE
   - 아이템 상태: DONE
5. 권한 없는 접근 시 로그 기록
6. 다운로드 로그 기록
7. Google Drive 링크로 직접 리다이렉트

---

## 5. 보안 메커니즘

| 보안 계층 | 메커니즘 | 구현 위치 |
|---------|---------|---------|
| **인증** | Supabase Auth (Session) | API 진입점에서 getCurrentUser() |
| **권한** | 본인 주문만 접근 가능 | order.user_id === userId 비교 |
| **상태 검증** | PAID 이상만 다운로드 | status 확인 로직 |
| **상품 타입 검증** | VOICE_PACK만 허용 | product.type === 'VOICE_PACK' |
| **Signed URL** | 임시 접근 (현재 미사용) | R2 generateSignedUrl (주석 처리) |
| **로깅** | 모든 접근 시도 기록 | LogService로 정보 기록 |
| **이벤트 추적** | 다운로드 횟수 + 마지막 시간 | order_items 테이블 업데이트 |

### 로깅 메서드

| 메서드 | 용도 |
|--------|------|
| `logDigitalProductDownload()` | 다운로드 성공 기록 |
| `logDownloadLinkGenerated()` | 링크 생성 기록 |
| `logUnauthorizedDownload()` | 권한 없는 접근 시도 기록 |
| `logExpiredLinkAccess()` | 만료된 링크 접근 시도 기록 |

---

## 6. 현재 구현 상태

### 완전 구현된 기능

- R2 클라이언트 초기화 및 설정
- Signed URL 생성 로직 (R2에서)
- Google Drive 링크 반환
- 로깅 시스템 (이벤트 기록)
- 권한 및 상태 검증
- 다운로드 횟수 추적

### 부분 구현된 기능

- R2 Signed URL 생성 (주석 처리 - Google Drive 사용으로 전환)
- 직접 파일 스트리밍 (현재는 리다이렉트만)

### 미구현 기능

- R2에서 직접 파일 스트리밍/다운로드
- 다운로드 횟수 제한
- 다운로드 속도 제한 (Rate Limiting)

### 현재 상태 요약

> **중요:** 현재 R2 Signed URL 로직은 주석 처리되어 있고, Google Drive 링크를 사용합니다.
> 필요시 주석을 해제하면 R2에서 직접 다운로드가 가능합니다.

---

## 7. 사용 예시

### OrderService를 통한 다운로드 링크 생성

```typescript
import { OrderService } from '@/lib/server/services/order.service';

const downloadInfo = await OrderService.generateDownloadLink(
  orderId,
  itemId,
  userId
);

// 반환값:
// {
//   downloadUrl: "https://drive.google.com/...",
//   expiresIn: 3600,
//   expiresAt: "2025-02-03T15:00:00Z",
//   filename: "미루루보이스팩.zip"
// }
```

### API 호출

```bash
# 주문 기반 다운로드
curl -X GET "http://localhost:3000/api/orders/order-123/items/item-456/download" \
  -H "Authorization: Bearer {token}"

# 상품 기반 다운로드
curl -X GET "http://localhost:3000/api/download/product-789" \
  -H "Authorization: Bearer {token}"
```

### R2 유틸리티 직접 사용

```typescript
import { generateSignedUrl, downloadFile, uploadFile } from '@/lib/server/utils/r2';

// Signed URL 생성
const signedUrl = await generateSignedUrl({
  key: 'voicepacks/miruru-voicepack-v1.zip',
  expiresIn: 3600, // 1시간
  filename: '미루루보이스팩.zip'
});

// 파일 다운로드 (Buffer 반환)
const fileBuffer = await downloadFile('voicepacks/miruru-voicepack-v1.zip');

// 파일 업로드
const publicUrl = await uploadFile({
  key: 'voicepacks/new-pack.zip',
  body: fileBuffer,
  contentType: 'application/zip'
});
```

---

## 데이터베이스 테이블 관계

```
orders (주문)
  ├─ id
  ├─ user_id (users)
  ├─ status: PENDING → PAID → DONE
  └─ created_at

order_items (주문 항목)
  ├─ id
  ├─ order_id (orders)
  ├─ product_id (products)
  ├─ item_status: PENDING → DONE
  ├─ download_count (증가)
  └─ last_downloaded_at (갱신)

products (상품)
  ├─ id
  ├─ name
  ├─ type: VOICE_PACK / PHYSICAL_GOODS / BUNDLE
  └─ digital_file_url (Google Drive)
```

---

## 환경변수 설정

```env
# R2 필수 환경변수
R2_ACCOUNT_ID=your-account-id          # Cloudflare R2 계정 ID
R2_ACCESS_KEY_ID=your-access-key       # API 액세스 키
R2_SECRET_ACCESS_KEY=your-secret-key   # API 시크릿 키
R2_BUCKET_NAME=your-bucket-name        # R2 버킷 이름
R2_PUBLIC_URL=https://your-bucket.r2.dev  # 공개 CDN URL
```

상세 설정 방법은 [R2 설정 가이드](/docs/r2-setup.md)를 참조하세요.

---

## 관련 문서

- [R2 설정 가이드](/docs/r2-setup.md) - 환경변수 설정, API 토큰 생성, 버킷 설정
- [API 테스트 가이드](/docs/api-testing-guide.md) - Postman을 사용한 API 테스트
- [로깅 시스템 예시](/examples/logging/download-api-example.ts) - 다운로드 API 로깅 적용 방법
