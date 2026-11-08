import { formatDonorDate } from './date-presentation';
import { ApiError, apiRequest } from './api';

// ========================================
// PRE-SCREENING API CONTRACT
// These types describe server results, never frontend medical decisions.
// ========================================
export const ASSESSMENT_VERSION = 'v5';
export const QUESTIONS = [
  { key: 'feverPastSevenDays', text: 'Have you experienced a fever in the past 7 days?' },
  { key: 'weightAtLeast50Kg', text: 'Do you weigh at least 50 kilograms (110 pounds)?' },
  { key: 'feelingWellToday', text: 'Are you feeling well today?' },
  { key: 'sleptAtLeastFiveHours', text: 'Did you get at least 5 hours of sleep last night?' },
  { key: 'eatenMealToday', text: 'Have you eaten a meal before donating today?' },
  { key: 'alcoholPast24Hours', text: 'Have you consumed alcohol within the past 24 hours?' },
  { key: 'donatedWithinThreeMonths', text: 'Have you donated blood within the past 3 months?' },
  { key: 'procedurePast12Months', text: 'Have you had a tattoo, body piercing, or acupuncture within the past 12 months?' },
  { key: 'medicationsOrSupplements', text: 'Are you currently taking any medications or supplements?' },
  { key: 'everReceivedTransfusion', text: 'Have you ever received a blood transfusion?' },
] as const;
export type Question = typeof QUESTIONS[number];
export const FOLLOW_UPS = [
  { key: 'procedureType', answer: 'procedurePast12Months', label: 'Which procedure?' },
  { key: 'procedureWhen', answer: 'procedurePast12Months', label: 'When was it done?' },
  { key: 'medications', answer: 'medicationsOrSupplements', label: 'Which medication or supplement?' },
  { key: 'transfusionWhen', answer: 'everReceivedTransfusion', label: 'When did it happen?' },
] as const;
type Answer = 'YES' | 'NO';
export type FollowUps = Partial<Record<typeof FOLLOW_UPS[number]['key'], string>>;
export type EligibilityAnswers = Record<Question['key'], Answer> & { follow_ups?: FollowUps };
export type AssessmentDraft = Partial<EligibilityAnswers>;
export function selectAnswer(draft: AssessmentDraft, question: Question, answer: Answer): AssessmentDraft {
  const follow_ups = { ...draft.follow_ups };
  if (answer !== 'YES') for (const field of FOLLOW_UPS) if (field.answer === question.key) delete follow_ups[field.key];
  return { ...draft, [question.key]: answer, follow_ups };
}
export function validFollowUp(value?: string): boolean {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 200 && !/[\x00-\x1f\x7f<>]/u.test(value);
}
export function validQuestion(question: Question, draft: AssessmentDraft): boolean {
  return (draft[question.key] === 'YES' || draft[question.key] === 'NO') &&
    FOLLOW_UPS.filter(f => f.answer === question.key && draft[question.key] === 'YES').every(f => validFollowUp(draft.follow_ups?.[f.key]));
}
export function assessmentPayload(draft: AssessmentDraft) {
  if (!QUESTIONS.every(q => validQuestion(q, draft))) throw new Error('Please complete all required answers and visible follow-up fields.');
  const answers = Object.fromEntries(QUESTIONS.map(q => [q.key, draft[q.key]]));
  const follow_ups = Object.fromEntries(FOLLOW_UPS.filter(f => draft[f.answer] === 'YES').map(f => [f.key, draft.follow_ups![f.key]!.trim()]));
  return { assessment_version: ASSESSMENT_VERSION, answers, ...(Object.keys(follow_ups).length ? { follow_ups } : {}) };
}
export type NewEligibilityResult = 'basic_requirements_met' | 'needs_further_review';
// Legacy values are read-only compatibility, never new evaluator outputs.
export type EligibilityResult = NewEligibilityResult | 'eligible' | 'not_eligible' | 'temporarily_ineligible' | 'needs_further_screening';
export type EligibilityAssessment = {
  id: number; result: EligibilityResult; reasons: string[];
  // Historical questionnaires remain readable without re-evaluating their answers.
  answers: Record<string, unknown>; assessed_at: string; assessment_version?: string | null;
};
export function isV5Assessment(assessment?: EligibilityAssessment | null): boolean {
  return assessment?.assessment_version === ASSESSMENT_VERSION &&
    (assessment.result === 'basic_requirements_met' || assessment.result === 'needs_further_review');
}
export function permitsParticipationScreening(assessment: EligibilityAssessment): boolean {
  return isV5Assessment(assessment) || ((assessment.assessment_version === null || assessment.assessment_version === undefined) && assessment.result === 'eligible');
}
export function assessmentPresentation(assessment?: EligibilityAssessment | null) {
  if (!assessment || !isV5Assessment(assessment)) return { title: 'Assessment Required', copy: 'Complete the Donation Readiness Self-Assessment to view your preliminary result.', tone: 'warning' as const };
  return assessment.result === 'basic_requirements_met'
    ? { title: 'Basic Requirements Met', copy: 'Your answers meet the basic self-assessment requirements. Official donor screening is still required.', tone: 'success' as const }
    : { title: 'Needs Further Review', copy: 'Discuss your answers with qualified blood donation personnel. You may still be able to donate after professional review.', tone: 'warning' as const };
}
export const SCREENING_NOTICE = 'This is a preliminary self-assessment only. Official donor screening and final eligibility are determined by qualified blood donation personnel.';

// ========================================
// PROTECTED ASSESSMENT REQUESTS
// Sends answers only and displays results saved by Laravel.
// ========================================
// Server metadata controls availability; old assessment-only callers still work.
export type EligibilityState = {
  assessment: EligibilityAssessment | null;
  cooldown_active: boolean;
  next_allowed_at: string | null;
  remaining_seconds: number;
  server_time: string;
  is_on_donation_cooldown?: boolean;
  last_completed_donation_at?: string | null;
  next_eligible_donation_at?: string | null;
  donation_cooldown_remaining_seconds?: number;
};
// Format a server date in the donation calendar; never calculate authorization locally.
export function formatDonationRestDate(value: string | null | undefined): string {
  return formatDonorDate(value, 'the date shown in Status');
}
export class EligibilityCooldownError extends ApiError {
  constructor(public state: EligibilityState) {
    super('You already completed an evaluation recently. Please wait before submitting again.', 409);
    this.name = 'EligibilityCooldownError';
  }
}
export const eligibilityApi = {
  submit: async (token: string, answers: EligibilityAnswers) => {
    try {
      return await apiRequest<EligibilityState & { assessment: EligibilityAssessment }>('/eligibility-assessments', { method: 'POST', token, body: assessmentPayload(answers) });
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        const state = failure.data as EligibilityState | undefined;
        if (state?.cooldown_active === true && state.assessment?.id && state.next_allowed_at &&
            Number.isFinite(state.remaining_seconds) && state.remaining_seconds > 0) {
          throw new EligibilityCooldownError(state);
        }
        throw new ApiError('Evaluation availability changed. Refresh and try again.', 409);
      }
      throw failure;
    }
  },
  latest: (token: string) => apiRequest<EligibilityState>('/eligibility-assessments/latest?assessment_version=v5', { token }),
};
