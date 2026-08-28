"""요금제 직접 입력 (/api/v1/services/{id}/plans).

카탈로그 요금제만으로는 실제 요금제를 못 따라간다. 사용자가 카탈로그
서비스에도 자기 요금제를 넣을 수 있고, 그 요금제는 넣은 사람에게만 보인다.
카테고리·서비스와 같은 규칙이라 경계가 새지 않는지 여기서 본다.
"""

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.utils.seed_data import seed_services

OTHER_USER = {
    "email": "planother@example.com",
    "password": "securepassword123",
    "username": "planother",
}


async def _other_headers(client: httpx.AsyncClient) -> dict:
    resp = await client.post("/api/v1/auth/register", json=OTHER_USER)
    assert resp.status_code == 201, resp.text
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": OTHER_USER["email"], "password": OTHER_USER["password"]},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def _catalog_service(db: AsyncSession, name: str = "Melon") -> Service:
    """기본 카탈로그 서비스 한 건 (요금제 하나 포함)."""
    svc = Service(name=name, is_popular=True)
    db.add(svc)
    await db.flush()
    db.add(ServicePlan(service_id=svc.id, name="스트리밍 플러스", price=10900, currency="KRW"))
    await db.commit()
    await db.refresh(svc)
    return svc


def _plan_payload(**overrides) -> dict:
    payload = {
        "name": "모바일 30회 이용권",
        "price": 5500,
        "currency": "KRW",
        "billing_cycle": "monthly",
    }
    payload.update(overrides)
    return payload


async def test_custom_plan_is_invisible_to_others(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    svc = await _catalog_service(test_db)
    other = await _other_headers(test_client)

    created = await test_client.post(
        f"/api/v1/services/{svc.id}/plans", json=_plan_payload(), headers=auth_headers
    )
    assert created.status_code == 201, created.text
    assert created.json()["is_custom"] is True

    mine = await test_client.get(f"/api/v1/services/{svc.id}", headers=auth_headers)
    assert "모바일 30회 이용권" in {p["name"] for p in mine.json()["plans"]}

    theirs = await test_client.get(f"/api/v1/services/{svc.id}", headers=other)
    assert "모바일 30회 이용권" not in {p["name"] for p in theirs.json()["plans"]}
    # 기본 카탈로그 요금제는 둘 다 그대로 본다
    assert "스트리밍 플러스" in {p["name"] for p in theirs.json()["plans"]}


async def test_custom_plan_hidden_from_list_and_search(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    svc = await _catalog_service(test_db)
    other = await _other_headers(test_client)
    await test_client.post(
        f"/api/v1/services/{svc.id}/plans", json=_plan_payload(), headers=auth_headers
    )

    def plan_names(body: list, service_id: int) -> set:
        row = next(s for s in body if s["id"] == service_id)
        return {p["name"] for p in row["plans"]}

    paths = ("/api/v1/services", "/api/v1/services/popular", "/api/v1/services/search?q=Melon")
    for path in paths:
        mine = await test_client.get(path, headers=auth_headers)
        theirs = await test_client.get(path, headers=other)
        assert "모바일 30회 이용권" in plan_names(mine.json(), svc.id), path
        assert "모바일 30회 이용권" not in plan_names(theirs.json(), svc.id), path


async def test_subscribe_with_custom_plan(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    """직접 넣은 요금제로도 구독을 만들 수 있고, 금액·주기가 그대로 온다."""
    svc = await _catalog_service(test_db)
    plan = await test_client.post(
        f"/api/v1/services/{svc.id}/plans",
        json=_plan_payload(price=27000, billing_cycle="yearly"),
        headers=auth_headers,
    )

    sub = await test_client.post(
        "/api/v1/subscriptions/from-catalog",
        json={
            "service_id": svc.id,
            "plan_id": plan.json()["id"],
            "start_date": "2026-01-01",
            "next_billing_date": "2027-01-01",
        },
        headers=auth_headers,
    )
    assert sub.status_code == 201, sub.text
    body = sub.json()
    assert float(body["cost"]) == 27000
    assert body["billing_cycle"] == "yearly"
    # plan_id가 남아야 요금 인상 이력·절약 제안이 이 구독을 알아본다
    assert body["plan_id"] == plan.json()["id"]


async def test_cannot_subscribe_with_someone_elses_custom_plan(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    svc = await _catalog_service(test_db)
    other = await _other_headers(test_client)
    theirs = await test_client.post(
        f"/api/v1/services/{svc.id}/plans", json=_plan_payload(), headers=other
    )

    resp = await test_client.post(
        "/api/v1/subscriptions/from-catalog",
        json={
            "service_id": svc.id,
            "plan_id": theirs.json()["id"],
            "start_date": "2026-01-01",
            "next_billing_date": "2026-02-01",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_duplicate_plan_name_is_rejected(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    svc = await _catalog_service(test_db)

    first = await test_client.post(
        f"/api/v1/services/{svc.id}/plans", json=_plan_payload(), headers=auth_headers
    )
    assert first.status_code == 201
    again = await test_client.post(
        f"/api/v1/services/{svc.id}/plans", json=_plan_payload(), headers=auth_headers
    )
    assert again.status_code == 400

    # 카탈로그 요금제와 같은 이름도 막는다 — 고를 때 구분이 안 된다
    same_as_catalog = await test_client.post(
        f"/api/v1/services/{svc.id}/plans",
        json=_plan_payload(name="스트리밍 플러스"),
        headers=auth_headers,
    )
    assert same_as_catalog.status_code == 400


async def test_plan_on_invisible_service_is_rejected(
    test_client: httpx.AsyncClient, auth_headers: dict
):
    other = await _other_headers(test_client)
    theirs = await test_client.post(
        "/api/v1/services", json={"name": "남의 헬스장"}, headers=other
    )

    resp = await test_client.post(
        f"/api/v1/services/{theirs.json()['id']}/plans",
        json=_plan_payload(),
        headers=auth_headers,
    )
    assert resp.status_code == 404


async def test_cannot_delete_catalog_plan(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    svc = await _catalog_service(test_db)
    result = await test_db.execute(select(ServicePlan).where(ServicePlan.service_id == svc.id))
    catalog_plan = result.scalar_one()

    resp = await test_client.delete(
        f"/api/v1/services/{svc.id}/plans/{catalog_plan.id}", headers=auth_headers
    )
    assert resp.status_code == 404


async def test_delete_custom_plan_keeps_subscription(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    """요금제를 지워도 그 요금제로 등록해 둔 구독은 남는다 (연결만 끊긴다)."""
    svc = await _catalog_service(test_db)
    plan = await test_client.post(
        f"/api/v1/services/{svc.id}/plans", json=_plan_payload(), headers=auth_headers
    )
    plan_id = plan.json()["id"]
    sub = await test_client.post(
        "/api/v1/subscriptions/from-catalog",
        json={
            "service_id": svc.id,
            "plan_id": plan_id,
            "start_date": "2026-01-01",
            "next_billing_date": "2026-02-01",
        },
        headers=auth_headers,
    )
    sub_id = sub.json()["id"]

    deleted = await test_client.delete(
        f"/api/v1/services/{svc.id}/plans/{plan_id}", headers=auth_headers
    )
    assert deleted.status_code == 204

    after = await test_client.get(f"/api/v1/subscriptions/{sub_id}", headers=auth_headers)
    assert after.status_code == 200
    assert after.json()["plan_id"] is None
    assert float(after.json()["cost"]) == 5500


async def test_seeding_does_not_touch_custom_plans(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    """시드를 다시 돌려도 내가 넣은 요금제는 남는다.

    시드는 "시드 목록에 없는 요금제"를 지운다. 사용자 요금제를 카탈로그
    요금제로 착각하면 그 사람 요금제가 통째로 날아간다.
    """
    svc = await _catalog_service(test_db, name="Netflix")
    created = await test_client.post(
        f"/api/v1/services/{svc.id}/plans",
        json=_plan_payload(name="사촌이랑 나눠 쓰는 요금제", price=4250),
        headers=auth_headers,
    )
    plan_id = created.json()["id"]

    await seed_services(test_db)

    still = await test_db.execute(select(ServicePlan).where(ServicePlan.id == plan_id))
    assert still.scalar_one_or_none() is not None


async def test_account_deletion_removes_custom_plans(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    """카탈로그 서비스에 넣어 둔 요금제도 users.id를 참조한다 — 남으면 탈퇴가 막힌다."""
    svc = await _catalog_service(test_db)
    created = await test_client.post(
        f"/api/v1/services/{svc.id}/plans", json=_plan_payload(), headers=auth_headers
    )
    plan_id = created.json()["id"]

    resp = await test_client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"password": "securepassword123"},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text

    gone = await test_db.execute(select(ServicePlan).where(ServicePlan.id == plan_id))
    assert gone.scalar_one_or_none() is None
    # 기본 카탈로그 요금제는 그대로 남아야 한다
    kept = await test_db.execute(
        select(ServicePlan).where(
            ServicePlan.service_id == svc.id, ServicePlan.user_id.is_(None)
        )
    )
    assert kept.scalar_one_or_none() is not None
