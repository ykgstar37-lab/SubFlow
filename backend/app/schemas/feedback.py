import enum

from pydantic import BaseModel, EmailStr, Field


class FeedbackType(str, enum.Enum):
    BUG = "bug"
    SUGGESTION = "suggestion"
    OTHER = "other"


class FeedbackScreenshot(BaseModel):
    """신고에 붙이는 이미지 한 장.

    별도 저장소를 두지 않고 메일 첨부로 흘려보낸다. 스크린샷은 신고를 받은
    뒤 한 번 보면 끝이라 보관할 이유가 없고, 저장소를 붙이면 수명 관리와
    접근 권한까지 따라온다.
    """

    filename: str = Field(max_length=120)
    # data: URL 접두사를 뗀 순수 base64
    content_base64: str


class FeedbackRequest(BaseModel):
    """사용자가 보내는 오류 신고·의견.

    본문 외에 클라이언트가 아는 것들(앱 버전, 화면 이름 등)을 client에 담아 보낸다.
    "안 돼요" 한 줄만 오면 재현할 수가 없어서, 화면과 버전만이라도 같이 받는다.
    """

    type: FeedbackType = FeedbackType.BUG
    # 길이로 거르지 않는다. "안 됨" 세 글자여도 화면·기기 정보가 함께 오고,
    # 무엇보다 쓰려는 사람을 문턱에서 막는 편이 손해다. 빈 값만 막는다.
    message: str = Field(min_length=1, max_length=2000)
    # 자유 형식. 어떤 키가 오든 메일 본문에 그대로 적는다.
    # 값이 길어지면 메일이 못 읽게 되므로 개수와 길이는 서버에서 자른다.
    client: dict[str, str] = Field(default_factory=dict)
    screenshot: FeedbackScreenshot | None = None


class ContactRequest(BaseModel):
    """랜딩 페이지에서 보내는 문의. 로그인 없이 받는다.

    가입 전 사람이 묻는 창구라 계정이 없다. 대신 답장을 보낼 주소를 필수로
    받는다 — 주소가 없으면 읽고도 답을 줄 수가 없다.
    """

    email: EmailStr
    message: str = Field(min_length=5, max_length=2000)
    name: str | None = Field(default=None, max_length=60)
    # 스팸 봇은 보이는 칸을 전부 채우고 간다. 사람에게는 감춰 둔 칸이라
    # 여기에 값이 들어와 있으면 사람이 쓴 글이 아니다.
    website: str | None = None


class FeedbackResponse(BaseModel):
    sent: bool
