from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.notification_setting import NotificationSetting
from app.models.plan_price_history import PlanPriceHistory
from app.models.subscription import BillingCycle, Subscription, SubscriptionStatus
from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.schemas.analytics import (
    CategoryBreakdown,
    CategoryBreakdownItem,
    CheaperPlanInfo,
    DashboardOverview,
    ExchangeRateAlertItem,
    ExchangeRateAlertResponse,
    MonthlyTotal,
    MostExpensiveInfo,
    NextRenewalInfo,
    OverlapDetectionResponse,
    OverlapItem,
    OverlapService,
    BudgetStatusResponse,
    SavingSuggestionItem,
    SavingsSuggestionsResponse,
    SpendingTrend,
    TrialSubscriptionItem,
    TrialTrackingResponse,
    PriceChangeAlertItem,
    PriceChangeAlertResponse,
)
from app.utils.cost import to_monthly_cost, to_monthly_cost_krw
from app.utils.exchange_rate import get_exchange_rates, to_krw
from app.utils.vat import with_vat
from app.utils.visibility import only_visible_plans, visible_plans


class AnalyticsService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _get_active_subscriptions(self, user_id: UUID) -> list[Subscription]:
        result = await self.db.execute(
            select(Subscription)
            # 해지 주소(Service.cancel_url)까지 읽는다. 안 읽어 두면 나중에
            # 접근하는 순간 async 세션에서 lazy load가 터진다.
            .options(
                selectinload(Subscription.category),
                selectinload(Subscription.service),
            )
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
            )
        )
        return list(result.scalars().all())

    async def get_overview(self, user_id: UUID) -> DashboardOverview:
        subs = await self._get_active_subscriptions(user_id)

        if not subs:
            return DashboardOverview(
                total_active_subscriptions=0,
                total_monthly_cost=Decimal("0"),
                total_yearly_cost=Decimal("0"),
            )

        monthly_krw_list = [await to_monthly_cost_krw(s.personal_cost, s.billing_cycle, s.currency) for s in subs]
        total_monthly = sum(monthly_krw_list, Decimal("0"))
        total_yearly = total_monthly * 12

        today = date.today()
        upcoming = [s for s in subs if s.next_billing_date >= today]
        upcoming.sort(key=lambda s: s.next_billing_date)

        next_renewal = None
        if upcoming:
            s = upcoming[0]
            cost_krw = await to_krw(Decimal(str(s.cost)), s.currency)
            next_renewal = NextRenewalInfo(
                service_name=s.service_name,
                next_billing_date=s.next_billing_date.isoformat(),
                cost=cost_krw,
            )

        monthly_costs = list(zip(subs, monthly_krw_list))
        monthly_costs.sort(key=lambda x: x[1], reverse=True)
        most_expensive = MostExpensiveInfo(
            service_name=monthly_costs[0][0].service_name,
            monthly_cost=monthly_costs[0][1].quantize(Decimal("1")),
        )

        return DashboardOverview(
            total_active_subscriptions=len(subs),
            total_monthly_cost=total_monthly.quantize(Decimal("1")),
            total_yearly_cost=total_yearly.quantize(Decimal("1")),
            next_renewal=next_renewal,
            most_expensive=most_expensive,
        )

    async def get_category_breakdown(self, user_id: UUID, year: int, month: int) -> CategoryBreakdown:
        subs = await self._get_active_subscriptions(user_id)

        # 카테고리별로 total/count + color/icon 메타도 함께 모음
        by_category: dict[str, dict] = defaultdict(
            lambda: {"total": Decimal("0"), "count": 0, "color": None, "icon": None}
        )
        for s in subs:
            cat_name = s.category.name if s.category else "미분류"
            cat_color = s.category.color if s.category else None
            cat_icon = s.category.icon if s.category else None
            monthly = await to_monthly_cost_krw(s.personal_cost, s.billing_cycle, s.currency)
            by_category[cat_name]["total"] += monthly
            by_category[cat_name]["count"] += 1
            # 첫 번째로 발견된 카테고리 메타 보존
            if by_category[cat_name]["color"] is None:
                by_category[cat_name]["color"] = cat_color
                by_category[cat_name]["icon"] = cat_icon

        total = sum((v["total"] for v in by_category.values()), Decimal("0"))
        breakdown = []
        for cat, data in sorted(by_category.items(), key=lambda x: x[1]["total"], reverse=True):
            pct = float(data["total"] / total * 100) if total > 0 else 0.0
            breakdown.append(CategoryBreakdownItem(
                category=cat,
                total=data["total"].quantize(Decimal("1")),
                count=data["count"],
                percentage=round(pct, 1),
                color=data["color"],
                icon=data["icon"],
            ))

        return CategoryBreakdown(
            year=year, month=month, breakdown=breakdown, total=total.quantize(Decimal("1"))
        )

    async def get_spending_trend(self, user_id: UUID, months: int = 6) -> SpendingTrend:
        # Get ALL user subscriptions (active + cancelled + paused + trial) to check start_date
        result = await self.db.execute(
            select(Subscription)
            .where(Subscription.user_id == user_id)
        )
        all_subs = list(result.scalars().all())

        today = date.today()
        data = []

        # Past months + current month
        for i in range(months - 1, -1, -1):
            m = today.month - i
            y = today.year
            while m <= 0:
                m += 12
                y -= 1

            # Only count subscriptions that were active in this month
            # A subscription contributes if: start_date <= end of this month AND (status is active OR it was active during this month)
            month_total = Decimal("0")
            for s in all_subs:
                # Skip if subscription started after this month
                if s.start_date.year > y or (s.start_date.year == y and s.start_date.month > m):
                    continue
                # Skip cancelled subscriptions for future months after cancellation
                if s.status == SubscriptionStatus.CANCELLED:
                    continue
                month_total += await to_monthly_cost_krw(
                    s.personal_cost, s.billing_cycle, s.currency
                )

            data.append(MonthlyTotal(year=y, month=m, total=month_total.quantize(Decimal("1"))))

        # Next month forecast
        next_m = today.month + 1
        next_y = today.year
        if next_m > 12:
            next_m = 1
            next_y += 1

        forecast_total = Decimal("0")
        for s in all_subs:
            if s.status not in (SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIAL):
                continue
            if s.start_date.year > next_y or (s.start_date.year == next_y and s.start_date.month > next_m):
                continue
            forecast_total += await to_monthly_cost_krw(
                s.personal_cost, s.billing_cycle, s.currency
            )

        data.append(MonthlyTotal(year=next_y, month=next_m, total=forecast_total.quantize(Decimal("1")), is_forecast=True))

        return SpendingTrend(data=data)

    async def detect_overlaps(self, user_id: UUID) -> OverlapDetectionResponse:
        subs = await self._get_active_subscriptions(user_id)

        by_category: dict[int, list[Subscription]] = defaultdict(list)
        for s in subs:
            if s.category_id is not None:
                by_category[s.category_id].append(s)

        overlaps: list[OverlapItem] = []
        for cat_id, cat_subs in by_category.items():
            if len(cat_subs) < 2:
                continue

            cat_name = cat_subs[0].category.name if cat_subs[0].category else "미분류"
            cat_icon = cat_subs[0].category.icon if cat_subs[0].category else None
            service_names = [s.service_name for s in cat_subs]

            total_monthly = Decimal("0")
            items: list[OverlapService] = []
            for s in cat_subs:
                monthly_krw = await to_monthly_cost_krw(s.personal_cost, s.billing_cycle, s.currency)
                total_monthly += monthly_krw
                items.append(OverlapService(
                    subscription_id=str(s.id),
                    service_name=s.service_name,
                    monthly_cost_krw=monthly_krw.quantize(Decimal("1")),
                    # 카탈로그에서 담은 구독만 해지 주소를 안다. 직접 등록한
                    # 구독은 None이고, 화면에서는 그 버튼을 감춘다.
                    cancel_url=s.service.cancel_url if s.service else None,
                ))
            # 비싼 것부터 보여준다 — 끊을지 고민할 때 먼저 보게 되는 값이다.
            items.sort(key=lambda x: x.monthly_cost_krw, reverse=True)

            overlaps.append(OverlapItem(
                category=cat_name,
                category_icon=cat_icon,
                services=service_names,
                items=items,
                total_monthly_cost=total_monthly.quantize(Decimal("1")),
                message=f"'{cat_name}' 카테고리에 {len(cat_subs)}개의 구독이 있습니다. 통합을 고려해보세요.",
            ))

        return OverlapDetectionResponse(overlaps=overlaps)

    async def get_exchange_rate_alerts(self, user_id: UUID) -> ExchangeRateAlertResponse:
        result = await self.db.execute(
            select(Subscription).where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.currency != "KRW",
                Subscription.initial_exchange_rate.isnot(None),
            )
        )
        subs = list(result.scalars().all())

        rates = await get_exchange_rates()
        alerts: list[ExchangeRateAlertItem] = []

        for s in subs:
            current_rate = rates.get(s.currency)
            if current_rate is None:
                continue

            initial_rate = Decimal(str(s.initial_exchange_rate))
            change_pct = float((current_rate - initial_rate) / initial_rate * 100)

            if change_pct > 5.0:
                monthly_cost = to_monthly_cost(Decimal(str(s.cost)), s.billing_cycle)
                initial_monthly_krw = (monthly_cost * initial_rate).quantize(Decimal("1"))
                current_monthly_krw = (monthly_cost * current_rate).quantize(Decimal("1"))
                extra_cost = current_monthly_krw - initial_monthly_krw

                alerts.append(ExchangeRateAlertItem(
                    subscription_id=str(s.id),
                    service_name=s.service_name,
                    currency=s.currency,
                    initial_rate=initial_rate,
                    current_rate=current_rate,
                    change_percentage=round(change_pct, 2),
                    initial_monthly_krw=initial_monthly_krw,
                    current_monthly_krw=current_monthly_krw,
                    extra_cost_krw=extra_cost,
                ))

        return ExchangeRateAlertResponse(
            alerts=alerts,
            current_usd_krw=rates.get("USD"),
        )

    async def get_trial_subscriptions(self, user_id: UUID) -> TrialTrackingResponse:
        result = await self.db.execute(
            select(Subscription)
            .options(selectinload(Subscription.category))
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.TRIAL,
            )
        )
        subs = list(result.scalars().all())

        today = date.today()
        trials: list[TrialSubscriptionItem] = []

        for s in subs:
            days_remaining = (s.next_billing_date - today).days
            cost_krw = await to_krw(Decimal(str(s.cost)), s.currency)
            category_name = s.category.name if s.category else None

            trials.append(TrialSubscriptionItem(
                id=str(s.id),
                service_name=s.service_name,
                logo_url=s.logo_url,
                category_name=category_name,
                trial_end_date=s.next_billing_date.isoformat(),
                days_remaining=days_remaining,
                cost_after_trial=Decimal(str(s.cost)),
                currency=s.currency,
                cost_after_trial_krw=cost_krw,
            ))

        trials.sort(key=lambda t: t.days_remaining)

        return TrialTrackingResponse(
            trials=trials,
            total_count=len(trials),
        )

    async def get_savings_suggestions(self, user_id: UUID) -> SavingsSuggestionsResponse:
        result = await self.db.execute(
            select(Subscription)
            .options(
                selectinload(Subscription.service).selectinload(Service.plans),
                selectinload(Subscription.plan),
                only_visible_plans(user_id),
            )
            .where(
                Subscription.user_id == user_id,
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.service_id.isnot(None),
                Subscription.plan_id.isnot(None),
            )
        )
        subs = list(result.scalars().all())

        suggestions: list[SavingSuggestionItem] = []

        for s in subs:
            if not s.plan or not s.service:
                continue

            current_monthly_krw = await to_monthly_cost_krw(
                Decimal(str(s.cost)), s.billing_cycle, s.currency
            )

            cheaper_plans: list[CheaperPlanInfo] = []
            for plan in s.service.plans:
                if not plan.is_active or plan.id == s.plan_id:
                    continue

                # 내 구독 금액은 부가세까지 낸 실결제액이다. 비교 대상도 같은
                # 기준으로 맞춰야 한다 — 정가로 재면 부가세 별도 요금제가
                # 실제로는 안 싼데도 10% 싸 보인다.
                plan_price = with_vat(plan.price, plan.currency, plan.vat_included)
                plan_monthly_krw = await to_monthly_cost_krw(
                    plan_price, plan.billing_cycle, plan.currency
                )

                if plan_monthly_krw < current_monthly_krw:
                    cheaper_plans.append(CheaperPlanInfo(
                        plan_id=plan.id,
                        plan_name=plan.name,
                        price=plan_price,
                        currency=plan.currency,
                        billing_cycle=plan.billing_cycle.value,
                        monthly_cost_krw=plan_monthly_krw.quantize(Decimal("1")),
                    ))

            if cheaper_plans:
                cheaper_plans.sort(key=lambda p: p.monthly_cost_krw)
                max_savings = current_monthly_krw - cheaper_plans[0].monthly_cost_krw

                # 외부 서비스 플랜 관리 페이지 URL (cancel_url이 곧 관리 페이지인 케이스가 다수)
                manage_url = s.service.cancel_url or s.service.website_url

                suggestions.append(SavingSuggestionItem(
                    subscription_id=str(s.id),
                    service_name=s.service_name,
                    logo_url=s.logo_url,
                    current_plan_name=s.plan.name,
                    current_monthly_krw=current_monthly_krw.quantize(Decimal("1")),
                    cheaper_plans=cheaper_plans,
                    max_savings_krw=max_savings.quantize(Decimal("1")),
                    suggestion_text=f"'{s.service_name}'을(를) '{cheaper_plans[0].plan_name}' 플랜으로 변경하면 월 {max_savings.quantize(Decimal('1')):,}원을 절약할 수 있습니다.",
                    action_type="downgrade",
                    action_url=manage_url,
                    target_plan_id=cheaper_plans[0].plan_id,
                ))

        suggestions.sort(key=lambda x: x.max_savings_krw, reverse=True)

        total_potential_savings = sum(
            (sg.max_savings_krw for sg in suggestions), Decimal("0")
        )

        return SavingsSuggestionsResponse(
            suggestions=suggestions,
            total_potential_savings_krw=total_potential_savings,
        )

    async def get_price_change_alerts(self, user_id: UUID) -> PriceChangeAlertResponse:
        """사용자 구독 서비스의 가격 변동을 감지하여 알림을 반환합니다.

        구독 시 기록된 비용과 해당 요금제의 최신 가격 이력을 비교하여
        가격이 변동된 경우 알림을 생성합니다.
        """
        subs = await self._get_active_subscriptions(user_id)
        alerts: list[PriceChangeAlertItem] = []

        for sub in subs:
            if not sub.service_id:
                continue

            # 해당 서비스의 모든 플랜 가격 이력 조회
            result = await self.db.execute(
                select(PlanPriceHistory, ServicePlan.vat_included)
                .join(ServicePlan)
                .where(ServicePlan.service_id == sub.service_id, visible_plans(user_id))
                .order_by(PlanPriceHistory.plan_id, PlanPriceHistory.effective_date)
            )
            rows = result.all()
            if not rows:
                continue

            # plan_id별로 그룹화. 부가세 포함 여부도 함께 들고 있는다 — 구독
            # 금액은 실결제액이라 이력 가격을 같은 기준으로 올려야 매칭된다.
            plan_histories: dict[int, list[PlanPriceHistory]] = {}
            plan_vat: dict[int, bool] = {}
            for h, vat_included in rows:
                plan_histories.setdefault(h.plan_id, []).append(h)
                plan_vat[h.plan_id] = vat_included

            # 사용자의 구독 비용과 가장 가까운 플랜을 매칭
            user_cost = Decimal(str(sub.cost))
            best_plan_id = None
            best_diff = None
            for plan_id, history in plan_histories.items():
                included = plan_vat.get(plan_id, True)
                latest_price = with_vat(history[-1].price, history[-1].currency, included)
                # 현재 가격 또는 과거 가격 중 사용자 비용과 매칭되는 것
                for h in history:
                    if with_vat(h.price, h.currency, included) == user_cost:
                        best_plan_id = plan_id
                        best_diff = Decimal("0")
                        break
                if best_plan_id:
                    break
                diff = abs(latest_price - user_cost)
                if best_diff is None or diff < best_diff:
                    best_diff = diff
                    best_plan_id = plan_id

            if best_plan_id is None:
                continue

            history = plan_histories[best_plan_id]
            if len(history) < 2:
                continue

            prev = history[-2]
            latest = history[-1]
            old_price = Decimal(str(prev.price))
            new_price = Decimal(str(latest.price))

            if old_price == new_price:
                continue

            change_amount = new_price - old_price
            change_pct = float(change_amount / old_price * 100)

            # 플랜 이름 조회
            plan_result = await self.db.execute(
                select(ServicePlan.name).where(ServicePlan.id == best_plan_id)
            )
            plan_name = plan_result.scalar_one_or_none() or "Unknown"

            alerts.append(PriceChangeAlertItem(
                subscription_id=str(sub.id),
                service_name=sub.service_name,
                logo_url=sub.logo_url,
                plan_name=plan_name,
                currency=latest.currency,
                old_price=old_price,
                new_price=new_price,
                change_amount=change_amount,
                change_percentage=round(change_pct, 1),
                effective_date=latest.effective_date.isoformat(),
            ))

        # 인상률 높은 순 정렬
        alerts.sort(key=lambda a: a.change_percentage, reverse=True)
        return PriceChangeAlertResponse(alerts=alerts)

    async def get_budget_status(self, user_id: UUID) -> BudgetStatusResponse:
        # Get current monthly spending (reuse logic from get_overview)
        subs = await self._get_active_subscriptions(user_id)
        monthly_krw_list = [
            await to_monthly_cost_krw(s.personal_cost, s.billing_cycle, s.currency)
            for s in subs
        ]
        current_spending = sum(monthly_krw_list, Decimal("0")).quantize(Decimal("1"))

        # Get budget from notification_settings
        result = await self.db.execute(
            select(NotificationSetting).where(NotificationSetting.user_id == user_id)
        )
        settings = result.scalar_one_or_none()
        budget_monthly = settings.budget_monthly if settings else None

        if budget_monthly is None:
            return BudgetStatusResponse(
                budget_monthly=None,
                current_spending=current_spending,
            )

        budget = Decimal(str(budget_monthly))
        remaining = budget - current_spending
        percentage_used = float(current_spending / budget * 100) if budget > 0 else 0.0
        is_over_budget = current_spending > budget

        return BudgetStatusResponse(
            budget_monthly=budget_monthly,
            current_spending=current_spending,
            remaining=remaining.quantize(Decimal("1")),
            percentage_used=round(percentage_used, 1),
            is_over_budget=is_over_budget,
        )
