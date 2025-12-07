import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VShot v2 - VR Photo Booth",
  description: "Real-time WebRTC photo booth with VR overlay",
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
