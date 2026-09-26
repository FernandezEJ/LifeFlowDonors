import { Redirect } from 'expo-router';
import { useAuth } from '@/contexts/auth-context';

export default function IndexScreen() {
  // ========================================
  // SESSION LANDING ROUTE
  // Preserves onboarding for guests and opens tabs for restored accounts.
  // ========================================
  const { user } = useAuth();
  return <Redirect href={user ? '/(tabs)' : '/(auth)/welcome'} />;
}
