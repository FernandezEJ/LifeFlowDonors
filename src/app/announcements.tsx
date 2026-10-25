import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { TabSkeleton } from '@/components/tab-skeleton';
import { EmptyState, LoadError } from '@/components/load-state';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { announcementImageUrl, formatDonationDate } from '@/services/announcement-presentation';
import { boardItems, type DonationOpportunity } from '@/services/donations';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AnnouncementsScreen() {
  const router = useRouter();
  const { opportunities } = useAuth();
  const [posts, setPosts] = useState<DonationOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const refresh = useRef<() => void>(() => {});

  useFocusEffect(useCallback(() => {
    let active = true;
    let busy = false;
    const load = async (manual = false) => {
      if (busy) return;
      busy = true;
      if (manual) setRefreshing(true);
      try {
        const result = await opportunities();
        if (active) { setPosts(result.data); setError(''); }
      } catch (failure) {
        if (active) setError(errorMessage(failure));
      } finally {
        busy = false;
        if (active) { setLoading(false); setRefreshing(false); setClock(Date.now()); }
      }
    };
    refresh.current = () => { void load(true); };
    void load();
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => { active = false; clearInterval(timer); refresh.current = () => {}; };
  }, [opportunities]));

  const announcements = boardItems(posts, clock).filter((item): item is DonationOpportunity => item !== 'red-cross');
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" style={styles.back} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
        <MaterialIcons name="arrow-back" size={24} color={PALETTE.primary} />
      </Pressable>
      <Text style={styles.heading}>Announcements</Text>
    </View>
    <FlatList
      contentContainerStyle={styles.content}
      data={loading ? [] : announcements}
      keyExtractor={item => String(item.id)}
      showsVerticalScrollIndicator={false}
      refreshing={refreshing}
      onRefresh={() => refresh.current()}
      ListHeaderComponent={error ? <LoadError message={error} subject="announcements" loading={refreshing} onRetry={() => refresh.current()} /> : null}
      ListEmptyComponent={loading ? <TabSkeleton variant="announcement" label="Loading announcements" /> : !error && !refreshing ? <EmptyState icon="campaign" title="No active announcements" description="Check back for upcoming donation events." /> : null}
      renderItem={({ item }) => {
        const image = announcementImageUrl(item.image_url);
        return <Pressable accessibilityRole="button" accessibilityLabel={`View announcement: ${item.title}`} onPress={() => router.push({ pathname: '/announcement/[id]', params: { id: String(item.id) } })} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
          {image ? <Image source={{ uri: image }} resizeMode="cover" style={styles.image} accessibilityLabel={`${item.title} illustration`} /> : null}
          <View style={styles.body}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.date}>{formatDonationDate(item.event_date ?? item.donation_date)}</Text>
            <Text style={styles.description} numberOfLines={3} ellipsizeMode="tail">{item.description}</Text>
            <Text style={styles.link}>View Announcement</Text>
          </View>
        </Pressable>;
      }}
    />
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PALETTE.cream },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, gap: 8, borderBottomWidth: 1, borderBottomColor: PALETTE.border },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  heading: { flex: 1, fontSize: 23, fontWeight: '800', color: PALETTE.text },
  content: { padding: 20, gap: 16, width: '100%', maxWidth: 600, alignSelf: 'center', flexGrow: 1 },
  card: { borderRadius: 20, borderWidth: 1, borderColor: PALETTE.border, backgroundColor: PALETTE.surface, overflow: 'hidden' },
  image: { width: '100%', height: 150, backgroundColor: PALETTE.selected },
  body: { padding: 16, gap: 10 },
  title: { color: PALETTE.text, fontSize: 17, fontWeight: '700' },
  description: { color: PALETTE.neutral, fontSize: 14, lineHeight: 21 },
  date: { color: PALETTE.neutral, fontSize: 13, fontWeight: '600' },
  link: { color: PALETTE.primary, fontSize: 14, fontWeight: '700' },
  notice: { padding: 18, borderRadius: 20, backgroundColor: PALETTE.surface },
  retry: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  pressed: { opacity: 0.75 },
});
