import { useState } from "react";
import toast from "react-hot-toast";
import { serviceApi } from "../../api/services";
import type { ServicePlan } from "../../types/service";
import type { BillingCycle } from "../../types/subscription";
import { tr } from "../../i18n/translations";
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
  // 직접 넣는 금액은 대개 청구서에 찍힌 실결제액이라 포함가로 본다.
  // 공식 가격표를 보고 적는 사람도 있어 끌 수 있게 둔다.
  const [vatIncluded, setVatIncluded] = useState(true);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setPrice("");
    setCurrency("KRW");
    setCycle("monthly");
    setDescription("");
    setVatIncluded(true);
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
        vat_included: vatIncluded,
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
            checked={vatIncluded}
            onChange={(e) => setVatIncluded(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-500">
            {tr("이 금액에 부가세가 포함되어 있어요")}
            <span className="mt-0.5 block text-xs text-slate-400">
              {tr("끄면 결제할 때 10%가 더 붙는 것으로 계산합니다.")}
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
