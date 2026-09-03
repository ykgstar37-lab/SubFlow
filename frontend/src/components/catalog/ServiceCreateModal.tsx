import { useState } from "react";
import toast from "react-hot-toast";
import { serviceApi } from "../../api/services";
import type { Category } from "../../types/category";
import type { BillingCycle } from "../../types/subscription";
import { tr } from "../../i18n/translations";
import SubscriptionModal from "../subscription/SubscriptionModal";
import { PLAN_CURRENCIES } from "../../constants/currency";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
  /** 등록 후 카탈로그를 다시 읽도록 알린다 */
  onCreated: () => void;
}

export default function ServiceCreateModal({
  isOpen,
  onClose,
  categories,
  onCreated,
}: Props) {
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [description, setDescription] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState("KRW");
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setCategoryId("");
    setDescription("");
    setWebsiteUrl("");
    setPrice("");
    setCurrency("KRW");
    setCycle("monthly");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      await serviceApi.create({
        name: trimmed,
        description: description.trim() || undefined,
        category_id: categoryId === "" ? undefined : categoryId,
        website_url: websiteUrl.trim() || undefined,
        // 요금제가 없으면 카드에 가격이 안 뜨고 여기서 바로 구독을 걸 수도 없다.
        // 금액을 비워 두면 요금제 없이 이름만 등록한다.
        plans: price.trim()
          ? [
              {
                name: tr("기본"),
                price: Number(price),
                currency,
                billing_cycle: cycle,
              },
            ]
          : [],
      });
      toast.success(tr("서비스를 추가했습니다."));
      reset();
      onCreated();
      onClose();
    } catch (err) {
      const status = (err as { response?: { status?: number } }).response?.status;
      toast.error(
        status === 400
          ? tr("같은 이름의 서비스가 이미 있습니다.")
          : tr("서비스 추가에 실패했습니다.")
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SubscriptionModal isOpen={isOpen} onClose={onClose} title={tr("서비스 추가")}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-400">
          {tr("카탈로그에 없는 서비스를 직접 등록합니다. 등록한 서비스는 나에게만 보입니다.")}
        </p>

        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("서비스 이름 *")}</label>
          <input
            type="text"
            value={name}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            placeholder={tr("예: 동네 헬스장")}
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("카테고리")}</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : "")}
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{tr("미분류")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-500">{tr("금액")}</label>
            <input
              type="number"
              value={price}
              min="0"
              step="1"
              onChange={(e) => setPrice(e.target.value)}
              placeholder="50000"
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
              {PLAN_CURRENCIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
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

        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("홈페이지 주소")}</label>
          <input
            type="url"
            value={websiteUrl}
            maxLength={500}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
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
            disabled={saving || !name.trim()}
            className="btn-primary-glass px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving ? tr("저장 중...") : tr("추가")}
          </button>
        </div>
      </form>
    </SubscriptionModal>
  );
}
