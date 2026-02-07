export interface FilmRecord {
  id: string;
  room_id: string;
  session_id: string | null;
  photo_file_id: string | null;
  video_file_id: string | null;
  qr_code_url: string | null;
  created_at: string;
  expires_at: string;
  status: 'active' | 'expired' | 'deleted';
}

export interface FilmCreateRequest {
  roomId: string;
  sessionId?: string;
  photoFileId?: string;
  videoFileId?: string;
}

export interface FilmResponse {
  success: boolean;
  film?: {
    id: string;
    roomId: string;
    sessionId: string | null;
    photoUrl: string | null;
    videoUrl: string | null;
    qrCodeUrl: string | null;
    createdAt: string;
    expiresAt: string;
    status: string;
  };
  error?: string;
}

export interface FilmListResponse {
  success: boolean;
  films: FilmResponse['film'][];
  total: number;
  limit: number;
  offset: number;
}
