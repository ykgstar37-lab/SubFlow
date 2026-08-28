import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ArrowLeftRight, FolderPlus, PlusCircle, Tag } from "lucide-react";
import { serviceApi } from "../api/services";
import { subscriptionApi } from "../api/subscriptions";
import { categoryApi } from "../api/categories";
import { analyticsApi } from "../api/analytics";
import type { RateTable } from "../utils/currency";
import type { ServiceListItem, ServicePlan } from "../types/service";
import type { Category } from "../types/category";
import ServiceCard from "../components/service/ServiceCard";
import ServiceDetail from "../components/service/ServiceDetail";
import CategoryManagerModal from "../components/catalog/CategoryManagerModal";
import ServiceCreateModal from "../components/catalog/ServiceCreateModal";
import SubscriptionModal from "../components/subscription/SubscriptionModal";
import { tr } from "../i18n/translations";
import { nextBillingDate, todayIso } from "../utils/billingDate";
import { formatAmount, withVat } from "../utils/vat";

export default function ServicesPage() {
  const navigate = useNavigate();
  const [services, setServices] = useState<ServiceListItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);
  const [subscribing, setSubscribing] = useState<{
    serviceId: number;
    plan: ServicePlan;
  } | null>(null);
  const [startDate, setStartDate] = useState(todayIso());
  const [nextDate, setNextDate] = useState(todayIso());
  const [saving, setSaving] = useState(false);

  // 카탈로그에 없는 것을 직접 넣는 두 갈래 — 분류(카테고리)와 항목(서비스)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [serviceModalOpen, setServiceModalOpen] = useState(false);

  // 원화 환산 토글. 환율은 처음 켤 때 한 번만 받는다(서버도 1시간 캐시).
  const [showKrw, setShowKrw] = useState(false);
  const [rates, setRates] = useState<RateTable>({});
  const [ratesAsOf, setRatesAsOf] = useState<string | null>(null);

  const toggleKrw = async () => {
    if (!showKrw && Object.keys(rates).length === 0) {
      try {
        const res = await analyticsApi.getExchangeRates();
        setRates(res.rates);
        setRatesAsOf(res.as_of);
      } catch {
        toast.error(tr("환율을 가져오지 못했습니다."));
        return;
      }
    }
    setShowKrw((v) => !v);
  };

  const fetchServices = useCallback(async () => {
    setLoading(true);
    try {
      const [svcs, cats] = await Promise.all([
        search
          ? serviceApi.search(search)
          : serviceApi.getAll(selectedCategory),
        categoryApi.getAll(),
      ]);
      setServices(svcs);
      setCategories(cats);
    } catch {
      toast.error(tr("서비스 목록을 불러오는데 실패했습니다."));
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory]);

  useEffect(() => {
    const timer = setTimeout(fetchServices, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [fetchServices, search]);

  const handleDeleteService = async (svc: ServiceListItem) => {
    if (!window.confirm(tr("'{name}' 서비스를 삭제하시겠습니까?", { name: svc.name }))) return;
    try {
      await serviceApi.remove(svc.id);
      toast.success(tr("서비스를 삭제했습니다."));
      fetchServices();
    } catch {
      toast.error(tr("서비스 삭제에 실패했습니다."));
    }
  };

  const handleSubscribe = async () => {
    if (!subscribing) return;
    setSaving(true);
    try {
      await subscriptionApi.createFromCatalog({
        service_id: subscribing.serviceId,
        plan_id: subscribing.plan.id,
        start_date: startDate,
        next_billing_date: nextDate,
      });
      toast.success(tr("구독이 등록되었습니다!"));
      setSubscribing(null);
      navigate("/subscriptions");
    } catch {
      toast.error(tr("구독 등록에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  // Service detail view
  if (selectedServiceId) {
    return (
      <div>
        {/* 상세에서도 요금제를 보며 바로 환산할 수 있어야 한다 */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-slate-900">{tr("서비스 상세")}</h2>
          <div className="text-right">
            <button
              onClick={toggleKrw}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                showKrw
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                  : "glass text-slate-500 hover:bg-white/40"
              }`}
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              {showKrw ? tr("원화") : tr("원화로")}
            </button>
            {showKrw && ratesAsOf && (
              <p className="mt-1 text-xs text-slate-400">
                {ratesAsOf} {tr("고시 환율 기준")}
              </p>
            )}
          </div>
        </div>
        <ServiceDetail
          serviceId={selectedServiceId}
          onBack={() => setSelectedServiceId(null)}
          onSubscribe={(serviceId, plan) => {
            const start = todayIso();
            setStartDate(start);
            // 시작일과 같은 날을 두면 저장하자마자 결제 임박 알림이 뜬다
            setNextDate(nextBillingDate(start, plan.billing_cycle));
            setSubscribing({ serviceId, plan });
          }}
          showKrw={showKrw}
          rates={rates}
        />

        {/* Subscribe modal */}
        <SubscriptionModal
          isOpen={!!subscribing}
          onClose={() => setSubscribing(null)}
          title={tr("구독 등록")}
        >
          {subscribing && (
            <div className="space-y-4">
              <div className="rounded-lg bg-blue-500/10 p-4">
                <p className="font-semibold text-blue-900">
                  {subscribing.plan.name}
                </p>
                {/* 담기 화면은 정가가 아니라 실제로 빠지는 금액을 크게 보여준다.
                    이 값이 그대로 구독 금액으로 저장되고 월 지출 합계에 들어간다. */}
                <p className="text-2xl font-bold text-blue-700">
                  {formatAmount(
                    withVat(
                      subscribing.plan.price,
                      subscribing.plan.currency,
                      subscribing.plan.vat_included
                    ),
                    subscribing.plan.currency,
                    tr("원")
                  )}
                  <span className="text-sm font-normal text-blue-500">
                    /{subscribing.plan.billing_cycle === "monthly" ? tr("월") : subscribing.plan.billing_cycle === "yearly" ? tr("년") : subscribing.plan.billing_cycle}
                  </span>
                </p>
                {subscribing.plan.vat_included === false && (
                  <p className="mt-1 text-xs text-blue-600/80">
                    {tr("정가 {price} + 부가세 10%", {
                      price: formatAmount(
                        subscribing.plan.price,
                        subscribing.plan.currency,
                        tr("원")
                      ),
                    })}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500">{tr("구독 시작일")}</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // 시작일을 옮기면 다음 결제일도 같이 옮긴다. 따로 정하고 싶으면
                    // 아래 칸에서 고치면 된다(이 순서가 손이 덜 간다).
                    if (subscribing) {
                      setNextDate(nextBillingDate(e.target.value, subscribing.plan.billing_cycle));
                    }
                  }}
                  className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-500">{tr("다음 결제일")}</label>
                <input
                  type="date"
                  value={nextDate}
                  onChange={(e) => setNextDate(e.target.value)}
                  className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setSubscribing(null)}
                  className="btn-secondary-glass px-4 py-2 text-sm font-medium"
                >{tr("취소")}</button>
                <button
                  onClick={handleSubscribe}
                  disabled={saving}
                  className="btn-primary-glass px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? tr("등록 중...") : tr("구독 등록")}
                </button>
              </div>
            </div>
          )}
        </SubscriptionModal>
      </div>
    );
  }

  // Service list view
  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-900">{tr("서비스 탐색")}</h2>
        <div className="flex items-center gap-2 text-right">
          <button
            onClick={() => setCategoryModalOpen(true)}
            className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white/40"
          >
            <FolderPlus className="h-3.5 w-3.5" />
            {tr("카테고리 추가")}
          </button>
          <button
            onClick={() => setServiceModalOpen(true)}
            className="glass inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-slate-500 transition-colors hover:bg-white/40"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            {tr("서비스 추가")}
          </button>
          <div className="text-right">
          {/* 외화 요금을 원화로 환산해 보는 토글 */}
          <button
            onClick={toggleKrw}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              showKrw
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                : "glass text-slate-500 hover:bg-white/40"
            }`}
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            {showKrw ? tr("원화") : tr("원화로")}
          </button>
          {/* ECB 고시라 영업일 1회 갱신 — 언제 기준인지 밝힌다 */}
          {showKrw && ratesAsOf && (
            <p className="mt-1 text-xs text-slate-400">
              {ratesAsOf} {tr("고시 환율 기준")}
            </p>
          )}
          </div>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setSelectedCategory(undefined);
          }}
          placeholder={tr("서비스 검색 (예: Netflix, Spotify...)")}
          className="glass-input flex-1 rounded-lg px-4 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Category tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => {
            setSelectedCategory(undefined);
            setSearch("");
          }}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            !selectedCategory && !search
              ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
              : "glass text-slate-500 hover:bg-white/40"
          }`}
        >{tr("전체")}</button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategory(cat.id);
              setSearch("");
            }}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedCategory === cat.id
                ? "bg-blue-600 text-white shadow-lg shadow-blue-500/25"
                : "glass text-slate-500 hover:bg-white/40"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              {cat.name}
            </span>
          </button>
        ))}
      </div>

      {/* Service list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      ) : services.length === 0 ? (
        <div className="glass py-12 text-center">
          <p className="text-slate-400">{tr("검색 결과가 없습니다.")}</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {services.map((svc) => (
            <ServiceCard
              key={svc.id}
              service={svc}
              onClick={setSelectedServiceId}
              showKrw={showKrw}
              rates={rates}
              onDelete={svc.is_custom ? handleDeleteService : undefined}
            />
          ))}
        </div>
      )}

      <CategoryManagerModal
        isOpen={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        categories={categories}
        onChanged={fetchServices}
      />
      <ServiceCreateModal
        isOpen={serviceModalOpen}
        onClose={() => setServiceModalOpen(false)}
        categories={categories}
        onCreated={fetchServices}
      />
    </div>
  );
}
