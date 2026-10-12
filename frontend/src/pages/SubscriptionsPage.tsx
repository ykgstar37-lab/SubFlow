import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download, Layers, Plus } from "lucide-react";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { subscriptionApi } from "../api/subscriptions";
import SubscriptionCard from "../components/subscription/SubscriptionCard";
import SubscriptionForm from "../components/subscription/SubscriptionForm";
import SubscriptionModal from "../components/subscription/SubscriptionModal";
import type {
  Subscription,
  SubscriptionCreateRequest,
  SubscriptionStatus,
} from "../types/subscription";
import { tr, fmtMoney, fmtCount } from "../i18n/translations";

export default function SubscriptionsPage() {
  const { subscriptions, categories, loading, refetch } = useSubscriptions();
  // 다른 렌탈에 붙여 둔 기기는 새로 담을 때도 다시 고를 수 있게 넘긴다
  const rentalExtras = subscriptions.flatMap((s) =>
    s.rental_item ? [{ name: s.rental_item, icon: s.rental_item_icon ?? "📦" }] : []
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // 상태와 분류는 따로 걸린다 — "활성 + 엔터테인먼트"처럼 겹쳐 볼 수 있다.
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | "all">("all");
  // "all"이면 카테고리별로 묶어 보여주고, 하나를 고르면 그 칸만 남긴다.
  const [categoryFilter, setCategoryFilter] = useState<number | "all" | "none">("all");

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await subscriptionApi.exportCsv();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subflow_subscriptions_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success(tr("CSV 파일을 내보냈습니다."));
    } catch {
      toast.error(tr("내보내기에 실패했습니다."));
    } finally {
      setExporting(false);
    }
  };

  const handleCreate = async (data: SubscriptionCreateRequest) => {
    setSaving(true);
    try {
      await subscriptionApi.create(data);
      toast.success(tr("구독이 추가되었습니다."));
      setModalOpen(false);
      refetch();
    } catch {
      toast.error(tr("구독 추가에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (data: SubscriptionCreateRequest) => {
    if (!editing) return;
    setSaving(true);
    try {
      await subscriptionApi.update(editing.id, data);
      toast.success(tr("구독이 수정되었습니다."));
      setEditing(null);
      refetch();
    } catch {
      toast.error(tr("구독 수정에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(tr("이 구독을 삭제하시겠습니까?"))) return;
    try {
      await subscriptionApi.delete(id);
      toast.success(tr("구독이 삭제되었습니다."));
      refetch();
    } catch {
      toast.error(tr("구독 삭제에 실패했습니다."));
    }
  };

  const byStatus =
    statusFilter === "all"
      ? subscriptions
      : subscriptions.filter((s) => s.status === statusFilter);
  const filtered =
    categoryFilter === "all"
      ? byStatus
      : categoryFilter === "none"
      ? byStatus.filter((s) => !s.category_id)
      : byStatus.filter((s) => s.category_id === categoryFilter);

  // 분류를 따로 안 고르면 카테고리별로 묶는다. 순서는 카테고리 목록을 따라가고
  // (기본 13종 먼저, 내가 만든 것이 뒤), 미분류는 맨 끝에 둔다.
  const groups = useMemo(() => {
    if (categoryFilter !== "all") return null;
    const buckets = new Map<
      number | "none",
      { name: string; icon?: string; color?: string; items: Subscription[] }
    >();
    for (const c of categories) {
      buckets.set(c.id, { name: c.name, icon: c.icon, color: c.color, items: [] });
    }
    buckets.set("none", { name: tr("미분류"), items: [] });
    for (const sub of filtered) {
      const key: number | "none" =
        sub.category_id && buckets.has(sub.category_id) ? sub.category_id : "none";
      buckets.get(key)!.items.push(sub);
    }
    return [...buckets.entries()].filter(([, b]) => b.items.length > 0);
  }, [filtered, categories, categoryFilter]);

  // 필터 줄에는 실제로 쓰이는 분류만 남긴다. 13종을 전부 늘어놓으면 두 줄로
  // 넘치는데, 눌러 봐야 비어 있는 칸이라 고를 이유가 없다.
  const usedCategories = useMemo(() => {
    const ids = new Set(subscriptions.map((s) => s.category_id).filter(Boolean));
    return categories.filter((c) => ids.has(c.id));
  }, [subscriptions, categories]);
  const hasUncategorised = subscriptions.some((s) => !s.category_id);

  const activeCount = subscriptions.filter((s) => s.status === "active").length;
  const totalMonthly = subscriptions
    .filter((s) => s.status === "active")
    .reduce((sum, s) => {
      const cost = Number(s.cost);
      switch (s.billing_cycle) {
        case "weekly": return sum + cost * 4.33;
        case "monthly": return sum + cost;
        case "quarterly": return sum + cost / 3;
        case "yearly": return sum + cost / 12;
        default: return sum + cost;
      }
    }, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{tr("구독 관리")}</h2>
          <p className="mt-1 text-sm text-slate-400">
            {tr("활성 {n} · 월 예상 비용", { n: fmtCount(activeCount, "개") })}{" "}
            {fmtMoney(Math.round(totalMonthly))}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || subscriptions.length === 0}
            className="btn-secondary-glass inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? tr("내보내는 중...") : tr("CSV 내보내기")}
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary-glass inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium"
          >
            <Plus className="h-4 w-4" />{tr("구독 추가")}</button>
        </div>
      </div>

      {/* 상태 줄 */}
      {subscriptions.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {(["all", "active", "paused", "cancelled"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                statusFilter === f
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/25"
                  : "glass text-slate-500 hover:bg-white/40"
              }`}
            >
              {f === "all"
                ? tr("전체")
                : f === "active"
                ? tr("활성")
                : f === "paused"
                ? tr("일시정지")
                : tr("취소됨")}
            </button>
          ))}
        </div>
      )}

      {/* 분류 줄 */}
      {subscriptions.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setCategoryFilter("all")}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              categoryFilter === "all"
                ? "bg-slate-700 text-white"
                : "glass text-slate-500 hover:bg-white/40"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            {tr("분류 전체")}
          </button>
          {usedCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategoryFilter(c.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                categoryFilter === c.id
                  ? "bg-slate-700 text-white"
                  : "glass text-slate-500 hover:bg-white/40"
              }`}
            >
              {c.icon && <span>{c.icon}</span>}
              {c.name}
            </button>
          ))}
          {hasUncategorised && (
            <button
              onClick={() => setCategoryFilter("none")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                categoryFilter === "none"
                  ? "bg-slate-700 text-white"
                  : "glass text-slate-500 hover:bg-white/40"
              }`}
            >
              {tr("미분류")}
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="glass py-12 text-center">
          <p className="text-slate-400">{tr("아직 등록된 구독이 없습니다.")}</p>
          <button
            onClick={() => setModalOpen(true)}
            className="btn-primary-glass mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm"
          >
            <Plus className="h-4 w-4" />{tr("첫 번째 구독 추가하기")}</button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass py-12 text-center">
          <p className="text-slate-400">{tr("이 조건에 맞는 구독이 없습니다.")}</p>
        </div>
      ) : groups ? (
        /* 분류 전체일 때는 카테고리별로 묶는다 */
        <div className="space-y-8">
          {groups.map(([key, bucket]) => (
            <section key={String(key)}>
              <div className="mb-3 flex items-center gap-2">
                <span
                  className="flex h-6 w-6 items-center justify-center rounded-md text-xs"
                  style={{ backgroundColor: bucket.color ?? "#E5E7EB" }}
                >
                  {bucket.icon ?? ""}
                </span>
                <h3 className="text-sm font-bold text-slate-500">{bucket.name}</h3>
                <span className="text-xs text-slate-400">{bucket.items.length}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {bucket.items.map((sub) => (
                  <SubscriptionCard
                    key={sub.id}
                    subscription={sub}
                    onEdit={setEditing}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              subscription={sub}
              onEdit={setEditing}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <SubscriptionModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={tr("구독 추가")}
      >
        <SubscriptionForm
          categories={categories}
          rentalExtras={rentalExtras}
          onSubmit={handleCreate}
          onCancel={() => setModalOpen(false)}
          loading={saving}
        />
      </SubscriptionModal>

      <SubscriptionModal
        isOpen={!!editing}
        onClose={() => setEditing(null)}
        title={tr("구독 수정")}
      >
        <SubscriptionForm
          categories={categories}
          initial={editing}
          rentalExtras={rentalExtras}
          onSubmit={handleUpdate}
          onCancel={() => setEditing(null)}
          loading={saving}
        />
      </SubscriptionModal>
    </div>
  );
}
