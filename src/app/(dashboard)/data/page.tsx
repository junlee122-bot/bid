import type { Metadata } from "next";
import { DataHubPage } from "@/components/features/data-hub-page";

export const metadata: Metadata = { title: "데이터 허브" };

export default function Page() {
  return <DataHubPage />;
}
