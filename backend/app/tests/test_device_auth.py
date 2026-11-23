"""로그인 없는 앱: 기기 계정, 이메일 6자리 코드, 웹 코드 로그인, 계정 합치기."""

import re

import httpx
import pytest

from app.services import auth_service

pytestmark = pytest.mark.asyncio

API = "/api/v1/auth"


@pytest.fixture
def outbox(monkeypatch):
    """보낸 메일을 실제로 보내지 않고 모아 둔다."""
    sent: list[dict] = []

    async def fake_send(to, subject, body, *args, **kwargs):
        sent.append({"to": to, "subject": subject, "body": body})
        return True

    monkeypatch.setattr(auth_service, "send_email", fake_send)
    return sent


def last_code(outbox, email):
    mail = [m for m in outbox if m["to"] == email][-1]
    return re.search(r"\b(\d{6})\b", mail["subject"]).group(1)


def bearer(tokens):
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def new_device(client) -> dict:
    resp = await client.post(f"{API}/device")
    assert resp.status_code == 201, resp.text
    return resp.json()


class TestDevice:
    async def test_device_account_works_without_email(self, test_client: httpx.AsyncClient):
        tokens = await new_device(test_client)
        me = await test_client.get(f"{API}/me", headers=bearer(tokens))
        assert me.status_code == 200
        assert me.json()["email"] is None
        assert me.json()["email_verified"] is False

    async def test_device_refresh_token_keeps_working(self, test_client: httpx.AsyncClient):
        tokens = await new_device(test_client)
        resp = await test_client.post(f"{API}/refresh", json={"refresh_token": tokens["refresh_token"]})
        assert resp.status_code == 200
        assert resp.json()["access_token"]

    async def test_delete_device_account_needs_confirm(self, test_client: httpx.AsyncClient):
        tokens = await new_device(test_client)
        no = await test_client.request("DELETE", f"{API}/me", json={}, headers=bearer(tokens))
        assert no.status_code == 400
        ok = await test_client.request("DELETE", f"{API}/me", json={"confirm": True}, headers=bearer(tokens))
        assert ok.status_code == 200
        gone = await test_client.get(f"{API}/me", headers=bearer(tokens))
        assert gone.status_code == 401


class TestLinkEmail:
    async def test_link_new_email(self, test_client, outbox):
        tokens = await new_device(test_client)
        r = await test_client.post(f"{API}/email/code", json={"email": "New@Example.com"})
        assert r.status_code == 200
        code = last_code(outbox, "new@example.com")

        r = await test_client.post(
            f"{API}/email/link", json={"email": "new@example.com", "code": code}, headers=bearer(tokens)
        )
        assert r.status_code == 200, r.text
        assert r.json()["merged"] is False
        me = (await test_client.get(f"{API}/me", headers=bearer(r.json()))).json()
        assert me["email"] == "new@example.com"
        assert me["email_verified"] is True

    async def test_wrong_code_is_rejected_and_locks_after_attempts(self, test_client, outbox):
        tokens = await new_device(test_client)
        await test_client.post(f"{API}/email/code", json={"email": "lock@example.com"})
        code = last_code(outbox, "lock@example.com")
        wrong = "000000" if code != "000000" else "111111"
        for _ in range(auth_service.CODE_MAX_ATTEMPTS):
            r = await test_client.post(
                f"{API}/email/link", json={"email": "lock@example.com", "code": wrong}, headers=bearer(tokens)
            )
            assert r.status_code == 400
        # 다섯 번 틀린 뒤에는 맞는 코드도 안 된다
        r = await test_client.post(
            f"{API}/email/link", json={"email": "lock@example.com", "code": code}, headers=bearer(tokens)
        )
        assert r.status_code == 400

    async def test_code_is_single_use(self, test_client, outbox):
        await test_client.post(f"{API}/email/code", json={"email": "once@example.com"})
        code = last_code(outbox, "once@example.com")
        first = await test_client.post(f"{API}/email/login", json={"email": "once@example.com", "code": code})
        assert first.status_code == 200
        again = await test_client.post(f"{API}/email/login", json={"email": "once@example.com", "code": code})
        assert again.status_code == 400

    async def test_existing_member_gets_data_back_and_device_data_moves(
        self, test_client, outbox, auth_headers, test_user_data
    ):
        """예전 가입자가 새 앱을 열면 기기 계정으로 시작한다. 가입 이메일 코드를 넣으면
        원래 계정으로 돌아가고, 그사이 기기 계정에 넣은 구독도 따라온다."""
        old_sub = await test_client.post(
            "/api/v1/subscriptions",
            json={"service_name": "예전 구독", "cost": 10000, "billing_cycle": "monthly",
                  "start_date": "2026-01-01", "next_billing_date": "2026-12-01"},
            headers=auth_headers,
        )
        assert old_sub.status_code in (200, 201), old_sub.text

        device = await new_device(test_client)
        new_sub = await test_client.post(
            "/api/v1/subscriptions",
            json={"service_name": "기기에서 넣은 구독", "cost": 5000, "billing_cycle": "monthly",
                  "start_date": "2026-01-01", "next_billing_date": "2026-12-05"},
            headers=bearer(device),
        )
        assert new_sub.status_code in (200, 201), new_sub.text

        email = test_user_data["email"]
        await test_client.post(f"{API}/email/code", json={"email": email})
        r = await test_client.post(
            f"{API}/email/link", json={"email": email, "code": last_code(outbox, email)}, headers=bearer(device)
        )
        assert r.status_code == 200, r.text
        assert r.json()["merged"] is True
        merged = bearer(r.json())

        me = (await test_client.get(f"{API}/me", headers=merged)).json()
        assert me["email"] == email
        subs = (await test_client.get("/api/v1/subscriptions", headers=merged)).json()
        items = subs["items"] if isinstance(subs, dict) and "items" in subs else subs
        names = {s["service_name"] for s in items}
        assert {"예전 구독", "기기에서 넣은 구독"} <= names

        # 기기 계정은 사라졌다
        assert (await test_client.get(f"{API}/me", headers=bearer(device))).status_code == 401

    async def test_cannot_take_email_from_account_that_already_has_one(self, test_client, outbox, auth_headers):
        await test_client.post(f"{API}/email/code", json={"email": "other@example.com"})
        await test_client.post(f"{API}/email/login", json={"email": "other@example.com",
                                                           "code": last_code(outbox, "other@example.com")})
        # testuser(이메일 있음)가 other@example.com을 붙이려 하면 막는다
        await test_client.post(f"{API}/email/code", json={"email": "other@example.com"})
        r = await test_client.post(
            f"{API}/email/link",
            json={"email": "other@example.com", "code": last_code(outbox, "other@example.com")},
            headers=auth_headers,
        )
        assert r.status_code == 409


class TestWebCodeLogin:
    async def test_new_address_creates_account(self, test_client, outbox):
        await test_client.post(f"{API}/email/code", json={"email": "web@example.com"})
        r = await test_client.post(
            f"{API}/email/login", json={"email": "web@example.com", "code": last_code(outbox, "web@example.com")}
        )
        assert r.status_code == 200, r.text
        me = (await test_client.get(f"{API}/me", headers=bearer(r.json()))).json()
        assert me["email"] == "web@example.com"
        assert me["email_verified"] is True

    async def test_existing_member_logs_in_with_code(self, test_client, outbox, auth_headers, test_user_data):
        email = test_user_data["email"]
        before = (await test_client.get(f"{API}/me", headers=auth_headers)).json()
        await test_client.post(f"{API}/email/code", json={"email": email})
        r = await test_client.post(f"{API}/email/login", json={"email": email, "code": last_code(outbox, email)})
        assert r.status_code == 200
        me = (await test_client.get(f"{API}/me", headers=bearer(r.json()))).json()
        assert me["id"] == before["id"]

    async def test_send_code_answers_the_same_for_unknown_address(self, test_client, outbox):
        r = await test_client.post(f"{API}/email/code", json={"email": "nobody@example.com"})
        assert r.status_code == 200


class TestLegacyTokens:
    async def test_old_password_refresh_token_still_works(self, test_client, test_db, test_user_data):
        """업데이트 전부터 로그인해 있던 사람의 토큰(비밀번호 지문 pwf)도 계속 받아 준다."""
        from sqlalchemy import select

        from app.core.security import create_refresh_token, password_fingerprint
        from app.models.user import User

        await test_client.post(f"{API}/register", json=test_user_data)
        user = (await test_db.execute(select(User).where(User.email == test_user_data["email"]))).scalar_one()
        legacy = create_refresh_token({"sub": str(user.id), "pwf": password_fingerprint(user.hashed_password)})

        resp = await test_client.post(f"{API}/refresh", json={"refresh_token": legacy})
        assert resp.status_code == 200, resp.text
