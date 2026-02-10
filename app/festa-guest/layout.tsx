import { AppViewLayout } from "@/components";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VShot Festa | 게스트",
  description: "VShot Festa 포토부스 게스트 — 실시간 포토 촬영 참여",
};

export default function GuestV3Layout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
