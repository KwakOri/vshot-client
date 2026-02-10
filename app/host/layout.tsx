import { AppViewLayout } from "@/components";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VShot | 호스트",
  description: "VShot 포토부스 호스트 — 실시간 촬영 및 합성",
};

export default function HostV3Layout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
