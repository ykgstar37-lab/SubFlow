/**
 * 외화 금액을 원화로 환산해 보여주기 위한 유틸.
 *
 * 환율은 백엔드가 준다(`/analytics/exchange-rates`). ECB 고시 환율이라
 * 영업일 1회만 갱신되므로, 화면에는 기준일(as_of)을 함께 밝히는 게 좋다.
 */

/** 1 <통화> = ? KRW */
export type RateTable = Record<string, number>;

export function toKrw(
  amount: number,
  currency: string,
  rates: RateTable
): number | null {
  if (!currency || currency === "KRW") return null;
  const rate = rates[currency.toUpperCase()];
  if (!rate) return null;
  return Math.round(amount * rate);
}

/** '≈₩28,225' 형태의 병기 문자열. 원화이거나 환율이 없으면 null. */
export function krwHint(
  amount: number,
  currency: string,
  rate?: number | null
): string | null {
  if (!currency || currency === "KRW" || !rate || !amount) return null;
  return `≈₩${new Intl.NumberFormat("ko-KR").format(Math.round(amount * rate))}`;
}
