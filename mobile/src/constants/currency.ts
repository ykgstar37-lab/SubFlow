/**
 * 통화 표기 한 곳.
 *
 * 예전에는 화면마다 CURRENCY_SYMBOLS와 formatPrice를 각자 복사해 두었다.
 * 그러다 캘린더 한 곳만 ₩를 문자 그대로 박아 두는 바람에 $22짜리 구독이
 * ₩22로 보였다. 표기 규칙은 여기서만 고친다.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  KRW: '₩',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  GBP: '£',
  // 해외 결제로 더 싸게 쓰는 사용자가 실제 낸 금액을 그대로 적을 수 있게 열어 둔다.
  // Frankfurter(ECB)가 고시하는 통화만 넣는다 — 환율이 없으면 원화 합계에서 빠진다.
  INR: '₹',
  TRY: '₺',
  BRL: 'R$',
  IDR: 'Rp',
  PHP: '₱',
  MXN: 'MX$',
};

/** 요금제를 직접 입력할 때 고를 수 있는 통화. */
export const PLAN_CURRENCIES = Object.keys(CURRENCY_SYMBOLS);

/** 처음부터 펼쳐 두는 통화. 나머지는 '더보기'를 눌러야 나온다 —
 *  11개를 다 늘어놓으면 칩이 세 줄이 되어 정작 원화를 찾기 어렵다. */
export const MAIN_CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY'];

/** 지금 보여줄 통화 칩. 접혀 있어도 이미 고른 통화는 빼지 않는다. */
export function visibleCurrencies(expanded: boolean, selected: string): string[] {
  if (expanded) return PLAN_CURRENCIES;
  return MAIN_CURRENCIES.includes(selected) ? MAIN_CURRENCIES : [...MAIN_CURRENCIES, selected];
}

/** 소수점을 쓰지 않는 통화 (보조단위를 실생활에서 안 쓰는 쪽). */
const WHOLE_UNIT = new Set(['KRW', 'JPY', 'IDR']);

/** 금액을 통화에 맞춰 적는다. 원화·엔화·루피아는 정수, 나머지는 둘째 자리까지. */
export function formatPrice(amount: number, currency: string = 'KRW'): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  if (WHOLE_UNIT.has(currency)) return `${symbol}${Math.round(amount).toLocaleString()}`;
  return `${symbol}${amount.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * 카탈로그용. formatPrice와 달리 뒤에 붙는 0을 남기지 않는다
 * ($20.00이 아니라 $20 — 요금제 목록은 가격대를 훑는 화면이라 짧은 쪽이 읽힌다).
 */
export function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '';
  const n = WHOLE_UNIT.has(currency)
    ? Math.round(amount).toLocaleString()
    : Number(amount.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${symbol}${n}`;
}

/** 외화 금액의 원화 환산 병기 문자열. 원화이거나 환율이 없으면 빈 문자열. */
export function krwHint(amount: number, currency: string, rate?: number): string {
  if (currency === 'KRW' || !rate || !amount) return '';
  return `≈ ₩${Math.round(amount * rate).toLocaleString()}`;
}
