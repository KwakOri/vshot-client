import { RefObject } from 'react';
import { CountdownOverlay } from './CountdownOverlay';

interface VideoDisplayPanelProps {
  role: 'host' | 'guest';

  // Stream state
  isActive: boolean;
  remoteStream: MediaStream | null;

  // Refs
  localVideoRef: RefObject<HTMLVideoElement | null>;
  localCanvasRef?: RefObject<HTMLCanvasElement | null>; // Used by both Host and Guest for photo capture
  remoteVideoRef: RefObject<HTMLVideoElement | null>;
  remoteCanvasRef?: RefObject<HTMLCanvasElement | null>; // Guest only - for Host's chroma key
  compositeCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Display settings
  flipHorizontal: boolean;

  // UI state
  countdown: number | null;

  // Audio settings
  remoteAudioEnabled?: boolean;
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
  remoteAudioEnabled = true,
}: VideoDisplayPanelProps) {
  const isHost = role === 'host';
  const isGuest = role === 'guest';

  const inactiveMessage = isHost
    ? '화면 공유를 시작해주세요'
    : '카메라를 준비하는 중...';

  return (
    <div className="bg-gray-800 rounded-lg p-2 w-full h-full flex items-center justify-center">
      <div
        className="relative bg-black rounded-lg overflow-hidden h-full"
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
        {/* Remote video: muted=false to enable audio playback from peer */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          muted={!remoteAudioEnabled}
          className="absolute top-0 left-0 w-px h-px opacity-0 pointer-events-none"
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
