import { useCallback, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import toast from "react-hot-toast";
import { serviceApi } from "../../api/services";
import type { Service, ServicePlan } from "../../types/service";
import PlanCreateModal from "./PlanCreateModal";
import PlanSelector from "./PlanSelector";
import { tr } from "../../i18n/translations";
import type { RateTable } from "../../utils/currency";

interface Props {
  serviceId: number;
  onSubscribe: (serviceId: number, plan: ServicePlan) => void;
  onBack: () => void;
  /** 원화 환산 보기 (목록 화면의 토글을 그대로 이어받는다) */
  showKrw?: boolean;
  rates?: RateTable;
}

export default function ServiceDetail({ serviceId, onSubscribe, onBack, showKrw, rates }: Props) {
  const [service, setService] = useState<Service | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planModalOpen, setPlanModalOpen] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setService(await serviceApi.getById(serviceId));
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("서비스 정보를 불러오는데 실패했습니다."));
    }
  }, [serviceId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const handleDeletePlan = async (plan: ServicePlan) => {
    if (!window.confirm(tr("'{name}' 요금제를 삭제하시겠습니까?", { name: plan.name }))) return;
    try {
      await serviceApi.removePlan(serviceId, plan.id);
      toast.success(tr("요금제를 삭제했습니다."));
      await load();
    } catch {
      toast.error(tr("요금제 삭제에 실패했습니다."));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <button
          onClick={onBack}
          className="mb-4 text-sm text-slate-400 hover:text-slate-500"
        >{tr("← 서비스 목록으로")}</button>
        <div className="glass border-red-200/60 bg-red-50/50 p-4 text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!service) return null;

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-4 text-sm text-slate-400 hover:text-slate-500"
      >{tr("← 서비스 목록으로")}</button>

      <div className="glass p-6">
        <div className="flex items-center gap-4">
          {service.logo_url ? (
            <img
              src={service.logo_url}
              alt={service.name}
              className="h-16 w-16 rounded-xl object-contain"
            />
          ) : (
            <div
              className="flex h-16 w-16 items-center justify-center rounded-xl text-slate-500"
              style={{ backgroundColor: service.category?.color ?? "#E5E7EB" }}
            >
              <CreditCard className="h-7 w-7" />
            </div>
          )}
          <div>
            <h2 className="text-xl font-bold text-slate-900">{service.name}</h2>
            <p className="text-sm text-slate-400">{service.description}</p>
            {service.website_url && (
              <a
                href={service.website_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline"
              >{tr("공식 사이트 →")}</a>
            )}
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">{tr("요금제 선택")}</h3>
          <PlanSelector
            plans={service.plans.filter((p) => p.is_active)}
            onSelect={(plan) => onSubscribe(service.id, plan)}
            showKrw={showKrw}
            rates={rates}
            onAdd={() => setPlanModalOpen(true)}
            onDelete={handleDeletePlan}
          />
        </div>
      </div>

      <PlanCreateModal
        isOpen={planModalOpen}
        onClose={() => setPlanModalOpen(false)}
        serviceId={service.id}
        serviceName={service.name}
        onCreated={(plan) => {
          // 넣자마자 구독 등록으로 이어지게 한다 — 요금제만 만들고 끝낼 일은 없다.
          // 목록도 다시 읽어 둔다. 구독 등록을 취소하고 돌아와도 방금 넣은
          // 요금제가 보여야 한다.
          void load();
          onSubscribe(service.id, plan);
        }}
      />
    </div>
  );
}
