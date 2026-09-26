// ========================================
// FLOWIE RESPONSE CONTRACT AND SAFE ACTIONS
// Local content is deliberately separate from rendering. A future API can return
// text, a controlled action and suggestions; text never becomes a navigation route.
// ========================================
export const FLOWIE_ACTIONS = {
  open_evaluation: { route: '/evaluation', title: 'Check Donation Readiness', button: 'Start Evaluation', icon: 'assignment' },
  open_points: { route: '/(tabs)/points', title: 'View Points & Rewards', button: 'View Points & Rewards', icon: 'stars' },
  open_status: { route: '/(tabs)/status', title: 'Your Donation Status', button: 'View Status', icon: 'assignment' },
  open_activity: { route: '/(tabs)/activity', title: 'View Donation Activity', button: 'View Activity', icon: 'event-note' },
  open_vouchers: { route: '/my-vouchers', title: 'My Vouchers', button: 'Open My Vouchers', icon: 'confirmation-number' },
  open_notifications: { route: '/notifications', title: 'Your Notifications', button: 'Open Notifications', icon: 'notifications-none' },
} as const;
export type FlowieActionType = keyof typeof FLOWIE_ACTIONS;
export type FlowieResponse = { source?: 'ai'; message: string; action?: { type: FlowieActionType; label?: string }; suggestions?: string[] };
export type FlowieMessage = { id: string; role: 'user'; message: string } | ({ id: string; role: 'flowie' } & FlowieResponse);
export function flowieAction(value: unknown) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(FLOWIE_ACTIONS, value)
    ? FLOWIE_ACTIONS[value as FlowieActionType] : null;
}

// ========================================
// GUIDED QUESTIONS: LOCAL PREVIEW ONLY
// These approved general explanations never decide eligibility or change account data.
// No network, authentication, storage or AI dependency is used here.
// ========================================
export const QUICK_PROMPTS = ['Where can I see my points?', 'My status', 'How often can I donate?'] as const;
export const FLOWIE_INTRO = 'Hi! How can I help you today?';
export const CUSTOM_PREVIEW = "Flowie's full chat connection is coming next. For now, try one of the quick questions or LifeFlow shortcuts.";
const previews: Record<string, FlowieResponse> = {
  'Where can I see my points?': { message: 'See your balance and rewards in the Points tab.', action: { type: 'open_points', label: 'View Points' } },
  'My status': { message: 'View your saved pre-screening result in the Status tab.', action: { type: 'open_status' } },
  'Who can donate?': { message: "Donation eligibility depends on health and screening factors. You can use LifeFlow's Evaluation Form for a quick pre-screening, while final eligibility is confirmed at the donation facility.", action: { type: 'open_evaluation' } },
  'How often can I donate?': { message: 'LifeFlow pre-screening checks whether you have donated blood within the last 3 months. Final eligibility and when you can donate again are confirmed by the donation facility.', action: { type: 'open_evaluation' } },
  'What should I prepare?': { message: 'Rest well, eat properly, stay hydrated, and bring any identification or documents required by the donation facility.' },
  'How do points work?': { message: 'Points are awarded only after your donation is verified. Your balance and available rewards are shown in Points.', action: { type: 'open_points' } },
  'Where can I see my activities?': { message: 'Your joined donation opportunities and their current status are available in Activity.', action: { type: 'open_activity' } },
  'Where are my vouchers?': { message: 'Your vouchers and their current status are available in My Vouchers.', action: { type: 'open_vouchers' } },
  'Can I donate today?': { message: 'LifeFlow can help you do a pre-screening, but final eligibility is confirmed at the donation facility.', action: { type: 'open_evaluation' } },
};
// ========================================
// EXACT LOCAL QUESTION LOOKUP
// Known app questions demonstrate inline actions. Other free text gets the honest
// fallback; this is a fixed copy map, not AI or an eligibility decision.
// ========================================
export function previewResponse(question?: string): FlowieResponse {
  if (question && Object.prototype.hasOwnProperty.call(previews, question)) return previews[question];
  return { message: CUSTOM_PREVIEW, action: { type: 'open_vouchers' } };
}

// Only known local questions bypass the authenticated text-chat service.
export function localFlowieResponse(question: string): FlowieResponse | null {
  return Object.prototype.hasOwnProperty.call(previews, question) ? previews[question] : null;
}
