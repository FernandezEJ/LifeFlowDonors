// ========================================
// PROFILE MASCOT ASSETS
// TEMPORARY: All five choices currently use LogoMascot.
// When the final five mascot PNGs are ready, ONLY replace
// the require(...) image path beside each mascot key below.
// Do NOT change mascot_1 ... mascot_5: these values are stored in the database.
// ========================================
export const PROFILE_MASCOTS = {
  mascot_1: require('../../assets/images/LogoMascot.png'),
  mascot_2: require('../../assets/images/ThinkingMascot.png'),
  mascot_3: require('../../assets/images/HelloMascot.png'),
  mascot_4: require('../../assets/images/WritingMascot.png'),
  mascot_5: require('../../assets/images/HappyMascot.png'),
};
export type ProfileMascotKey = keyof typeof PROFILE_MASCOTS;
export const DEFAULT_PROFILE_MASCOT: ProfileMascotKey = 'mascot_1';

// FUTURE PATH EXAMPLES ONLY: add the real files before using these paths.
// mascot_1: require('../../assets/images/mascot-1.png'),
// mascot_2: require('../../assets/images/mascot-2.png'),
// mascot_3: require('../../assets/images/mascot-3.png'),
// mascot_4: require('../../assets/images/mascot-4.png'),
// mascot_5: require('../../assets/images/mascot-5.png'),

// Missing/legacy/unknown values must never become image paths or prototype lookups.
export function profileMascotKey(value: unknown): ProfileMascotKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(PROFILE_MASCOTS, value)
    ? value as ProfileMascotKey : DEFAULT_PROFILE_MASCOT;
}
export function profileMascotImage(value: unknown) {
  return PROFILE_MASCOTS[profileMascotKey(value)];
}

export const ACCOUNT_SETTINGS = [
  { key: 'avatar', title: 'Change Avatar', description: 'Choose your LifeFlow mascot', icon: 'face' },
  { key: 'email', title: 'Change Email', description: 'Update your verified email address', icon: 'mail-outline' },
] as const;
