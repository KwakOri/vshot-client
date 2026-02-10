'use client';

import { memo, useEffect, useRef } from 'react';
import { DeviceSelector } from './DeviceSelector';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
  selectedVideoDeviceId: string | null;
  selectedAudioDeviceId: string | null;
  selectedAudioOutputDeviceId: string | null;
  onVideoDeviceChange: (deviceId: string) => void;
  onAudioDeviceChange: (deviceId: string) => void;
  onAudioOutputDeviceChange: (deviceId: string) => void;
  onApply: () => void;
  showCamera?: boolean;
  showMicrophone?: boolean;
}

export const SettingsModal = memo(function SettingsModal({
  isOpen,
  onClose,
  videoDevices,
  audioDevices,
  audioOutputDevices,
  selectedVideoDeviceId,
  selectedAudioDeviceId,
  selectedAudioOutputDeviceId,
  onVideoDeviceChange,
  onAudioDeviceChange,
  onAudioOutputDeviceChange,
  onApply,
  showCamera = true,
  showMicrophone = true,
}: SettingsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-[#1B1612] rounded-2xl shadow-2xl shadow-black/40 w-full max-w-md mx-4 overflow-hidden border border-white/[0.08]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
          <h2 className="text-lg font-bold text-[#F3E9E7]">Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-white/40 hover:text-white/80 hover:bg-white/[0.06] transition"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <DeviceSelector
            videoDevices={videoDevices}
            audioDevices={audioDevices}
            audioOutputDevices={audioOutputDevices}
            selectedVideoDeviceId={selectedVideoDeviceId}
            selectedAudioDeviceId={selectedAudioDeviceId}
            selectedAudioOutputDeviceId={selectedAudioOutputDeviceId}
            onVideoDeviceChange={onVideoDeviceChange}
            onAudioDeviceChange={onAudioDeviceChange}
            onAudioOutputDeviceChange={onAudioOutputDeviceChange}
            showCamera={showCamera}
            showMicrophone={showMicrophone}
            showSpeaker={true}
            disabled={false}
            variant="dark"
          />
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-white/[0.08]">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white/[0.06] hover:bg-white/[0.1] text-[#E2D4C4] font-semibold rounded-lg transition border border-white/[0.08]"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#FC712B] to-[#FD9319] hover:from-[#e56527] hover:to-[#e58517] text-white font-semibold rounded-lg transition shadow-lg shadow-[#FC712B]/20"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
});
