import { FLOWIE_MASCOTS } from '@/constants/flowie-mascots';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { flowieAction, type FlowieActionType, type FlowieMessage } from '@/services/flowie-preview';

// ========================================
// FLOWIE APPEARANCE
// Uses the existing system appearance hook and LifeFlow's warm red identity.
// Dark colors are scoped to Flowie, without redesigning other screens.
// ========================================
export function useFlowieColors() {
  const dark = useColorScheme() === 'dark';
  return { background: dark ? '#201B1C' : '#FFF9F2', surface: dark ? '#2D2628' : '#FFFFFF',
    text: dark ? '#FFF4EF' : '#372E2E', muted: dark ? '#D0BFC0' : '#766A68',
    border: dark ? '#594348' : '#EEDBD5', accent: dark ? '#FF9BA3' : '#B72935',
    soft: dark ? '#41292F' : '#FDE8E8', primary: '#B72935', white: '#FFFFFF' };
}

// ========================================
// GUIDED CHIPS AND CONTROLLED ACTION CARDS
// Only an allowlisted action can render a navigation button. Unknown actions disappear.
// ========================================
export function QuickPromptChip({ label, onPress, disabled = false }: { label: string; onPress: (label: string) => void; disabled?: boolean }) {
  const c = useFlowieColors();
  return <Pressable accessibilityRole="button" disabled={disabled} accessibilityState={{ disabled }} onPress={() => { if (!disabled) onPress(label); }}
    style={({ pressed }) => [styles.chip, { borderColor: c.border, backgroundColor: c.surface }, pressed && styles.pressed]}>
    <Text style={[styles.chipText, { color: c.text }]}>{label}</Text>
  </Pressable>;
}
// ========================================
// PINNED EVALUATION SHORTCUT
// A single compact touch target stays outside the scrolling conversation.
// ========================================
export function FlowieActionCard({ action, onAction }: {
  action: FlowieActionType; onAction: (action: FlowieActionType) => void;
}) {
  const c = useFlowieColors();
  const item = flowieAction(action);
  if (!item) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={action === 'open_evaluation' ? 'Evaluation Form, check your donation readiness' : item.title}
    onPress={() => onAction(action)}
    style={({ pressed }) => [styles.actionCard, { backgroundColor: c.soft, borderColor: c.border }, pressed && styles.pressed]}>
    <MaterialIcons name={item.icon} size={23} color={c.accent} />
    <View style={styles.actionContent}>
      <Text style={[styles.actionTitle, { color: c.text }]}>{action === 'open_evaluation' ? 'Evaluation Form' : item.title}</Text>
      {action === 'open_evaluation' ? <Text style={[styles.shortcutSubtitle, { color: c.muted }]}>Check your donation readiness</Text> : null}
    </View>
    <MaterialIcons name="arrow-forward" size={20} color={c.accent} />
  </Pressable>;
}

// ========================================
// INLINE FLOWIE ACTION
// The button belongs inside the explanation bubble. Optional labels change only
// visible copy; the allowlisted action remains the sole navigation authority.
// ========================================
export function FlowieInlineAction({ action, label, onAction, disabled = false }: {
  action: FlowieActionType; label?: string; onAction: (action: FlowieActionType) => void; disabled?: boolean;
}) {
  const c = useFlowieColors();
  const item = flowieAction(action);
  if (!item) return null;
  const caption = typeof label === 'string' && label.trim() ? label.trim().slice(0, 80) : item.button;
  return <Pressable accessibilityRole="button" accessibilityLabel={caption} accessibilityState={{ disabled }} disabled={disabled}
    onPress={() => { if (!disabled) onAction(action); }}
    style={({ pressed }) => [styles.actionButton, { backgroundColor: c.soft }, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
    <Text style={[styles.buttonText, { color: c.accent }]}>{caption}</Text>
    <MaterialIcons name="arrow-forward" size={18} color={c.accent} />
  </Pressable>;
}

// ========================================
// REUSABLE CONVERSATION BUBBLES
// Assistant responses can contain text, an action and suggested questions.
// Local preview labeling remains visible; user text is rendered as plain text.
// ========================================
export function FlowieMessageBubble({ item, onAction, onPrompt, pose = 'default' }: {
  pose?: keyof typeof FLOWIE_MASCOTS; item: Extract<FlowieMessage, { role: 'flowie' }>; onAction: (action: FlowieActionType) => void; onPrompt: (prompt: string) => void;
}) {
  const c = useFlowieColors();
  return <View style={styles.assistantRow}>
    <Image source={FLOWIE_MASCOTS[pose]} style={styles.avatar} accessible={false} />
    <View style={styles.assistantContent}>
      <Text style={[styles.sender, { color: c.muted }]}>{item.source === 'ai' ? 'Flowie - AI assistant' : 'Flowie - Local guide'}</Text>
      <View style={[styles.bubble, styles.assistantBubble, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text selectable style={[styles.body, { color: c.text }]}>{item.message}</Text>
        {item.action ? <FlowieInlineAction action={item.action.type} label={item.action.label} onAction={onAction} /> : null}
        {item.suggestions?.length ? <View style={styles.chips}>{item.suggestions.slice(0, 3).map(label => <QuickPromptChip key={label} label={label} onPress={onPrompt} />)}</View> : null}
      </View>
    </View>
  </View>;
}
export function UserMessageBubble({ message }: { message: string }) {
  const c = useFlowieColors();
  return <View style={[styles.bubble, styles.userBubble, { backgroundColor: c.primary, borderColor: c.primary }]}>
    <Text selectable style={[styles.body, { color: c.white }]}>{message}</Text>
  </View>;
}

// ========================================
// SHARED WRAPPING AND TOUCH TARGETS
// Flexible widths keep messages/chips readable on narrow screens and larger fonts.
// ========================================
const styles = StyleSheet.create({
  pressed: { opacity: 0.75 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, maxWidth: '100%', justifyContent: 'center', paddingHorizontal: 13, paddingVertical: 11, borderWidth: 1, borderRadius: 18 },
  chipText: { fontSize: 14, lineHeight: 20, fontWeight: '600', flexShrink: 1 },
  actionCard: { minHeight: 60, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 10, flexDirection: 'row', alignItems: 'center' },
  actionContent: { flex: 1, minWidth: 0 },
  shortcutSubtitle: { fontSize: 12, lineHeight: 18 },
  disabled: { opacity: 0.45 },
  actionTitle: { fontSize: 15, lineHeight: 21, fontWeight: '800' },
  actionButton: { minHeight: 46, borderRadius: 13, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  buttonText: { fontSize: 14, lineHeight: 20, fontWeight: '800', flexShrink: 1 },
  body: { fontSize: 15, lineHeight: 23, flexShrink: 1 },
  assistantRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', paddingRight: 16 },
  avatar: { width: 30, height: 36, marginTop: 17 }, assistantContent: { flex: 1, minWidth: 0, gap: 9 },
  sender: { fontSize: 12, lineHeight: 18, fontWeight: '600' },
  bubble: { padding: 15, borderWidth: 1, borderRadius: 22 },
  assistantBubble: { borderTopLeftRadius: 10, gap: 12 },
  userBubble: { alignSelf: 'flex-end', maxWidth: '86%', borderBottomRightRadius: 10 },
});
