import { useState } from "react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BellRing,
  CalendarDays,
  CreditCard,
  Lightbulb,
  Package,
  PiggyBank,
  ShieldCheck,
  TrendingDown,
} from "lucide-react";
import CategoryPieChart from "../components/analytics/CategoryPieChart";
import MonthlySpendingChart from "../components/analytics/MonthlySpendingChart";
import BudgetStatus from "../components/dashboard/BudgetStatus";
import ExchangeRateAlert from "../components/dashboard/ExchangeRateAlert";
import NewsWidget from "../components/dashboard/NewsWidget";
import OverlapWarning from "../components/dashboard/OverlapWarning";
import PriceChangeAlert from "../components/dashboard/PriceChangeAlert";
import SavingsSuggestions from "../components/dashboard/SavingsSuggestions";
import TrialTracker from "../components/dashboard/TrialTracker";
import BrandLogo from "../components/BrandLogo";
import Header from "../components/layout/Header";
import OnboardingModal from "../components/onboarding/OnboardingModal";
import { useAnalytics } from "../hooks/useAnalytics";
import { useNews } from "../hooks/useNews";
import { useSubscriptions } from "../hooks/useSubscriptions";
import { useAuthStore } from "../store/authStore";
import { tr, fmtMoney, fmtCount } from "../i18n/translations";

const sideCardClass =
  "rounded-3xl bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)]";


export default function DashboardPage() {
  const {
    overview,
    categoryBreakdown,
    spendingTrend,
    overlaps,
    exchangeRateAlerts,
    trials,
    savingsSuggestions,
    priceChanges,
    budgetStatus,
    loading,
    error: analyticsError,
  } = useAnalytics();
  const { subscriptions, error: subscriptionsError } = useSubscriptions();
  const { news, loading: newsLoading, error: newsError } = useNews();
  const { user } = useAuthStore();
  const [showOnboarding, setShowOnboarding] = useState(
    () => !localStorage.getItem("subflow-onboarded")
  );

  const dismissOnboarding = () => {
    localStorage.setItem("subflow-onboarded", "1");
    setShowOnboarding(false);
  };

  if (loading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  if (analyticsError || subscriptionsError) {
    return (
      <div className="rounded-2xl bg-rose-100/70 p-4 text-rose-600 shadow-sm">
        {analyticsError || subscriptionsError}
      </div>
    );
  }

  const activeSubscriptions = subscriptions.filter((s) => s.status === "active");
  const upcoming = activeSubscriptions
    .sort((a, b) => a.next_billing_date.localeCompare(b.next_billing_date))
    .slice(0, 3);
  const upcomingCount = activeSubscriptions.filter(
    (s) =>
      new Date(s.next_billing_date).getTime() - Date.now() <= 7 * 24 * 60 * 60 * 1000
  ).length;
  const savingsEstimate = savingsSuggestions?.total_potential_savings_krw ?? 0;
  const overlapCount = overlaps?.overlaps.length ?? 0;
  const priceChangeCount = priceChanges?.alerts.length ?? 0;
  const trialCount = trials?.trials.length ?? 0;
  const healthScore = Math.max(
    48,
    100 -
      overlapCount * 9 -
      priceChangeCount * 6 -
      upcomingCount * 3 -
      (budgetStatus?.is_over_budget ? 14 : 0)
  );
  const topActionTitle = budgetStatus?.is_over_budget
    ? tr("예산을 먼저 조정해보세요")
    : overlapCount > 0
      ? tr("중복 구독을 먼저 정리해보세요")
      : savingsEstimate > 0
        ? tr("절약 후보를 확인해보세요")
        : tr("이번 달 구독 상태가 안정적이에요");
  const topActionCopy = budgetStatus?.is_over_budget
    ? tr("현재 지출이 월 예산을 넘어서고 있어요. 기준 예산을 조정하거나 구독 정리가 필요합니다.")
    : overlapCount > 0
      ? tr("비슷한 카테고리의 구독이 겹쳐 있어요. 하나로 묶거나 낮은 요금제를 검토해볼 만합니다.")
      : savingsEstimate > 0
        ? tr("요금제 조정으로 월 최대 {a}까지 줄일 수 있어요.", { a: fmtMoney(savingsEstimate) })
        : tr("다가오는 결제와 가격 변동만 가볍게 확인하면 됩니다.");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[340px_minmax(0,1fr)]">
      {showOnboarding && <OnboardingModal onClose={dismissOnboarding} />}
      <aside className="flex flex-col gap-5">
        <div className="flex gap-1.5">
          <div className="h-3 w-3 rounded-full bg-rose-400" />
          <div className="h-3 w-3 rounded-full bg-amber-400" />
          <div className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>

        <div className="mt-4">
          <p className="text-sm font-medium text-slate-500">Hi {user?.username || "testuser"},</p>
          <h2 className="mt-1 text-2xl font-bold leading-snug text-slate-800">
            {tr("오늘도 똑똑하게")}
            <br />{tr("구독을 관리해보세요")}</h2>
        </div>

        <NewsWidget news={news} loading={newsLoading} error={newsError} />

        <Link to="/analytics" className={`block ${sideCardClass}`}>
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <PiggyBank className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">{tr("이번 달 절약 힌트")}</h3>
              <p className="text-xs text-slate-500">{tr("중복 구독과 요금제 기준 추천")}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div className="rounded-2xl bg-slate-50 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">{tr("절약 가능 금액")}</span>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
                  {tr("월 {a}", { a: fmtMoney(savingsEstimate) })}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{tr("사용 빈도와 낮은 요금제를 기준으로 먼저 확인할 후보를 정리했어요.")}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">{tr("다음 점검일")}</span>
                <span className="text-sm font-bold text-slate-900">05.20</span>
              </div>
            </div>
          </div>
        </Link>
      </aside>

      <section className="flex flex-col rounded-[2rem] bg-white p-6 shadow-[0_24px_80px_rgba(15,23,42,0.08)] sm:p-8">
        <div className="mb-8 flex items-center justify-between">
          <BrandLogo className="h-5 w-auto sm:h-6" />
          <Header />
        </div>

        <div className="mb-6 grid gap-4 xl:grid-cols-[1fr_280px]">
          <Link to={budgetStatus?.is_over_budget || overlapCount > 0 ? "/analytics" : "/subscriptions"} className="rounded-3xl bg-indigo-50/90 p-6 shadow-[0_18px_45px_rgba(79,70,229,0.12)] transition hover:-translate-y-0.5">
            <div className="mb-4 flex items-center gap-2 text-sm font-bold text-indigo-700">
              <Lightbulb className="h-4 w-4" />{tr("오늘의 관리 액션")}</div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">{topActionTitle}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{topActionCopy}</p>
            <div className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-indigo-700">
              {tr("자세히 보기")}
              <ArrowRight className="h-4 w-4" />
            </div>
          </Link>

          <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-100">
              <ShieldCheck className="h-4 w-4" />{tr("구독 건강 점수")}</div>
            <div className="mt-4 flex items-end gap-2">
              <span className="text-5xl font-extrabold">{healthScore}</span>
              <span className="mb-1 text-sm text-slate-300">/ 100</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              {tr("중복 {a}건, 가격 변동 {b}건, 체험 만료 {c}건 기준입니다.", { a: overlapCount, b: priceChangeCount, c: trialCount })}
            </p>
          </div>
        </div>

        {overview && (
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Link to="/subscriptions" className="glass p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">{tr("월 평균 지출")}</p>
                  <p className="mt-2 text-2xl font-extrabold gradient-text">{fmtMoney(overview.total_monthly_cost)}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100/70 text-amber-600">
                  <CreditCard className="h-5 w-5" />
                </div>
              </div>
            </Link>

            <Link to="/subscriptions" className="glass p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">{tr("활성 구독")}</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{fmtCount(overview.total_active_subscriptions, "개")}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <Package className="h-5 w-5" />
                </div>
              </div>
            </Link>

            <Link to="/calendar" className="glass p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">{tr("다가오는 결제")}</p>
                  <p className="mt-2 text-2xl font-extrabold text-slate-900">{fmtCount(upcomingCount, "건")}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100/70 text-orange-500">
                  <BellRing className="h-5 w-5" />
                </div>
              </div>
            </Link>

            <Link to="/analytics" className="glass p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-400">{tr("절약 금액")}</p>
                  <p className="mt-2 text-2xl font-extrabold text-emerald-600">{fmtMoney(savingsEstimate)}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100/70 text-emerald-700">
                  <TrendingDown className="h-5 w-5" />
                </div>
              </div>
            </Link>
          </div>
        )}

        {budgetStatus && (
          <div className="mb-8">
            <BudgetStatus budgetStatus={budgetStatus} />
          </div>
        )}

        <div className="mb-8 grid grid-cols-1 gap-5 xl:grid-cols-[1.1fr_0.9fr]">
          <Link to="/calendar" className="flex flex-col justify-between rounded-3xl bg-slate-50 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
            <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-500">
              <CalendarDays className="h-4 w-4" />{tr("다음 결제 미리보기")}</div>
            {upcoming.length > 0 ? (
              <div className="mt-2 space-y-3">
                {upcoming.map((sub) => (
                  <div key={sub.id} className="flex items-center justify-between rounded-xl bg-white p-2.5 shadow-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      {sub.logo_url ? (
                        <img src={sub.logo_url} alt="" className="h-6 w-6 rounded-md object-contain" />
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-indigo-100 text-[10px] font-bold text-indigo-500">
                          {sub.service_name[0]}
                        </div>
                      )}
                      <span className="w-24 truncate text-sm font-semibold text-slate-700">{sub.service_name}</span>
                    </div>
                    <span className="text-xs font-medium text-slate-400">
                      {format(new Date(sub.next_billing_date), "MM.dd")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">{tr("예정된 결제가 없습니다.")}</p>
            )}
          </Link>

          <Link to="/analytics" className="flex flex-col justify-between rounded-3xl bg-slate-50 p-6 shadow-[0_14px_36px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <PiggyBank className="h-4 w-4 text-indigo-600" />{tr("절약 체크")}</div>
            <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-700">{tr("중복 구독 후보")}</span>
                <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">{fmtCount(overlapCount, "건")}</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{tr("같은 목적의 서비스가 겹치면 구독료가 조용히 커져요. 먼저 겹치는 카테고리부터 확인해보세요.")}</p>
            </div>
          </Link>
        </div>

        <div className="mb-8 space-y-4">
          {trials && trials.trials.length > 0 && <TrialTracker trials={trials.trials} />}
          {overlaps && overlaps.overlaps.length > 0 && <OverlapWarning overlaps={overlaps.overlaps} />}
          {priceChanges && priceChanges.alerts.length > 0 && <PriceChangeAlert alerts={priceChanges.alerts} />}
          {exchangeRateAlerts && exchangeRateAlerts.alerts.length > 0 && (
            <ExchangeRateAlert alerts={exchangeRateAlerts.alerts} />
          )}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Link to="/analytics" className="h-[420px] rounded-3xl bg-slate-50 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)]">
            <h3 className="mb-4 font-bold text-slate-800">{tr("카테고리별 지출")}</h3>
            <div className="h-[340px]">
              {categoryBreakdown && <CategoryPieChart breakdown={categoryBreakdown} />}
            </div>
          </Link>
          <Link to="/analytics" className="h-[420px] rounded-3xl bg-slate-50 p-6 shadow-[0_18px_45px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:shadow-[0_22px_55px_rgba(15,23,42,0.12)]">
            <h3 className="mb-4 font-bold text-slate-800">{tr("월별 지출 추이")}</h3>
            <div className="h-[340px]">
              {spendingTrend && <MonthlySpendingChart trend={spendingTrend} />}
            </div>
          </Link>
        </div>

        {savingsSuggestions && savingsSuggestions.suggestions.length > 0 && (
          <div className="mt-6">
            <SavingsSuggestions
              suggestions={savingsSuggestions.suggestions}
              totalSavings={savingsSuggestions.total_potential_savings_krw}
            />
          </div>
        )}
      </section>
    </div>
  );
}
