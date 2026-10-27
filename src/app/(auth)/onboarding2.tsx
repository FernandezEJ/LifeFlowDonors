import { OnboardingScreen } from '@/components/onboarding-screen';
import { useRouter } from 'expo-router';

export default function OnboardingTwoScreen() {
  const router = useRouter();

  return <OnboardingScreen page={2} onNext={() => router.push('/(auth)/register')} />;
}
