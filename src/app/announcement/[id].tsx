import { announcementImageUrl, formatDonationDate } from '@/services/announcement-presentation';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { formatDonationRestDate } from '@/services/eligibility';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {Stack,useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useRef,useState,type ComponentProps} from 'react';
import {Image,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '@/contexts/auth-context';
import {ApiError,errorMessage} from '@/services/api';
import {type DonationOpportunity} from '@/services/donations';
const COLORS = {
  background: '#FFF9F2',
  brand: '#D93A3A',
  brandPressed: '#BE2F2F',
  text: '#372E2E',
  muted: '#766A68',
  border: '#F0E2DC',
  white: '#FFFFFF',
  softRed: '#FDE8E8',
};



// ========================================
// ANNOUNCEMENT DETAILS AND JOIN CONFIRMATION
// Evaluation reuses the deterministic eligibility screen; joining only creates pending activity.
// ========================================
export default function AnnouncementScreen(){
 const router=useRouter();const {id}=useLocalSearchParams<{id:string}>();const {opportunity,joinOpportunity,donationHistory,eligibilityState}=useAuth();
 const generation=useRef(0);
 const [rest,setRest]=useState<{date?:string|null}|null>(null);
 const [dialog,setDialog]=useState<Omit<ComponentProps<typeof ConfirmationModal>,'visible'>|null>(null);
 const [item,setItem]=useState<DonationOpportunity|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
 const load=useCallback(async()=>{const version=++generation.current;setItem(null);setError('');try{const r=await opportunity(id);if(version===generation.current)setItem(r.opportunity);}catch(e){if(version===generation.current)setError(errorMessage(e));}},[id,opportunity]);
 useFocusEffect(useCallback(()=>{void load();return()=>{generation.current++;};},[load]));
 const release=()=>{lock.current=false;setBusy(false);};
 const blocked=(reason:string, participationId?:number, remaining?:number, nextDate?:string|null)=>{
   if(reason==='active_participation_exists' && typeof participationId==='number' && Number.isSafeInteger(participationId) && participationId>0){
     setDialog({title:'You already have an active donation activity',message:'Complete or cancel your current activity before joining another donation opportunity.',icon:'event-note',secondaryLabel:'Close',primaryLabel:'View Activity',dismissible:false,onSecondary:()=>{},onPrimary:()=>router.push({pathname:'/activity/[id]',params:{id:String(participationId)}})});
   }else if(reason==='donation_cooldown_active'){
     setRest({date:nextDate});
   }else if(reason==='evaluation_required'){
     setDialog({title:'Complete Your Pre-Screening',message:'You need a current LifeFlow self-assessment before joining this donation activity.',icon:'fact-check',secondaryLabel:'Cancel',primaryLabel:'Evaluate with Flowie',dismissible:false,onSecondary:()=>{},onPrimary:()=>router.push('/evaluation')});
   }else if(reason==='evaluation_not_eligible'){
     const minutes=typeof remaining==='number' && Number.isFinite(remaining)?Math.ceil(Math.max(0,remaining)/60):0;
     setDialog({title:'Not Ready to Donate Right Now',message:'Your latest pre-screening is still active, and you are not ready to donate right now. You can reassess when the 24-hour window ends. Final eligibility is determined by the donation facility.'+
       (minutes?'\nAvailable again in '+Math.floor(minutes/60)+'h '+minutes%60+'m':''),icon:'schedule',variant:'warning',secondaryLabel:'Close',primaryLabel:'View Status',dismissible:false,onSecondary:()=>{},onPrimary:()=>router.push('/(tabs)/status')});
   }else{return false;}
   return true;
 };
 const failure=(e:unknown)=>{
   const data=e instanceof ApiError && e.status===409?e.data as {reason?:string;participation_id?:number;remaining_seconds?:number;next_eligible_donation_at?:string|null}|undefined:undefined;
   if(!data || !blocked(data.reason || '',data.participation_id,data.remaining_seconds,data.next_eligible_donation_at))setError(errorMessage(e));
 };
 const confirm=async()=>{
   if(!item || lock.current || rest)return;
   lock.current=true;setBusy(true);setError('');
   const version=generation.current;
   try{
     // Filter on the server so active records cannot hide behind paginated history.
     const [pending,verifying,revising]=await Promise.all([donationHistory(1,'pending'),donationHistory(1,'for_verification'),donationHistory(1,'needs_revision')]);
     if(version!==generation.current){release();return;}
     const active=[...pending.data,...verifying.data,...revising.data].sort((a,b)=>b.id-a.id)[0];
     if(active){blocked('active_participation_exists',active.id);release();return;}
     const state=await eligibilityState();
     if(version!==generation.current){release();return;}
     if(state.is_on_donation_cooldown){
       blocked('donation_cooldown_active',undefined,undefined,state.next_eligible_donation_at);release();return;
     }
     if(!state.assessment || !state.cooldown_active || state.remaining_seconds<=0){
       blocked('evaluation_required');release();return;
     }
     if(state.assessment.result!=='eligible'){
       blocked('evaluation_not_eligible',undefined,state.remaining_seconds);release();return;
     }
     // Keep the lock through the dialog; consume callbacks once, including Cancel.
     let consumed=false;
     const cancel=()=>{if(!consumed){consumed=true;release();}};
     setDialog({title:'Confirm Donation',message:item.title,icon:'favorite-border',secondaryLabel:'Cancel',primaryLabel:'Confirm',dismissOnBackdrop:true,onSecondary:cancel,onPrimary:()=>{
         if(consumed)return;consumed=true;
         if(version!==generation.current){release();return;}
         void (async()=>{
           try{
             const r=await joinOpportunity(id);
             if(version===generation.current)router.push({pathname:'/activity/[id]',params:{id:String(r.participation.id)}});
           }catch(e){if(version===generation.current)failure(e);}
           finally{release();}
         })();
       }});
   }catch(e){if(version===generation.current)failure(e);release();}
 };
 const confirmation=dialog ?? {title:'Donation Rest Period',icon:'hourglass-empty' as const,message:'You recently completed a donation and are still within the 3-month rest period. You can donate again starting '+formatDonationRestDate(rest?.date)+'.',secondaryLabel:'Close',primaryLabel:'View Status',onSecondary:()=>setRest(null),onPrimary:()=>{setRest(null);router.push('/(tabs)/status');}};
 return <><Stack.Screen options={{headerShown:false}}/><SafeAreaView edges={['top','bottom']} style={styles.safeArea}><View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)')} style={styles.backButton}><MaterialIcons name="arrow-back" size={23}/></Pressable><Text style={styles.headerTitle}>{id==='red-cross-dagupan'?'Donation Option':'Announcement'}</Text></View><ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.content}>
 {error?<><Text accessibilityRole="alert" style={styles.description}>{error}</Text>{!item?<Pressable onPress={()=>void load()}><Text style={styles.description}>Retry donation details</Text></Pressable>:null}</>:null}
 {item?<>{announcementImageUrl(item.image_url) ? <Image source={{uri:announcementImageUrl(item.image_url)!}} accessibilityLabel={item.title} resizeMode="contain" style={{width:'100%',height:220,borderRadius:16}}/> : null}<Text style={styles.title}>{item.title}</Text><View style={styles.detailsCard}><Text style={styles.detailValue}>{formatDonationDate(item.event_date ?? item.donation_date, 'Confirm donation arrangements with the chapter.')} {item.start_time || ''}</Text><Text style={styles.detailValue}>{item.location}</Text><Text style={styles.description}>{item.description}</Text></View><Text style={styles.description}>Verified donations earn 300 points for your first donation, increasing by 50 to a maximum of 500 per donation.</Text><Text style={styles.description}>Final donation eligibility is determined by the facility. Use the existing self-assessment to prepare, and bring the required identification or documents.</Text><View style={{flexDirection:'row',gap:12}}><Pressable onPress={()=>router.push('/evaluation')} style={styles.uploadButton}><Text style={styles.uploadButtonText}>Evaluate</Text></Pressable><Pressable disabled={busy} onPress={()=>void confirm()} style={styles.uploadButton}><Text style={styles.uploadButtonText}>{busy?'Joining…':'Go Donate'}</Text></Pressable></View></>:!error?<Text>Loading announcement…</Text>:null}
 </View></ScrollView></SafeAreaView><ConfirmationModal {...confirmation} visible={!!dialog || !!rest} onSecondary={()=>{setDialog(null);confirmation.onSecondary();}} onPrimary={()=>{setDialog(null);return confirmation.onPrimary();}} /></>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pressed: { opacity: 0.7 },
  headerTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  bellButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 7,
    height: 7,
    borderWidth: 1.5,
    borderColor: COLORS.white,
    borderRadius: 4,
    backgroundColor: COLORS.brand,
  },
  scrollContent: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 },
  titleBlock: { alignItems: 'flex-start' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  title: {
    marginTop: 13,
    color: COLORS.text,
    fontSize: 27,
    fontWeight: '800',
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  organizer: { marginTop: 5, color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  detailsCard: {
    gap: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailIcon: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: COLORS.softRed,
  },
  detailContent: { flex: 1 },
  detailLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  detailValue: { marginTop: 2, color: COLORS.text, fontSize: 14, fontWeight: '700' },
  section: {
    padding: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    backgroundColor: COLORS.white,
  },
  sectionTitle: { flex: 1, color: COLORS.text, fontSize: 18, fontWeight: '800' },
  description: { marginTop: 8, color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  rewardCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 13,
    padding: 17,
    borderWidth: 1,
    borderColor: '#F0CBC6',
    borderRadius: 20,
    backgroundColor: COLORS.softRed,
  },
  rewardIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: COLORS.white,
  },
  rewardContent: { flex: 1 },
  rewardLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  rewardValue: { marginTop: 3, color: COLORS.brand, fontSize: 17, fontWeight: '800' },
  cancelledReward: { color: COLORS.muted },
  rewardNote: { marginTop: 6, color: COLORS.muted, fontSize: 12, lineHeight: 17 },
  proofCard: {
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E8BBB5',
    borderRadius: 21,
    backgroundColor: COLORS.white,
  },
  proofHeading: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  proofIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: COLORS.softRed,
  },
  uploadButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    borderRadius: 16,
    backgroundColor: COLORS.brand,
  },
  uploadButtonPressed: { backgroundColor: COLORS.brandPressed, transform: [{ scale: 0.99 }] },
  uploadButtonText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  verificationMessage: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#E6F0FF',
  },
  verificationText: { flex: 1, color: '#3469A5', fontSize: 13, lineHeight: 19 },
  completedMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 14,
    padding: 13,
    borderRadius: 14,
    backgroundColor: '#E2F5E9',
  },
  completedText: { flex: 1, color: '#287A47', fontSize: 13, lineHeight: 19 },
  cancelledMessage: { marginTop: 13, color: COLORS.muted, fontSize: 13, lineHeight: 19 },
  eligibilityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 16,
    borderRadius: 17,
    backgroundColor: COLORS.softRed,
  },
  eligibilityText: { flex: 1, color: COLORS.text, fontSize: 13, lineHeight: 19 },
  cancelButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.brand,
    borderRadius: 16,
    backgroundColor: COLORS.background,
  },
  cancelButtonPressed: { backgroundColor: COLORS.softRed },
  cancelButtonText: { color: COLORS.brand, fontSize: 14, fontWeight: '700' },
});

// TODO: Donation reward rules will later be provided and validated by Laravel/backend configuration.
