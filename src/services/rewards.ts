import { apiRequest } from './api';

// ========================================
// SERVER-OWNED POINTS AND VOUCHERS CONTRACT
// Requests contain IDs and retry keys only, never balances, owners or deadlines.
// ========================================
export type PointSummary = { current_balance: number; total_earned: number; total_spent: number };
export type PointTransaction = { id: number; type: 'donation_reward' | 'reward_redemption'; amount: number; description: string; created_at: string };
export type Reward = { id: number; name: string; description: string | null; points_cost: number; stock_quantity: number; voucher_value: string | null; image_url: string | null };
export type VoucherStatus = 'available' | 'active' | 'redeemed' | 'expired';
export type Voucher = { id: number; reward_id: number; reward: Reward; points_spent: number; status: VoucherStatus; qr_token: string | null; activated_at: string | null; expires_at: string | null; redeemed_at: string | null; created_at: string };
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
// VISUAL DEADLINE
// Server time offsets a wrong device clock; the backend alone changes status.
// ========================================
export function remainingSeconds(expiresAt: string | null, serverOffset: number, now = Date.now()): number {
  return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now - serverOffset) / 1000)) : 0;
}
export function formatRemaining(seconds: number): string {
  return Math.floor(seconds / 60).toString().padStart(2, '0') + ':' + (seconds % 60).toString().padStart(2, '0');
}
export const ACTIVATION_WARNING = 'Attention: Only tap Activate when you are directly in front of the cashier/counter. Once activated, your single-use QR code will be available for 5 minutes.';
