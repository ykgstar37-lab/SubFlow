import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, Pressable, Alert, Linking, Share, PanResponder, Dimensions, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useTranslation } from '../../src/hooks/useTranslation';
import { cyclePriceKey } from '../../src/i18n/translations';
import { ServiceLogo } from '../../src/components/ServiceLogo';
import { AppLogoMark } from '../../src/components/AppLogoMark';
import { GradientButton } from '../../src/components/GradientButton';
import { CatalogAddModal } from '../../src/components/CatalogAddModal';
import { useSubscriptions, useAnalyticsOverview, useCategories } from '../../src/hooks/useApi';
import { useBottomSheet } from '../../src/hooks/useBottomSheet';
import { subscriptionAPI, servicesAPI } from '../../src/services/api';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow, TabBarSpace } from '../../src/constants/theme';
import { formatPrice, krwHint } from '../../src/constants/currency';

type FilterType = 'all' | 'active' | 'paused' | 'cancelled';

const statusKeys: Record<string, { labelKey: 'common.active' | 'common.paused' | 'common.cancelled'; color: string }> = {
  active: { labelKey: 'common.active', color: Colors.success },
  paused: { labelKey: 'common.paused', color: '#FF9500' },
  cancelled: { labelKey: 'common.cancelled', color: Colors.danger },
};

type Sub = {
  id: string;
  name: string;
  plan: string;
  amount: number;
  currency: string;
  cycle: string;
  nextDate: string;
  status: 'active' | 'paused' | 'cancelled';
  category: string;
  categoryId: number | null;
  cancelUrl?: string;
  memberCount: number;
  rateKrw?: number; // 이 통화의 현재 환율 (1 통화 = ? KRW). 원화면 없음
};



// 캘린더 헬퍼
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
const CAL_DAYS_KO = ['일', '월', '화', '수', '목', '금', '토'];
const CAL_DAYS_EN = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function SubscriptionsScreen() {
  const [filter, setFilter] = useState<FilterType>('all');
  const { t, language } = useTranslation();
  const subsQuery = useSubscriptions();
  const overviewQuery = useAnalyticsOverview();
  // 분류는 서버가 원본이다 — 기본 카탈로그 13종 + 내가 만든 것이 함께 내려온다.
  const categoriesQuery = useCategories();
  const categories = (categoriesQuery.data ?? []);
  // 'all'이면 카테고리별로 묶어 보여주고, 하나를 고르면 그 칸만 남긴다.
  // 'none'은 어느 분류에도 안 들어간 구독.
  const [categoryFilter, setCategoryFilter] = useState<number | 'all' | 'none'>('all');
  const [groupPickerOpen, setGroupPickerOpen] = useState(false);
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  // 분류 시트를 닫는 애니메이션이 끝난 뒤에 추가 시트를 연다. 두 Modal이
  // 겹쳐 뜨면 iOS에서 뒤엣것이 안 뜨는 일이 있다.
  const pendingAddCategory = useRef(false);

  // 모달 상태
  const [selectedSub, setSelectedSub] = useState<Sub | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editMembers, setEditMembers] = useState(1);
  const [editCategoryId, setEditCategoryId] = useState<number | null>(null);
  const [editStatus, setEditStatus] = useState<Sub['status']>('active');
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // 플랜 선택 모달 상태
  const [planPickerVisible, setPlanPickerVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: number; cycle: string; currency: string } | null>(null);
  const [servicePlans, setServicePlans] = useState<{ name: string; price: number; cycle: string; currency: string }[]>([]);

  // 날짜 선택 캘린더 상태
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth());

  const apiSubs = (subsQuery.data as any[]) ?? [];
  const allSubs: Sub[] = apiSubs.map((s: any) => ({
    id: String(s.id),
    name: s.service_name ?? s.name ?? 'Unknown',
    plan: s.plan?.name ?? s.plan_name ?? '-',
    amount: Number(s.cost ?? s.billing_amount ?? s.amount ?? 0),
    cycle: s.billing_cycle ?? 'monthly',
    nextDate: s.next_billing_date ?? '—',
    status: (s.status ?? 'active') as any,
    category: s.category?.name ?? s.category_name ?? '',
    categoryId: s.category_id ?? s.category?.id ?? null,
    cancelUrl: s.service?.cancel_url ?? s.cancel_url ?? '',
    currency: s.currency ?? 'KRW',
    rateKrw: s.exchange_rate_krw != null ? Number(s.exchange_rate_krw) : undefined,
    memberCount: Math.max(1, Number(s.member_count ?? 1)),
  }));

  const byStatus = filter === 'all' ? allSubs : allSubs.filter(s => s.status === filter);
  const filtered = categoryFilter === 'all'
    ? byStatus
    : categoryFilter === 'none'
      ? byStatus.filter(s => s.categoryId === null)
      : byStatus.filter(s => s.categoryId === categoryFilter);

  // 분류를 따로 안 고르면 카테고리별로 묶어 보여준다. 순서는 카테고리 목록을
  // 따라가고(기본 13종 먼저, 내가 만든 것이 뒤), 미분류는 맨 끝에 둔다.
  const grouped = useMemo(() => {
    if (categoryFilter !== 'all') return null;
    const buckets = new Map<number | 'none', { label: string; icon: string | null; color: string | null; items: Sub[] }>();
    for (const c of categories) {
      buckets.set(c.id, { label: c.name, icon: c.icon, color: c.color, items: [] });
    }
    buckets.set('none', {
      label: language === 'ko' ? '미분류' : 'Uncategorized',
      icon: null, color: null, items: [],
    });
    for (const sub of filtered) {
      const key: number | 'none' = sub.categoryId !== null && buckets.has(sub.categoryId)
        ? sub.categoryId
        : 'none';
      buckets.get(key)!.items.push(sub);
    }
    return [...buckets.entries()].filter(([, b]) => b.items.length > 0);
  }, [filtered, categories, categoryFilter, language]);

  // 분류 고르기 시트 — 앱 안의 다른 시트와 같은 방식으로 열고 닫는다.
  const groupSheet = useBottomSheet(groupPickerOpen, () => {
    setGroupPickerOpen(false);
    if (pendingAddCategory.current) {
      pendingAddCategory.current = false;
      setAddCategoryOpen(true);
    }
  });

  // 고를 만한 분류만 남긴다. 기본 13종을 전부 늘어놓으면 대부분 0건이라
  // 읽기 힘들다. 다만 내가 만든 분류는 비어 있어도 보여야 한다 — 방금
  // 만들었는데 목록에 없으면 만들어지지 않은 걸로 보인다.
  const usedCategories = useMemo(() => {
    const ids = new Set(allSubs.map(s => s.categoryId).filter(id => id !== null));
    return categories.filter(c => ids.has(c.id) || c.is_custom);
  }, [allSubs, categories]);
  const hasUncategorised = allSubs.some(s => s.categoryId === null);

  /** 기본 13종은 사전에 번역이 있고, 사용자가 만든 이름은 없다. */
  const categoryLabel = (name: string) => {
    const key = `category.${name}`;
    const label = t(key as any);
    return label === key ? name : label;
  };

  const allLabel = language === 'ko' ? '분류 전체' : 'All groups';
  const noneLabel = language === 'ko' ? '미분류' : 'Uncategorized';

  /** 헤더 버튼에 찍히는 현재 선택. */
  const activeGroupLabel =
    categoryFilter === 'all'
      ? allLabel
      : categoryFilter === 'none'
        ? noneLabel
        : categoryLabel(categories.find(c => c.id === categoryFilter)?.name ?? '');

  /** 시트에 늘어놓을 항목. 쓰이는 분류만 두고 각각 몇 건인지 함께 보여준다. */
  const groupOptions: { key: number | 'all' | 'none'; label: string; icon: string | null; color: string | null; count: number }[] = [
    { key: 'all', label: allLabel, icon: null, color: null, count: byStatus.length },
    ...usedCategories.map(c => ({
      key: c.id as number | 'all' | 'none',
      label: categoryLabel(c.name),
      icon: c.icon,
      color: c.color,
      count: byStatus.filter(s => s.categoryId === c.id).length,
    })),
    ...(hasUncategorised
      ? [{
          key: 'none' as number | 'all' | 'none',
          label: noneLabel,
          icon: null,
          color: null,
          count: byStatus.filter(s => s.categoryId === null).length,
        }]
      : []),
  ];
  // 월 총액: 통화가 섞여 있으면 단순 합산이 불가하므로, 백엔드가 KRW로 환산해 준 값을 사용
  const naiveTotal = allSubs.filter(s => s.status === 'active').reduce((sum, s) => sum + s.amount, 0);
  const monthlyTotalKRW = Number((overviewQuery.data as any)?.total_monthly_cost ?? naiveTotal);

  // 절약 인사이트에서 "요금제 바꾸기"를 누르면 이 화면으로 보내면서
  // 어떤 구독을 열지 알려준다. 목록이 아직 안 왔으면 다음 렌더에서 다시 본다.
  const params = useLocalSearchParams<{ focus?: string; plan?: string }>();
  const handledFocus = useRef<string | null>(null);

  const openModal = (sub: Sub) => {
    setSelectedSub(sub);
    setEditDate(sub.nextDate);
    setEditMembers(sub.memberCount);
    setEditCategoryId(sub.categoryId);
    setEditStatus(sub.status);
    // 탭은 한 번 뜨면 계속 살아 있다. 서비스 탐색에서 방금 만든 분류가
    // 여기 목록에 없으면 고를 수가 없으므로, 시트를 열 때 다시 읽는다.
    categoriesQuery.refetch();
    setSelectedPlan(null);
    setPlanPickerVisible(false);
    setDatePickerVisible(false);
    setModalVisible(true);

    // 날짜 파싱하여 캘린더 초기화
    if (sub.nextDate && sub.nextDate !== '—') {
      const d = new Date(sub.nextDate);
      setCalYear(d.getFullYear());
      setCalMonth(d.getMonth());
    } else {
      const now = new Date();
      setCalYear(now.getFullYear());
      setCalMonth(now.getMonth());
    }

    // 서비스 플랜 로드 (API에서 실제 플랜 조회)
    setServicePlans([]);
    servicesAPI.search(sub.name).then(res => {
      const services = res.data?.services ?? res.data ?? [];
      const matched = services.find?.((s: any) => s.name === sub.name);
      if (matched?.plans?.length > 0) {
        setServicePlans(matched.plans.map((p: any) => ({
          name: p.name, price: Number(p.price), cycle: p.billing_cycle?.toLowerCase() ?? 'monthly',
          currency: p.currency ?? 'KRW',
        })));
      }
    }).catch(() => {});

    fadeAnim.setValue(0);
    slideAnim.setValue(600);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    const id = typeof params.focus === 'string' ? params.focus : undefined;
    if (!id || handledFocus.current === id) return;
    const target = allSubs.find((s) => s.id === id);
    if (!target) return;
    handledFocus.current = id;
    openModal(target);
    // openModal이 요금제 선택을 닫으므로 그 뒤에 연다
    if (params.plan === '1') setPlanPickerVisible(true);
  }, [params.focus, params.plan, allSubs]);

  const closeModal = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 600, duration: 250, useNativeDriver: true }),
    ]).start(() => { setModalVisible(false); setSelectedSub(null); setPlanPickerVisible(false); setDatePickerVisible(false); });
  };

  // 시트를 아래로 끌어 닫기. 안쪽이 ScrollView라 스크롤이 맨 위일 때만
  // 제스처를 가로채야 목록 스크롤과 싸우지 않는다.
  const sheetScrollY = useRef(0);
  const sheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        sheetScrollY.current <= 0 && g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => { if (g.dy > 0) slideAnim.setValue(g.dy); },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          closeModal();
        } else {
          Animated.spring(slideAnim, { toValue: 0, damping: 25, stiffness: 300, useNativeDriver: true }).start();
        }
      },
    })
  ).current;

  // 캘린더 데이터
  const calDaysInMonth = getDaysInMonth(calYear, calMonth);
  const calFirstDay = getFirstDayOfMonth(calYear, calMonth);
  const calendarCells: (number | null)[] = useMemo(() => {
    const cells: (number | null)[] = [];
    for (let i = 0; i < calFirstDay; i++) cells.push(null);
    for (let i = 1; i <= calDaysInMonth; i++) cells.push(i);
    return cells;
  }, [calYear, calMonth, calDaysInMonth, calFirstDay]);

  const calPrevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
  };
  const calNextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
  };

  // 선택된 날짜의 day 파싱
  const selectedDay = useMemo(() => {
    if (!editDate || editDate === '—') return -1;
    const d = new Date(editDate);
    if (d.getFullYear() === calYear && d.getMonth() === calMonth) return d.getDate();
    return -1;
  }, [editDate, calYear, calMonth]);

  const handleDateSelect = (day: number) => {
    const mm = String(calMonth + 1).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    setEditDate(`${calYear}-${mm}-${dd}`);
    setDatePickerVisible(false);
  };

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await subscriptionAPI.exportCsv();
      const raw = typeof res.data === 'string' ? res.data : String(res.data ?? '');
      if (!raw.trim()) {
        Alert.alert(language === 'ko' ? '내보내기' : 'Export', language === 'ko' ? '내보낼 구독이 없어요.' : 'No subscriptions to export.');
        return;
      }

      // 백엔드가 BOM을 붙여 보내지만 전송 계층에 따라 남아 있기도, 떨어져 나가기도 한다.
      // 한 번 벗기고 다시 붙여 항상 정확히 하나만 유지 — BOM이 없으면 엑셀에서 한글이 깨진다.
      const csv = '﻿' + raw.replace(/^﻿/, '');

      // 파일명은 백엔드 Content-Disposition과 동일한 규칙
      const today = new Date().toISOString().slice(0, 10);
      const file = new File(Paths.cache, `subflow_subscriptions_${today}.csv`);
      file.create({ overwrite: true });
      file.write(csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          UTI: 'public.comma-separated-values-text', // iOS에서 엑셀·번호 앱이 잡히도록
          dialogTitle: language === 'ko' ? '구독 목록 내보내기' : 'Export subscriptions',
        });
      } else {
        // 공유 시트를 못 쓰는 환경(웹 등) — 기존처럼 텍스트로라도 넘긴다
        await Share.share({ title: 'SubFlow 구독 내역', message: raw });
      }
    } catch {
      Alert.alert(language === 'ko' ? '내보내기 실패' : 'Export failed', language === 'ko' ? '잠시 후 다시 시도해 주세요.' : 'Please try again later.');
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = () => {
    if (!selectedSub) return;
    const msg = language === 'ko' ? `${selectedSub.name}을(를) 삭제할까요?` : `Delete ${selectedSub.name}?`;
    Alert.alert(language === 'ko' ? '삭제' : 'Delete', msg, [
      { text: language === 'ko' ? '취소' : 'No', style: 'cancel' },
      { text: language === 'ko' ? '삭제' : 'Delete', style: 'destructive', onPress: async () => {
        try { await subscriptionAPI.cancel(selectedSub.id); } catch {}
        closeModal();
        subsQuery.refetch();
      }},
    ]);
  };

  /** 목록 한 줄. 묶어서 보여줄 때와 늘어놓을 때가 같은 모양이라 한곳에 둔다. */
  const renderRow = (sub: Sub, i: number) => (
    <TouchableOpacity key={sub.id} style={[styles.subItem, i > 0 && styles.itemBorder]} onPress={() => openModal(sub)} activeOpacity={0.6}>
      <ServiceLogo name={sub.name} size={48} />
      <View style={styles.subInfo}>
        <Text style={styles.subName}>{sub.name}</Text>
        <Text style={styles.subDetail}>
          {sub.plan}{sub.category ? ` · ${categoryLabel(sub.category)}` : ''}
        </Text>
        {sub.memberCount > 1 && (
          <View style={styles.splitBadge}>
            <Ionicons name="people" size={11} color={Colors.primary} />
            <Text style={styles.splitBadgeText}>
              {sub.memberCount}{language === 'ko' ? '명 · 내 몫 ' : ' · mine '}
              {formatPrice(sub.amount / sub.memberCount, sub.currency)}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.subRight}>
        <Text style={styles.subAmount}>{formatPrice(sub.amount, sub.currency)}</Text>
        {/* 외화 구독은 현재 환율 기준 원화를 아래에 병기 */}
        {krwHint(sub.amount, sub.currency, sub.rateKrw) !== '' && (
          <Text style={styles.subKrw}>{krwHint(sub.amount, sub.currency, sub.rateKrw)}</Text>
        )}
        <Text style={styles.subDate}>{sub.nextDate}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <LinearGradient colors={[Colors.primaryBg, Colors.background]} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <AppLogoMark />
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.addBtn} onPress={handleExport} disabled={exporting}>
              <Ionicons name={exporting ? 'hourglass-outline' : 'share-outline'} size={20} color={Colors.textWhite} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/(tabs)/catalog')}>
              <Ionicons name="add" size={24} color={Colors.textWhite} />
            </TouchableOpacity>
            <View style={styles.headerAvatar}>
              <Ionicons name="person" size={16} color={Colors.primary} />
            </View>
          </View>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.pageHeader}>
            <Text style={styles.subTitle}>{t('subs.subtitle')}</Text>
            <Text style={styles.mainTitle}>{t('subs.title')}</Text>
            <View style={styles.summaryPills}>
              <View style={styles.pill}>
                <Text style={styles.pillLabel}>Active:</Text>
                <Text style={styles.pillValue}>{allSubs.filter(s => s.status === 'active').length}</Text>
              </View>
              <View style={[styles.pill, { backgroundColor: 'rgba(255,255,255,0.7)' }]}>
                <Text style={styles.pillLabel}>Monthly Total:</Text>
                <Text style={styles.pillValue}>₩{monthlyTotalKRW.toLocaleString()}</Text>
              </View>
            </View>
          </View>

          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {(['all', 'active', 'paused', 'cancelled'] as FilterType[]).map(f => (
                <TouchableOpacity key={f} style={[styles.filterPill, filter === f && styles.filterPillActive]} onPress={() => setFilter(f)}>
                  <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
                    {f === 'all' ? t('common.all') : t(statusKeys[f]?.labelKey)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <View style={styles.cardContainer}>
            <View style={styles.mainWhiteCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>{t('subs.title')}</Text>
                {/* 분류는 이 목록에만 걸리는 조건이라 목록 머리에 둔다.
                    바깥에 줄을 하나 더 만들면 상태 줄과 붙어 조잡해진다. */}
                <TouchableOpacity
                  style={styles.groupPickerBtn}
                  onPress={() => setGroupPickerOpen(true)}
                  activeOpacity={0.7}
                >
                  <Ionicons name="albums-outline" size={14} color={Colors.primary} />
                  <Text style={styles.groupPickerText} numberOfLines={1}>
                    {activeGroupLabel}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={Colors.primary} />
                </TouchableOpacity>
              </View>

              {/* 분류 전체일 때는 카테고리별로 묶고, 하나를 고르면 그냥 늘어놓는다 */}
              {grouped
                ? grouped.map(([key, bucket]) => (
                    <View key={String(key)}>
                      <View style={styles.groupHeader}>
                        <View
                          style={[
                            styles.groupDot,
                            { backgroundColor: bucket.color ?? Colors.border },
                          ]}
                        >
                          {bucket.icon ? <Text style={styles.groupDotIcon}>{bucket.icon}</Text> : null}
                        </View>
                        <Text style={styles.groupTitle}>
                          {key === 'none' ? bucket.label : categoryLabel(bucket.label)}
                        </Text>
                        <Text style={styles.groupCount}>{bucket.items.length}</Text>
                      </View>
                      {bucket.items.map((sub, i) => renderRow(sub, i))}
                    </View>
                  ))
                : filtered.map((sub, i) => renderRow(sub, i))}

              {filtered.length === 0 && (
                <Text style={styles.emptyText}>{t('common.noData')}</Text>
              )}
            </View>
          </View>
          <View style={{ height: 120 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ── 분류 고르기 시트 ── */}
      {/* 떠 있는 탭바는 이 화면 바깥(Tabs 내비게이터)에서 그려져서 zIndex로는
          못 이긴다. Modal로 띄워야 탭바 위로 올라온다. */}
      <Modal
        visible={groupPickerOpen}
        transparent
        animationType="none"
        onRequestClose={groupSheet.close}
      >
        <View style={StyleSheet.absoluteFill}>
          <Animated.View style={[styles.modalOverlay, { opacity: groupSheet.backdrop }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={groupSheet.close} />
          </Animated.View>
          <View style={styles.sheetAnchor} pointerEvents="box-none">
            <Animated.View style={[styles.groupSheet, groupSheet.style]} {...groupSheet.panHandlers}>
              {/* 손잡이는 4px짜리 막대라 그것만 노려 잡기 어렵다 — 주변까지 끌리게 */}
              <View style={styles.sheetHandleZone} {...groupSheet.handlePanHandlers}>
                <View style={styles.groupSheetHandle} />
              </View>
              <Text style={styles.groupSheetTitle}>
                {language === 'ko' ? '분류' : 'Category'}
              </Text>
              <ScrollView
                style={{ maxHeight: 360 }}
                onScroll={groupSheet.onScroll}
                scrollEventThrottle={groupSheet.scrollEventThrottle}
              >
                {groupOptions.map(opt => {
                  const selected = categoryFilter === opt.key;
                  return (
                    <TouchableOpacity
                      key={String(opt.key)}
                      style={[styles.groupOptionRow, selected && styles.groupOptionRowActive]}
                      onPress={() => { setCategoryFilter(opt.key); groupSheet.close(); }}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.groupOptionDot, { backgroundColor: opt.color ?? Colors.borderLight }]}>
                        {opt.icon ? <Text style={styles.groupOptionIcon}>{opt.icon}</Text> : null}
                      </View>
                      <Text style={[styles.groupOptionLabel, selected && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                        {opt.label}
                      </Text>
                      <Text style={styles.groupOptionCount}>{opt.count}</Text>
                      {selected && <Ionicons name="checkmark" size={18} color={Colors.primary} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* 카탈로그로 건너가지 않고 여기서 바로 분류를 만든다 */}
              <TouchableOpacity
                style={styles.groupAddRow}
                onPress={() => {
                  pendingAddCategory.current = true;
                  groupSheet.close();
                }}
                activeOpacity={0.6}
              >
                <View style={styles.groupAddIcon}>
                  <Ionicons name="add" size={16} color={Colors.primary} />
                </View>
                <Text style={styles.groupAddText}>
                  {language === 'ko' ? '분류 만들기' : 'Create a category'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </View>
      </Modal>

      {/* 분류 추가·삭제는 서비스 탐색과 같은 시트를 쓴다 */}
      <CatalogAddModal
        mode={addCategoryOpen ? 'category' : null}
        onClose={() => setAddCategoryOpen(false)}
        categories={categories}
        onChanged={() => {
          categoriesQuery.refetch();
          subsQuery.refetch();
        }}
      />

      {/* ── 구독 상세 모달 ── */}
      {modalVisible && selectedSub && (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Animated.View style={[styles.modalOverlay, { opacity: fadeAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={closeModal} />
          </Animated.View>
          <Animated.View
            style={[styles.modalSheet, { transform: [{ translateY: slideAnim }] }]}
            {...sheetPan.panHandlers}
          >
            <View style={styles.modalHandle} />
            {/* 높이는 화면 비율로 잡는다 — 600 고정이면 작은 기기에서 시트가 화면을 넘는다.
                아래 여백(TabBarSpace)이 있어야 마지막 버튼이 떠 있는 탭바에 가리지 않는다. */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              bounces={false}
              style={{ maxHeight: Dimensions.get('window').height * 0.7 }}
              contentContainerStyle={{ paddingBottom: TabBarSpace }}
              onScroll={(e) => { sheetScrollY.current = e.nativeEvent.contentOffset.y; }}
              scrollEventThrottle={16}
            >

            {/* 서비스 정보 */}
            <View style={styles.modalHeader}>
              <ServiceLogo name={selectedSub.name} size={56} />
              <View style={styles.modalHeaderInfo}>
                <Text style={styles.modalName}>{selectedSub.name}</Text>
                <Text style={styles.modalDetail}>{selectedSub.plan} · {selectedSub.category}</Text>
                <View style={[styles.modalStatusBadge, { backgroundColor: statusKeys[selectedSub.status]?.color + '20' }]}>
                  <Text style={[styles.modalStatusText, { color: statusKeys[selectedSub.status]?.color }]}>
                    {t(statusKeys[selectedSub.status]?.labelKey)}
                  </Text>
                </View>
              </View>
            </View>

            {/* 결제 정보 - 월 비용 클릭 시 플랜 선택 */}
            <View style={styles.modalInfoRow}>
              <TouchableOpacity
                style={[styles.modalInfoItem, servicePlans.length > 0 && styles.modalInfoItemTappable]}
                onPress={() => { if (servicePlans.length > 0) setPlanPickerVisible(!planPickerVisible); }}
                activeOpacity={servicePlans.length > 0 ? 0.6 : 1}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.modalInfoLabel}>{t(cyclePriceKey(selectedPlan?.cycle ?? selectedSub.cycle, 'sub'))}</Text>
                  {servicePlans.length > 0 && (
                    <Ionicons name={planPickerVisible ? 'chevron-up' : 'chevron-down'} size={14} color={Colors.primary} />
                  )}
                </View>
                <Text style={styles.modalInfoValue}>
                  {formatPrice(selectedPlan ? selectedPlan.price : selectedSub.amount,
                               selectedPlan ? selectedPlan.currency : selectedSub.currency)}
                </Text>
                {krwHint(selectedPlan ? selectedPlan.price : selectedSub.amount,
                         selectedPlan ? selectedPlan.currency : selectedSub.currency, selectedSub.rateKrw) !== '' && (
                  <Text style={styles.subKrw}>
                    {krwHint(selectedPlan ? selectedPlan.price : selectedSub.amount,
                             selectedPlan ? selectedPlan.currency : selectedSub.currency, selectedSub.rateKrw)}
                  </Text>
                )}
                {selectedPlan && (
                  <Text style={{ fontSize: FontSize.xs, color: Colors.primary, marginTop: 2 }}>{selectedPlan.name}</Text>
                )}
              </TouchableOpacity>
              <View style={styles.modalInfoItem}>
                <Text style={styles.modalInfoLabel}>{language === 'ko' ? '결제 주기' : 'Cycle'}</Text>
                <Text style={styles.modalInfoValue}>{selectedPlan?.cycle ?? selectedSub.cycle}</Text>
              </View>
            </View>

            {/* 플랜 선택 드롭다운 */}
            {planPickerVisible && servicePlans.length > 0 && (
              <View style={styles.planPicker}>
                <Text style={styles.planPickerTitle}>
                  {language === 'ko' ? `${selectedSub.name} 구독 플랜` : `${selectedSub.name} Plans`}
                </Text>
                {servicePlans.map((plan, i) => {
                  // 이름이 먼저다. 금액으로 맞추면 부가세가 붙은 구독(해외 서비스는
                  // 정가 + 10%가 실제 결제액이다)이 제 요금제를 못 찾는다.
                  const isCurrentPlan = !selectedPlan
                    ? (plan.name === selectedSub.plan
                       || (plan.price === selectedSub.amount && plan.cycle === selectedSub.cycle))
                    : plan.name === selectedPlan.name;
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[styles.planItem, isCurrentPlan && styles.planItemActive]}
                      onPress={() => {
                        setSelectedPlan(plan);
                        setPlanPickerVisible(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.planName, isCurrentPlan && { color: Colors.primary }]}>{plan.name}</Text>
                        <Text style={styles.planCycle}>{plan.cycle}</Text>
                      </View>
                      <Text style={[styles.planPrice, isCurrentPlan && { color: Colors.primary }]}>
                        {formatPrice(plan.price, plan.currency)}
                      </Text>
                      {isCurrentPlan && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} style={{ marginLeft: 8 }} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* 결제일 수정 - 날짜 클릭 시 캘린더 표시 */}
            <View style={styles.modalEditRow}>
              <Text style={styles.modalEditLabel}>{language === 'ko' ? '다음 결제일' : 'Next Payment'}</Text>
              <TouchableOpacity
                style={styles.modalEditInput}
                onPress={() => setDatePickerVisible(!datePickerVisible)}
                activeOpacity={0.6}
              >
                <Text style={{ fontSize: FontSize.md, color: editDate && editDate !== '—' ? Colors.textPrimary : Colors.textTertiary }}>
                  {editDate && editDate !== '—' ? editDate : 'YYYY-MM-DD'}
                </Text>
                <Ionicons name="calendar-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            {/* 인라인 캘린더 날짜 선택기 */}
            {datePickerVisible && (
              <View style={styles.calendarPicker}>
                <View style={styles.calNav}>
                  <TouchableOpacity onPress={calPrevMonth}>
                    <Ionicons name="chevron-back" size={18} color={Colors.textTertiary} />
                  </TouchableOpacity>
                  <Text style={styles.calNavTitle}>
                    {language === 'ko' ? `${calYear}년 ${MONTHS_KO[calMonth]}` : `${MONTHS_EN[calMonth]} ${calYear}`}
                  </Text>
                  <TouchableOpacity onPress={calNextMonth}>
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
                    const today = new Date();
                    const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
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
            )}

            {/* 함께 쓰는 인원 (비용 분담) */}
            <View style={styles.modalEditRow}>
              <Text style={styles.modalEditLabel}>{language === 'ko' ? '함께 쓰는 인원 (비용 분담)' : 'Sharing with (split)'}</Text>
              <View style={styles.memberStepper}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditMembers((n) => Math.max(1, n - 1))}
                >
                  <Ionicons name="remove" size={20} color={Colors.primary} />
                </TouchableOpacity>
                <View style={styles.stepperValueWrap}>
                  <Text style={styles.stepperValue}>{editMembers}</Text>
                  <Text style={styles.stepperUnit}>{language === 'ko' ? '명' : 'ppl'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setEditMembers((n) => Math.min(50, n + 1))}
                >
                  <Ionicons name="add" size={20} color={Colors.primary} />
                </TouchableOpacity>
              </View>
              {editMembers > 1 && (
                <Text style={styles.memberSplitHint}>
                  {language === 'ko' ? '내 몫 ' : 'My share '}
                  {formatPrice((selectedPlan ? selectedPlan.price : selectedSub.amount) / editMembers, selectedSub.currency)}
                  {language === 'ko' ? ' · 대시보드·분석엔 내 몫만 반영돼요' : ' · dashboards use your share'}
                </Text>
              )}
            </View>

            {/* 분류 — 안 고르면 서비스 탐색의 카테고리를 그대로 따른다 */}
            <View style={styles.modalEditRow}>
              <Text style={styles.modalEditLabel}>
                {language === 'ko' ? '분류' : 'Category'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.editPillScroll}>
                <TouchableOpacity
                  style={[styles.editPill, editCategoryId === null && styles.editPillActive]}
                  onPress={() => setEditCategoryId(null)}
                >
                  <Text style={[styles.editPillText, editCategoryId === null && styles.editPillTextActive]}>
                    {language === 'ko' ? '미분류' : 'None'}
                  </Text>
                </TouchableOpacity>
                {categories.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    style={[styles.editPill, editCategoryId === c.id && styles.editPillActive]}
                    onPress={() => setEditCategoryId(c.id)}
                  >
                    {c.icon ? <Text style={styles.editPillIcon}>{c.icon}</Text> : null}
                    <Text style={[styles.editPillText, editCategoryId === c.id && styles.editPillTextActive]}>
                      {categoryLabel(c.name)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.manageCategoryLink}
                onPress={() => { closeModal(); router.push('/(tabs)/catalog'); }}
              >
                <Ionicons name="add-circle-outline" size={14} color={Colors.primary} />
                <Text style={styles.manageCategoryText}>
                  {language === 'ko' ? '분류 만들기 (서비스 탐색)' : 'Create a category (Explore)'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 상태 */}
            <View style={styles.modalEditRow}>
              <Text style={styles.modalEditLabel}>
                {language === 'ko' ? '상태' : 'Status'}
              </Text>
              <View style={styles.editPillRow}>
                {(['active', 'paused', 'cancelled'] as Sub['status'][]).map(st => (
                  <TouchableOpacity
                    key={st}
                    style={[
                      styles.editPill,
                      editStatus === st && { backgroundColor: statusKeys[st].color, borderColor: statusKeys[st].color },
                    ]}
                    onPress={() => setEditStatus(st)}
                  >
                    <Text style={[styles.editPillText, editStatus === st && styles.editPillTextActive]}>
                      {t(statusKeys[st].labelKey)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 액션 버튼들 */}
            <View style={styles.modalActions}>
              {selectedSub.status === 'active' && (
                <View style={{ flex: 1 }}>
                  <GradientButton
                    label={language === 'ko' ? '구독 해지' : 'Cancel Sub'}
                    icon="open-outline"
                    variant="warning"
                    size="md"
                    onPress={() => {
                      if (selectedSub.cancelUrl) {
                        Linking.openURL(selectedSub.cancelUrl);
                      } else {
                        Alert.alert(
                          language === 'ko' ? '해지 안내' : 'Cancel',
                          language === 'ko'
                            ? '이 서비스는 해지 페이지 정보가 없어요. 서비스 앱/웹에서 직접 해지해 주세요.'
                            : 'No cancel page is available. Please cancel from the service directly.'
                        );
                      }
                    }}
                  />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <GradientButton
                  label={language === 'ko' ? '삭제' : 'Delete'}
                  icon="trash"
                  variant="danger"
                  size="md"
                  onPress={handleDelete}
                />
              </View>
            </View>

            {/* 저장 버튼 */}
            <GradientButton
              label={language === 'ko' ? '저장하기' : 'Save Changes'}
              icon="checkmark"
              variant="primary"
              size="lg"
              onPress={async () => {
                try {
                  const updateData: Record<string, unknown> = {};
                  if (editDate && editDate !== '—' && editDate !== selectedSub.nextDate) {
                    updateData.next_billing_date = editDate;
                  }
                  if (selectedPlan) {
                    updateData.cost = selectedPlan.price;
                    updateData.billing_cycle = selectedPlan.cycle;
                    updateData.plan_name = selectedPlan.name;
                  }
                  if (editMembers !== selectedSub.memberCount) {
                    updateData.member_count = editMembers;
                  }
                  if (editCategoryId !== selectedSub.categoryId) {
                    updateData.category_id = editCategoryId;
                  }
                  if (editStatus !== selectedSub.status) {
                    updateData.status = editStatus;
                  }
                  if (Object.keys(updateData).length > 0) {
                    await subscriptionAPI.update(selectedSub.id, updateData);
                  }
                } catch {}
                closeModal();
                subsQuery.refetch();
              }}
            />
            </ScrollView>
          </Animated.View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.xl, paddingVertical: Spacing.sm },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  logoMark: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textWhite },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  addBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.3)', justifyContent: 'center', alignItems: 'center' },
  headerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface, justifyContent: 'center', alignItems: 'center' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xl, paddingBottom: TabBarSpace },
  pageHeader: { paddingHorizontal: Spacing.sm, marginBottom: Spacing.xl },
  subTitle: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', fontWeight: FontWeight.medium, marginBottom: 4 },
  mainTitle: { fontSize: 42, fontWeight: FontWeight.heavy, color: Colors.textWhite, letterSpacing: -1 },
  summaryPills: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.lg },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pillLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  pillValue: { fontSize: FontSize.sm, color: Colors.textPrimary, fontWeight: FontWeight.bold },
  filterContainer: { marginBottom: Spacing.lg },
  filterScroll: { paddingHorizontal: Spacing.sm, gap: Spacing.sm },
  filterPill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  filterPillActive: { backgroundColor: Colors.surface, borderColor: Colors.surface },
  filterText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textWhite },
  filterTextActive: { color: Colors.textPrimary },
  cardContainer: { marginTop: Spacing.sm, paddingHorizontal: Spacing.sm },
  mainWhiteCard: { backgroundColor: Colors.surface, borderRadius: 40, padding: Spacing.xxl, ...Shadow.md, minHeight: 300 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.xl },
  cardTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.lg },
  itemBorder: { borderTopWidth: 1, borderTopColor: Colors.borderLight },
  subInfo: { flex: 1, marginLeft: Spacing.md },
  subName: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subDetail: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 },
  subRight: { alignItems: 'flex-end' },
  splitBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, alignSelf: 'flex-start',
    marginTop: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
    backgroundColor: Colors.primaryLight,
  },
  splitBadgeText: { fontSize: 11, fontWeight: FontWeight.bold, color: Colors.primary },
  memberStepper: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  stepperBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: Colors.surfaceLight,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
  },
  stepperValueWrap: { flexDirection: 'row', alignItems: 'baseline', gap: 4, minWidth: 56, justifyContent: 'center' },
  stepperValue: { fontSize: FontSize.xl, fontWeight: FontWeight.heavy, color: Colors.textPrimary },
  stepperUnit: { fontSize: FontSize.sm, color: Colors.textTertiary },
  memberSplitHint: { fontSize: FontSize.xs, color: Colors.primary, marginTop: 8 },
  // ── 분류 고르기 (카드 헤더 버튼 + 시트) ──
  groupPickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    maxWidth: 170,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primarySoftBg,
  },
  groupPickerText: {
    flexShrink: 1,
    fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary,
  },
  sheetAnchor: { flex: 1, justifyContent: 'flex-end' },
  groupSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl, borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.xl, paddingTop: Spacing.md,
    // 이제 탭바 위로 올라오므로 홈 인디케이터 자리를 직접 비워 준다
    paddingBottom: Spacing.xxxl,
  },
  sheetHandleZone: {
    alignSelf: 'stretch', alignItems: 'center',
    paddingTop: Spacing.xs, paddingBottom: Spacing.md,
  },
  groupSheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  groupSheetTitle: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, marginBottom: Spacing.sm,
  },
  groupOptionRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  groupOptionRowActive: { backgroundColor: Colors.primarySoftBg },
  groupOptionDot: {
    width: 28, height: 28, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
  },
  groupOptionIcon: { fontSize: 13 },
  groupOptionLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },
  groupOptionCount: { fontSize: FontSize.sm, color: Colors.textTertiary },
  groupAddRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    marginTop: Spacing.sm, paddingTop: Spacing.md, paddingHorizontal: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderTopWidth: 1, borderTopColor: Colors.borderLight,
  },
  groupAddIcon: {
    width: 28, height: 28, borderRadius: BorderRadius.sm,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.primarySoftBg,
  },
  groupAddText: { fontSize: FontSize.md, color: Colors.primary, fontWeight: FontWeight.semibold },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
    marginTop: Spacing.lg, marginBottom: Spacing.xs,
  },
  groupDot: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  groupDotIcon: { fontSize: 11 },
  groupTitle: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary },
  groupCount: { fontSize: FontSize.xs, color: Colors.textTertiary, fontWeight: FontWeight.medium },
  // ── 상세 시트의 분류·상태 고르기 ──
  editPillScroll: { flexGrow: 0 },
  editPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  editPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1, borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  editPillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  editPillIcon: { fontSize: 12 },
  editPillText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  editPillTextActive: { color: Colors.textWhite, fontWeight: FontWeight.semibold },
  manageCategoryLink: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.sm },
  manageCategoryText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },
  subAmount: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  subKrw: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  subDate: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 4 },
  emptyText: { textAlign: 'center', marginTop: 40, color: Colors.textTertiary, fontSize: FontSize.sm },
  // ── Modal ──
  modalOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  // 아래 여백은 시트가 아니라 ScrollView 콘텐츠가 갖는다 — 그래야 마지막 버튼을
  // 탭바 위로 '스크롤해서' 올릴 수 있다(시트 패딩이면 잘린 채로 고정된다).
  modalSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: Spacing.xxl },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.borderLight, alignSelf: 'center', marginTop: 12, marginBottom: Spacing.xl },
  modalHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, marginBottom: Spacing.xl },
  modalHeaderInfo: { flex: 1 },
  modalName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalDetail: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  modalStatusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10, alignSelf: 'flex-start', marginTop: 6 },
  modalStatusText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  modalInfoRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  modalInfoItem: { flex: 1, backgroundColor: Colors.surfaceLight, borderRadius: 16, padding: 14 },
  modalInfoLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 4 },
  modalInfoValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  modalEditRow: { marginBottom: Spacing.lg },
  modalEditLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textSecondary, marginBottom: 8 },
  modalEditInput: { backgroundColor: Colors.surfaceLight, borderRadius: 12, paddingHorizontal: 16, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalInfoItemTappable: { borderWidth: 1.5, borderColor: Colors.primaryLight },
  // 플랜 선택
  planPicker: { backgroundColor: Colors.surfaceLight, borderRadius: 16, padding: 14, marginBottom: Spacing.lg },
  planPickerTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textSecondary, marginBottom: Spacing.md },
  planItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4 },
  planItemActive: { backgroundColor: Colors.primaryLight },
  planName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  planCycle: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
  planPrice: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  // 캘린더 날짜 선택
  calendarPicker: { backgroundColor: Colors.surfaceLight, borderRadius: 16, padding: 14, marginBottom: Spacing.lg },
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
  modalActions: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
});
