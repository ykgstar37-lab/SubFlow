"""알림 메일의 HTML 껍데기.

지금까지 메일을 평문으로만 보내서, 받은 편지함에서 글머리표만 늘어선 메모처럼
보였다. 같은 내용을 HTML로도 실어 보낸다(평문은 폴백으로 계속 함께 보낸다).

메일 클라이언트는 브라우저가 아니다. 여기서 지키는 규칙:
- 레이아웃은 table로 짠다. Outlook은 flex/grid를 모른다.
- 스타일은 전부 인라인. <style> 블록은 Gmail이 상황에 따라 떼어 버린다.
- 외부 이미지를 쓰지 않는다. 기본 설정에서 차단돼 깨진 칸만 남는다.
  로고도 이미지 대신 글자로 그린다.
- 색은 명시적으로 준다. 다크 모드에서 배경만 뒤집혀 글자가 사라지는 걸 막는다.
"""

from html import escape

from app.config import settings

#: 메일 머리의 로고. frontend/public/brand/ 에 있는 파일을 웹앱 주소로 부른다.
#: 흰 카드 위에 얹히므로 검정 버전을 쓴다 — point(연한 하늘색) 버전은 거의 안 보인다.
LOGO_FILE = "subflow-logo-pen-black.png"
#: 원본이 1330×276이라 이 비율로 줄인다. 메일에서는 width/height를 명시해야
#: 이미지가 늦게 오거나 차단됐을 때 레이아웃이 무너지지 않는다.
LOGO_WIDTH = 130
LOGO_HEIGHT = 27

BRAND = "#4A90D9"
INK = "#1F2A37"
MUTED = "#6B7D8E"
LINE = "#E8EFF5"
CANVAS = "#F4F7FA"


def render_email(
    heading: str,
    items: list[tuple[str, str | None]],
    cta_label: str | None = None,
    cta_url: str | None = None,
    footer: str | None = None,
) -> str:
    """알림 메일 HTML을 만든다.

    items는 (제목, 부연) 쌍의 목록이다. 부연은 없으면 None.
    """
    rows = []
    for i, (title, sub) in enumerate(items):
        top_border = "" if i == 0 else f"border-top:1px solid {LINE};"
        sub_html = (
            f'<div style="margin-top:4px;font-size:13px;line-height:20px;color:{MUTED};">{escape(sub)}</div>'
            if sub
            else ""
        )
        rows.append(
            f'<tr><td style="padding:14px 0;{top_border}">'
            f'<div style="font-size:15px;line-height:22px;font-weight:600;color:{INK};">{escape(title)}</div>'
            f"{sub_html}"
            f"</td></tr>"
        )
    items_html = "".join(rows)

    cta_html = ""
    if cta_label and cta_url:
        # align 속성을 함께 준다. Outlook은 td의 text-align을 무시할 때가 있다.
        cta_html = (
            f'<tr><td align="center" style="padding-top:24px;text-align:center;">'
            f'<a href="{escape(cta_url, quote=True)}" '
            f'style="display:inline-block;background:{BRAND};color:#FFFFFF;'
            f"text-decoration:none;font-size:14px;font-weight:700;"
            f'padding:12px 22px;border-radius:10px;">{escape(cta_label)}</a>'
            f"</td></tr>"
        )

    footer_html = ""
    if footer:
        # 구분선은 두지 않는다. 버튼 바로 아래에 선이 깔리면 버튼을 가로지르는
        # 것처럼 보인다. 여백만으로 충분히 나뉜다.
        footer_html = (
            f'<tr><td style="padding-top:22px;'
            f'font-size:12px;line-height:18px;color:{MUTED};">{escape(footer)}</td></tr>'
        )

    logo = f"{settings.APP_BASE_URL.rstrip('/')}/brand/{LOGO_FILE}"

    return f"""\
<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(heading)}</title></head>
<body style="margin:0;padding:0;background:{CANVAS};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
       style="background:{CANVAS};padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="max-width:480px;background:#FFFFFF;border-radius:16px;
                  border:1px solid {LINE};padding:28px 26px;
                  font-family:-apple-system,'Segoe UI','Malgun Gothic',sans-serif;">
      <tr><td style="padding-bottom:18px;">
        <!-- 이미지가 차단되면 alt가 대신 보인다. 그때도 로고처럼 읽히도록
             글자 스타일을 img에 직접 얹어 둔다. -->
        <img src="{logo}" alt="SubFlow" width="{LOGO_WIDTH}" height="{LOGO_HEIGHT}"
             style="display:block;border:0;outline:none;text-decoration:none;
                    font-size:18px;font-weight:800;color:{BRAND};letter-spacing:-0.4px;">
      </td></tr>
      <tr><td style="font-size:19px;line-height:27px;font-weight:700;color:{INK};padding-bottom:6px;">
        {escape(heading)}
      </td></tr>
      <tr><td>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          {items_html}
        </table>
      </td></tr>
      {cta_html}
      {footer_html}
    </table>
  </td></tr>
</table>
</body></html>"""
