import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/common/ProtectedRoute";
import Layout from "./components/layout/Layout";
import LoginPage from "./pages/LoginPage";
import VerifyEmailPage from "./pages/VerifyEmailPage";
import DashboardPage from "./pages/DashboardPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import CalendarPage from "./pages/CalendarPage";
import SettingsPage from "./pages/SettingsPage";
import ServicesPage from "./pages/ServicesPage";
import TimelinePage from "./pages/TimelinePage";
import { useSettingsStore } from "./store/settingsStore";

export default function App() {
  // 언어가 바뀌면 트리를 통째로 다시 그린다. 덕분에 화면마다 훅을 심지 않고
  // 모듈 함수 tr()만으로 번역이 반영된다.
  const language = useSettingsStore((s) => s.language);

  return (
    <BrowserRouter key={language}>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* 비밀번호가 없어졌다. 예전 링크·즐겨찾기는 코드 로그인으로 보낸다 */}
        <Route path="/register" element={<Navigate to="/login" replace />} />
        <Route path="/forgot-password" element={<Navigate to="/login" replace />} />
        <Route path="/reset-password" element={<Navigate to="/login" replace />} />
        {/* 로그인 없이도 열 수 있어야 한다 — 메일함에서 바로 누르기 때문 */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/timeline" element={<TimelinePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
