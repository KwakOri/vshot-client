import { AppViewLayout } from "@/components";
import { ReactNode } from "react";

export default function GuestLayout({ children }: { children: ReactNode }) {
  return <AppViewLayout>{children}</AppViewLayout>;
}
