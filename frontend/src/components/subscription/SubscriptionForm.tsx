import { useEffect, useRef, useState } from "react";
import type { Category } from "../../types/category";
import type { Service, ServiceListItem } from "../../types/service";
import type {
  BillingCycle,
  Subscription,
  SubscriptionCreateRequest,
  SubscriptionStatus,
} from "../../types/subscription";
import { serviceApi } from "../../api/services";
import { tr, fmtMoney } from "../../i18n/translations";
import RentalItemPicker, { type RentalItem } from "./RentalItemPicker";
import { addMonths } from "../../utils/billingDate";
import { contractRemaining } from "../../utils/contract";

interface Props {
  categories: Category[];
  initial?: Subscription | null;
  onSubmit: (data: SubscriptionCreateRequest) => void;
  onCancel: () => void;
  loading?: boolean;
  /** 내가 다른 렌탈에 직접 붙였던 기기들 — 다시 고를 수 있게 함께 보여준다 */
  rentalExtras?: RentalItem[];
}

const cycleMap: Record<string, BillingCycle> = {
  MONTHLY: "monthly",
  YEARLY: "yearly",
  WEEKLY: "weekly",
  QUARTERLY: "quarterly",
};

export default function SubscriptionForm({
  categories,
  initial,
  onSubmit,
  onCancel,
  loading,
  rentalExtras = [],
}: Props) {
  const isEditing = !!initial;

  // Service catalog state
  const [servicesByCategory, setServicesByCategory] = useState<
    Map<number, ServiceListItem[]>
  >(new Map());
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | undefined>(
    initial?.service_id ?? undefined
  );
  const [selectedServiceInfo, setSelectedServiceInfo] = useState<{
    name: string;
    logo_url?: string;
  } | null>(initial?.service_id ? { name: initial.service_name, logo_url: initial.service?.logo_url ?? initial.logo_url ?? undefined } : null);
  const [serviceDetail, setServiceDetail] = useState<Service | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | undefined>(
    initial?.plan_id ?? undefined
  );
  const [useCustom, setUseCustom] = useState(isEditing && !initial?.service_id);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const nextMonthStr = nextMonth.toISOString().split("T")[0];

  const [form, setForm] = useState({
    service_name: initial?.service_name ?? "",
    cost: initial?.cost?.toString() ?? "",
    currency: initial?.currency ?? "KRW",
    billing_cycle: (initial?.billing_cycle ?? "monthly") as BillingCycle,
    start_date: initial?.start_date ?? today.toISOString().split("T")[0],
    next_billing_date:
      initial?.next_billing_date ?? nextMonthStr,
    category_id: initial?.category_id ?? undefined,
    status: (initial?.status ?? "active") as SubscriptionStatus,
    auto_renew: initial?.auto_renew ?? true,
    is_recurring: initial?.is_recurring ?? true,
    cancel_reminder: initial?.cancel_reminder ?? false,
    member_count: initial?.member_count ?? 1,
    notes: initial?.notes ?? "",
    contract_end_date: initial?.contract_end_date ?? null,
  });
  const [rentalItem, setRentalItem] = useState<RentalItem | null>(
    initial?.rental_item ? { name: initial.rental_item, icon: initial.rental_item_icon ?? "📦" } : null
  );
  // 렌탈 분류이거나 이미 기기가 붙어 있을 때만 기기·약정 칸을 펼친다
  const isRental =
    categories.find((c) => c.id === form.category_id)?.name === "Rental" || !!rentalItem;

  // Load all services grouped by category
  useEffect(() => {
    async function load() {
      const map = new Map<number, ServiceListItem[]>();
      for (const cat of categories) {
        const services = await serviceApi.getAll(cat.id);
        if (services.length > 0) {
          map.set(cat.id, services);
        }
      }
      setServicesByCategory(map);
      // Default to first category with services
      const firstCatId = categories.find((c) => map.has(c.id))?.id;
      if (firstCatId) setActiveCategoryId(firstCatId);
    }
    if (categories.length > 0) load();
  }, [categories]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Load service detail when selected
  useEffect(() => {
    if (!selectedServiceId) {
      setServiceDetail(null);
      return;
    }
    serviceApi.getById(selectedServiceId).then((svc) => {
      setServiceDetail(svc);
      setForm((prev) => ({
        ...prev,
        service_name: svc.name,
        category_id: svc.category_id ?? prev.category_id,
      }));
      if (!selectedPlanId && svc.plans.length > 0) {
        setSelectedPlanId(svc.plans[0].id);
      }
    });
  }, [selectedServiceId]);

  // Auto-fill form when plan is selected
  useEffect(() => {
    if (!serviceDetail || !selectedPlanId) return;
    const plan = serviceDetail.plans.find((p) => p.id === selectedPlanId);
    if (!plan) return;
    setForm((prev) => ({
      ...prev,
      cost: Math.round(plan.price).toString(),
      currency: plan.currency,
      billing_cycle: cycleMap[plan.billing_cycle] ?? "monthly",
    }));
  }, [selectedPlanId, serviceDetail]);

  const handleSelectService = (svc: ServiceListItem) => {
    setSelectedServiceId(svc.id);
    setSelectedServiceInfo({ name: svc.name, logo_url: svc.logo_url ?? undefined });
    setSelectedPlanId(undefined);
    setDropdownOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...form,
      cost: Number(form.cost),
      category_id: form.category_id || undefined,
      is_recurring: form.is_recurring,
      cancel_reminder: form.cancel_reminder,
      member_count: form.member_count,
      notes: form.notes || undefined,
      contract_end_date: form.contract_end_date || null,
      rental_item: rentalItem?.name ?? null,
      rental_item_icon: rentalItem?.icon ?? null,
    });
  };

  const categoriesWithServices = categories.filter((c) => servicesByCategory.has(c.id));
  const visibleServices = activeCategoryId ? servicesByCategory.get(activeCategoryId) ?? [] : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Service Selection */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium text-slate-500">{tr("서비스 *")}</label>
          <button
            type="button"
            onClick={() => {
              setUseCustom(!useCustom);
              if (!useCustom) {
                setSelectedServiceId(undefined);
                setSelectedServiceInfo(null);
                setServiceDetail(null);
                setSelectedPlanId(undefined);
              }
            }}
            className="text-xs text-blue-500 hover:underline"
          >
            {useCustom ? tr("카탈로그에서 선택") : tr("직접 입력")}
          </button>
        </div>

        {useCustom ? (
          <input
            type="text"
            value={form.service_name}
            onChange={(e) => setForm({ ...form, service_name: e.target.value })}
            required
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={tr("서비스 이름을 입력하세요")}
          />
        ) : (
          <div ref={dropdownRef} className="relative mt-1">
            {/* Selected display / trigger */}
            <button
              type="button"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="glass-input flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {selectedServiceInfo ? (
                <>
                  {selectedServiceInfo.logo_url ? (
                    <img
                      src={selectedServiceInfo.logo_url}
                      alt=""
                      className="h-6 w-6 rounded object-contain"
                    />
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-slate-200 text-xs">
                      {selectedServiceInfo.name[0]}
                    </div>
                  )}
                  <span className="text-sm font-medium text-slate-900">
                    {selectedServiceInfo.name}
                  </span>
                </>
              ) : (
                <span className="text-sm text-slate-400">{tr("서비스를 선택하세요")}</span>
              )}
              <svg
                className={`ml-auto h-4 w-4 text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Dropdown panel */}
            {dropdownOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl">
                {/* Category tabs */}
                <div className="custom-scrollbar flex gap-1 overflow-x-auto border-b border-slate-100 px-2 py-2">
                  {categoriesWithServices.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setActiveCategoryId(cat.id)}
                      className={`flex-shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        activeCategoryId === cat.id
                          ? "bg-indigo-500 text-white"
                          : "text-slate-500 hover:bg-slate-100"
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* Service list */}
                <div className="custom-scrollbar max-h-56 overflow-y-auto py-1">
                  {visibleServices.map((svc) => (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => handleSelectService(svc)}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-indigo-50 ${
                        selectedServiceId === svc.id ? "bg-indigo-50" : ""
                      }`}
                    >
                      {svc.logo_url ? (
                        <img
                          src={svc.logo_url}
                          alt=""
                          className="h-8 w-8 rounded-lg object-contain"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-sm font-bold text-slate-400">
                          {svc.name[0]}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {svc.name}
                        </p>
                        {svc.min_price != null && (
                          <p className="text-xs text-slate-400">
                            {svc.currency === "KRW"
                              ? `${fmtMoney(svc.min_price)}~`
                              : `$${svc.min_price}~`}
                          </p>
                        )}
                      </div>
                      {selectedServiceId === svc.id && (
                        <svg className="h-4 w-4 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Plan Selection */}
      {!useCustom && serviceDetail && serviceDetail.plans.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("플랜 *")}</label>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {serviceDetail.plans.filter((p) => p.is_active).map((plan) => {
              const isSelected = selectedPlanId === plan.id;
              const priceLabel =
                plan.currency === "KRW"
                  ? fmtMoney(plan.price)
                  : new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: plan.currency,
                    }).format(plan.price);
              return (
                <button
                  key={plan.id}
                  type="button"
                  onClick={() => setSelectedPlanId(plan.id)}
                  className={`rounded-xl border-2 px-3 py-2.5 text-left transition-all ${
                    isSelected
                      ? "border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500/20"
                      : "border-slate-200 hover:border-slate-300 hover:bg-white/40"
                  }`}
                >
                  <p className={`text-sm font-semibold ${isSelected ? "text-indigo-700" : "text-slate-700"}`}>
                    {plan.name}
                  </p>
                  <p className={`text-xs mt-0.5 ${isSelected ? "text-indigo-500" : "text-slate-400"}`}>
                    {priceLabel}{tr("/월")}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("비용 *")}</label>
          <input
            type="number"
            value={form.cost}
            onChange={(e) => setForm({ ...form, cost: e.target.value })}
            required
            min="0"
            step="1"
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="17000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("결제 주기 *")}</label>
          <select
            value={form.billing_cycle}
            onChange={(e) =>
              setForm({
                ...form,
                billing_cycle: e.target.value as BillingCycle,
              })
            }
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="monthly">{tr("월간")}</option>
            <option value="yearly">{tr("연간")}</option>
            <option value="weekly">{tr("주간")}</option>
            <option value="quarterly">{tr("분기")}</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("시작일")}</label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("다음 결제일")}</label>
          <input
            type="date"
            value={form.next_billing_date}
            onChange={(e) =>
              setForm({ ...form, next_billing_date: e.target.value })
            }
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {isRental && (
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-500">{tr("어떤 기기인가요?")}</label>
          <RentalItemPicker value={rentalItem} onChange={setRentalItem} extras={rentalExtras} />
        </div>
      )}

      {/* 약정 종료일 — 렌탈 의무사용기간. 렌탈이 아니어도 약정 있는 구독에 쓸 수 있다 */}
      <div>
        <label className="block text-sm font-medium text-slate-500">{tr("약정 종료일 (렌탈 등)")}</label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={form.contract_end_date ?? ""}
            onChange={(e) => setForm({ ...form, contract_end_date: e.target.value || null })}
            className="glass-input block rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {/* 몇 년 뒤 날짜를 달력으로 고르기 번거로워 시작일 기준 빠른 선택을 둔다 */}
          {[3, 4, 5, 6].map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => setForm({ ...form, contract_end_date: addMonths(form.start_date, y * 12) })}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 hover:border-blue-300"
            >
              {tr("{n}년", { n: y })}
            </button>
          ))}
          {form.contract_end_date && (
            <button
              type="button"
              onClick={() => setForm({ ...form, contract_end_date: null })}
              className="text-xs text-slate-400 underline"
            >
              {tr("약정 없음")}
            </button>
          )}
        </div>
        {(() => {
          const c = contractRemaining(form.contract_end_date, form.next_billing_date, form.billing_cycle, Number(form.cost) || 0);
          return c && c.days >= 0 ? (
            <p className="mt-2 rounded-lg bg-amber-50/60 px-3 py-2 text-xs text-amber-700">
              {tr("남은 결제 {n}회 · 약 {total} · 끝나면 소유권 이전·렌탈료 인하를 확인하세요", {
                n: c.payments,
                total: form.currency === "KRW" ? fmtMoney(Math.round(c.total)) : `${c.total.toFixed(2)} ${form.currency}`,
              })}
            </p>
          ) : null;
        })()}
      </div>

      {/* 공유/가족 분담 */}
      <div>
        <label className="block text-sm font-medium text-slate-500">{tr("함께 쓰는 인원 (비용 분담)")}</label>
        <div className="mt-1 flex items-center gap-3">
          <input
            type="number"
            value={form.member_count}
            onChange={(e) =>
              setForm({
                ...form,
                member_count: Math.max(1, Math.min(50, Number(e.target.value) || 1)),
              })
            }
            min="1"
            max="50"
            step="1"
            className="glass-input block w-24 rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-400">{tr("명이 나눠서 사용")}</span>
        </div>
        {form.member_count > 1 && Number(form.cost) > 0 && (
          <p className="mt-2 text-xs text-indigo-500 bg-indigo-50/50 rounded-lg px-3 py-2">
            {tr("내 몫")}: {form.currency === "KRW"
              ? fmtMoney(Math.round(Number(form.cost) / form.member_count))
              : `${(Number(form.cost) / form.member_count).toFixed(2)} ${form.currency}`}
            {" "}/ {form.billing_cycle === "monthly" ? tr("월") : form.billing_cycle === "yearly" ? tr("년") : form.billing_cycle === "weekly" ? tr("주") : tr("분기")}
            {" "}{tr("· 대시보드·분석에는 내 몫만 반영됩니다")}
          </p>
        )}
      </div>

      {/* 결제 유형 */}
      <div>
        <label className="block text-sm font-medium text-slate-500 mb-2">{tr("결제 유형")}</label>
        <div className="glass-input inline-flex rounded-full p-1">
          <button
            type="button"
            onClick={() => setForm({ ...form, is_recurring: true, cancel_reminder: false })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              form.is_recurring
                ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >{tr("정기 결제")}</button>
          <button
            type="button"
            onClick={() => setForm({ ...form, is_recurring: false })}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 ${
              !form.is_recurring
                ? "bg-indigo-500 text-white shadow-md shadow-indigo-500/25"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >{tr("일회성 결제")}</button>
        </div>

        {!form.is_recurring && (
          <div className="mt-3 glass rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700">{tr("해지 알림이 필요하신가요?")}</span>
              <button
                type="button"
                onClick={() => setForm({ ...form, cancel_reminder: !form.cancel_reminder })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                  form.cancel_reminder ? "bg-indigo-500" : "bg-slate-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    form.cancel_reminder ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            {form.cancel_reminder && (
              <p className="text-xs text-indigo-500 bg-indigo-50/50 rounded-lg px-3 py-2">{tr("결제 3일 전, 1일 전, 당일에 알림을 보내드립니다")}</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("카테고리")}</label>
          <select
            value={form.category_id ?? ""}
            onChange={(e) =>
              setForm({
                ...form,
                category_id: e.target.value ? Number(e.target.value) : undefined,
              })
            }
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">{tr("선택 안함")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-500">{tr("상태")}</label>
          <select
            value={form.status}
            onChange={(e) =>
              setForm({
                ...form,
                status: e.target.value as SubscriptionStatus,
              })
            }
            className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="active">{tr("활성")}</option>
            <option value="trial">{tr("체험판")}</option>
            <option value="paused">{tr("일시정지")}</option>
            <option value="cancelled">{tr("취소됨")}</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-500">{tr("메모")}</label>
        <textarea
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
          rows={2}
          className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          placeholder={tr("프리미엄 플랜, 가족 공유 등...")}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary-glass px-4 py-2 text-sm font-medium"
        >{tr("취소")}</button>
        <button
          type="submit"
          disabled={loading}
          className="btn-primary-glass px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {loading ? tr("저장 중...") : initial ? tr("수정") : tr("추가")}
        </button>
      </div>
    </form>
  );
}
