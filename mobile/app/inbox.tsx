import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, Shadow } from '../src/constants/theme';
import { useInbox, NotificationItem } from '../src/hooks/useApi';
import { notificationAPI } from '../src/services/api';
import { useTranslation } from '../src/hooks/useTranslation';

// 알림 타입별 아이콘/색상
const TYPE_STYLE: Record<string, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  overlap: { icon: 'copy-outline', color: Colors.warning },
  price_change: { icon: 'pricetag-outline', color: Colors.danger },
  price_news: { icon: 'trending-up-outline', color: Colors.danger },
  ai_news: { icon: 'sparkles-outline', color: Colors.accent },
  trial_expiry: { icon: 'hourglass-outline', color: Colors.info },
  budget: { icon: 'wallet-outline', color: Colors.warning },
  renewal: { icon: 'calendar-outline', color: Colors.primary },
  exchange_rate: { icon: 'swap-horizontal-outline', color: Colors.info },
  contract_end: { icon: 'document-text-outline', color: Colors.warning },
};

// 딥링크 → 탭 라우트 매핑
function resolveLink(link?: string | null) {
  if (!link) return null;
  const map: Record<string, string> = {
    '/analytics': '/(tabs)/analytics',
    '/subscriptions': '/(tabs)/subscriptions',
    '/calendar': '/(tabs)/calendar',
    '/catalog': '/(tabs)/catalog',
  };
  return map[link] ?? null;
}

export default function InboxScreen() {
  const { t } = useTranslation();
  const { data, loading, refetch } = useInbox();
  const [refreshing, setRefreshing] = React.useState(false);

  const items = data?.items ?? [];
  const unread = data?.unread_count ?? 0;

  const timeAgo = React.useCallback(
    (iso: string) => {
      const diff = Date.now() - new Date(iso).getTime();
      const min = Math.floor(diff / 60000);
      if (min < 1) return t('inbox.justNow');
      if (min < 60) return t('inbox.minutesAgo', { n: min });
      const hr = Math.floor(min / 60);
      if (hr < 24) return t('inbox.hoursAgo', { n: hr });
      return t('inbox.daysAgo', { n: Math.floor(hr / 24) });
    },
    [t]
  );

  // 알림함을 한 번 열면 전부 읽음 처리한다.
  // 그래야 홈의 배지가 사라지고, 이후 새 알림이 오면 다시 뜬다.
  const autoMarked = React.useRef(false);
  React.useEffect(() => {
    if (autoMarked.current || !data || unread === 0) return;
    autoMarked.current = true;
    notificationAPI
      .markAllRead()
      .then(() => refetch())
      .catch(() => { /* noop */ });
  }, [data, unread, refetch]);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handlePress = async (item: NotificationItem) => {
    if (!item.is_read) {
      try { await notificationAPI.markRead(item.id); } catch { /* noop */ }
    }
    const route = resolveLink(item.link);
    if (route) router.push(route as never);
    else refetch();
  };

  const handleDismiss = async (id: string) => {
    try { await notificationAPI.dismiss(id); } catch { /* noop */ }
    refetch();
  };

  const handleMarkAll = async () => {
    try { await notificationAPI.markAllRead(); } catch { /* noop */ }
    refetch();
  };

  const renderItem = ({ item }: { item: NotificationItem }) => {
    const ts = TYPE_STYLE[item.type] ?? { icon: 'notifications-outline' as const, color: Colors.primary };
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => handlePress(item)}
        style={[styles.card, !item.is_read && styles.cardUnread]}
      >
        <View style={[styles.iconCircle, { backgroundColor: ts.color + '1A' }]}>
          <Ionicons name={ts.icon} size={20} color={ts.color} />
        </View>
        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            {item.category ? (
              <Text style={[styles.chip, { color: ts.color, backgroundColor: ts.color + '14' }]}>
                {item.category}
              </Text>
            ) : <View />}
            <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
          </View>
          <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
          {item.body ? <Text style={styles.body} numberOfLines={2}>{item.body}</Text> : null}
          {item.action_url ? (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => Linking.openURL(item.action_url as string)}
            >
              <Text style={styles.actionBtnText}>{item.action_label || '바로가기'}</Text>
              <Ionicons name="open-outline" size={13} color={Colors.primary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <View style={styles.cardRight}>
          {!item.is_read && <View style={[styles.unreadDot, { backgroundColor: ts.color }]} />}
          <TouchableOpacity hitSlop={8} onPress={() => handleDismiss(item.id)} style={styles.dismissBtn}>
            <Ionicons name="close" size={16} color={Colors.textTertiary} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <LinearGradient colors={[Colors.primaryBg, Colors.background]} style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('inbox.title')}</Text>
          {unread > 0 ? (
            <TouchableOpacity onPress={handleMarkAll} style={styles.markAllBtn}>
              <Text style={styles.markAllText}>{t('inbox.markAllRead')}</Text>
            </TouchableOpacity>
          ) : <View style={styles.headerIconBtn} />}
        </View>

        {loading && !data ? (
          <View style={styles.centerFill}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : items.length === 0 ? (
          <View style={styles.centerFill}>
            <View style={styles.emptyIcon}>
              <Ionicons name="notifications-off-outline" size={32} color={Colors.textTertiary} />
            </View>
            <Text style={styles.emptyTitle}>{t('inbox.empty')}</Text>
            <Text style={styles.emptyHint}>{t('inbox.emptyHint')}</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(it) => it.id}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
            }
          />
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerIconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.textPrimary,
  },
  markAllBtn: {
    height: 40, paddingHorizontal: Spacing.md,
    alignItems: 'center', justifyContent: 'center',
  },
  markAllText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.primary,
  },
  list: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 120 },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.cardBg,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  cardUnread: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.primaryLight,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 4 },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chip: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  time: { fontSize: FontSize.xs, color: Colors.textTertiary },
  title: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semibold,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  body: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 18 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primarySoftBg,
  },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primaryText },
  cardRight: { alignItems: 'center', justifyContent: 'space-between' },
  unreadDot: { width: 8, height: 8, borderRadius: 4 },
  dismissBtn: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.sm },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: Colors.surfaceLight,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  emptyHint: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
});
