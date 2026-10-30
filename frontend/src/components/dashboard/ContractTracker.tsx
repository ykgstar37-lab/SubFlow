import { FileText } from "lucide-react";
import type { Subscription } from "../../types/subscription";
import { tr, fmtMoney, fmtCount } from "../../i18n/translations";
import { contractProgress, contractRemaining } from "../../utils/contract";

interface Props {
  subscriptions: Subscription[];
}

/** 렌탈 등 약정이 걸린 구독의 진행률. 끝나는 날이 가까운 순으로 보여준다. */
export default function ContractTracker({ subscriptions }: Props) {
  const rows = subscriptions
    .filter((s) => s.contract_end_date)
    .sort((a, b) => (a.contract_end_date ?? "").localeCompare(b.contract_end_date ?? ""))
    .map((sub) => {
      const p = contractProgress(sub.start_date, sub.contract_end_date);
      const c = contractRemaining(sub.contract_end_date, sub.next_billing_date, sub.billing_cycle, sub.cost);
      return p && c ? { sub, p, c } : null;
    })
    .filter((r) => r !== null);

  if (rows.length === 0) return null;

  return (
    <div className="glass p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100/80 text-blue-600">
          <FileText className="h-4 w-4" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">{tr("렌탈 약정")}</h3>
        <span className="ml-auto rounded-xl bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {fmtCount(rows.length, "건")}
        </span>
      </div>

      <div className="space-y-3">
        {rows.map(({ sub, p, c }) => {
          // 끝남 → 회색, 30일 안 → 주황, 그 외 → 파랑. 구독 카드 배지와 같은 기준
          const ended = c.days < 0;
          const soon = !ended && c.days <= 30;
          const box = ended ? "bg-slate-50" : soon ? "bg-amber-50" : "bg-blue-50/70";
          const label = ended ? "text-slate-500" : soon ? "text-amber-800" : "text-blue-700";
          const fill = ended ? "bg-slate-300" : soon ? "bg-amber-400" : "bg-blue-500";
          return (
            <div key={sub.id} className={`rounded-2xl px-4 py-3 shadow-sm ${box}`}>
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {sub.rental_item_icon ? `${sub.rental_item_icon} ` : ""}
                    {sub.service_name}
                  </p>
                  <p className={`text-xs font-bold ${label}`}>
                    {ended
                      ? tr("약정 끝남")
                      : soon
                        ? tr("약정 D-{n}", { n: c.days })
                        : tr("약정 {a} / {b}개월", { a: p.elapsedMonths, b: p.totalMonths })}
                  </p>
                </div>
                <span className="text-xl font-extrabold text-slate-900 tabular-nums">
                  {Math.floor(p.ratio * 100)}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/90">
                <div className={`h-full rounded-full ${fill}`} style={{ width: `${p.ratio * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {ended
                  ? tr("{date} 종료 · 이제 위약금 없이 해지할 수 있어요", { date: sub.contract_end_date ?? "" })
                  : tr("{date} 종료 · 남은 결제 {n}회 {a}", {
                      date: sub.contract_end_date ?? "",
                      n: c.payments,
                      a: fmtMoney(c.total, sub.currency),
                    })}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
