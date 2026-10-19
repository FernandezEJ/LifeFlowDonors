import { apiRequest } from './api';

// ========================================
// SERVER-OWNED POINTS AND VOUCHERS CONTRACT
// Requests contain IDs and retry keys only, never balances, owners or deadlines.
// ========================================
export type PointSummary = { current_balance: number; total_earned: number; total_spent: number };
export type PointTransaction = { id: number; type: 'donation_reward' | 'reward_redemption'; amount: number; description: string; created_at: string };
export type Reward = { id: number; name: string; description: string | null; points_cost: number; stock_quantity: number; voucher_value: string | null; image_url: string | null };
export type VoucherStatus = 'available' | 'active' | 'redeemed' | 'expired';
export type ClaimStatus = 'available' | 'pending_claim' | 'claimed' | 'legacy';
export type Voucher = { id: number; reward_id: number; reward: Reward; points_spent: number; status: VoucherStatus; claim_status: ClaimStatus; claim_code: string | null; claimed_at: string | null; is_legacy: boolean; legacy_status: VoucherStatus | null; activated_at: string | null; expires_at: string | null; redeemed_at: string | null; created_at: string };
export type Page<T> = { data: T[]; current_page: number; last_page: number };
export type VoucherResponse = { voucher: Voucher; server_time: string };
export type Catalogue = { data: Reward[]; request_key: string };
export type RedemptionResponse = VoucherResponse & { summary: PointSummary; reward: Reward };
export const rewardsApi = {
  summary: (token: string) => apiRequest<PointSummary>('/points/summary', { token }),
  transactions: (token: string, page = 1, type?: PointTransaction['type']) => apiRequest<Page<PointTransaction>>('/points/transactions?page=' + page + (type ? '&type=' + type : ''), { token }),
  rewards: (token: string) => apiRequest<Catalogue>('/rewards', { token }),
  redeem: (token: string, id: number, requestKey: string) => apiRequest<RedemptionResponse>('/rewards/' + id + '/redeem', { token, method: 'POST', body: { request_key: requestKey } }),
  vouchers: (token: string, page = 1, status?: VoucherStatus) => apiRequest<Page<Voucher> & { server_time: string }>('/vouchers?page=' + page + (status ? '&status=' + status : ''), { token }),
  voucher: (token: string, id: number) => apiRequest<VoucherResponse>('/vouchers/' + id, { token }),
  activate: (token: string, id: number) => apiRequest<VoucherResponse>('/vouchers/' + id + '/activate', { token, method: 'POST', body: {} }),
};

// ========================================
// CLAIM PRESENTATION
// Raw redeemed history is not proof of a physical claim. Missing or inconsistent
// claim fields stay read-only; only Laravel supplies credentials and transitions.
// ========================================
export function voucherState(voucher: Voucher): ClaimStatus | 'unavailable' {
  if (voucher.claim_status === 'legacy' || voucher.is_legacy === true) return 'legacy';
  if (voucher.is_legacy !== false) return 'unavailable';
  if (voucher.claim_status === 'claimed' && voucher.claimed_at && Number.isFinite(Date.parse(voucher.claimed_at))) return 'claimed';
  if (voucher.claimed_at != null) return 'unavailable';
  if (voucher.claim_status === 'available' && voucher.status === 'available') return 'available';
  if (voucher.claim_status === 'pending_claim' && voucher.status === 'active') return 'pending_claim';
  return 'unavailable';
}
export function voucherStatusLabel(voucher: Voucher): string {
  return { available: 'Available', pending_claim: 'Pending Claim', claimed: 'Claimed', legacy: 'Legacy', unavailable: 'Unavailable' }[voucherState(voucher)];
}
export function voucherActionLabel(voucher: Voucher): string {
  const state = voucherState(voucher);
  return state === 'available' ? 'Activate Claim Code' : state === 'pending_claim' ? 'View Claim Code' : 'View Details';
}
export function usableClaimCode(voucher: Voucher): string | null {
  return voucherState(voucher) === 'pending_claim' && typeof voucher.claim_code === 'string' && /^LFW-[A-Z0-9]{6}$/.test(voucher.claim_code) ? voucher.claim_code : null;
}
export function voucherDate(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Unavailable';
  const date = new Date(value);
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) + ' at ' + date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}
export const ACTIVATION_MESSAGE = 'Activate your one-time claim code? No additional points will be spent. Your code has no expiration and staff will confirm your claim when you receive the item.';
