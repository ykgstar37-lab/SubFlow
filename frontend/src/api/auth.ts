import type { TokenPair, User } from "../types/auth";
import apiClient from "./client";

export const authApi = {
  /** 6자리 코드를 메일로 보낸다. 가입 여부와 상관없이 같은 답을 준다. */
  sendEmailCode: (email: string) =>
    apiClient.post<{ message: string }>("/auth/email/code", { email }).then((r) => r.data),

  /** 이메일 코드로 들어간다. 처음 보는 주소면 계정이 만들어진다. */
  loginWithCode: (email: string, code: string) =>
    apiClient.post<TokenPair>("/auth/email/login", { email, code }).then((r) => r.data),

  refresh: (refreshToken: string) =>
    apiClient
      .post<TokenPair>("/auth/refresh", { refresh_token: refreshToken })
      .then((r) => r.data),

  getMe: () => apiClient.get<User>("/auth/me").then((r) => r.data),

  updateMe: (data: Partial<User>) =>
    apiClient.put<User>("/auth/me", data).then((r) => r.data),

  verifyEmail: (token: string) =>
    apiClient
      .post<{ message: string }>("/auth/verify-email", { token })
      .then((r) => r.data),

  resendVerification: () =>
    apiClient
      .post<{ message: string }>("/auth/verify-email/resend")
      .then((r) => r.data),

  /** 계정과 모든 데이터를 삭제한다 (복구 불가). 비밀번호가 없으니 화면에서 확인받고 confirm을 보낸다. */
  deleteAccount: () =>
    apiClient
      .delete<{ message: string }>("/auth/me", { data: { confirm: true } })
      .then((r) => r.data),
};
