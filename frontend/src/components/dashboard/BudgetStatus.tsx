import { Link } from "react-router-dom";
import { ArrowRight, WalletCards } from "lucide-react";
import type { BudgetStatus as BudgetStatusType } from "../../types/analytics";
import { tr, fmtMoney } from "../../i18n/translations";

interface Props {
  budgetStatus: BudgetStatusType;
}


function getProgressTone(percentage: number) {
  if (percentage > 90) {
    return {
      bar: "bg-rose-400",
      track: "bg-rose-100/70",
      text: "text-rose-600",
      chip: "bg-rose-100 text-rose-700",
    };
  }
  if (percentage > 70) {
    return {
      bar: "bg-amber-400",
      track: "bg-amber-100/70",
      text: "text-amber-600",
      chip: "bg-amber-100 text-amber-700",
    };
  }
  return {
    bar: "bg-emerald-400",
    track: "bg-emerald-100/70",
    text: "text-emerald-600",
    chip: "bg-emerald-100 text-emerald-700",
  };
}

export default function BudgetStatus({ budgetStatus }: Props) {
  const {
    budget_monthly,
    current_spending,
    remaining,
    percentage_used,
    is_over_budget,
    monthly_average,
    irregular_charges,
  } = budgetStatus;

  if (budget_monthly === null) {
    return (
      <div className="glass p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{tr("월 예산")}</h3>
              <p className="text-sm text-slate-500">{tr("예산을 설정하면 지출 속도를 더 쉽게 볼 수 있어요.")}</p>
            </div>
          </div>
          <Link to="/settings" className="btn-primary-glass inline-flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm">
            {tr("설정하기")}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const pct = percentage_used ?? 0;
  const barWidth = Math.min(pct, 100);
  const tone = getProgressTone(pct);
  const statusText = is_over_budget
    ? tr("예산을 {amount} 초과했어요.", { amount: fmtMoney(Math.abs(remaining ?? 0)) })
    : tr("이번 달 남은 예산은 {amount}입니다.", { amount: fmtMoney(remaining ?? 0) });

  // 연회비가 걸린 달은 금액이 평소보다 크게 뛴다. 이유를 적어 주지 않으면
  // 사용자가 앱이 잘못 셌다고 생각한다.
  const first = irregular_charges?.[0];
  const irregularText = !first
    ? null
    : irregular_charges.length === 1
      ? tr("이번 달은 {name} {amount}이 함께 결제돼요.", {
          name: first.service_name,
          amount: fmtMoney(first.amount),
        })
      : tr("이번 달은 {name} 외 {n}건이 함께 결제돼요.", {
          name: first.service_name,
          n: String(irregular_charges.length - 1),
        });

  return (
    <Link to="/settings" className="glass block p-6">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">{tr("월 예산")}</h3>
              <p className="text-sm text-slate-500">{tr("현재 {a} / 기준 {b}", { a: fmtMoney(current_spending), b: fmtMoney(budget_monthly) })}</p>
              <p className="text-xs text-slate-400">{tr("월 평균 {a}", { a: fmtMoney(monthly_average ?? 0) })}</p>
            </div>
          </div>

          <div className={`h-3 w-full rounded-full ${tone.track}`}>
            <div className={`h-3 rounded-full transition-all duration-500 ${tone.bar}`} style={{ width: `${barWidth}%` }} />
          </div>

          <p className={`mt-3 text-sm font-semibold ${tone.text}`}>{statusText}</p>
          {irregularText && (
            <p className="mt-1 text-xs text-slate-500">{irregularText}</p>
          )}
        </div>

        <div className="rounded-3xl bg-white/65 px-6 py-5 text-right shadow-sm">
          <p className="text-xs font-medium text-slate-400">{tr("예산 소진율")}</p>
          <p className="mt-1 text-3xl font-extrabold text-slate-900">{pct.toFixed(0)}%</p>
          <span className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone.chip}`}>
            {is_over_budget ? tr("조정 필요") : tr("관리 중")}
          </span>
        </div>
      </div>
    </Link>
  );
}
