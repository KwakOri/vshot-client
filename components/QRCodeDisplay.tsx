'use client';
import { QRCodeSVG } from 'qrcode.react';

interface QRCodeDisplayProps {
  filmId: string;
  size?: number;
}

export function QRCodeDisplay({ filmId, size = 200 }: QRCodeDisplayProps) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const downloadUrl = `${appUrl}/download/${filmId}`;

  return (
    <div className="inline-flex flex-col items-center gap-2">
      <QRCodeSVG
        value={downloadUrl}
        size={size}
        level="L"
        includeMargin
      />
      <span className="text-xs text-dark/40 font-mono">{filmId.slice(0, 8)}</span>
    </div>
  );
}
