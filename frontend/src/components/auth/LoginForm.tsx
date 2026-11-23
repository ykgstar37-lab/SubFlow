import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { authApi } from "../../api/auth";
import { useAuthStore } from "../../store/authStore";
import { tr } from "../../i18n/translations";

/**
 * 웹은 비밀번호 없이 이메일 6자리 코드로 들어간다.
 * 앱에서 설정 > 이메일 연결을 해 둔 주소면 앱과 같은 구독이 보이고,
 * 처음 보는 주소면 새 계정이 만들어진다.
 */
export default function LoginForm() {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login, setUser } = useAuthStore();

  const sendCode = async () => {
    setLoading(true);
    try {
      await authApi.sendEmailCode(email.trim());
      setCode("");
      setStep("code");
      toast.success(tr("확인 코드를 보냈습니다. 메일함을 확인해주세요."));
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 429
          ? tr("잠시 후 다시 보내주세요.")
          : tr("메일을 보내지 못했습니다. 잠시 후 다시 시도해주세요."),
      );
    } finally {
      setLoading(false);
    }
  };

  const verify = async () => {
    setLoading(true);
    try {
      const tokens = await authApi.loginWithCode(email.trim(), code);
      login(tokens.access_token, tokens.refresh_token);
      const user = await authApi.getMe();
      setUser(user);
      navigate("/");
    } catch {
      toast.error(tr("코드가 맞지 않거나 만료되었습니다. 코드를 다시 받아주세요."));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (step === "email") sendCode();
    else if (code.length === 6) verify();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-mesh">
      <div className="glass w-full max-w-md p-8">
        {/* 로그인 화면만 펜 스타일 워드마크를 쓴다. 아웃라인이라 라이트/다크
            어느 쪽에서도 같은 이미지로 읽혀 BrandLogo(2장 전환)가 필요 없다. */}
        <img
          src="/brand/subflow-logo-pen-point.png"
          alt="SubFlow"
          className="mx-auto mb-8 h-10 w-auto"
        />
        <form onSubmit={handleSubmit} className="space-y-4">
          {step === "email" ? (
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-500">
                {tr("이메일")}
              </label>
              <input
                id="login-email"
                type="email"
                name="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="email@example.com"
              />
              <p className="mt-2 text-xs text-slate-400">
                {tr("앱의 설정 > 이메일 연결에서 쓴 주소를 넣으면 앱과 같은 구독이 보여요.")}
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="login-code" className="block text-sm font-medium text-slate-500">
                {tr("확인 코드")}
              </label>
              <p className="mt-1 text-xs text-slate-400">
                {tr("{email}로 보낸 6자리 코드를 넣어주세요. 10분 동안 쓸 수 있어요.", { email: email.trim() })}
              </p>
              <input
                id="login-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                required
                autoFocus
                className="glass-input mt-2 block w-full rounded-lg px-3 py-2 text-center text-2xl tracking-[0.5em] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="000000"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={loading || (step === "code" && code.length !== 6)}
            className="btn-primary-glass w-full px-4 py-2 font-medium disabled:opacity-50"
          >
            {loading ? tr("잠시만요...") : step === "email" ? tr("코드 받기") : tr("들어가기")}
          </button>
        </form>
        {step === "code" && (
          <div className="mt-4 flex justify-between text-sm">
            <button type="button" onClick={() => setStep("email")} className="text-slate-500 hover:underline">
              {tr("이메일 바꾸기")}
            </button>
            <button type="button" onClick={sendCode} disabled={loading} className="text-blue-600 hover:underline">
              {tr("코드 다시 받기")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
