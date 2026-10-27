import { Platform } from 'react-native';

const BRAND = {
  floralWhite: '#FFF9F2', pastelPink: '#FFCAD0', racingRed: '#F10222',
  crushedBerry: '#892325', richMahogany: '#250202',
} as const;

// One palette for all light screens. Legacy aliases keep existing layouts intact.
// Brand tints use the approved source colors; functional/status colors stay separate.
export const LifeFlowColors = {
  ...BRAND,
  primary: BRAND.crushedBerry, primaryPressed: BRAND.richMahogany,
  background: BRAND.floralWhite, cream: BRAND.floralWhite, surface: BRAND.floralWhite,
  text: BRAND.richMahogany, onPrimary: BRAND.floralWhite,
  neutral: 'rgba(37,2,2,0.72)', neutralText: 'rgba(37,2,2,0.80)',
  border: BRAND.pastelPink, controlBorder: 'rgba(137,35,37,0.68)',
  selected: 'rgba(255,202,208,0.36)', neutralSurface: 'rgba(255,202,208,0.18)',
  decorativeTop: 'rgba(255,202,208,0.28)', decorativeBottom: 'rgba(255,202,208,0.20)',
  pointsSurface: 'rgba(255,202,208,0.22)', pointsBorder: BRAND.pastelPink,
  skeleton: 'rgba(137,35,37,0.14)', skeletonDark: 'rgba(255,249,242,0.18)',
  // Neutral scrim keeps underlying colors intact; separate from branded surfaces.
  backdrop: 'rgba(0,0,0,0.28)',
  // Semantic exceptions: success, warning, revision, rejection and unavailable history.
  danger: '#B42318', dangerPressed: '#912017', dangerSurface: '#FEF3F2',
  success: '#15803D', successText: '#166534', successSurface: '#ECFDF3',
  pending: '#B45309', pendingText: '#92400E', pendingSurface: '#FFF7E6',
  revision: '#EA580C', revisionAction: '#C2410C', revisionPressed: '#9A3412',
  revisionText: '#9A3412', revisionSurface: '#FFF7ED',
  info: '#1D4ED8', infoSurface: '#EFF6FF',
  inactive: '#64748B', inactiveText: '#475569', inactiveSurface: '#F1F5F9',
} as const;

// Presentation only: Laravel remains authoritative for participation status.
export const DonationStatusColors = {
  pending: { text: LifeFlowColors.pendingText, surface: LifeFlowColors.pendingSurface },
  for_verification: { text: LifeFlowColors.pendingText, surface: LifeFlowColors.pendingSurface },
  needs_revision: { text: LifeFlowColors.revisionText, surface: LifeFlowColors.revisionSurface },
  completed: { text: LifeFlowColors.successText, surface: LifeFlowColors.successSurface },
  rejected: { text: LifeFlowColors.danger, surface: LifeFlowColors.dangerSurface },
  cancelled: { text: LifeFlowColors.inactiveText, surface: LifeFlowColors.inactiveSurface },
} as const;

const tintColorLight = LifeFlowColors.primary;
// Light foreground exception for intentionally dark content, never a light card fill.
const tintColorDark = LifeFlowColors.floralWhite;

export const Colors = {
  light: {
    text: LifeFlowColors.text,
    background: LifeFlowColors.background,
    tint: tintColorLight,
    icon: LifeFlowColors.primary,
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
