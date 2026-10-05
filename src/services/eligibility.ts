import { ApiError, apiRequest } from './api';

// ========================================
// PRE-SCREENING API CONTRACT
// These types describe server results, never frontend medical decisions.
// ========================================
export type EligibilityAnswers = {
  weightAtLeast50Kg: 'YES' | 'NO';
  sleptAtLeastFiveHours: 'YES' | 'NO';
  eatenProperMeal: 'YES' | 'NO';
  avoidedAlcoholFor24Hours: 'YES' | 'NO';
  threeMonthsSinceLastDonation: 'YES' | 'NO';
  recentFeverInfectionOrIllness: 'YES' | 'NO';
  unusualBleedingWeaknessOrDizziness: 'YES' | 'NO';
  recentSurgeryOrMajorProcedure: 'YES' | 'NO';
  medicationAffectingDonation: 'YES' | 'NO';
  conditionOrTreatmentRequiringWait: 'YES' | 'NO';
};
export type NewEligibilityResult = 'eligible' | 'not_eligible';
// Legacy values are read-only compatibility, never new evaluator outputs.
export type EligibilityResult = NewEligibilityResult | 'temporarily_ineligible' | 'needs_further_screening';
export type EligibilityAssessment = {
  id: number; result: EligibilityResult; reasons: string[];
  // Historical questionnaires remain readable without re-evaluating their answers.
  answers: Record<string, string | number | null | undefined>; assessed_at: string;
};
export const RESULT_LABELS: Record<EligibilityResult, string> = {
  eligible: 'Ready to proceed',
  not_eligible: 'Not Eligible for Now',
  temporarily_ineligible: 'Not Eligible for Now',
  needs_further_screening: 'Not Eligible for Now',
};
export const SCREENING_NOTICE = 'This is a pre-screening only. Final eligibility is confirmed by the donation facility.';

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
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? date.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'long', day: 'numeric' })
    : 'the date shown in Status';
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
      return await apiRequest<EligibilityState & { assessment: EligibilityAssessment }>('/eligibility-assessments', { method: 'POST', token, body: { answers } });
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
  latest: (token: string) => apiRequest<EligibilityState>('/eligibility-assessments/latest', { token }),
};
