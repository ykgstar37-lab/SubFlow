"""카탈로그와 검색 별칭이 어긋나지 않는지 지킨다.

서비스를 새로 넣을 때 별칭을 같이 채우는 걸 잊기 쉽다. 실제로 Railway,
Apple Developer Program, YouTube 채널 멤버십 셋이 별칭 없이 들어가 있었고,
그동안 '레일웨이'나 '유튜브 멤버십'으로는 검색이 되지 않았다.
빠뜨리면 사람이 아니라 이 테스트가 잡는다.
"""

from app.utils.seed_data import DEFAULT_SERVICES
from app.utils.service_aliases import SERVICE_ALIASES, matches


def _catalog_names() -> list[str]:
    return [s["name"] for services in DEFAULT_SERVICES.values() for s in services]


def test_every_catalog_service_has_aliases():
    missing = [n for n in _catalog_names() if not SERVICE_ALIASES.get(n)]
    assert missing == [], f"별칭이 없는 서비스: {missing}"


def test_no_alias_for_unknown_service():
    """카탈로그에서 빠진 서비스의 별칭이 남아 있으면 검색이 없는 항목을 가리킨다."""
    names = set(_catalog_names())
    orphans = [k for k in SERVICE_ALIASES if k not in names]
    assert orphans == [], f"카탈로그에 없는 별칭 키: {orphans}"


def test_korean_query_finds_english_named_service():
    assert matches("Netflix", "넷플릭스")
    assert matches("Melon", "멜론")
    assert matches("Railway", "레일웨이")


def test_youtube_query_finds_both_youtube_services():
    """'유튜브' 하나로 프리미엄과 채널 멤버십이 함께 나와야 한다."""
    for name in ("YouTube Premium", "YouTube 채널 멤버십", "YouTube Music"):
        assert matches(name, "유튜브"), name


def test_search_is_case_insensitive_and_trims():
    assert matches("Netflix", "  NETFLIX ")
    assert matches("Claude Pro", "ANTHROPIC")


def test_empty_query_matches_everything():
    assert matches("Netflix", "   ")
