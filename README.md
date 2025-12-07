# VShot v2 Client

Next.js 기반 WebRTC 실시간 영상 통화 + 고해상도 사진 촬영 클라이언트

## Features

- Host/Guest 역할 분리
- WebRTC P2P 영상 통화
- 고해상도 로컬 캡처 (투명 배경 지원)
- 실시간 사진 선택 동기화
- 서버 사이드 이미지 합성

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Tailwind CSS
- Zustand (상태 관리)
- WebRTC API
- WebSocket

## Getting Started

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local`:
```bash
cp .env.local.example .env.local
```

3. Start development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000)

## Usage

### Host (VR User)

1. `/host` 페이지 접속
2. 화면 공유 시작 (VR 화면, 투명 배경 설정 필요)
3. 생성된 Room ID를 Guest에게 전달
4. Guest 연결 대기
5. "촬영 시작" 버튼 클릭 → 8장 촬영
6. 4장 선택 → 합성 → 다운로드

### Guest (Camera User)

1. `/guest` 페이지 접속
2. Host에게 받은 Room ID 입력
3. 카메라 시작
4. Host가 촬영 시작하면 자동으로 캡처
5. 4장 선택 → 다운로드

## Project Structure

```
app/
├── page.tsx              # 홈 (Host/Guest 선택)
├── host/                 # Host 페이지
├── guest/                # Guest 페이지
├── layout.tsx
└── globals.css
components/               # 재사용 가능한 컴포넌트
hooks/
├── useSignaling.ts       # WebSocket 시그널링 훅
└── useWebRTC.ts          # WebRTC 연결 훅
lib/
├── store.ts              # Zustand 상태 관리
├── webrtc.ts             # WebRTC 유틸리티
└── websocket.ts          # WebSocket 클라이언트
types/
└── index.ts              # TypeScript 타입 정의
```

## Environment Variables

```
NEXT_PUBLIC_WS_URL=ws://localhost:3001/signaling
NEXT_PUBLIC_API_URL=http://localhost:3001
```

## Key Features

### High-Resolution Capture

- WebRTC 스트림이 아닌 로컬 원본 캡처
- PNG 형식, Alpha 채널 유지
- 서버에서 합성하여 화질 손실 최소화

### Real-time Synchronization

- 촬영 신호 동기화
- 사진 선택 실시간 공유
- WebSocket 기반 빠른 통신

## Browser Compatibility

- Chrome 90+
- Edge 90+
- Safari 15+ (일부 기능 제한)
- Firefox 88+

## License

ISC
