import { useState } from "react";
import { tr } from "../../i18n/translations";

export type RentalItem = { name: string; icon: string };

// 렌탈로 흔히 빌리는 기기. 모바일(mobile/src/components/RentalItemPicker.tsx)과
// 같은 목록이라야 한쪽에서 고른 기기가 다른 쪽에서 '직접 추가'로 보이지 않는다.
export const RENTAL_PRESETS: RentalItem[] = [
  { name: "정수기", icon: "💧" },
  { name: "공기청정기", icon: "🍃" },
  { name: "가습기", icon: "💦" },
  { name: "제습기", icon: "☁️" },
  { name: "에어컨", icon: "❄️" },
  { name: "비데", icon: "🚽" },
  { name: "안마의자", icon: "💆" },
  { name: "매트리스", icon: "🛏️" },
  { name: "세탁기", icon: "🧺" },
  { name: "건조기", icon: "👕" },
  { name: "식기세척기", icon: "🍽️" },
  { name: "냉장고", icon: "🧊" },
];

const CUSTOM_ICONS = ["📦", "🔌", "📺", "🧹", "🛁", "🍚", "☕", "🌡️", "🎮", "💡", "🪴", "✨"];

interface Props {
  value: RentalItem | null;
  onChange: (item: RentalItem | null) => void;
  /** 내가 다른 렌탈에 직접 붙였던 기기들 */
  extras?: RentalItem[];
}

export default function RentalItemPicker({ value, onChange, extras = [] }: Props) {
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customIcon, setCustomIcon] = useState(CUSTOM_ICONS[0]);

  const presetNames = new Set(RENTAL_PRESETS.map((p) => p.name));
  const items = [...RENTAL_PRESETS];
  for (const e of [...extras, ...(value ? [value] : [])]) {
    if (!presetNames.has(e.name) && !items.some((i) => i.name === e.name)) items.push(e);
  }

  const saveCustom = () => {
    const name = customName.trim();
    if (!name) return;
    onChange({ name: name.slice(0, 30), icon: customIcon });
    setAdding(false);
    setCustomName("");
  };

  return (
    <div>
      <div className="grid grid-cols-5 gap-y-3 sm:grid-cols-7">
        {items.map((item) => {
          const active = value?.name === item.name;
          return (
            <button
              key={item.name}
              type="button"
              // 고른 걸 한 번 더 누르면 해제된다
              onClick={() => onChange(active ? null : item)}
              className="flex flex-col items-center gap-1"
            >
              <span
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-2xl transition-colors ${
                  active ? "border-blue-500 bg-blue-100" : "border-slate-200 bg-white/60 hover:border-blue-300"
                }`}
              >
                {item.icon}
              </span>
              <span className={`max-w-full truncate text-xs ${active ? "font-bold text-blue-600" : "text-slate-500"}`}>
                {tr(item.name)}
              </span>
            </button>
          );
        })}
        <button type="button" onClick={() => setAdding((v) => !v)} className="flex flex-col items-center gap-1">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-2xl text-slate-400 hover:border-blue-300">
            +
          </span>
          <span className="text-xs text-slate-500">{tr("직접 추가")}</span>
        </button>
      </div>

      {adding && (
        <div className="mt-3 space-y-3 rounded-lg border border-slate-200 bg-white/50 p-3">
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            onKeyDown={(e) => {
              // 폼 안이라 엔터가 구독 저장으로 새지 않게 막는다
              if (e.key === "Enter") {
                e.preventDefault();
                saveCustom();
              }
            }}
            maxLength={30}
            autoFocus
            placeholder={tr("기기 이름 (예: 커피머신)")}
            className="glass-input block w-full rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex flex-wrap gap-1.5">
            {CUSTOM_ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                onClick={() => setCustomIcon(ic)}
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg ${
                  customIcon === ic ? "border-blue-500 bg-blue-100" : "border-slate-200 bg-white"
                }`}
              >
                {ic}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveCustom}
              disabled={!customName.trim()}
              className="btn-primary-glass px-4 py-1.5 text-sm font-medium disabled:opacity-40"
            >
              {tr("추가")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
