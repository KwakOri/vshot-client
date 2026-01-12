import { RefObject } from 'react';
import { CountdownOverlay } from './CountdownOverlay';

interface VideoDisplayPanelProps {
  role: 'host' | 'guest';

  // Stream state
  isActive: boolean;
  remoteStream: MediaStream | null;

  // Refs
  localVideoRef: RefObject<HTMLVideoElement>;
  localCanvasRef?: RefObject<HTMLCanvasElement>; // Used by both Host and Guest for photo capture
  remoteVideoRef: RefObject<HTMLVideoElement>;
  remoteCanvasRef?: RefObject<HTMLCanvasElement>; // Guest only - for Host's chroma key
  compositeCanvasRef: RefObject<HTMLCanvasElement>;

  // Display settings
  flipHorizontal: boolean;

  // UI state
  countdown: number | null;
}

export function VideoDisplayPanel({
  role,
  isActive,
  remoteStream,
  localVideoRef,
  localCanvasRef,
  remoteVideoRef,
  remoteCanvasRef,
  compositeCanvasRef,
  flipHorizontal,
  countdown,
}: VideoDisplayPanelProps) {
  const isHost = role === 'host';
  const isGuest = role === 'guest';

  const title = remoteStream
    ? '합성 화면 (Guest + Host)'
    : isHost
    ? '내 화면 (Host)'
    : '내 영상 (Guest)';

  const inactiveMessage = isHost
    ? '화면 공유를 시작해주세요'
    : '카메라를 준비하는 중...';

  return (
    <div className="bg-gray-800 rounded-lg p-4 w-full max-w-[90vw] lg:max-w-none mx-auto lg:mx-0">
      <h2 className="text-xl font-semibold mb-4">{title}</h2>

      <div
        className="relative bg-black rounded-lg overflow-hidden w-full lg:h-[calc(90vh-8rem)]"
        style={{ aspectRatio: '2/3' }}
      >
        {/* Checkerboard background pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `
              linear-gradient(45deg, #333 25%, transparent 25%),
              linear-gradient(-45deg, #333 25%, transparent 25%),
              linear-gradient(45deg, transparent 75%, #333 75%),
              linear-gradient(-45deg, transparent 75%, #333 75%)
            `,
            backgroundSize: "20px 20px",
            backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0px",
          }}
        />

        {/* Content layer */}
        {isHost ? (
          // Host: Show canvas (chroma key processed)
          <div className="absolute inset-0 flex items-center justify-center">
            {/* Show own chroma key canvas when alone */}
            <canvas
              ref={localCanvasRef}
              className={`absolute max-w-full max-h-full transition-opacity ${
                remoteStream ? "opacity-0" : "opacity-100"
              }`}
              style={{
                transform: flipHorizontal ? 'scaleX(-1)' : 'scaleX(1)',
                aspectRatio: '2/3',
              }}
            />

            {/* Show composite when connected */}
            <canvas
              ref={compositeCanvasRef}
              className={`absolute max-w-full max-h-full transition-opacity ${
                !remoteStream ? "opacity-0" : "opacity-100"
              }`}
              style={{
                aspectRatio: '2/3',
              }}
            />
          </div>
        ) : (
          // Guest: Show video element when alone
          <div className="absolute inset-0">
            {/* Show own video when alone */}
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`absolute inset-0 w-full h-full object-cover transition-opacity ${
                remoteStream ? "opacity-0" : "opacity-100"
              }`}
              style={{
                transform: flipHorizontal ? 'scaleX(-1)' : 'scaleX(1)',
              }}
            />

            {/* Show composite when connected */}
            <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${
              !remoteStream ? "opacity-0" : "opacity-100"
            }`}>
              <canvas
                ref={compositeCanvasRef}
                className="absolute max-w-full max-h-full"
                style={{
                  aspectRatio: '2/3',
                }}
              />
            </div>
          </div>
        )}

        {/* Countdown overlay */}
        <CountdownOverlay countdown={countdown} />

        {/* Inactive message */}
        {!isActive && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-black">
            {inactiveMessage}
          </div>
        )}

        {/* Hidden video elements for processing - positioned inside container */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
        />

        {isHost && (
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
          />
        )}

        {isGuest && remoteCanvasRef && (
          <canvas
            ref={remoteCanvasRef}
            className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
          />
        )}

        {isGuest && localCanvasRef && (
          <canvas
            ref={localCanvasRef}
            className="absolute top-0 left-0 w-0 h-0 opacity-0 pointer-events-none"
          />
        )}
      </div>
    </div>
  );
}
