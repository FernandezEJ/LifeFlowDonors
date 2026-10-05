import { FlowieConversationScreen } from '@/components/flowie-conversation-screen';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

export default function ConversationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const value = typeof id === 'string' && /^[1-9][0-9]*$/.test(id) ? Number(id) : NaN;
  // A valid local ID is only a route parameter. E1 still authorizes every read and mutation.
  if (!Number.isSafeInteger(value)) return <><Stack.Screen options={{ title: 'Flowie' }} />
    <View style={{ flex: 1, padding: 24, backgroundColor: '#FFF9F2', gap: 16 }}>
      <Text>This conversation is unavailable.</Text>
      <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/flowie-history')}
        style={{ minHeight: 44, justifyContent: 'center' }}><Text>Back to History</Text></Pressable>
    </View></>;
  return <FlowieConversationScreen key={value} conversationId={value} />;
}
