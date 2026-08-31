"""부가세 처리 (service_plans.vat_included).

카탈로그 가격은 두 종류가 섞여 있다. 국내 소비자가는 총액표시제라 포함가지만,
해외 웹 결제는 별도라 청구서에 10%가 더 붙는다(Claude Pro $20 + tax $2 = $22).
구독을 담을 때 실결제액으로 바꿔 담는지, 그리고 한 번만 붙는지 여기서 본다.
"""

from decimal import Decimal

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.utils.seed_data import seed_services
from app.utils.vat import with_vat


def test_with_vat_leaves_included_prices_alone():
    assert with_vat(Decimal("11900"), "KRW", True) == Decimal("11900")


def test_with_vat_adds_ten_percent_when_excluded():
    # 사용자 실제 청구서: $20 + tax $2 = $22
    assert with_vat(Decimal("20"), "USD", False) == Decimal("22.00")


def test_with_vat_rounds_by_currency():
    # 원화는 소수점이 없고, 외화는 청구서와 같게 둘째 자리까지
    assert with_vat(Decimal("9900"), "KRW", False) == Decimal("10890")
    assert with_vat(Decimal("9.99"), "USD", False) == Decimal("10.99")


async def _catalog_service(db: AsyncSession, *, currency: str, price, vat_included: bool) -> Service:
    svc = Service(name="Claude", is_popular=True)
    db.add(svc)
    await db.flush()
    db.add(ServicePlan(
        service_id=svc.id, name="Pro", price=price,
        currency=currency, vat_included=vat_included,
    ))
    await db.commit()
    await db.refresh(svc)
    return svc


async def _subscribe(client: httpx.AsyncClient, headers: dict, service_id: int, plan_id: int):
    return await client.post(
        "/api/v1/subscriptions/from-catalog",
        json={
            "service_id": service_id,
            "plan_id": plan_id,
            "start_date": "2026-01-01",
            "next_billing_date": "2026-02-01",
        },
        headers=headers,
    )


async def test_vat_excluded_plan_is_stored_with_vat(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    svc = await _catalog_service(test_db, currency="USD", price=20, vat_included=False)
    detail = await test_client.get(f"/api/v1/services/{svc.id}", headers=auth_headers)
    plan = detail.json()["plans"][0]
    assert plan["vat_included"] is False
    # 카탈로그는 정가를 그대로 보여준다 — 공식 가격표와 맞아야 한다
    assert float(plan["price"]) == 20

    sub = await _subscribe(test_client, auth_headers, svc.id, plan["id"])
    assert sub.status_code == 201, sub.text
    assert float(sub.json()["cost"]) == 22


async def test_vat_included_plan_is_stored_as_is(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    svc = await _catalog_service(test_db, currency="KRW", price=11900, vat_included=True)
    detail = await test_client.get(f"/api/v1/services/{svc.id}", headers=auth_headers)
    plan = detail.json()["plans"][0]

    sub = await _subscribe(test_client, auth_headers, svc.id, plan["id"])
    assert float(sub.json()["cost"]) == 11900


async def test_vat_is_not_applied_twice_after_editing_cost(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    """금액을 실제 청구액으로 고쳐도 부가세가 또 붙으면 안 된다.

    담을 때 한 번만 계산하는 이유가 이것이다. 화면에 뿌릴 때마다 계산하면
    사용자가 고친 값 위에 10%가 계속 쌓인다.
    """
    svc = await _catalog_service(test_db, currency="USD", price=20, vat_included=False)
    detail = await test_client.get(f"/api/v1/services/{svc.id}", headers=auth_headers)
    sub = await _subscribe(test_client, auth_headers, svc.id, detail.json()["plans"][0]["id"])
    sub_id = sub.json()["id"]

    edited = await test_client.put(
        f"/api/v1/subscriptions/{sub_id}", json={"cost": 22}, headers=auth_headers
    )
    assert edited.status_code == 200, edited.text
    assert float(edited.json()["cost"]) == 22

    again = await test_client.get(f"/api/v1/subscriptions/{sub_id}", headers=auth_headers)
    assert float(again.json()["cost"]) == 22


async def test_user_entered_plan_defaults_to_vat_included(
    test_client: httpx.AsyncClient, auth_headers: dict, test_db: AsyncSession
):
    """사람이 직접 넣는 금액은 청구서에 찍힌 실결제액이라 그대로 담는다."""
    svc = await _catalog_service(test_db, currency="KRW", price=11900, vat_included=True)

    created = await test_client.post(
        f"/api/v1/services/{svc.id}/plans",
        json={"name": "내 특가", "price": 5500, "currency": "KRW", "billing_cycle": "monthly"},
        headers=auth_headers,
    )
    assert created.status_code == 201, created.text
    assert created.json()["vat_included"] is True

    sub = await _subscribe(test_client, auth_headers, svc.id, created.json()["id"])
    assert float(sub.json()["cost"]) == 5500


async def test_seed_applies_vat_defaults_and_overrides(test_db: AsyncSession):
    """시드 기본값은 통화로 정하되(원화=포함), 요금제 줄에 적은 값이 이긴다.

    통화만 보고 단정하면 안 된다 — 한국 앱스토어 인앱결제가처럼 외화여도
    포함가인 경우가 있어서 예외를 적을 수 있게 만들어 둔 기능이다.
    """
    from app.utils.seed_data import DEFAULT_SERVICES

    await seed_services(test_db)

    # 시드에 적힌 기대값 {(서비스명, 요금제명): vat_included}
    expected = {}
    for services in DEFAULT_SERVICES.values():
        for svc in services:
            for plan in svc.get("plans", []):
                expected[(svc["name"], plan["name"])] = plan.get(
                    "vat_included", plan.get("currency") == "KRW"
                )

    result = await test_db.execute(
        select(Service.name, ServicePlan.name, ServicePlan.vat_included)
        .join(ServicePlan, ServicePlan.service_id == Service.id)
        .where(ServicePlan.user_id.is_(None))
    )
    rows = result.all()
    assert rows, "카탈로그가 비어 있으면 이 테스트는 아무것도 못 본다"

    checked = 0
    for svc_name, plan_name, vat_included in rows:
        want = expected.get((svc_name, plan_name))
        if want is None:
            continue  # 이 테스트가 만든 임시 서비스
        assert vat_included is want, f"{svc_name} / {plan_name}"
        checked += 1
    assert checked > 100, "카탈로그 요금제 대부분을 확인해야 뜻이 있다"
