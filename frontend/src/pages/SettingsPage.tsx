import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Bell, ImagePlus, Mail, MessageSquareWarning, Smartphone, TriangleAlert, User, WalletCards, X } from "lucide-react";
import { authApi } from "../api/auth";
import { notificationApi } from "../api/notifications";
import { collectClientInfo, feedbackApi, prepareScreenshot, type FeedbackType } from "../api/feedback";
import { useAuthStore } from "../store/authStore";
import type { NotificationSettings } from "../types/notification";
import { tr } from "../i18n/translations";

/** 입력값에서 숫자만 남긴다. "150,000" → "150000" */
const digitsOnly = (v: string) => v.replace(/[^0-9]/g, "");

/**
 * 입력 중에도 천 단위로 끊어 보여준다. 150000처럼 붙여 놓으면
 * 자릿수가 한눈에 안 들어와 15만인지 150만인지 헷갈린다.
 */
const withCommas = (v: string) => {
  const n = digitsOnly(v);
  return n ? Number(n).toLocaleString("ko-KR") : "";
};

export default function SettingsPage() {
  const { user, setUser, logout } = useAuthStore();
  const [username, setUsername] = useState(user?.username ?? "");
  const [notifSettings, setNotifSettings] = useState<NotificationSettings | null>(null);
  const [notifyDays, setNotifyDays] = useState(3);
  const [emailNotif, setEmailNotif] = useState(true);
  const [pushNotif, setPushNotif] = useState(false);
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [fxAlerts, setFxAlerts] = useState(true);
  const [budgetMonthly, setBudgetMonthly] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    notificationApi
      .getSettings()
      .then((settings) => {
        setNotifSettings(settings);
        setNotifyDays(settings.notify_days_before);
        setEmailNotif(settings.email_notifications);
        setPushNotif(settings.push_notifications);
        setBudgetAlerts(settings.budget_alerts ?? true);
        setFxAlerts(settings.fx_alerts ?? true);
        setBudgetMonthly(settings.budget_monthly != null ? withCommas(String(settings.budget_monthly)) : "");
      })
      .catch(() => {
        toast.error(tr("알림 설정을 불러오는데 실패했습니다."));
      });
  }, []);

  // ── 오류 신고 ──
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("bug");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [shot, setShot] = useState<{ filename: string; content_base64: string } | null>(null);
  const [shotPreview, setShotPreview] = useState<string | null>(null);

  // ── 회원 탈퇴 ──
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    if (!deletePassword) return;
    setDeleting(true);
    try {
      await authApi.deleteAccount(deletePassword);
      toast.success(tr("계정이 삭제되었습니다."));
      logout();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || tr("비밀번호가 올바르지 않습니다."));
    } finally {
      setDeleting(false);
    }
  };

  // 화면 경로는 설정 페이지에서 열었으므로 고정이지만, 창 크기는 그때그때 다르다
  const clientInfo = collectClientInfo();

  const handlePickScreenshot = async (file: File | undefined) => {
    if (!file) return;
    try {
      const prepared = await prepareScreenshot(file);
      setShot(prepared);
      setShotPreview(`data:image/jpeg;base64,${prepared.content_base64}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("이미지를 첨부하지 못했습니다."));
    }
  };

  const handleFeedbackSend = async () => {
    if (feedbackMessage.trim().length < 5) {
      toast.error(tr("5자 이상 입력해주세요."));
      return;
    }
    setSendingFeedback(true);
    try {
      await feedbackApi.send(feedbackType, feedbackMessage.trim(), shot);
      // 발송 실패도 서버가 로그로 받아 두므로 사용자에겐 접수됐다고 알린다
      toast.success(tr("보내주셔서 감사합니다. 확인 후 반영하겠습니다."));
      setFeedbackMessage("");
      setShot(null);
      setShotPreview(null);
    } catch {
      toast.error(tr("잠시 후 다시 시도해주세요."));
    } finally {
      setSendingFeedback(false);
    }
  };

  const handleProfileSave = async () => {
    setSaving(true);
    try {
      const updated = await authApi.updateMe({ username });
      setUser(updated);
      toast.success(tr("프로필이 업데이트되었습니다."));
    } catch {
      toast.error(tr("프로필 업데이트에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const handleNotifSave = async () => {
    setSaving(true);
    try {
      const updated = await notificationApi.updateSettings({
        notify_days_before: notifyDays,
        email_notifications: emailNotif,
        push_notifications: pushNotif,
        fx_alerts: fxAlerts,
      });
      setNotifSettings(updated);
      toast.success(tr("알림 설정이 저장되었습니다."));
    } catch {
      toast.error(tr("알림 설정 저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const handleBudgetSave = async () => {
    setSaving(true);
    try {
      const digits = digitsOnly(budgetMonthly);
      const value = digits === "" ? null : Number(digits);
      if (value !== null && (Number.isNaN(value) || value <= 0)) {
        toast.error(tr("올바른 금액을 입력해주세요."));
        setSaving(false);
        return;
      }
      const updated = await notificationApi.updateSettings({
        budget_monthly: value,
        budget_alerts: budgetAlerts,
      });
      setNotifSettings(updated);
      setBudgetMonthly(updated.budget_monthly != null ? withCommas(String(updated.budget_monthly)) : "");
      toast.success(tr("예산이 저장되었습니다."));
    } catch {
      toast.error(tr("예산 저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  const handleBudgetClear = async () => {
    setSaving(true);
    try {
      const updated = await notificationApi.updateSettings({ budget_monthly: null });
      setNotifSettings(updated);
      setBudgetMonthly("");
      toast.success(tr("예산이 해제되었습니다."));
    } catch {
      toast.error(tr("예산 해제에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{tr("설정")}</h2>
        <p className="mt-1 text-sm text-slate-400">{tr("계정, 알림, 예산 기준을 한 곳에서 관리합니다.")}</p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
        <section className="glass p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr("프로필")}</h3>
              <p className="text-xs text-slate-400">{tr("서비스에서 표시되는 기본 정보")}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-500">{tr("이메일")}</label>
              <input
                type="email"
                value={user?.email ?? ""}
                disabled
                className="glass-input mt-1 block w-full rounded-lg px-3 py-2 text-slate-400 opacity-60"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-500">{tr("사용자 이름")}</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="mt-5 flex justify-end">
            <button onClick={handleProfileSave} disabled={saving} className="btn-primary-glass px-4 py-2 text-sm font-medium disabled:opacity-50">{tr("저장")}</button>
          </div>
        </section>

        <section className="glass p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr("알림 설정")}</h3>
              <p className="text-xs text-slate-400">{tr("결제 전에 받을 알림 기준")}</p>
            </div>
          </div>

          {notifSettings ? (
            <>
              <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
                <div>
                  <label className="block text-sm font-medium text-slate-500">{tr("결제일 알림")}</label>
                  <select
                    value={notifyDays}
                    onChange={(e) => setNotifyDays(Number(e.target.value))}
                    className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {[1, 2, 3, 5, 7, 14].map((day) => (
                      <option key={day} value={day}>
                        {tr("결제 {n}일 전", { n: day })}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setEmailNotif(!emailNotif)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      emailNotif ? "bg-indigo-100 text-indigo-700 shadow-sm" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Mail className="h-4 w-4" />
                    {tr("이메일")} {emailNotif ? tr("켜짐") : tr("꺼짐")}
                  </button>
                  <button
                    onClick={() => setPushNotif(!pushNotif)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition ${
                      pushNotif ? "bg-violet-100 text-violet-700 shadow-sm" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    <Smartphone className="h-4 w-4" />
                    {tr("앱 연동")} {pushNotif ? tr("켜짐") : tr("꺼짐")}
                  </button>
                </div>
                {/* 켜 두어도 기기가 붙어 있지 않으면 아무것도 못 간다.
                    왜 안 오는지 모르는 상태로 두지 않는다. */}
                {/* 외화 구독이 없으면 올 일이 없지만, 있는 사람은 오르내릴 때마다
                    받게 되므로 끌 수 있어야 한다. 앱과 같은 값을 본다. */}
                <label className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={fxAlerts}
                    onChange={(e) => setFxAlerts(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-500">{tr("외화 구독 환율 변동 알림 받기")}</span>
                </label>

                {pushNotif && notifSettings && !notifSettings.push_device_connected && (
                  <p className="mt-2 text-xs text-amber-600">
                    {tr("휴대폰에서 SubFlow 앱에 로그인하면 이 기기로 알림이 갑니다.")}
                  </p>
                )}
                {pushNotif && notifSettings?.push_device_connected && (
                  <p className="mt-2 text-xs text-slate-400">
                    {tr("휴대폰이 연결되어 있습니다.")}
                  </p>
                )}
              </div>

              <div className="mt-5 flex justify-end">
                <button onClick={handleNotifSave} disabled={saving} className="btn-primary-glass px-4 py-2 text-sm font-medium disabled:opacity-50">{tr("저장")}</button>
              </div>
            </>
          ) : (
            <div className="flex justify-center py-6">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
            </div>
          )}
        </section>

        <section className="glass p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100/80 text-emerald-700">
              <WalletCards className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr("월 예산 설정")}</h3>
              <p className="text-xs text-slate-400">{tr("대시보드 예산 소진율의 기준")}</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="block text-sm font-medium text-slate-500">{tr("월 예산")}</label>
              <input
                type="text"
                inputMode="numeric"
                value={budgetMonthly}
                onChange={(e) => setBudgetMonthly(withCommas(e.target.value))}
                placeholder={tr("예: 150,000")}
                className="glass-input mt-1 block w-full rounded-lg px-3 py-2 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={handleBudgetSave} disabled={saving} className="btn-primary-glass px-4 py-2 text-sm font-medium disabled:opacity-50">{tr("저장")}</button>
              {notifSettings?.budget_monthly != null && (
                <button
                  onClick={handleBudgetClear}
                  disabled={saving}
                  className="btn-danger-glass px-4 py-2 text-sm font-medium disabled:opacity-50"
                >{tr("해제")}</button>
              )}
            </div>
          </div>

          {/* 예산은 보고 싶은데 알림은 싫은 경우가 있다. 예산을 지우지 않고
              알림만 끌 수 있게 둔다. 앱과 같은 값을 본다. */}
          <label className="mt-4 flex items-start gap-2">
            <input
              type="checkbox"
              checked={budgetAlerts}
              onChange={(e) => setBudgetAlerts(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-500">
              {tr("예산의 80%를 넘으면 알려주기")}
              <span className="mt-0.5 block text-xs text-slate-400">
                {tr("끄면 예산은 그대로 두고 알림만 오지 않습니다. 저장을 눌러야 반영됩니다.")}
              </span>
            </span>
          </label>
        </section>

        <section className="glass p-6">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">{tr("현재 기준")}</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/50 p-4">
              <p className="text-xs text-slate-400">{tr("알림 시점")}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{tr("결제 {n}일 전", { n: notifyDays })}</p>
            </div>
            <div className="rounded-2xl bg-white/50 p-4">
              <p className="text-xs text-slate-400">{tr("이메일")}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{emailNotif ? tr("사용") : tr("미사용")}</p>
            </div>
            <div className="rounded-2xl bg-white/50 p-4">
              <p className="text-xs text-slate-400">{tr("앱 연동")}</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{pushNotif ? tr("사용") : tr("미사용")}</p>
            </div>
          </div>
        </section>

        <section className="glass p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
              <MessageSquareWarning className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr("오류 신고·의견 보내기")}</h3>
              <p className="text-xs text-slate-400">{tr("불편한 점을 알려주시면 직접 확인합니다")}</p>
            </div>
          </div>

          <div className="flex gap-1.5">
            {(["bug", "suggestion", "other"] as FeedbackType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFeedbackType(t)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  feedbackType === t
                    ? "bg-indigo-600 text-white"
                    : "glass text-slate-500 hover:bg-white/40"
                }`}
              >
                {t === "bug" ? tr("오류") : t === "suggestion" ? tr("개선 의견") : tr("기타")}
              </button>
            ))}
          </div>

          <textarea
            value={feedbackMessage}
            onChange={(e) => setFeedbackMessage(e.target.value)}
            maxLength={2000}
            rows={4}
            placeholder={tr("어떤 화면에서 무엇을 하다가 생긴 일인지 적어주시면 큰 도움이 됩니다.")}
            className="glass-input mt-3 block w-full resize-none rounded-lg px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          {/* 스크린샷 — 글로 설명하기 어려운 화면은 한 장이 훨씬 빠르다 */}
          <div className="mt-3 flex items-center gap-3">
            <label className="glass inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-white/40">
              <ImagePlus className="h-4 w-4" />
              {tr("사진 첨부")}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  handlePickScreenshot(e.target.files?.[0]);
                  e.target.value = "";   // 같은 파일을 다시 골라도 onChange가 뜨도록
                }}
              />
            </label>
            {shotPreview && (
              <div className="relative">
                <img src={shotPreview} alt="" className="h-12 w-20 rounded-md object-cover" />
                <button
                  type="button"
                  onClick={() => { setShot(null); setShotPreview(null); }}
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-slate-700 p-0.5 text-white"
                  aria-label={tr("첨부 취소")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          {/* 무엇이 함께 가는지 값을 그대로 보여 준다 — 문구로만 적으면 짐작할 수 없다.
              다만 값만 늘어놓으면 "/settings · Chrome · 1707x898"이 무슨 뜻인지
              알 수 없으므로 항목 이름을 붙인다. */}
          <div className="mt-3 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-slate-400">{tr("아래 정보가 같이 전송됩니다")}</p>
              <dl className="mt-1 space-y-0.5 text-xs">
                {[
                  [tr("보낸이"), user?.email],
                  [tr("화면"), clientInfo.screen],
                  [tr("브라우저"), `${clientInfo.browser} · ${clientInfo.viewport}`],
                ].map(([label, value]) =>
                  value ? (
                    <div key={label} className="flex gap-2">
                      <dt className="w-14 shrink-0 text-slate-400">{label}</dt>
                      <dd className="truncate text-slate-500">{value}</dd>
                    </div>
                  ) : null
                )}
              </dl>
            </div>
            <button
              onClick={handleFeedbackSend}
              disabled={sendingFeedback}
              className="btn-primary-glass shrink-0 px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              {sendingFeedback ? tr("보내는 중...") : tr("보내기")}
            </button>
          </div>
        </section>

        {/* 회원 탈퇴 — 스토어 심사(Apple 5.1.1(v))가 앱 안에서의 계정 삭제를
            요구하고, 개인정보보호법상으로도 탈퇴 수단이 있어야 한다.

            평소에는 눈에 띌 이유가 없는 기능이라 다른 카드와 같은 회색 톤으로 두고,
            버튼도 저장 버튼들과 같은 오른쪽 아래에 놓는다. 붉은색은 실제로 지우기
            직전 확인 단계에만 쓴다 — 항상 빨갛게 두면 경고가 배경음이 된다. */}
        <section className="glass p-6 xl:col-span-2">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{tr("회원 탈퇴")}</h3>
              <p className="text-xs text-slate-400">
                {tr("계정과 모든 구독 데이터가 삭제되며 되돌릴 수 없습니다.")}
              </p>
            </div>
          </div>

          {!deleteOpen ? (
            <div className="flex justify-end">
              <button
                onClick={() => setDeleteOpen(true)}
                className="glass px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-600"
              >
                {tr("회원 탈퇴")}
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-rose-50/60 p-4">
              <p className="text-sm text-rose-700">
                {tr("정말 탈퇴하시겠어요? 구독 내역, 결제 이력, 알림 설정이 모두 사라집니다.")}
              </p>
              <label className="mt-3 block text-sm font-medium text-slate-500">
                {tr("확인을 위해 비밀번호를 입력해주세요")}
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="glass-input mt-1 block w-full max-w-sm rounded-lg px-3 py-2 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  onClick={() => { setDeleteOpen(false); setDeletePassword(""); }}
                  className="glass px-4 py-2 text-sm font-medium text-slate-500"
                >
                  {tr("취소")}
                </button>
                <button
                  onClick={handleDeleteAccount}
                  disabled={!deletePassword || deleting}
                  className="btn-danger-glass px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {deleting ? tr("삭제 중...") : tr("영구 삭제")}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
