import { OnboardingScreen } from '@/components/onboarding-screen';
import { useRouter } from 'expo-router';

export default function OnboardingOneScreen() {
  const router = useRouter();

  return <OnboardingScreen page={1} onNext={() => router.push('/(auth)/onboarding2')} />;
}
