import type { Metadata } from "next";
import { ContractsPage } from "@/components/features/contracts-page";

export const metadata: Metadata = { title: "계약 탐색" };

export default function Page() {
  return <ContractsPage />;
}
