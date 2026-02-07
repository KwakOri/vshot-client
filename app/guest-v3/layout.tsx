import { AppViewLayout } from "@/components";
import { ReactNode } from "react";

export default function GuestV3Layout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
