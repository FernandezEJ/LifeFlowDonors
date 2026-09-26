import { ApiError, apiRequest } from './api';

// ========================================
// PRE-SCREENING API CONTRACT
// These types describe server results, never frontend medical decisions.
// ========================================
export type EligibilityAnswers = {
  weight: number; sleepHours: number; currentSymptoms: 'YES' | 'NO';
  currentlyPregnant: 'YES' | 'NO' | 'NOT_APPLICABLE';
  takingAntibioticsForActiveInfection: 'YES' | 'NO'; stillRecoveringFromProcedure: 'YES' | 'NO';
  activeOrRecoveringInfection: 'YES' | 'NO'; weakDizzyOrUnusuallyTired: 'YES' | 'NO';
  donatedWithinThreeMonths: 'YES' | 'NO'; feelsWell: 'YES' | 'NO';
};
export type NewEligibilityResult = 'eligible' | 'not_eligible';
// Legacy values are read-only compatibility, never new evaluator outputs.
export type EligibilityResult = NewEligibilityResult | 'temporarily_ineligible' | 'needs_further_screening';
export type EligibilityAssessment = {
  id: number; result: EligibilityResult; reasons: string[];
  // Existing six-question history has no values for the four newer questions.
  answers: Pick<EligibilityAnswers, 'weight' | 'sleepHours' | 'currentSymptoms' | 'donatedWithinThreeMonths' | 'feelsWell'> & Partial<EligibilityAnswers> & { medication?: string; recentTattooOrPiercing?: string; recentSurgeryOrHospitalization?: string; recentInfectionOrAntibiotics?: string }; assessed_at: string;
};
export const RESULT_LABELS: Record<EligibilityResult, string> = {
  eligible: 'Ready to proceed',
  not_eligible: 'Not ready to donate right now',
  temporarily_ineligible: 'Not ready to donate right now',
  needs_further_screening: 'Previous assessment: facility review advised',
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
};
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
