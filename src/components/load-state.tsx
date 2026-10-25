import { LifeFlowColors as COLORS } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRef, type ComponentProps } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function EmptyState({ title, description, icon = 'inbox' }: {
  title: string; description: string; icon?: ComponentProps<typeof MaterialIcons>['name'];
}) {
  return <View style={styles.empty}>
    <MaterialIcons name={icon} size={28} color={COLORS.neutral} accessible={false} />
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
  </View>;
}

// Classify only known safe transport/session messages, never assume every API failure is offline.
export function loadErrorKind(message: string) {
  if (/session (?:has )?expired|unauthenticated|log in again/i.test(message)) return 'session';
  if (/cannot reach|network|connection|offline|timed out/i.test(message)) return 'connection';
  return 'server';
}
export function LoadError({ message, subject, onRetry, loading = false, retryLabel = 'Retry', action = false }: {
  message: string; subject: string; onRetry: () => void; loading?: boolean; retryLabel?: string; action?: boolean;
}) {
  const kind = loadErrorKind(message);
  const locked = useRef(false);
  const retry = async () => {
    if (locked.current || loading) return;
    locked.current = true;
    try { await onRetry(); } catch { /* The owning fetch keeps its error visible for another attempt. */ }
    finally { locked.current = false; }
  };
  return <View style={styles.error}>
    <View style={styles.errorHeading}><MaterialIcons name={kind === 'connection' ? 'wifi-off' : kind === 'session' ? 'lock-outline' : 'info-outline'}
      size={21} color={COLORS.neutralText} accessible={false} />
      <Text accessibilityRole="header" style={styles.title}>{kind === 'session' ? 'Sign in required' : action ? 'Action not confirmed' : kind === 'connection' ? 'Connection Problem' : "Couldn't load " + subject}</Text></View>
    <Text accessibilityRole="alert" style={styles.errorDescription}>{kind === 'connection' && !action
      ? `We couldn't load your ${subject}. Please check your internet connection and try again.` : message}</Text>
    {kind !== 'session' ? <Pressable accessibilityRole="button" accessibilityLabel={retryLabel} disabled={loading}
      accessibilityState={{ disabled: loading, busy: loading }} onPress={retry} style={styles.retry}>
      <Text style={styles.retryText}>{loading ? 'Retrying…' : retryLabel}</Text></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  empty: { paddingVertical: 30, paddingHorizontal: 14, alignItems: 'center', gap: 8 },
  title: { color: COLORS.text, fontSize: 15, lineHeight: 22, fontWeight: '700', flexShrink: 1 },
  description: { color: COLORS.neutralText, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  error: { padding: 14, gap: 6, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.surface, marginVertical: 8 },
  errorHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorDescription: { color: COLORS.neutralText, fontSize: 13, lineHeight: 20 },
  retry: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { color: COLORS.primary, fontSize: 13, lineHeight: 20, fontWeight: '700' },
});
