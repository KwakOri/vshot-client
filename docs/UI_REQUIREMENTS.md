# VShot v2 - UI 구현 요구사항 정리

## 1. 프로젝트 개요

**VShot v2**는 WebRTC 기반 1:1 실시간 영상통화 + 고해상도 사진 촬영/합성 포토부스 애플리케이션입니다.

### 1.1 기술 스택

| 카테고리 | 기술 |
|---------|------|
| **프레임워크** | Next.js 15, React 19, TypeScript 5 |
| **스타일링** | Tailwind CSS 3.4, Custom CSS |
| **상태관리** | Zustand 4.5 |
| **영상처리** | FFmpeg.wasm, Canvas 2D, WebGL |
| **통신** | WebSocket (Signaling), WebRTC P2P |
| **아이콘** | Lucide React |

### 1.2 테마 컬러

```css
Primary:    #FC712B (주황색)
Secondary:  #FD9319 (밝은 주황)
Dark:       #1B1612 (진한 갈색)
Light:      #F3E9E7 (밝은 베이지)
Neutral:    #E2D4C4 (중간 베이지)
```

---

## 2. 페이지별 UI 요구사항

### 2.1 홈 페이지 (`/`)

**목적**: 역할 선택 (Host/Guest)

#### UI 요소
- [ ] 브랜드 헤더 (VShot v2 로고 + 설명)
- [ ] 역할 선택 버튼 (2열 그리드)
  - Host (VR) - Primary 색상
  - Guest (Camera) - Secondary 색상
- [ ] 사용 방법 안내 섹션 (5단계)
- [ ] 반응형 레이아웃 (모바일/태블릿/데스크톱)

#### 인터랙션
- 역할 선택 시 Zustand 스토어 초기화
- 부드러운 호버/클릭 애니메이션

---

### 2.2 Host 페이지 (`/host`)

**목적**: VTuber(버튜버) 역할 - 화면 공유 + 크로마키 + 촬영 제어

#### 2.2.1 메인 레이아웃

```
┌─────────────────────────────────────────────────┐
│  Header: 방 ID + 연결 상태                        │
├─────────────────────┬───────────────────────────┤
│                     │  Settings Panel           │
│  Video Display      │  - 소스 선택              │
│  (2:3 세로형)       │  - 크로마키 설정          │
│                     │  - 촬영 설정              │
│                     │  - 프레임 선택            │
├─────────────────────┴───────────────────────────┤
│  Photo Thumbnails (촬영된 사진 미리보기)          │
├─────────────────────────────────────────────────┤
│  Action Buttons (촬영 시작, 영상 생성 등)         │
└─────────────────────────────────────────────────┘
```

#### 2.2.2 필수 UI 컴포넌트

**1. Connection Status (연결 상태)**
- [ ] 연결 상태 표시 (연결됨/대기중)
- [ ] 방 ID 표시 + 복사 버튼
- [ ] Peer ID 표시 (Guest 연결 시)

**2. Video Display Panel**
- [ ] 2:3 종횡비 비디오 영역
- [ ] 체크보드 배경 (투명도 표시)
- [ ] 합성 화면 표시 (Host + Guest)
- [ ] 좌우 반전 토글

**3. Settings Panel**
```
소스 선택
├─ 화면 공유 버튼
├─ 카메라 선택 버튼
└─ 소스 전환

크로마키 설정
├─ 활성화 토글
├─ 민감도 슬라이더 (0-100)
└─ 부드러움 슬라이더 (0-100)

촬영 설정
├─ 녹화 시간 (5-15초)
├─ 촬영 간격 (0-10초)
└─ 총 촬영 장수

프레임 레이아웃
├─ 레이아웃 선택 그리드
└─ 선택 가능 사진 수 표시
```

**4. Countdown Overlay**
- [ ] 전체 화면 오버레이
- [ ] 큰 숫자 표시 (10-1)
- [ ] 애니메이션 효과

**5. Flash Overlay**
- [ ] 촬영 시 흰색 플래시 효과
- [ ] 빠른 fade-out 애니메이션

**6. Photo Thumbnails**
- [ ] 촬영된 사진 그리드
- [ ] 각 사진 번호 표시
- [ ] Guest 선택 상태 표시

**7. Action Buttons**
- [ ] 촬영 시작 버튼
- [ ] 영상 프레임 생성 버튼
- [ ] 사진 프레임 생성 버튼

---

### 2.3 Guest 페이지 (`/guest`)

**목적**: 실사 카메라 역할 - 카메라 공유 + 사진 선택

#### 2.3.1 메인 레이아웃

```
┌─────────────────────────────────────────────────┐
│  Header: 방 ID 입력 + 연결 상태                   │
├─────────────────────┬───────────────────────────┤
│                     │  입장 전: 방 ID 입력       │
│  Video Display      │  입장 후: 연결 정보        │
│  (2:3 세로형)       │                           │
│                     │                           │
├─────────────────────┴───────────────────────────┤
│  Photo Selection (사진 선택 - 4장)               │
├─────────────────────────────────────────────────┤
│  Results: 프레임 생성 + 다운로드                  │
└─────────────────────────────────────────────────┘
```

#### 2.3.2 필수 UI 컴포넌트

**1. Join Panel (입장 전)**
- [ ] 방 ID 입력 필드
- [ ] 카메라 시작 버튼
- [ ] 화면 공유 버튼
- [ ] 입장 버튼

**2. Video Display Panel**
- [ ] 로컬 카메라 미리보기
- [ ] 합성 화면 (Host 연결 후)
- [ ] 카운트다운 오버레이

**3. Photo Selection Panel**
- [ ] 촬영된 사진 그리드 (8장)
- [ ] 선택 가능 상태 표시
- [ ] 선택 순서 번호 (1-4)
- [ ] 최대 4장 선택 제한
- [ ] 선택 완료 버튼

**4. Result Panel**
- [ ] 사진 프레임 미리보기
- [ ] 영상 프레임 미리보기
- [ ] 다운로드 버튼들
- [ ] 로딩 상태 표시

---

### 2.4 Frames 페이지 (`/frames`)

**목적**: 프레임 레이아웃 미리보기

#### UI 요소
- [ ] 6가지 프레임 레이아웃 그리드
- [ ] 각 레이아웃 미리보기 이미지
- [ ] 레이아웃 정보 (이름, 슬롯 수)
- [ ] 선택 시 확대 보기

---

## 3. 공통 UI 컴포넌트

### 3.1 기존 컴포넌트 목록

| 컴포넌트 | 파일 | 역할 |
|---------|------|------|
| ConnectionStatus | `ConnectionStatus.tsx` | 연결 상태 표시 |
| VideoDisplayPanel | `VideoDisplayPanel.tsx` | 비디오 화면 |
| PhotoSelectionPanel | `PhotoSelectionPanel.tsx` | 사진 선택 |
| CountdownOverlay | `CountdownOverlay.tsx` | 카운트다운 |
| FlashOverlay | `FlashOverlay.tsx` | 플래시 효과 |
| PhotoCounter | `PhotoCounter.tsx` | 사진 개수 |
| ProcessingIndicator | `ProcessingIndicator.tsx` | 로딩 표시 |
| SegmentedBar | `SegmentedBar.tsx` | 슬라이더 |
| SettingsPanel | `SettingsPanel.tsx` | 설정 래퍼 |
| PhotoThumbnailGrid | `PhotoThumbnailGrid.tsx` | 썸네일 그리드 |

### 3.2 추가 필요 컴포넌트

- [ ] **Button** - 다양한 variant (primary, secondary, outline, ghost)
- [ ] **Input** - 텍스트 입력 필드
- [ ] **Card** - 정보 카드
- [ ] **Modal** - 모달 다이얼로그
- [ ] **Toast** - 알림 메시지
- [ ] **Slider** - 범위 슬라이더
- [ ] **Toggle** - 스위치 토글
- [ ] **Tabs** - 탭 네비게이션
- [ ] **Tooltip** - 툴팁
- [ ] **Badge** - 상태 뱃지
- [ ] **Progress** - 진행 표시줄
- [ ] **Skeleton** - 로딩 스켈레톤

---

## 4. 핵심 기능별 UI 흐름

### 4.1 사진 촬영 흐름

```
1. Host: "촬영 시작" 클릭
   └─ UI: 버튼 비활성화, 상태 표시

2. 카운트다운 (10초)
   └─ UI: CountdownOverlay 표시 (10-1)

3. 촬영 순간
   └─ UI: FlashOverlay 표시, 사운드(옵션)

4. 사진 저장
   └─ UI: PhotoCounter 업데이트, 썸네일 추가

5. 반복 (8장)
   └─ UI: 진행 상태 표시

6. 완료
   └─ UI: 촬영 완료 알림, 선택 단계로 전환
```

### 4.2 사진 선택 흐름 (Guest)

```
1. 합성된 사진 표시
   └─ UI: 8장 그리드 표시

2. 사진 선택 (최대 4장)
   └─ UI: 선택 순서 번호, 선택된 사진 하이라이트

3. 선택 완료
   └─ UI: "프레임 생성" 버튼 활성화

4. Host에 선택 정보 전송
   └─ UI: 동기화 상태 표시
```

### 4.3 프레임 생성 흐름

```
1. 선택 완료 (4장)
   └─ UI: 프레임 생성 버튼 활성화

2. 생성 시작
   └─ UI: ProcessingIndicator 표시

3. 완료
   └─ UI: 결과 미리보기 + 다운로드 버튼
```

---

## 5. 반응형 디자인 요구사항

### 5.1 브레이크포인트

```css
Mobile:  < 640px  (세로 스택 레이아웃)
Tablet:  640px - 1024px (2열 그리드)
Desktop: > 1024px (최적화된 레이아웃)
```

### 5.2 비디오 영역

- 항상 2:3 종횡비 유지
- 최대 너비 제한 (컨테이너에 맞춤)
- 중앙 정렬

### 5.3 설정 패널

- Mobile: 비디오 아래 전체 너비
- Tablet/Desktop: 비디오 옆 사이드바

---

## 6. 애니메이션 및 트랜지션

### 6.1 필수 애니메이션

| 요소 | 애니메이션 | Duration |
|------|----------|----------|
| 버튼 호버 | scale + opacity | 150ms |
| 카운트다운 | scale + fade | 1000ms |
| 플래시 | opacity fade-out | 300ms |
| 모달 | fade + scale | 200ms |
| 토스트 | slide-in/out | 300ms |
| 페이지 전환 | fade | 200ms |

### 6.2 CSS Keyframes (기존)

```css
@keyframes flash {
  0% { opacity: 0.9; }
  100% { opacity: 0; }
}
```

---

## 7. 접근성 (Accessibility)

### 7.1 필수 요구사항

- [ ] 키보드 네비게이션 지원
- [ ] ARIA 레이블 추가
- [ ] 충분한 색상 대비
- [ ] 포커스 표시기
- [ ] 스크린 리더 호환

### 7.2 색상 대비

- 텍스트: 최소 4.5:1 대비율
- 큰 텍스트: 최소 3:1 대비율
- UI 요소: 최소 3:1 대비율

---

## 8. 상태 관리 (Zustand)

### 8.1 저장되는 상태

```typescript
interface AppStore {
  // 방 정보
  roomId: string | null
  userId: string
  role: 'host' | 'guest' | null
  peerId: string | null

  // 프레임 선택
  selectedFrameLayoutId: string

  // 크로마키 설정
  chromaKey: {
    enabled: boolean
    color: string
    similarity: number
    smoothness: number
  }

  // 사진 데이터
  capturedPhotos: CapturedPhoto[]
  selectedPhotos: number[]
  peerSelectedPhotos: number[]
}
```

### 8.2 localStorage 지속 항목

- roomId
- userId
- role
- selectedFrameLayoutId

---

## 9. 프레임 레이아웃 시스템

### 9.1 기본 레이아웃 (6종)

| ID | 이름 | 슬롯 수 | 설명 |
|----|------|--------|------|
| `4cut-grid` | 인생네컷 (2x2) | 4 | 클래식 4컷 스타일 |
| `1cut-polaroid` | 폴라로이드 | 1 | 단일 사진 |
| `4cut-quoka` | 쿼카 4컷 | 4 | 변형 4컷 |
| ... | ... | ... | ... |

### 9.2 레이아웃 데이터 구조

```typescript
interface FrameLayout {
  id: string
  label: string
  slotCount: number
  positions: FrameSlot[]
  canvasWidth: number   // 3000
  canvasHeight: number  // 4500
  thumbnailSrc: string
  frameSrc: string
  description?: string
  category?: string
}

interface FrameSlot {
  x: number
  y: number
  width: number
  height: number
  zIndex?: number
  rotation?: number
  borderRadius?: number
}
```

---

## 10. API 연동

### 10.1 인증 헤더

모든 API 요청에 포함:
```
X-API-Key: {NEXT_PUBLIC_API_KEY}
```

### 10.2 주요 엔드포인트

| 엔드포인트 | 메서드 | 용도 |
|-----------|--------|------|
| `/api/ice-servers` | GET | ICE/TURN 서버 조회 |
| `/api/photo/upload` | POST | 사진 업로드 |
| `/api/photo/merge` | POST | 사진 합성 |
| `/api/video/upload` | POST | 영상 업로드 |

---

## 11. 구현 우선순위

### Phase 1: 핵심 UI (필수)
1. [ ] 홈 페이지 역할 선택
2. [ ] Host 페이지 기본 레이아웃
3. [ ] Guest 페이지 기본 레이아웃
4. [ ] 비디오 표시 패널
5. [ ] 연결 상태 표시

### Phase 2: 촬영 기능 UI
1. [ ] 카운트다운 오버레이
2. [ ] 플래시 효과
3. [ ] 사진 썸네일 그리드
4. [ ] 촬영 진행 표시

### Phase 3: 설정 및 제어
1. [ ] 크로마키 설정 패널
2. [ ] 촬영 설정 슬라이더
3. [ ] 프레임 레이아웃 선택기

### Phase 4: 결과 및 다운로드
1. [ ] 사진 선택 UI (Guest)
2. [ ] 프레임 생성 결과 표시
3. [ ] 다운로드 버튼

### Phase 5: 개선
1. [ ] 애니메이션 추가
2. [ ] 에러 처리 UI
3. [ ] 로딩 스켈레톤
4. [ ] 접근성 개선

---

## 12. 참고 파일 위치

```
client/
├── app/
│   ├── page.tsx              # 홈
│   ├── host/page.tsx         # Host 페이지
│   ├── guest/page.tsx        # Guest 페이지
│   └── frames/page.tsx       # 프레임 미리보기
├── components/
│   ├── ConnectionStatus.tsx
│   ├── VideoDisplayPanel.tsx
│   ├── PhotoSelectionPanel.tsx
│   ├── CountdownOverlay.tsx
│   ├── FlashOverlay.tsx
│   └── ...
├── lib/
│   ├── store.ts              # Zustand 상태
│   ├── api.ts                # API 유틸리티
│   └── ...
├── hooks/
│   ├── useSignaling.ts
│   ├── useWebRTC.ts
│   └── ...
├── constants/
│   ├── constants.ts          # 해상도, 레이아웃 설정
│   └── frame-layouts.ts      # 프레임 템플릿
└── types/
    └── index.ts              # TypeScript 타입
```

---

*문서 생성일: 2026-01-30*
*VShot v2 Client - UI Requirements Document*
