"""Tests for subscription endpoints (/api/v1/subscriptions)."""

from datetime import date, timedelta

import pytest
import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.models.subscription import BillingCycle


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _manual_subscription_payload() -> dict:
    """Return a valid payload for manual subscription creation."""
    today = date.today()
    return {
        "service_name": "Test Service",
        "description": "A manually created test subscription",
        "cost": "9.99",
        "currency": "USD",
        "billing_cycle": "monthly",
        "start_date": today.isoformat(),
        "next_billing_date": (today + timedelta(days=30)).isoformat(),
        "status": "active",
        "auto_renew": True,
        "notes": "test note",
    }


async def _create_subscription(
    client: httpx.AsyncClient,
    headers: dict,
    payload: dict | None = None,
) -> dict:
    """Helper to create a subscription and return its JSON response."""
    if payload is None:
        payload = _manual_subscription_payload()
    resp = await client.post(
        "/api/v1/subscriptions",
        json=payload,
        headers=headers,
    )
    assert resp.status_code == 201, f"Create failed: {resp.text}"
    return resp.json()


# ---------------------------------------------------------------------------
# Tests — manual CRUD
# ---------------------------------------------------------------------------


class TestCreateSubscription:
    async def test_create_subscription(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        payload = _manual_subscription_payload()
        resp = await test_client.post(
            "/api/v1/subscriptions",
            json=payload,
            headers=auth_headers,
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["service_name"] == payload["service_name"]
        assert data["cost"] == payload["cost"]
        assert data["currency"] == payload["currency"]
        assert data["billing_cycle"] == payload["billing_cycle"]
        assert data["status"] == "active"
        assert "id" in data
        assert "user_id" in data


class TestListSubscriptions:
    async def test_list_subscriptions(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        # Create two subscriptions
        await _create_subscription(test_client, auth_headers)
        payload2 = _manual_subscription_payload()
        payload2["service_name"] = "Second Service"
        await _create_subscription(test_client, auth_headers, payload2)

        resp = await test_client.get(
            "/api/v1/subscriptions",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 2


class TestGetSubscription:
    async def test_get_subscription(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        created = await _create_subscription(test_client, auth_headers)
        sub_id = created["id"]

        resp = await test_client.get(
            f"/api/v1/subscriptions/{sub_id}",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == sub_id
        assert data["service_name"] == created["service_name"]


class TestUpdateSubscription:
    async def test_update_subscription(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        created = await _create_subscription(test_client, auth_headers)
        sub_id = created["id"]

        update_payload = {
            "service_name": "Updated Service Name",
            "cost": "19.99",
        }
        resp = await test_client.put(
            f"/api/v1/subscriptions/{sub_id}",
            json=update_payload,
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert data["service_name"] == "Updated Service Name"
        assert data["cost"] == "19.99"


class TestRentalFields:
    async def test_rental_item_and_contract_round_trip(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        """기기 종류·약정 종료일을 담고, 바꾸고, null로 지울 수 있다."""
        payload = _manual_subscription_payload() | {
            "service_name": "코웨이",
            "currency": "KRW",
            "cost": "29900",
            "rental_item": "정수기",
            "rental_item_icon": "💧",
            "contract_end_date": (date.today() + timedelta(days=1000)).isoformat(),
        }
        created = await _create_subscription(test_client, auth_headers, payload)
        assert created["rental_item"] == "정수기"
        assert created["rental_item_icon"] == "💧"
        assert created["contract_end_date"] == payload["contract_end_date"]

        # 목록에 없는 기기는 사용자가 이름·아이콘을 직접 정한다
        resp = await test_client.put(
            f"/api/v1/subscriptions/{created['id']}",
            json={"rental_item": "커피머신", "rental_item_icon": "☕"},
            headers=auth_headers,
        )
        assert resp.json()["rental_item"] == "커피머신"
        # 안 보낸 약정은 그대로다
        assert resp.json()["contract_end_date"] == payload["contract_end_date"]

        resp = await test_client.put(
            f"/api/v1/subscriptions/{created['id']}",
            json={"rental_item": None, "rental_item_icon": None, "contract_end_date": None},
            headers=auth_headers,
        )
        data = resp.json()
        assert data["rental_item"] is None
        assert data["contract_end_date"] is None


class TestPaidKrw:
    async def test_paid_krw_set_used_and_cleared(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        """외화 구독에 실제 결제 원화를 넣으면 월 환산이 그 값을 따르고, 금액이 바뀌면 지워진다."""
        created = await _create_subscription(test_client, auth_headers)  # $9.99 월간
        url = f"/api/v1/subscriptions/{created['id']}"
        assert created["paid_krw"] is None

        resp = await test_client.put(url, json={"paid_krw": "14650"}, headers=auth_headers)
        data = resp.json()
        assert resp.status_code == 200
        assert data["paid_krw"] == "14650"
        assert data["monthly_cost_krw"] == "14650"

        # 캘린더(위젯)에도 실린다
        ev = (await test_client.get("/api/v1/subscriptions/calendar-events", headers=auth_headers)).json()
        assert any(e["paid_krw"] == "14650" for e in ev["events"])

        # 금액이 바뀌면 예전 실제 결제액은 맞지 않으므로 지운다
        resp = await test_client.put(url, json={"cost": "12.99"}, headers=auth_headers)
        assert resp.json()["paid_krw"] is None

        # null로 직접 되돌릴 수도 있다
        await test_client.put(url, json={"paid_krw": "15000"}, headers=auth_headers)
        resp = await test_client.put(url, json={"paid_krw": None}, headers=auth_headers)
        assert resp.json()["paid_krw"] is None

    async def test_paid_krw_ignored_for_krw(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        payload = _manual_subscription_payload() | {"currency": "KRW", "cost": "10000"}
        created = await _create_subscription(test_client, auth_headers, payload)
        resp = await test_client.put(
            f"/api/v1/subscriptions/{created['id']}", json={"paid_krw": "12000"}, headers=auth_headers
        )
        assert resp.json()["paid_krw"] is None


class TestDeleteSubscription:
    async def test_delete_subscription(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        created = await _create_subscription(test_client, auth_headers)
        sub_id = created["id"]

        resp = await test_client.delete(
            f"/api/v1/subscriptions/{sub_id}",
            headers=auth_headers,
        )

        assert resp.status_code == 204

        # Confirm it no longer exists
        get_resp = await test_client.get(
            f"/api/v1/subscriptions/{sub_id}",
            headers=auth_headers,
        )
        assert get_resp.status_code == 404


# ---------------------------------------------------------------------------
# Tests — catalog-based creation
# ---------------------------------------------------------------------------


class TestCreateFromCatalog:
    async def test_create_from_catalog(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
        test_db: AsyncSession,
    ):
        # Seed a Category, Service, and ServicePlan directly in the test DB
        category = Category(name="Streaming", icon="tv", color="#FF0000")
        test_db.add(category)
        await test_db.flush()

        service = Service(
            name="Netflix",
            description="Streaming platform",
            category_id=category.id,
            logo_url="https://example.com/netflix.png",
            website_url="https://netflix.com",
            is_popular=True,
        )
        test_db.add(service)
        await test_db.flush()

        plan = ServicePlan(
            service_id=service.id,
            name="Premium",
            price=17.99,
            currency="USD",
            billing_cycle=BillingCycle.MONTHLY,
            description="4K + 4 screens",
            is_active=True,
        )
        test_db.add(plan)
        await test_db.commit()

        today = date.today()
        payload = {
            "service_id": service.id,
            "plan_id": plan.id,
            "start_date": today.isoformat(),
            "next_billing_date": (today + timedelta(days=30)).isoformat(),
            "status": "active",
            "auto_renew": True,
            "notes": "Created from catalog",
        }

        resp = await test_client.post(
            "/api/v1/subscriptions/from-catalog",
            json=payload,
            headers=auth_headers,
        )

        assert resp.status_code == 201
        data = resp.json()
        assert data["service_name"] == "Netflix"
        assert data["cost"] == "17.99"
        assert data["currency"] == "USD"
        assert data["billing_cycle"] == "monthly"
        assert data["service_id"] == service.id
        assert data["plan_id"] == plan.id
        assert data["category_id"] == category.id


# ---------------------------------------------------------------------------
# Tests — upcoming subscriptions
# ---------------------------------------------------------------------------


class TestUpcomingSubscriptions:
    async def test_get_upcoming(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        today = date.today()

        # Subscription billing in 3 days — should appear
        soon_payload = _manual_subscription_payload()
        soon_payload["service_name"] = "Soon Service"
        soon_payload["next_billing_date"] = (today + timedelta(days=3)).isoformat()
        soon_payload["status"] = "active"
        await _create_subscription(test_client, auth_headers, soon_payload)

        # Subscription billing in 30 days — should NOT appear (default window is 7 days)
        far_payload = _manual_subscription_payload()
        far_payload["service_name"] = "Far Service"
        far_payload["next_billing_date"] = (today + timedelta(days=30)).isoformat()
        far_payload["status"] = "active"
        await _create_subscription(test_client, auth_headers, far_payload)

        resp = await test_client.get(
            "/api/v1/subscriptions/upcoming",
            headers=auth_headers,
        )

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Only the "soon" subscription should be in the 7-day window
        service_names = [s["service_name"] for s in data]
        assert "Soon Service" in service_names
        assert "Far Service" not in service_names


class TestCalendarEvents:
    async def test_upcoming_events_cover_next_12_months(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        """다음 결제일부터 한 달씩 12개월 앞까지 예정 결제가 나온다."""
        today = date.today()
        next_date = today + timedelta(days=2)
        payload = _manual_subscription_payload()
        payload["start_date"] = (today - timedelta(days=28)).isoformat()
        payload["next_billing_date"] = next_date.isoformat()
        sub = await _create_subscription(test_client, auth_headers, payload)

        resp = await test_client.get(
            "/api/v1/subscriptions/calendar-events", headers=auth_headers
        )
        assert resp.status_code == 200
        upcoming = [
            e["date"]
            for e in resp.json()["events"]
            if e["subscription_id"] == sub["id"] and not e["is_past"]
        ]
        assert upcoming[0] == next_date.isoformat()
        assert len(upcoming) >= 12
        assert all(d > today.isoformat() for d in upcoming)

    async def test_non_recurring_shows_only_next_date(
        self,
        test_client: httpx.AsyncClient,
        auth_headers: dict,
    ):
        today = date.today()
        payload = _manual_subscription_payload()
        payload["is_recurring"] = False
        sub = await _create_subscription(test_client, auth_headers, payload)

        resp = await test_client.get(
            "/api/v1/subscriptions/calendar-events", headers=auth_headers
        )
        upcoming = [
            e for e in resp.json()["events"]
            if e["subscription_id"] == sub["id"] and not e["is_past"]
        ]
        assert len(upcoming) == 1
        assert upcoming[0]["date"] == (today + timedelta(days=30)).isoformat()
