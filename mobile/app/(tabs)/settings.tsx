import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert,
  Modal, TextInput, Pressable, Linking, Platform, Image, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { Card } from '../../src/components/Card';
import { GradientButton } from '../../src/components/GradientButton';
import { authAPI, feedbackAPI } from '../../src/services/api';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import { useAuthStore } from '../../src/store/authStore';
import { useSettingsStore } from '../../src/store/settingsStore';
import { useTranslation } from '../../src/hooks/useTranslation';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius, TabBarSpace } from '../../src/constants/theme';

interface SettingRowProps {
  icon: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  rightElement?: React.ReactNode;
  onPress?: () => void;
}

function SettingRow({ icon, iconColor = Colors.primary, title, subtitle, rightElement, onPress }: SettingRowProps) {
  return (
    <TouchableOpacity style={rowStyles.row} onPress={onPress} activeOpacity={0.6}>
      <View style={[rowStyles.iconWrap, { backgroundColor: iconColor + '15' }]}>
        <Ionicons name={icon as any} size={20} color={iconColor} />
      </View>
      <View style={rowStyles.info}>
        <Text style={rowStyles.title}>{title}</Text>
        {subtitle && <Text style={rowStyles.subtitle}>{subtitle}</Text>}
      </View>
      {rightElement ?? <Ionicons name="chevron-forward" size={18} color={Colors.textTertiary} />}
    </TouchableOpacity>
  );
}

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md },
  iconWrap: { width: 38, height: 38, borderRadius: BorderRadius.md, justifyContent: 'center', alignItems: 'center' },
  info: { flex: 1, marginLeft: Spacing.md },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.medium, color: Colors.textPrimary },
  subtitle: { fontSize: FontSize.xs, color: Colors.textTertiary, marginTop: 2 },
});

const CURRENCIES = [
  { code: 'KRW', symbol: '₩', label: '한국 원 (KRW)' },
  { code: 'USD', symbol: '$', label: '미국 달러 (USD)' },
  { code: 'EUR', symbol: '€', label: '유로 (EUR)' },
  { code: 'JPY', symbol: '¥', label: '일본 엔 (JPY)' },
  { code: 'GBP', symbol: '£', label: '영국 파운드 (GBP)' },
];

const DAYS_OPTIONS = [1, 2, 3, 5, 7];

export default function SettingsScreen() {
  const { user, logout } = useAuthStore();
  const {
    language, setLanguage,
    pushEnabled, setPushEnabled,
    emailEnabled, setEmailEnabled,
    daysBefore, setDaysBefore,
    monthlyBudget, setMonthlyBudget,
    currency, setCurrency,
  } = useSettingsStore();
  const syncFromServer = useSettingsStore((st) => st.syncFromServer);
  const budgetAlerts = useSettingsStore((st) => st.budgetAlerts);
  const setBudgetAlerts = useSettingsStore((st) => st.setBudgetAlerts);
  const { t } = useTranslation();

  // 이 화면을 열 때마다 서버 값을 다시 읽는다. 웹에서 앱 연동을 켜 두면
  // 앱에서도 켜진 것으로 보여야 한다.
  useFocusEffect(
    React.useCallback(() => { syncFromServer(); }, [syncFromServer])
  );

  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ── 오류 신고 ──
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'bug' | 'suggestion' | 'other'>('bug');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const [shot, setShot] = useState<{ uri: string; filename: string; content_base64: string } | null>(null);

  /**
   * 갤러리에서 사진 한 장을 고른다.
   *
   * 폰 스크린샷은 원본이 몇 MB라 그대로 보내면 메일에 못 싣는다. 긴 변을
   * 1600px로 줄이고 품질을 낮춰 base64로 받으면 대개 수백 KB로 떨어지는데,
   * 화면을 알아보고 글자를 읽는 데는 충분하다.
   */
  const handlePickScreenshot = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          language === 'ko' ? '사진 접근 권한이 필요합니다' : 'Photo access is required',
          language === 'ko'
            ? '설정에서 SubFlow의 사진 권한을 켜주세요.'
            : 'Enable photo access for SubFlow in Settings.',
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.7,
        base64: true,
        allowsEditing: false,
      });
      if (res.canceled || !res.assets?.length) return;

      const asset = res.assets[0];
      if (!asset.base64) {
        Alert.alert(language === 'ko' ? '이미지를 읽지 못했습니다' : 'Could not read the image');
        return;
      }
      // base64는 원본보다 약 4/3 크다. 서버도 5MB에서 자른다.
      if ((asset.base64.length * 3) / 4 > 5 * 1024 * 1024) {
        Alert.alert(
          language === 'ko' ? '이미지가 너무 큽니다' : 'That image is too large',
          language === 'ko' ? '조금 더 작은 사진을 골라주세요.' : 'Please pick a smaller image.',
        );
        return;
      }
      setShot({
        uri: asset.uri,
        filename: (asset.fileName ?? 'screenshot').replace(/\.[^.]+$/, '') + '.jpg',
        content_base64: asset.base64,
      });
    } catch {
      Alert.alert(language === 'ko' ? '사진을 첨부하지 못했습니다' : 'Could not attach the image');
    }
  };

  // 이메일 미인증이면 알림 메일이 아예 나가지 않는다(delivery_service가 검사).
  // 앱에서 인증할 길이 없어 앱만 쓰는 사람은 이메일 알림을 영영 못 받았다.
  const [resending, setResending] = useState(false);

  const handleResendVerification = async () => {
    setResending(true);
    try {
      await authAPI.resendVerification();
      Alert.alert(
        language === 'ko' ? '인증 메일을 보냈어요' : 'Verification email sent',
        language === 'ko'
          ? '메일함에서 링크를 눌러주세요. 인증해야 알림 메일이 발송됩니다.'
          : 'Open the link in your inbox. Email notifications need a verified address.',
      );
    } catch {
      Alert.alert(language === 'ko' ? '잠시 후 다시 시도해주세요' : 'Please try again in a moment');
    } finally {
      setResending(false);
    }
  };

  const handleSendFeedback = async () => {
    // 길이로 막지 않는다. 비어 있으면 보낼 게 없으니 버튼이 이미 꺼져 있다.
    if (!feedbackMessage.trim()) return;
    setSendingFeedback(true);
    try {
      await feedbackAPI.send({
        type: feedbackType,
        message: feedbackMessage.trim(),
        // "안 돼요" 한 줄만 오면 재현할 수가 없어서 기기·버전이라도 같이 보낸다
        client: {
          platform: Platform.OS,
          osVersion: String(Platform.Version),
          appVersion: Constants.expoConfig?.version ?? 'unknown',
          language,
        },
        screenshot: shot ? { filename: shot.filename, content_base64: shot.content_base64 } : null,
      });
      setFeedbackModalVisible(false);
      setFeedbackMessage('');
      setShot(null);
      Alert.alert(
        language === 'ko' ? '보내주셔서 감사합니다' : 'Thanks for the report',
        language === 'ko' ? '확인 후 반영하겠습니다.' : "We'll take a look.",
      );
    } catch {
      Alert.alert(language === 'ko' ? '잠시 후 다시 시도해주세요' : 'Please try again in a moment');
    } finally {
      setSendingFeedback(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(t('settings.logout'), '', [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('settings.logout'),
        style: 'destructive',
        onPress: async () => {
          await logout();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  const openDeleteModal = () => {
    setDeletePassword('');
    setDeleteModalVisible(true);
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword || deleting) return;
    setDeleting(true);
    try {
      await authAPI.deleteAccount(deletePassword);
      setDeleteModalVisible(false);
      // 서버에서 이미 지워졌으니 로컬 토큰만 정리하고 로그인 화면으로
      await logout();
      router.replace('/(auth)/login');
      Alert.alert(t('settings.deleteDone'));
    } catch {
      Alert.alert(t('settings.deleteFailed'));
    } finally {
      setDeleting(false);
    }
  };

  const handleLanguageToggle = () => {
    setLanguage(language === 'en' ? 'ko' : 'en');
  };

  // 저장은 store가 맡는다. 화면은 값만 넘긴다.
  const syncPush = (v: boolean) => setPushEnabled(v);
  const syncEmail = (v: boolean) => setEmailEnabled(v);

  const openBudgetModal = () => {
    setBudgetInput(monthlyBudget ? monthlyBudget.toLocaleString() : '');
    setBudgetModalVisible(true);
  };

  const saveBudget = () => {
    const val = parseInt(budgetInput.replace(/[^0-9]/g, ''), 10);
    if (val > 0) {
      setMonthlyBudget(val);
    }
    setBudgetModalVisible(false);
  };

  const handleAlertTiming = () => {
    const options = DAYS_OPTIONS.map(d =>
      language === 'ko' ? `결제 ${d}일 전` : `${d} days before`
    );
    options.push(language === 'ko' ? '취소' : 'Cancel');
    Alert.alert(
      language === 'ko' ? '결제 알림 시점' : 'Alert Timing',
      language === 'ko' ? '언제 알림을 받으시겠어요?' : 'When would you like to be notified?',
      [
        ...DAYS_OPTIONS.map(d => ({
          text: language === 'ko' ? `결제 ${d}일 전` : `${d} day${d > 1 ? 's' : ''} before`,
          onPress: () => {
            setDaysBefore(d);
          },
          style: d === daysBefore ? 'default' as const : 'default' as const,
        })),
        { text: language === 'ko' ? '취소' : 'Cancel', style: 'cancel' as const },
      ]
    );
  };

  const handleBudgetInput = (val: string) => {
    const num = val.replace(/[^0-9]/g, '');
    if (!num) { setBudgetInput(''); return; }
    setBudgetInput(Number(num).toLocaleString());
  };

  return (
    <LinearGradient colors={[Colors.primaryBg, Colors.background]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            hitSlop={8}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          >
            <Ionicons name="chevron-back" size={24} color={Colors.textWhite} />
          </TouchableOpacity>
          <Text style={styles.pageTitle}>{t('settings.title')}</Text>
        </View>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* 프로필 */}
          <Card variant="elevated" style={styles.profileCard}>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Ionicons name="person" size={28} color={Colors.primary} />
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{user?.username ?? 'User'}</Text>
                <Text style={styles.profileEmail}>{user?.email ?? 'user@example.com'}</Text>
              </View>
              <TouchableOpacity
                style={styles.editBtn}
                onPress={() => Alert.alert(
                  language === 'ko' ? '프로필 편집' : 'Edit Profile',
                  language === 'ko'
                    ? `이름: ${user?.username ?? '-'}\n이메일: ${user?.email ?? '-'}`
                    : `Name: ${user?.username ?? '-'}\nEmail: ${user?.email ?? '-'}`,
                  [{ text: language === 'ko' ? '확인' : 'OK' }]
                )}
              >
                <Ionicons name="create-outline" size={18} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          </Card>

          {/* 알림 */}
          <Text style={styles.sectionTitle}>{t('settings.notifications')}</Text>
          <Card>
            <SettingRow
              icon="notifications"
              title={t('settings.pushNotif')}
              subtitle={t('settings.pushDesc')}
              rightElement={
                <Switch value={pushEnabled} onValueChange={syncPush}
                  trackColor={{ true: Colors.primary, false: Colors.border }} thumbColor={Colors.surface} />
              }
            />
            <View style={styles.divider} />
            <SettingRow
              icon="mail" iconColor="#FF9500"
              title={t('settings.emailNotif')}
              subtitle={t('settings.emailDesc')}
              rightElement={
                <Switch value={emailEnabled} onValueChange={syncEmail}
                  trackColor={{ true: Colors.primary, false: Colors.border }} thumbColor={Colors.surface} />
              }
            />
            {/* 인증되지 않은 주소로는 알림 메일을 보내지 않는다. 켜 두고 왜 안
                오는지 모르는 상태를 없애려고, 미인증일 때만 이 줄을 띄운다. */}
            {user && (user as any).email_verified === false && (
              <>
                <View style={styles.divider} />
                <SettingRow
                  icon="alert-circle" iconColor="#FF9500"
                  title={language === 'ko' ? '이메일 인증이 필요해요' : 'Verify your email'}
                  subtitle={
                    resending
                      ? (language === 'ko' ? '보내는 중...' : 'Sending...')
                      : (language === 'ko'
                          ? '인증 전에는 알림 메일이 나가지 않습니다 · 눌러서 인증 메일 받기'
                          : 'Email notifications are paused until you verify · Tap to resend')
                  }
                  onPress={resending ? undefined : handleResendVerification}
                />
              </>
            )}
            <View style={styles.divider} />
            <SettingRow
              icon="time" iconColor="#5AC8FA"
              title={t('settings.alertTiming')}
              subtitle={t('settings.daysBefore', { n: daysBefore })}
              onPress={handleAlertTiming}
            />
          </Card>

          {/* 예산 */}
          <Text style={styles.sectionTitle}>{t('settings.budget')}</Text>
          <Card>
            <SettingRow
              icon="wallet" iconColor="#34C759"
              title={t('settings.monthlyBudget')}
              subtitle={monthlyBudget ? `₩${monthlyBudget.toLocaleString()}` : '-'}
              onPress={openBudgetModal}
            />
            <View style={styles.divider} />
            {/* 안내만 띄우고 끌 수는 없었다. 예산은 보고 싶은데 알림은 싫은
                사람이 예산을 지우는 것 말고는 방법이 없었다. */}
            <SettingRow
              icon="alert-circle" iconColor="#FF3B30"
              title={t('settings.budgetAlert')}
              subtitle={t('settings.budgetAlertDesc')}
              rightElement={
                <Switch value={budgetAlerts} onValueChange={setBudgetAlerts}
                  trackColor={{ true: Colors.primary, false: Colors.border }} thumbColor={Colors.surface} />
              }
            />
          </Card>

          {/* 일반 */}
          <Text style={styles.sectionTitle}>{t('settings.general')}</Text>
          <Card>
            <SettingRow
              icon="language" iconColor="#5856D6"
              title={t('settings.language')}
              subtitle={t('settings.languageValue')}
              onPress={handleLanguageToggle}
              rightElement={
                <View style={styles.langToggle}>
                  <Text style={[styles.langOption, language === 'en' && styles.langActive]}>EN</Text>
                  <Text style={styles.langSep}>|</Text>
                  <Text style={[styles.langOption, language === 'ko' && styles.langActive]}>KR</Text>
                </View>
              }
            />
            <View style={styles.divider} />
            <SettingRow
              icon="cash"
              title={t('settings.currency')}
              subtitle={`${currency} (${CURRENCIES.find(c => c.code === currency)?.symbol ?? currency})`}
              onPress={() => setCurrencyModalVisible(true)}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="swap-horizontal" iconColor="#FF9500"
              title={t('settings.exchangeRate')}
              subtitle={t('settings.exchangeDesc')}
              onPress={() => router.push('/(tabs)/analytics')}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="shield-checkmark" iconColor="#5AC8FA"
              title={t('settings.privacy')}
              onPress={() => Linking.openURL('https://mysubflow.app/privacy').catch(() => {})}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="document-text" iconColor="#6B7D8E"
              title={t('settings.terms')}
              onPress={() => Linking.openURL('https://mysubflow.app/terms').catch(() => {})}
            />
            <View style={styles.divider} />
            <SettingRow
              icon="chatbubble-ellipses" iconColor="#FF9500"
              title={language === 'ko' ? '오류 신고·의견 보내기' : 'Report a problem'}
              subtitle={language === 'ko' ? '불편한 점을 알려주시면 직접 확인합니다' : "Tell us what went wrong"}
              onPress={() => setFeedbackModalVisible(true)}
            />
          </Card>

          {/* 로그아웃 */}
          <View style={styles.logoutCard}>
            <GradientButton
              label={t('settings.logout')}
              icon="log-out-outline"
              variant="danger"
              size="lg"
              onPress={handleLogout}
            />
          </View>

          {/* 계정 삭제 — Apple 심사 지침 5.1.1(v) */}
          <TouchableOpacity style={styles.deleteRow} onPress={openDeleteModal} activeOpacity={0.6}>
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text style={styles.deleteText}>{t('settings.deleteAccount')}</Text>
          </TouchableOpacity>

          <Text style={styles.version}>SubFlow v1.0.0</Text>
          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>

      {/* 예산 설정 모달 */}
      <Modal transparent animationType="fade" visible={budgetModalVisible} onRequestClose={() => setBudgetModalVisible(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setBudgetModalVisible(false)}>
          <Pressable style={modalStyles.box} onPress={() => {}}>
            <Text style={modalStyles.title}>
              {language === 'ko' ? '월 예산 설정' : 'Set Monthly Budget'}
            </Text>
            <Text style={modalStyles.subtitle}>
              {language === 'ko' ? '월 구독 지출 목표 금액을 입력하세요' : 'Enter your monthly subscription spending goal'}
            </Text>
            <View style={modalStyles.inputRow}>
              <Text style={modalStyles.currencySymbol}>₩</Text>
              <TextInput
                style={modalStyles.input}
                value={budgetInput}
                onChangeText={handleBudgetInput}
                keyboardType="numeric"
                placeholder="100,000"
                placeholderTextColor={Colors.textTertiary}
                autoFocus
              />
            </View>
            <View style={modalStyles.btnRow}>
              <TouchableOpacity style={[modalStyles.btn, modalStyles.btnCancel]} onPress={() => setBudgetModalVisible(false)}>
                <Text style={modalStyles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[modalStyles.btn, modalStyles.btnSave]} onPress={saveBudget}>
                <Text style={modalStyles.btnSaveText}>{t('common.save')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 오류 신고 모달 */}
      <Modal transparent animationType="fade" visible={feedbackModalVisible} onRequestClose={() => setFeedbackModalVisible(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setFeedbackModalVisible(false)}>
          <Pressable style={modalStyles.box} onPress={() => {}}>
            <Text style={modalStyles.title}>
              {language === 'ko' ? '오류 신고·의견 보내기' : 'Report a problem'}
            </Text>
            <Text style={modalStyles.subtitle}>
              {language === 'ko'
                ? '어떤 화면에서 무엇을 하다가 생긴 일인지 적어주시면 큰 도움이 됩니다.'
                : 'Tell us which screen you were on and what you were doing — it helps a lot.'}
            </Text>

            <View style={styles.fbTypeRow}>
              {(['bug', 'suggestion', 'other'] as const).map((ft) => (
                <TouchableOpacity
                  key={ft}
                  style={[styles.fbTypeChip, feedbackType === ft && styles.fbTypeChipActive]}
                  onPress={() => setFeedbackType(ft)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.fbTypeText, feedbackType === ft && styles.fbTypeTextActive]}>
                    {ft === 'bug'
                      ? (language === 'ko' ? '오류' : 'Bug')
                      : ft === 'suggestion'
                        ? (language === 'ko' ? '개선 의견' : 'Idea')
                        : (language === 'ko' ? '기타' : 'Other')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={styles.fbInput}
              value={feedbackMessage}
              onChangeText={setFeedbackMessage}
              multiline
              maxLength={2000}
              textAlignVertical="top"
              // 여러 줄 입력은 엔터가 줄바꿈이라 키보드가 안 내려가고, 그 키보드가
              // 보내기 버튼을 가린다. 엔터로 닫히게 하고 키 모양도 '완료'로 바꾼다.
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              onSubmitEditing={() => Keyboard.dismiss()}
              placeholder={language === 'ko' ? '내용을 적어주세요' : 'Describe the problem'}
              placeholderTextColor={Colors.textTertiary}
            />
            {/* 사진 첨부 — 글로 설명하기 어려운 화면은 한 장이 훨씬 빠르다 */}
            <View style={styles.fbShotRow}>
              <TouchableOpacity style={styles.fbShotBtn} onPress={handlePickScreenshot} activeOpacity={0.7}>
                <Ionicons name="image-outline" size={16} color={Colors.primary} />
                <Text style={styles.fbShotText}>
                  {language === 'ko' ? '사진 첨부' : 'Attach image'}
                </Text>
              </TouchableOpacity>
              {shot && (
                <View>
                  <Image source={{ uri: shot.uri }} style={styles.fbShotPreview} />
                  <TouchableOpacity
                    style={styles.fbShotRemove}
                    onPress={() => setShot(null)}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={12} color={Colors.textWhite} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 값만 늘어놓으면 무슨 뜻인지 알 수 없어 항목 이름을 붙인다 */}
            <View style={styles.fbMeta}>
              <Text style={styles.fbMetaLabel}>{language === 'ko' ? '함께 전송되는 정보' : 'Sent along'}</Text>
              {[
                [language === 'ko' ? '보낸이' : 'From', user?.email ?? ''],
                [language === 'ko' ? '기기' : 'Device', Platform.OS],
                [language === 'ko' ? '앱 버전' : 'App', Constants.expoConfig?.version ?? '-'],
              ].map(([label, value]) => (
                <View key={label} style={styles.fbMetaRow}>
                  <Text style={styles.fbMetaKey}>{label}</Text>
                  <Text style={styles.fbMetaValue} numberOfLines={1}>{value}</Text>
                </View>
              ))}
            </View>

            <View style={modalStyles.btnRow}>
              <TouchableOpacity style={[modalStyles.btn, modalStyles.btnCancel]} onPress={() => setFeedbackModalVisible(false)}>
                <Text style={modalStyles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  modalStyles.btn, modalStyles.btnSave,
                  (sendingFeedback || !feedbackMessage.trim()) && modalStyles.btnDisabled,
                ]}
                onPress={handleSendFeedback}
                disabled={sendingFeedback || !feedbackMessage.trim()}
              >
                <Text style={modalStyles.btnSaveText}>
                  {sendingFeedback
                    ? (language === 'ko' ? '보내는 중...' : 'Sending...')
                    : (language === 'ko' ? '보내기' : 'Send')}
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 계정 삭제 확인 모달 */}
      <Modal transparent animationType="fade" visible={deleteModalVisible} onRequestClose={() => setDeleteModalVisible(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setDeleteModalVisible(false)}>
          <Pressable style={modalStyles.box} onPress={() => {}}>
            <Text style={modalStyles.title}>{t('settings.deleteAccount')}</Text>
            <Text style={[modalStyles.subtitle, { color: Colors.dangerText }]}>
              {t('settings.deleteWarning')}
            </Text>
            <Text style={modalStyles.fieldLabel}>{t('settings.deletePasswordLabel')}</Text>
            <View style={modalStyles.inputRow}>
              <TextInput
                style={[modalStyles.input, { fontSize: FontSize.md }]}
                value={deletePassword}
                onChangeText={setDeletePassword}
                secureTextEntry
                autoCapitalize="none"
                placeholder="••••••••"
                placeholderTextColor={Colors.textTertiary}
              />
            </View>
            <View style={modalStyles.btnRow}>
              <TouchableOpacity style={[modalStyles.btn, modalStyles.btnCancel]} onPress={() => setDeleteModalVisible(false)}>
                <Text style={modalStyles.btnCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.btn, modalStyles.btnDelete, (!deletePassword || deleting) && modalStyles.btnDisabled]}
                onPress={handleDeleteAccount}
                disabled={!deletePassword || deleting}
              >
                <Text style={modalStyles.btnSaveText}>{t('settings.deleteConfirm')}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* 통화 선택 모달 */}
      {/* 가운데 뜨는 박스라 아래에서 밀려 올라오면 어긋난다. 나머지 설정
          다이얼로그(예산·문의·탈퇴)와 같이 fade로 맞춘다. */}
      <Modal transparent animationType="fade" visible={currencyModalVisible} onRequestClose={() => setCurrencyModalVisible(false)}>
        <Pressable style={modalStyles.overlay} onPress={() => setCurrencyModalVisible(false)}>
          <Pressable style={[modalStyles.box, { paddingBottom: Spacing.lg }]} onPress={() => {}}>
            <Text style={modalStyles.title}>
              {language === 'ko' ? '기본 통화 선택' : 'Select Default Currency'}
            </Text>
            {CURRENCIES.map((cur) => (
              <TouchableOpacity
                key={cur.code}
                style={[modalStyles.currencyRow, currency === cur.code && modalStyles.currencyRowActive]}
                onPress={() => { setCurrency(cur.code); setCurrencyModalVisible(false); }}
              >
                <Text style={[modalStyles.currencySymbolItem, currency === cur.code && { color: Colors.primary }]}>
                  {cur.symbol}
                </Text>
                <Text style={[modalStyles.currencyLabel, currency === cur.code && { color: Colors.primary, fontWeight: FontWeight.bold }]}>
                  {cur.label}
                </Text>
                {currency === cur.code && <Ionicons name="checkmark-circle" size={20} color={Colors.primary} />}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl, paddingVertical: Spacing.md },
  backBtn: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center', marginLeft: -6 },
  pageTitle: { fontSize: FontSize.xxl, fontWeight: FontWeight.heavy, color: Colors.textWhite },
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.xl, gap: Spacing.md, paddingBottom: TabBarSpace },
  profileCard: { marginBottom: Spacing.sm },
  profileRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  profileInfo: { flex: 1, marginLeft: Spacing.lg },
  profileName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  profileEmail: { fontSize: FontSize.sm, color: Colors.textTertiary, marginTop: 2 },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.primaryLight, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.borderLight },
  langToggle: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  langOption: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.textTertiary },
  langActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  langSep: { color: Colors.borderLight },
  logoutCard: { marginTop: Spacing.lg },
  fbTypeRow: { flexDirection: 'row', gap: Spacing.xs, marginBottom: Spacing.md },
  fbTypeChip: {
    paddingVertical: 7, paddingHorizontal: 14, borderRadius: BorderRadius.full,
    borderWidth: 1, borderColor: Colors.border,
  },
  fbTypeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  fbTypeText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.textSecondary },
  fbTypeTextActive: { color: Colors.textWhite },
  fbInput: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: BorderRadius.md,
    padding: Spacing.md, minHeight: 110, fontSize: FontSize.sm, color: Colors.textPrimary,
  },
  fbMeta: { marginTop: Spacing.md, marginBottom: Spacing.md },
  fbMetaLabel: { fontSize: FontSize.xs, color: Colors.textTertiary, marginBottom: 4 },
  fbMetaRow: { flexDirection: 'row', gap: Spacing.sm },
  fbMetaKey: { width: 56, fontSize: FontSize.xs, color: Colors.textTertiary },
  fbMetaValue: { flex: 1, fontSize: FontSize.xs, color: Colors.textSecondary },
  fbShotRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginTop: Spacing.md },
  fbShotBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: BorderRadius.full, borderWidth: 1, borderColor: Colors.border,
  },
  fbShotText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },
  fbShotPreview: { width: 64, height: 44, borderRadius: BorderRadius.sm },
  fbShotRemove: {
    position: 'absolute', top: -6, right: -6,
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#4A5568',
    justifyContent: 'center', alignItems: 'center',
  },
  deleteRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: Spacing.xs, marginTop: Spacing.lg, paddingVertical: Spacing.sm,
  },
  deleteText: {
    fontSize: FontSize.sm, fontWeight: FontWeight.medium, color: Colors.danger,
  },
  version: { textAlign: 'center', fontSize: FontSize.xs, color: 'rgba(255,255,255,0.5)', marginTop: Spacing.sm },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
  },
  box: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    width: '85%',
  },
  title: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, marginBottom: Spacing.xs,
  },
  subtitle: {
    fontSize: FontSize.sm, color: Colors.textTertiary,
    marginBottom: Spacing.lg,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md,
    marginBottom: Spacing.lg,
  },
  currencySymbol: {
    fontSize: FontSize.xl, fontWeight: FontWeight.bold,
    color: Colors.primary, marginRight: Spacing.sm,
  },
  input: {
    flex: 1, fontSize: FontSize.xl, fontWeight: FontWeight.bold,
    color: Colors.textPrimary, paddingVertical: Spacing.md,
  },
  btnRow: { flexDirection: 'row', gap: Spacing.md },
  btn: { flex: 1, paddingVertical: Spacing.md, borderRadius: BorderRadius.md, alignItems: 'center' },
  btnCancel: { backgroundColor: Colors.borderLight },
  btnSave: { backgroundColor: Colors.primary },
  btnDelete: { backgroundColor: Colors.danger },
  btnDisabled: { opacity: 0.4 },
  fieldLabel: {
    fontSize: FontSize.sm, fontWeight: FontWeight.medium,
    color: Colors.textSecondary, marginBottom: Spacing.sm,
  },
  btnCancelText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textSecondary },
  btnSaveText: { fontSize: FontSize.md, fontWeight: FontWeight.semibold, color: Colors.textWhite },
  currencyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md, marginBottom: Spacing.xs,
  },
  currencyRowActive: { backgroundColor: Colors.primaryLight },
  currencySymbolItem: {
    fontSize: FontSize.lg, fontWeight: FontWeight.bold,
    color: Colors.textTertiary, width: 32,
  },
  currencyLabel: {
    flex: 1, fontSize: FontSize.md,
    color: Colors.textPrimary, marginLeft: Spacing.sm,
  },
});
