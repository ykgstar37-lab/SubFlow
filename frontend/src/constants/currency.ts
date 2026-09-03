/**
 * 요금제를 직접 입력할 때 고를 수 있는 통화.
 *
 * 해외 결제로 더 싸게 쓰는 사용자가 실제 낸 금액을 그대로 적을 수 있게 열어 둔다.
 * Frankfurter(ECB)가 고시하는 통화만 넣는다 — 환율이 없으면 원화 환산이 안 되고
 * 총액·비중 집계에서 조용히 빠지기 때문이다.
 *
 * 모바일 쪽 목록(mobile/src/constants/currency.ts)과 같이 유지한다.
 */
export const PLAN_CURRENCIES = [
  "KRW",
  "USD",
  "EUR",
  "JPY",
  "GBP",
  "INR",
  "TRY",
  "BRL",
  "IDR",
  "PHP",
  "MXN",
] as const;
