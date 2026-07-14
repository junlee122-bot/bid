import type { Metadata } from "next";

import { DecisionRoomPage } from "@/components/features/decision-room-page";

export const metadata: Metadata = {
  title: "자금 의사결정실",
  description: "확률형 계약 스트레스와 제한된 운전자금의 설명 가능한 배분",
};

export default function Page() {
  return <DecisionRoomPage />;
}
