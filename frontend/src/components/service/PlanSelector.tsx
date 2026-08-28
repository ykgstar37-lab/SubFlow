import { Plus, X } from "lucide-react";
import type { ServicePlan } from "../../types/service";
import { tr } from "../../i18n/translations";
import { krwHint, type RateTable } from "../../utils/currency";

interface Props {
  plans: ServicePlan[];
  onSelect: (plan: ServicePlan) => void;
  /** 원화 환산 보기. 외화 요금제 아래에 환산액을 덧붙인다. */
  showKrw?: boolean;
  rates?: RateTable;
  /** 목록에 없는 요금제를 직접 넣는 칸을 맨 뒤에 붙인다 */
  onAdd?: () => void;
  /** 내가 넣은 요금제만 지울 수 있다 */
  onDelete?: (plan: ServicePlan) => void;
}

// 언어 변경이 반영되도록 상수가 아니라 호출 시점에 만든다
const cycleLabels = (): Record<string, string> => ({
  monthly: tr("/월"),
  yearly: tr("/년"),
  weekly: tr("/주"),
  quarterly: tr("/분기"),
});

export default function PlanSelector({
  plans,
  onSelect,
  showKrw,
  rates,
  onAdd,
  onDelete,
}: Props) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan) => {
        const price = new Intl.NumberFormat("ko-KR").format(plan.price);
        const unit = plan.currency === "KRW" ? tr("원") : "$";
        const isUsd = plan.currency === "USD";
        const krw =
          showKrw && rates
            ? krwHint(plan.price, plan.currency, rates[plan.currency?.toUpperCase()])
            : null;

        return (
          // 카드가 버튼이라 지우기 버튼을 안에 넣을 수 없다(버튼 중첩). 형제로 띄운다.
          <div key={plan.id} className="relative">
            <button
              onClick={() => onSelect(plan)}
              className="glass w-full border-2 border-white/60 p-4 text-left transition-all hover:border-blue-500/60 hover:bg-blue-500/10"
            >
              <p className="font-semibold text-slate-900">
                {plan.name}
                {plan.is_custom && (
                  <span className="ml-2 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-600">
                    {tr("직접 입력")}
                  </span>
                )}
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-600">
                {isUsd && "$"}
                {price}
                {!isUsd && unit}
                <span className="text-sm font-normal text-slate-400">
                  {cycleLabels()[plan.billing_cycle]}
                </span>
              </p>
              {krw && <p className="mt-0.5 text-sm text-slate-500">{krw}</p>}
              {plan.description && (
                <p className="mt-1 text-xs text-slate-400">{plan.description}</p>
              )}
            </button>

            {plan.is_custom && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(plan)}
                aria-label={tr("요금제 삭제")}
                title={tr("요금제 삭제")}
                className="absolute right-2 top-2 rounded-full p-1 text-slate-400 transition-colors hover:bg-red-500/10 hover:text-red-500"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        );
      })}

      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          className="flex min-h-[7rem] flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300/80 p-4 text-slate-400 transition-colors hover:border-blue-500/60 hover:text-blue-600"
        >
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">{tr("요금제 직접 입력")}</span>
        </button>
      )}
    </div>
  );
}
