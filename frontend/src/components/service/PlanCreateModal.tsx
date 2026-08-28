import { useState } from "react";
import toast from "react-hot-toast";
import { serviceApi } from "../../api/services";
import type { ServicePlan } from "../../types/service";
import type { BillingCycle } from "../../types/subscription";
import { tr } from "../../i18n/translations";
import { withVat, withoutVat } from "../../utils/vat";
import SubscriptionModal from "../subscription/SubscriptionModal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  serviceId: number;
  serviceName: string;
  /** 방금 넣은 요금제를 그대로 이어서 쓸 수 있게 넘긴다 */
  onCreated: (plan: ServicePlan) => void;
}

export default function PlanCreateModal({
  isOpen,
  onClose,
  serviceId,
  serviceName,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("KRW");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [description, setDescription] = useState("");
  // 대개는 청구서에 찍힌 실결제액을 그대로 적으므로 꺼진 상태가 기본이다.
  // 공식 가격표(부가세 별도)를 보고 적을 때만 켜면 된다.
  const [vatSeparate, setVatSeparate] = useState(false);
  const [saving, setSaving] = useState(false);

  /** 켜면 금액 칸을 부가세까지 더한 실결제액으로 바꾸고, 끄면 되돌린다.
   *  플래그로 들고 있다가 나중에 계산하지 않는다 — 눈에 보이는 금액이
   *  그대로 저장되는 편이 헷갈리지 않는다. */
  const toggleVat = (checked: boolean) => {
    setVatSeparate(checked);
    const amount = Number(price);
    if (!price.trim() || Number.isNaN(amount)) return;
    setPrice(String(checked ? withVat(amount, currency, false) : withoutVat(amount, currency)));
  };

  const reset = () => {
    setName("");
    setPrice("");
    setCurrency("KRW");
    setCycle("monthly");
    setDescription("");
    setVatSeparate(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || !price.trim()) return;

    setSaving(true);
    try {
      const plan = await serviceApi.createPlan(serviceId, {
        name: trimmed,
        price: Number(price),
        currency,
        billing_cycle: cycle,
        description: description.trim() || undefined,
        // 금액 칸이 이미 실결제액이다(부가세를 켰으면 더해 놓았다).
        vat_included: true,
      });
      toast.success(tr("요금제를 추가했습니다."));
      reset();
      onCreated(plan);
      onClose();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      toast.error(
        status === 400
          ? tr("같은 이름의 요금제가 이미 있습니다.")
          : tr("요금제 추가에 실패했습니다.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubscriptionModal isOpen={isOpen} onClose={onClose} title={tr("요금제 직접 입력")}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-400">
          {tr("목록에 없는 요금제를 직접 넣습니다. 추가한 요금제는 나에게만 보입니다.")}
        </p>

        <div>
          <label className="block text-sm font-medium text-slate-500">
            {tr("요금제 이름 *")}
          </label>
          <input
            type="text"
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder={`${serviceName} — ${tr("예: 모바일 30회 이용권")}`}
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-500">
              {tr("금액 *")}
            </label>
            <input
              type="number"
              value={price}
              min="0"
              step="1"
              onChange={(e) => setPrice(e.target.value)}
              placeholder="5500"
              className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-500">{tr("통화")}</label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="KRW">KRW</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="JPY">JPY</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("결제 주기")}</label>
          <select
            value={cycle}
            onChange={(e) => setCycle(e.target.value as BillingCycle)}
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="monthly">{tr("월간")}</option>
            <option value="yearly">{tr("연간")}</option>
            <option value="weekly">{tr("주간")}</option>
            <option value="quarterly">{tr("분기")}</option>
          </select>
        </div>

        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={vatSeparate}
            onChange={(e) => toggleVat(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-500">
            {tr("이 금액에 부가세 10%가 별도로 붙어요")}
            <span className="mt-0.5 block text-xs text-slate-400">
              {tr("체크하면 위 금액이 부가세까지 더한 실제 결제액으로 바뀝니다.")}
            </span>
          </span>
        </label>

        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("설명")}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={tr("선택 입력")}
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="btn-secondary-glass px-4 py-2 text-sm font-medium"
          >
            {tr("취소")}
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || !price.trim()}
            className="btn-primary-glass px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? tr("저장 중...") : tr("추가")}
          </button>
        </div>
      </form>
    </SubscriptionModal>
  );
}
