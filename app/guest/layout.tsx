import { AppViewLayout } from "@/components";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VShot | 게스트",
  description: "VShot 버츄얼 포토부스 게스트 — 포토 촬영 참여",
};

export default function GuestV3Layout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
