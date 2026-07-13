import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const stages = [
  ["01", "계약 정규화", "입찰·낙찰·계약 데이터와 기업 재무를 계약 기준일에 맞춰 정규화합니다."],
  ["02", "현금흐름 복원", "선급금·기성·잔금, 보증금, 계약원가, 운영비·채무상환·차입이자를 월별로 배치합니다."],
  ["03", "스트레스 적용", "원가상승, 결제지연, 금리변화와 물량변화가 생존마진에 미치는 영향을 계산합니다."],
  ["04", "위험 분해", "마진·유동성·지연·부채·낙찰할인·이행부담별 점수와 기여도를 분리합니다."],
  ["05", "금융안 설계", "현금부족액과 회수시점에 맞춰 선급금, 팩토링, 운전자금, 보증 준비금을 조합합니다."],
] as const;

const limitations = [
  "분석값은 계약 조건과 입력 가정에 따른 시나리오이며 대출승인·수익·부도방지를 보장하지 않습니다.",
  "위험점수는 설명 가능한 규칙 기반 우선순위 지표이며 부도확률로 통계 보정된 값이 아닙니다.",
  "계약금액은 실제 매출 인식액 또는 입금액과 다를 수 있습니다.",
  "제품별 원가를 계약과 직접 연결하지 못한 경우 추정 원가와 민감도 구간을 사용합니다.",
  "나라장터 계약일은 대금 입금일이 아니므로 결제조건을 별도 입력해야 합니다.",
  "기업·계약 식별정보는 서버 로그에 남기지 않으며 API 키는 서버 환경변수에서만 읽습니다.",
] as const;

export function MethodologyPage() {
  return (
    <div>
      <PageHeader
        eyebrow="MODEL GOVERNANCE"
        title="점수보다 중요한 것은 계산 근거입니다"
        description="BID SHIELD는 부도확률을 단정하는 모델이 아니라 계약의 현금흐름 취약성과 금융 필요액을 투명하게 재계산하는 의사결정 샌드박스입니다."
      />

      <Alert variant="warning" title="해석 원칙">
        위험점수는 계약 간 우선순위를 정하는 보조지표입니다. 실제 여신·보증 결정에는 원자료 검증, 현장실사, 법규와 기관별 심사기준이 추가되어야 합니다.
      </Alert>

      <section className="mt-6 grid gap-4 lg:grid-cols-5" aria-labelledby="pipeline-heading">
        <h2 id="pipeline-heading" className="sr-only">분석 파이프라인</h2>
        {stages.map(([step, title, description]) => (
          <Card key={step} className="relative overflow-hidden">
            <span className="absolute end-3 top-2 font-mono text-4xl font-semibold text-primary/[0.07]">{step}</span>
            <CardHeader className="pb-3">
              <Badge variant="primary">STEP {step}</Badge>
              <CardTitle className="mt-3">{title}</CardTitle>
            </CardHeader>
            <CardContent><p className="text-xs leading-5 text-muted-foreground">{description}</p></CardContent>
          </Card>
        ))}
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card elevated>
          <CardHeader>
            <CardTitle>핵심 산식</CardTitle>
            <CardDescription>모든 금액은 원화, 비율은 퍼센트포인트 기준입니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Formula label="계약 생존마진" formula="조정 계약매출 − 시나리오 예상원가 − 추정 금융비용" />
            <Formula label="월말 현금" formula="전월 현금 + 계약유입 − 계약원가 − 운영비 − 예정 채무상환 − 차입이자 ± 보증금" />
            <Formula label="원가충격 손익분기" formula="조정 계약매출 ÷ 물량조정 기준원가 − 1" />
            <Formula label="필요 유동성" formula="max(0, 목표 버퍼 − 12개월 최저 예상 현금잔액)" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>위험점수 구성</CardTitle>
            <CardDescription>점수와 함께 원 단위 현금흐름 결과를 항상 병기합니다.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Weight label="생존마진" weight="30점" width="30%" />
            <Weight label="최대 유동성 부족" weight="25점" width="25%" />
            <Weight label="결제 지연" weight="15점" width="15%" />
            <Weight label="부채 상환부담" weight="10점" width="10%" />
            <Weight label="낙찰 할인폭" weight="10점" width="10%" />
            <Weight label="이행 복잡도" weight="10점" width="10%" />
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
        <Card>
          <CardHeader>
            <CardTitle>데이터 계층과 우선순위</CardTitle>
            <CardDescription>동일 필드가 충돌하면 검증수준과 기준일을 함께 보존합니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="border-b text-xs text-muted-foreground"><tr><th className="pb-3 font-medium">계층</th><th className="pb-3 font-medium">주요 데이터</th><th className="pb-3 font-medium">신뢰 표시</th><th className="pb-3 font-medium">활용</th></tr></thead>
                <tbody className="divide-y">
                  <DataRow tier="계약 원천" data="입찰공고·낙찰·계약·변경" quality="원문/실시간" use="계약 식별·가격" />
                  <DataRow tier="기업 원천" data="재무·차입·제품매출·수주" quality="검증/기준일" use="상환·원가·집중도" />
                  <DataRow tier="사용자 입력" data="결제조건·원가·운영비" quality="입력자/시각" use="현금흐름 보정" />
                  <DataRow tier="시나리오" data="원가·금리·지연·물량" quality="가정" use="민감도·방어선" />
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>모델의 한계</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {limitations.map((item) => <li key={item} className="flex gap-3 text-xs leading-5 text-muted-foreground"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />{item}</li>)}
            </ul>
            <div className="mt-5 border-t pt-4">
              <p className="text-xs font-semibold text-foreground">AI·LLM 적용 원칙</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                핵심 수치 계산은 재현성과 감사 가능성을 위해 결정론 모델이 담당합니다. LLM은 향후 검증된 결과의 요약·질의응답에만 사용하며 원자료 숫자, 위험점수, 승인 판단을 생성하거나 수정하지 않습니다.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Formula({ label, formula }: { label: string; formula: string }) {
  return <div className="rounded-lg border bg-background/50 p-3"><p className="text-xs font-medium text-foreground">{label}</p><p className="mt-1 font-mono text-[11px] leading-5 text-primary">{formula}</p></div>;
}

function Weight({ label, weight, width }: { label: string; weight: string; width: string }) {
  return <div><div className="mb-1.5 flex justify-between text-xs"><span>{label}</span><span className="font-mono text-muted-foreground">{weight}</span></div><div className="h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width }} /></div></div>;
}

function DataRow({ tier, data, quality, use }: { tier: string; data: string; quality: string; use: string }) {
  return <tr><td className="py-3 font-medium">{tier}</td><td className="py-3 text-muted-foreground">{data}</td><td className="py-3"><Badge variant="outline">{quality}</Badge></td><td className="py-3 text-muted-foreground">{use}</td></tr>;
}
