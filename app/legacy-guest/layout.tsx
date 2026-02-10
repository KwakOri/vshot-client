import { AppViewLayout } from "@/components";
import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: "VShot Classic | 게스트",
  description: "VShot Classic 포토부스 게스트 모드",
};

export default function GuestLayout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
