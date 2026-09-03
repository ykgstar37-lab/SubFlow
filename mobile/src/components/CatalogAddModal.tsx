import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { categoriesAPI, servicesAPI } from '../services/api';
import type { CatalogCategory } from '../hooks/useApi';
import { useTranslation } from '../hooks/useTranslation';
import { useBottomSheet } from '../hooks/useBottomSheet';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../constants/theme';
import { PLAN_CURRENCIES as CURRENCIES } from '../constants/currency';

type Mode = 'category' | 'service';

interface Props {
  /** null이면 닫힌 상태. 열 때 어느 폼인지 정한다. */
  mode: Mode | null;
  onClose: () => void;
  categories: CatalogCategory[];
  /** 추가·삭제 뒤 카탈로그를 다시 읽도록 알린다 */
  onChanged: () => void;
}

// 이모지를 직접 치게 하면 대부분 비워 두고 넘어간다. 자주 쓸 만한 것만 눌러 고른다.
const ICONS = ['🏷️', '🏋️', '🍽️', '🚗', '🏠', '🐾', '🎨', '✈️', '💊', '📦'];
const COLORS = ['#64748B', '#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED'];
const CYCLES: { value: string; ko: string; en: string }[] = [
  { value: 'monthly', ko: '월간', en: 'Monthly' },
  { value: 'yearly', ko: '연간', en: 'Yearly' },
  { value: 'weekly', ko: '주간', en: 'Weekly' },
  { value: 'quarterly', ko: '분기', en: 'Quarterly' },
];

export function CatalogAddModal({ mode, onClose, categories, onChanged }: Props) {
  const { language } = useTranslation();
  const isKo = language === 'ko';

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [currency, setCurrency] = useState('KRW');
  const [cycle, setCycle] = useState('monthly');
  const [website, setWebsite] = useState('');
  const [saving, setSaving] = useState(false);

  const mine = categories.filter((c) => c.is_custom);

  // 아래로 쓸어 닫기 — 앱 안의 다른 시트와 같은 훅을 쓴다.
  const sheet = useBottomSheet(mode !== null, () => {
    reset();
    onClose();
  });

  const reset = () => {
    setName('');
    setIcon(ICONS[0]);
    setColor(COLORS[0]);
    setCategoryId(null);
    setPrice('');
    setCurrency('KRW');
    setCycle('monthly');
    setWebsite('');
  };

  const close = sheet.close;

  const failMessage = (status?: number) => {
    if (status === 400) {
      return isKo ? '같은 이름이 이미 있습니다.' : 'That name is already taken.';
    }
    return isKo ? '저장하지 못했습니다.' : 'Could not save.';
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      if (mode === 'category') {
        await categoriesAPI.create({ name: trimmed, icon, color });
        setName('');
        onChanged();
      } else {
        await servicesAPI.create({
          name: trimmed,
          category_id: categoryId ?? undefined,
          website_url: website.trim() || undefined,
          // 요금제가 없으면 카드에 가격이 안 뜨고 여기서 바로 구독을 걸 수도 없다.
          // 금액을 비워 두면 이름만 등록한다.
          plans: price.trim()
            ? [{ name: isKo ? '기본' : 'Standard', price: Number(price), currency, billing_cycle: cycle }]
            : [],
        });
        onChanged();
        close();
      }
    } catch (e: any) {
      Alert.alert(
        isKo ? '오류' : 'Error',
        failMessage(e?.response?.status)
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = (category: CatalogCategory) => {
    Alert.alert(
      isKo ? '카테고리 삭제' : 'Delete category',
      isKo
        ? `'${category.name}'을(를) 삭제할까요? 구독 기록은 남고 분류만 없어집니다.`
        : `Delete '${category.name}'? Your subscriptions stay, they just lose the label.`,
      [
        { text: isKo ? '취소' : 'Cancel', style: 'cancel' },
        {
          text: isKo ? '삭제' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              await categoriesAPI.remove(category.id);
              onChanged();
            } catch {
              Alert.alert(isKo ? '오류' : 'Error', isKo ? '삭제하지 못했습니다.' : 'Could not delete.');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const title =
    mode === 'category'
      ? isKo ? '카테고리 추가' : 'Add category'
      : isKo ? '서비스 추가' : 'Add service';

  return (
    <Modal visible={mode !== null} transparent animationType="none" onRequestClose={close}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* 배경을 눌러도 닫힌다 */}
        <Animated.View style={[styles.overlay, { opacity: sheet.backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        </Animated.View>

        <Animated.View style={[styles.sheet, sheet.style]} {...sheet.panHandlers}>
          {/* 잡고 내릴 곳임을 알리는 손잡이. 4px 막대만 노려 잡기 어려우니
              주변까지 끌리는 영역으로 감싼다. */}
          <View style={styles.handleZone} {...sheet.handlePanHandlers}>
            <View style={styles.handle} />
          </View>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{title}</Text>
            <TouchableOpacity onPress={close} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={Colors.textTertiary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={sheet.onScroll}
            scrollEventThrottle={sheet.scrollEventThrottle}
          >
            {mode === 'service' && (
              <Text style={styles.hint}>
                {isKo
                  ? '카탈로그에 없는 서비스를 직접 등록합니다. 나에게만 보입니다.'
                  : "Add a service the catalog doesn't have. Only you can see it."}
              </Text>
            )}

            <Text style={styles.label}>{isKo ? '이름' : 'Name'}</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              maxLength={mode === 'category' ? 100 : 200}
              placeholder={
                mode === 'category'
                  ? isKo ? '예: 운동, 반려동물' : 'e.g. Fitness, Pets'
                  : isKo ? '예: 동네 헬스장' : 'e.g. Local gym'
              }
              placeholderTextColor={Colors.textTertiary}
            />

            {mode === 'category' ? (
              <>
                <Text style={styles.label}>{isKo ? '아이콘' : 'Icon'}</Text>
                <View style={styles.chipRow}>
                  {ICONS.map((emoji) => (
                    <TouchableOpacity
                      key={emoji}
                      style={[styles.iconChip, icon === emoji && styles.iconChipActive]}
                      onPress={() => setIcon(emoji)}
                    >
                      <Text style={styles.iconChipText}>{emoji}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>{isKo ? '색' : 'Color'}</Text>
                <View style={styles.chipRow}>
                  {COLORS.map((hex) => (
                    <TouchableOpacity
                      key={hex}
                      style={[
                        styles.colorChip,
                        { backgroundColor: hex },
                        color === hex && styles.colorChipActive,
                      ]}
                      onPress={() => setColor(hex)}
                    />
                  ))}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.label}>{isKo ? '카테고리' : 'Category'}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillScroll}>
                  <TouchableOpacity
                    style={[styles.pill, categoryId === null && styles.pillActive]}
                    onPress={() => setCategoryId(null)}
                  >
                    <Text style={[styles.pillText, categoryId === null && styles.pillTextActive]}>
                      {isKo ? '미분류' : 'None'}
                    </Text>
                  </TouchableOpacity>
                  {categories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.pill, categoryId === c.id && styles.pillActive]}
                      onPress={() => setCategoryId(c.id)}
                    >
                      <Text style={[styles.pillText, categoryId === c.id && styles.pillTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.label}>{isKo ? '금액' : 'Amount'}</Text>
                <TextInput
                  style={styles.input}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="number-pad"
                  placeholder="50000"
                  placeholderTextColor={Colors.textTertiary}
                />

                <Text style={styles.label}>{isKo ? '통화' : 'Currency'}</Text>
                <View style={styles.chipRow}>
                  {CURRENCIES.map((c) => (
                    <TouchableOpacity
                      key={c}
                      style={[styles.pill, currency === c && styles.pillActive]}
                      onPress={() => setCurrency(c)}
                    >
                      <Text style={[styles.pillText, currency === c && styles.pillTextActive]}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>{isKo ? '결제 주기' : 'Billing cycle'}</Text>
                <View style={styles.chipRow}>
                  {CYCLES.map((c) => (
                    <TouchableOpacity
                      key={c.value}
                      style={[styles.pill, cycle === c.value && styles.pillActive]}
                      onPress={() => setCycle(c.value)}
                    >
                      <Text style={[styles.pillText, cycle === c.value && styles.pillTextActive]}>
                        {isKo ? c.ko : c.en}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.label}>{isKo ? '홈페이지 주소' : 'Website'}</Text>
                <TextInput
                  style={styles.input}
                  value={website}
                  onChangeText={setWebsite}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://"
                  placeholderTextColor={Colors.textTertiary}
                />
              </>
            )}

            <TouchableOpacity
              style={[styles.submit, (saving || !name.trim()) && styles.submitDisabled]}
              onPress={handleSubmit}
              disabled={saving || !name.trim()}
              activeOpacity={0.8}
            >
              {saving ? (
                <ActivityIndicator color={Colors.textWhite} />
              ) : (
                <Text style={styles.submitText}>{isKo ? '추가' : 'Add'}</Text>
              )}
            </TouchableOpacity>

            {/* 만든 카테고리를 지울 곳이 따로 없으면 오타 하나를 영영 안고 간다 */}
            {mode === 'category' && (
              <View style={styles.mineSection}>
                <Text style={styles.mineTitle}>
                  {isKo ? '내가 만든 카테고리' : 'Categories you added'}
                </Text>
                {mine.length === 0 ? (
                  <Text style={styles.mineEmpty}>{isKo ? '아직 없습니다.' : 'None yet.'}</Text>
                ) : (
                  mine.map((c) => (
                    <View key={c.id} style={styles.mineRow}>
                      <View style={[styles.mineIcon, { backgroundColor: c.color ?? Colors.border }]}>
                        <Text style={styles.mineIconText}>{c.icon ?? ''}</Text>
                      </View>
                      <Text style={styles.mineName} numberOfLines={1}>{c.name}</Text>
                      <TouchableOpacity
                        onPress={() => handleDeleteCategory(c)}
                        disabled={saving}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, justifyContent: 'flex-end' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(18,32,50,0.42)' },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xxl,
    maxHeight: '88%',
  },
  handleZone: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.md,
  },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  hint: { fontSize: FontSize.sm, color: Colors.textSecondary, marginBottom: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.textSecondary,
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  input: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.textPrimary,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  iconChip: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primarySoftBg },
  iconChipText: { fontSize: 18 },
  colorChip: { width: 40, height: 40, borderRadius: BorderRadius.md, borderWidth: 3, borderColor: 'transparent' },
  colorChipActive: { borderColor: Colors.textPrimary },
  pillScroll: { flexGrow: 0 },
  pill: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: Spacing.sm,
  },
  pillActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  pillText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  pillTextActive: { color: Colors.textWhite, fontWeight: FontWeight.semibold },
  submit: {
    marginTop: Spacing.xl,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
  },
  submitDisabled: { opacity: 0.45 },
  submitText: { color: Colors.textWhite, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  mineSection: { marginTop: Spacing.xxl, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.lg },
  mineTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  mineEmpty: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: Spacing.sm },
  mineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.surfaceLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginTop: Spacing.sm,
  },
  mineIcon: { width: 28, height: 28, borderRadius: BorderRadius.sm, alignItems: 'center', justifyContent: 'center' },
  mineIconText: { fontSize: 14 },
  mineName: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },
});
