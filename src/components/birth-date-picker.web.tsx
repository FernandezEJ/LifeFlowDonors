import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import type { BirthDatePickerProps } from './birth-date-picker';
import { latestBirthDate, toApiDate } from '@/services/auth';
export default function BirthDatePicker({ value, onChange, disabled }: BirthDatePickerProps) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState('');
  const maximum = latestBirthDate();
  const max = [maximum.getFullYear(), String(maximum.getMonth() + 1).padStart(2, '0'), String(maximum.getDate()).padStart(2, '0')].join('-');
  let valid = false;
  try { const [y,m,d] = draft.split('-'); valid = draft <= max && toApiDate([m,d,y].join('/')) === draft; } catch { /* Native date input may be incomplete. */ }
  const show = () => { if (disabled) return; const [m,d,y] = value.split('/'); setDraft(value ? [y,m,d].join('-') : max); setOpen(true); };
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Choose birth date" disabled={disabled} onPress={show}
      style={{ minHeight: 54, padding: 16, borderWidth: 1, borderColor: '#E8DDD6', borderRadius: 16, backgroundColor: '#FFFFFF' }}>
      <Text>{value || 'MM/DD/YYYY'} &#128197;</Text>
    </Pressable>
    <Modal visible={open} transparent onRequestClose={() => setOpen(false)}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#00000055' }}>
        <View style={{ padding: 24, borderRadius: 20, backgroundColor: '#FFFFFF', gap: 16 }}>
          <Text>Birth Date</Text>
          <input aria-label="Birth Date" type="date" value={draft} max={max} min="0001-01-01" onChange={event => setDraft(event.target.value)} style={{ fontSize: 18, padding: 12 }} />
          <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={{ padding: 12 }}><Text>Cancel</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={!valid} onPress={() => { if (!valid) return; const [y,m,d] = draft.split('-'); onChange([m,d,y].join('/')); setOpen(false); }} style={{ padding: 12 }}><Text>Confirm</Text></Pressable>
        </View>
      </View>
    </Modal>
  </>;
}
