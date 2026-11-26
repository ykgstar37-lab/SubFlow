"""결제 주기·통화가 섞인 구독 비용을 '월 단위 KRW'라는 하나의 기준으로 맞춘다.

대시보드 총액과 개별 구독 금액이 같은 기준이어야 지출 비중 같은 비율 계산이
성립한다. 서비스마다 따로 환산하면 어긋나기 쉬워서 여기 한 곳에 모아 둔다.
"""

from decimal import Decimal

from app.models.subscription import BillingCycle
from app.utils.exchange_rate import to_krw


def to_monthly_cost(cost: Decimal, cycle: BillingCycle) -> Decimal:
    """결제 주기가 어떻든 한 달치로 환산한다."""
    match cycle:
        case BillingCycle.WEEKLY:
            return cost * Decimal("4.33")
        case BillingCycle.MONTHLY:
            return cost
        case BillingCycle.QUARTERLY:
            return cost / 3
        case BillingCycle.YEARLY:
            return cost / 12


async def to_monthly_cost_krw(cost: Decimal, cycle: BillingCycle, currency: str) -> Decimal:
    """Convert cost to monthly KRW amount."""
    monthly = to_monthly_cost(cost, cycle)
    return await to_krw(monthly, currency)


async def sub_charge_krw(sub, personal: bool = True) -> Decimal:
    """구독 1회 결제액을 원화로. 사용자가 넣은 실제 결제 원화 금액이 있으면 그것을 쓴다.

    personal=True면 분담 인원을 나눈 내 몫, False면 카드에 찍히는 전체 금액.
    """
    paid = sub.personal_paid_krw if personal else (
        None if sub.paid_krw is None or sub.currency == "KRW" else Decimal(str(sub.paid_krw))
    )
    if paid is not None:
        return paid
    cost = sub.personal_cost if personal else Decimal(str(sub.cost))
    return await to_krw(cost, sub.currency)


async def sub_monthly_krw(sub, personal: bool = True) -> Decimal:
    """구독 비용을 월 단위 원화로. 실제 결제 원화 금액이 있으면 환율 대신 그것을 쓴다."""
    return to_monthly_cost(await sub_charge_krw(sub, personal), sub.billing_cycle)
