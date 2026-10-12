import { addMonths } from "./billingDate";

const CYCLE_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/**
 * 약정이 끝날 때까지 남은 일수·결제 횟수·금액.
 *
 * 다음 결제일부터 주기만큼 밀어 가며 종료일 전까지 센다. '남은 개월 × 요금'은
 * 결제일이 종료일과 어긋날 때 한 번씩 틀린다. 모바일 subscriptions.tsx의
 * contractRemaining과 같은 규칙이다. 주간 결제는 렌탈에 없어 세지 않는다.
 */
export function contractRemaining(
  contractEnd: string | null | undefined,
  nextBillingDate: string,
  cycle: string,
  cost: number
): { days: number; payments: number; total: number } | null {
  if (!contractEnd) return null;
  const today = new Date().toISOString().split("T")[0];
  const days = Math.round((new Date(contractEnd).getTime() - new Date(today).getTime()) / 86400000);
  const step = CYCLE_MONTHS[cycle.toLowerCase()];
  let payments = 0;
  if (step && nextBillingDate) {
    for (let d = nextBillingDate; d < contractEnd && payments < 1000; d = addMonths(d, step)) payments++;
  }
  return { days, payments, total: payments * cost };
}

/** 렌탈 의무사용기간으로 흔한 값(년) */
export const CONTRACT_YEARS = [3, 4, 5, 6];
