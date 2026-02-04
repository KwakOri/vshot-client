import { memo } from 'react';

interface DeviceSelectorProps {
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  audioOutputDevices?: MediaDeviceInfo[];
  selectedVideoDeviceId: string | null;
  selectedAudioDeviceId: string | null;
  selectedAudioOutputDeviceId?: string | null;
  onVideoDeviceChange: (deviceId: string) => void;
  onAudioDeviceChange: (deviceId: string) => void;
  onAudioOutputDeviceChange?: (deviceId: string) => void;
  disabled?: boolean;
  showCamera?: boolean;
  showMicrophone?: boolean;
  showSpeaker?: boolean;
}

/**
 * Dropdown selects for camera and microphone devices.
 * Shows device labels (after permission granted).
 * Styled with project theme colors.
 */
export const DeviceSelector = memo(function DeviceSelector({
  videoDevices,
  audioDevices,
  audioOutputDevices = [],
  selectedVideoDeviceId,
  selectedAudioDeviceId,
  selectedAudioOutputDeviceId,
  onVideoDeviceChange,
  onAudioDeviceChange,
  onAudioOutputDeviceChange,
  disabled = false,
  showCamera = true,
  showMicrophone = true,
  showSpeaker = false,
}: DeviceSelectorProps) {
  // Helper to get display label for device
  const getDeviceLabel = (device: MediaDeviceInfo, index: number, type: 'video' | 'audio' | 'audiooutput') => {
    if (device.label) {
      return device.label;
    }
    // Fallback if permission not granted (labels are empty)
    if (type === 'video') return `Camera ${index + 1}`;
    if (type === 'audio') return `Microphone ${index + 1}`;
    return `Speaker ${index + 1}`;
  };

  return (
    <div className="space-y-3">
      {/* Camera Selection */}
      {showCamera && (
        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Camera
          </label>
          <select
            value={selectedVideoDeviceId || ''}
            onChange={(e) => onVideoDeviceChange(e.target.value)}
            disabled={disabled || videoDevices.length === 0}
            className="w-full px-3 py-2 bg-white border-2 border-neutral rounded-lg text-dark text-sm focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {videoDevices.length === 0 ? (
              <option value="">No cameras found</option>
            ) : (
              videoDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {getDeviceLabel(device, index, 'video')}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {/* Microphone Selection */}
      {showMicrophone && (
        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Microphone
          </label>
          <select
            value={selectedAudioDeviceId || ''}
            onChange={(e) => onAudioDeviceChange(e.target.value)}
            disabled={disabled || audioDevices.length === 0}
            className="w-full px-3 py-2 bg-white border-2 border-neutral rounded-lg text-dark text-sm focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {audioDevices.length === 0 ? (
              <option value="">No microphones found</option>
            ) : (
              audioDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {getDeviceLabel(device, index, 'audio')}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      {/* Speaker Selection */}
      {showSpeaker && onAudioOutputDeviceChange && (
        <div>
          <label className="block text-sm font-medium text-dark mb-1">
            Speaker
          </label>
          <select
            value={selectedAudioOutputDeviceId || ''}
            onChange={(e) => onAudioOutputDeviceChange(e.target.value)}
            disabled={disabled || audioOutputDevices.length === 0}
            className="w-full px-3 py-2 bg-white border-2 border-neutral rounded-lg text-dark text-sm focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {audioOutputDevices.length === 0 ? (
              <option value="">No speakers found</option>
            ) : (
              audioOutputDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {getDeviceLabel(device, index, 'audiooutput')}
                </option>
              ))
            )}
          </select>
        </div>
      )}
    </div>
  );
});
