export type Language = "en" | "ko";

/**
 * 한국어 원문 → 영어. 키가 곧 한국어 원문이므로 별도 키 이름을 외울 필요가 없고,
 * 사전에 없으면 한국어가 그대로 반환된다(점진적 번역이 안전한 이유).
 * `{name}` 형태의 자리표시자는 t()의 params로 치환한다.
 */
const EN: Record<string, string> = {
  // ── 공통 ──
  "저장": "Save",
  "저장 중...": "Saving...",
  "취소": "Cancel",
  "삭제": "Delete",
  "수정": "Edit",
  "추가": "Add",
  "닫기": "Close",
  "전체": "All",
  "다시 시도": "Retry",
  "데이터가 없습니다.": "No data available.",
  "불러오는 중…": "Loading...",
  "다음": "Next",
  "이전": "Previous",
  "건너뛰기": "Skip",
  "자세히 보기": "View details",
  "바로가기": "Open",
  "설정하기": "Set up",
  "해제": "Clear",
  "없음": "None",
  "미분류": "Uncategorized",
  "현재": "Current",
  "예상": "Projected",
  "실제": "Actual",
  "건": "",
  "원": "",

  // ── 상태 ──
  "활성": "Active",
  "일시정지": "Paused",
  "취소됨": "Cancelled",
  "체험 중": "In trial",
  "체험판": "Trial",
  "체험 종료 후": "After trial ends",
  "미사용": "Unused",
  "관리 중": "Managed",
  "조정 필요": "Needs attention",
  "인기": "Popular",
  "켜짐": "On",
  "꺼짐": "Off",

  // ── 결제 주기 ──
  "월간": "Monthly",
  "연간": "Yearly",
  "주간": "Weekly",
  "분기": "Quarterly",
  "월": "mo",
  "년": "yr",
  "주": "wk",
  "/월": "/mo",
  "/년": "/yr",
  "/주": "/wk",
  "/분기": "/qtr",
  "정기 결제": "Recurring",
  "일회성 결제": "One-time",

  // ── 인증 ──
  "로그인": "Log in",
  "로그아웃": "Log out",
  "회원가입": "Sign up",
  "이메일": "Email",
  "비밀번호": "Password",
  "비밀번호 확인": "Confirm password",
  "비밀번호 재입력": "Re-enter password",
  "사용자 이름": "Username",
  "로그인 중...": "Logging in...",
  "가입 중...": "Signing up...",
  "로그인 성공!": "Logged in!",
  "회원가입 성공! 로그인해주세요.": "Account created! Please log in.",
  "로그인에 실패했습니다. 다시 시도해주세요.": "Login failed. Please try again.",
  "회원가입에 실패했습니다. 이미 가입된 이메일일 수 있습니다.":
    "Sign-up failed. That email may already be registered.",
  "등록되지 않은 회원입니다. 회원가입을 먼저 진행해주세요.":
    "No account found. Please sign up first.",
  "비밀번호가 올바르지 않습니다.": "Incorrect password.",
  "비밀번호가 일치하지 않습니다.": "Passwords do not match.",
  "비밀번호는 8자 이상이어야 합니다.": "Password must be at least 8 characters.",
  "8자 이상": "8+ characters",
  "홍길동": "Jane Doe",
  "계정이 없으신가요?": "Don't have an account?",
  "이미 계정이 있으신가요?": "Already have an account?",

  // ── 내비게이션 / 화면 제목 ──
  "대시보드": "Dashboard",
  "구독 관리": "Subscriptions",
  "지출 분석": "Analytics",
  "캘린더": "Calendar",
  "서비스 탐색": "Browse services",
  // 원화 환산 토글 (ServicesPage)
  "원화로": "To KRW",
  "원화": "KRW",
  "고시 환율 기준": "reference rate",
  "환율을 가져오지 못했습니다.": "Could not load exchange rates.",
  "직접입력": "Type it in",
  // 비밀번호 재설정
  "비밀번호를 잊으셨나요?": "Forgot your password?",
  "비밀번호 재설정": "Reset password",
  "가입하신 이메일로 재설정 링크를 보내드립니다.": "We'll email you a reset link.",
  "재설정 링크 받기": "Send reset link",
  "보내는 중...": "Sending...",
  "로그인으로 돌아가기": "Back to sign in",
  "메일을 확인해주세요": "Check your email",
  "가입된 주소라면 재설정 링크를 보냈습니다. 링크는 30분 뒤 만료됩니다.":
    "If that address is registered, we've sent a reset link. It expires in 30 minutes.",
  "새 비밀번호 설정": "Set a new password",
  "새 비밀번호": "New password",
  "새 비밀번호 확인": "Confirm new password",
  "영문과 숫자를 포함해 8자 이상": "At least 8 characters, with letters and numbers",
  "영문과 숫자를 포함해 8자 이상으로 입력해주세요.":
    "Use at least 8 characters, including letters and numbers.",
  "비밀번호 변경": "Change password",
  "변경 중...": "Changing...",
  "비밀번호가 서로 다릅니다.": "Passwords do not match.",
  "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.":
    "Password changed. Please sign in with your new password.",
  "유효하지 않은 링크입니다": "Invalid link",
  "재설정 링크를 다시 요청해주세요.": "Please request a new reset link.",
  // 이메일 인증
  "확인 중...": "Verifying...",
  "이메일 주소가 확인되었습니다": "Email address verified",
  "이제 결제일 알림 메일을 받아보실 수 있습니다.":
    "You'll now receive billing reminder emails.",
  "확인하지 못했습니다": "Verification failed",
  "링크가 만료되었거나 유효하지 않습니다. 설정에서 다시 보낼 수 있습니다.":
    "The link is expired or invalid. You can resend it from settings.",
  "SubFlow로 이동": "Go to SubFlow",
  "이메일 주소가 아직 확인되지 않았습니다. 확인 전에는 결제일 알림 메일이 발송되지 않습니다.":
    "Your email address isn't verified yet. Billing reminder emails won't be sent until it is.",
  "인증 메일 다시 받기": "Resend verification email",
  "인증 메일을 다시 보냈습니다.": "Verification email sent again.",
  "잠시 후 다시 시도해주세요.": "Please try again in a moment.",
  "나중에": "Later",
  "설정": "Settings",
  "알림": "Notifications",
  "히스토리": "History",
  "프로필": "Profile",
  "서비스 상세": "Service details",
  "결제 캘린더": "Billing calendar",
  "구독 히스토리": "Subscription history",

  // ── 대시보드 ──
  "오늘도 똑똑하게": "Smart as always",
  "월 총 지출": "Monthly spend",
  "연 예상 지출": "Projected yearly spend",
  "연 예상 비용": "Projected yearly cost",
  "월 예상 비용": "Projected monthly cost",
  "월 평균 지출": "Average monthly spend",
  "활성 구독": "Active subscriptions",
  "다가오는 결제": "Upcoming charges",
  "다음 결제": "Next charge",
  "다음 결제일": "Next billing date",
  "다음 결제 미리보기": "Next charge preview",
  "예정된 결제가 없습니다.": "No upcoming charges.",
  "가장 비싼 구독": "Most expensive subscription",
  "구독 건강 점수": "Subscription health score",
  "오늘의 관리 액션": "Today's actions",
  "이번 달 절약 힌트": "This month's savings tips",
  "이번 달 구독 상태가 안정적이에요": "Your subscriptions look steady this month",
  "절약 후보를 확인해보세요": "Review your savings candidates",
  "중복 구독을 먼저 정리해보세요": "Start by clearing duplicate subscriptions",
  "예산을 먼저 조정해보세요": "Try adjusting your budget first",
  "다음 점검일": "Next review",
  "현재 기준": "As of now",
  "AI 추천 기능은 다음 단계에서 연결할게요.": "AI recommendations are coming in a later step.",

  // ── 구독 ──
  "구독 추가": "Add subscription",
  "구독 등록": "Register subscription",
  "구독 수정": "Edit subscription",
  "구독 추가하러 가기": "Go add a subscription",
  "첫 번째 구독 추가하기": "Add your first subscription",
  "아직 등록된 구독이 없습니다.": "No subscriptions yet.",
  "활성화된 구독이 없습니다.": "No active subscriptions.",
  "이 구독을 삭제하시겠습니까?": "Delete this subscription?",
  "구독이 등록되었습니다!": "Subscription registered!",
  "구독이 추가되었습니다.": "Subscription added.",
  "구독이 수정되었습니다.": "Subscription updated.",
  "구독이 삭제되었습니다.": "Subscription deleted.",
  "구독 등록에 실패했습니다.": "Could not register the subscription.",
  "구독 추가에 실패했습니다.": "Could not add the subscription.",
  "구독 수정에 실패했습니다.": "Could not update the subscription.",
  "구독 삭제에 실패했습니다.": "Could not delete the subscription.",
  "해지하기": "Cancel subscription",
  "구독을 한곳에 모아보세요": "Bring every subscription together",
  "구독을 관리해보세요": "Take control of your subscriptions",
  "지출을 분석하고 절약하세요": "Analyse your spending and save",

  // ── 구독 폼 ──
  "서비스 *": "Service *",
  "플랜 *": "Plan *",
  "비용 *": "Cost *",
  "결제 주기 *": "Billing cycle *",
  "시작일": "Start date",
  "구독 시작일": "Subscription start date",
  "상태": "Status",
  "메모": "Notes",
  "카테고리": "Category",
  "요금제 선택": "Choose a plan",
  "카탈로그에서 선택": "Pick from catalog",
  "직접 입력": "Enter manually",
  "서비스를 선택하세요": "Select a service",
  "서비스 이름을 입력하세요": "Enter a service name",
  "서비스 검색 (예: Netflix, Spotify...)": "Search services (e.g. Netflix, Spotify...)",
  "검색 결과가 없습니다.": "No results.",
  "선택 안함": "Not selected",
  "프리미엄 플랜, 가족 공유 등...": "Premium plan, family sharing, etc.",
  "예: 150,000": "e.g. 150,000",
  "결제 유형": "Payment type",
  "해지 알림이 필요하신가요?": "Want a cancellation reminder?",
  "함께 쓰는 인원 (비용 분담)": "People sharing (cost split)",
  "명이 나눠서 사용": "people sharing",
  "가족과 나눠 쓰면 내 몫만": "Shared plans count only your share",
  "올바른 금액을 입력해주세요.": "Please enter a valid amount.",
  "등록 중...": "Registering...",
  "공식 사이트 →": "Official site →",
  "← 서비스 목록으로": "← Back to services",
  "서비스에서 표시되는 기본 정보": "Basic information shown by the service",
  "서비스 목록을 불러오는데 실패했습니다.": "Could not load the service list.",
  "서비스 정보를 불러오는데 실패했습니다.": "Could not load service details.",

  // ── 분석 ──
  "카테고리별 지출": "Spending by category",
  "월별 지출 추이": "Monthly spending trend",
  "지출 추이": "Spending trend",
  "지출": "Spending",
  "절약 제안": "Savings suggestions",
  "절약 체크": "Savings check",
  "절약 금액": "Savings",
  "절약 가능 금액": "Potential savings",
  "중복 구독 감지": "Duplicate detection",
  "중복 구독 후보": "Possible duplicates",
  "중복 구독과 요금제 기준 추천": "Based on duplicates and plan tiers",
  "무료 체험 추적": "Free-trial tracking",
  "환율 변동 알림": "FX change alerts",
  "가격 변동 알림": "Price change alerts",
  "분석 개요 데이터가 없습니다.": "No analytics overview yet.",
  "지출 추이 데이터가 없습니다.": "No spending trend data yet.",
  "카테고리별 지출 데이터가 없습니다.": "No category spending data yet.",
  "같은 목적의 서비스가 겹치면 구독료가 조용히 커져요. 먼저 겹치는 카테고리부터 확인해보세요.":
    "Overlapping services quietly inflate your bill. Start with the categories that overlap.",
  "비슷한 카테고리의 구독이 겹쳐 있어요. 하나로 묶거나 낮은 요금제를 검토해볼 만합니다.":
    "You have overlapping subscriptions in similar categories. Consider consolidating or downgrading.",
  "사용 빈도와 낮은 요금제를 기준으로 먼저 확인할 후보를 정리했어요.":
    "Here are the first candidates to review, based on usage and cheaper tiers.",
  "다가오는 결제와 가격 변동만 가볍게 확인하면 됩니다.":
    "Just keep an eye on upcoming charges and price changes.",

  // ── 예산 ──
  "월 예산": "Monthly budget",
  "월 예산 설정": "Set monthly budget",
  "예산 소진율": "Budget used",
  "대시보드 예산 소진율의 기준": "Basis for the dashboard budget gauge",
  "예산이 저장되었습니다.": "Budget saved.",
  "예산이 해제되었습니다.": "Budget cleared.",
  "예산 저장에 실패했습니다.": "Could not save the budget.",
  "예산 해제에 실패했습니다.": "Could not clear the budget.",
  "예산을 설정하면 지출 속도를 더 쉽게 볼 수 있어요.":
    "Setting a budget makes your spending pace easier to see.",
  "현재 지출이 월 예산을 넘어서고 있어요. 기준 예산을 조정하거나 구독 정리가 필요합니다.":
    "You are over your monthly budget. Adjust the budget or trim some subscriptions.",

  // ── 알림 ──
  "알림 설정": "Notification settings",
  "알림 시점": "Reminder timing",
  "결제일 알림": "Billing reminders",
  "결제 전에 미리 알려드려요": "We remind you before you are charged",
  "결제 전에 받을 알림 기준": "When to be reminded before billing",
  "결제 3일 전, 1일 전, 당일에 알림을 보내드립니다":
    "We notify you 3 days before, 1 day before, and on the day",
  "알림 설정이 저장되었습니다.": "Notification settings saved.",
  "알림 설정 저장에 실패했습니다.": "Could not save notification settings.",
  "알림 설정을 불러오는데 실패했습니다.": "Could not load notification settings.",
  "아직 알림이 없어요": "No notifications yet",
  "모두 읽음": "Mark all read",
  "알림 삭제": "Delete notification",
  "중복 구독·요금 변동·소식 알림이 여기에 표시됩니다.":
    "Duplicate, price-change and news alerts show up here.",
  "방금 전": "just now",

  // ── 캘린더 ──
  "이번 달 결제 예정": "Due this month",
  "이번 달 결제 예정이 없습니다.": "Nothing due this month.",
  "예상 결제 금액": "Estimated total",
  "일": "Sun", "화": "Tue", "수": "Wed", "목": "Thu", "금": "Fri", "토": "Sat",

  // ── 뉴스 ──
  "AI 소식": "AI news",
  "구독 알림": "Subscription news",
  "내 구독": "My subs",
  "AI 요약 · 헤드라인 기반": "AI summary · headline based",
  "AI 요약 생성 중…": "Generating AI summary...",
  "원문 보기": "Read original",
  "최신 소식이 없습니다.": "No recent news.",
  "소식을 불러오지 못했습니다.": "Could not load the news.",
  "뉴스를 불러오지 못했습니다.": "Could not load the news.",
  "AI가 이 소식의 핵심을 요약한 제목이에요. 전체 기사는 원문에서 확인하세요.":
    "This headline is an AI summary. Read the full article at the source.",
  "구독 서비스 관련 소식이에요. 자세한 내용은 원문에서 확인하세요.":
    "News about subscription services. See the source for details.",

  // ── 오류 신고 ──
  "오류 신고·의견 보내기": "Report a problem",
  "불편한 점을 알려주시면 직접 확인합니다": "Tell us what went wrong and we'll look into it",
  "오류": "Bug",
  "개선 의견": "Idea",
  "기타": "Other",
  "어떤 화면에서 무엇을 하다가 생긴 일인지 적어주시면 큰 도움이 됩니다.":
    "Tell us which screen you were on and what you were doing — it helps a lot.",
  "아래 정보가 같이 전송됩니다": "Sent along with your report",
  "보낸이": "From",
  "화면": "Screen",
  "브라우저": "Browser",
  "휴대폰에서 SubFlow 앱에 로그인하면 이 기기로 알림이 갑니다.":
    "Sign in to the SubFlow app on your phone and notifications will start arriving there.",
  "휴대폰이 연결되어 있습니다.": "Your phone is connected.",
  "회원 탈퇴": "Delete account",
  "계정과 모든 구독 데이터가 삭제되며 되돌릴 수 없습니다.":
    "Your account and all subscription data will be deleted. This cannot be undone.",
  "정말 탈퇴하시겠어요? 구독 내역, 결제 이력, 알림 설정이 모두 사라집니다.":
    "Are you sure? Your subscriptions, payment history and notification settings will all be gone.",
  "확인을 위해 비밀번호를 입력해주세요": "Enter your password to confirm",
  "영구 삭제": "Delete permanently",
  "삭제 중...": "Deleting...",
  "계정이 삭제되었습니다.": "Your account has been deleted.",
  // "비밀번호가 올바르지 않습니다."는 위 공통 항목에 이미 있다
  "사진 첨부": "Attach image",
  "첨부 취소": "Remove attachment",
  "이미지를 첨부하지 못했습니다.": "Could not attach the image.",
  "이미지 파일만 첨부할 수 있습니다.": "Only image files can be attached.",
  "이미지가 너무 큽니다.": "That image is too large.",
  "보내기": "Send",
  "5자 이상 입력해주세요.": "Please enter at least 5 characters.",
  "보내주셔서 감사합니다. 확인 후 반영하겠습니다.": "Thanks — we'll take a look.",
  // "보내는 중...", "잠시 후 다시 시도해주세요."는 위 공통 항목에 이미 있다

  // ── 설정 / 기타 ──
  "계정, 알림, 예산 기준을 한 곳에서 관리합니다.":
    "Manage your account, alerts and budget in one place.",
  "프로필이 업데이트되었습니다.": "Profile updated.",
  "프로필 업데이트에 실패했습니다.": "Could not update your profile.",
  "앱 연동": "App connection",
  "야간 모드로 변경": "Switch to dark mode",
  "라이트 모드로 변경": "Switch to light mode",
  "CSV 내보내기": "Export CSV",
  "내보내는 중...": "Exporting...",
  "CSV 파일을 내보냈습니다.": "CSV exported.",
  "내보내기에 실패했습니다.": "Export failed.",
  "아직 구독 히스토리가 없습니다": "No subscription history yet",
  "구독 변경 이력을 한눈에 확인하세요": "See every change to your subscriptions",
  "히스토리를 불러오는데 실패했습니다.": "Could not load history.",
  "넷플릭스, 유튜브, 스포티파이처럼 흩어진 정기 결제를 한 화면에서 관리해요. 카탈로그에서 고르거나 직접 입력할 수 있어요.":
    "Manage scattered recurring payments like Netflix, YouTube and Spotify on one screen. Pick from the catalog or enter your own.",
  "월·연 지출과 카테고리별 비중을 자동 집계하고, 더 저렴한 요금제나 중복 구독을 찾아 절약 힌트를 드려요.":
    "We total your monthly and yearly spend by category, then surface cheaper tiers and duplicate subscriptions.",
  "다가오는 결제일과 체험 만료, 가격 변동을 알림과 캘린더로 확인하세요. 자동 갱신도 알아서 처리돼요.":
    "Track upcoming charges, trial expiries and price changes via alerts and the calendar. Renewals are handled for you.",
  "함께 쓰는 인원을 입력하면 1인당 비용으로 계산돼요. 대시보드·분석에는 내가 실제 부담하는 금액만 반영됩니다.":
    "Enter how many people share it and we split the cost. Only your share counts toward the dashboard and analytics.",

  // ── 자리표시자를 쓰는 문구 ──
  "{n}건": "{n}",
  "{n}개": "{n}",
  "{n}일 전": "{n}d ago",
  "{n}시간 전": "{n}h ago",
  // 알림함의 "3일 전"(과거)과 설정의 "결제 3일 전"(예정)은 뜻이 달라 키를 분리한다
  "결제 {n}일 전": "{n} days before",
  "{n}분 전": "{n}m ago",
  "{n}개월": "{n} months",
  "{n}년": "{n} years",
  "{n}월": "{n}",
  "{n}번째 안내로 이동": "Go to slide {n}",

  // ── date-fns 포맷 패턴 (표시 문구가 아니라 형식 문자열) ──
  "yyyy년 MM월": "MMMM yyyy",
  "MM월 dd일": "MMM d",
  "M월": "MMM",
  "d일 (EEE)": "d (EEE)",

  // ── 그 밖 ──
  "0원": "₩0",
  "사용": "On",
  "실제 지출": "Actual",
  "예상 지출": "Projected",
  "한국어": "한국어", // 언어 토글 라벨 — 영어 화면에서도 한국어로 보여야 한다
  "이번 달 남은 예산은 {amount}입니다.": "{amount} left in this month's budget.",
  "예산을 {amount} 초과했어요.": "You are {amount} over budget.",
  "현재 {a} / 기준 {b}": "{a} of {b}",
  "{d} 결제": "Due {d}",
  "{d} 결제 일정": "{d} schedule",
  "{d}부터": "from {d}",
  "월 최대 {a}": "up to {a}/mo",
  "월 {a} 절약": "save {a}/mo",
  "월 {a}": "{a}/mo",
  "월 +{a}": "+{a}/mo",
  "현재 환율: 1 USD = {a}": "Rate: 1 USD = {a}",
  "요금제 조정으로 월 최대 {a}까지 줄일 수 있어요.": "Switching plans could save up to {a} a month.",
  "{n}명 분담 · 내 몫": "Split {n} ways · your share",
  "{n}개 요금제": "{n} plans",
  "활성 {n} · 월 예상 비용": "{n} active · projected monthly",
  "· 대시보드·분석에는 내 몫만 반영됩니다": "· only your share counts on the dashboard",
  "내 몫": "Your share",
  "출처": "Source",
  "중복 {a}건, 가격 변동 {b}건, 체험 만료 {c}건 기준입니다.":
    "Based on {a} duplicates, {b} price changes and {c} expiring trials.",
  // ── 카탈로그: 사용자가 직접 넣는 카테고리·서비스 ──
  "카테고리 추가": "Add category",
  "서비스 추가": "Add service",
  "이름 *": "Name *",
  "예: 운동, 반려동물": "e.g. Fitness, Pets",
  "아이콘": "Icon",
  "색": "Color",
  "내가 만든 카테고리": "Categories you added",
  "아직 없습니다.": "None yet.",
  "카테고리를 지워도 구독 기록은 남고 분류만 없어집니다.":
    "Deleting a category keeps your subscriptions; they just lose the label.",
  "카테고리를 추가했습니다.": "Category added.",
  "카테고리를 삭제했습니다.": "Category deleted.",
  "같은 이름의 카테고리가 이미 있습니다.": "A category with that name already exists.",
  "카테고리 추가에 실패했습니다.": "Could not add the category.",
  "카테고리 삭제에 실패했습니다.": "Could not delete the category.",
  "카탈로그에 없는 서비스를 직접 등록합니다. 등록한 서비스는 나에게만 보입니다.":
    "Add a service the catalog doesn't have. Only you can see it.",
  "서비스 이름 *": "Service name *",
  "예: 동네 헬스장": "e.g. Local gym",
  "금액": "Amount",
  "통화": "Currency",
  "결제 주기": "Billing cycle",
  "설명": "Description",
  "선택 입력": "Optional",
  "홈페이지 주소": "Website",
  "기본": "Standard",
  "내 서비스": "Mine",
  "서비스를 추가했습니다.": "Service added.",
  "서비스를 삭제했습니다.": "Service deleted.",
  "같은 이름의 서비스가 이미 있습니다.": "A service with that name already exists.",
  "서비스 추가에 실패했습니다.": "Could not add the service.",
  "서비스 삭제에 실패했습니다.": "Could not delete the service.",
  "'{name}' 서비스를 삭제하시겠습니까?": "Delete the service '{name}'?",

  // ── 요금제 직접 입력 ──
  "요금제 직접 입력": "Add a plan",
  "목록에 없는 요금제를 직접 넣습니다. 추가한 요금제는 나에게만 보입니다.":
    "Add a plan that is not in the list. Plans you add are visible only to you.",
  "요금제 이름 *": "Plan name *",
  "금액 *": "Amount *",
  "예: 모바일 30회 이용권": "e.g. 30-play mobile pass",
  "요금제를 추가했습니다.": "Plan added.",
  "요금제를 삭제했습니다.": "Plan deleted.",
  "같은 이름의 요금제가 이미 있습니다.": "A plan with that name already exists.",
  "요금제 추가에 실패했습니다.": "Could not add the plan.",
  "요금제 삭제": "Delete plan",
  "요금제 삭제에 실패했습니다.": "Could not delete the plan.",
  "'{name}' 요금제를 삭제하시겠습니까?": "Delete the plan '{name}'?",

  // ── 구독 목록 분류 ──
  "분류 전체": "All groups",
  "이 조건에 맞는 구독이 없습니다.": "No subscriptions match these filters.",
};

/**
 * 훅 없이 어디서든 쓰는 번역 함수. 스토어에서 현재 언어를 직접 읽는다.
 * 구독을 걸지 않으므로, 언어를 바꿀 때는 App 루트를 language로 리마운트해
 * 트리 전체가 새 문구로 다시 그려지게 한다(App.tsx의 key 참고).
 *
 *   <h1>{tr("구독 관리")}</h1>
 */
/** 사전 키가 겹치는 동음이의어("월" = 개월/월요일)는 이걸로 직접 분기한다. */
export function currentLang(): Language {
  return (globalThis as { __subflowLang?: Language }).__subflowLang ?? "ko";
}

export function tr(ko: string, params?: Record<string, string | number>): string {
  // 순환 import를 피하려고 여기서 지연 로드한다.
  const lang = (globalThis as { __subflowLang?: Language }).__subflowLang ?? "ko";
  return t(ko, lang, params);
}

export function t(
  ko: string,
  lang: Language,
  params?: Record<string, string | number>
): string {
  let text = lang === "en" ? EN[ko] ?? ko : ko;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

/** date-fns 등 로케일이 필요한 곳에서 쓴다. */
export function localeTag(lang: Language): string {
  return lang === "ko" ? "ko-KR" : "en-US";
}

/**
 * 금액. 한국어는 "102,190원", 영어는 "₩102,190" 처럼 단위 위치가 달라서
 * 문자열 이어붙이기 대신 이 함수로 통일한다.
 */
export function fmtMoney(value: number | string, currency = "KRW"): string {
  const n = Number(value) || 0;
  if (currency !== "KRW") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  }
  return currentLang() === "en"
    ? "₩" + new Intl.NumberFormat("en-US").format(n)
    : new Intl.NumberFormat("ko-KR").format(n) + "원";
}

/** 개수 단위. 한국어의 개/건/일 은 영어에서 접미사가 없거나 형태가 다르다. */
export function fmtCount(value: number, unit: "개" | "건" | "일" | "개월" | "년"): string {
  const n = Number(value) || 0;
  if (currentLang() === "ko") return `${n}${unit}`;
  switch (unit) {
    case "개":
    case "건":
      return String(n);
    case "일":
      return n === 1 ? "1 day" : `${n} days`;
    case "개월":
      return n === 1 ? "1 month" : `${n} months`;
    case "년":
      return n === 1 ? "1 year" : `${n} years`;
  }
}
