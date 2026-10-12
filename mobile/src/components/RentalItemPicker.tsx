import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight, BorderRadius } from '../constants/theme';

export type RentalItem = { name: string; icon: string };

// 렌탈로 흔히 빌리는 기기. 아이콘은 이모지로 둔다 — 기기 종류가 그림으로
// 바로 읽히고, 사용자가 직접 추가하는 기기도 같은 방식으로 고를 수 있다.
export const RENTAL_PRESETS: RentalItem[] = [
  { name: '정수기', icon: '💧' },
  { name: '공기청정기', icon: '🍃' },
  { name: '가습기', icon: '💦' },
  { name: '제습기', icon: '☁️' },
  { name: '에어컨', icon: '❄️' },
  { name: '비데', icon: '🚽' },
  { name: '안마의자', icon: '💆' },
  { name: '매트리스', icon: '🛏️' },
  { name: '세탁기', icon: '🧺' },
  { name: '건조기', icon: '👕' },
  { name: '식기세척기', icon: '🍽️' },
  { name: '냉장고', icon: '🧊' },
];

// 직접 추가할 때 고르는 아이콘
const CUSTOM_ICONS = ['📦', '🔌', '📺', '🧹', '🛁', '🍚', '☕', '🌡️', '🎮', '💡', '🪴', '✨'];

interface Props {
  value: RentalItem | null;
  onChange: (item: RentalItem | null) => void;
  /** 내가 다른 렌탈에 직접 붙였던 기기들. 한 번 만든 건 다시 고를 수 있게 같이 늘어놓는다. */
  extras?: RentalItem[];
  language: string;
}

export function RentalItemPicker({ value, onChange, extras = [], language }: Props) {
  const ko = language === 'ko';
  const [adding, setAdding] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customIcon, setCustomIcon] = useState(CUSTOM_ICONS[0]);

  // 프리셋에 이미 있는 이름은 겹쳐 보이지 않게 뺀다. 지금 값이 목록 어디에도
  // 없으면(방금 직접 만든 것) 끝에 붙여 선택된 채로 보이게 한다.
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
    setCustomName('');
  };

  return (
    <View>
      <View style={styles.grid}>
        {items.map((item) => {
          const active = value?.name === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={styles.tile}
              // 고른 걸 한 번 더 누르면 해제된다
              onPress={() => onChange(active ? null : item)}
              activeOpacity={0.7}
            >
              <View style={[styles.bubble, active && styles.bubbleActive]}>
                <Text style={styles.emoji}>{item.icon}</Text>
              </View>
              <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>{item.name}</Text>
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity style={styles.tile} onPress={() => setAdding((v) => !v)} activeOpacity={0.7}>
          <View style={[styles.bubble, styles.bubbleAdd]}>
            <Text style={styles.plus}>+</Text>
          </View>
          <Text style={styles.label}>{ko ? '직접 추가' : 'Custom'}</Text>
        </TouchableOpacity>
      </View>

      {adding && (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={customName}
            onChangeText={setCustomName}
            placeholder={ko ? '기기 이름 (예: 커피머신)' : 'Device name'}
            placeholderTextColor={Colors.textTertiary}
            maxLength={30}
            autoFocus
          />
          <View style={styles.iconRow}>
            {CUSTOM_ICONS.map((ic) => (
              <TouchableOpacity
                key={ic}
                style={[styles.iconChip, customIcon === ic && styles.iconChipActive]}
                onPress={() => setCustomIcon(ic)}
              >
                <Text style={styles.iconChipText}>{ic}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.addBtn, !customName.trim() && { opacity: 0.4 }]}
            onPress={saveCustom}
            disabled={!customName.trim()}
          >
            <Text style={styles.addBtnText}>{ko ? '추가' : 'Add'}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  tile: { width: '20%', alignItems: 'center' },
  bubble: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5, borderColor: Colors.border,
  },
  bubbleActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  bubbleAdd: { borderStyle: 'dashed' },
  emoji: { fontSize: 22 },
  plus: { fontSize: 22, color: Colors.textTertiary },
  label: { fontSize: 11, color: Colors.textSecondary, marginTop: 4 },
  labelActive: { color: Colors.primary, fontWeight: FontWeight.bold },
  form: {
    marginTop: 12, padding: 12, gap: 10,
    borderRadius: BorderRadius.md, backgroundColor: Colors.surfaceLight,
    borderWidth: 1, borderColor: Colors.border,
  },
  input: {
    fontSize: FontSize.sm, color: Colors.textPrimary,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: BorderRadius.sm, backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
  },
  iconRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  iconChip: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border,
  },
  iconChipActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  iconChipText: { fontSize: 18 },
  addBtn: {
    alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: BorderRadius.md, backgroundColor: Colors.primary,
  },
  addBtnText: { color: Colors.textWhite, fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
