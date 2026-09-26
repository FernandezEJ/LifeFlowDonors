import type { ProofUpload } from './proof-storage';
import { apiRequest } from './api';
// ========================================
// OPPORTUNITY AND PARTICIPATION CONTRACTS
// Only backend verification creates trusted outcomes; possible points are informational.
// ========================================
export type DonationStatus = 'pending' | 'for_verification' | 'needs_revision' | 'completed' | 'rejected' | 'cancelled';
export type DonationOpportunity = { id:number|null; source_type?:'admin_announcement'|'red_cross_dagupan'; title:string; description:string; location:string; event_date:string|null; start_time:string|null; end_time:string|null; points_reward:number; published_at:string|null; expires_at:string|null; status:string };
export type DonationParticipation = { id:number; source_type?:'admin_announcement'|'red_cross_dagupan'; status:DonationStatus; joined_at:string; cancelled_at:string|null; proof_size:number|null; proof_original_name:string|null; proof_uploaded_at:string|null; verified_at:string|null; rejection_reason:string|null; revision_reason:string|null; opportunity:DonationOpportunity };
export type DonationPage = { data:DonationParticipation[]; current_page:number; last_page:number; total:number };
export type DonationSummary = { total_donations:number; achievement:{key:string;label:string} };
export const DONATION_STATUS = {pending:'Pending',for_verification:'For Verification',needs_revision:'Needs Revision',completed:'Completed',rejected:'Rejected',cancelled:'Cancelled'};
export const DONATION_STATUS_DESCRIPTION: Record<DonationStatus, string> = {
 pending: 'Upload proof after donating.',
 for_verification: 'Your proof is awaiting review.',
 needs_revision: 'Please review the admin note and upload new proof.',
 completed: 'Counts toward verified total.',
 rejected: 'This donation activity was not approved.',
 cancelled: 'This activity was cancelled.',
};
// ========================================
// ACTIVE BOARD ORDER
// The permanent Dagupan donation option always follows the newest active admin post.
// ========================================
export function boardItems(opportunities:DonationOpportunity[], now=Date.now()): (DonationOpportunity | 'red-cross')[] {
 const active=opportunities.filter(o=>o.source_type!=='red_cross_dagupan' && o.status==='published' && Date.parse(o.published_at ?? '')<=now && Date.parse(o.expires_at ?? '')>now)
  .sort((a,b)=>Date.parse(b.published_at ?? '')-Date.parse(a.published_at ?? '')||(b.id ?? 0)-(a.id ?? 0));
 return active.length ? [active[0], 'red-cross', ...active.slice(1)] : ['red-cross'];
}
// ========================================
// SERVER-OWNED DONATION LIFECYCLE
// No manual record creation, approval, or reward award API is offered.
// ========================================
export const donationApi={
 history:(token:string,page=1,status?:DonationStatus)=>apiRequest<DonationPage>('/donation-participations?page='+page+(status?'&status='+status:''),{token}),
 summary:(token:string)=>apiRequest<DonationSummary>('/donation-summary',{token}),
 detail:(token:string,id:string)=>apiRequest<{participation:DonationParticipation}>('/donation-participations/'+encodeURIComponent(id),{token}),
 opportunities:(token:string)=>apiRequest<{data:DonationOpportunity[]}>('/donation-opportunities',{token}),
 opportunity:(token:string,id:string)=>apiRequest<{opportunity:DonationOpportunity}>('/donation-opportunities/'+encodeURIComponent(id),{token}),
 join:(token:string,id:string)=>apiRequest<{participation:DonationParticipation}>('/donation-opportunities/'+encodeURIComponent(id)+'/join',{token,method:'POST'}),
 cancel:(token:string,id:string)=>apiRequest<{participation:DonationParticipation}>('/donation-participations/'+encodeURIComponent(id)+'/cancel',{token,method:'POST'}),
 proof:(token:string,id:string,file:ProofUpload)=>apiRequest<{participation:DonationParticipation}>('/donation-participations/'+encodeURIComponent(id)+'/proof',{token,method:'POST',body:file,timeoutMs:120000}),
};
