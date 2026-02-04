# Supabase 설정 가이드

## 📋 개요

이 문서는 VShot v2 프로젝트에 Supabase를 연결하고 TypeScript 타입을 생성하는 방법을 안내합니다.

## ✅ 사전 요구사항

- Supabase CLI 설치 완료 ✓
- Supabase 프로젝트 생성 완료
- `@supabase/supabase-js` 패키지 설치 완료 ✓

---

## 🚀 설정 단계

### 1. 환경 변수 설정

`.env.local` 파일에 Supabase 프로젝트 정보를 입력합니다:

```bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

**Supabase 프로젝트 정보 확인 방법:**
1. Supabase Dashboard 접속
2. 프로젝트 선택
3. Settings → API 메뉴에서 확인
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - Project API keys → anon/public → `NEXT_PUBLIC_SUPABASE_ANON_KEY`

---

### 2. Supabase 프로젝트 연결

터미널에서 client 디렉토리로 이동 후 실행:

```bash
cd client
supabase link --project-ref your-project-ref
```

**project-ref 확인 방법:**
- Supabase Dashboard URL에서 확인: `https://supabase.com/dashboard/project/[project-ref]`
- 또는 Settings → General → Reference ID

**연결 시 입력 정보:**
- Database password: Supabase 프로젝트의 데이터베이스 비밀번호

---

### 3. TypeScript 타입 생성

프로젝트 연결 후 데이터베이스 스키마 기반으로 타입을 자동 생성합니다:

```bash
npm run supabase:generate-types
```

이 명령어는 다음을 수행합니다:
- Supabase 데이터베이스 스키마 조회
- TypeScript 타입 정의 생성
- `types/supabase.ts` 파일에 저장

---

### 4. 타입 생성 확인

`types/supabase.ts` 파일이 생성되었는지 확인:

```bash
cat types/supabase.ts
```

파일에 실제 데이터베이스 테이블 타입이 포함되어 있어야 합니다.

---

## 💻 사용 예시

### Supabase 클라이언트 사용

```typescript
import { supabase } from '@/lib/supabase';

// 데이터 조회
const { data, error } = await supabase
  .from('your_table')
  .select('*');

// 데이터 삽입
const { data, error } = await supabase
  .from('your_table')
  .insert({ column: 'value' });
```

### TypeScript 타입 활용

```typescript
import type { Database } from '@/types/supabase';

type YourTable = Database['public']['Tables']['your_table']['Row'];
type YourTableInsert = Database['public']['Tables']['your_table']['Insert'];
type YourTableUpdate = Database['public']['Tables']['your_table']['Update'];
```

---

## 🔄 타입 재생성

데이터베이스 스키마가 변경되면 타입을 다시 생성해야 합니다:

```bash
npm run supabase:generate-types
```

**언제 재생성이 필요한가?**
- 새 테이블 추가
- 컬럼 추가/수정/삭제
- 타입 변경
- 관계 변경

---

## 🛠️ 추가 명령어

### Supabase 상태 확인
```bash
supabase status
```

### 프로젝트 연결 해제
```bash
supabase unlink
```

### 데이터베이스 마이그레이션 생성
```bash
supabase migration new migration_name
```

---

## 📁 생성된 파일 목록

설정 완료 후 다음 파일들이 있어야 합니다:

```
client/
├── .env.local                    # Supabase 환경 변수 포함
├── lib/
│   └── supabase.ts               # Supabase 클라이언트 초기화
├── types/
│   └── supabase.ts               # 자동 생성된 타입 정의
├── package.json                  # supabase:generate-types 스크립트 포함
└── SUPABASE_SETUP.md             # 이 문서
```

---

## ⚠️ 주의사항

1. **환경 변수 보안**
   - `.env.local` 파일은 Git에 커밋하지 않습니다 (`.gitignore`에 포함됨)
   - `NEXT_PUBLIC_*` 변수는 클라이언트에 노출됩니다
   - 민감한 정보는 서버 사이드에서만 사용하세요

2. **타입 파일 관리**
   - `types/supabase.ts`는 자동 생성 파일이므로 직접 수정하지 마세요
   - 스키마 변경 시 반드시 타입을 재생성하세요

3. **프로젝트 연결**
   - `supabase link`는 client 디렉토리에서 실행해야 합니다
   - 연결 정보는 `.supabase/` 디렉토리에 저장됩니다

---

## 🐛 문제 해결

### "Failed to link project" 오류
- Project ref가 정확한지 확인
- 데이터베이스 비밀번호가 정확한지 확인
- 네트워크 연결 확인

### 타입이 생성되지 않음
- `supabase link`가 성공했는지 확인
- 데이터베이스에 테이블이 있는지 확인
- `supabase status`로 연결 상태 확인

### 환경 변수가 undefined
- `.env.local` 파일에 변수가 설정되었는지 확인
- Next.js 개발 서버 재시작: `npm run dev`
- 변수명이 `NEXT_PUBLIC_` 접두사로 시작하는지 확인

---

## 📚 참고 자료

- [Supabase 공식 문서](https://supabase.com/docs)
- [Supabase CLI 문서](https://supabase.com/docs/guides/cli)
- [Supabase JavaScript 클라이언트](https://supabase.com/docs/reference/javascript)
- [TypeScript 타입 생성 가이드](https://supabase.com/docs/guides/api/generating-types)

---

**✅ 설정 완료 체크리스트**

- [ ] `.env.local`에 Supabase URL과 ANON KEY 설정
- [ ] `supabase link` 명령어로 프로젝트 연결
- [ ] `npm run supabase:generate-types`로 타입 생성
- [ ] `types/supabase.ts` 파일 생성 확인
- [ ] `lib/supabase.ts`에서 클라이언트 import 가능 확인
