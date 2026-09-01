import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { ServiceLogo } from '../../src/components/ServiceLogo';
import { AppLogoMark } from '../../src/components/AppLogoMark';
import { useTranslation } from '../../src/hooks/useTranslation';
import { useCalendarEvents, useTimeline, useExchangeRates } from '../../src/hooks/useApi';
import { useSettingsStore } from '../../src/store/settingsStore';
import { Colors, Spacing, FontSize, FontWeight, Shadow, TabBarSpace } from '../../src/constants/theme';

const DAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

// 통화별 기호 표시 (홈 화면과 동일 규칙) — 외화 구독은 ₩가 아니라 실제 통화로 적는다
const CURRENCY_SYMBOLS: Record<string, string> = { KRW: '₩', USD: '$', EUR: '€', JPY: '¥', GBP: '£' };
function formatPrice(amount: number, currency: string = 'KRW') {
  const symbol = CURRENCY_SYMBOLS[currency] ?? currency + ' ';
  if (currency === 'KRW' || currency === 'JPY') return `${symbol}${Math.round(amount).toLocaleString()}`;
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 캘린더 이벤트 하나의 금액과 통화. 필드 이름이 응답마다 달라 전부 받아 준다. */
function eventAmount(ev: any) {
  return {
    amount: Number(ev.billing_amount ?? ev.amount ?? ev.cost ?? 0),
    currency: String(ev.currency ?? 'KRW'),
  };
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

export default function CalendarScreen() {
  const { t, language } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [activeTab, setActiveTab] = useState<'calendar' | 'timeline'>('calendar');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const calendarEvents = useCalendarEvents(year, month + 1);
  const timeline = useTimeline();
  const ratesQuery = useExchangeRates();
  const monthlyBudget = useSettingsStore(s => s.monthlyBudget);
  const syncSettings = useSettingsStore(s => s.syncFromServer);

  // 예산은 서버에 있다. 홈을 거치지 않고 이 탭부터 열어도 맞게 보이도록 여기서도 맞춘다.
  useFocusEffect(useCallback(() => { syncSettings(); }, [syncSettings]));

  // 합계는 통화가 섞이므로 원화로 환산해서 더한다. 환율을 못 받았으면
  // 원화 구독만 더해 ₩ 표기가 거짓말이 되지 않게 한다.
  const rates = useMemo(() => {
    const raw = (ratesQuery.data as any)?.rates ?? {};
    const parsed: Record<string, number> = {};
    Object.keys(raw).forEach(k => { parsed[k] = Number(raw[k]); });
    return parsed;
  }, [ratesQuery.data]);

  // 실데이터만 (없으면 빈 배열)
  const timelineData = (timeline.data as any)?.timeline ?? (timeline.data as any) ?? [];
  const events = (calendarEvents.data as any)?.events ?? [];

  const todayDay = (year === now.getFullYear() && month === now.getMonth()) ? now.getDate() : -1;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const days = language === 'ko' ? DAYS_KO : DAYS_EN;
  const monthName = language === 'ko' ? `${year}년 ${MONTHS_KO[month]}` : `${MONTHS_EN[month]} ${year}`;

  // 표시 중인 달(year/month)에 해당하는 이벤트만 추림
  const monthEvents = useMemo(() => {
    return events.filter((ev: any) => {
      const raw = ev.billing_date ?? ev.next_billing_date ?? ev.date;
      if (!raw) return false;
      const d = new Date(raw);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [events, year, month]);

  // 결제일 맵 (day → events[]) — 같은 서비스가 같은 날 중복되지 않도록 dedupe
  const paymentMap = useMemo(() => {
    const map: Record<number, any[]> = {};
    for (const ev of monthEvents) {
      const raw = ev.billing_date ?? ev.next_billing_date ?? ev.date;
      const d = new Date(raw).getDate();
      if (!map[d]) map[d] = [];
      if (!map[d].some((e: any) => e.service_name === ev.service_name)) {
        map[d].push(ev);
      }
    }
    return map;
  }, [monthEvents]);

  const calendarDays: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) calendarDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) calendarDays.push(i);

  // 이번 달 합계는 day별 dedupe된 결과 기준
  const monthTotal = Object.values(paymentMap)
    .flat()
    .reduce((sum: number, e: any) => {
      const { amount, currency } = eventAmount(e);
      if (currency === 'KRW') return sum + amount;
      const rate = rates[currency];
      return rate ? sum + amount * rate : sum;
    }, 0);

  // 다가오는 결제 (이번 달, 오늘 이후)
  const upcoming = Object.entries(paymentMap)
    .filter(([day]) => Number(day) >= todayDay)
    .sort(([a], [b]) => Number(a) - Number(b))
    .flatMap(([, list]) => list);

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  const selectedEvents = selectedDay ? (paymentMap[selectedDay] ?? []) : [];

  return (
    <LinearGradient colors={[Colors.primaryBg, Colors.background]} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AppLogoMark />
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.push('/(tabs)/settings')}>
              <Ionicons name="calendar-outline" size={20} color={Colors.textWhite} />
            </TouchableOpacity>
            <View style={styles.headerAvatar}>
              <Ionicons name="person" size={16} color={Colors.primary} />
            </View>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeader}>
            <Text style={styles.subTitle}>{t('calendar.title')}</Text>
            <Text style={styles.mainTitle}>{monthName}</Text>
            <View style={styles.summaryPills}>
              {(monthlyBudget ?? 0) > 0 && (
                <View style={styles.pill}>
                  <Text style={styles.pillLabel}>{t('home.budget')}:</Text>
                  <Text style={styles.pillValue}>₩{Number(monthlyBudget).toLocaleString()}</Text>
                </View>
              )}
              <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                <Text style={styles.pillLabel}>{t('calendar.thisMonth')}:</Text>
                <Text style={styles.pillValue}>₩{Math.round(monthTotal).toLocaleString()}</Text>
              </View>
            </View>
          </View>

          {/* ── 탭 전환 버튼 ── */}
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'calendar' && styles.tabBtnActive]}
              onPress={() => setActiveTab('calendar')}
            >
              <Ionicons name="calendar" size={16} color={activeTab === 'calendar' ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.tabBtnText, activeTab === 'calendar' && styles.tabBtnTextActive]}>
                {t('calendar.calendarTab')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeTab === 'timeline' && styles.tabBtnActive]}
              onPress={() => setActiveTab('timeline')}
            >
              <Ionicons name="git-commit" size={16} color={activeTab === 'timeline' ? Colors.primary : Colors.textTertiary} />
              <Text style={[styles.tabBtnText, activeTab === 'timeline' && styles.tabBtnTextActive]}>
                {t('calendar.timelineTab')}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.cardContainer}>
            <View style={styles.mainWhiteCard}>
              {activeTab === 'calendar' ? (
                <>
                  {/* 월 네비게이션 */}
                  <View style={styles.monthNav}>
                    <TouchableOpacity onPress={prevMonth}>
                      <Ionicons name="chevron-back" size={20} color={Colors.textTertiary} />
                    </TouchableOpacity>
                    <Text style={styles.monthTitle}>
                      {language === 'ko' ? MONTHS_KO[month] : MONTHS_EN[month]}
                    </Text>
                    <TouchableOpacity onPress={nextMonth}>
                      <Ionicons name="chevron-forward" size={20} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.weekRow}>
                    {days.map((d, i) => <Text key={i} style={styles.weekDay}>{d}</Text>)}
                  </View>

                  {calendarEvents.loading ? (
                    <ActivityIndicator style={{ padding: 40 }} color={Colors.primary} />
                  ) : (
                    <View style={styles.calGrid}>
                      {calendarDays.map((day, i) => {
                        const hasPayment = day ? paymentMap[day] : null;
                        const isToday = day === todayDay;
                        const isSelected = day === selectedDay;
                        const cellInner = (
                          <View
                            style={[
                              styles.dayWrap,
                              isSelected && styles.selectedWrap,
                            ]}
                          >
                            <View style={[styles.dayCircle, isToday && styles.todayCircle]}>
                              <Text style={[styles.dayText, isToday && styles.todayText]}>{day}</Text>
                            </View>
                            {hasPayment && (
                              <View style={styles.iconRow}>
                                {hasPayment.slice(0, 2).map((p: any, j: number) => (
                                  <ServiceLogo key={j} name={p.service_name} size={14} />
                                ))}
                                {hasPayment.length > 2 && (
                                  <View style={styles.moreBadge}>
                                    <Text style={styles.moreText}>+{hasPayment.length - 2}</Text>
                                  </View>
                                )}
                              </View>
                            )}
                          </View>
                        );
                        return (
                          <View key={i} style={styles.calCell}>
                            {day && (
                              hasPayment ? (
                                <TouchableOpacity
                                  activeOpacity={0.7}
                                  onPress={() => setSelectedDay(day === selectedDay ? null : day)}
                                >
                                  {cellInner}
                                </TouchableOpacity>
                              ) : cellInner
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}

                  <View style={styles.divider} />

                  {selectedDay && selectedEvents.length > 0 && (
                    <>
                      <Text style={styles.sectionTitle}>
                        {language === 'ko'
                          ? `${MONTHS_KO[month]} ${selectedDay}일 결제`
                          : `${MONTHS_EN[month]} ${selectedDay} payments`}
                      </Text>
                      {selectedEvents.map((ev: any, i: number) => (
                        <View key={i} style={styles.upcomingItem}>
                          <ServiceLogo name={ev.service_name} size={40} />
                          <View style={styles.upcomingInfo}>
                            <Text style={styles.upcomingName}>{ev.service_name}</Text>
                            <Text style={styles.upcomingDate}>
                              {language === 'ko' ? '오늘 결제' : 'Billing today'}
                            </Text>
                          </View>
                          <Text style={styles.upcomingAmount}>
                            {formatPrice(eventAmount(ev).amount, eventAmount(ev).currency)}
                          </Text>
                        </View>
                      ))}
                      <View style={styles.divider} />
                    </>
                  )}

                  <Text style={styles.sectionTitle}>{t('calendar.upcoming')}</Text>
                  {upcoming.length > 0 ? upcoming.map((ev: any, i: number) => {
                    const d = new Date(ev.billing_date ?? ev.next_billing_date ?? ev.date);
                    const dateStr = language === 'ko'
                      ? `${d.getMonth() + 1}월 ${d.getDate()}일`
                      : `${MONTHS_EN[d.getMonth()]} ${d.getDate()}`;
                    return (
                      <View key={i} style={styles.upcomingItem}>
                        <ServiceLogo name={ev.service_name} size={40} />
                        <View style={styles.upcomingInfo}>
                          <Text style={styles.upcomingName}>{ev.service_name}</Text>
                          <Text style={styles.upcomingDate}>{dateStr}</Text>
                        </View>
                        <Text style={styles.upcomingAmount}>{formatPrice(eventAmount(ev).amount, eventAmount(ev).currency)}</Text>
                      </View>
                    );
                  }) : (
                    <Text style={styles.emptyText}>{t('common.noData')}</Text>
                  )}
                </>
              ) : (
                /* ── 타임라인 뷰 ── */
                <>
                  {timeline.loading ? (
                    <ActivityIndicator style={{ padding: 40 }} color={Colors.primary} />
                  ) : timelineData.length > 0 ? (
                    timelineData
                      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((item: any, i: number) => {
                        const date = new Date(item.created_at);
                        const dateStr = language === 'ko'
                          ? `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
                          : `${MONTHS_EN[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
                        const actionIcon = item.action === 'created' ? 'add-circle'
                          : item.action === 'cancelled' ? 'close-circle'
                          : item.action === 'plan_changed' ? 'swap-horizontal-circle' as any
                          : 'ellipse';
                        const actionColor = item.action === 'created' ? Colors.success
                          : item.action === 'cancelled' ? Colors.danger
                          : '#FF9500';
                        return (
                          <View key={item.id ?? i} style={styles.timelineItem}>
                            <View style={styles.timelineLine}>
                              <Ionicons name={actionIcon} size={20} color={actionColor} />
                              {i < timelineData.length - 1 && <View style={styles.timelineConnector} />}
                            </View>
                            <View style={styles.timelineContent}>
                              <View style={styles.timelineRow}>
                                <ServiceLogo name={item.service_name} size={32} />
                                <View style={styles.timelineInfo}>
                                  <Text style={styles.timelineName}>{item.service_name}</Text>
                                  <Text style={styles.timelineDesc}>{item.description ?? item.action}</Text>
                                  <Text style={styles.timelineDate}>{dateStr}</Text>
                                </View>
                              </View>
                            </View>
                          </View>
                        );
                      })
                  ) : (
                    <Text style={styles.emptyText}>{t('calendar.timelineEmpty')}</Text>
                  )}
                </>
              )}
            </View>
          </View>

          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoMark: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textWhite },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  headerIconBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#FFF', justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: TabBarSpace },
  pageHeader: { paddingHorizontal: Spacing.sm, marginBottom: Spacing.xl },
  subTitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', fontWeight: FontWeight.medium, marginBottom: 4 },
  mainTitle: { fontSize: 42, fontWeight: FontWeight.heavy, color: '#FFF', letterSpacing: -1 },
  summaryPills: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pillLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  pillValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.bold },
  cardContainer: { marginTop: Spacing.sm, paddingHorizontal: Spacing.sm },
  mainWhiteCard: { backgroundColor: '#FFF', borderRadius: 40, padding: Spacing.xxl, ...Shadow.md },
  monthNav: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, marginBottom: Spacing.xl },
  monthTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  weekRow: { flexDirection: 'row', marginBottom: Spacing.md },
  weekDay: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: FontWeight.heavy, color: Colors.textTertiary, textTransform: 'uppercase' },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: '14.28%', minHeight: 56, paddingVertical: 2, justifyContent: 'flex-start', alignItems: 'center' },
  dayWrap: { width: 40, paddingVertical: 4, borderRadius: 12, justifyContent: 'flex-start', alignItems: 'center' },
  selectedWrap: { borderWidth: 1.5, borderColor: Colors.primary },
  dayCircle: {
    width: 28, height: 28, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center',
  },
  todayCircle: { backgroundColor: Colors.primarySoft },
  dayText: { fontSize: 13, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  todayText: { color: Colors.primary },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 3 },
  moreBadge: {
    minWidth: 14, height: 14, borderRadius: 7, paddingHorizontal: 3,
    backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center',
  },
  moreText: { fontSize: 8, fontWeight: FontWeight.heavy, color: Colors.textWhite },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.xl },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary, marginBottom: Spacing.lg },
  upcomingItem: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  upcomingInfo: { flex: 1, marginLeft: Spacing.md },
  upcomingName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  upcomingDate: { fontSize: 10, color: Colors.textTertiary, marginTop: 2 },
  upcomingAmount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptyText: { fontSize: FontSize.sm, color: Colors.textTertiary, textAlign: 'center', paddingVertical: Spacing.xxl },
  // Tabs
  tabContainer: {
    flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.xl, marginBottom: Spacing.lg,
  },
  tabBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.3)',
  },
  tabBtnActive: {
    backgroundColor: Colors.surface, ...Shadow.sm,
  },
  tabBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textTertiary },
  tabBtnTextActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  // Timeline
  timelineItem: { flexDirection: 'row', minHeight: 70 },
  timelineLine: { width: 30, alignItems: 'center' },
  timelineConnector: { flex: 1, width: 2, backgroundColor: Colors.borderLight, marginVertical: 4 },
  timelineContent: { flex: 1, paddingBottom: Spacing.lg, paddingLeft: Spacing.sm },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  timelineInfo: { flex: 1 },
  timelineName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  timelineDesc: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  timelineDate: { fontSize: 10, color: Colors.textTertiary, marginTop: 2 },
});
