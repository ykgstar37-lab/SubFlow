import type { BillingCycle } from "../types/subscription";

/**
 * 날짜에 개월 수를 더한다. 말일은 다음 달 길이에 맞춰 당긴다.
 *   1월 31일 + 1개월 = 2월 28일 (윤년이면 29일)
 *
 * 백엔드 renewal_service._add_months와 같은 규칙이다. 여기서 어긋나면
 * 화면에 적힌 다음 결제일과 서버가 실제로 갱신하는 날짜가 달라진다.
 */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + months;
  const year = y + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12; // 0-based
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return [
    year,
    String(month + 1).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

/**
 * 시작일에서 결제 주기만큼 뒤인 날짜 = 다음 결제일.
 *
 * 시작일과 같은 날을 기본값으로 두면 "오늘 가입했는데 오늘이 다음 결제일"이
 * 되어, 그대로 저장하면 결제 임박 알림이 곧바로 뜨고 갱신 스케줄러가
 * 한 주기를 건너뛴 것으로 처리한다.
 */
export function nextBillingDate(startIso: string, cycle: BillingCycle): string {
  // 몇 년 전에 시작한 렌탈이면 '시작일 + 1주기'는 이미 지난 날이다. 오늘 이후의
  // 첫 결제일까지 민다. 모바일 catalog.tsx의 nextBillingDate와 같은 규칙.
  const today = todayIso();
  let d = advanceOnce(startIso, cycle);
  for (let i = 0; d < today && i < 1000; i++) d = advanceOnce(d, cycle);
  return d;
}

function advanceOnce(startIso: string, cycle: BillingCycle): string {
  switch (cycle) {
    case "weekly": {
      const d = new Date(`${startIso}T00:00:00`);
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    }
    case "quarterly":
      return addMonths(startIso, 3);
    case "yearly":
      return addMonths(startIso, 12);
    case "monthly":
    default:
      return addMonths(startIso, 1);
  }
}

/** 오늘 날짜를 YYYY-MM-DD로. toISOString은 UTC라 한국에서 하루 밀릴 수 있다. */
export function todayIso(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}
