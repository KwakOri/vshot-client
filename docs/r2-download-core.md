# R2 다운로드 핵심 로직

R2 스토리지에서 디지털 상품을 다운로드하는 핵심 코드 요약입니다.

---

## 1. R2 클라이언트 초기화

**파일:** `lib/server/utils/r2.ts`

```typescript
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
```

---

## 2. Signed URL 생성 (핵심)

구매자에게 임시 다운로드 링크를 제공합니다.

```typescript
export interface SignedUrlOptions {
  key: string;           // R2 파일 경로 (예: "voicepacks/miruru-vol1.zip")
  expiresIn?: number;    // 만료 시간 (초, 기본: 3600)
  filename?: string;     // 다운로드 파일명
}

export async function generateSignedUrl(options: SignedUrlOptions): Promise<string> {
  const { key, expiresIn = 3600, filename } = options;

  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ResponseContentDisposition: filename
      ? `attachment; filename="${encodeURIComponent(filename)}"`
      : 'attachment',
  });

  return await getSignedUrl(r2Client, command, { expiresIn });
}
```

**핵심 포인트:**
- `GetObjectCommand` - R2에서 파일 읽기 명령
- `ResponseContentDisposition: attachment` - 브라우저가 파일을 다운로드로 처리
- `getSignedUrl` - 임시 접근 가능한 서명된 URL 생성

---

## 3. 다운로드 링크 생성 (Service Layer)

**파일:** `lib/server/services/order.service.ts`

```typescript
static async generateDownloadLink(orderId: string, itemId: string, userId: string) {
  // 1. 주문 아이템 + 상품 정보 조회
  const { data: orderItem } = await supabase
    .from("order_items")
    .select(`*, order:orders(*), product:products(*)`)
    .eq("id", itemId)
    .eq("order_id", orderId)
    .single();

  // 2. 권한 확인 (본인 주문만)
  if (order.user_id !== userId) {
    throw new AuthorizationError("다운로드 권한이 없습니다");
  }

  // 3. 주문 상태 확인 (PAID 이상)
  const validStatuses = ["PAID", "MAKING", "SHIPPING", "DONE"];
  if (!validStatuses.includes(order.status)) {
    throw new ApiError("결제가 완료된 주문만 다운로드할 수 있습니다", 403);
  }

  // 4. 파일명 생성
  const filename = `${product.name}.zip`;

  // 5. R2 Signed URL 생성
  const { generateSignedUrl } = await import("@/lib/server/utils/r2");
  const url = new URL(product.digital_file_url);  // R2 Public URL
  const r2Key = url.pathname.substring(1);        // 경로에서 키 추출

  const downloadUrl = await generateSignedUrl({
    key: r2Key,
    expiresIn: 3600,
    filename,
  });

  // 6. 다운로드 횟수 증가
  await supabase
    .from("order_items")
    .update({
      download_count: newDownloadCount,
      last_downloaded_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  return { downloadUrl, expiresIn: 3600, filename };
}
```

---

## 4. 파일 직접 다운로드 (Buffer)

서버에서 파일을 직접 읽어야 할 경우:

```typescript
export async function downloadFile(key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
  });

  const response = await r2Client.send(command);
  const stream = response.Body as NodeJS.ReadableStream;

  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
```

---

## 5. 다운로드 흐름 요약

```
1. 사용자 다운로드 요청
      ↓
2. 인증 + 권한 확인 (본인 주문, PAID 이상)
      ↓
3. product.digital_file_url에서 R2 키 추출
      ↓
4. generateSignedUrl()로 임시 URL 생성 (1시간 유효)
      ↓
5. 다운로드 횟수 증가 + 로그 기록
      ↓
6. Signed URL 반환 → 사용자 다운로드
```

---

## 6. 환경변수

```env
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=your-bucket-name
R2_PUBLIC_URL=https://your-bucket.r2.dev
```

---

## 7. 사용 예시

```typescript
// API에서 사용
import { generateSignedUrl } from '@/lib/server/utils/r2';

const downloadUrl = await generateSignedUrl({
  key: 'voicepacks/miruru-vol1.zip',
  expiresIn: 600,  // 10분
  filename: '미루루 보이스팩.zip'
});

// 클라이언트에 반환
return Response.json({ downloadUrl });
```
