import type { ProofUpload } from './proof-storage';
import { apiRequest } from './api';
// ========================================
// OPPORTUNITY AND PARTICIPATION CONTRACTS
// Only backend verification creates trusted outcomes; possible points are informational.
// ========================================
export type DonationStatus = 'pending' | 'for_verification' | 'needs_revision' | 'completed' | 'rejected' | 'cancelled';
export type AnnouncementInline = { text: string; bold?: boolean; italic?: boolean };
export type AnnouncementDocument = { version: 1; blocks: ({ type: 'paragraph'; content: AnnouncementInline[] } | { type: 'bullet_list' | 'ordered_list'; items: AnnouncementInline[][] })[] };
export type DonationOpportunity = { id:number|null; source_type?:'admin_announcement'|'red_cross_dagupan'; image_url?:string|null; donation_date?:string|null; title:string; summary?:string; description:string; description_document?:AnnouncementDocument|null; location:string; event_date:string|null; start_time:string|null; end_time:string|null; points_reward:number; published_at:string|null; expires_at:string|null; status:string };
export type AnnouncementBoard = { data: DonationOpportunity[]; permanent_post?: DonationOpportunity | null };
export type AnnouncementDetail = { opportunity: DonationOpportunity; view_state?: 'active' | 'expired'; read_only?: boolean; server_time?: string };
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
// Home previews keep the newest event; the full list keeps all events before the permanent post.
// ========================================
export function boardItems(opportunities:DonationOpportunity[], now=Date.now(), permanent:DonationOpportunity|null=null, preview=false): DonationOpportunity[] {
 const active=opportunities.filter(o=>o.source_type!=='red_cross_dagupan' && o.status==='published' && Date.parse(o.published_at ?? '')<=now && Date.parse(o.expires_at ?? '')>now)
  .sort((a,b)=>Date.parse(b.published_at ?? '')-Date.parse(a.published_at ?? '')||(b.id ?? 0)-(a.id ?? 0));
 const permanentItems=permanent?.source_type==='red_cross_dagupan' ? [permanent] : [];
 return [...(preview ? active.slice(0,1) : active), ...permanentItems];
}
// ========================================
// SERVER-OWNED DONATION LIFECYCLE
// No manual record creation, approval, or reward award API is offered.
// ========================================
export const donationApi={
 history:(token:string,page=1,status?:DonationStatus)=>apiRequest<DonationPage>('/donation-participations?page='+page+(status?'&status='+status:''),{token}),
 summary:(token:string)=>apiRequest<DonationSummary>('/donation-summary',{token}),
 detail:(token:string,id:string)=>apiRequest<{participation:DonationParticipation}>('/donation-participations/'+encodeURIComponent(id),{token}),
 opportunities:(token:string)=>apiRequest<AnnouncementBoard>('/announcements',{token}),
 opportunity:(token:string,id:string)=>apiRequest<AnnouncementDetail>((id==='red-cross-dagupan'?'/donation-opportunities/':'/announcements/')+encodeURIComponent(id),{token}),
 join:(token:string,id:string)=>apiRequest<{participation:DonationParticipation}>('/donation-opportunities/'+encodeURIComponent(id)+'/join',{token,method:'POST'}),
 cancel:(token:string,id:string)=>apiRequest<{participation:DonationParticipation}>('/donation-participations/'+encodeURIComponent(id)+'/cancel',{token,method:'POST'}),
 proof:(token:string,id:string,file:ProofUpload)=>apiRequest<{participation:DonationParticipation}>('/donation-participations/'+encodeURIComponent(id)+'/proof',{token,method:'POST',body:file,timeoutMs:120000}),
};
