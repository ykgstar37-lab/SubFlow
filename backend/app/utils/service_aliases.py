"""서비스 검색용 별칭.

카탈로그에 담긴 이름은 한 가지뿐이라, 'Netflix'로 등록된 서비스는 '넷플릭스'로
검색해도 안 나오고 'Melon'은 '멜론'으로 안 나온다. 한국에서 쓰는 이름과
등록된 이름이 다른 경우가 대부분이라 검색이 자주 빈손으로 끝난다.

그래서 이름과 함께 훑을 별칭을 서비스마다 붙인다. 방향은 양쪽 모두다.
영문 이름 서비스에는 한글 표기를, 한글 이름 서비스에는 영문 표기를 넣는다.
줄임말('넷플', '유튭')과 흔한 오탈자도 실제로 많이 치는 만큼 함께 담았다.

DB 컬럼이 아니라 여기 사전으로 둔다. 사용자마다 달라지지 않고 스키마를
건드릴 이유도 없으며, 새 서비스를 추가할 때 카탈로그 옆에서 같이 채우면 된다.
"""

SERVICE_ALIASES: dict[str, list[str]] = {
    # ── Entertainment ──
    "Netflix": ["넷플릭스", "넷플"],
    "YouTube Premium": ["유튜브 프리미엄", "유튜브", "유튭", "youtube"],
    "Disney+": ["디즈니플러스", "디즈니+", "디즈니", "disney plus"],
    "Wavve": ["웨이브"],
    "Tving": ["티빙"],
    "Watcha": ["왓챠"],
    "Apple TV+": ["애플티비", "애플 TV", "apple tv"],
    "Coupang Play": ["쿠팡플레이", "쿠플"],
    "Amazon Prime Video": ["아마존 프라임 비디오", "프라임 비디오"],
    "Laftel": ["라프텔"],
    "Paramount+": ["파라마운트플러스", "파라마운트"],
    # ── Music ──
    "Spotify": ["스포티파이", "스포파이"],
    "Apple Music": ["애플뮤직", "애플 뮤직"],
    "Melon": ["멜론"],
    "Genie Music": ["지니뮤직", "지니"],
    "FLO": ["플로"],
    "YouTube Music": ["유튜브 뮤직", "유튜브뮤직", "유튭뮤직"],
    "VIBE": ["바이브"],
    "Bugs": ["벅스", "벅스뮤직"],
    "Tidal": ["타이달"],
    # ── Developer Tools ──
    "GitHub Copilot": ["깃허브 코파일럿", "코파일럿", "깃헙"],
    "JetBrains All Products": ["젯브레인즈", "인텔리제이", "intellij", "파이참", "pycharm"],
    "ChatGPT Plus": ["챗지피티", "챗gpt", "지피티", "오픈AI", "openai"],
    "Claude Pro": ["클로드", "앤트로픽", "anthropic"],
    "Notion": ["노션"],
    "Figma": ["피그마"],
    "Cursor": ["커서"],
    "Midjourney": ["미드저니"],
    "Perplexity Pro": ["퍼플렉시티", "퍼플렉서티"],
    "GitLab": ["깃랩"],
    "Replit": ["리플릿"],
    # ── Cloud / Infrastructure ──
    "Vercel": ["버셀", "버설"],
    "Netlify": ["넷리파이"],
    "AWS": ["아마존 웹서비스", "아마존웹서비스", "amazon web services"],
    "DigitalOcean": ["디지털오션"],
    "Cloudflare": ["클라우드플레어"],
    # ── Productivity ──
    "Microsoft 365": ["마이크로소프트 365", "오피스365", "office 365", "MS오피스", "엠에스"],
    "Google One": ["구글원", "구글 원", "구글 드라이브", "google drive"],
    "Dropbox": ["드롭박스"],
    "Adobe Creative Cloud": ["어도비", "포토샵", "photoshop", "일러스트레이터"],
    "Slack": ["슬랙"],
    "Zoom": ["줌"],
    "Canva Pro": ["캔바"],
    "Todoist": ["투두이스트", "todo"],
    "Grammarly": ["그래머리"],
    "Miro": ["미로"],
    "Linear": ["리니어"],
    # ── Education ──
    "Duolingo Plus": ["듀오링고"],
    "LinkedIn Premium": ["링크드인"],
    "Coursera Plus": ["코세라", "코스세라"],
    "Class101": ["클래스101", "클래스 101"],
    "인프런": ["inflearn", "인플런"],
    # ── Books ──
    # ── 사진·영상 ──
    "CapCut Pro": ["캡컷", "캡컷프로", "capcut", "캡컷 프로"],
    "SNOW VIP": ["스노우", "스노우vip", "snow", "스노우 vip"],
    "KineMaster Premium": ["키네마스터", "키마", "kinemaster", "키네마스터 프리미엄"],
    "Vrew": ["브루", "vrew", "브루 자막"],
    "Adobe Lightroom": ["라이트룸", "어도비 라이트룸", "lightroom", "lr"],
    "Picsart Pro": ["픽스아트", "픽스아트프로", "picsart"],
    "VSCO": ["비스코", "vsco", "브이에스씨오"],

    "밀리의 서재": ["millie", "밀리", "밀리서재"],
    "리디 셀렉트": ["ridi", "리디북스", "리디", "ridibooks"],
    "예스24 크레마클럽": ["yes24", "예스24", "크레마", "예스24 북클럽", "북클럽"],
    "교보문고 sam": ["교보문고", "교보", "샘", "kyobo"],
    "윌라": ["welaaa", "웰라"],
    "Kindle Unlimited": ["킨들", "킨들 언리미티드", "아마존 킨들"],
    "Audible": ["오디블", "오더블"],
    # ── Gaming ──
    "Nintendo Switch Online": ["닌텐도", "닌텐도 스위치", "스위치 온라인"],
    "PlayStation Plus": ["플레이스테이션", "플스", "PS플러스", "피에스플러스"],
    "Xbox Game Pass": ["엑스박스", "게임패스", "엑박"],
    "Discord Nitro": ["디스코드", "디코", "니트로"],
    "EA Play": ["이에이 플레이", "이에이"],
    "Steam": ["스팀"],
    # ── Health & Fitness ──
    "Calm": ["캄"],
    "Headspace": ["헤드스페이스"],
    "Strava": ["스트라바"],
    "Nike Run Club+": ["나이키 런클럽", "나이키", "런클럽"],
    "FatSecret Premium": ["팻시크릿"],
    # ── News & Media ──
    "The New York Times": ["뉴욕타임스", "뉴욕 타임즈", "NYT", "nytimes"],
    "Medium": ["미디엄"],
    "The Economist": ["이코노미스트"],
    "조선일보 디지털": ["조선일보", "조선", "chosun"],
    "중앙일보 디지털": ["중앙일보", "중앙", "joongang"],
    # ── Storage ──
    "iCloud+": ["아이클라우드", "icloud", "애플 클라우드"],
    "pCloud": ["피클라우드"],
    "MEGA": ["메가"],
    # ── Security & VPN ──
    "NordVPN": ["노드VPN", "노드 브이피엔"],
    "ExpressVPN": ["익스프레스VPN"],
    "Surfshark": ["서프샤크"],
    "1Password": ["원패스워드", "1패스워드"],
    "Bitwarden": ["비트워든"],
    # ── Lifestyle ──
    "쿠팡 로켓와우": ["coupang", "쿠팡", "로켓와우", "와우멤버십"],
    "네이버 플러스 멤버십": ["naver", "네이버", "네이버플러스", "네플멤"],
    "배민클럽": ["baemin", "배달의민족", "배민"],
    "카카오톡 이모티콘 플러스": ["kakao", "카카오톡", "카톡", "이모티콘플러스", "이모티콘"],
    "Amazon Prime": ["아마존 프라임", "아마존"],
}


def aliases_for(service_name: str) -> list[str]:
    return SERVICE_ALIASES.get(service_name, [])


def matches(service_name: str, query: str) -> bool:
    """서비스 이름이나 별칭 중 하나라도 검색어를 품고 있으면 True."""
    q = query.strip().lower()
    if not q:
        return True
    if q in service_name.lower():
        return True
    return any(q in a.lower() for a in SERVICE_ALIASES.get(service_name, []))
