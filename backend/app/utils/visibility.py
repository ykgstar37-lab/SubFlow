"""기본 카탈로그와 사용자 소유 항목을 가르는 조건을 한곳에 모은 곳.

카테고리·서비스·요금제 모두 규칙이 같다 — user_id가 NULL이면 모두가 보는
기본 카탈로그, 값이 있으면 그 사람만 보는 항목이다. 조건을 쿼리마다 다시
쓰면 한 군데만 빠져도 남의 요금제가 남에게 보이므로 여기서 가져다 쓴다.
"""
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import with_loader_criteria

from app.models.service import Service
from app.models.service_plan import ServicePlan


def visible_services(user_id: UUID):
    """WHERE 절에 그대로 넣는 서비스 가시성 조건."""
    return or_(Service.user_id.is_(None), Service.user_id == user_id)


def visible_plans(user_id: UUID):
    """WHERE 절에 그대로 넣는 요금제 가시성 조건."""
    return or_(ServicePlan.user_id.is_(None), ServicePlan.user_id == user_id)


def only_visible_plans(user_id: UUID):
    """Service.plans를 함께 읽어 올 때 남의 요금제를 빼는 로딩 조건."""
    return with_loader_criteria(ServicePlan, visible_plans(user_id))


def my_plans(service: Service, user_id: UUID) -> list[ServicePlan]:
    """이미 읽어 온 service.plans에서 내가 볼 수 있는 것만 고른다.

    로딩 조건(only_visible_plans)만 믿으면, 세션에 이미 올라와 있는 서비스는
    관계를 다시 읽지 않아 남의 요금제가 그대로 남을 수 있다. 응답을 만들 때
    한 번 더 거른다. 관계 자체를 바꿔치기하면(service.plans = [...])
    delete-orphan cascade가 걸러 낸 요금제를 지워 버리므로 새 리스트로 돌려준다.
    """
    return [p for p in service.plans if p.user_id is None or p.user_id == user_id]
