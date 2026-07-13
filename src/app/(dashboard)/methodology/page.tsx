import type { Metadata } from "next";
import { MethodologyPage } from "@/components/features/methodology-page";

export const metadata: Metadata = { title: "방법론" };

export default function Page() {
  return <MethodologyPage />;
}
