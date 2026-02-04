import { useState, useEffect, useCallback } from 'react';

export interface MediaDevices {
  videoDevices: MediaDeviceInfo[];
  audioDevices: MediaDeviceInfo[];
  audioOutputDevices: MediaDeviceInfo[];
}

export interface UseMediaDevicesResult extends MediaDevices {
  refreshDevices: () => Promise<void>;
  isLoading: boolean;
  error: string | null;
}

/**
 * Hook to enumerate and manage media devices (cameras and microphones).
 * Listens for device changes and updates the list automatically.
 */
export function useMediaDevices(): UseMediaDevicesResult {
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioOutputDevices, setAudioOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const enumerateDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Need to request permission first to get device labels
      // If permission not granted, labels will be empty
      const devices = await navigator.mediaDevices.enumerateDevices();

      const videos = devices.filter(device => device.kind === 'videoinput');
      const audios = devices.filter(device => device.kind === 'audioinput');
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');

      setVideoDevices(videos);
      setAudioDevices(audios);
      setAudioOutputDevices(audioOutputs);

      console.log('[useMediaDevices] Enumerated devices:', {
        videoDevices: videos.length,
        audioDevices: audios.length,
        audioOutputDevices: audioOutputs.length,
      });
    } catch (err) {
      console.error('[useMediaDevices] Failed to enumerate devices:', err);
      setError(err instanceof Error ? err.message : 'Failed to enumerate devices');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial enumeration
  useEffect(() => {
    enumerateDevices();
  }, [enumerateDevices]);

  // Listen for device changes (e.g., plugging/unplugging devices)
  useEffect(() => {
    const handleDeviceChange = () => {
      console.log('[useMediaDevices] Device change detected, re-enumerating...');
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
    };
  }, [enumerateDevices]);

  return {
    videoDevices,
    audioDevices,
    audioOutputDevices,
    refreshDevices: enumerateDevices,
    isLoading,
    error,
  };
}
