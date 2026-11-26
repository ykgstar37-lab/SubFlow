import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import api from './api';
import { formatPrice } from '../constants/currency';
import { LOGO_KEYS } from '../constants/logoKeys';
import { BRAND_BG, FULL_BLEED } from '../components/ServiceLogo';
import { useSettingsStore } from '../store/settingsStore';

/**
 * 홈 화면 위젯에 결제 일정을 넘긴다.
 *
 * 위젯(targets/widget/SubFlowWidget.swift)은 네트워크를 쓰지 않고 App Group에
 * 앱이 써 둔 JSON만 읽는다. 그래서 앱을 열거나 닫을 때마다 여기서 새로 써 준다.
 * 이번 달 1일부터 석 달 치를 넣어 두면, 며칠 앱을 안 열어도 위젯이 자정마다
 * '오늘'을 옮기며 계속 맞게 보인다.
 */

const APP_GROUP = 'group.app.mysubflow';
const KEY = 'widget';

type Storage = { set: (k: string, v: string) => void };
let storage: Storage | null = null;
let reload: (() => void) | null = null;

function native() {
  if (Platform.OS !== 'ios') return false;
  if (storage) return true;
  try {
    // 앱 안의 로컬 모듈(modules/widget-storage). @bacons/apple-targets의 ExtensionStorage는
    // 최소 iOS 16.4라 앱(15.1)에 자동 연결되지 않아 빌드 18·19에서 위젯이 비어 있었다.
    // 위젯 이전 빌드나 Expo Go에서는 null이라 조용히 건너뛴다.
    const mod = requireOptionalNativeModule<{
      setString: (key: string, value: string, group: string) => boolean;
      hasGroup: (group: string) => boolean;
      reloadWidgets: () => void;
    }>('WidgetStorage');
    if (!mod) return false;
    if (!mod.hasGroup(APP_GROUP)) {
      status = 'no-app-group';
      return false;
    }
    storage = { set: (k, v) => { mod.setString(k, v, APP_GROUP); } };
    reload = () => mod.reloadWidgets();
    return true;
  } catch {
    return false;
  }
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let running: Promise<void> | null = null;

/** 마지막으로 위젯에 넘긴 결과. 설정 맨 아래에 작게 보여서 위젯이 비어 있을 때 어디서 막혔는지 본다 */
let status = '';
const stamp = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
export const widgetStatus = () => status;

export function syncWidget(): Promise<void> {
  if (!native()) {
    if (Platform.OS === 'ios' && status !== 'no-app-group') status = 'module-missing';
    return Promise.resolve();
  }
  running = running ?? doSync().finally(() => { running = null; });
  return running;
}

async function doSync() {
  try {
    const [evRes, rateRes] = await Promise.all([
      api.get('/subscriptions/calendar-events'),
      api.get('/analytics/exchange-rates').catch(() => null),
    ]);
    const rates: Record<string, number> = {};
    Object.entries(rateRes?.data?.rates ?? {}).forEach(([k, v]) => { rates[k] = Number(v); });

    const now = new Date();
    const from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
    const to = ymd(new Date(now.getFullYear(), now.getMonth() + 3, 0));

    const seen = new Set<string>();
    const events: Record<string, unknown>[] = [];
    const byDay: Record<string, { amount: number; currency: string; paidKrw: number | null }[]> = {};

    for (const ev of (evRes.data?.events ?? []) as any[]) {
      const d = String(ev.date ?? '').slice(0, 10);
      if (!d || d < from || d > to) continue;
      const name = String(ev.service_name ?? '');
      const dedup = `${d}|${name}`;
      if (seen.has(dedup)) continue;
      seen.add(dedup);

      const logo = LOGO_KEYS[name];
      const brand = BRAND_BG[name];
      events.push({
        d,
        n: name,
        ...(logo ? { l: logo, f: FULL_BLEED.has(name) } : { bg: brand?.bg ?? '#6B7D8E', fg: brand?.text ?? '#FFFFFF' }),
      });
      (byDay[d] ??= []).push({
        amount: Number(ev.cost ?? 0),
        currency: String(ev.currency ?? 'KRW'),
        paidKrw: ev.paid_krw != null ? Number(ev.paid_krw) : null,
      });
    }

    // 그날 합계. 통화가 하나면 그 통화로, 섞이면 원화로 환산한다(환율이 없으면 통화별로 나열)
    const totals: Record<string, string> = {};
    for (const [d, list] of Object.entries(byDay)) {
      const currencies = [...new Set(list.map((x) => x.currency))];
      if (currencies.length === 1) {
        totals[d] = formatPrice(list.reduce((a, x) => a + x.amount, 0), currencies[0]);
      } else if (list.every((x) => x.currency === 'KRW' || x.paidKrw != null || rates[x.currency])) {
        // 실제 결제 원화를 넣어 둔 구독은 환율 대신 그 값으로 더한다
        const won = (x: (typeof list)[number]) =>
          x.currency === 'KRW' ? x.amount : x.paidKrw ?? x.amount * rates[x.currency];
        totals[d] = formatPrice(list.reduce((a, x) => a + won(x), 0), 'KRW');
      } else {
        totals[d] = currencies
          .map((c) => formatPrice(list.filter((x) => x.currency === c).reduce((a, x) => a + x.amount, 0), c))
          .join(' + ');
      }
    }

    // 외화가 낀 날은 원화로 얼마인지 작게 병기한다(작은 위젯 합계 옆 파란 글씨).
    // 사용자가 '실제 결제 금액'을 넣어 둔 구독은 그 값을, 아니면 환율 환산값을 쓴다.
    // 전부 실제 금액이면 '≈' 없이, 하나라도 환산이면 '≈'를 붙인다.
    // 섞인 날은 합계가 이미 원화라 병기하지 않는다.
    const krw: Record<string, string> = {};
    for (const [d, list] of Object.entries(byDay)) {
      if (list.every((x) => x.currency === 'KRW')) continue;
      if (totals[d]?.startsWith('₩')) continue;
      let sum = 0;
      let approx = false;
      let ok = true;
      for (const x of list) {
        if (x.currency === 'KRW') sum += x.amount;
        else if (x.paidKrw != null) sum += x.paidKrw;
        else if (rates[x.currency]) { sum += x.amount * rates[x.currency]; approx = true; }
        else ok = false;
      }
      if (ok) krw[d] = `${approx ? '≈' : ''}₩${Math.round(sum).toLocaleString()}`;
    }

    const lang = useSettingsStore.getState().language ?? 'ko';
    storage!.set(KEY, JSON.stringify({ events, totals, krw, lang }));
    reload?.();
    status = `ok ${events.length} ${stamp()}`;
  } catch (e: any) {
    // 위젯은 다음에 다시 맞춘다. 앱 사용을 막지 않는다
    status = `err ${e?.response?.status ?? e?.message ?? e} ${stamp()}`;
  }
}
