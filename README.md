# BID SHIELD

**수주가 성장의 기회인지, 현금흐름 위기의 시작인지 계약 전에 판단합니다.**

BID SHIELD는 나라장터의 입찰공고·낙찰·계약 데이터와 기업 재무 CSV를 결합해 공공조달 계약의 12개월 현금흐름, 생존마진, 위험요인과 안전 금융조건을 계산하는 의사결정 앱입니다. 단순한 기업 검색이 아니라 “이 계약을 이 조건으로 수행해도 버틸 수 있는가?”에 답하는 것이 목적입니다.

> 현재 저장소에는 합성 데모 12건이 포함되어 있습니다. 데모 레코드는 실제 기업·기관·계약이 아니며 금융 의사결정에 사용할 수 없습니다.

## 구현된 흐름

1. **포트폴리오 관제** — 계약 총액, 자금부족액, 가중 위험점수, 위험 분포, 집중도와 우선 조치 대상을 한 화면에서 확인합니다.
2. **계약 탐색·상세 분석** — 검색·필터·정렬 후 계약별 생존마진, 손익분기 원가충격, 최저 현금, 위험 기여도와 월별 현금흐름을 확인합니다.
3. **스트레스 테스트** — 원가 상승, 대금 지연, 금리 변화, 수주 물량 변화를 조합해 기준 시나리오와 비교합니다.
4. **금융조건 설계** — 선금, 매출채권 팩토링, 운전자금 한도, 보증 예치금의 조합과 실행 안전장치를 제안합니다.
5. **데이터 허브** — 기업 재무 CSV를 검증하고 나라장터 공개 데이터를 조회한 뒤 두 레코드를 분석 계약으로 결합합니다.
6. **재현 가능한 방법론** — 모든 금액 계산과 위험점수는 LLM이 아닌 순수 TypeScript 결정론 모델로 수행됩니다.

## 빠른 시작

요구사항은 **Node.js 24 이상**과 **pnpm 11.7.0**입니다. Node 24는 내장 TypeScript 테스트 실행에 필요합니다.

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`http://localhost:3000`을 엽니다. 환경변수 없이도 합성 데모 모드로 전체 분석 흐름을 사용할 수 있습니다.

실시간 나라장터 조회를 사용하려면 `.env.example`을 `.env.local`로 복사하고 공공데이터포털 인증키를 입력합니다.

```dotenv
KONEPS_SERVICE_KEY=공공데이터포털_일반인증키
KONEPS_API_TIMEOUT_MS=8000
```

- 서버 전용 비밀입니다. `NEXT_PUBLIC_` 접두사를 붙이지 마세요.
- Decoding 키를 권장하지만 Encoding 키도 어댑터가 한 번 디코딩한 뒤 안전하게 URL 인코딩합니다.
- `KONEPS_API_TIMEOUT_MS`는 선택값이며 범위별 상류 요청 제한시간을 밀리초로 설정합니다. 기본 8,000ms, 적용 범위는 500~30,000ms입니다.
- 키가 없거나 일부 상류 조회가 실패하고 폴백이 허용되면 해당 범위만 합성 데이터로 대체됩니다. UI와 API의 `source`, `isSynthetic`, `warnings`에서 확인할 수 있습니다.

공식 활용신청 대상은 [입찰공고정보서비스](https://www.data.go.kr/data/15129394/openapi.do), [낙찰정보서비스](https://www.data.go.kr/data/15129397/openapi.do), [계약정보서비스](https://www.data.go.kr/data/15129427/openapi.do)입니다. 연결 방식과 운영상 주의사항은 [데이터 연동 문서](docs/DATA_INTEGRATION.md)에 정리되어 있습니다.

## 실제 데이터로 재현하는 순서

1. `/data`에서 CSV 템플릿을 내려받아 기업 재무정보를 원 단위로 입력합니다.
2. CSV를 업로드하고 행별 오류·경고 및 결합할 기업을 선택합니다.
3. 나라장터에서 공고·낙찰·계약, 공사·용역·물품 범위와 기간을 지정해 조회합니다.
4. 금액이 있는 조달 레코드를 워크스페이스에 추가합니다.
5. `/contracts/[id]`의 **기준 가정 편집**에서 원가·현금·차입·수행기간·지급조건을 원자료와 대조해 보정합니다.
6. 저장 즉시 다시 계산된 기준 결과와 `/scenario`의 스트레스 결과를 검토합니다.

CSV만 업로드해서는 계약이 생성되지 않습니다. **검증된 기업 1건과 조달 레코드 1건을 결합**해야 분석 워크스페이스에 추가됩니다. 조달 공개 데이터에 없는 원가·지급조건은 보수적 초기 가정으로 채워지며 계약 설명에 “사용자 가정”임을 남깁니다.

워크스페이스는 서버 데이터베이스가 아니라 현재 브라우저의 `localStorage`에 최대 5,000건까지 저장됩니다. `/data`에서 JSON으로 내보내거나 합성 데모로 초기화할 수 있습니다.

## 내부 API

### 조달 검색

```http
GET /api/procurement/search?resource=all&kind=all&keyword=데이터&from=2026-07-01&to=2026-07-13&page=1&pageSize=20&fallback=true
```

```bash
# 데모 폴백 없이 실시간 연결만 확인
curl --fail "http://localhost:3000/api/procurement/search?resource=notice&kind=service&from=2026-07-01&to=2026-07-13&fallback=false"
```

`fallback=false`일 때 키가 없으면 503, 잘못된 검색값은 400, 상류 장애는 정규화된 4xx/5xx 오류로 반환됩니다. `resource=all&kind=all`은 단일 통합 조회가 아니라 최대 9개 상류 오퍼레이션을 병렬 호출합니다.

### 기업 CSV

```bash
# UTF-8 BOM 예시 템플릿
curl --fail --output company-template.csv http://localhost:3000/api/import

# 스키마 조회
curl --fail http://localhost:3000/api/import?format=json

# 원문 CSV 검증
curl --fail -X POST -H "Content-Type: text/csv" \
  --data-binary @company.csv http://localhost:3000/api/import
```

필수 열은 다음 7개이며 영문명 또는 지원되는 한국어 별칭을 사용할 수 있습니다.

```text
company_name,annual_revenue,operating_profit,cash_and_equivalents,current_assets,current_liabilities,total_debt
```

선택 열은 `company_id`, `business_registration_no`, `industry_code`, `credit_grade`, `existing_order_backlog`, `average_collection_days`, `average_payment_days`, `employee_count`, `as_of_date`입니다. 최대 5MB·5,000행이며 UTF-8과 CP949/EUC-KR 입력을 지원합니다. 자세한 검증 규칙과 결합 우선순위는 [데이터 연동 문서](docs/DATA_INTEGRATION.md)를 참고하세요.

## 분석 모델

분석기는 계약별 입력을 월 단위 12개 구간으로 전개합니다.

- 조정 매출 = 계약금액 × 물량 변화
- 조정 원가 = 고정원가 + 물량에 연동된 변동원가, 이후 원가충격 반영
- 생존마진 = 조정 매출 − 조정 원가 − 추정 금융비용
- 자금부족액 = 월별 최저 현금잔액과 유동성 버퍼를 충족하는 데 필요한 금액
- 위험점수 = 마진, 유동성, 지급지연, 부채부담, 투찰할인, 실행기간의 설명 가능한 점수 합계

월별·마일스톤·준공 지급, 선금, 유보금, 보증금 이동, 회사 운영비, 예정 원금상환과 별도 차입이자를 반영합니다. 동일 기업의 여러 계약을 포트폴리오로 묶을 때 기초 현금·운영비·기존 채무상환을 계약마다 중복 합산하지 않습니다. 세부 구조와 제한은 앱의 `/methodology` 및 [아키텍처 문서](docs/ARCHITECTURE.md)에서 확인할 수 있습니다.

### AI/LLM을 계산에 사용하지 않는 이유

금액·한도·위험점수는 동일 입력에 동일 결과가 나와야 하고 산식을 감사할 수 있어야 합니다. 따라서 핵심 계산은 결정론 모델로 고정했습니다. LLM을 추가한다면 검증된 수치의 자연어 요약과 근거 문서 탐색에만 제한하고, 숫자 생성이나 승인 판단 권한은 주지 않는 구조가 적합합니다.

## 공모전 평가 기준 대응

| 평가 항목 | BID SHIELD의 증거 |
| --- | --- |
| 문제 정의 | 수주 후 흑자도산과 계약별 유동성 공백이라는 기업·금융기관의 실무 문제 |
| 창의성 | 신용조회가 아니라 계약 단위 생존마진과 조건부 금융구조를 함께 산출 |
| 구현 구체성 | CSV·나라장터 입력 → 정규화·결합 → 12개월 모델 → 위험·금융조건 출력 |
| 데이터 타당성 | 공개 조달 API, 행 단위 재무 검증, 출처·합성 여부·가정의 명시적 구분 |
| 기술 안정성 | 입력 경계값, 비밀 마스킹, 부분 장애 폴백, 결정론 테스트, CI |
| 활용 가능성 | 기업 수주심사, 은행 운전자금 심사, 보증기관 사전 점검, 공공기관 공급자 리스크 관리 |

## 검증

한 번에 전체 품질 게이트를 재현합니다.

```bash
pnpm check
```

이는 아래 명령을 순서대로 실행합니다.

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

자동화 테스트는 분석 산식·스트레스 방향성·포트폴리오 중복 방지·숫자 경계값, CSV 별칭·부분 오류·템플릿 왕복, 나라장터 URL 인코딩·응답 정규화·비밀 마스킹·데모 전환을 검증합니다. 나라장터 테스트는 외부 네트워크를 호출하지 않고 `fetch`를 대체하므로, 실제 인증키·할당량·상류 가용성은 위의 `fallback=false` 스모크 테스트로 별도 확인해야 합니다.

개발 서버 상태는 다음 경로에서 확인할 수 있습니다.

```bash
curl --fail http://localhost:3000/api/health
```

GitHub Actions도 Node 24와 pnpm 11.7.0에서 설치, lint, 타입 검사, 테스트, 프로덕션 빌드를 동일하게 수행합니다.

## 저장소 구조

```text
src/
  app/                    Next.js App Router 화면·Route Handler
  components/
    features/             대시보드·계약·시나리오·데이터 허브
    layout/               반응형 앱 셸과 내비게이션
    ui/                   접근성 중심 UI·SVG 차트
  data/                   합성 데모 계약
  lib/
    analytics/            결정론 계약·포트폴리오·금융 계산
    data/                 나라장터·CSV·레코드 결합 어댑터
tests/                    Node 내장 테스트
docs/                     설계·데이터 연동 문서
```

## 보안·운영 경계

- 인증키는 서버 Route Handler에서만 읽고 브라우저 응답·정규화 오류에 포함하지 않습니다.
- 업로드 CSV는 요청 처리 중 메모리에서 검증하며 서버 파일이나 DB에 저장하지 않습니다. 다만 워크스페이스 결과는 브라우저 `localStorage`에 남으므로 공용 PC나 민감정보 환경에서는 사용 후 사이트 데이터를 삭제해야 합니다.
- 현재 인증·권한관리·공유 워크스페이스·서버 감사로그·백업·암호화 저장소·요청별 속도 제한은 구현되어 있지 않습니다. 조직 배포 전 반드시 보강해야 합니다.
- 공개 API는 공사·용역·물품만 연결하며 외자, 변경·삭제 이력, 분할·장기계속·공동수급 관계를 완전하게 재구성하지 않습니다.
- 조달 금액은 실제 현금 입금액이나 입금일이 아닙니다. 부가세, 물가변동, 검수·기성, 채권양도 제한, 계약 변경을 원문과 대조해야 합니다.
- 모델은 12개월 계획용 추정치이며 대출 승인, 투자 권유, 보증 약정 또는 부도 예측을 제공하지 않습니다. 실제 실행에는 최신 재무제표, 원가명세, 계약서와 기관별 심사가 필요합니다.

## 기술 스택

- Next.js 16 App Router, React 19.2, TypeScript
- Tailwind CSS 4, Geist
- 의존성 없는 TypeScript 분석·CSV 모듈과 SVG 차트
- Node 내장 테스트, ESLint, GitHub Actions

## 라이선스

[MIT](LICENSE)
