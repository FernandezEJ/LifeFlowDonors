import { FlowieConversationScreen } from '@/components/flowie-conversation-screen';
import { preparationQuestion } from '@/services/notifications';
import { useLocalSearchParams } from 'expo-router';

export default function FlowieScreen() {
  const { preparationTitle, preparationDate, preparationKey } = useLocalSearchParams<{
    preparationTitle?: string; preparationDate?: string; preparationKey?: string;
  }>();
  const preparation = typeof preparationTitle === 'string' && typeof preparationDate === 'string'
    && typeof preparationKey === 'string' && /^\d+$/.test(preparationKey)
    ? { key: preparationKey, prompt: preparationQuestion(preparationTitle, preparationDate) } : undefined;
  return <FlowieConversationScreen preparation={preparation} />;
}
