export interface User {
  id: string;
  /** 앱에서 이메일을 붙이지 않은 기기 계정은 비어 있다. 웹은 이메일로만 들어오므로 늘 있다. */
  email: string | null;
  username: string;
  is_active: boolean;
  /** 이메일 주소 확인 여부. 미확인이면 알림 메일이 나가지 않는다. */
  email_verified: boolean;
  created_at: string;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

