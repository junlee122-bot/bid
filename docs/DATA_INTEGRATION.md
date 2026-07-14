# BID SHIELD 데이터 연동

이 문서는 실제 구현을 기준으로 나라장터 공개 API, 기업 재무 CSV, 두 출처를 분석 계약으로 결합하는 규칙을 설명합니다. 공식 정보는 **2026-07-13**에 다시 확인했습니다.

## 1. 데이터 흐름과 출처 표기

```text
공공데이터포털 인증키 ──> 서버 Route Handler ──> 나라장터 3종 API ──┐
                                                                    ├─> 정규화된 조달 레코드
기업 재무 CSV ───────────> 서버 검증 ─────────────> 기업 재무 레코드 ─┘
                                      + 명시적 계약 가정
                                                 │
                                                 └─> ContractRecord ─> 12개월 분석
```

- 나라장터 레코드는 `source: "koneps-live"`, `isSynthetic: false`로 표시됩니다.
- 합성 폴백은 `source: "demo"`, `isSynthetic: true`로 표시됩니다.
- 검색 전체 응답의 `source`는 성공 범위에 따라 `live`, `mixed`, `demo` 중 하나입니다.
- CSV 업로드만으로 계약이 만들어지지 않습니다. 기업 레코드와 금액이 있는 조달 레코드를 선택해 결합해야 합니다.
- 결합된 계약은 서버 DB가 아니라 현재 브라우저의 `localStorage`에 저장됩니다.

## 2. 나라장터 API

### 공식 서비스

| BID SHIELD 자원 | 공공데이터포털 서비스 | 코드의 Base URL | 확인된 수정일 |
| --- | --- | --- | --- |
| `notice` | [나라장터 입찰공고정보서비스](https://www.data.go.kr/data/15129394/openapi.do) | `https://apis.data.go.kr/1230000/ad/BidPublicInfoService` | 2026-06-29 |
| `award` | [나라장터 낙찰정보서비스](https://www.data.go.kr/data/15129397/openapi.do) | `https://apis.data.go.kr/1230000/as/ScsbidInfoService` | 2026-06-30 |
| `contract` | [나라장터 계약정보서비스](https://www.data.go.kr/data/15129427/openapi.do) | `https://apis.data.go.kr/1230000/ao/CntrctInfoService` | 2026-05-15 |

공식 페이지는 세 서비스를 REST, JSON+XML, 실시간 갱신으로 안내합니다. “실시간”은 제공기관의 갱신 분류이며 모든 필드의 동시 확정이나 무중단 응답을 보장한다는 뜻은 아닙니다. 활용신청·계정 단계·할당량은 계정과 시점에 따라 달라질 수 있으므로 공공데이터포털의 현재 값을 확인하세요.

BID SHIELD가 호출하는 나라장터 검색조건 오퍼레이션은 다음과 같습니다.

| 자원 | 공사 `construction` | 용역 `service` | 물품 `goods` |
| --- | --- | --- | --- |
| 공고 | `getBidPblancListInfoCnstwkPPSSrch` | `getBidPblancListInfoServcPPSSrch` | `getBidPblancListInfoThngPPSSrch` |
| 낙찰 | `getScsbidListSttusCnstwkPPSSrch` | `getScsbidListSttusServcPPSSrch` | `getScsbidListSttusThngPPSSrch` |
| 계약 | `getCntrctInfoListCnstwkPPSSrch` | `getCntrctInfoListServcPPSSrch` | `getCntrctInfoListThngPPSSrch` |

외자, 상세정보, 변경·삭제 이력, 개찰순위와 예비가격 전용 오퍼레이션은 현재 연결하지 않습니다.

### 서버 환경변수

```dotenv
# 일반 인증키. Decoding 키 권장, Encoding 키도 허용
KONEPS_SERVICE_KEY=

# 선택: 범위별 상류 요청 제한시간(ms). 기본 8000, 적용 범위 500~30000
KONEPS_API_TIMEOUT_MS=8000
```

- 두 값 모두 서버 전용입니다. `NEXT_PUBLIC_` 접두사를 붙이지 마세요.
- 인증키가 `%`를 포함하면 어댑터가 한 번 `decodeURIComponent`를 시도한 뒤 `URLSearchParams`로 다시 인코딩합니다.
- 제한시간이 비어 있거나 유효한 양수가 아니면 8,000ms를 사용하고, 유효한 값은 500~30,000ms로 제한합니다.
- 실제 키를 `.env.example`, 로그, 이슈, 스크린샷이나 커밋에 넣지 마세요.
- 정규화된 오류는 원본 URL과 인증키를 노출하지 않습니다.

### 내부 검색 API

```http
GET /api/procurement/search?resource=notice&kind=all&keyword=데이터&from=2026-07-01&to=2026-07-13&page=1&pageSize=20&fallback=true
```

| 매개변수 | 허용값 | 기본값·검증 |
| --- | --- | --- |
| `resource` | `notice`, `award`, `contract`, `all`; 쉼표 목록 가능 | `notice` |
| `kind` | `construction`, `service`, `goods`, `all`; 쉼표 목록 가능 | `all` |
| `keyword` | 사업명·품명 검색 문자열 | 없음, 최대 100자 |
| `bidNoticeNo` | 공고번호 | 없음, 최대 50자 및 제한 문자 |
| `from`, `to` | `YYYY-MM-DD` | 한국 민간일 기준 최근 30일, 종료일−시작일 31일 이하 |
| `page` | 1 이상 숫자 | `1` |
| `pageSize` | 1~100 | `20` |
| `fallback` | `true/false`, `1/0`, `yes/no` | `true` |

`dataset`은 `resource`, `q`는 `keyword`, `bidNo`는 `bidNoticeNo`, `startDate`/`endDate`는 날짜, `limit`은 `pageSize`의 별칭입니다. 잘못된 열거값·날짜·범위·페이지는 `INVALID_QUERY`와 HTTP 400으로 거절됩니다.
알 수 없는 `fallback` 문자열은 `INVALID_QUERY`와 HTTP 400으로 거절됩니다. 엄격한 실시간 확인에는 `fallback=false`를 명시하세요.

내부 요청은 각 범위에 다음 공통 파라미터를 만듭니다.

```text
serviceKey, pageNo, numOfRows, inqryDiv=1,
inqryBgnDt=YYYYMMDD0000, inqryEndDt=YYYYMMDD2359, type=json
```

공고·낙찰의 키워드는 `bidNtceNm`, 계약 키워드는 `prodNm`으로 전달하고, 응답 정규화 후 제목·기관·수요기관·낙찰자에 대해 한 번 더 부분 일치 필터링합니다.

### 팬아웃·페이지 의미

`resource=all&kind=all`은 통합 검색 한 번이 아니라 **3개 자원 × 3개 업무 = 최대 9개 요청**을 병렬 수행합니다. 따라서:

- `page`와 `pageSize`는 전체 결과가 아니라 각 자원·업무 범위에 적용됩니다.
- 반환 `items`는 최대 `선택 범위 수 × pageSize`가 될 수 있습니다.
- `totalCount`는 성공한 상류 범위의 건수 합계와 폴백 데모 건수의 합입니다. 서로 다른 자원 사이의 동일 조달건을 제거한 고유 계약 수가 아닙니다.
- 개발계정 호출량은 팬아웃 수만큼 소비되므로 넓은 범위를 반복 조회하지 마세요.

### 성공·부분 장애·엄격 모드

- 범위별 제한시간은 기본 8초이며, 현재 자동 재시도는 하지 않습니다.
- JSON 성공 응답과 일부 게이트웨이의 XML 오류 본문을 구분해 정규화합니다.
- HTTP 429·5xx, 일부 상류 결과코드와 네트워크·시간초과 오류에는 `retryable: true` 힌트를 붙이지만, 호출자가 재시도 정책을 결정해야 합니다.
- `fallback=true`이면 실패한 범위만 합성 레코드로 채우고 경고를 반환합니다. 일부 성공이면 `source: "mixed"`, 모두 실패하면 `source: "demo"`입니다.
- `fallback=false`이면 하나라도 실패할 때 첫 정규화 오류를 반환합니다. 키가 없으면 `MISSING_SERVICE_KEY`와 HTTP 503입니다.
- 응답 헤더는 `Cache-Control: no-store`이므로 이 Route Handler 자체는 검색 결과를 캐시하지 않습니다.

실시간 연결만 검증하는 예시는 다음과 같습니다.

```bash
curl --fail "http://localhost:3000/api/procurement/search?resource=notice&kind=service&from=2026-07-01&to=2026-07-13&fallback=false"
```

응답의 `ok`, `data.source`, `data.warnings`, 각 항목의 `source`와 `isSynthetic`을 함께 확인하세요. HTTP 200만으로 실시간 데이터라고 판단하면 안 됩니다.

### 정규화 필드

업무·연도에 따라 다른 상류 필드명을 아래 공통 형태로 축약합니다.

```ts
interface ProcurementRecord {
  id: string;
  resource: "notice" | "award" | "contract";
  kind: "construction" | "service" | "goods";
  source: "koneps-live" | "demo";
  isSynthetic: boolean;
  bidNoticeNo: string | null;
  bidNoticeOrder: string | null;
  title: string;
  organization: string | null;
  demandOrganization: string | null;
  publishedAt: string | null;
  deadlineAt: string | null;
  openedAt: string | null;
  contractedAt: string | null;
  estimatedAmount: number | null;
  baseAmount: number | null;
  awardAmount: number | null;
  awardRate: number | null;
  winnerName: string | null;
  contractNumber: string | null;
  contractMethod: string | null;
  referenceUrl: string | null;
}
```

필드가 없거나 숫자·URL로 안전하게 읽을 수 없으면 추정해 채우지 않고 `null`로 둡니다. 낙찰률이 없고 낙찰금액과 추정금액이 모두 있으면 두 값의 비율을 계산합니다. 날짜·시간은 가능한 경우 `+09:00`이 포함된 ISO 형태로 정규화합니다.

## 3. 기업 재무 CSV

KODATA나 내부 재무 데이터는 계약·라이선스·개인정보 처리 권한을 확인한 후 사용해야 합니다. 원본 데이터나 실제 인증정보는 이 저장소에 포함하지 않습니다.

### 엔드포인트

- `GET /api/import` — UTF-8 BOM 템플릿과 **합성 예시 1행** 다운로드
- `GET /api/import?format=json` — 필드 스키마와 최대 바이트 조회
- `POST /api/import` — CSV 디코딩·구문 분석·행별 검증

POST는 다음 세 형태를 지원합니다.

```bash
# 원문 CSV
curl -X POST -H "Content-Type: text/csv" \
  --data-binary @company.csv http://localhost:3000/api/import

# multipart: 필드명 file 또는 csv
curl -X POST -F "file=@company.csv" http://localhost:3000/api/import

# JSON 문자열
curl -X POST -H "Content-Type: application/json" \
  -d '{"csv":"company_name,..."}' http://localhost:3000/api/import
```

지원 인코딩은 UTF-8과 CP949/EUC-KR 계열이며, 최대 크기는 5MB, 데이터 행은 최대 5,000개, 셀은 최대 10,000자입니다. 큰따옴표 안의 쉼표·줄바꿈과 `""` 이스케이프를 처리합니다.

### 스키마

필수 열:

```text
company_name,annual_revenue,operating_profit,cash_and_equivalents,current_assets,current_liabilities,total_debt
```

선택 열:

```text
company_id,business_registration_no,industry_code,credit_grade,
existing_order_backlog,average_collection_days,average_payment_days,
employee_count,as_of_date
```

템플릿에 있는 합성 예시행은 실제 데이터를 넣을 때 삭제하거나 교체하세요.

- 영문 필드명 외에 `기업명`, `매출액`, `영업이익`, `현금및현금성자산`, `유동자산`, `유동부채`, `부채총계` 등 정의된 한국어 별칭을 인식합니다.
- 금액 단위는 원(KRW)입니다. 쉼표, `%`, `₩`, `원`, 공백은 숫자 파싱 전에 제거하지만 `억`, `만` 같은 축약 단위는 해석하지 않습니다.
- `operating_profit`만 음수를 허용하고 다른 필수 금액은 0 이상이어야 합니다.
- `employee_count`는 정수, 평균 회수·지급일은 0~730, `as_of_date`는 유효한 `YYYY-MM-DD`, `YYYYMMDD`, 점·슬래시 구분 형식을 허용합니다.
- 사업자등록번호는 숫자 10자리가 아니면 오류, 체크섬 불일치는 경고입니다.
- 동일 사업자등록번호·기준일 또는 동일 기업 ID·기준일의 중복 행은 뒤 행을 거절합니다.
- 현금이 유동자산보다 큼, 유동부채가 유동자산보다 큼, 총부채가 연매출의 3배 초과, 비정형 신용등급 등은 원값을 바꾸지 않고 경고합니다.

헤더 오류가 있으면 레코드를 만들지 않습니다. 데이터 행 오류는 해당 행만 `rejectedRows`로 제외하고 나머지 정상 행은 `records`에 유지합니다. 따라서 `valid: false`여도 `records`가 비어 있지 않을 수 있으며, 호출자는 `summary`와 `issues`를 함께 확인해야 합니다.

### 서버 보관 여부

Route Handler는 파일을 요청 처리 메모리에서 읽어 검증 응답을 만들 뿐 디스크나 DB에 저장하지 않습니다. 브라우저는 선택한 기업 레코드를 조달 레코드와 결합할 때 사용합니다. 운영 환경에서는 전송구간 TLS, 접근제어, 보존기간, 삭제정책과 위탁처리 여부를 조직 정책에 맞게 별도 설계해야 합니다.

## 4. 분석 계약으로 결합

`createContractRecordFromSources(procurement, company, assumptions)`는 정규화된 두 출처와 `ContractCreationAssumptions`를 `ContractRecord`로 결합합니다. 공개 조달·재무정보만으로 알 수 없는 값은 조용히 추정하지 않고 호출자가 명시해야 합니다.

필수 가정은 다음 범주입니다.

- 회사 규모·업종 표시명·지역
- 계약 원가율, 수행기간, 초기투입·고정원가 비율
- 월 운영현금유출, 월 기존채무상환액, 차입금리
- 대금 회수지연, 선금·유보금·보증예치 비율, 지급방식
- 기업 데이터 품질(`verified` 또는 `estimated`)

결합 우선순위:

| 분석 필드 | 우선순위 |
| --- | --- |
| 계약금액 | 명시적 가정 → 낙찰금액 → 추정금액; 모두 없으면 생성 거절 |
| 기초금액 | 조달 기초금액 → 추정금액 → 계약금액 |
| 계약일 | 명시적 가정 → 계약체결일 → 개찰일 → 공고일; 모두 없으면 생성 거절 |
| 기존 차입금 | 명시적 가정 → CSV `total_debt` |
| 회사 규모 | CSV 종업원 수로 추론 → 명시적 기본 규모 |
| 발주처 | 수요기관 → 공고·계약기관 → `기관명 미제공` |

종업원 수 기준 추론은 10명 미만 `micro`, 50명 미만 `small`, 300명 미만 `medium`, 그 이상 `large`입니다. 이는 법령상 중소기업 분류가 아니라 모델 표시용 단순 구간입니다.

### 데이터 허브의 보수적 초기 가정

현재 UI는 사용자가 조달건을 추가할 때 다음 초기값을 코드로 생성합니다. 이 값은 실제 계약조건이 아닙니다.

| 항목 | 초기 규칙 |
| --- | --- |
| 원가율 | 공사 92%, 용역 88%, 물품 90%; 기업 영업이익률이 계약별 원가율과 같지 않으므로 업무별 보수 초기값을 사용 |
| 수행기간 | 공사 14개월, 용역 12개월, 물품 8개월 |
| 대금지연 | CSV 평균 회수일, 없으면 60일; 15~180일로 제한 |
| 월 운영현금유출 | 연매출 × 4.5% ÷ 12, 최소 100만원 |
| 월 기존채무상환 | 총부채 × 18% ÷ 12 |
| 금리 | AAA/AA 5.2%, A 5.8%, BBB 6.6%, BB 7.6%, 그 외·무등급 9.2% |
| 선금 | 10% |
| 유보금 | 공사 5%, 그 외 3% |
| 보증예치 | 공사 10%, 그 외 5% |
| 초기투입비율 | 공사 45%, 물품 40%, 용역 25% |
| 고정원가비율 | 용역 60%, 공사 35%, 물품 25% |
| 지급방식 | 공사 `milestone`, 그 외 `monthly` |

생성 성공 메시지와 계약 설명에 핵심 초기 가정을 표시합니다. 추가한 뒤 계약 상세의 **기준 가정 편집**에서 원가·현금·차입·수행기간·지급·보증 조건을 원가명세, 계약서와 상환계획에 맞게 수정할 수 있습니다. 사용자 수정값은 `estimated`로 표시되며 합성 원천은 수정 후에도 `synthetic` 표시를 유지합니다.

## 5. 해석상 한계

- 공고번호와 차수는 중요한 연결키지만 분할계약, 장기계속계약, 공동수급, 수의계약은 1:1로 연결되지 않을 수 있습니다.
- 공고·낙찰·계약 검색은 서로 독립된 결과입니다. 앱은 세 자원을 사건 이력으로 자동 조인하거나 중복 제거하지 않습니다.
- 업무구분·오퍼레이션·연도에 따라 필드가 비거나 이름이 달라질 수 있습니다. 정규화기는 보수적으로 `null`을 유지합니다.
- 금액의 부가가치세 포함 여부, 추정가격·예정가격·기초금액·계약금액의 의미는 해당 오퍼레이션 명세와 원문 공고를 확인해야 합니다.
- 나라장터의 수정·삭제 이력, 계약 변경, 실제 검수·기성·입금 이력은 현재 모델에 자동 반영되지 않습니다.
- 합성 레코드는 실제 기업·기관·조달건과 무관하며 공모전 시연용입니다.
- 기업 재무 CSV는 시점이 다른 조달 데이터와 결합될 수 있습니다. `as_of_date`와 계약일의 시차를 사용자가 확인해야 합니다.

## 6. 재현 가능한 점검

### 자동 테스트

```bash
pnpm test
```

외부 통신 없이 다음을 검증합니다.

- 한국 날짜 기준 기본 조회기간과 나라장터 URL·인증키 인코딩
- JSON 응답 정규화, 키 미설정 폴백, 네트워크 오류의 비밀 마스킹
- 한국어 CSV 별칭, 인용부호·숫자 구분자, 부분 오류, 필수 헤더, 템플릿 왕복
- 조달·기업 데이터와 명시적 가정의 계약 결합

### 수동 스모크 테스트

1. `.env.local`에 실제 키를 넣고 `pnpm dev`를 실행합니다.
2. `/api/health`의 `dataMode`가 `connected`인지 확인합니다.
3. 좁은 기간·단일 범위·`fallback=false`로 조회합니다.
4. 응답 `source`가 `live`이고 모든 항목이 `isSynthetic: false`인지 확인합니다.
5. 같은 요청에서 공고번호나 제목을 나라장터 원문과 대조합니다.
6. CSV 템플릿을 내려받아 예시행을 교체하고 업로드한 뒤 `summary`, `issues`, `records`를 확인합니다.
7. 데이터 허브에서 한 건을 결합하고 표시된 초기 가정을 원자료와 대조합니다.

실시간 스모크는 자동 테스트를 대체하지 않고, 자동 테스트 역시 실제 키 승인·계정 할당량·상류 가용성을 보장하지 않습니다.
