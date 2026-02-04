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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={modalRef}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-neutral">
          <h2 className="text-lg font-bold text-dark">Settings</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-neutral/40 transition"
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
        <div className="p-4">
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
          />
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-4 py-3 border-t border-neutral bg-neutral/20">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-neutral hover:bg-neutral-dark text-dark font-semibold rounded-lg transition"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="flex-1 px-4 py-2 bg-primary hover:bg-primary-dark text-white font-semibold rounded-lg transition"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
});
