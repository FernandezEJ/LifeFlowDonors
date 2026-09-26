import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Stack, useRouter, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export function ProfileSettingsPage({ title, fallback, children }: { title: string; fallback: Href; children: ReactNode }) {
  const router = useRouter();
  return <SafeAreaView edges={['top', 'bottom']} style={styles.page}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Go back"
        onPress={() => router.canGoBack() ? router.back() : router.replace(fallback)} style={styles.back}>
        <MaterialIcons name="arrow-back" size={24} color="#372E2E" />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    </View>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>{children}</ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFF9F2' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F0E2DC' },
  back: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  title: { flex: 1, fontSize: 22, fontWeight: '800', color: '#372E2E' },
  content: { width: '100%', maxWidth: 680, alignSelf: 'center', padding: 20, gap: 24 },
});
