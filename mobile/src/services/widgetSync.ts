import { Platform } from 'react-native';
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
    // 위젯 네이티브 모듈이 없는 빌드(Expo Go, 위젯 이전 버전)에서는 조용히 건너뛴다
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { ExtensionStorage } = require('@bacons/apple-targets');
    storage = new ExtensionStorage(APP_GROUP);
    reload = () => ExtensionStorage.reloadWidget();
    return true;
  } catch {
    return false;
  }
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

let running: Promise<void> | null = null;

export function syncWidget(): Promise<void> {
  if (!native()) return Promise.resolve();
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
    const byDay: Record<string, { amount: number; currency: string }[]> = {};

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
      (byDay[d] ??= []).push({ amount: Number(ev.cost ?? 0), currency: String(ev.currency ?? 'KRW') });
    }

    // 그날 합계. 통화가 하나면 그 통화로, 섞이면 원화로 환산한다(환율이 없으면 통화별로 나열)
    const totals: Record<string, string> = {};
    for (const [d, list] of Object.entries(byDay)) {
      const currencies = [...new Set(list.map((x) => x.currency))];
      if (currencies.length === 1) {
        totals[d] = formatPrice(list.reduce((a, x) => a + x.amount, 0), currencies[0]);
      } else if (currencies.every((c) => c === 'KRW' || rates[c])) {
        totals[d] = formatPrice(list.reduce((a, x) => a + x.amount * (x.currency === 'KRW' ? 1 : rates[x.currency]), 0), 'KRW');
      } else {
        totals[d] = currencies
          .map((c) => formatPrice(list.filter((x) => x.currency === c).reduce((a, x) => a + x.amount, 0), c))
          .join(' + ');
      }
    }

    const lang = useSettingsStore.getState().language ?? 'ko';
    storage!.set(KEY, JSON.stringify({ events, totals, lang }));
    reload?.();
  } catch {
    // 위젯은 다음에 다시 맞춘다. 앱 사용을 막지 않는다
  }
}
