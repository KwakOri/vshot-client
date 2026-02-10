import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VShot - 버츄얼 포토부스",
  description: "WebRTC 영상통화 기반 버츄얼 포토부스 서비스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" style={{ backgroundColor: '#1B1612' }}>
      <body className="bg-dark text-foreground">{children}</body>
    </html>
  );
}
