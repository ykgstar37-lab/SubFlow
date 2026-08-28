"""사용자에게 나가는 문장을 전부 여기에 모은다.

알림·메일 문구가 notification_service, digest_service, auth_service,
delivery_service 네 곳에 흩어져 있었다. "말투를 좀 바꾸자"는 요청이 오면
네 파일을 뒤져야 했고, 같은 문장이 푸시·앱 알림함·메일 세 군데로 나가는데
어디를 고쳐야 다 바뀌는지도 한눈에 안 보였다.

문장만 여기 두고 로직은 각 서비스에 그대로 남긴다. 여기 있는 값을 고치면
푸시·앱 알림함·메일이 함께 바뀐다.

값이 끼어드는 문장은 함수로, 고정된 문장은 상수로 둔다.
"""

# ── 알림 (푸시 · 앱 알림함 · 메일에 공통으로 쓰인다) ────────────────────

#: 앱 알림함에서 묶이는 분류 이름
NOTIFICATION_CATEGORY = "구독 알림"
#: 해지 페이지를 아는 서비스에만 붙는 버튼
ACTION_CANCEL_GUIDE = "해지 가이드"


def renewal_title(service_name: str, when: str) -> str:
    """when은 renewal_when()이 만든 '오늘' / '내일' / 'N일 뒤'."""
    return f"{service_name} 결제가 {when}예요"


def renewal_when(days: int) -> str:
    return "오늘" if days == 0 else ("내일" if days == 1 else f"{days}일 뒤")


def renewal_body(month: int, day: int, amount: str, share: str = "") -> str:
    return f"{month}월 {day}일 · {amount}{share}"


def renewal_share(personal_amount: str) -> str:
    """여럿이 나눠 내는 구독에만 덧붙는 꼬리말."""
    return f" (내 몫 {personal_amount})"


def trial_title(service_name: str, dday: str) -> str:
    return f"{service_name} 무료체험이 곧 끝나요 ({dday})"


def trial_body(end_date, monthly_krw: int) -> str:
    return f"{end_date} 이후 월 {monthly_krw:,}원이 청구돼요."


def overlap_title(category: str, count: int) -> str:
    return f"'{category}' 카테고리에 구독 {count}개가 겹칩니다"


def overlap_body(services: str, monthly_krw: int) -> str:
    return f"{services} · 월 약 {monthly_krw:,}원. 통합을 고려해보세요."


def price_change_title(service_name: str, went_up: bool) -> str:
    return f"{service_name} 요금이 {'인상' if went_up else '인하'}됐어요"


def price_change_body(plan_name: str, old_price: str, new_price: str, pct: str) -> str:
    return f"{plan_name} · {old_price} → {new_price} ({pct})"


BUDGET_TITLE = "이번 달 예산을 초과했어요"


def budget_body(spending_krw: int, budget_krw: int, percentage: float) -> str:
    return f"지출 {spending_krw:,}원 / 예산 {budget_krw:,}원 ({percentage:.0f}%)"


def fx_title(service_name: str) -> str:
    return f"{service_name} 환율이 올랐어요"


def fx_body(currency: str, change_pct: float, extra_krw: int) -> str:
    return f"{currency} +{change_pct:.1f}% · 월 약 {extra_krw:,}원 더 나가요."


# ── 메일 제목·껍데기 ───────────────────────────────────────────────────

#: 모든 메일 제목 앞에 붙는다
SUBJECT_PREFIX = "[SubFlow]"


def subject(title: str) -> str:
    return f"{SUBJECT_PREFIX} {title}"


#: 메일 본문 아래 버튼
MAIL_CTA = "SubFlow에서 열기"
#: 알림·요약 메일 맨 아래 안내
MAIL_FOOTER_NOTIFICATION = (
    "알림 설정은 앱의 설정 화면에서 바꿀 수 있습니다. 이 주소로는 회신할 수 없습니다."
)
MAIL_FOOTER_DIGEST = "주간 요약 발송은 앱의 알림 설정에서 끌 수 있습니다."

#: 평문 폴백의 머리말·맺음말
MAIL_TEXT_HEADER = "SubFlow 새 알림"
MAIL_TEXT_FOOTER = "앱에서 자세히 확인하세요 — SubFlow"


def mail_multi_heading(count: int) -> str:
    """알림이 여러 건일 때 메일 머리글."""
    return f"새 알림 {count}건"


def push_multi_body(first_title: str, count: int) -> str:
    """푸시는 한 줄뿐이라 첫 건만 보여주고 나머지는 숫자로 줄인다."""
    return f"{first_title} 외 {count - 1}건"


def push_multi_title(count: int) -> str:
    return f"{count}개의 새 알림이 있어요"


# ── 주간 요약 ──────────────────────────────────────────────────────────

DIGEST_TITLE = "이번 주 SubFlow Brief"
DIGEST_PUSH_TITLE = "이번 주 SubFlow Brief 📬"


def digest_unread(count: int) -> str:
    return f"확인하지 않은 알림이 {count}건 있어요."


def digest_unread_item(count: int) -> str:
    return f"확인하지 않은 알림 {count}건"


DIGEST_SAVING_LABEL = "이번 주 절약 제안"
DIGEST_NEWS_LABEL = "관심 소식"


def digest_news(headline: str) -> str:
    return f"관심 소식: {headline}"


# ── 계정 메일 ──────────────────────────────────────────────────────────

VERIFY_SUBJECT = "이메일 주소를 확인해주세요"
VERIFY_CTA = "이메일 주소 확인하기"
VERIFY_ITEM_TITLE = "이메일 주소 확인"
VERIFY_FOOTER = (
    "확인 전에도 SubFlow는 그대로 쓸 수 있습니다. "
    "다만 결제일 알림 메일은 확인 후부터 발송됩니다."
)


def verify_heading(username: str) -> str:
    return f"{username}님, SubFlow 가입을 환영합니다"


def verify_item_body(expire_hours: int) -> str:
    return f"아래 버튼을 누르면 확인이 끝납니다. 링크는 {expire_hours}시간 뒤 만료됩니다."


def verify_text(username: str, link: str, expire_hours: int) -> str:
    return (
        f"{username}님, SubFlow 가입을 환영합니다.\n\n"
        f"아래 링크를 열면 이메일 주소 확인이 끝납니다.\n"
        f"{link}\n\n"
        f"이 링크는 {expire_hours}시간 뒤 만료됩니다.\n"
        f"확인 전에도 SubFlow는 그대로 쓸 수 있지만, 결제일 알림 메일은 "
        f"확인 후부터 발송됩니다.\n"
    )


RESET_SUBJECT = "비밀번호 재설정"
RESET_HEADING = "비밀번호 재설정"
RESET_CTA = "비밀번호 재설정하기"
RESET_FOOTER = "본인이 요청한 게 아니라면 이 메일을 무시하세요. 비밀번호는 그대로입니다."


def reset_item_title(username: str) -> str:
    return f"{username}님, 아래 버튼으로 비밀번호를 새로 정하세요."


def reset_item_body(expire_minutes: int) -> str:
    return f"링크는 {expire_minutes}분 뒤 만료되며 한 번만 쓸 수 있습니다."


def reset_text(username: str, link: str, expire_minutes: int) -> str:
    return (
        f"{username}님,\n\n"
        f"SubFlow 비밀번호를 재설정하려면 아래 링크를 여세요.\n"
        f"{link}\n\n"
        f"이 링크는 {expire_minutes}분 뒤 만료되며, 한 번만 쓸 수 있습니다.\n"
        f"본인이 요청한 게 아니라면 이 메일을 무시하세요. 비밀번호는 그대로입니다.\n"
    )
