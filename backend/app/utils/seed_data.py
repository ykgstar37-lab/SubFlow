from datetime import date

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.plan_price_history import PlanPriceHistory
from app.models.service import Service
from app.models.service_plan import ServicePlan
from app.models.subscription import Subscription

DEFAULT_CATEGORIES = [
    {"name": "Entertainment", "icon": "🎬", "color": "#E50914", "is_default": True},
    {"name": "Music", "icon": "🎵", "color": "#1DB954", "is_default": True},
    {"name": "Photo & Video", "icon": "📸", "color": "#E1306C", "is_default": True},
    # AI 도구는 개발자만 쓰는 게 아니다. Developer Tools 안에 있으면 GPT·클로드를
    # 찾는 사람이 개발자 메뉴를 뒤져야 한다.
    {"name": "AI", "icon": "✨", "color": "#C96442", "is_default": True},
    {"name": "Developer Tools", "icon": "💻", "color": "#6E40C9", "is_default": True},
    {"name": "Cloud/Infrastructure", "icon": "☁️", "color": "#FF9900", "is_default": True},
    {"name": "Productivity", "icon": "📋", "color": "#4285F4", "is_default": True},
    {"name": "Education", "icon": "🎓", "color": "#00BFA5", "is_default": True},
    {"name": "Books", "icon": "📚", "color": "#8B5E3C", "is_default": True},
    {"name": "Health & Fitness", "icon": "💪", "color": "#FF6B6B", "is_default": True},
    {"name": "News & Media", "icon": "📰", "color": "#1A1A2E", "is_default": True},
    {"name": "Gaming", "icon": "🎮", "color": "#107C10", "is_default": True},
    {"name": "Storage", "icon": "💾", "color": "#0078D4", "is_default": True},
    {"name": "Security & VPN", "icon": "🔒", "color": "#4A90D9", "is_default": True},
    {"name": "Lifestyle", "icon": "🛍️", "color": "#FF6F61", "is_default": True},
]

# category_name -> list of services
DEFAULT_SERVICES = {
    "Entertainment": [
        {
            "name": "Netflix",
            "description": "영화, 드라마, 다큐멘터리 등 다양한 콘텐츠를 제공하는 글로벌 OTT 서비스",
            "website_url": "https://www.netflix.com",
            "cancel_url": "https://www.netflix.com/cancelplan",
            "logo_url": "/logos/netflix.png",
            "is_popular": True,
            "plans": [
                {"name": "광고형 스탠다드", "price": 7000, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "스탠다드", "price": 13500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "프리미엄", "price": 17000, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            # 요금제를 넣지 않는다 — 채널마다, 티어마다 값이 다르다.
            # 구독 중인 채널을 '요금제 직접 입력'으로 넣어 쓰는 것이 이 항목의 용도다.
            "name": "YouTube 채널 멤버십",
            "description": "개인 채널 멤버십. 가격은 채널·티어마다 달라 직접 넣어 씁니다",
            "website_url": "https://www.youtube.com/paid_memberships",
            "cancel_url": "https://www.youtube.com/paid_memberships",
            "logo_url": "/logos/youtube.png",
            "is_popular": False,
            "plans": [],
        },
        {
            "name": "YouTube Premium",
            "description": "광고 없는 유튜브, YouTube Music, 오프라인 저장 등",
            "website_url": "https://www.youtube.com/premium",
            "cancel_url": "https://myaccount.google.com/subscriptions",
            "logo_url": "/logos/youtube.png",
            "is_popular": True,
            "plans": [
                {"name": "Lite", "price": 8500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "개인", "price": 14900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "가족", "price": 23900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Disney+",
            "description": "디즈니, 마블, 스타워즈, 픽사 등 콘텐츠 스트리밍 서비스",
            "website_url": "https://www.disneyplus.com",
            "cancel_url": "https://www.disneyplus.com/account/subscription",
            "logo_url": "/logos/disneyplus.png",
            "is_popular": True,
            "plans": [
                {"name": "스탠다드", "price": 9900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "프리미엄", "price": 13900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Wavve",
            "description": "KBS, MBC, SBS 콘텐츠를 제공하는 국내 OTT 서비스",
            "website_url": "https://www.wavve.com",
            "cancel_url": "https://www.wavve.com/my/subscription",
            "logo_url": "/logos/wavve.png",
            "is_popular": True,
            "plans": [
                {"name": "베이직", "price": 7900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "스탠다드", "price": 10900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "프리미엄", "price": 13900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Tving",
            "description": "CJ ENM 콘텐츠를 중심으로 한 국내 OTT 서비스",
            "website_url": "https://www.tving.com",
            "cancel_url": "https://www.tving.com/my/membership",
            "logo_url": "/logos/tving.png",
            "is_popular": True,
            "plans": [
                {"name": "광고형 스탠다드", "price": 5500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "베이직", "price": 9500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "스탠다드", "price": 13500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "프리미엄", "price": 17000, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Watcha",
            "description": "영화, 드라마, 애니메이션 등을 제공하는 국내 OTT 서비스",
            "website_url": "https://www.watcha.com",
            "cancel_url": "https://www.watcha.com/settings/account",
            "logo_url": "/logos/watcha.png",
            "is_popular": False,
            "plans": [
                {"name": "베이직", "price": 7900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "프리미엄", "price": 12900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Apple TV+",
            "description": "Apple 오리지널 콘텐츠를 제공하는 스트리밍 서비스",
            "website_url": "https://tv.apple.com",
            "cancel_url": "https://support.apple.com/ko-kr/118428",
            "logo_url": "/logos/appletv.png",
            "is_popular": False,
            "plans": [
                {"name": "개인", "price": 6500, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Coupang Play",
            "description": "쿠팡 로켓와우 회원을 위한 OTT 서비스",
            "website_url": "https://www.coupangplay.com",
            "cancel_url": "https://www.coupang.com/np/coupangPlay/membership",
            "logo_url": "/logos/coupangplay.png",
            "is_popular": True,
            "plans": [
                {"name": "개인", "price": 7890, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Amazon Prime Video",
            "description": "아마존 오리지널 및 다양한 영화, 드라마를 제공하는 글로벌 OTT",
            "website_url": "https://www.primevideo.com",
            "logo_url": "/logos/primevideo.png",
            "is_popular": True,
            "plans": [
                {"name": "개인", "price": 5900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Laftel",
            "description": "일본 애니메이션 전문 스트리밍 서비스",
            "website_url": "https://laftel.net",
            "logo_url": "/logos/laftel.png",
            "is_popular": False,
            "plans": [
                {"name": "프리미엄", "price": 8500, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Paramount+",
            "description": "파라마운트 영화, CBS 드라마 등 콘텐츠 스트리밍 서비스",
            "website_url": "https://www.paramountplus.com",
            "logo_url": "/logos/paramount.png",
            "is_popular": False,
            "plans": [
                {"name": "Essential", "price": 7.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "With SHOWTIME", "price": 12.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Music": [
        {
            "name": "Spotify",
            "description": "전 세계 최대 음악 스트리밍 서비스",
            "website_url": "https://www.spotify.com",
            "cancel_url": "https://www.spotify.com/account/subscription/",
            "logo_url": "/logos/spotify.png",
            "is_popular": True,
            "plans": [
                {"name": "베이직", "price": 8690, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "개인", "price": 11990, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "듀오", "price": 17985, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "가족", "price": 16900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "학생", "price": 6600, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Apple Music",
            "description": "Apple의 음악 스트리밍 서비스",
            "website_url": "https://music.apple.com",
            "cancel_url": "https://support.apple.com/ko-kr/118428",
            "logo_url": "/logos/applemusic.png",
            "is_popular": True,
            "plans": [
                {"name": "개인", "price": 8900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "가족", "price": 13500, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Melon",
            "description": "국내 최대 음악 스트리밍 서비스",
            "website_url": "https://www.melon.com",
            "cancel_url": "https://www.melon.com/mymusic/ticket/mymusicticket_listInfo.htm",
            "logo_url": "/logos/melon.png",
            "is_popular": True,
            "plans": [
                {"name": "모바일 스트리밍", "price": 7590, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "스트리밍", "price": 8690, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "스트리밍 플러스", "price": 11990, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "패밀리", "price": 14000, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Genie Music",
            "description": "KT에서 운영하는 음악 스트리밍 서비스",
            "website_url": "https://www.genie.co.kr",
            "logo_url": "/logos/genie.png",
            "is_popular": False,
            "plans": [
                {"name": "개인", "price": 8500, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "FLO",
            "description": "SKT에서 운영하는 음악 스트리밍 서비스",
            "website_url": "https://www.music-flo.com",
            "logo_url": "/logos/flo.png",
            "is_popular": False,
            "plans": [
                {"name": "개인", "price": 10900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "YouTube Music",
            "description": "YouTube 기반 음악 스트리밍 서비스",
            "website_url": "https://music.youtube.com",
            "cancel_url": "https://myaccount.google.com/subscriptions",
            "logo_url": "/logos/youtubemusic.png",
            "is_popular": True,
            "plans": [
                {"name": "개인", "price": 10900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "가족", "price": 16900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "VIBE",
            "description": "네이버에서 운영하는 AI 추천 음악 스트리밍 서비스",
            "website_url": "https://vibe.naver.com",
            "logo_url": "/logos/vibe.png",
            "is_popular": False,
            "plans": [
                {"name": "개인", "price": 10900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Bugs",
            "description": "NHN 벅스에서 운영하는 음악 스트리밍 서비스",
            "website_url": "https://www.bugs.co.kr",
            "logo_url": "/logos/bugs.png",
            "is_popular": False,
            "plans": [
                {"name": "무제한 듣기", "price": 8500, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Tidal",
            "description": "고음질(HiFi/MQA) 전문 음악 스트리밍 서비스",
            "website_url": "https://tidal.com",
            "logo_url": "/logos/tidal.png",
            "is_popular": False,
            "plans": [
                {"name": "HiFi", "price": 10.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "HiFi Plus", "price": 19.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    # 사진·영상 편집. Adobe CC와 Canva는 Productivity에 있지만, 캡컷·스노우처럼
    # 편집 자체가 목적인 앱들은 성격이 달라 따로 묶는다.
    "Photo & Video": [
        {
            "name": "CapCut Pro",
            "description": "숏폼 영상 편집기. 프로 전용 효과와 100GB 클라우드",
            "logo_url": "/logos/capcut.png",
            "website_url": "https://www.capcut.com/ko-kr",
            "is_popular": True,
            "plans": [
                # 한국 앱스토어 인앱결제 기준
                {"name": "Standard 월간", "price": 9900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Pro 월간", "price": 19800, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "연간", "price": 89000, "currency": "KRW", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "SNOW VIP",
            "description": "AI 프로필과 보정 필터를 무제한으로 쓰는 카메라 앱 구독",
            "logo_url": "/logos/snow.png",
            "website_url": "https://snow.me",
            "is_popular": True,
            "plans": [
                # 통신사 제휴가(유독 4,000원 등)나 선물하기가는 더 싸다. 여기는 정가.
                {"name": "VIP 월간", "price": 11900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "VIP 연간", "price": 46000, "currency": "KRW", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "VLLO",
            "description": "쉬운 모바일 영상 편집기. 광고 제거와 프리미엄 템플릿",
            "logo_url": "/logos/vllo.png",
            "website_url": "https://www.vllo.io",
            "is_popular": True,
            "plans": [
                # 한국 앱스토어 인앱결제 기준. 평생 이용권(45,000원)은 구독이
                # 아니라 일회성 구매라 카탈로그에 싣지 않는다.
                {"name": "주간 PLUS", "price": 2900, "currency": "KRW", "billing_cycle": "WEEKLY"},
                {"name": "월간 프리미엄", "price": 4900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "월간 PLUS", "price": 6900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "연간 프리미엄", "price": 15000, "currency": "KRW", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "KineMaster Premium",
            "description": "모바일 영상 편집기. 워터마크 제거와 프리미엄 에셋",
            "logo_url": "/logos/kinemaster.png",
            "website_url": "https://www.kinemaster.com/ko",
            "is_popular": False,
            "plans": [
                {"name": "월간", "price": 8900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "연간", "price": 59000, "currency": "KRW", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "Vrew",
            "description": "AI 자막·편집 도구. 음성 인식으로 영상을 글처럼 자른다",
            "logo_url": "/logos/vrew.png",
            "website_url": "https://vrew.ai/ko",
            "cancel_url": "https://vrew.ai/ko/my",
            "is_popular": False,
            "plans": [
                # 2026-04 통합 크레딧제로 개편됐다. Light 기준가만 싣는다.
                {"name": "Light", "price": 14900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Adobe Lightroom",
            "description": "사진 보정·관리. 1TB 클라우드 포함 단일 앱 플랜",
            "logo_url": "/logos/lightroom.png",
            "website_url": "https://www.adobe.com/kr/products/photoshop-lightroom.html",
            "cancel_url": "https://account.adobe.com/plans",
            "is_popular": True,
            "plans": [
                {"name": "Lightroom (1TB)", "price": 13200, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Picsart Pro",
            "description": "사진·영상 편집과 AI 생성 도구를 함께 쓰는 구독",
            "logo_url": "/logos/picsart.png",
            "website_url": "https://picsart.com",
            "is_popular": False,
            "plans": [
                {"name": "Pro", "price": 20, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "VSCO",
            "description": "필름 감성 프리셋과 사진 편집 도구. 연 단위 멤버십",
            "logo_url": "/logos/vsco.png",
            "website_url": "https://vsco.co",
            "is_popular": False,
            "plans": [
                {"name": "Plus", "price": 29.99, "currency": "USD", "billing_cycle": "YEARLY"},
                {"name": "Pro", "price": 59.99, "currency": "USD", "billing_cycle": "YEARLY"},
            ],
        },
    ],
    "AI": [
        {
            "name": "ChatGPT Plus",
            "description": "OpenAI의 AI 챗봇 프리미엄 서비스",
            "website_url": "https://chat.openai.com",
            "cancel_url": "https://chatgpt.com/settings/subscription",
            "logo_url": "/logos/chatgpt.png",
            "is_popular": True,
            "plans": [
                {"name": "Go", "price": 8, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Plus", "price": 20, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Pro", "price": 200, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Claude Pro",
            "description": "Anthropic의 AI 어시스턴트 프리미엄 서비스",
            "website_url": "https://claude.ai",
            "cancel_url": "https://claude.ai/settings/billing",
            "logo_url": "/logos/claude.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 20, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Max (5x)", "price": 100, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Max (20x)", "price": 200, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Perplexity Pro",
            "description": "AI 기반 검색 엔진 프리미엄 서비스",
            "website_url": "https://www.perplexity.ai",
            "logo_url": "/logos/perplexity.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 20, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Midjourney",
            "description": "AI 이미지 생성 서비스 — 텍스트로 고품질 이미지 생성",
            "website_url": "https://www.midjourney.com",
            "logo_url": "/logos/midjourney.png",
            "is_popular": True,
            "plans": [
                {"name": "Basic", "price": 10, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Standard", "price": 30, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Pro", "price": 60, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Mega", "price": 120, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Developer Tools": [
        {
            "name": "GitHub Copilot",
            "description": "AI 기반 코드 자동완성 도구",
            "website_url": "https://github.com/features/copilot",
            "logo_url": "/logos/github.png",
            "is_popular": True,
            "plans": [
                {"name": "Individual", "price": 10, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 19, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Pro+", "price": 39, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "JetBrains All Products",
            "description": "IntelliJ, PyCharm, WebStorm 등 JetBrains IDE 전체 패키지",
            "website_url": "https://www.jetbrains.com",
            "logo_url": "/logos/jetbrains.png",
            "is_popular": True,
            "plans": [
                {"name": "Individual", "price": 24.90, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Cursor",
            "description": "AI 기반 코드 에디터",
            "website_url": "https://cursor.sh",
            "logo_url": "/logos/cursor.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 20, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 40, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Pro+", "price": 60, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Ultra", "price": 200, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "GitLab",
            "description": "DevOps 플랫폼 — 소스 코드 관리, CI/CD, 프로젝트 관리",
            "website_url": "https://gitlab.com",
            "logo_url": "/logos/gitlab.png",
            "is_popular": False,
            "plans": [
                {"name": "Premium", "price": 29, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Ultimate", "price": 99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Replit",
            "description": "브라우저 기반 클라우드 IDE 및 AI 코딩 플랫폼",
            "website_url": "https://replit.com",
            "logo_url": "/logos/replit.png",
            "is_popular": False,
            "plans": [
                {"name": "Replit Core", "price": 25, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Cloud/Infrastructure": [
        {
            "name": "Vercel",
            "description": "프론트엔드 배포 및 서버리스 플랫폼",
            "website_url": "https://vercel.com",
            "logo_url": "/logos/vercel.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 20, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Netlify",
            "description": "정적 사이트 호스팅 및 서버리스 함수 플랫폼",
            "website_url": "https://www.netlify.com",
            "logo_url": "/logos/netlify.png",
            "is_popular": False,
            "plans": [
                {"name": "Pro", "price": 19, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "AWS",
            "description": "Amazon Web Services — 글로벌 최대 클라우드 인프라 서비스",
            "website_url": "https://aws.amazon.com",
            "logo_url": "/logos/aws.png",
            "is_popular": True,
            "plans": [
                {"name": "사용량 기반", "price": 50, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "DigitalOcean",
            "description": "개발자 친화적 클라우드 호스팅 플랫폼",
            "website_url": "https://www.digitalocean.com",
            "logo_url": "/logos/digitalocean.png",
            "is_popular": False,
            "plans": [
                {"name": "Basic Droplet", "price": 6, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Pro Droplet", "price": 12, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Cloudflare",
            "description": "CDN, DNS, 보안, 서버리스 등 웹 인프라 서비스",
            "website_url": "https://www.cloudflare.com",
            "logo_url": "/logos/cloudflare.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 20, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 200, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Productivity": [
        {
            "name": "Notion",
            "description": "올인원 워크스페이스 — 문서, 위키, 프로젝트 관리",
            "website_url": "https://www.notion.so",
            "cancel_url": "https://www.notion.so/my-account/plans",
            "logo_url": "/logos/notion.png",
            "is_popular": True,
            "plans": [
                {"name": "Plus", "price": 10, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 18, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Figma",
            "description": "협업 디자인 툴 — UI/UX 디자인, 프로토타이핑",
            "website_url": "https://www.figma.com",
            "cancel_url": "https://www.figma.com/settings/billing",
            "logo_url": "/logos/figma.png",
            "is_popular": True,
            "plans": [
                {"name": "Professional", "price": 15, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Organization", "price": 45, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Microsoft 365",
            "description": "Word, Excel, PowerPoint, OneDrive 등 오피스 생산성 도구",
            "website_url": "https://www.microsoft.com/microsoft-365",
            "logo_url": "/logos/microsoft365.png",
            "is_popular": True,
            "plans": [
                {"name": "Personal", "price": 12500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Family", "price": 15500, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Google One",
            "description": "Google 드라이브 추가 저장 공간 및 부가 혜택",
            "website_url": "https://one.google.com",
            "logo_url": "/logos/googleone.png",
            "is_popular": True,
            "plans": [
                {"name": "100GB", "price": 2400, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "200GB", "price": 3700, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "2TB", "price": 11900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "AI Premium", "price": 29000, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Dropbox",
            "description": "클라우드 파일 저장 및 공유 서비스",
            "website_url": "https://www.dropbox.com",
            "logo_url": "/logos/dropbox.png",
            "is_popular": False,
            "plans": [
                {"name": "Plus", "price": 11.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Adobe Creative Cloud",
            "description": "Photoshop, Illustrator, Premiere Pro 등 크리에이티브 도구 전체",
            "website_url": "https://www.adobe.com",
            "logo_url": "/logos/adobe.png",
            "is_popular": True,
            "plans": [
                # Adobe Korea 개인용 표시가는 부가세 포함이다(팀용은 별도로 적힌다).
                # 첫해 할인가(₩58,200)는 넣지 않는다 — 특가는 금방 낡는다.
                # 그런 값은 '요금제 직접 입력'으로 각자 넣는 쪽이 맞다.
                {"name": "전체 앱", "price": 78100, "currency": "KRW", "billing_cycle": "MONTHLY"},
                # 아래 둘은 아직 최신인지 확인하지 못한 값이다.
                {"name": "단일 앱", "price": 24000, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "포토그래피", "price": 26400, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Slack",
            "description": "팀 커뮤니케이션 및 협업 메신저 플랫폼",
            "website_url": "https://slack.com",
            "logo_url": "/logos/slack.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 8.75, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business+", "price": 12.50, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Zoom",
            "description": "화상회의 및 온라인 미팅 플랫폼",
            "website_url": "https://zoom.us",
            "logo_url": "/logos/zoom.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 13.33, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 21.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Canva Pro",
            "description": "온라인 그래픽 디자인 툴 — 소셜미디어, 프레젠테이션, 포스터 등",
            "website_url": "https://www.canva.com",
            "logo_url": "/logos/canva.png",
            "is_popular": True,
            "plans": [
                {"name": "Pro", "price": 14000, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Teams", "price": 12500, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Todoist",
            "description": "할 일 관리 및 프로젝트 관리 앱",
            "website_url": "https://todoist.com",
            "logo_url": "/logos/todoist.png",
            "is_popular": False,
            "plans": [
                {"name": "Pro", "price": 5, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 8, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Grammarly",
            "description": "AI 기반 영어 문법 교정 및 작문 도우미",
            "website_url": "https://www.grammarly.com",
            "logo_url": "/logos/grammarly.png",
            "is_popular": False,
            "plans": [
                {"name": "Premium", "price": 12, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 15, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Miro",
            "description": "온라인 협업 화이트보드 플랫폼",
            "website_url": "https://miro.com",
            "logo_url": "/logos/miro.png",
            "is_popular": False,
            "plans": [
                {"name": "Starter", "price": 8, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 16, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Linear",
            "description": "소프트웨어 팀을 위한 이슈 트래커 및 프로젝트 관리 도구",
            "website_url": "https://linear.app",
            "logo_url": "/logos/linear.png",
            "is_popular": False,
            "plans": [
                {"name": "Standard", "price": 8, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Plus", "price": 14, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Education": [
        {
            "name": "Duolingo Plus",
            "description": "AI 기반 외국어 학습 서비스",
            "website_url": "https://www.duolingo.com",
            "logo_url": "/logos/duolingo.png",
            "is_popular": True,
            "plans": [
                {"name": "Super", "price": 7250, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Super 패밀리", "price": 13260, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Max", "price": 21000, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "LinkedIn Premium",
            "description": "비즈니스 네트워킹 및 구직 프리미엄 서비스",
            "website_url": "https://www.linkedin.com/premium",
            "logo_url": "/logos/linkedin.png",
            "is_popular": False,
            "plans": [
                {"name": "Career", "price": 29.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Business", "price": 59.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Coursera Plus",
            "description": "스탠포드, 구글 등 7000+ 강좌 무제한 수강 플랫폼",
            "website_url": "https://www.coursera.org",
            "logo_url": "/logos/coursera.png",
            "is_popular": True,
            "plans": [
                {"name": "Plus (월)", "price": 59, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Plus (연)", "price": 399, "currency": "USD", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "Class101",
            "description": "취미, 부업, 자기개발 분야 온라인 클래스 플랫폼",
            "website_url": "https://class101.net",
            "logo_url": "/logos/class101.png",
            "is_popular": True,
            "plans": [
                {"name": "올패스", "price": 19900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "인프런",
            "description": "개발, 데이터, 디자인 등 IT 전문 온라인 강의 플랫폼",
            "website_url": "https://www.inflearn.com",
            "logo_url": "/logos/inflearn.png",
            "is_popular": True,
            "plans": [
                {"name": "플러스", "price": 26400, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    # 전자책·오디오북 구독. 원래 Education에 밀리의 서재와 리디 셀렉트만 얹혀 있었는데,
    # 강의 플랫폼과 독서 구독은 고르는 기준도 갈아타는 대상도 달라 한 칸에 두면 비교가 안 된다.
    "Books": [
        {
            "name": "밀리의 서재",
            "description": "전자책, 오디오북, 챗북 무제한 구독 서비스",
            "website_url": "https://www.millie.co.kr",
            "cancel_url": "https://www.millie.co.kr/v3/mypage",
            "logo_url": "/logos/millie.png",
            "is_popular": True,
            "plans": [
                # 웹 결제 기준. 스토어 결제는 수수료가 얹혀 더 비싸다
                # (구글 12,900 / 애플 14,900) — 카탈로그는 공식 웹가를 쓴다.
                {"name": "정기구독", "price": 11900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "연간 구독권", "price": 119000, "currency": "KRW", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "리디 셀렉트",
            "description": "신간과 베스트셀러를 무제한으로 보는 전자책 구독",
            "website_url": "https://select.ridibooks.com",
            "cancel_url": "https://select.ridibooks.com/settings",
            "logo_url": "/logos/ridibooks.png",
            "is_popular": True,
            "plans": [
                {"name": "셀렉트", "price": 4900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "예스24 크레마클럽",
            "description": "예스24의 전자책 월정액 구독 (구 예스24 북클럽)",
            "website_url": "https://cremaclub.yes24.com",
            "cancel_url": "https://cremaclub.yes24.com/BookClub/MyBookClub",
            "logo_url": "/logos/yes24.png",
            "is_popular": True,
            "plans": [
                {"name": "스탠다드 55", "price": 5500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "프리미엄 77", "price": 7700, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "FLO 99", "price": 9900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "교보문고 sam",
            "description": "교보문고 전자책 구독 — 권수 정액제와 무제한 요금제",
            "website_url": "https://sam.kyobobook.co.kr",
            "cancel_url": "https://sam.kyobobook.co.kr/dig/sam/pssbuy",
            "logo_url": "/logos/kyobo.png",
            "is_popular": True,
            "plans": [
                # sam2/3/12는 월 몇 권을 빌리느냐로 나뉘고, 무제한만 권수 제한이 없다.
                {"name": "sam2", "price": 7000, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "sam3", "price": 9900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "sam12", "price": 18000, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "sam 무제한", "price": 9900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "윌라",
            "description": "오디오북, 전자책, 클래스를 무제한으로 듣는 구독 서비스",
            "website_url": "https://www.welaaa.com",
            "cancel_url": "https://www.welaaa.com/mypage",
            "logo_url": "/logos/welaaa.png",
            "is_popular": True,
            "plans": [
                {"name": "베이직", "price": 12500, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "패밀리", "price": 16900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Kindle Unlimited",
            "description": "아마존 킨들 전자책 무제한 구독",
            "website_url": "https://www.amazon.com/kindle-dbs/hz/subscribe/ku",
            "cancel_url": "https://www.amazon.com/kindle-dbs/ku/ku-central",
            "logo_url": "/logos/kindleunlimited.png",
            "is_popular": False,
            "plans": [
                {"name": "Kindle Unlimited", "price": 11.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Audible",
            "description": "아마존 오디오북 구독 — 정액 청취와 크레딧 구매",
            "website_url": "https://www.audible.com",
            "cancel_url": "https://www.audible.com/account",
            "logo_url": "/logos/audible.png",
            "is_popular": False,
            "plans": [
                {"name": "Plus", "price": 7.95, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Standard", "price": 8.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Premium Plus", "price": 14.95, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Premium Plus (연)", "price": 149.50, "currency": "USD", "billing_cycle": "YEARLY"},
            ],
        },
    ],
    "Gaming": [
        {
            "name": "Nintendo Switch Online",
            "description": "닌텐도 스위치 온라인 멀티플레이 서비스",
            "website_url": "https://www.nintendo.com",
            "logo_url": "/logos/nintendo.png",
            "is_popular": True,
            "plans": [
                {"name": "개인", "price": 3900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "가족", "price": 7900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "PlayStation Plus",
            "description": "PlayStation 온라인 멀티플레이 및 게임 구독 서비스",
            "website_url": "https://www.playstation.com",
            "logo_url": "/logos/playstation.png",
            "is_popular": True,
            "plans": [
                {"name": "Essential (월)", "price": 10800, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Special (월)", "price": 16200, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Deluxe (월)", "price": 19000, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Xbox Game Pass",
            "description": "수백 개의 PC/콘솔 게임을 무제한으로 즐길 수 있는 구독 서비스",
            "website_url": "https://www.xbox.com/game-pass",
            "logo_url": "/logos/xbox.png",
            "is_popular": True,
            "plans": [
                {"name": "Core", "price": 6900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Standard", "price": 10900, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "Ultimate", "price": 18900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Discord Nitro",
            "description": "디스코드 프리미엄 — 이모지, 스티커, 프로필 커스텀, 고화질 스트리밍",
            "website_url": "https://discord.com/nitro",
            "logo_url": "/logos/discord.png",
            "is_popular": True,
            "plans": [
                {"name": "Nitro Basic", "price": 2.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Nitro", "price": 9.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "EA Play",
            "description": "EA 게임 구독 서비스 — FIFA, Battlefield, Sims 등",
            "website_url": "https://www.ea.com/ea-play",
            "logo_url": "/logos/ea.png",
            "is_popular": False,
            "plans": [
                {"name": "EA Play", "price": 5.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "EA Play Pro", "price": 16.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Steam",
            "description": "세계 최대 PC 게임 디지털 플랫폼",
            "website_url": "https://store.steampowered.com",
            "logo_url": "/logos/steam.png",
            "is_popular": False,
            "plans": [
                {"name": "사용량 기반", "price": 0, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Health & Fitness": [
        {
            "name": "Calm",
            "description": "명상, 수면, 릴렉스를 위한 마음 건강 앱",
            "website_url": "https://www.calm.com",
            "logo_url": "/logos/calm.png",
            "is_popular": True,
            "plans": [
                {"name": "Premium", "price": 14.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "연간", "price": 69.99, "currency": "USD", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "Headspace",
            "description": "명상, 마인드풀니스, 수면 가이드 앱",
            "website_url": "https://www.headspace.com",
            "logo_url": "/logos/headspace.png",
            "is_popular": True,
            "plans": [
                {"name": "Premium", "price": 12.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "연간", "price": 69.99, "currency": "USD", "billing_cycle": "YEARLY"},
            ],
        },
        {
            "name": "Strava",
            "description": "러닝, 사이클링 등 운동 기록 및 소셜 피트니스 앱",
            "website_url": "https://www.strava.com",
            "logo_url": "/logos/strava.png",
            "is_popular": True,
            "plans": [
                {"name": "Subscriber", "price": 11.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Nike Run Club+",
            "description": "Nike 러닝 코칭, 오디오 가이드 런, 트레이닝 플랜",
            "website_url": "https://www.nike.com/nrc-app",
            "logo_url": "/logos/nike.png",
            "is_popular": False,
            "plans": [
                {"name": "Premium", "price": 7900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "FatSecret Premium",
            "description": "칼로리 계산, 식단 관리, 영양 분석 앱",
            "website_url": "https://www.fatsecret.com",
            "logo_url": "/logos/fatsecret.png",
            "is_popular": False,
            "plans": [
                {"name": "Premium", "price": 6.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "News & Media": [
        {
            "name": "The New York Times",
            "description": "세계 최고 권위의 뉴스 매체 디지털 구독",
            "website_url": "https://www.nytimes.com",
            "logo_url": "/logos/nytimes.png",
            "is_popular": True,
            "plans": [
                {"name": "Basic", "price": 4, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "All Access", "price": 25, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Medium",
            "description": "작가, 전문가들의 블로그 및 매거진 플랫폼",
            "website_url": "https://medium.com",
            "logo_url": "/logos/medium.png",
            "is_popular": True,
            "plans": [
                {"name": "Member", "price": 5, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "연간", "price": 50, "currency": "USD", "billing_cycle": "YEARLY"},
                {"name": "Friend of Medium", "price": 15, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "The Economist",
            "description": "세계 경제, 정치, 비즈니스 전문 주간지 디지털 구독",
            "website_url": "https://www.economist.com",
            "logo_url": "/logos/economist.png",
            "is_popular": False,
            "plans": [
                {"name": "Digital", "price": 28900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "조선일보 디지털",
            "description": "조선일보 프리미엄 디지털 뉴스 구독",
            "website_url": "https://www.chosun.com",
            "logo_url": "/logos/chosun.png",
            "is_popular": True,
            "plans": [
                {"name": "프리미엄", "price": 9900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "중앙일보 디지털",
            "description": "중앙일보 프리미엄 디지털 뉴스 구독",
            "website_url": "https://www.joongang.co.kr",
            "logo_url": "/logos/joongang.png",
            "is_popular": False,
            "plans": [
                {"name": "프리미엄", "price": 9900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Storage": [
        {
            "name": "iCloud+",
            "description": "Apple 클라우드 저장소 — 사진, 파일, 백업, Private Relay",
            "website_url": "https://www.icloud.com",
            "logo_url": "/logos/icloud.png",
            "is_popular": True,
            "plans": [
                {"name": "50GB", "price": 1100, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "200GB", "price": 4400, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "2TB", "price": 14000, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "6TB", "price": 44000, "currency": "KRW", "billing_cycle": "MONTHLY"},
                {"name": "12TB", "price": 88000, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "pCloud",
            "description": "유럽 기반 클라우드 저장소 — 평생 요금제 지원",
            "website_url": "https://www.pcloud.com",
            "logo_url": "/logos/pcloud.png",
            "is_popular": False,
            "plans": [
                {"name": "Premium 500GB", "price": 4.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Premium Plus 2TB", "price": 9.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "MEGA",
            "description": "대용량 무료 저장 공간을 제공하는 클라우드 스토리지",
            "website_url": "https://mega.io",
            "logo_url": "/logos/mega.png",
            "is_popular": False,
            "plans": [
                {"name": "Pro Lite (400GB)", "price": 4.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Pro I (2TB)", "price": 9.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Pro II (8TB)", "price": 19.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Security & VPN": [
        {
            "name": "NordVPN",
            "description": "전 세계 60개국 VPN 서버를 제공하는 보안 서비스",
            "website_url": "https://nordvpn.com",
            "logo_url": "/logos/nordvpn.png",
            "is_popular": True,
            "plans": [
                {"name": "Basic", "price": 12.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Plus", "price": 13.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Complete", "price": 14.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "ExpressVPN",
            "description": "초고속 VPN 서비스 — 94개국 서버 제공",
            "website_url": "https://www.expressvpn.com",
            "logo_url": "/logos/expressvpn.png",
            "is_popular": True,
            "plans": [
                {"name": "월간", "price": 12.95, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Surfshark",
            "description": "무제한 기기 연결을 지원하는 VPN 서비스",
            "website_url": "https://surfshark.com",
            "logo_url": "/logos/surfshark.png",
            "is_popular": False,
            "plans": [
                {"name": "Starter", "price": 15.45, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "One", "price": 16.95, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "1Password",
            "description": "비밀번호 관리 및 보안 인증 매니저",
            "website_url": "https://1password.com",
            "logo_url": "/logos/1password.png",
            "is_popular": True,
            "plans": [
                {"name": "Individual", "price": 3.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Families", "price": 4.99, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Bitwarden",
            "description": "오픈소스 비밀번호 관리 매니저",
            "website_url": "https://bitwarden.com",
            "logo_url": "/logos/bitwarden.png",
            "is_popular": False,
            "plans": [
                {"name": "Premium", "price": 1.65, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "Families", "price": 3.33, "currency": "USD", "billing_cycle": "MONTHLY"},
            ],
        },
    ],
    "Lifestyle": [
        {
            "name": "쿠팡 로켓와우",
            "description": "로켓배송 무료, 쿠팡이츠 할인, 쿠팡플레이 등 통합 멤버십",
            "website_url": "https://www.coupang.com",
            "logo_url": "/logos/coupang.png",
            "is_popular": True,
            "plans": [
                {"name": "와우 회원", "price": 7890, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "네이버 플러스 멤버십",
            "description": "네이버 쇼핑 적립, 네이버 시리즈, 네이버 VIBE 등 통합 혜택",
            "website_url": "https://naver.com",
            "logo_url": "/logos/naver.png",
            "is_popular": True,
            "plans": [
                {"name": "월간", "price": 4900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "배민클럽",
            "description": "배달의민족 무료배달, 할인 쿠폰 등 프리미엄 멤버십",
            "website_url": "https://www.baemin.com",
            "logo_url": "/logos/baemin.png",
            "is_popular": True,
            "plans": [
                {"name": "월간", "price": 3990, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "카카오톡 이모티콘 플러스",
            "description": "카카오톡 이모티콘 무제한 사용 구독 서비스",
            "website_url": "https://www.kakaocorp.com",
            "logo_url": "/logos/kakaotalk.png",
            "is_popular": True,
            "plans": [
                {"name": "월간", "price": 4900, "currency": "KRW", "billing_cycle": "MONTHLY"},
            ],
        },
        {
            "name": "Amazon Prime",
            "description": "아마존 무료배송, Prime Video, Prime Music 등 통합 멤버십",
            "website_url": "https://www.amazon.com/prime",
            "logo_url": "/logos/amazonprime.png",
            "is_popular": True,
            "plans": [
                {"name": "월간", "price": 14.99, "currency": "USD", "billing_cycle": "MONTHLY"},
                {"name": "연간", "price": 139, "currency": "USD", "billing_cycle": "YEARLY"},
            ],
        },
    ],
}


async def seed_categories(db: AsyncSession) -> None:
    # 시드는 기본 카탈로그(user_id IS NULL)만 건드린다. 사용자가 만든 카테고리를
    # 이름으로 집어 오면 남의 "Music"에 시드의 아이콘·색을 덮어쓰게 된다.
    result = await db.execute(select(Category).where(Category.user_id.is_(None)))
    existing = {c.name: c for c in result.scalars().all()}

    changed = False
    for cat_data in DEFAULT_CATEGORIES:
        category = existing.get(cat_data["name"])
        if category is None:
            db.add(Category(**cat_data))
            changed = True
            continue
        # 아이콘/색은 여기 값이 기준이다. 새로 만들 때만 반영하면 Education의 📚를
        # Books에 넘겨주는 것 같은 변경이 기존 DB에는 영영 적용되지 않는다.
        for field in ("icon", "color"):
            if getattr(category, field) != cat_data[field]:
                setattr(category, field, cat_data[field])
                changed = True
    if changed:
        await db.commit()


async def _update_logo_urls(db: AsyncSession) -> None:
    """Update existing services' and subscriptions' logo_url to use local SVG files."""
    # 로고 파일이 없는 서비스도 있다(브랜드 이미지를 못 넣은 것들). 화면에는
    # 이름 첫 글자로 대신 그려지므로, 여기서는 있는 것만 모은다.
    logo_map: dict[str, str] = {}
    for services in DEFAULT_SERVICES.values():
        for svc in services:
            if svc.get("logo_url"):
                logo_map[svc["name"]] = svc["logo_url"]

    # Update services table
    result = await db.execute(select(Service).where(Service.user_id.is_(None)))
    for service in result.scalars().all():
        new_url = logo_map.get(service.name)
        if new_url and service.logo_url != new_url:
            service.logo_url = new_url

    # Update cached logo_url in subscriptions table
    sub_result = await db.execute(select(Subscription))
    for sub in sub_result.scalars().all():
        new_url = logo_map.get(sub.service_name)
        if new_url and sub.logo_url != new_url:
            sub.logo_url = new_url

    await db.commit()


async def _detach_plan(db: AsyncSession, plan_id: int) -> None:
    """요금제를 지우기 전에 그 요금제를 가리키는 행들을 먼저 떼어 낸다.

    seed는 앱 기동(lifespan)에서 돌기 때문에 여기서 무결성 오류가 나면 앱이
    아예 못 뜬다. subscriptions.plan_id는 nullable이라 끊어 주면 되고
    (구독 자체는 plan_name·cost를 따로 들고 있어 화면은 그대로다),
    plan_price_history.plan_id는 NOT NULL이라 지우는 수밖에 없다.
    """
    subs = await db.execute(select(Subscription).where(Subscription.plan_id == plan_id))
    for sub in subs.scalars().all():
        sub.plan_id = None

    history = await db.execute(select(PlanPriceHistory).where(PlanPriceHistory.plan_id == plan_id))
    for row in history.scalars().all():
        await db.delete(row)


def _with_vat_default(plan_data: dict) -> dict:
    """요금제 한 줄에 vat_included 기본값을 채운다.

    국내 소비자가는 총액표시제라 부가세가 들어 있고(KRW), 해외 웹 결제는
    별도라 청구서에 10%가 더 붙는다. 통화가 기본값을 정하되, 예외는 요금제
    줄에 "vat_included": True/False를 직접 적어 덮어쓴다 — 한국 앱스토어
    인앱결제가처럼 외화여도 이미 포함가인 경우가 있다.
    """
    filled = dict(plan_data)
    filled.setdefault("vat_included", filled.get("currency") == "KRW")
    return filled


async def seed_services(db: AsyncSession) -> None:
    # 아래 조회는 전부 기본 카탈로그(user_id IS NULL)로 좁힌다. 이름으로 찾는
    # 구조라 사용자가 만든 동명의 항목을 시드 대상으로 착각하면, 요금제 정리
    # 단계에서 그 사람이 넣은 요금제를 "시드에 없는 것"으로 보고 지워 버린다.
    cat_result = await db.execute(select(Category).where(Category.user_id.is_(None)))
    cat_map = {c.name: c.id for c in cat_result.scalars().all()}

    # Get existing services as dict {name: Service}
    svc_result = await db.execute(select(Service).where(Service.user_id.is_(None)))
    existing_services = {s.name: s for s in svc_result.scalars().all()}

    # Get existing plans as dict {(service_id, plan_name): ServicePlan}
    # 사용자가 카탈로그 서비스에 직접 넣은 요금제(user_id 있음)는 여기서 빼야 한다.
    # 넣어 두면 아래 "시드에 없는 요금제 삭제"가 그 사람 요금제를 지워 버린다.
    default_service_ids = {s.id for s in existing_services.values()}
    plan_result = await db.execute(select(ServicePlan).where(ServicePlan.user_id.is_(None)))
    existing_plans = {
        (p.service_id, p.name): p
        for p in plan_result.scalars().all()
        if p.service_id in default_service_ids
    }

    changed = False
    for category_name, services in DEFAULT_SERVICES.items():
        category_id = cat_map.get(category_name)
        for svc_data in services:
            plans_data = [_with_vat_default(p) for p in svc_data.get("plans", [])]

            if svc_data["name"] in existing_services:
                # Update existing service fields
                service = existing_services[svc_data["name"]]
                for field in ("cancel_url", "website_url", "logo_url", "description"):
                    new_val = svc_data.get(field)
                    if new_val and getattr(service, field) != new_val:
                        setattr(service, field, new_val)
                        changed = True
                # 소속 카테고리와 인기 표시도 여기 값이 기준이다. 위 루프는 값이
                # 참일 때만 반영하므로 False나 카테고리 이동은 통과하지 못한다.
                if category_id is not None and service.category_id != category_id:
                    # 카탈로그에서 서비스가 다른 분류로 옮겨 가면(예: ChatGPT를
                    # Developer Tools → AI), 이미 담아 둔 구독은 옛 분류에 남는다.
                    # 사용자가 직접 고른 분류는 건드리면 안 되므로, 옛 분류를
                    # 그대로 쓰고 있던 구독만 함께 옮긴다.
                    await db.execute(
                        update(Subscription)
                        .where(
                            Subscription.service_id == service.id,
                            Subscription.category_id == service.category_id,
                        )
                        .values(category_id=category_id)
                    )
                    service.category_id = category_id
                    changed = True
                if service.is_popular != svc_data.get("is_popular", False):
                    service.is_popular = svc_data.get("is_popular", False)
                    changed = True
                seed_plan_names = {p["name"] for p in plans_data}

                for plan_data in plans_data:
                    key = (service.id, plan_data["name"])
                    if key in existing_plans:
                        # Update price/currency/billing_cycle if changed
                        existing_plan = existing_plans[key]
                        for field in ("price", "currency", "billing_cycle", "vat_included"):
                            if str(getattr(existing_plan, field)) != str(plan_data.get(field)):
                                setattr(existing_plan, field, plan_data[field])
                                changed = True
                    else:
                        # Add new plan to existing service
                        plan = ServicePlan(service_id=service.id, **plan_data)
                        db.add(plan)
                        changed = True

                # Remove plans that are no longer in seed data
                for (sid, pname), existing_plan in list(existing_plans.items()):
                    if sid == service.id and pname not in seed_plan_names:
                        await _detach_plan(db, existing_plan.id)
                        await db.delete(existing_plan)
                        del existing_plans[(sid, pname)]
                        changed = True
            else:
                # Add new service
                svc_copy = {k: v for k, v in svc_data.items() if k != "plans"}
                service = Service(**svc_copy, category_id=category_id)
                db.add(service)
                await db.flush()

                for plan_data in plans_data:
                    plan = ServicePlan(service_id=service.id, **plan_data)
                    db.add(plan)
                changed = True

    if changed:
        await db.commit()

    # Always update logo URLs for existing services
    await _update_logo_urls(db)

    # Seed price history
    await seed_price_history(db)


# 주요 서비스의 실제 가격 변동 이력 (서비스이름 -> 플랜이름 -> [(가격, 통화, 날짜)])
PRICE_HISTORY_DATA: dict[str, dict[str, list[tuple[float, str, str]]]] = {
    "Netflix": {
        "광고형 스탠다드": [
            (5500, "KRW", "2022-11-01"),
            (5500, "KRW", "2023-10-19"),
            (7000, "KRW", "2024-10-01"),
        ],
        "스탠다드": [
            (9500, "KRW", "2021-01-01"),
            (10500, "KRW", "2022-01-14"),
            (12000, "KRW", "2023-10-19"),
            (13500, "KRW", "2024-10-01"),
        ],
        "프리미엄": [
            (14500, "KRW", "2021-01-01"),
            (15500, "KRW", "2022-01-14"),
            (17000, "KRW", "2023-10-19"),
            (17000, "KRW", "2024-10-01"),
        ],
    },
    "YouTube Premium": {
        "개인": [
            (8690, "KRW", "2021-01-01"),
            (10450, "KRW", "2022-09-01"),
            (14900, "KRW", "2024-03-01"),
        ],
        "가족": [
            (14900, "KRW", "2021-01-01"),
            (16900, "KRW", "2022-09-01"),
            (23900, "KRW", "2024-03-01"),
        ],
    },
    # 요금제 이름은 카탈로그(DEFAULT_SERVICES)에 적힌 것과 글자까지 같아야 한다.
    # 영문 이름으로 적혀 있어 seed_price_history가 조용히 건너뛰고 있었다.
    "Spotify": {
        "개인": [
            (8990, "KRW", "2021-01-01"),
            (10990, "KRW", "2023-07-01"),
        ],
        "듀오": [
            (11990, "KRW", "2021-01-01"),
            (14990, "KRW", "2023-07-01"),
        ],
        "가족": [
            (14990, "KRW", "2021-01-01"),
            (17490, "KRW", "2023-07-01"),
        ],
    },
    "ChatGPT Plus": {
        "Plus": [
            (20.00, "USD", "2023-02-01"),
            (20.00, "USD", "2024-01-01"),
        ],
        "Pro": [
            (200.00, "USD", "2024-12-01"),
        ],
    },
    "Disney+": {
        "스탠다드": [
            (7900, "KRW", "2021-11-12"),
            (9900, "KRW", "2023-11-01"),
        ],
        "프리미엄": [
            (9900, "KRW", "2021-11-12"),
            (13900, "KRW", "2023-11-01"),
        ],
    },
    "Apple Music": {
        "개인": [
            (8900, "KRW", "2021-01-01"),
            (10900, "KRW", "2022-10-24"),
        ],
        "가족": [
            (13500, "KRW", "2021-01-01"),
            (16900, "KRW", "2022-10-24"),
        ],
    },
    "1Password": {
        "Individual": [
            (2.99, "USD", "2021-01-01"),
            (2.99, "USD", "2023-01-01"),
            (3.99, "USD", "2024-09-01"),
        ],
        "Families": [
            (4.99, "USD", "2021-01-01"),
            (4.99, "USD", "2024-09-01"),
        ],
    },
    "Notion": {
        "Plus": [
            (8.00, "USD", "2021-01-01"),
            (10.00, "USD", "2024-04-01"),
        ],
        "Business": [
            (15.00, "USD", "2021-01-01"),
            (18.00, "USD", "2024-04-01"),
        ],
    },
    # 2017년 출시가를 2025-06-10에 처음 올렸다. 기존 구독자는 옛 가격이 유지돼,
    # 같은 서비스를 쓰면서 내는 돈이 갈리는 사례라 인상 이력 화면에 딱 맞는다.
    "밀리의 서재": {
        "정기구독": [
            (9900, "KRW", "2017-10-01"),
            (11900, "KRW", "2025-06-10"),
        ],
        "연간 구독권": [
            (99000, "KRW", "2017-10-01"),
            (119000, "KRW", "2025-06-10"),
        ],
    },
}


async def seed_price_history(db: AsyncSession) -> None:
    """주요 서비스의 과거 가격 변동 이력을 시딩합니다.

    "한 줄이라도 있으면 끝난 걸로 친다"가 아니라 요금제 단위로 건너뛴다.
    전자로 두면 이미 시딩된 DB에는 새로 추가한 이력이 영영 들어가지 않는다.
    """
    seeded = await db.execute(select(PlanPriceHistory.plan_id).distinct())
    seeded_plan_ids = set(seeded.scalars().all())

    # plan_id 조회를 위한 맵 생성 (기본 카탈로그만)
    svc_result = await db.execute(select(Service).where(Service.user_id.is_(None)))
    svc_map = {s.name: s.id for s in svc_result.scalars().all()}

    plan_result = await db.execute(select(ServicePlan).where(ServicePlan.user_id.is_(None)))
    plan_map = {(p.service_id, p.name): p.id for p in plan_result.scalars().all()}

    for svc_name, plans in PRICE_HISTORY_DATA.items():
        svc_id = svc_map.get(svc_name)
        if not svc_id:
            continue
        for plan_name, history in plans.items():
            plan_id = plan_map.get((svc_id, plan_name))
            if not plan_id or plan_id in seeded_plan_ids:
                continue
            for price, currency, effective_date_str in history:
                db.add(PlanPriceHistory(
                    plan_id=plan_id,
                    price=price,
                    currency=currency,
                    effective_date=date.fromisoformat(effective_date_str),
                ))

    await db.commit()
