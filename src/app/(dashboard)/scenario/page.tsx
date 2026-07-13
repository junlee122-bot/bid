import type { Metadata } from "next";
import { ScenarioPage } from "@/components/features/scenario-page";

export const metadata: Metadata = { title: "시나리오 랩" };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ contract?: string | string[] }>;
}) {
  const { contract } = await searchParams;
  const initialContractId = Array.isArray(contract) ? contract[0] : contract;

  return <ScenarioPage initialContractId={initialContractId} />;
}
