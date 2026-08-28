import React, { useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Pressable,
  Linking,
  Animated,
  Alert,
  PanResponder,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useTranslation } from '../../src/hooks/useTranslation';
import { subscriptionAPI, analyticsAPI, servicesAPI } from '../../src/services/api';
import { useServices, useCategories, type CatalogService } from '../../src/hooks/useApi';
import { SERVICE_TAGLINES } from '../../src/constants/serviceTaglines';
import { ServiceLogo } from '../../src/components/ServiceLogo';
import { AppLogoMark } from '../../src/components/AppLogoMark';
import { CatalogAddModal } from '../../src/components/CatalogAddModal';
import { GradientButton } from '../../src/components/GradientButton';
import {
  Colors,
  Spacing,
  FontSize,
  FontWeight,
  BorderRadius,
  Shadow,
  TabBarSpace,
} from '../../src/constants/theme';

interface Category {
  name: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
}

// 카테고리 목록 자체는 서버에서 받는다(사용자가 만든 것이 섞이므로).
// 다만 기본 13종의 아이콘·색은 앱 쪽 감각으로 고른 값이라 여기 남겨 둔다.
const DEFAULT_CATEGORY_STYLE: Record<string, { icon: Category['icon']; color: string }> = {
  Entertainment: { icon: 'tv', color: '#E50914' },
  Music: { icon: 'musical-notes', color: '#1DB954' },
  'Photo & Video': { icon: 'camera', color: '#E1306C' },
  'Developer Tools': { icon: 'code-slash', color: '#24292E' },
  'Cloud/Infrastructure': { icon: 'cloud', color: '#FF9900' },
  Productivity: { icon: 'briefcase', color: '#D83B01' },
  Education: { icon: 'school', color: '#0056D2' },
  Books: { icon: 'book', color: '#8B5E3C' },
  Gaming: { icon: 'game-controller', color: '#107C10' },
  'Health & Fitness': { icon: 'fitness', color: '#FC4C02' },
  'News & Media': { icon: 'newspaper', color: '#000000' },
  Storage: { icon: 'folder', color: '#3693F5' },
  'Security & VPN': { icon: 'shield-checkmark', color: '#4687FF' },
  Lifestyle: { icon: 'heart', color: '#03C75A' },
};

interface Plan {
  id: number;
  name: string;
  price: number;
  currency: string;
  billingCycle: string;   // MONTHLY | YEARLY | WEEKLY | QUARTERLY
  /** 내가 직접 넣은 요금제인지. 기본 카탈로그 요금제는 지울 수 없다. */
  isCustom: boolean;
  /** 이 가격에 부가세가 들어 있는지. 국내 소비자가는 포함, 해외 웹 결제는 별도. */
  vatIncluded: boolean;
}

interface Service {
  id: number;
  name: string;
  category: string;
  description: string;
  website?: string;
  cancelUrl?: string;
  /** 검색용 보조어. 'Netflix'를 '넷플릭스'로도 찾게 해준다. */
  aliases: string[];
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  plans: Plan[];
  /** 내가 직접 등록한 서비스인지. 기본 카탈로그는 지울 수 없다. */
  isCustom: boolean;
}

const CURRENCY_SYMBOL: Record<string, string> = { KRW: '₩', USD: '$', EUR: '€', GBP: '£', JPY: '¥' };

/** 백엔드 서비스 응답을 화면이 쓰는 모양으로 옮긴다. */
function toService(raw: CatalogService): Service {
  return {
    id: raw.id,
    name: raw.name,
    category: raw.category?.name ?? '',
    // 카드 한 줄에 들어갈 짧은 문구가 있으면 그걸 쓰고, 없으면 서버 설명으로 넘어간다
    description: SERVICE_TAGLINES[raw.name] ?? raw.description ?? '',
    website: raw.website_url ?? undefined,
    cancelUrl: raw.cancel_url ?? undefined,
    aliases: raw.aliases ?? [],
    isCustom: raw.is_custom ?? false,
    minPrice: raw.min_price === null || raw.min_price === undefined ? null : Number(raw.min_price),
    maxPrice: raw.max_price === null || raw.max_price === undefined ? null : Number(raw.max_price),
    currency: raw.currency ?? null,
    plans: (raw.plans ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      currency: p.currency,
      billingCycle: String(p.billing_cycle ?? 'MONTHLY').toUpperCase(),
      isCustom: p.is_custom ?? false,
      vatIncluded: p.vat_included ?? true,
    })),
  };
}

/** 부가세 별도 요금제의 실제 결제액. 서버도 같은 계산을 한다(app/utils/vat.py).
 *  해외 웹 결제는 청구서에 10%가 더 붙는다($20짜리가 $22로 빠진다). */
function withVat(plan: Plan): number {
  if (plan.vatIncluded) return plan.price;
  const raw = plan.price * 1.1;
  return plan.currency === 'KRW' ? Math.round(raw) : Math.round(raw * 100) / 100;
}

/** 금액 하나를 통화에 맞춰 적는다. 원화는 소수점 없이, 외화는 둘째 자리까지. */
function formatMoney(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency] ?? '';
  const n = currency === 'KRW'
    ? Math.round(amount).toLocaleString()
    : Number(amount.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
  return `${symbol}${n}`;
}

const PLAN_CURRENCIES = ['KRW', 'USD', 'EUR', 'JPY'];
const PLAN_CYCLES: { value: string; ko: string; en: string }[] = [
  { value: 'monthly', ko: '월간', en: 'Monthly' },
  { value: 'yearly', ko: '연간', en: 'Yearly' },
  { value: 'weekly', ko: '주간', en: 'Weekly' },
  { value: 'quarterly', ko: '분기', en: 'Quarterly' },
];

const CYCLE_SUFFIX: Record<string, { ko: string; en: string }> = {
  MONTHLY: { ko: '/월', en: '/mo' },
  YEARLY: { ko: '/연', en: '/yr' },
  WEEKLY: { ko: '/주', en: '/wk' },
  QUARTERLY: { ko: '/분기', en: '/qtr' },
};

/** 환율표로 원화 환산. 원화이거나 환율이 없으면 원래 금액을 그대로 돌려준다. */
function toKrw(amount: number, currency: string, rates: Record<string, number>): { amount: number; currency: string } {
  const rate = currency === 'KRW' ? undefined : rates[currency];
  return rate ? { amount: amount * rate, currency: 'KRW' } : { amount, currency };
}

/** 요금제 한 줄에 쓰는 "금액/주기". 0원짜리(무료)에는 주기를 붙이지 않는다. */
function formatPlanPrice(plan: Plan, showKrw: boolean, rates: Record<string, number>, lang: string): string {
  const m = showKrw ? toKrw(plan.price, plan.currency, rates) : { amount: plan.price, currency: plan.currency };
  const price = formatMoney(m.amount, m.currency);
  if (plan.price === 0) return price;
  const suffix = CYCLE_SUFFIX[plan.billingCycle] ?? CYCLE_SUFFIX.MONTHLY;
  return `${price}${lang === 'ko' ? suffix.ko : suffix.en}`;
}

/**
 * 카드에 쓰는 가격 범위. 최저가와 최고가가 같으면 한 값만 적고,
 * 다르면 반복되는 통화 기호를 떼서 한 줄에 들어갈 확률을 높인다.
 *   5,500~17,000원 → '₩5,500~17,000'
 */
function formatPriceRange(service: Service, showKrw: boolean, rates: Record<string, number>): string {
  const { minPrice, maxPrice, currency } = service;
  if (minPrice === null || !currency) return '';
  const lo = showKrw ? toKrw(minPrice, currency, rates) : { amount: minPrice, currency };
  if (maxPrice === null || maxPrice === minPrice) return formatMoney(lo.amount, lo.currency);
  const hi = showKrw ? toKrw(maxPrice, currency, rates) : { amount: maxPrice, currency };
  const hiText = formatMoney(hi.amount, hi.currency);
  const symbol = CURRENCY_SYMBOL[hi.currency] ?? '';
  return `${formatMoney(lo.amount, lo.currency)}~${symbol && hiText.startsWith(symbol) ? hiText.slice(symbol.length) : hiText}`;
}

// 캘린더 헬퍼
function getDaysInMonth(year: number, month: number) { return new Date(year, month + 1, 0).getDate(); }
function getFirstDayOfMonth(year: number, month: number) { return new Date(year, month, 1).getDay(); }
const CAL_DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const CAL_DAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const CAL_MONTHS_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const CAL_MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function CatalogScreen() {
  // 카탈로그는 백엔드가 원본이다. 앱에 목록을 박아 두면 요금이 바뀔 때마다
  // 스토어 심사를 새로 받아야 하고, 웹과 값이 갈라진다.
  const { data: rawServices, loading, error, refetch } = useServices();
  const services = useMemo(() => (rawServices ?? []).map(toService), [rawServices]);

  // 카테고리도 서버가 원본이다. 기본 13종에 내가 만든 것이 뒤에 붙어 내려온다.
  const { data: rawCategories, refetch: refetchCategories } = useCategories();
  const categories = useMemo(() => rawCategories ?? [], [rawCategories]);
  const categoryPills = useMemo<Category[]>(() => [
    { name: 'All', icon: 'apps', color: Colors.primary },
    ...categories.map((c) => ({
      name: c.name,
      icon: DEFAULT_CATEGORY_STYLE[c.name]?.icon ?? 'pricetag',
      color: c.color ?? DEFAULT_CATEGORY_STYLE[c.name]?.color ?? Colors.primary,
    })),
  ], [categories]);

  // 카탈로그에 없는 것을 직접 넣는 두 갈래 — 분류(카테고리)와 항목(서비스)
  const [addMode, setAddMode] = useState<'category' | 'service' | null>(null);

  const [selectedCategory, setSelectedCategory] = useState('All');
  const { t, language } = useTranslation();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // 시트를 아래로 끌어 닫기. 시트 안이 ScrollView라, 스크롤이 맨 위일 때만
  // 제스처를 가로채야 목록 스크롤과 싸우지 않는다.
  const sheetScrollY = useRef(0);

  // 원화 환산 토글 + 환율표 (카탈로그 가격은 서비스 공시가라 구독 API와 무관)
  const [showKrw, setShowKrw] = useState(false);
  const [rates, setRates] = useState<Record<string, number>>({});
  const [ratesAsOf, setRatesAsOf] = useState<string | null>(null);

  // 구독 추가 폼 상태
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [startDate, setStartDate] = useState('');
  const [billingDate, setBillingDate] = useState('');
  const [activePickerField, setActivePickerField] = useState<'start' | 'next' | null>(null);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 요금제 직접 입력 — 카탈로그가 실제 요금제를 다 담지 못해서 둔 칸
  const [planFormOpen, setPlanFormOpen] = useState(false);
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState('');
  const [newPlanCurrency, setNewPlanCurrency] = useState('KRW');
  const [newPlanCycle, setNewPlanCycle] = useState('monthly');
  // 대개는 청구서에 찍힌 실결제액을 그대로 적으므로 꺼진 게 기본이다.
  // 공식 가격표(부가세 별도)를 보고 적을 때만 켠다.
  const [newPlanVatSeparate, setNewPlanVatSeparate] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);

  // 캘린더 데이터
  const calDaysInMonth = getDaysInMonth(calYear, calMonth);
  const calFirstDay = getFirstDayOfMonth(calYear, calMonth);
  const calendarCells = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < calFirstDay; i++) cells.push(null);
    for (let i = 1; i <= calDaysInMonth; i++) cells.push(i);
    return cells;
  }, [calYear, calMonth, calDaysInMonth, calFirstDay]);

  const selectedDay = useMemo(() => {
    const dateStr = activePickerField === 'start' ? startDate : billingDate;
    if (!dateStr) return -1;
    const d = new Date(dateStr);
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) return d.getDate();
    return -1;
  }, [startDate, billingDate, calYear, calMonth, activePickerField]);

  const openModal = (service: Service) => {
    setSelectedService(service);
    setSelectedPlan(null);
    setActivePickerField(null);
    setIsSubmitting(false);
    resetPlanForm();
    // 기본 시작일: 오늘
    const today = new Date();
    setStartDate(today.toISOString().split('T')[0]);
    // 기본 다음 결제일: 한 달 뒤
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    setBillingDate(next.toISOString().split('T')[0]);
    setCalYear(next.getFullYear());
    setCalMonth(next.getMonth());

    setModalVisible(true);
    fadeAnim.setValue(0);
    slideAnim.setValue(600);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }),
    ]).start();
  };

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setModalVisible(false);
      setSelectedService(null);
    });
  };

  // 원화 환산 토글. 환율은 처음 켤 때 한 번만 받아 온다(서버도 1시간 캐시).
  const toggleKrw = async () => {
    if (!showKrw && Object.keys(rates).length === 0) {
      try {
        const res = await analyticsAPI.getExchangeRates();
        const raw = (res.data?.rates ?? {}) as Record<string, string | number>;
        const parsed: Record<string, number> = {};
        Object.keys(raw).forEach((k) => { parsed[k] = Number(raw[k]); });
        setRates(parsed);
        setRatesAsOf(res.data?.as_of ?? null);
      } catch {
        Alert.alert(
          language === 'ko' ? '환율을 가져오지 못했습니다' : 'Could not load exchange rates',
          language === 'ko' ? '잠시 후 다시 시도해주세요.' : 'Please try again later.',
        );
        return;
      }
    }
    setShowKrw((v) => !v);
  };

  // 시트 드래그 — 손잡이만 잡히던 것을 시트 전체로 넓힌다.
  // 아래로 120px 넘게 끌거나 빠르게 튕기면 닫고, 아니면 제자리로 되돌린다.
  const sheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        sheetScrollY.current <= 0 && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) slideAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          closeModal();
        } else {
          Animated.spring(slideAnim, {
            toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const handleDateSelect = (day: number) => {
    const mm = String(calMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const dateVal = `${calYear}-${mm}-${dd}`;
    if (activePickerField === 'start') {
      setStartDate(dateVal);
    } else {
      setBillingDate(dateVal);
    }
    setActivePickerField(null);
  };

  const openDatePicker = (field: 'start' | 'next') => {
    if (activePickerField === field) {
      setActivePickerField(null);
      return;
    }
    const dateStr = field === 'start' ? startDate : billingDate;
    if (dateStr) {
      const d = new Date(dateStr);
      setCalYear(d.getFullYear());
      setCalMonth(d.getMonth());
    }
    setActivePickerField(field);
  };

  const renderCalendarPicker = () => (
    <View style={styles.calendarPicker}>
      <View style={styles.calNav}>
        <TouchableOpacity onPress={() => { if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); } else setCalMonth(m => m - 1); }}>
          <Ionicons name="chevron-back" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
        <Text style={styles.calNavTitle}>
          {language === 'ko' ? `${calYear}년 ${CAL_MONTHS_KO[calMonth]}` : `${CAL_MONTHS_EN[calMonth]} ${calYear}`}
        </Text>
        <TouchableOpacity onPress={() => { if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); } else setCalMonth(m => m + 1); }}>
          <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />
        </TouchableOpacity>
      </View>
      <View style={styles.calWeekRow}>
        {(language === 'ko' ? CAL_DAYS_KO : CAL_DAYS_EN).map((d, i) => (
          <Text key={i} style={styles.calWeekDay}>{d}</Text>
        ))}
      </View>
      <View style={styles.calGrid}>
        {calendarCells.map((day, i) => {
          const isSelected = day === selectedDay;
          const now = new Date();
          const isToday = day === now.getDate() && calMonth === now.getMonth() && calYear === now.getFullYear();
          return (
            <View key={i} style={styles.calCell}>
              {day && (
                <TouchableOpacity
                  style={[styles.calDayBtn, isSelected && styles.calDaySelected, isToday && !isSelected && styles.calDayToday]}
                  onPress={() => handleDateSelect(day)}
                >
                  <Text style={[styles.calDayText, isSelected && styles.calDayTextSelected, isToday && !isSelected && { color: Colors.primary }]}>
                    {day}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );

  const handleSubscribe = async () => {
    if (!selectedService) return;
    if (!selectedPlan) {
      Alert.alert(
        language === 'ko' ? '요금제 선택' : 'Select Plan',
        language === 'ko' ? '요금제를 먼저 선택해주세요.' : 'Please select a plan first.',
      );
      return;
    }

    setIsSubmitting(true);
    try {
      // 카탈로그 구독은 서비스·요금제 id만 넘긴다. 금액·통화·결제주기·카테고리·로고를
      // 서버가 카탈로그에서 직접 읽어 붙이므로 화면에 보이는 문자열을 되파싱할 일이 없고,
      // service_id/plan_id가 남아 요금 인상 이력·절약 제안이 이 구독을 알아본다.
      await subscriptionAPI.createFromCatalog({
        service_id: selectedService.id,
        plan_id: selectedPlan!.id,
        start_date: startDate,
        next_billing_date: billingDate,
        status: 'active',
        auto_renew: true,
        is_recurring: true,
      });
      Alert.alert(
        language === 'ko' ? '구독 추가 완료' : 'Subscription Added',
        language === 'ko'
          ? `${selectedService.name} ${selectedPlan?.name ?? ''} 구독이 추가되었습니다.`
          : `${selectedService.name} ${selectedPlan?.name ?? ''} has been added.`,
      );
      closeModal();
    } catch (e: any) {
      Alert.alert(
        language === 'ko' ? '오류' : 'Error',
        e?.response?.data?.detail || (language === 'ko' ? '구독 추가에 실패했습니다.' : 'Failed to add subscription.'),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 기본 13종은 사전에 번역이 있고, 사용자가 만든 이름은 없다. t()는 키가 없으면
  // 키를 그대로 돌려주므로 그때는 원래 이름을 쓴다.
  const categoryLabel = (name: string) => {
    const key = `category.${name}`;
    const label = t(key as any);
    return label === key ? name : label;
  };

  const resetPlanForm = () => {
    setPlanFormOpen(false);
    setNewPlanName('');
    setNewPlanPrice('');
    setNewPlanCurrency('KRW');
    setNewPlanCycle('monthly');
    setNewPlanVatSeparate(false);
    setSavingPlan(false);
  };

  /** 켜면 금액 칸을 부가세까지 더한 실결제액으로 바꾸고, 끄면 되돌린다.
   *  플래그로 들고 있다가 나중에 계산하지 않는다 — 눈에 보이는 금액이
   *  그대로 저장되는 편이 헷갈리지 않는다. */
  const toggleNewPlanVat = () => {
    const next = !newPlanVatSeparate;
    setNewPlanVatSeparate(next);
    const amount = Number(newPlanPrice);
    if (!newPlanPrice.trim() || Number.isNaN(amount)) return;
    const raw = next ? amount * 1.1 : amount / 1.1;
    const rounded = newPlanCurrency === 'KRW' ? Math.round(raw) : Math.round(raw * 100) / 100;
    setNewPlanPrice(String(rounded));
  };

  const handleAddPlan = async () => {
    if (!selectedService) return;
    const name = newPlanName.trim();
    if (!name || !newPlanPrice.trim()) return;

    setSavingPlan(true);
    try {
      const res = await servicesAPI.createPlan(selectedService.id, {
        name,
        price: Number(newPlanPrice),
        currency: newPlanCurrency,
        billing_cycle: newPlanCycle,
        // 금액 칸이 이미 실결제액이다(부가세를 켰으면 더해 놓았다)
        vat_included: true,
      });
      const plan: Plan = {
        id: res.data.id,
        name: res.data.name,
        price: Number(res.data.price),
        currency: res.data.currency,
        billingCycle: String(res.data.billing_cycle ?? 'MONTHLY').toUpperCase(),
        isCustom: true,
        vatIncluded: res.data.vat_included ?? true,
      };
      // 열려 있는 시트에 바로 얹고 고른 상태로 둔다. 목록도 다시 읽어
      // 카드의 가격 범위를 맞춘다.
      setSelectedService({ ...selectedService, plans: [...selectedService.plans, plan] });
      setSelectedPlan(plan);
      resetPlanForm();
      refetch();
    } catch (e: any) {
      Alert.alert(
        language === 'ko' ? '오류' : 'Error',
        e?.response?.status === 400
          ? (language === 'ko' ? '같은 이름의 요금제가 이미 있습니다.' : 'A plan with that name already exists.')
          : (language === 'ko' ? '요금제를 추가하지 못했습니다.' : 'Could not add the plan.'),
      );
      setSavingPlan(false);
    }
  };

  const handleDeletePlan = (plan: Plan) => {
    if (!selectedService) return;
    Alert.alert(
      language === 'ko' ? '요금제 삭제' : 'Delete plan',
      language === 'ko'
        ? `'${plan.name}'을(를) 삭제할까요? 이미 등록한 구독은 그대로 남습니다.`
        : `Delete '${plan.name}'? Subscriptions you already added stay as they are.`,
      [
        { text: language === 'ko' ? '취소' : 'Cancel', style: 'cancel' },
        {
          text: language === 'ko' ? '삭제' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await servicesAPI.removePlan(selectedService.id, plan.id);
              setSelectedService({
                ...selectedService,
                plans: selectedService.plans.filter((p) => p.id !== plan.id),
              });
              setSelectedPlan((cur) => (cur?.id === plan.id ? null : cur));
              refetch();
            } catch {
              Alert.alert(
                language === 'ko' ? '오류' : 'Error',
                language === 'ko' ? '삭제하지 못했습니다.' : 'Could not delete.',
              );
            }
          },
        },
      ],
    );
  };

  const handleDeleteService = (service: Service) => {
    Alert.alert(
      language === 'ko' ? '서비스 삭제' : 'Delete service',
      language === 'ko'
        ? `'${service.name}'을(를) 삭제할까요? 이미 등록한 구독은 그대로 남습니다.`
        : `Delete '${service.name}'? Subscriptions you already added stay as they are.`,
      [
        { text: language === 'ko' ? '취소' : 'Cancel', style: 'cancel' },
        {
          text: language === 'ko' ? '삭제' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await servicesAPI.remove(service.id);
              closeModal();
              refetch();
            } catch {
              Alert.alert(
                language === 'ko' ? '오류' : 'Error',
                language === 'ko' ? '삭제하지 못했습니다.' : 'Could not delete.'
              );
            }
          },
        },
      ]
    );
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return services.filter((s) => {
      const matchCategory = selectedCategory === 'All' || s.category === selectedCategory;
      const matchSearch = q === '' ||
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        // 한국에서 쓰는 이름이 등록된 이름과 다른 경우가 많다 (Melon ↔ 멜론)
        s.aliases.some((a) => a.toLowerCase().includes(q));
      return matchCategory && matchSearch;
    });
  }, [services, selectedCategory, searchQuery]);

  return (
    <LinearGradient colors={[Colors.primaryBg, Colors.background]} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* 헤더 */}
        <View style={styles.header}>
            <View style={styles.headerLeft}>
                <AppLogoMark />
            </View>
            <View style={styles.headerRight}>
                <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/(tabs)/calendar')}>
                <Ionicons name="notifications-outline" size={20} color={Colors.textWhite} />
                </TouchableOpacity>
                <View style={styles.headerAvatar}>
                   <Ionicons name="person" size={16} color={Colors.primary} />
                </View>
            </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* 타이틀 및 검색 바 */}
          <View style={styles.pageHeader}>
             <Text style={styles.subTitle}>{t('catalog.subtitle')}</Text>
             <Text style={styles.mainTitle}>{t('catalog.title')}</Text>

             <View style={styles.searchPill}>
                <Ionicons name="search" size={18} color={Colors.textTertiary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder={t('catalog.searchPlaceholder')}
                  placeholderTextColor={Colors.textTertiary}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                />
                {searchQuery !== '' && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                )}
             </View>
          </View>

          {/* 카테고리 필터 */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
             {categoryPills.map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={[styles.categoryPill, selectedCategory === cat.name && styles.categoryPillActive]}
                  onPress={() => setSelectedCategory(cat.name)}
                >
                  <Ionicons name={cat.icon} size={14} color={selectedCategory === cat.name ? Colors.textPrimary : Colors.textWhite} />
                  <Text style={[styles.categoryText, selectedCategory === cat.name && styles.categoryTextActive]}>
                    {cat.name === 'All' ? t('common.all') : categoryLabel(cat.name)}
                  </Text>
                </TouchableOpacity>
             ))}
             {/* 필터 줄 끝에 붙여 둔다 — 찾는 게 목록에 없을 때 바로 눈에 들어온다 */}
             <TouchableOpacity
               style={styles.categoryPillAdd}
               onPress={() => setAddMode('category')}
               activeOpacity={0.7}
             >
               <Ionicons name="add" size={14} color={Colors.textWhite} />
               <Text style={styles.categoryText}>
                 {language === 'ko' ? '카테고리' : 'Category'}
               </Text>
             </TouchableOpacity>
          </ScrollView>

          {/* 서비스 카드 그리드 */}
          <View style={styles.gridContainer}>
             <View style={styles.mainWhiteCard}>
                <View style={styles.cardHeaderRow}>
                   <Text style={styles.cardTitle}>
                     {selectedCategory === 'All' ? t('catalog.allServices') : categoryLabel(selectedCategory)}
                   </Text>
                   <View style={styles.cardHeaderRight}>
                     {/* 카탈로그에 없는 서비스를 직접 넣는 자리 */}
                     <TouchableOpacity
                       style={styles.addServiceBtn}
                       onPress={() => setAddMode('service')}
                       activeOpacity={0.7}
                     >
                       <Ionicons name="add" size={13} color={Colors.primary} />
                       <Text style={styles.addServiceText}>
                         {language === 'ko' ? '서비스' : 'Service'}
                       </Text>
                     </TouchableOpacity>
                     {/* 외화 요금을 원화로 환산해 보는 토글 */}
                     <TouchableOpacity
                       style={[styles.krwToggle, showKrw && styles.krwToggleActive]}
                       onPress={toggleKrw}
                       activeOpacity={0.7}
                     >
                       <Ionicons
                         name="swap-horizontal"
                         size={13}
                         color={showKrw ? Colors.textWhite : Colors.textSecondary}
                       />
                       <Text style={[styles.krwToggleText, showKrw && styles.krwToggleTextActive]}>
                         {showKrw ? (language === 'ko' ? '원화' : 'KRW') : (language === 'ko' ? '원화로' : 'To KRW')}
                       </Text>
                     </TouchableOpacity>
                     <Text style={styles.countText}>{filtered.length} {t('catalog.services')}</Text>
                   </View>
                </View>
                {/* 환율은 ECB 고시라 영업일 1회 갱신 — 언제 기준인지 밝힌다 */}
                {showKrw && ratesAsOf && (
                  <Text style={styles.ratesNote}>
                    {language === 'ko' ? `${ratesAsOf} 고시 환율 기준` : `At ${ratesAsOf} reference rate`}
                  </Text>
                )}

                {loading ? (
                  <View style={styles.empty}>
                    <ActivityIndicator color={Colors.primary} />
                  </View>
                ) : error ? (
                  <View style={styles.empty}>
                    <Ionicons name="cloud-offline-outline" size={48} color={Colors.textTertiary} />
                    <Text style={styles.emptyText}>
                      {language === 'ko' ? '카탈로그를 불러오지 못했습니다' : 'Could not load the catalog'}
                    </Text>
                    <TouchableOpacity style={styles.retryBtn} onPress={refetch} activeOpacity={0.7}>
                      <Ionicons name="refresh" size={14} color={Colors.primary} />
                      <Text style={styles.retryText}>{language === 'ko' ? '다시 시도' : 'Retry'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : filtered.length > 0 ? (
                  <View style={styles.grid}>
                     {filtered.map((service) => (
                        <TouchableOpacity key={service.id} style={styles.serviceCard} onPress={() => openModal(service)}>
                           <View style={styles.serviceCardTop}>
                              <ServiceLogo name={service.name} size={48} />
                              <TouchableOpacity style={styles.addBtnSmall}>
                                 <Ionicons name="add" size={16} color={Colors.textPrimary} />
                              </TouchableOpacity>
                           </View>
                           <Text style={styles.serviceName} numberOfLines={1}>{service.name}</Text>
                           <Text style={styles.serviceDesc} numberOfLines={1}>{service.description}</Text>
                           {/* 한 줄 고정 + 모자라면 글자를 줄인다. 줄바꿈으로 숫자가
                               끊기는 것보다 살짝 작아지는 편이 낫다. */}
                           <Text
                             style={styles.servicePrice}
                             numberOfLines={1}
                             adjustsFontSizeToFit
                             minimumFontScale={0.75}
                           >
                             {formatPriceRange(service, showKrw, rates)}
                           </Text>
                        </TouchableOpacity>
                     ))}
                  </View>
                ) : (
                  <View style={styles.empty}>
                    <Ionicons name="search-outline" size={48} color={Colors.textTertiary} />
                    <Text style={styles.emptyText}>{t('catalog.noResults')}</Text>
                    {/* 없는 걸 찾았다는 건 직접 넣을 때라는 뜻이다 */}
                    <TouchableOpacity style={styles.retryBtn} onPress={() => setAddMode('service')} activeOpacity={0.7}>
                      <Ionicons name="add" size={14} color={Colors.primary} />
                      <Text style={styles.retryText}>
                        {language === 'ko' ? '직접 등록하기' : 'Add it yourself'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
             </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>

      <CatalogAddModal
        mode={addMode}
        onClose={() => setAddMode(null)}
        categories={categories}
        onChanged={() => {
          refetchCategories();
          refetch();
        }}
      />

      {/* ── 서비스 상세 모달 (배경 fade + 시트 slide) ── */}
      {modalVisible && (
        <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999 }]} pointerEvents="box-none">
          <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          </Animated.View>

          <Animated.View
            style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}
            {...sheetPan.panHandlers}
          >
            {selectedService && (
              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ paddingBottom: TabBarSpace }}
                onScroll={(e) => { sheetScrollY.current = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={16}
              >
                <View style={styles.modalHandle} />

                {/* 서비스 헤더 */}
                <View style={styles.modalHeader}>
                  <ServiceLogo name={selectedService.name} size={56} />
                  <View style={styles.modalHeaderInfo}>
                    <Text style={styles.modalName}>{selectedService.name}</Text>
                    <Text style={styles.modalDesc}>{selectedService.description}</Text>
                    <View style={styles.modalCategoryBadge}>
                      <Text style={styles.modalCategoryText}>
                        {categoryLabel(selectedService.category)}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 요금제 선택 — 요금제가 하나도 없어도 직접 넣을 칸은 띄운다 */}
                <View style={styles.modalPlansSection}>
                  <View style={styles.modalPlansHeader}>
                    <Text style={styles.modalSectionTitle}>
                      {language === 'ko' ? '요금제 선택' : 'Select Plan'}
                    </Text>
                    {/* 외화 요금제일 때만 환산 버튼을 띄운다 — 여기서 결정하니까 여기 둔다 */}
                    {selectedService.plans.some((p) => p.currency !== 'KRW') && (
                      <TouchableOpacity
                        style={[styles.krwToggle, showKrw && styles.krwToggleActive]}
                        onPress={toggleKrw}
                        activeOpacity={0.7}
                      >
                        <Ionicons
                          name="swap-horizontal"
                          size={13}
                          color={showKrw ? Colors.textWhite : Colors.textSecondary}
                        />
                        <Text style={[styles.krwToggleText, showKrw && styles.krwToggleTextActive]}>
                          {showKrw ? (language === 'ko' ? '원화' : 'KRW') : (language === 'ko' ? '원화로' : 'To KRW')}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {showKrw && ratesAsOf && (
                    <Text style={styles.ratesNoteModal}>
                      {language === 'ko' ? `${ratesAsOf} 고시 환율 기준` : `At ${ratesAsOf} reference rate`}
                    </Text>
                  )}
                  {selectedService.plans.map((plan) => {
                    const isSelected = selectedPlan?.id === plan.id;
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        style={[styles.modalPlanRow, isSelected && styles.modalPlanRowActive]}
                        onPress={() => setSelectedPlan(plan)}
                        activeOpacity={0.6}
                      >
                        <View style={[styles.modalPlanRadio, isSelected && styles.modalPlanRadioActive]}>
                          {isSelected && <View style={styles.modalPlanRadioDot} />}
                        </View>
                        <View style={styles.modalPlanTexts}>
                          <Text style={[styles.modalPlanName, isSelected && { color: Colors.primary }]}>{plan.name}</Text>
                          {!plan.vatIncluded && (
                            <Text style={styles.modalPlanVat}>
                              {language === 'ko' ? '부가세 별도' : '+VAT'}
                            </Text>
                          )}
                        </View>
                        <Text style={[styles.modalPlanPrice, isSelected && { color: Colors.primary }]}>
                          {formatPlanPrice(plan, showKrw, rates, language)}
                        </Text>
                        {plan.isCustom && (
                          <TouchableOpacity
                            style={styles.modalPlanDelete}
                            onPress={() => handleDeletePlan(plan)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons name="close" size={16} color={Colors.textTertiary} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {/* 요금제 직접 입력 — 카탈로그가 실제 요금제를 다 담지 못한다
                      (특가·기간제 이용권처럼 수시로 바뀌는 것) */}
                  {!planFormOpen ? (
                    <TouchableOpacity
                      style={styles.modalPlanAddRow}
                      onPress={() => setPlanFormOpen(true)}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="add" size={16} color={Colors.primary} />
                      <Text style={styles.modalPlanAddText}>
                        {language === 'ko' ? '요금제 직접 입력' : 'Add a plan'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.modalPlanForm}>
                      <Text style={styles.modalPlanFormHint}>
                        {language === 'ko'
                          ? '목록에 없는 요금제를 넣습니다. 나에게만 보입니다.'
                          : 'Add a plan that is not listed. Only you can see it.'}
                      </Text>
                      <TextInput
                        style={styles.modalPlanInput}
                        value={newPlanName}
                        onChangeText={setNewPlanName}
                        maxLength={100}
                        placeholder={language === 'ko' ? '요금제 이름' : 'Plan name'}
                        placeholderTextColor={Colors.textTertiary}
                      />
                      <TextInput
                        style={styles.modalPlanInput}
                        value={newPlanPrice}
                        onChangeText={setNewPlanPrice}
                        keyboardType="number-pad"
                        placeholder={language === 'ko' ? '금액' : 'Amount'}
                        placeholderTextColor={Colors.textTertiary}
                      />
                      <View style={styles.modalPlanChipRow}>
                        {PLAN_CURRENCIES.map((c) => (
                          <TouchableOpacity
                            key={c}
                            style={[styles.modalPlanChip, newPlanCurrency === c && styles.modalPlanChipActive]}
                            onPress={() => setNewPlanCurrency(c)}
                          >
                            <Text style={[styles.modalPlanChipText, newPlanCurrency === c && styles.modalPlanChipTextActive]}>
                              {c}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.modalPlanChipRow}>
                        {PLAN_CYCLES.map((c) => (
                          <TouchableOpacity
                            key={c.value}
                            style={[styles.modalPlanChip, newPlanCycle === c.value && styles.modalPlanChipActive]}
                            onPress={() => setNewPlanCycle(c.value)}
                          >
                            <Text style={[styles.modalPlanChipText, newPlanCycle === c.value && styles.modalPlanChipTextActive]}>
                              {language === 'ko' ? c.ko : c.en}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity
                        style={styles.modalPlanVatToggle}
                        onPress={toggleNewPlanVat}
                        activeOpacity={0.6}
                      >
                        <Ionicons
                          name={newPlanVatSeparate ? 'checkbox' : 'square-outline'}
                          size={18}
                          color={newPlanVatSeparate ? Colors.primary : Colors.textTertiary}
                        />
                        <Text style={styles.modalPlanVatToggleText}>
                          {language === 'ko'
                            ? '부가세 10% 별도 (켜면 금액에 더해집니다)'
                            : 'Add 10% VAT on top of this amount'}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.modalPlanFormButtons}>
                        <TouchableOpacity style={styles.modalPlanFormCancel} onPress={resetPlanForm}>
                          <Text style={styles.modalPlanFormCancelText}>
                            {language === 'ko' ? '취소' : 'Cancel'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[
                            styles.modalPlanFormSave,
                            (savingPlan || !newPlanName.trim() || !newPlanPrice.trim()) && styles.modalPlanFormSaveDisabled,
                          ]}
                          onPress={handleAddPlan}
                          disabled={savingPlan || !newPlanName.trim() || !newPlanPrice.trim()}
                        >
                          <Text style={styles.modalPlanFormSaveText}>
                            {savingPlan
                              ? (language === 'ko' ? '저장 중...' : 'Saving...')
                              : (language === 'ko' ? '추가' : 'Add')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>

                {/* 부가세가 별도인 요금제만 — 정가와 실결제액이 다르니 짚어 준다.
                    담기면 이 금액이 그대로 구독 금액이 되고 합계에 들어간다. */}
                {selectedPlan && !selectedPlan.vatIncluded && (
                  <View style={styles.modalPriceRow}>
                    <Text style={styles.modalPriceLabel}>
                      {language === 'ko' ? '실제 결제 금액 (부가세 10% 포함)' : 'Actual charge (incl. 10% VAT)'}
                    </Text>
                    <Text style={styles.modalPriceValue}>
                      {formatMoney(withVat(selectedPlan), selectedPlan.currency)}
                    </Text>
                  </View>
                )}

                {/* 결제 시작일 + 다음 결제일 (한 줄) */}
                <View style={styles.modalDateRow}>
                  <View style={styles.modalDateCol}>
                    <Text style={styles.modalSectionTitle}>
                      {language === 'ko' ? '결제 시작일' : 'Start Date'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.modalDateInput, activePickerField === 'start' && styles.modalDateInputActive]}
                      onPress={() => openDatePicker('start')}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                      <Text style={styles.modalDateText} numberOfLines={1}>{startDate || 'YYYY-MM-DD'}</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.modalDateCol}>
                    <Text style={styles.modalSectionTitle}>
                      {language === 'ko' ? '다음 결제일' : 'Next Billing'}
                    </Text>
                    <TouchableOpacity
                      style={[styles.modalDateInput, activePickerField === 'next' && styles.modalDateInputActive]}
                      onPress={() => openDatePicker('next')}
                      activeOpacity={0.6}
                    >
                      <Ionicons name="calendar-outline" size={16} color={Colors.primary} />
                      <Text style={styles.modalDateText} numberOfLines={1}>{billingDate || 'YYYY-MM-DD'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {activePickerField && renderCalendarPicker()}

                {/* 선택 요약 */}
                {selectedPlan && (
                  <View style={styles.modalSummary}>
                    <View style={styles.modalSummaryRow}>
                      <Text style={styles.modalSummaryLabel}>{language === 'ko' ? '선택 요금제' : 'Plan'}</Text>
                      <Text style={styles.modalSummaryValue}>{selectedPlan.name}</Text>
                    </View>
                    <View style={styles.modalSummaryRow}>
                      <Text style={styles.modalSummaryLabel}>{language === 'ko' ? '금액' : 'Price'}</Text>
                      <Text style={[styles.modalSummaryValue, { color: Colors.primary }]}>
                        {formatPlanPrice(selectedPlan, showKrw, rates, language)}
                      </Text>
                    </View>
                    <View style={styles.modalSummaryRow}>
                      <Text style={styles.modalSummaryLabel}>{language === 'ko' ? '시작일' : 'Start Date'}</Text>
                      <Text style={styles.modalSummaryValue}>{startDate}</Text>
                    </View>
                    <View style={styles.modalSummaryRow}>
                      <Text style={styles.modalSummaryLabel}>{language === 'ko' ? '다음 결제일' : 'Next Billing'}</Text>
                      <Text style={styles.modalSummaryValue}>{billingDate}</Text>
                    </View>
                  </View>
                )}

                {/* 공식 사이트 */}
                {selectedService.website && (
                  <TouchableOpacity
                    style={styles.modalWebBtn}
                    onPress={() => Linking.openURL(selectedService.website!)}
                  >
                    <Ionicons name="globe-outline" size={18} color={Colors.primary} />
                    <Text style={styles.modalWebText}>{t('catalog.visitWebsite')}</Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.primary} />
                  </TouchableOpacity>
                )}

                {/* 해지 페이지 — 막상 끊으려 할 때 어디로 가야 하는지가 제일 안 보인다.
                    서비스마다 묻어 둔 곳이 달라, 아는 곳은 바로 열어 준다. */}
                {selectedService.cancelUrl && (
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => Linking.openURL(selectedService.cancelUrl!)}
                  >
                    <Ionicons name="close-circle-outline" size={18} color={Colors.textSecondary} />
                    <Text style={styles.modalCancelText}>
                      {language === 'ko' ? '구독 해지 페이지' : 'Cancel subscription'}
                    </Text>
                    <Ionicons name="arrow-forward" size={14} color={Colors.textSecondary} />
                  </TouchableOpacity>
                )}

                {/* 링크 묶음과 추가 버튼 사이 간격. 링크가 하나도 없을 수도 있어
                    버튼 쪽이 아니라 여기서 띄운다. */}
                {(selectedService.website || selectedService.cancelUrl) && (
                  <View style={{ height: Spacing.lg }} />
                )}

                {/* 구독 추가 버튼 */}
                <GradientButton
                  label={isSubmitting
                    ? (language === 'ko' ? '추가 중...' : 'Adding...')
                    : t('catalog.addSubscription')}
                  icon="add-circle"
                  variant="primary"
                  size="lg"
                  loading={isSubmitting}
                  onPress={handleSubscribe}
                />

                {/* 직접 등록한 서비스만 지울 수 있다. 기본 카탈로그는 손대지 않는다. */}
                {selectedService.isCustom && (
                  <TouchableOpacity
                    style={styles.modalDeleteBtn}
                    onPress={() => handleDeleteService(selectedService)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                    <Text style={styles.modalDeleteText}>
                      {language === 'ko' ? '이 서비스 삭제' : 'Delete this service'}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={{ height: 20 }} />
              </ScrollView>
            )}
          </Animated.View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoMark: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center'
  },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textWhite },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center', alignItems: 'center'
  },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: TabBarSpace },
  pageHeader: { paddingHorizontal: Spacing.sm, marginBottom: Spacing.xl },
  subTitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', fontWeight: FontWeight.medium, marginBottom: 4 },
  mainTitle: { fontSize: 42, fontWeight: FontWeight.heavy, color: '#FFF', letterSpacing: -1 },
  searchPill: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF',
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 24, marginTop: Spacing.lg, ...Shadow.sm
  },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
  categoryScroll: { paddingHorizontal: Spacing.sm, gap: Spacing.sm, marginBottom: Spacing.xl },
  categoryPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)'
  },
  categoryPillActive: { backgroundColor: '#FFF', borderColor: '#FFF' },
  // 필터 pill과 같은 크기지만 점선 테두리로 '고르는 것'과 '더하는 것'을 구분한다
  categoryPillAdd: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.6)',
  },
  categoryText: { fontSize: FontSize.xs, color: '#FFF', fontWeight: FontWeight.semibold },
  categoryTextActive: { color: Colors.textPrimary },
  gridContainer: { marginTop: Spacing.sm, paddingHorizontal: Spacing.sm },
  mainWhiteCard: {
    backgroundColor: '#FFF', borderRadius: 40, padding: Spacing.xxl, ...Shadow.md, minHeight: 400
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  cardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  countText: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  cardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addServiceBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.primary,
  },
  addServiceText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.semibold },
  krwToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1, borderColor: Colors.border,
  },
  krwToggleActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  krwToggleText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  krwToggleTextActive: { color: Colors.textWhite },
  ratesNote: {
    fontSize: 10, color: Colors.textTertiary,
    marginTop: -Spacing.md, marginBottom: Spacing.md,
  },
  modalPlansHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  ratesNoteModal: { fontSize: 10, color: Colors.textTertiary, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.lg },
  serviceCard: {
    width: '46%', backgroundColor: Colors.surfaceLight, borderRadius: 32, padding: Spacing.lg, gap: 4,
    borderWidth: 1, borderColor: Colors.borderLight
  },
  serviceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  serviceName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  serviceDesc: { fontSize: 10, color: Colors.textTertiary },
  servicePrice: { fontSize: FontSize.xs, color: Colors.success, fontWeight: FontWeight.bold, marginTop: 2 },
  addBtnSmall: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.borderLight,
    justifyContent: 'center', alignItems: 'center'
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: Spacing.md },
  emptyText: { fontSize: FontSize.md, color: Colors.textTertiary },
  // ── Modal ──
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32,
    // 아래 여백은 시트가 아니라 ScrollView 콘텐츠가 갖는다 — 그래야 마지막
    // 버튼을 떠 있는 탭바 위로 '스크롤해서' 올릴 수 있다.
    paddingHorizontal: Spacing.xxl, maxHeight: '85%',
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight,
    alignSelf: 'center', marginTop: 12, marginBottom: Spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginBottom: Spacing.xl,
  },
  modalHeaderInfo: { flex: 1 },
  modalName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalDesc: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  modalCategoryBadge: {
    backgroundColor: Colors.primaryBg, paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, alignSelf: 'flex-start', marginTop: 6,
  },
  modalCategoryText: { fontSize: 10, color: Colors.primary, fontWeight: FontWeight.semibold },
  modalPriceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surfaceLight, padding: 14, borderRadius: 16, marginBottom: Spacing.lg,
  },
  modalPriceLabel: { fontSize: FontSize.sm, color: Colors.textSecondary, flex: 1 },
  modalPriceValue: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.success },
  modalPlansSection: { marginBottom: Spacing.lg },
  modalSectionTitle: {
    fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  modalPlanRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 12, marginBottom: 4,
  },
  modalPlanRowActive: { backgroundColor: Colors.primaryLight },
  modalPlanRadio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.textTertiary,
    justifyContent: 'center', alignItems: 'center', marginRight: Spacing.md,
  },
  modalPlanRadioActive: { borderColor: Colors.primary },
  modalPlanRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary },
  modalPlanTexts: { flex: 1 },
  modalPlanName: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.medium },
  modalPlanVat: { fontSize: 10, color: Colors.textTertiary, marginTop: 1 },
  modalPlanVatToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  modalPlanVatToggleText: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary },
  modalPlanPrice: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalPlanDelete: { marginLeft: Spacing.sm, padding: 2 },
  // 요금제 직접 입력
  modalPlanAddRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, marginTop: 4,
    borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border,
  },
  modalPlanAddText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.primary },
  modalPlanForm: {
    marginTop: 4, padding: 12, borderRadius: 12, gap: Spacing.sm,
    backgroundColor: Colors.surfaceLight,
  },
  modalPlanFormHint: { fontSize: FontSize.xs, color: Colors.textSecondary },
  modalPlanInput: {
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: FontSize.sm, color: Colors.textPrimary,
  },
  modalPlanChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  modalPlanChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background,
  },
  modalPlanChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  modalPlanChipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  modalPlanChipTextActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  modalPlanFormButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm },
  modalPlanFormCancel: { paddingHorizontal: 14, paddingVertical: 8 },
  modalPlanFormCancelText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  modalPlanFormSave: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  modalPlanFormSaveDisabled: { opacity: 0.5 },
  modalPlanFormSaveText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textWhite },
  // 날짜 선택
  modalDateRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.md },
  modalDateCol: { flex: 1 },
  modalDateSection: { marginBottom: Spacing.lg },
  modalDateInput: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: Colors.surfaceLight, borderRadius: 12, paddingHorizontal: 12, height: 44,
  },
  modalDateInputActive: { borderWidth: 1.5, borderColor: Colors.primary },
  modalDateText: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  // 캘린더
  calendarPicker: { backgroundColor: Colors.surfaceLight, borderRadius: 16, padding: 14, marginTop: Spacing.md },
  calNav: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16, marginBottom: Spacing.md },
  calNavTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  calWeekRow: { flexDirection: 'row', marginBottom: Spacing.sm },
  calWeekDay: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textTertiary },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center' },
  calDayBtn: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  calDaySelected: { backgroundColor: Colors.primary },
  calDayToday: { backgroundColor: Colors.primarySoft },
  calDayText: { fontSize: 13, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  calDayTextSelected: { color: '#FFF' },
  // 요약
  modalSummary: {
    backgroundColor: Colors.surfaceLight, borderRadius: 16, padding: 16, marginBottom: Spacing.lg,
  },
  modalSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  modalSummaryLabel: { fontSize: FontSize.sm, color: Colors.textTertiary },
  modalSummaryValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalWebBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  modalWebText: { flex: 1, fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium },
  // 해지는 눌러야 할 버튼이 아니라 필요할 때 찾는 링크라, 공식 사이트보다 한 톤 낮춘다
  modalCancelBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  modalCancelText: { flex: 1, fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium },
  modalDeleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginTop: Spacing.md, paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md, borderWidth: 1, borderColor: Colors.dangerSoft,
    backgroundColor: Colors.dangerSoft,
  },
  modalDeleteText: { fontSize: FontSize.sm, color: Colors.dangerText, fontWeight: FontWeight.semibold },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.primary,
  },
  retryText: { fontSize: FontSize.sm, color: Colors.primary, fontWeight: FontWeight.medium },
});
