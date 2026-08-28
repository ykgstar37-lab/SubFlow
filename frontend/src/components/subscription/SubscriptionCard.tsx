import { format } from "date-fns";
import { CreditCard, ExternalLink, Pencil, Trash2, Users } from "lucide-react";
import type { Subscription } from "../../types/subscription";
import { tr } from "../../i18n/translations";
import { krwHint } from "../../utils/currency";

interface Props {
  subscription: Subscription;
  onEdit: (sub: Subscription) => void;
  onDelete: (id: string) => void;
}

const statusColors: Record<string, string> = {
  active: "bg-emerald-500/10 text-emerald-700",
  paused: "bg-amber-500/10 text-amber-700",
  cancelled: "bg-rose-500/10 text-rose-700",
  trial: "bg-indigo-500/10 text-indigo-700",
};

// 언어 변경이 반영되도록 상수가 아니라 호출 시점에 만든다
const statusLabels = (): Record<string, string> => ({
  active: tr("활성"),
  paused: tr("일시정지"),
  cancelled: tr("취소됨"),
  trial: tr("체험 중"),
});

// 언어 변경이 반영되도록 상수가 아니라 호출 시점에 만든다
const cycleLabels = (): Record<string, string> => ({
  monthly: tr("월"),
  yearly: tr("년"),
  weekly: tr("주"),
  quarterly: tr("분기"),
});

export default function SubscriptionCard({ subscription, onEdit, onDelete }: Props) {
  const costDisplay = new Intl.NumberFormat("ko-KR").format(subscription.cost);
  // 외화 구독은 원화 환산액을 함께 보여준다. 서버가 준 현재 환율을 쓴다.
  const costKrw = krwHint(
    subscription.cost,
    subscription.currency,
    subscription.exchange_rate_krw
  );
  const shareKrw = krwHint(
    subscription.cost / subscription.member_count,
    subscription.currency,
    subscription.exchange_rate_krw
  );

  return (
    <div className="glass p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {subscription.service?.logo_url || subscription.logo_url ? (
            <img
              src={subscription.service?.logo_url ?? subscription.logo_url ?? ""}
              alt={subscription.service_name}
              className="h-10 w-10 rounded-lg object-contain"
            />
          ) : (
            <div
              className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500"
              style={{ backgroundColor: subscription.category?.color ?? "#E5E7EB" }}
            >
              <CreditCard className="h-5 w-5" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-slate-900">{subscription.service_name}</h3>
            {/* 서비스 하나에 요금제가 여럿이면(예: 채널마다 다른 유튜브 멤버십)
                이름만으로는 구분이 안 된다. 요금제가 있으면 앞에 세운다. */}
            <p className="truncate text-xs text-slate-400">
              {[subscription.plan?.name, subscription.category?.name]
                .filter(Boolean)
                .join(" · ") || tr("미분류")}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[subscription.status]}`}>
          {statusLabels()[subscription.status]}
        </span>
      </div>

      <div className="mt-4">
        <p className="text-2xl font-bold text-slate-900">
          {costDisplay}
          <span className="text-sm font-normal text-slate-400">
            {" "}{subscription.currency}/{cycleLabels()[subscription.billing_cycle]}
          </span>
        </p>
        {costKrw && <p className="mt-0.5 text-sm text-slate-500">{costKrw}</p>}
        <p className="mt-1 text-xs text-slate-400">
          {tr("다음 결제")}: {format(new Date(subscription.next_billing_date), "yyyy.MM.dd")}
        </p>
        {subscription.member_count > 1 && (
          <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-700">
            <Users className="h-3 w-3" />
            {tr("{n}명 분담 · 내 몫", { n: subscription.member_count })}{" "}
            {new Intl.NumberFormat("ko-KR").format(
              Math.round(subscription.cost / subscription.member_count)
            )}{" "}
            {subscription.currency}/{cycleLabels()[subscription.billing_cycle]}
            {shareKrw ? ` (${shareKrw})` : ""}
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          onClick={() => onEdit(subscription)}
          className="btn-secondary-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
        >
          <Pencil className="h-3.5 w-3.5" />{tr("수정")}</button>
        {subscription.service?.cancel_url && subscription.status === "active" && (
          <a
            href={subscription.service.cancel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-warning-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
          >
            <ExternalLink className="h-3.5 w-3.5" />{tr("해지하기")}</a>
        )}
        <button
          onClick={() => onDelete(subscription.id)}
          className="btn-danger-glass inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
        >
          <Trash2 className="h-3.5 w-3.5" />{tr("삭제")}</button>
      </div>
    </div>
  );
}
