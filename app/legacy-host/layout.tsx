import { AppViewLayout } from "@/components";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VShot Classic | 호스트",
  description: "VShot Classic 포토부스 호스트 모드",
};

export default function HostV2Layout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
