import { create } from 'zustand';
import { RoomState, CapturedPhoto } from '@/types';

export interface ChromaKeySettings {
  enabled: boolean;
  color: string; // hex color
  similarity: number; // 0-1
  smoothness: number; // 0-1
}

interface AppStore extends RoomState {
  // Chroma key settings
  chromaKey: ChromaKeySettings;
  setChromaKeyEnabled: (enabled: boolean) => void;
  setChromaKeyColor: (color: string) => void;
  setChromaKeySimilarity: (similarity: number) => void;
  setChromaKeySmoothness: (smoothness: number) => void;

  // Actions
  setRoomId: (roomId: string) => void;
  setUserId: (userId: string) => void;
  setRole: (role: 'host' | 'guest' | null) => void;
  setPeerId: (peerId: string | null) => void;
  setIsConnected: (isConnected: boolean) => void;
  addCapturedPhoto: (photo: CapturedPhoto) => void;
  updatePhotoData: (photoNumber: number, data: Partial<CapturedPhoto>) => void;
  togglePhotoSelection: (photoNumber: number) => void;
  setPeerSelectedPhotos: (selectedPhotos: number[]) => void;
  reset: () => void;
}

const initialState: RoomState = {
  roomId: null,
  userId: '',
  role: null,
  peerId: null,
  isConnected: false,
  capturedPhotos: [],
  selectedPhotos: [],
  peerSelectedPhotos: [],
};

const initialChromaKey: ChromaKeySettings = {
  enabled: false,
  color: '#00ff00', // default green
  similarity: 0.4,
  smoothness: 0.1,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,
  chromaKey: initialChromaKey,

  setChromaKeyEnabled: (enabled) =>
    set((state) => ({
      chromaKey: { ...state.chromaKey, enabled },
    })),
  setChromaKeyColor: (color) =>
    set((state) => ({
      chromaKey: { ...state.chromaKey, color },
    })),
  setChromaKeySimilarity: (similarity) =>
    set((state) => ({
      chromaKey: { ...state.chromaKey, similarity },
    })),
  setChromaKeySmoothness: (smoothness) =>
    set((state) => ({
      chromaKey: { ...state.chromaKey, smoothness },
    })),

  setRoomId: (roomId) => set({ roomId }),
  setUserId: (userId) => set({ userId }),
  setRole: (role) => set({ role }),
  setPeerId: (peerId) => set({ peerId }),
  setIsConnected: (isConnected) => set({ isConnected }),

  addCapturedPhoto: (photo) =>
    set((state) => ({
      capturedPhotos: [...state.capturedPhotos, photo],
    })),

  updatePhotoData: (photoNumber, data) =>
    set((state) => ({
      capturedPhotos: state.capturedPhotos.map((photo) =>
        photo.photoNumber === photoNumber ? { ...photo, ...data } : photo
      ),
    })),

  togglePhotoSelection: (photoNumber) =>
    set((state) => {
      const isSelected = state.selectedPhotos.includes(photoNumber);
      const newSelectedPhotos = isSelected
        ? state.selectedPhotos.filter((n) => n !== photoNumber)
        : state.selectedPhotos.length < 4
        ? [...state.selectedPhotos, photoNumber]
        : state.selectedPhotos;

      return { selectedPhotos: newSelectedPhotos };
    }),

  setPeerSelectedPhotos: (selectedPhotos) =>
    set({ peerSelectedPhotos: selectedPhotos }),

  reset: () => set(initialState),
}));
