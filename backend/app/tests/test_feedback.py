"""오류 신고 엔드포인트(/api/v1/feedback) 테스트.

실제로 메일을 보내면 안 되므로 send_email을 monkeypatch로 가로채고,
그 자리에 넘어온 수신자·제목·본문을 검사한다.
"""

import httpx
import pytest

from app.routers import feedback as feedback_router


@pytest.fixture
def captured_mail(monkeypatch) -> list[dict]:
    """send_email 호출을 가로채 목록에 쌓는다. 발송은 성공한 것으로 친다."""
    sent: list[dict] = []

    async def fake_send_email(to, subject, body, attachments=None, reply_to=None) -> bool:
        sent.append({
            "to": to, "subject": subject, "body": body,
            "attachments": attachments, "reply_to": reply_to,
        })
        return True

    monkeypatch.setattr(feedback_router, "send_email", fake_send_email)
    return sent


async def test_requires_auth(test_client: httpx.AsyncClient):
    """로그인 없이는 신고할 수 없다 (스팸 차단)."""
    resp = await test_client.post("/api/v1/feedback", json={"message": "구독이 안 담겨요"})
    assert resp.status_code == 401


async def test_sends_mail_with_reporter_and_context(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    captured_mail: list[dict],
):
    """본문에 신고 내용, 보낸 사람, 클라이언트가 준 진단 정보가 함께 담긴다."""
    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={
            "type": "bug",
            "message": "구독을 추가하면 금액이 0원으로 저장됩니다",
            "client": {"platform": "android", "version": "1.0.0", "screen": "catalog"},
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"sent": True}

    assert len(captured_mail) == 1
    mail = captured_mail[0]
    assert mail["to"] == "yge0307@gmail.com"
    assert "testuser@example.com" in mail["subject"]
    # 받은 메일에서 바로 답장할 수 있어야 한다
    assert mail["reply_to"] == "testuser@example.com"

    body = mail["body"]
    assert "금액이 0원으로 저장됩니다" in body
    assert "testuser@example.com" in body
    assert "오류 신고" in body
    # 클라이언트가 보낸 진단 정보
    assert "android" in body and "1.0.0" in body and "catalog" in body


async def test_short_message_is_accepted(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    captured_mail: list[dict],
):
    """짧아도 받는다. 길이로 거르면 쓰려는 사람을 문턱에서 막는다."""
    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"message": "음"},
    )
    assert resp.status_code == 200, resp.text
    assert len(captured_mail) == 1


async def test_empty_message_is_rejected(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    captured_mail: list[dict],
):
    """빈 신고는 보낼 것이 없다."""
    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"message": ""},
    )
    assert resp.status_code == 422
    assert captured_mail == []


async def test_client_context_is_capped(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    captured_mail: list[dict],
):
    """client가 아무리 커도 메일 본문이 터지지 않게 잘라 낸다."""
    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={
            "message": "화면이 하얗게 뜹니다",
            "client": {f"key{i}": "x" * 500 for i in range(40)},
        },
    )

    assert resp.status_code == 200
    body = captured_mail[0]["body"]
    assert "x" * 201 not in body          # 값 하나가 200자를 넘지 않는다
    assert body.count("key") <= 12        # 키는 12개까지만


async def test_mail_failure_still_returns_ok(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    monkeypatch,
):
    """메일이 실패해도 200을 준다.

    사용자가 손쓸 수 있는 게 없는데 에러를 띄우면 같은 신고를 반복해 보내게 된다.
    내용은 서버 로그에 남는다.
    """

    async def failing_send_email(to, subject, body, attachments=None, reply_to=None) -> bool:
        return False

    monkeypatch.setattr(feedback_router, "send_email", failing_send_email)

    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={"message": "알림이 두 번씩 옵니다"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"sent": False}


async def test_screenshot_is_attached(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    captured_mail: list[dict],
):
    """첨부한 이미지는 메일 첨부로 실리고, 본문에도 파일명이 남는다."""
    import base64

    png = base64.b64encode(b"fake-image-bytes").decode()
    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={
            "message": "이 화면에서 금액이 겹쳐 보입니다",
            "screenshot": {"filename": "shot.jpg", "content_base64": png},
        },
    )

    assert resp.status_code == 200
    mail = captured_mail[0]
    assert mail["attachments"] == [{"filename": "shot.jpg", "content": png}]
    assert "shot.jpg" in mail["body"]


async def test_broken_screenshot_does_not_block_the_report(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    captured_mail: list[dict],
):
    """base64가 깨져도 신고 자체는 나간다 — 사용자가 쓴 글을 날리면 안 된다."""
    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={
            "message": "첨부가 이상해도 본문은 가야 합니다",
            "screenshot": {"filename": "x.jpg", "content_base64": "!!!not-base64!!!"},
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"sent": True}
    assert captured_mail[0]["attachments"] is None
    assert "본문은 가야 합니다" in captured_mail[0]["body"]


async def test_oversized_screenshot_is_dropped(
    test_client: httpx.AsyncClient,
    auth_headers: dict,
    captured_mail: list[dict],
):
    """상한을 넘는 첨부는 버리고 본문만 보낸다."""
    import base64

    huge = base64.b64encode(b"x" * (5 * 1024 * 1024 + 10)).decode()
    resp = await test_client.post(
        "/api/v1/feedback",
        headers=auth_headers,
        json={
            "message": "큰 이미지를 붙여 봅니다",
            "screenshot": {"filename": "huge.jpg", "content_base64": huge},
        },
    )

    assert resp.status_code == 200
    assert captured_mail[0]["attachments"] is None


# ── 랜딩 문의 (비로그인) ─────────────────────────────────────────────


async def test_contact_works_without_login(
    test_client: httpx.AsyncClient, captured_mail: list[dict]
):
    """가입 전 사람도 문의할 수 있고, 답장 주소는 문의자 주소가 된다."""
    resp = await test_client.post(
        "/api/v1/feedback/contact",
        json={
            "email": "visitor@example.com",
            "name": "방문자",
            "message": "안드로이드 앱은 언제 나오나요?",
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"sent": True}

    mail = captured_mail[0]
    assert mail["to"] == "yge0307@gmail.com"
    assert mail["reply_to"] == "visitor@example.com"
    assert "안드로이드 앱은 언제" in mail["body"]
    assert "방문자" in mail["body"]


async def test_contact_requires_a_valid_email(
    test_client: httpx.AsyncClient, captured_mail: list[dict]
):
    """답장할 주소가 없거나 형식이 틀리면 받지 않는다."""
    resp = await test_client.post(
        "/api/v1/feedback/contact",
        json={"email": "not-an-email", "message": "회신 주소가 이상합니다"},
    )
    assert resp.status_code == 422
    assert captured_mail == []


async def test_contact_drops_honeypot_submissions(
    test_client: httpx.AsyncClient, captured_mail: list[dict]
):
    """사람에게 감춰 둔 칸이 채워져 있으면 봇으로 보고 버린다.

    봇에게는 성공한 것처럼 답한다 — 실패를 알려 주면 우회해서 다시 온다.
    """
    resp = await test_client.post(
        "/api/v1/feedback/contact",
        json={
            "email": "bot@example.com",
            "message": "광고 링크 광고 링크",
            "website": "http://spam.example.com",
        },
    )

    assert resp.status_code == 200
    assert resp.json() == {"sent": True}
    assert captured_mail == []   # 실제로는 나가지 않았다
