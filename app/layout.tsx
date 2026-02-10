import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VShot - 실시간 포토부스",
  description: "실시간 WebRTC 영상통화 기반 포토부스 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
