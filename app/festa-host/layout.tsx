import { AppViewLayout } from "@/components";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VShot Festa | 호스트",
  description: "VShot Festa 포토부스 호스트 — 실시간 촬영 및 게스트 관리",
};

export default function HostV3Layout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
