'use client';

import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'vshot-host-settings';

export interface HostSettings {
  // Chroma key settings
  chromaKeyEnabled: boolean;
  sensitivity: number;
  smoothness: number;
  chromaKeyColor: string;

  // Display options
  hostFlipHorizontal: boolean;
  guestFlipHorizontal: boolean;
  guestBlurAmount: number;

  // Capture settings
  recordingDuration: number;
  captureInterval: number;

  // Frame layout
  selectedFrameLayoutId: string;
}

const DEFAULT_SETTINGS: HostSettings = {
  chromaKeyEnabled: true,
  sensitivity: 50,
  smoothness: 10,
  chromaKeyColor: '#00ff00',
  hostFlipHorizontal: false,
  guestFlipHorizontal: false,
  guestBlurAmount: 30,
  recordingDuration: 10,
  captureInterval: 3,
  selectedFrameLayoutId: '1cut-polaroid',
};

/**
 * Load settings from localStorage
 */
function loadSettings(): HostSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle missing keys from older versions
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (error) {
    console.warn('[useHostSettings] Failed to load settings:', error);
  }

  return DEFAULT_SETTINGS;
}

/**
 * Save settings to localStorage
 */
function saveSettings(settings: HostSettings): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('[useHostSettings] Failed to save settings:', error);
  }
}

/**
 * Custom hook for persisting host settings to localStorage
 */
export function useHostSettings() {
  const [settings, setSettings] = useState<HostSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load settings on mount (client-side only)
  useEffect(() => {
    const loaded = loadSettings();
    setSettings(loaded);
    setIsLoaded(true);
  }, []);

  // Update a single setting
  const updateSetting = useCallback(<K extends keyof HostSettings>(
    key: K,
    value: HostSettings[K]
  ) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      saveSettings(updated);
      return updated;
    });
  }, []);

  // Update multiple settings at once
  const updateSettings = useCallback((updates: Partial<HostSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...updates };
      saveSettings(updated);
      return updated;
    });
  }, []);

  // Reset to defaults
  const resetSettings = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
  }, []);

  return {
    settings,
    isLoaded,
    updateSetting,
    updateSettings,
    resetSettings,
    DEFAULT_SETTINGS,
  };
}
