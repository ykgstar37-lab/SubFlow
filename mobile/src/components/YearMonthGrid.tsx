import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, FontSize, FontWeight } from '../constants/theme';

const MONTHS_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// 렌탈 계약일은 몇 년 전, 약정 종료일은 몇 년 뒤라 한 달씩 넘기면 수십 번 눌러야 한다.
// 올해 기준 7년 전 ~ 4년 뒤(12칸)면 렌탈 약정(보통 3~6년)을 앞뒤로 덮는다.
const YEARS_BEFORE = 7;
const YEARS_AFTER = 4;

interface Props {
  year: number;
  month: number; // 0-11
  language: string;
  /** 연도를 누르면 연도만 바뀌고 그대로 열려 있다. 달을 누르면 done=true로 닫는다. */
  onChange: (year: number, month: number, done: boolean) => void;
}

/** 달력 제목을 눌렀을 때 날짜 칸 대신 띄우는 연·월 선택 칸. */
export function YearMonthGrid({ year, month, language, onChange }: Props) {
  const thisYear = new Date().getFullYear();
  const first = Math.min(thisYear - YEARS_BEFORE, year);
  const last = Math.max(thisYear + YEARS_AFTER, year);
  const years: number[] = [];
  for (let y = first; y <= last; y++) years.push(y);
  const months = language === 'ko' ? MONTHS_KO : MONTHS_EN;

  return (
    <View>
      <View style={styles.grid}>
        {years.map((y) => {
          const active = y === year;
          return (
            <TouchableOpacity key={y} style={styles.cell} onPress={() => onChange(y, month, false)}>
              <View style={[styles.chip, active && styles.chipActive, y === thisYear && !active && styles.chipNow]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{y}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.divider} />
      <View style={styles.grid}>
        {months.map((label, m) => {
          const active = m === month;
          return (
            <TouchableOpacity key={m} style={styles.cell} onPress={() => onChange(year, m, true)}>
              <View style={[styles.chip, active && styles.chipActive]}>
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '25%', padding: 4 },
  chip: { height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  chipActive: { backgroundColor: Colors.primary },
  chipNow: { backgroundColor: Colors.primarySoft },
  chipText: { fontSize: 13, fontWeight: FontWeight.bold, color: Colors.textPrimary },
  chipTextActive: { color: '#FFF' },
  divider: { height: 1, backgroundColor: Colors.borderLight, marginVertical: 8 },
});

/** 달력 제목 버튼. 눌린다는 걸 보이려고 ▾ 아이콘을 옆에 붙인다. */
export const calTitleStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: Colors.borderLight },
  text: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.textPrimary },
});
