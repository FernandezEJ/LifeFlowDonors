import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRef, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Props = { visible: boolean; icon?: ComponentProps<typeof MaterialIcons>['name']; title: string; message: string;
  secondaryLabel?: string; primaryLabel?: string; variant?: 'neutral' | 'warning' | 'destructive';
  onSecondary: () => void; onPrimary: () => void | Promise<void>; loading?: boolean; dismissible?: boolean; dismissOnBackdrop?: boolean };
export function ConfirmationModal({ visible, icon = 'help-outline', title, message, secondaryLabel = 'Cancel', primaryLabel = 'Continue', variant = 'neutral', onSecondary, onPrimary, loading = false, dismissible = true, dismissOnBackdrop = false }: Props) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  const confirm = async () => {
    if (loading || lock.current) return;
    lock.current = true; setPending(true);
    try { await onPrimary(); } finally { lock.current = false; setPending(false); }
  };
  const dismiss = () => { if (dismissible && !busy && !lock.current) onSecondary(); };
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={dismiss}>
    <SafeAreaView edges={['top', 'bottom']} style={styles.overlay}>
      {dismissible && dismissOnBackdrop && <Pressable accessible={false} disabled={busy} onPress={dismiss} style={styles.backdropDismiss}/>}
      <View accessibilityViewIsModal style={styles.card}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} bounces={false} keyboardShouldPersistTaps="handled">
      <View style={styles.icon}><MaterialIcons accessible={false} importantForAccessibility="no" name={icon} size={30} color={variant === 'neutral' ? '#766A68' : '#BE2F2F'} /></View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={secondaryLabel} accessibilityState={{ disabled: busy }} disabled={busy} onPress={onSecondary} style={[styles.button, styles.secondary, busy && styles.disabled]}><Text style={styles.secondaryText}>{secondaryLabel}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={primaryLabel} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void confirm()} style={[styles.button, styles.primary, variant === 'destructive' && styles.destructive, busy && styles.disabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}</Pressable>
      </View>
      </ScrollView>
    </View></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: 'rgba(55,46,46,0.35)' },
  backdropDismiss: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  card: { width: '100%', maxWidth: 360, maxHeight: '100%', borderRadius: 24, backgroundColor: '#FFF9F2', elevation: 4, shadowColor: '#372E2E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 },
  scroll: { flexGrow: 0, borderRadius: 24 }, content: { padding: 24 },
  icon: { alignSelf: 'center', backgroundColor: '#FFF4EF', borderRadius: 30, padding: 14, marginBottom: 16 },
  title: { textAlign: 'center', fontSize: 21, lineHeight: 28, fontWeight: '700', color: '#372E2E' },
  message: { textAlign: 'center', fontSize: 15, lineHeight: 22, color: '#766A68', marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  button: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', padding: 10 },
  secondary: { borderWidth: 1, borderColor: '#D9C9C3' }, primary: { backgroundColor: '#D93A3A' }, destructive: { backgroundColor: '#BE2F2F' }, disabled: { opacity: 0.65 },
  secondaryText: { color: '#534542', fontWeight: '600', textAlign: 'center', flexShrink: 1 }, primaryText: { color: '#FFFFFF', fontWeight: '700', textAlign: 'center', flexShrink: 1 },
});
