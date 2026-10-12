import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  BellOff,
  Copy,
  Tag,
  TrendingUp,
  Sparkles,
  Hourglass,
  Wallet,
  Calendar,
  ArrowLeftRight,
  FileText,
  X,
  ExternalLink,
  type LucideIcon,
} from "lucide-react";
import { useInbox } from "../../hooks/useInbox";
import type { NotificationItem } from "../../types/notification";
import { tr } from "../../i18n/translations";

const TYPE_STYLE: Record<string, { icon: LucideIcon; color: string; bg: string }> = {
  overlap: { icon: Copy, color: "text-amber-600", bg: "bg-amber-50" },
  price_change: { icon: Tag, color: "text-rose-600", bg: "bg-rose-50" },
  price_news: { icon: TrendingUp, color: "text-rose-600", bg: "bg-rose-50" },
  ai_news: { icon: Sparkles, color: "text-violet-600", bg: "bg-violet-50" },
  trial_expiry: { icon: Hourglass, color: "text-sky-600", bg: "bg-sky-50" },
  budget: { icon: Wallet, color: "text-amber-600", bg: "bg-amber-50" },
  renewal: { icon: Calendar, color: "text-indigo-600", bg: "bg-indigo-50" },
  exchange_rate: { icon: ArrowLeftRight, color: "text-sky-600", bg: "bg-sky-50" },
  contract_end: { icon: FileText, color: "text-amber-600", bg: "bg-amber-50" },
};

const LINK_MAP: Record<string, string> = {
  "/analytics": "/analytics",
  "/subscriptions": "/subscriptions",
  "/calendar": "/calendar",
  "/catalog": "/services",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return tr("방금 전");
  if (min < 60) return tr("{n}분 전", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return tr("{n}시간 전", { n: hr });
  return tr("{n}일 전", { n: Math.floor(hr / 24) });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { items, unreadCount, loading, markRead, markAllRead, dismiss } = useInbox();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleItem = (item: NotificationItem) => {
    if (!item.is_read) markRead(item.id);
    const route = item.link ? LINK_MAP[item.link] : null;
    if (route) {
      setOpen(false);
      navigate(route);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={tr("알림")}
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/50 text-slate-600 transition hover:bg-white/80"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full border-2 border-white bg-rose-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/60 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.14)] dark:border-white/10">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-bold text-slate-800">{tr("알림")}</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >{tr("모두 읽음")}</button>
            )}
          </div>

          <div className="custom-scrollbar max-h-[420px] overflow-y-auto">
            {loading && items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-slate-400">{tr("불러오는 중…")}</div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-50">
                  <BellOff className="h-6 w-6 text-slate-300" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{tr("아직 알림이 없어요")}</p>
                <p className="text-xs text-slate-400">{tr("중복 구독·요금 변동·소식 알림이 여기에 표시됩니다.")}</p>
              </div>
            ) : (
              <ul>
                {items.map((item) => {
                  const ts = TYPE_STYLE[item.type] ?? {
                    icon: Bell,
                    color: "text-indigo-600",
                    bg: "bg-indigo-50",
                  };
                  const Icon = ts.icon;
                  return (
                    <li
                      key={item.id}
                      className={`group relative flex cursor-pointer gap-3 border-b border-slate-50 px-4 py-3 transition hover:bg-slate-50 ${
                        item.is_read ? "" : "bg-indigo-50/40"
                      }`}
                      onClick={() => handleItem(item)}
                    >
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ts.bg}`}>
                        <Icon className={`h-4 w-4 ${ts.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          {item.category && (
                            <span className={`truncate text-[11px] font-semibold ${ts.color}`}>
                              {item.category}
                            </span>
                          )}
                          <span className="shrink-0 text-[11px] text-slate-400">
                            {timeAgo(item.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-sm font-semibold text-slate-800">
                          {item.title}
                        </p>
                        {item.body && (
                          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.body}</p>
                        )}
                        {item.action_url && (
                          <a
                            href={item.action_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                          >
                            {item.action_label || tr("바로가기")}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        {!item.is_read && <span className="mt-1 h-2 w-2 rounded-full bg-rose-500" />}
                        <button
                          type="button"
                          aria-label={tr("알림 삭제")}
                          onClick={(e) => {
                            e.stopPropagation();
                            dismiss(item.id);
                          }}
                          className="rounded-full p-1 text-slate-300 opacity-0 transition hover:bg-slate-100 hover:text-slate-500 group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
