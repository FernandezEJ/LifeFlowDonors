import { LifeFlowColors as PALETTE } from '@/constants/theme';
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
      <View style={[styles.icon,{backgroundColor:variant==='destructive'?PALETTE.dangerSurface:variant==='warning'?PALETTE.pendingSurface:PALETTE.neutralSurface}]}><MaterialIcons accessible={false} importantForAccessibility="no" name={icon} size={30} color={variant === 'neutral' ? PALETTE.primary : variant==='warning'?PALETTE.pending:PALETTE.danger} /></View>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.message}>{message}</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel={secondaryLabel} accessibilityState={{ disabled: busy }} disabled={busy} onPress={onSecondary} style={[styles.button, styles.secondary, busy && styles.disabled]}><Text style={styles.secondaryText}>{secondaryLabel}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={primaryLabel} accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => void confirm()} style={[styles.button, styles.primary, variant === 'warning' && styles.warning, variant === 'destructive' && styles.destructive, busy && styles.disabled]}>{busy ? <ActivityIndicator color={PALETTE.surface} /> : <Text style={styles.primaryText}>{primaryLabel}</Text>}</Pressable>
      </View>
      </ScrollView>
    </View></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: PALETTE.backdrop },
  backdropDismiss: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  card: { width: '100%', maxWidth: 360, maxHeight: '100%', borderRadius: 24, backgroundColor: PALETTE.surface, elevation: 4, shadowColor: PALETTE.text, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 10 },
  scroll: { flexGrow: 0, borderRadius: 24 }, content: { padding: 24 },
  icon: { alignSelf: 'center', backgroundColor: PALETTE.selected, borderRadius: 30, padding: 14, marginBottom: 16 },
  title: { textAlign: 'center', fontSize: 21, lineHeight: 28, fontWeight: '700', color: PALETTE.text },
  message: { textAlign: 'center', fontSize: 15, lineHeight: 22, color: PALETTE.neutral, marginTop: 10 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  button: { flex: 1, minWidth: 0, minHeight: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center', padding: 10 },
  secondary: { borderWidth: 1, borderColor: PALETTE.border }, primary: { backgroundColor: PALETTE.primary }, warning: { backgroundColor: PALETTE.pending }, destructive: { backgroundColor: PALETTE.danger }, disabled: { opacity: 0.65 },
  secondaryText: { color: PALETTE.neutralText, fontWeight: '600', textAlign: 'center', flexShrink: 1 }, primaryText: { color: PALETTE.surface, fontWeight: '700', textAlign: 'center', flexShrink: 1 },
});
