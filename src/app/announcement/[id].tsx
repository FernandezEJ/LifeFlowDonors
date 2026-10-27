import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { announcementImageUrl, formatDonationDate } from '@/services/announcement-presentation';
import { AnnouncementImage } from '@/components/announcement-image';
import { TabSkeleton } from '@/components/tab-skeleton';
import { AnnouncementBody } from '@/components/announcement-body';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { formatDonationRestDate } from '@/services/eligibility';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {Stack,useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useEffect,useRef,useState,type ComponentProps} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '@/contexts/auth-context';
import {ApiError,errorMessage} from '@/services/api';
import {type DonationOpportunity} from '@/services/donations';
const COLORS = {
  background: PALETTE.cream,
  brand: PALETTE.primary,
  brandPressed: PALETTE.primaryPressed,
  text: PALETTE.text,
  muted: PALETTE.neutral,
  border: PALETTE.border,
  white: PALETTE.surface,
  softRed: PALETTE.selected,
};

function eventTime(value?: string | null) {
 const time = value?.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
 if (!time) return '';
 const hour = Number(time[1]);
 return `${hour % 12 || 12}:${time[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}



// ========================================
// ANNOUNCEMENT DETAILS AND JOIN CONFIRMATION
// Evaluation reuses the deterministic eligibility screen; joining only creates pending activity.
// ========================================
export default function AnnouncementScreen(){
 const router=useRouter();const {id,notificationId}=useLocalSearchParams<{id:string;notificationId?:string}>();const {opportunity,notificationAnnouncement,joinOpportunity,donationHistory,eligibilityState}=useAuth();
 const detailKey=JSON.stringify([id,notificationId]);
 const {width,fontScale=1}=useWindowDimensions();
 const generation=useRef(0);
 const [rest,setRest]=useState<{date?:string|null}|null>(null);
 const [dialog,setDialog]=useState<Omit<ComponentProps<typeof ConfirmationModal>,'visible'>|null>(null);
 const [content,setContent]=useState<{id:string;item:DonationOpportunity;expired:boolean;deadline?:number}|null>(null);
 // Route-tagged content is hidden immediately, before the next focus effect runs.
 const item=content && content.id===detailKey?content.item:null;
 const [expiredKey,setExpiredKey]=useState<string|null>(null);
 const expired=!!item && (content?.expired===true || expiredKey===detailKey);
 const [requestId,setRequestId]=useState(detailKey);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');const [unavailable,setUnavailable]=useState(false);const [busy,setBusy]=useState(false);const lock=useRef(false);
 const scrollRef=useRef<ScrollView>(null);const previousId=useRef(detailKey);
 const load=useCallback(async()=>{
   const version=++generation.current;setRequestId(detailKey);setLoading(true);setError('');setUnavailable(false);
   setContent(previous=>previous?.id===detailKey?previous:null);
   setDialog(null);setRest(null);lock.current=false;setBusy(false);
   if(previousId.current!==detailKey){scrollRef.current?.scrollTo({y:0,animated:false});previousId.current=detailKey;}
   if(typeof id!=='string' || (id!=='red-cross-dagupan' && (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id))))
     || (notificationId!==undefined && (id==='red-cross-dagupan' || typeof notificationId!=='string' || !/^[1-9]\d*$/.test(notificationId) || !Number.isSafeInteger(Number(notificationId))))){setContent(null);setUnavailable(true);setError('This announcement is unavailable.');setLoading(false);return;}
   try{
     const requestedAt=Date.now();
     const r=notificationId===undefined?await opportunity(id):await notificationAnnouncement(Number(notificationId));
     if(version===generation.current){
       if(r?.opportunity && (notificationId===undefined || String(r.opportunity.id)===id)){
         const expiresAt=Date.parse(r.opportunity.expires_at ?? ''),serverAt=Date.parse(r.server_time ?? '');
         const remaining=Number.isFinite(expiresAt) && Number.isFinite(serverAt)?expiresAt-serverAt-Math.max(0,Date.now()-requestedAt):undefined;
         const readOnly=r.read_only===true || r.view_state==='expired' || (remaining!==undefined && remaining<=0);
         setExpiredKey(readOnly?detailKey:null);
         setContent({id:detailKey,item:r.opportunity,expired:readOnly,deadline:remaining===undefined?undefined:Date.now()+Math.max(0,remaining)});
       }else{setContent(null);setUnavailable(true);setError('This announcement is unavailable.');}
     }
   }catch(e){if(version===generation.current){
     if(e instanceof ApiError && [403,404,410].includes(e.status)){setContent(null);setUnavailable(true);setError('This announcement is no longer available.');}
     else setError(errorMessage(e));
   }}finally{if(version===generation.current)setLoading(false);}
 },[id,notificationId,detailKey,opportunity,notificationAnnouncement]);
 useFocusEffect(useCallback(()=>{void load();return()=>{generation.current++;};},[load]));
 useEffect(()=>{
   if(content?.id!==detailKey || content.expired || content.deadline===undefined)return;
   let timer:ReturnType<typeof setTimeout>;
   const check=()=>{
     const remaining=content.deadline!-Date.now();
     if(remaining>0){timer=setTimeout(check,Math.min(remaining,2147483647));return;}
     setExpiredKey(detailKey);generation.current++;setDialog(null);setRest(null);lock.current=false;setBusy(false);
   };
   check();
   return()=>clearTimeout(timer);
 },[content,detailKey]);
 const release=(version:number)=>{if(version===generation.current){lock.current=false;setBusy(false);}};
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
 const canParticipate=()=>!!item && !expired && !loading && (content?.deadline===undefined || Date.now()<content.deadline);
 const confirm=async()=>{
   if(!item || !canParticipate() || lock.current || rest)return;
   lock.current=true;setBusy(true);setError('');
   const version=generation.current;
   try{
     // Filter on the server so active records cannot hide behind paginated history.
     const [pending,verifying,revising]=await Promise.all([donationHistory(1,'pending'),donationHistory(1,'for_verification'),donationHistory(1,'needs_revision')]);
     if(version!==generation.current || !canParticipate()){release(version);return;}
     const active=[...pending.data,...verifying.data,...revising.data].sort((a,b)=>b.id-a.id)[0];
     if(active){blocked('active_participation_exists',active.id);release(version);return;}
     const state=await eligibilityState();
     if(version!==generation.current || !canParticipate()){release(version);return;}
     if(state.is_on_donation_cooldown){
       blocked('donation_cooldown_active',undefined,undefined,state.next_eligible_donation_at);release(version);return;
     }
     if(!state.assessment || !state.cooldown_active || state.remaining_seconds<=0){
       blocked('evaluation_required');release(version);return;
     }
     if(state.assessment.result!=='eligible'){
       blocked('evaluation_not_eligible',undefined,state.remaining_seconds);release(version);return;
     }
     // Keep the lock through the dialog; consume callbacks once, including Cancel.
     let consumed=false;
     const cancel=()=>{if(!consumed){consumed=true;release(version);}};
     setDialog({title:'Confirm Donation',message:item.title,icon:'favorite-border',secondaryLabel:'Cancel',primaryLabel:'Confirm',dismissOnBackdrop:true,onSecondary:cancel,onPrimary:()=>{
         if(consumed)return;consumed=true;
         if(version!==generation.current || !canParticipate()){release(version);return;}
         void (async()=>{
           try{
             const r=await joinOpportunity(id);
             if(version===generation.current)router.push({pathname:'/activity/[id]',params:{id:String(r.participation.id)}});
           }catch(e){if(version===generation.current)failure(e);}
           finally{release(version);}
         })();
       }});
   }catch(e){if(version===generation.current)failure(e);release(version);}
 };
 const confirmation=dialog ?? {title:'Donation Rest Period',icon:'hourglass-empty' as const,message:'You recently completed a donation and are still within the 3-month rest period. You can donate again starting '+formatDonationRestDate(rest?.date)+'.',secondaryLabel:'Close',primaryLabel:'View Status',onSecondary:()=>setRest(null),onPrimary:()=>{setRest(null);router.push('/(tabs)/status');}};
 const imageUrl=announcementImageUrl(item?.image_url);
 const start=eventTime(item?.start_time),end=eventTime(item?.end_time);
 const timeRange=start && end ? start+' – '+end : start || (end ? 'Until '+end : '');
 const isChapter=id==='red-cross-dagupan';
 const stackedActions=width<350 || fontScale>1.3;
 const visibleError=requestId===detailKey?error:'';
 return <>
   <Stack.Screen options={{headerShown:false}}/>
   <SafeAreaView edges={['top','right','bottom','left']} style={styles.safeArea}>
     <View style={styles.header}>
       <Pressable accessibilityRole="button" accessibilityLabel="Go back"
         onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)')}
         style={({pressed})=>[styles.backButton,pressed && styles.pressed]}>
         <MaterialIcons name="arrow-back" size={23} color={PALETTE.primary} accessible={false}/>
       </Pressable>
       <Text accessibilityRole="header" style={styles.headerTitle}>{isChapter?'Donation Option':'Announcement Details'}</Text>
       <View style={styles.headerSpacer}/>
     </View>
     <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
       <View style={styles.content}>
         {visibleError && <View style={styles.errorCard}>
           <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.description,{color:unavailable?PALETTE.neutral:PALETTE.danger}]}>{visibleError}</Text>
           <Pressable accessibilityRole="button" accessibilityLabel="Retry announcement details" onPress={()=>void load()}
             style={({pressed})=>[styles.retryButton,pressed && styles.pressed]}>
             <Text style={styles.retryText}>Retry donation details</Text>
           </Pressable>
         </View>}
         {item ? <>
           <AnnouncementImage uri={imageUrl} title={item.title?.trim() || 'Announcement'} />
           <Text accessibilityRole="header" style={styles.title}>{item.title?.trim() || 'Announcement'}</Text>
           {expired ? <View style={styles.expiredNotice}>
             <Text accessibilityLabel="Expired announcement" style={styles.expiredLabel}>Expired</Text>
             <Text style={styles.expiredText}>This announcement has expired and is available for viewing only.</Text>
           </View> : null}
           {isChapter && item.summary ? <Text style={styles.description}>{item.summary}</Text> : null}
           {isChapter ? <Text style={styles.detailLabel}>Permanent / Donation Info</Text> : null}
           <View style={styles.eventDetails}>
             {!isChapter ? <View style={styles.detailRow}>
               <MaterialIcons name="event" size={21} color={PALETTE.primary} accessible={false}/>
               <View style={styles.detailContent}>
                 <Text style={styles.detailLabel}>Event Date</Text>
                 <Text style={styles.detailValue}>{formatDonationDate(item.event_date ?? item.donation_date,
                   isChapter ? 'Confirm donation arrangements with the chapter.' : 'Date to be announced')}</Text>
                 {timeRange ? <Text style={styles.detailTime}>{timeRange}</Text> : null}
               </View>
             </View> : null}
             <View style={[styles.detailRow,styles.locationRow]}>
               <MaterialIcons name="location-on" size={21} color={PALETTE.primary} accessible={false}/>
               <View style={styles.detailContent}>
                 <Text style={styles.detailLabel}>{isChapter ? 'Chapter' : 'Event Location'}</Text>
                 <Text style={styles.detailValue}>{item.location?.trim() || 'Location to be announced'}</Text>
               </View>
             </View>
           </View>
           <View style={styles.section}>
             <Text accessibilityRole="header" style={styles.sectionTitle}>{isChapter ? 'About This Donation Option' : 'About This Event'}</Text>
             <AnnouncementBody description={item.description || 'No event description is available.'} document={item.description_document}/>
           </View>
           <View style={styles.information}>
             <View style={styles.informationHeading}>
               <MaterialIcons name="workspace-premium" size={20} color={PALETTE.primary} accessible={false}/>
               <Text accessibilityRole="header" style={styles.informationTitle}>LifeFlow Donation Rewards</Text>
             </View>
             <Text style={styles.description}>Points are awarded only after an Admin verifies your donation. Verified donations earn 300 points for your first donation, increasing by 50 to a maximum of 500 per donation.</Text>
           </View>
           <View style={styles.information}>
             <View style={styles.informationHeading}>
               <MaterialIcons name="info-outline" size={20} color={PALETTE.primary} accessible={false}/>
               <Text accessibilityRole="header" style={styles.informationTitle}>Before You Donate</Text>
             </View>
             <Text style={styles.description}>Final donation eligibility is determined by the facility. Use the existing self-assessment to prepare, and bring the required identification or documents.</Text>
           </View>
         </> : !visibleError && (loading || requestId!==detailKey) ? <TabSkeleton variant="detail" label="Loading announcement" /> : null}
       </View>
     </ScrollView>
     {item && !expired && !loading && <View style={styles.footer}>
       <View style={[styles.actions,stackedActions && styles.actionsStacked]}>
         <Pressable accessibilityRole="button" accessibilityLabel="Evaluate" onPress={()=>{if(canParticipate())router.push('/evaluation');}}
           style={({pressed})=>[styles.actionButton,stackedActions && styles.stackedButton,styles.secondaryButton,pressed && styles.secondaryPressed]}>
           <Text style={styles.secondaryText}>Evaluate</Text>
         </Pressable>
         <Pressable accessibilityRole="button" accessibilityLabel={busy?'Joining donation activity':'Go Donate'}
           accessibilityState={{disabled:busy,busy}} disabled={busy} onPress={()=>void confirm()}
           style={({pressed})=>[styles.actionButton,stackedActions && styles.stackedButton,styles.primaryButton,busy && styles.disabled,pressed && styles.primaryPressed]}>
           <Text style={styles.primaryText}>{busy?'Joining…':'Go Donate'}</Text>
         </Pressable>
       </View>
     </View>}
   </SafeAreaView>
   {!expired && <ConfirmationModal {...confirmation} visible={requestId===detailKey && (!!dialog || !!rest)} onSecondary={()=>{setDialog(null);confirmation.onSecondary();}} onPrimary={()=>{setDialog(null);return confirmation.onPrimary();}} />}
 </>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
      backgroundColor: COLORS.background },
  backButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, minWidth: 0, textAlign: 'center', color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 },
  title: { color: COLORS.text, fontSize: 25, fontWeight: '800', lineHeight: 32, letterSpacing: -0.5 },
  expiredNotice: { gap: 6 }, expiredLabel: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: PALETTE.inactiveSurface, color: PALETTE.inactiveText, fontSize: 13, fontWeight: '700' },
  expiredText: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  eventDetails: { gap: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  detailContent: { flex: 1, minWidth: 0 },
  locationRow: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 },
  detailLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  detailValue: { marginTop: 3, color: COLORS.text, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  detailTime: { marginTop: 3, color: COLORS.muted, fontSize: 14, lineHeight: 20 },
  section: { gap: 2 },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: '700', lineHeight: 25 },
  information: { paddingTop: 18, borderTopWidth: 1, borderTopColor: COLORS.border },
  informationHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  informationTitle: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 15, fontWeight: '700', lineHeight: 22 },
  description: { marginTop: 6, color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  footer: { flexShrink: 0, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.background },
  actions: { width: '100%', maxWidth: 620, alignSelf: 'center', flexDirection: 'row', gap: 10 },
  actionsStacked: { flexDirection: 'column' },
  stackedButton: { flexBasis: 'auto', flexGrow: 0 },
  actionButton: { flexGrow: 1, flexBasis: 0, minWidth: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, paddingHorizontal: 16, borderRadius: 14 },
  primaryButton: { backgroundColor: COLORS.brand },
  primaryPressed: { backgroundColor: COLORS.brandPressed },
  primaryText: { color: COLORS.white, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: COLORS.brand, backgroundColor: COLORS.background },
  secondaryPressed: { backgroundColor: COLORS.softRed },
  secondaryText: { color: COLORS.brand, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  disabled: { opacity: 0.55 },
  errorCard: { padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.white },
  retryButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 10 },
  retryText: { color: COLORS.brand, fontSize: 14, lineHeight: 21, fontWeight: '600' },
});
