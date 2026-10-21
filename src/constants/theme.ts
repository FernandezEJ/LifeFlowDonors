/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import { Platform } from 'react-native';

// Shared semantic colors. Cream/decorative surfaces retain the polished mobile identity.
export const LifeFlowColors = {
  primary: '#9B1238', primaryPressed: '#7D0F2D',
  danger: '#B42318', dangerPressed: '#912017', dangerSurface: '#FEF3F2',
  success: '#15803D', successText: '#166534', successSurface: '#ECFDF3',
  pending: '#B45309', pendingText: '#92400E', pendingSurface: '#FFF7E6',
  revision: '#EA580C', revisionAction: '#C2410C', revisionPressed: '#9A3412',
  revisionText: '#9A3412', revisionSurface: '#FFF7ED',
  info: '#1D4ED8', infoSurface: '#EFF6FF',
  neutral: '#64748B', neutralText: '#475569', neutralSurface: '#F1F5F9',
  background: '#F8FAFC', surface: '#FFFFFF', text: '#0F172A', border: '#E2E8F0', selected: '#FFF1F3',
  cream: '#FFF9F2', decorativeTop: '#FDECE6', decorativeBottom: '#FCE9E2',
  pointsSurface: '#FFF3DC', pointsBorder: '#F1DFC1',
} as const;

// Presentation only: Laravel remains authoritative for participation status.
export const DonationStatusColors = {
  pending: { text: LifeFlowColors.pendingText, surface: LifeFlowColors.pendingSurface },
  for_verification: { text: LifeFlowColors.pendingText, surface: LifeFlowColors.pendingSurface },
  needs_revision: { text: LifeFlowColors.revisionText, surface: LifeFlowColors.revisionSurface },
  completed: { text: LifeFlowColors.successText, surface: LifeFlowColors.successSurface },
  rejected: { text: LifeFlowColors.danger, surface: LifeFlowColors.dangerSurface },
  cancelled: { text: LifeFlowColors.neutralText, surface: LifeFlowColors.neutralSurface },
} as const;

const tintColorLight = LifeFlowColors.primary;
const tintColorDark = '#fff';

export const Colors = {
  light: {
    text: LifeFlowColors.text,
    background: LifeFlowColors.background,
    tint: tintColorLight,
    icon: LifeFlowColors.neutral,
    tabIconDefault: LifeFlowColors.neutral,
    tabIconSelected: tintColorLight,
  },
  dark: {
    text: '#ECEDEE',
    background: '#151718',
    tint: tintColorDark,
    icon: '#9BA1A6',
    tabIconDefault: '#9BA1A6',
    tabIconSelected: tintColorDark,
  },
};

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    serif: "Georgia, 'Times New Roman', serif",
    rounded: "'SF Pro Rounded', 'Hiragino Maru Gothic ProN', Meiryo, 'MS PGothic', sans-serif",
    mono: "SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
  },
});
