import type { Metadata } from "next";
import { ContractDetailPage } from "@/components/features/contract-detail-page";

export const metadata: Metadata = { title: "계약 상세분석" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ContractDetailPage contractId={decodeURIComponent(id)} />;
}
