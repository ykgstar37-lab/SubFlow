import React from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Modal,
  Pressable,
  TextInput,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow, TabBarSpace } from '../../src/constants/theme';
import { OnboardingModal } from '../../src/components/OnboardingModal';

const { width } = Dimensions.get('window');
// 부모 ScrollView에 Spacing.lg 패딩이 있으나, 카드가 잘리지 않도록 (화면 끝까지 보이도록)
// 가용 너비(CW)를 기준으로 카드 크기를 계산하되, Pager는 전체 너비를 사용합니다.
const CW = width - Spacing.lg * 2;
const ITEM_WIDTH = CW * 0.8; // 카드 너비는 가용 너비의 80%로 유지
const GAP = Spacing.md;
// 페이저 전체 너비가 width가 되므로 카드가 가운데 정렬되도록 SPACER 재계산
const SPACER = (width - ITEM_WIDTH) / 2;
const SNAP_INTERVAL = ITEM_WIDTH + GAP;

// ── 데이터 타입 및 헬퍼 ──
interface Subscription {
  id: string;
  name: string;
  amount: number;      // 표시용 — 구독 자체의 통화·결제주기 그대로
  monthlyKrw: number;  // 계산용 — 월 단위 KRW로 환산한 내 몫 (서버가 준다)
  rateKrw?: number;    // 이 통화의 현재 환율 (1 통화 = ? KRW). 원화면 없음
  currency: string;
  startDate: string; // YYYY-MM-DD
  priceNews?: string;
}


const CURRENCY_SYMBOLS: Record<string, string> = {
  KRW: '₩', USD: '$', EUR: '€', JPY: '¥', GBP: '£',
};

function formatPrice(amount: number, currency: string = 'KRW') {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  if (currency === 'KRW' || currency === 'JPY') {
    return `${symbol}${Math.round(amount).toLocaleString()}`;
  }
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 외화 금액의 원화 환산 병기 문자열. 원화 구독이거나 환율이 없으면 빈 문자열. */
function krwHint(amount: number, currency: string, rate?: number) {
  if (currency === 'KRW' || !rate || !amount) return '';
  return `≈ ₩${Math.round(amount * rate).toLocaleString()}`;
}

function getDurationText(startDateStr: string) {
  const start = new Date(startDateStr);
  const now = new Date();
  
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  
  if (months < 0) {
    years--;
    months += 12;
  }
  
  if (years > 0) {
    return `Subscribed for ${years}y ${months}m`;
  }
  return `Subscribed for ${months}m`;
}

// ── 구독 지출 비중 바코드 차트 ──
function SpendShareChart({ subs, activeIndex }: { subs: Subscription[]; activeIndex: number }) {
  // 비중 차트도 통화·주기를 맞춘 monthlyKrw로 계산해야 한다.
  // 원본 금액으로 더하면 달러 구독이 막대 하나로 뭉개진다.
  const total = subs.reduce((s, sub) => s + sub.monthlyKrw, 0);
  if (total === 0 || subs.length === 0) return null;

  // 구독당 최소 3개 바 보장, 비중에 비례해 추가 할당
  const MIN_BARS = 3;
  const expanded: { height: number; isActive: boolean }[] = [];

  subs.forEach((sub, i) => {
    const pct = (sub.monthlyKrw / total) * 100;
    const barCount = Math.max(Math.round(pct / 100 * 40), MIN_BARS);
    const baseHeight = Math.max(pct * 0.4 + 8, 12);
    const isActive = i === activeIndex;

    for (let j = 0; j < barCount; j++) {
      expanded.push({
        height: baseHeight + (Math.random() * 8 - 4),
        isActive,
      });
    }
  });

  return (
    <View style={progressStyles.container}>
      {expanded.map((bar, i) => (
        <View key={i} style={[progressStyles.barWrap, { flex: 1 }]}>
          <View
            style={[
              progressStyles.bar,
              {
                height: bar.height,
                backgroundColor: bar.isActive ? Colors.success : Colors.borderLight,
              },
            ]}
          />
        </View>
      ))}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'baseline',
    height: 40,
    gap: 2,
    marginTop: Spacing.sm,
  },
  barWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    borderRadius: 1,
    minHeight: 10,
  },
});

import { ServiceLogo } from '../../src/components/ServiceLogo';
import { AppLogoMark } from '../../src/components/AppLogoMark';
import { GradientButton } from '../../src/components/GradientButton';
import { NewsModal } from '../../src/components/NewsModal';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useSubscriptions, useAnalyticsOverview, useExchangeRateAlerts,
  usePriceChanges, useInbox, useNews } from '../../src/hooks/useApi';
import { useSettingsStore } from '../../src/store/settingsStore';
import { notificationAPI } from '../../src/services/api';

export default function HomeScreen() {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [budgetModalVisible, setBudgetModalVisible] = React.useState(false);
  const [budgetInput, setBudgetInput] = React.useState('');
  const [showStatusInfo, setShowStatusInfo] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [showNews, setShowNews] = React.useState(false);
  const { t, language } = useTranslation();

  // 첫 실행 시 온보딩 1회 노출
  React.useEffect(() => {
    AsyncStorage.getItem('subflow-onboarded').then((v) => {
      if (!v) setShowOnboarding(true);
    });
  }, []);

  const dismissOnboarding = () => {
    AsyncStorage.setItem('subflow-onboarded', '1').catch(() => {});
    setShowOnboarding(false);
  };
  const { monthlyBudget, setMonthlyBudget } = useSettingsStore();
  const subsQuery = useSubscriptions();
  const overviewQuery = useAnalyticsOverview();
  const exchangeQuery = useExchangeRateAlerts();
  // 카드의 화살표는 지금까지 늘 위를 가리키는 장식이었다(수익 대시보드
  // 레퍼런스에서 그대로 가져온 것). 실제 요금 변동에 맞춰 방향을 잡는다.
  const priceQuery = usePriceChanges();
  const inboxQuery = useInbox();
  const unreadCount = inboxQuery.data?.unread_count ?? 0;

  // 알림함에 다녀오면 읽음 처리가 반영되도록 다시 조회한다.
  const refetchInbox = inboxQuery.refetch;
  useFocusEffect(
    React.useCallback(() => {
      refetchInbox();
    }, [refetchInbox])
  );

  // ── 구독 브리핑 '새 소식' 점 ──
  // 마지막으로 확인한 최신 기사(link)를 저장해두고, 그보다 새 기사가 오면 다시 켠다.
  const newsQuery = useNews();
  const latestNewsKey = newsQuery.data?.items?.[0]?.link ?? null;
  const [seenNewsKey, setSeenNewsKey] = React.useState<string | null>(null);

  React.useEffect(() => {
    AsyncStorage.getItem('subflow-news-seen').then((v) => setSeenNewsKey(v)).catch(() => {});
  }, []);

  const hasNewNews = !!latestNewsKey && latestNewsKey !== seenNewsKey;

  const openNews = React.useCallback(() => {
    setShowNews(true);
    if (latestNewsKey) {
      setSeenNewsKey(latestNewsKey);
      AsyncStorage.setItem('subflow-news-seen', latestNewsKey).catch(() => {});
    }
  }, [latestNewsKey]);

  // 환율 알림 (실데이터만)
  const rawAlerts = (exchangeQuery.data as any)?.alerts ?? [];
  const exchangeAlerts = rawAlerts.map((a: any) => ({
    ...a,
    rate: Number(a.current_rate ?? a.rate ?? 0),
    change: Number(a.change_percentage ?? a.change ?? 0),
  }));

  // 활성 구독 (실데이터만 — 없으면 빈 배열)
  const apiSubs = (subsQuery.data as any[]) ?? [];
  const subs: Subscription[] = apiSubs
    .filter((s: any) => s.status === 'active')
    .map((s: any, idx: number) => ({
      id: String(s.id ?? idx + 1),
      name: s.service_name ?? s.name ?? 'Unknown',
      amount: Number(s.cost ?? s.billing_amount ?? s.amount ?? 0),
      // 지출 비중용 금액. 총액(total_monthly_cost)과 같은 기준(월 단위 KRW)이라야
      // 나눗셈이 성립한다 — 예전엔 $20을 원화 총액으로 나눠 0.0%가 나왔다.
      // 서버가 안 내려주는 구버전이면 원래 금액으로 떨어뜨린다(원화면 결과 동일).
      monthlyKrw: Number(s.monthly_cost_krw ?? s.cost ?? s.amount ?? 0),
      rateKrw: s.exchange_rate_krw != null ? Number(s.exchange_rate_krw) : undefined,
      currency: s.currency ?? 'KRW',
      startDate: s.start_date ?? s.started_at ?? s.created_at ?? '2024-01-01',
    }));

  const hasSubs = subs.length > 0;
  // 구독별 요금 변동. 값이 없으면 화살표를 아예 띄우지 않는다 —
  // 바뀐 게 없는데 화살표가 떠 있으면 없는 사실을 말하는 셈이다.
  const priceChangeById: Record<string, number> = {};
  for (const a of ((priceQuery.data as any)?.alerts ?? [])) {
    priceChangeById[String(a.subscription_id)] = Number(a.change_amount ?? 0);
  }

  const EMPTY_SUB: Subscription = { id: '', name: '', amount: 0, monthlyKrw: 0, currency: 'KRW', startDate: '' };
  // 통화가 섞이면 단순 합산이 부정확하므로 백엔드가 KRW로 환산한 월 총액을 사용 (예산도 KRW라 비교 일관)
  const totalMonthlySpend = Number((overviewQuery.data as any)?.total_monthly_cost ?? subs.reduce((sum, s) => sum + s.monthlyKrw, 0));
  const activeSub = subs[Math.min(activeIndex, subs.length - 1)] ?? subs[0] ?? EMPTY_SUB;
  const spendPercent = totalMonthlySpend > 0 ? ((activeSub.monthlyKrw / totalMonthlySpend) * 100).toFixed(1) : '0';

  // ── 예산 계산 ──
  const budget = monthlyBudget ?? 0;
  const budgetUsage = budget > 0 ? (totalMonthlySpend / budget) * 100 : 0;
  const budgetStatus = budgetUsage > 100
    ? { label: language === 'ko' ? '초과!' : 'Over!', color: Colors.danger }
    : budgetUsage > 80
    ? { label: language === 'ko' ? '주의' : 'Warning', color: '#FF9500' }
    : budgetUsage > 50
    ? { label: language === 'ko' ? '관리중' : 'On Track', color: Colors.success }
    : { label: language === 'ko' ? '여유' : 'Good', color: Colors.success };

  // 숫자에 콤마 추가 (1000 → 1,000)
  const formatNumber = (val: string) => {
    const num = val.replace(/[^0-9]/g, '');
    if (!num) return '';
    return Number(num).toLocaleString();
  };

  const handleBudgetInput = (val: string) => {
    setBudgetInput(formatNumber(val));
  };

  const openBudgetModal = () => {
    setBudgetInput(budget > 0 ? budget.toLocaleString() : '');
    setBudgetModalVisible(true);
  };

  const saveBudget = () => {
    const val = parseInt(budgetInput.replace(/[^0-9]/g, ''), 10);
    if (val > 0) {
      setMonthlyBudget(val);
      notificationAPI.updateSettings({ monthly_budget: val }).catch(() => {});
    }
    setBudgetModalVisible(false);
  };

  return (
    <LinearGradient
      colors={[Colors.primaryBg, Colors.background]}
      style={styles.container}
    >
      <SafeAreaView edges={['top']} style={styles.safe}>
        <OnboardingModal
          visible={showOnboarding}
          onClose={dismissOnboarding}
          onFinish={() => router.push('/(tabs)/catalog')}
        />
        <NewsModal visible={showNews} onClose={() => setShowNews(false)} />
        {/* ── 헤더 (Clerio 스타일) ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AppLogoMark tone="white" />
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/inbox')}>
              <Ionicons name="notifications-outline" size={20} color={Colors.textWhite} />
              {unreadCount > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/(tabs)/settings')}>
              <Ionicons name="settings-outline" size={20} color={Colors.textWhite} />
            </TouchableOpacity>
            <View style={styles.headerAvatar}>
              <Ionicons name="person" size={16} color={Colors.primary} />
            </View>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* 타이틀 영역 */}
          <View style={styles.titleArea}>
            <Text style={styles.subTitle}>{t('home.subtitle')}</Text>
            <View style={styles.titleRow}>
              <Text style={styles.mainTitle}>{t('home.title')}</Text>
              <TouchableOpacity
                style={styles.newsBtn}
                onPress={openNews}
                activeOpacity={0.85}
                accessibilityLabel={t('news.section')}
              >
                {/* 마크 뒤에 살짝 내린 검은 복사본 = 모양을 따라가는 그림자.
                    투명 PNG는 box-shadow가 사각으로 떨어져서 이 방식이 자연스럽다. */}
                <Image
                  source={require('../../assets/brand/subflow-mark-black.png')}
                  style={styles.newsBtnShadow}
                  resizeMode="contain"
                />
                <Image
                  source={require('../../assets/brand/subflow-mark-white.png')}
                  style={styles.newsBtnMark}
                  resizeMode="contain"
                />
                {/* 새 소식 표시 점 — 확인하면 사라지고, 새 기사가 오면 다시 뜬다 */}
                {hasNewNews && <View style={styles.newsBtnDot} />}
              </TouchableOpacity>
            </View>

            {/* 상태 뱃지 영역 (Glass) — 예산 탭 가능 */}
            <View style={styles.statusPills}>
              <TouchableOpacity style={[styles.pillContainer, styles.glassPill]} onPress={openBudgetModal} activeOpacity={0.7}>
                <Text style={styles.pillLabel}>{t('home.budget')}:</Text>
                <Text style={styles.pillValue}>
                  {budget > 0 ? `₩${budget.toLocaleString()}` : (language === 'ko' ? '설정하기' : 'Set')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.pillContainer, styles.glassPill]} onPress={() => setShowStatusInfo(true)} activeOpacity={0.7}>
                <Text style={styles.pillLabel}>{t('home.status')}:</Text>
                <View style={[styles.statusBadge, { backgroundColor: budgetStatus.color + '20' }]}>
                  <Text style={[styles.statusText, { color: budgetStatus.color }]}>{budgetStatus.label}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 중앙 서비스 페이저 (Horizontal Selector) ── */}
          <View style={styles.pagerContainer}>
            {!hasSubs ? (
              <TouchableOpacity
                style={styles.emptyPager}
                onPress={() => router.push('/(tabs)/catalog')}
                activeOpacity={0.85}
              >
                <Ionicons name="add-circle-outline" size={30} color={Colors.primary} />
                <Text style={styles.emptyPagerText}>
                  {language === 'ko' ? '아직 구독이 없어요\n첫 구독을 추가해보세요' : 'No subscriptions yet.\nAdd your first one.'}
                </Text>
              </TouchableOpacity>
            ) : (
            <ScrollView
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              snapToInterval={SNAP_INTERVAL}
              snapToAlignment="start"
              decelerationRate="fast"
              disableIntervalMomentum={true}
              scrollEventThrottle={16}
              contentContainerStyle={{ paddingHorizontal: SPACER }}
              style={styles.pagerScroll}
              onScroll={(e) => {
                const index = Math.round(e.nativeEvent.contentOffset.x / SNAP_INTERVAL);
                if (index !== activeIndex && index >= 0 && index < subs.length) {
                  setActiveIndex(index);
                }
              }}
            >
              {subs.map((item, index) => {
                const isFocused = activeIndex === index;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.pagerItem,
                      { width: ITEM_WIDTH, marginRight: index === subs.length - 1 ? 0 : GAP },
                      !isFocused && { opacity: 0.5, transform: [{ scale: 0.95 }] }
                    ]}
                  >
                    {/* 서비스 로고 카드 */}
                    <View style={styles.floatingTopCard}>
                      <View style={styles.fCardLeft}>
                        <ServiceLogo name={item.name} size={42} />
                        <View>
                          <Text style={styles.fName}>{item.name}</Text>
                          <Text style={styles.fId}>{item.currency} · {item.amount > 0 ? (item.currency === 'KRW' ? 'monthly' : 'monthly') : ''}</Text>
                        </View>
                      </View>
                      <View style={styles.rotateBtn}>
                        <Ionicons name="refresh-outline" size={20} color={Colors.textPrimary} />
                      </View>
                    </View>

                    {/* 가격 지표 (레퍼런스처럼 카드에 밀착) */}
                    <View style={styles.revenueWrapper}>
                      <View style={[styles.floatingRevenue, styles.glassPill]}>
                        <Text style={styles.revenueLabel}>{t('home.monthlyPrice')}</Text>
                        <Text style={styles.revenueValue}>{formatPrice(item.amount, item.currency)}</Text>
                        {/* 외화 구독은 현재 환율 기준 원화를 함께 보여준다 */}
                        {krwHint(item.amount, item.currency, item.rateKrw) !== '' && (
                          <Text style={styles.revenueKrw}>
                            {krwHint(item.amount, item.currency, item.rateKrw)}
                          </Text>
                        )}
                        {(() => {
                          const change = priceChangeById[item.id];
                          if (!change) return null;
                          const wentUp = change > 0;
                          return (
                            <Ionicons
                              name={wentUp ? 'arrow-up-circle' : 'arrow-down-circle'}
                              size={14}
                              color={wentUp ? Colors.success : Colors.primary}
                              style={{ marginLeft: 4 }}
                            />
                          );
                        })()}
                      </View>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            )}
          </View>

          {/* ── 상세 분석 카드 (Glassmorphism) ── */}
          <View style={styles.mainCardStack}>
            <View style={[styles.mainWhiteCard, styles.glassBackground]}>
              <View style={styles.paymentWrap}>
                <View style={styles.paymentHeader}>
                  <View style={styles.paymentHeaderTitle}>
                    <Ionicons name="analytics" size={20} color={Colors.textPrimary} />
                    <Text style={styles.paymentTitle}>{t('home.spendingAnalysis')}</Text>
                  </View>
                  <TouchableOpacity style={styles.roundArrowBtn} onPress={() => router.push('/(tabs)/analytics')}>
                    <Ionicons name="arrow-forward" size={16} color={Colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.durationText}>{getDurationText(activeSub.startDate)}</Text>

                <View style={styles.percentRow}>
                  <Text style={styles.largePercent}>{spendPercent}%</Text>
                  <View style={styles.percentBadge}>
                    <Text style={styles.percentBadgeText}>{t('home.ofMonthlyCost')}</Text>
                  </View>
                </View>

                {/* 가격 뉴스 (있을 경우만) */}
                {activeSub.priceNews && (
                  <View style={styles.newsBox}>
                    <Ionicons name="alert-circle" size={16} color={Colors.danger} />
                    <Text style={styles.newsText}>{t(activeSub.priceNews as any)}</Text>
                  </View>
                )}

                {/* 환율 변동 알림 */}
                {exchangeAlerts.length > 0 && (
                  <View style={styles.exchangeBox}>
                    <View style={styles.exchangeHeader}>
                      <Ionicons name="swap-horizontal" size={16} color="#5856D6" />
                      <Text style={styles.exchangeTitle}>{t('home.exchangeAlert')}</Text>
                    </View>
                    {exchangeAlerts.map((ea: any, i: number) => (
                      <View key={i} style={styles.exchangeRow}>
                        <Text style={styles.exchangeService}>{ea.service_name}</Text>
                        <View style={styles.exchangeRateWrap}>
                          <Text style={styles.exchangeRate}>
                            {ea.currency} {ea.rate?.toLocaleString()}
                          </Text>
                          <View style={[styles.exchangeChangeBadge, { backgroundColor: ea.change > 0 ? Colors.danger + '15' : Colors.success + '15' }]}>
                            <Ionicons
                              name={ea.change > 0 ? 'arrow-up' : 'arrow-down'}
                              size={10}
                              color={ea.change > 0 ? Colors.danger : Colors.success}
                            />
                            <Text style={[styles.exchangeChangeText, { color: ea.change > 0 ? Colors.danger : Colors.success }]}>
                              {Math.abs(ea.change).toFixed(1)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                {/* 구독 비중 바코드 */}
                <View style={[styles.barcodeSection, { marginTop: Spacing.xl }]}>
                  <View style={styles.barcodeLabels}>
                    <Text style={styles.bLabelText}>{t('home.paymentHistory')}</Text>
                    <Text style={styles.bLabelText}>{spendPercent}%</Text>
                  </View>
                  <SpendShareChart subs={subs} activeIndex={Math.min(activeIndex, subs.length - 1)} />
                </View>
              </View>

              <View style={[styles.paymentHeader, { marginTop: Spacing.xl }]}>
                <View style={styles.paymentHeaderTitle}>
                  <Ionicons name="calendar-outline" size={20} color={Colors.textPrimary} />
                  <Text style={styles.paymentTitle}>{t('home.billingSchedule')}</Text>
                </View>
                <TouchableOpacity style={styles.roundArrowBtn} onPress={() => router.push('/(tabs)/calendar')}>
                  <Ionicons name="arrow-forward" size={16} color={Colors.textPrimary} />
                </TouchableOpacity>
              </View>

              {/* 다가오는 결제 미리보기 (최대 3개) */}
              {subs.slice(0, 3).map((sub, i) => {
                // 간단한 결제일 추정 (매월 7일, 12일, 15일, 20일, 22일...)
                const payDays = [7, 12, 15, 20, 22];
                const payDay = payDays[i % payDays.length];
                const now = new Date();
                const nextDate = new Date(now.getFullYear(), now.getMonth(), payDay);
                if (nextDate < now) nextDate.setMonth(nextDate.getMonth() + 1);
                const dateStr = language === 'ko'
                  ? `${nextDate.getMonth() + 1}/${nextDate.getDate()}`
                  : `${nextDate.getMonth() + 1}/${nextDate.getDate()}`;
                return (
                  <View key={i} style={styles.upcomingRow}>
                    <ServiceLogo name={sub.name} size={32} />
                    <View style={styles.upcomingInfo}>
                      <Text style={styles.upcomingName}>{sub.name}</Text>
                      <Text style={styles.upcomingDate}>
                        {formatPrice(sub.amount, sub.currency)}
                        {krwHint(sub.amount, sub.currency, sub.rateKrw) !== ''
                          ? `  ${krwHint(sub.amount, sub.currency, sub.rateKrw)}`
                          : ''}
                      </Text>
                    </View>
                    <Text style={styles.upcomingPct}>{dateStr}</Text>
                  </View>
                );
              })}
            </View>
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ── 상태 설명 모달 ── */}
      <Modal visible={showStatusInfo} transparent animationType="fade" onRequestClose={() => setShowStatusInfo(false)}>
        <Pressable style={budgetStyles.overlay} onPress={() => setShowStatusInfo(false)}>
          <Pressable style={budgetStyles.sheet} onPress={e => e.stopPropagation()}>
            <View style={budgetStyles.handle} />
            <Text style={budgetStyles.title}>
              {language === 'ko' ? '예산 상태 안내' : 'Budget Status Guide'}
            </Text>

            {[
              { range: '< 50%', ko: '여유', en: 'Good', color: Colors.success },
              { range: '50~80%', ko: '관리중', en: 'On Track', color: Colors.success },
              { range: '80~100%', ko: '주의', en: 'Warning', color: '#FF9500' },
              { range: '> 100%', ko: '초과!', en: 'Over!', color: Colors.danger },
            ].map((item, i) => (
              <View key={i} style={statusInfoStyles.row}>
                <View style={[statusInfoStyles.dot, { backgroundColor: item.color }]} />
                <Text style={statusInfoStyles.range}>{item.range}</Text>
                <View style={[statusInfoStyles.badge, { backgroundColor: item.color + '20' }]}>
                  <Text style={[statusInfoStyles.badgeText, { color: item.color }]}>
                    {language === 'ko' ? item.ko : item.en}
                  </Text>
                </View>
              </View>
            ))}

            {budget > 0 && (
              <View style={statusInfoStyles.currentWrap}>
                <Text style={statusInfoStyles.currentLabel}>
                  {language === 'ko' ? '현재 사용률' : 'Current Usage'}
                </Text>
                <View style={statusInfoStyles.currentBar}>
                  <View style={[statusInfoStyles.currentFill, { width: `${Math.min(budgetUsage, 100)}%`, backgroundColor: budgetStatus.color }]} />
                </View>
                <Text style={[statusInfoStyles.currentText, { color: budgetStatus.color }]}>
                  {budgetUsage.toFixed(0)}% — {budgetStatus.label}
                </Text>
              </View>
            )}

            <GradientButton
              label={language === 'ko' ? '확인' : 'OK'}
              icon="checkmark"
              variant="neutral"
              size="lg"
              onPress={() => setShowStatusInfo(false)}
              style={{ marginTop: Spacing.lg }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── 월 예산 설정 모달 ── */}
      <Modal visible={budgetModalVisible} transparent animationType="fade" onRequestClose={() => setBudgetModalVisible(false)}>
        <Pressable style={budgetStyles.overlay} onPress={() => setBudgetModalVisible(false)}>
          <Pressable style={budgetStyles.sheet} onPress={e => e.stopPropagation()}>
            <View style={budgetStyles.handle} />
            <Text style={budgetStyles.title}>
              {language === 'ko' ? '월 예산 설정' : 'Set Monthly Budget'}
            </Text>

            <View style={budgetStyles.inputRow}>
              <Text style={budgetStyles.currency}>₩</Text>
              <TextInput
                style={budgetStyles.input}
                value={budgetInput}
                onChangeText={handleBudgetInput}
                keyboardType="number-pad"
                placeholder="100,000"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>

            {/* 현재 사용률 미리보기 */}
            {parseInt(budgetInput.replace(/[^0-9]/g, ''), 10) > 0 && (
              <View style={budgetStyles.previewWrap}>
                <View style={budgetStyles.previewBar}>
                  <View style={[
                    budgetStyles.previewFill,
                    {
                      width: `${Math.min((totalMonthlySpend / parseInt(budgetInput.replace(/[^0-9]/g, ''), 10)) * 100, 100)}%`,
                      backgroundColor: (totalMonthlySpend / parseInt(budgetInput.replace(/[^0-9]/g, ''), 10)) * 100 > 80 ? Colors.danger : Colors.success,
                    }
                  ]} />
                </View>
                <Text style={budgetStyles.previewText}>
                  ₩{totalMonthlySpend.toLocaleString()} / ₩{parseInt(budgetInput.replace(/[^0-9]/g, ''), 10).toLocaleString()}
                  {' '}({((totalMonthlySpend / parseInt(budgetInput.replace(/[^0-9]/g, ''), 10)) * 100).toFixed(0)}%)
                </Text>
              </View>
            )}

            <Text style={budgetStyles.hint}>
              {language === 'ko' ? '⚠️ 80% 초과 시 알림을 받습니다' : '⚠️ You will be notified at 80% usage'}
            </Text>

            <GradientButton
              label={language === 'ko' ? '저장' : 'Save'}
              icon="checkmark"
              variant="primary"
              size="lg"
              onPress={saveBudget}
              style={{ marginTop: Spacing.lg }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const budgetStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', paddingHorizontal: 32 },
  sheet: { backgroundColor: '#FFF', borderRadius: 28, padding: 28 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: 'center', marginBottom: 20 },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: 20, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primarySoft, borderRadius: 16, paddingHorizontal: 16, height: 56 },
  currency: { fontSize: 22, fontWeight: FontWeight.bold, color: Colors.primary, marginRight: 8 },
  input: { flex: 1, fontSize: 22, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  previewWrap: { marginTop: 20 },
  previewBar: { height: 10, borderRadius: 5, backgroundColor: Colors.borderLight, overflow: 'hidden' },
  previewFill: { height: '100%', borderRadius: 5 },
  previewText: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 8, textAlign: 'center', fontWeight: FontWeight.medium },
  hint: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 16, textAlign: 'center' },
});

const statusInfoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  range: { fontSize: FontSize.sm, color: Colors.textSecondary, fontWeight: FontWeight.medium, width: 70 },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  currentWrap: { marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  currentLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 8 },
  currentBar: { height: 8, borderRadius: 4, backgroundColor: Colors.borderLight, overflow: 'hidden' },
  currentFill: { height: '100%', borderRadius: 4 },
  currentText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, marginTop: 8, textAlign: 'center' },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safe: {
    flex: 1,
  },
  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    // 상단 여백을 넉넉히 — 노치/상태바 바로 아래에 붙지 않도록
    paddingTop: Spacing.xxl,
    paddingBottom: Spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.textWhite,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: FontWeight.bold,
    lineHeight: 12,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: TabBarSpace,
  },
  // ── Title Area ──
  titleArea: {
    paddingHorizontal: Spacing.sm,
    marginBottom: Spacing.xxl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  newsBtn: {
    width: 48,
    height: 48,
    marginTop: 4,
    marginRight: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsBtnMark: { width: 36, height: 38 },
  newsBtnShadow: {
    position: 'absolute',
    width: 36,
    height: 38,
    top: 8,
    opacity: 0.22,
  },
  newsBtnDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: Colors.accent,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  subTitle: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.7)',
    marginBottom: 4,
    fontWeight: FontWeight.medium,
  },
  mainTitle: {
    flexShrink: 1,
    fontSize: 42,
    fontWeight: FontWeight.heavy,
    color: Colors.textWhite,
    letterSpacing: -1,
    lineHeight: 48,
  },
  statusPills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.lg,
    gap: Spacing.sm,
    position: 'relative'
  },
  pillContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
    gap: 4,
  },
  pillLabel: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    fontWeight: FontWeight.medium,
  },
  pillValue: {
    fontSize: FontSize.sm,
    color: Colors.textPrimary,
    fontWeight: FontWeight.bold,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
  },
  // ── Main Cards ──
  // ── Glassmorphism Styles (Refined Opacity) ──
  glassPill: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  glassBackground: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  // ── Pager ──
  pagerContainer: {
    marginTop: Spacing.md,
    height: 135,
    zIndex: 20,
    marginHorizontal: -Spacing.lg,
  },
  emptyPager: {
    flex: 1,
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xxl,
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  emptyPagerText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  pagerScroll: {
    flex: 1,
  },
  pagerItem: {
    alignItems: 'center',
    width: ITEM_WIDTH,
  },
  revenueWrapper: {
    alignItems: 'center',
    marginTop: -8,
    zIndex: 5,
  },
  // ── Main Card Refinement ──
  durationText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
    marginTop: 6,
  },
  percentBadge: {
    backgroundColor: Colors.success + '25',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
  },
  percentBadgeText: {
    fontSize: 10,
    color: Colors.success,
    fontWeight: FontWeight.bold,
  },
  newsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.danger + '10',
    padding: 12,
    borderRadius: 16,
    marginTop: Spacing.lg,
  },
  newsText: {
    fontSize: FontSize.xs,
    color: Colors.danger,
    fontWeight: FontWeight.semibold,
    flex: 1,
  },
  // Exchange Rate
  exchangeBox: {
    backgroundColor: '#5856D6' + '10',
    padding: 12,
    borderRadius: 16,
    marginTop: Spacing.md,
  },
  exchangeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  exchangeTitle: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: '#5856D6',
  },
  exchangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  exchangeService: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: FontWeight.medium,
  },
  exchangeRateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  exchangeRate: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  exchangeChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  exchangeChangeText: {
    fontSize: 10,
    fontWeight: FontWeight.bold,
  },
  // ── Original Styles ──
  mainCardStack: {
    marginTop: 0,
    paddingHorizontal: Spacing.sm,
  },
  floatingTopCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 30,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    ...Shadow.sm,
  },
  fCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  fName: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  fId: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
  },
  rotateBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  floatingRevenue: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  revenueLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginRight: 6,
  },
  revenueValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  revenueKrw: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginLeft: 6,
  },
  mainWhiteCard: {
    borderRadius: 40,
    padding: Spacing.xxl,
    marginTop: -85,
    zIndex: 1,
    ...Shadow.md,
    minHeight: 400,
  },
  // ── Sections ──
  paymentWrap: {
    marginTop: 60,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentHeaderTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  paymentTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  roundArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  // ── Upcoming preview ──
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    marginTop: 2,
  },
  upcomingInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  upcomingName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
  },
  upcomingDate: {
    fontSize: FontSize.xs,
    color: Colors.textTertiary,
    marginTop: 1,
  },
  upcomingPct: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.textSecondary,
  },
  percentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  largePercent: {
    fontSize: 48,
    fontWeight: FontWeight.heavy,
    color: Colors.textPrimary,
    letterSpacing: -1.5,
  },
  barcodeSection: {
    marginTop: Spacing.xl,
  },
  barcodeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  bLabelText: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontWeight: FontWeight.heavy,
    textTransform: 'uppercase',
  },
});
