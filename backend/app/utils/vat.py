"""부가세를 얹어 실제 결제액을 만든다.

카탈로그 가격은 두 종류가 섞여 있다. 국내 소비자가는 총액표시제라 부가세
포함가지만, 해외 웹 결제는 별도라 청구서에 10%가 더 붙는다(Claude Pro
$20 + tax $2 = $22). 그대로 두면 월 지출 합계가 구조적으로 덜 잡힌다.

계산은 구독을 담을 때 한 번만 한다. 화면에 뿌릴 때마다 계산하면, 사용자가
금액을 실제 청구액으로 고친 뒤에 부가세가 또 붙는다.
"""

from decimal import ROUND_HALF_UP, Decimal

#: 한국 부가가치세율. 해외 사업자도 국내 소비자에게 파는 전자적 용역이면 같다.
VAT_RATE = Decimal("0.1")


def with_vat(price: Decimal | float | int, currency: str, vat_included: bool) -> Decimal:
    """실제 결제되는 금액. 이미 포함가면 그대로 돌려준다.

    원화는 소수점이 없으므로 정수로, 외화는 청구서와 같게 소수 둘째 자리로
    맞춘다($20 → $22.00, ₩26,400 → ₩26,400).
    """
    amount = Decimal(str(price))
    if not vat_included:
        amount = amount * (Decimal("1") + VAT_RATE)
    quantum = Decimal("1") if currency == "KRW" else Decimal("0.01")
    return amount.quantize(quantum, rounding=ROUND_HALF_UP)
