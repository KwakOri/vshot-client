import { AppViewLayout } from "@/components";
import { ReactNode } from "react";

export default function HostV2Layout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
