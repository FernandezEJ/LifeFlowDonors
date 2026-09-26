// Shared pose assets for Home and future Flowie presentation.
export const FLOWIE_MASCOTS = {
  default: require('../../assets/images/EvalMascot.png'),
  writing: require('../../assets/images/WritingMascot.png'),
  thinking: require('../../assets/images/ThinkingMascot.png'),
} as const;

// Keep the happy/default pose longer than the brief thinking and writing poses.
export const HOME_MASCOT_CYCLE = ['default', 'default', 'default', 'writing', 'writing', 'thinking', 'thinking'] as const;
