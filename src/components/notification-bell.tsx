import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useNotifications } from '@/contexts/notification-context';

// ========================================
// BACKEND UNREAD BADGE
// Preserves the header bell and refreshes the shared count on screen focus.
// ========================================
export function NotificationBell({ beforeOpen }: { beforeOpen?: (open: () => void) => void } = {}) {
  const router = useRouter();
  const { unreadCount, refreshCount } = useNotifications();
  useFocusEffect(useCallback(() => { void refreshCount(); }, [refreshCount]));
  return <Pressable accessibilityRole="button" accessibilityLabel={'Open notifications, '+unreadCount+' unread'}
    onPress={() => { const open = () => router.push('/notifications'); if (beforeOpen) beforeOpen(open); else open(); }} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
    <MaterialIcons name="notifications-none" color="#372E2E" size={25} />
    {unreadCount > 0 ? <View style={{ position: 'absolute', right: 0, top: 0, minWidth: 17, paddingHorizontal: 3, borderRadius: 9, backgroundColor: '#D93A3A' }}>
      <Text style={{ color: 'white', fontSize: 10, textAlign: 'center', fontWeight: '700' }}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
    </View> : null}
  </Pressable>;
}
