import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { latestBirthDate } from '@/services/auth';
export { latestBirthDate } from '@/services/auth';

export type BirthDatePickerProps = { value: string; onChange: (value: string) => void; disabled?: boolean };
// Local calendar components avoid UTC offsets changing the selected birthday.
export function displayBirthDate(date: Date) {
  return [date.getMonth() + 1, date.getDate(), date.getFullYear()].map((value, index) => String(value).padStart(index === 2 ? 4 : 2, '0')).join('/');
}
export default function BirthDatePicker({ value, onChange, disabled }: BirthDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(latestBirthDate);
  const confirm = (date: Date) => {
    date = new Date(date); date.setHours(0, 0, 0, 0);
    if (Number.isFinite(date.getTime()) && date <= latestBirthDate()) onChange(displayBirthDate(date));
    setOpen(false);
  };
  const show = () => {
    if (disabled) return;
    const [month, day, year] = value.split('/').map(Number);
    const selected = latestBirthDate();
    if (value) selected.setFullYear(year, month - 1, day);
    if (!Number.isFinite(selected.getTime()) || selected > latestBirthDate()) selected.setTime(latestBirthDate().getTime());
    setDraft(selected);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({ value: selected, mode: 'date', display: 'calendar', maximumDate: latestBirthDate(),
        onValueChange: (_, date) => confirm(date), onDismiss: () => setOpen(false) });
    } else setOpen(true);
  };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose birth date" disabled={disabled} onPress={show}
      style={{ minHeight: 54, paddingHorizontal: 16, borderWidth: 1, borderColor: '#E8DDD6', borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Text style={{ fontSize: 16, color: value ? '#372E2E' : '#766A68' }}>{value || 'MM/DD/YYYY'}</Text>
      <MaterialIcons name="calendar-today" size={22} color="#766A68" />
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#00000055' }}>
        <View style={{ padding: 20, backgroundColor: '#FFFFFF', borderRadius: 20 }}>
          <Text style={{ fontSize: 20, color: '#372E2E' }}>Birth Date</Text>
          <DateTimePicker value={draft} mode="date" display="spinner" themeVariant="light" maximumDate={latestBirthDate()}
            onValueChange={(_, date) => setDraft(date)} onDismiss={() => setOpen(false)} />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ padding: 16 }}><Text>Cancel</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => confirm(draft)} style={{ padding: 16 }}><Text>Confirm</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </>;
}
