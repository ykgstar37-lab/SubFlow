/**
 * 부가세를 얹어 실제 결제액을 만든다.
 *
 * 카탈로그 가격은 두 종류가 섞여 있다. 국내 소비자가는 총액표시제라 부가세
 * 포함가지만, 해외 웹 결제는 별도라 청구서에 10%가 더 붙는다
 * (Claude Pro $20 + tax $2 = $22).
 *
 * 서버도 같은 계산을 한다(app/utils/vat.py). 여기 있는 건 담기 전에 얼마가
 * 빠지는지 미리 보여주기 위한 것이라, 반올림 규칙을 서버와 맞춰 둔다.
 */

/** 한국 부가가치세율. 해외 사업자도 국내 소비자에게 파는 전자적 용역이면 같다. */
export const VAT_RATE = 0.1;

export function withVat(price: number, currency: string, vatIncluded?: boolean): number {
  // 값이 안 내려오는 옛 응답은 포함가로 본다 — 없던 금액을 만들어 내지 않는다.
  if (vatIncluded !== false) return price;
  const raw = price * (1 + VAT_RATE);
  // 원화는 소수점이 없고, 외화는 청구서와 같게 둘째 자리까지.
  return currency === "KRW" ? Math.round(raw) : Math.round(raw * 100) / 100;
}

/** withVat의 반대. 부가세를 더했던 금액을 원래대로 되돌린다. */
export function withoutVat(amount: number, currency: string): number {
  const raw = amount / (1 + VAT_RATE);
  return currency === "KRW" ? Math.round(raw) : Math.round(raw * 100) / 100;
}

/** 금액 한 건을 통화에 맞춰 적는다. "$22" / "26,400원" */
export function formatAmount(amount: number, currency: string, wonLabel: string): string {
  const text = new Intl.NumberFormat("ko-KR").format(amount);
  if (currency === "KRW") return `${text}${wonLabel}`;
  if (currency === "USD") return `$${text}`;
  return `${text} ${currency}`;
}
