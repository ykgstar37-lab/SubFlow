"""Tests for the analytics endpoints (/api/v1/analytics)."""

import calendar
from datetime import date, timedelta

import httpx


# ---------------------------------------------------------------------------
# Helper: create a subscription via the API so analytics have data to report
# ---------------------------------------------------------------------------

SUBSCRIPTION_PAYLOAD = {
    "service_name": "Netflix",
    "cost": 13500,
    "currency": "KRW",
    "billing_cycle": "monthly",
    "start_date": str(date.today() - timedelta(days=30)),
    "next_billing_date": str(date.today() + timedelta(days=1)),
}


async def _create_subscription(
    client: httpx.AsyncClient,
    headers: dict,
    **overrides,
) -> dict:
    payload = {**SUBSCRIPTION_PAYLOAD, **overrides}
    resp = await client.post("/api/v1/subscriptions", json=payload, headers=headers)
    assert resp.status_code == 201, f"Failed to create subscription: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


async def test_overview_empty(test_client: httpx.AsyncClient, auth_headers: dict):
    """GET /api/v1/analytics/overview with no subscriptions returns zeros."""
    resp = await test_client.get("/api/v1/analytics/overview", headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["total_active_subscriptions"] == 0
    assert float(data["total_monthly_cost"]) == 0
    assert float(data["total_yearly_cost"]) == 0
    assert data["next_renewal"] is None
    assert data["most_expensive"] is None


async def test_overview_with_data(test_client: httpx.AsyncClient, auth_headers: dict):
    """After creating a subscription the overview should reflect correct totals."""
    await _create_subscription(test_client, auth_headers)

    resp = await test_client.get("/api/v1/analytics/overview", headers=auth_headers)
    assert resp.status_code == 200

    data = resp.json()
    assert data["total_active_subscriptions"] == 1
    assert float(data["total_monthly_cost"]) > 0
    assert float(data["total_yearly_cost"]) > 0
    # Most expensive should be present with a single subscription
    assert data["most_expensive"] is not None
    assert data["most_expensive"]["service_name"] == "Netflix"


async def test_category_breakdown(test_client: httpx.AsyncClient, auth_headers: dict):
    """GET /api/v1/analytics/category-breakdown returns 200."""
    resp = await test_client.get(
        "/api/v1/analytics/category-breakdown", headers=auth_headers
    )
    assert resp.status_code == 200

    data = resp.json()
    assert "breakdown" in data
    assert "total" in data
    assert "year" in data
    assert "month" in data


async def test_spending_trend(test_client: httpx.AsyncClient, auth_headers: dict):
    """GET /api/v1/analytics/spending-trend returns 200 with a list of months."""
    resp = await test_client.get(
        "/api/v1/analytics/spending-trend", headers=auth_headers
    )
    assert resp.status_code == 200

    data = resp.json()
    assert "data" in data
    assert isinstance(data["data"], list)
    # 과거+현재 6개월 + 다음 달 예보(is_forecast) 1개 = 7
    assert len([d for d in data["data"] if not d["is_forecast"]]) == 6
    assert len(data["data"]) == 7
    for item in data["data"]:
        assert "year" in item
        assert "month" in item
        assert "total" in item


# ---------------------------------------------------------------------------
# 예산 = 이번 달 실제 결제액 (연간을 12로 나누지 않는다)
# ---------------------------------------------------------------------------


def _this_month(day: int) -> date:
    """이번 달의 특정 일자. 말일이 짧은 달이면 말일로 당긴다."""
    today = date.today()
    last = calendar.monthrange(today.year, today.month)[1]
    return today.replace(day=min(day, last))


async def test_budget_counts_yearly_charge_in_full_on_its_month(
    test_client: httpx.AsyncClient, auth_headers: dict
):
    """이번 달에 결제가 걸린 연간 구독은 전액이 예산에 잡힌다.

    12로 나누면 정작 돈이 빠져나가는 달에 예산 경고가 안 뜬다.
    """
    billing = _this_month(15)
    await _create_subscription(
        test_client,
        auth_headers,
        service_name="Apple Developer Program",
        cost=129000,
        billing_cycle="yearly",
        start_date=str(billing.replace(year=billing.year - 1)),
        next_billing_date=str(billing),
    )

    resp = await test_client.get("/api/v1/analytics/budget-status", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()

    assert float(data["current_spending"]) == 129000
    # 평균은 여전히 12로 나눈 값이라야 지출 비중·추이가 성립한다
    assert float(data["monthly_average"]) == 10750

    assert len(data["irregular_charges"]) == 1
    item = data["irregular_charges"][0]
    assert item["service_name"] == "Apple Developer Program"
    assert float(item["amount"]) == 129000
    assert item["billing_cycle"] == "yearly"


async def test_budget_excludes_yearly_charge_on_other_months(
    test_client: httpx.AsyncClient, auth_headers: dict
):
    """결제가 없는 달에는 연간 구독이 예산에 잡히지 않는다."""
    next_year = _this_month(15).replace(year=date.today().year + 1) + timedelta(days=40)
    await _create_subscription(
        test_client,
        auth_headers,
        service_name="Apple Developer Program",
        cost=129000,
        billing_cycle="yearly",
        start_date=str(date.today() - timedelta(days=300)),
        next_billing_date=str(next_year),
    )

    resp = await test_client.get("/api/v1/analytics/budget-status", headers=auth_headers)
    data = resp.json()

    assert float(data["current_spending"]) == 0
    assert float(data["monthly_average"]) == 10750
    assert data["irregular_charges"] == []


async def test_budget_counts_monthly_charge_already_paid_this_month(
    test_client: httpx.AsyncClient, auth_headers: dict
):
    """이번 달에 이미 결제돼 다음 결제일이 다음 달로 넘어간 구독도 잡아야 한다."""
    paid = _this_month(3)
    nxt = paid + timedelta(days=31)
    await _create_subscription(
        test_client,
        auth_headers,
        cost=13500,
        billing_cycle="monthly",
        start_date=str(paid - timedelta(days=365)),
        next_billing_date=str(nxt),
    )

    resp = await test_client.get("/api/v1/analytics/budget-status", headers=auth_headers)
    data = resp.json()

    assert float(data["current_spending"]) == 13500
    # 월간은 매달 있는 돈이라 '이번 달만의 사정'으로 안내하지 않는다
    assert data["irregular_charges"] == []


async def test_budget_ignores_charges_before_subscription_started(
    test_client: httpx.AsyncClient, auth_headers: dict
):
    """구독 시작 전 날짜로 역산된 결제는 세지 않는다."""
    start = _this_month(20)
    await _create_subscription(
        test_client,
        auth_headers,
        cost=9900,
        billing_cycle="monthly",
        start_date=str(start),
        next_billing_date=str(start + timedelta(days=31)),
    )

    resp = await test_client.get("/api/v1/analytics/budget-status", headers=auth_headers)
    data = resp.json()

    assert float(data["current_spending"]) == 9900
