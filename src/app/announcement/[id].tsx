import { LifeFlowColors as PALETTE } from '@/constants/theme';
import { announcementImageUrl, formatDonationDate } from '@/services/announcement-presentation';
import { AnnouncementBody } from '@/components/announcement-body';
import { ConfirmationModal } from '@/components/confirmation-modal';
import { formatDonationRestDate } from '@/services/eligibility';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {Stack,useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useRef,useState,type ComponentProps} from 'react';
import {Image,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
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
 const router=useRouter();const {id}=useLocalSearchParams<{id:string}>();const {opportunity,joinOpportunity,donationHistory,eligibilityState}=useAuth();
 const {width,fontScale=1}=useWindowDimensions();
 const generation=useRef(0);
 const [rest,setRest]=useState<{date?:string|null}|null>(null);
 const [dialog,setDialog]=useState<Omit<ComponentProps<typeof ConfirmationModal>,'visible'>|null>(null);
 const [item,setItem]=useState<DonationOpportunity|null>(null);const [error,setError]=useState('');const [busy,setBusy]=useState(false);const lock=useRef(false);
 const [failedImage,setFailedImage]=useState<string|null>(null);
 const load=useCallback(async()=>{
   const version=++generation.current;setItem(null);setError('');setFailedImage(null);
   if(typeof id!=='string' || (id!=='red-cross-dagupan' && !/^[1-9]\d*$/.test(id))){setError('This announcement is unavailable.');return;}
   try{
     const r=await opportunity(id);
     if(version===generation.current){
       if(r?.opportunity)setItem(r.opportunity);else setError('This announcement is unavailable.');
     }
   }catch(e){if(version===generation.current)setError(e instanceof ApiError && e.status===404?'This announcement is unavailable or has expired.':errorMessage(e));}
 },[id,opportunity]);
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
 const imageUrl=announcementImageUrl(item?.image_url);
 const start=eventTime(item?.start_time),end=eventTime(item?.end_time);
 const timeRange=start && end ? start+' – '+end : start || (end ? 'Until '+end : '');
 const isChapter=id==='red-cross-dagupan';
 const stackedActions=width<350 || fontScale>1.3;
 return <>
   <Stack.Screen options={{headerShown:false}}/>
   <SafeAreaView edges={['top','right','bottom','left']} style={styles.safeArea}>
     <View style={styles.header}>
       <Pressable accessibilityRole="button" accessibilityLabel="Go back"
         onPress={()=>router.canGoBack()?router.back():router.replace('/(tabs)')}
         style={({pressed})=>[styles.backButton,pressed && styles.pressed]}>
         <MaterialIcons name="arrow-back" size={23} color={COLORS.text} accessible={false}/>
       </Pressable>
       <Text accessibilityRole="header" style={styles.headerTitle}>{isChapter?'Donation Option':'Announcement Details'}</Text>
       <View style={styles.headerSpacer}/>
     </View>
     <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
       <View style={styles.content}>
         {error && <View style={styles.errorCard}>
           <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.description,{color:PALETTE.danger}]}>{error}</Text>
           {!item && <Pressable accessibilityRole="button" accessibilityLabel="Retry announcement details" onPress={()=>void load()}
             style={({pressed})=>[styles.retryButton,pressed && styles.pressed]}>
             <Text style={styles.retryText}>Retry donation details</Text>
           </Pressable>}
         </View>}
         {item ? <>
           <View style={styles.banner}>
             {imageUrl && failedImage!==imageUrl ?
               <Image source={{uri:imageUrl}} accessibilityLabel={item.title ? item.title+' event banner' : 'Announcement event banner'}
                 resizeMode="cover" style={styles.bannerImage} onError={()=>setFailedImage(imageUrl)}/> :
               <View style={styles.bannerFallback}>
                 <MaterialIcons name="image-not-supported" size={36} color={COLORS.muted} accessible={false}/>
                 <Text style={styles.fallbackText}>No event image available</Text>
               </View>}
           </View>
           <Text accessibilityRole="header" style={styles.title}>{item.title?.trim() || 'Announcement'}</Text>
           <View style={styles.eventDetails}>
             <View style={styles.detailRow}>
               <MaterialIcons name="event" size={21} color={COLORS.muted} accessible={false}/>
               <View style={styles.detailContent}>
                 <Text style={styles.detailLabel}>Event Date</Text>
                 <Text style={styles.detailValue}>{formatDonationDate(item.event_date ?? item.donation_date,
                   isChapter ? 'Confirm donation arrangements with the chapter.' : 'Date to be announced')}</Text>
                 {timeRange ? <Text style={styles.detailTime}>{timeRange}</Text> : null}
               </View>
             </View>
             <View style={[styles.detailRow,styles.locationRow]}>
               <MaterialIcons name="location-on" size={21} color={COLORS.muted} accessible={false}/>
               <View style={styles.detailContent}>
                 <Text style={styles.detailLabel}>Event Location</Text>
                 <Text style={styles.detailValue}>{item.location?.trim() || 'Location to be announced'}</Text>
               </View>
             </View>
           </View>
           <View style={styles.section}>
             <Text accessibilityRole="header" style={styles.sectionTitle}>About This Event</Text>
             <AnnouncementBody description={item.description || 'No event description is available.'} document={item.description_document}/>
           </View>
           <View style={styles.information}>
             <View style={styles.informationHeading}>
               <MaterialIcons name="workspace-premium" size={20} color={COLORS.muted} accessible={false}/>
               <Text accessibilityRole="header" style={styles.informationTitle}>LifeFlow Donation Rewards</Text>
             </View>
             <Text style={styles.description}>Points are awarded only after an Admin verifies your donation. Verified donations earn 300 points for your first donation, increasing by 50 to a maximum of 500 per donation.</Text>
           </View>
           <View style={styles.information}>
             <View style={styles.informationHeading}>
               <MaterialIcons name="info-outline" size={20} color={COLORS.muted} accessible={false}/>
               <Text accessibilityRole="header" style={styles.informationTitle}>Before You Donate</Text>
             </View>
             <Text style={styles.description}>Final donation eligibility is determined by the facility. Use the existing self-assessment to prepare, and bring the required identification or documents.</Text>
           </View>
         </> : !error && <View accessibilityRole="progressbar" accessibilityLabel="Loading announcement" accessibilityState={{busy:true}} style={styles.loading}>
           <Text style={styles.description}>Loading announcement…</Text>
         </View>}
       </View>
     </ScrollView>
     {item && <View style={styles.footer}>
       <View style={[styles.actions,stackedActions && styles.actionsStacked]}>
         <Pressable accessibilityRole="button" accessibilityLabel="Evaluate" onPress={()=>router.push('/evaluation')}
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
   <ConfirmationModal {...confirmation} visible={!!dialog || !!rest} onSecondary={()=>{setDialog(null);confirmation.onSecondary();}} onPrimary={()=>{setDialog(null);return confirmation.onPrimary();}} />
 </>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background },
  backButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, minWidth: 0, textAlign: 'center', color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '800' },
  pressed: { opacity: 0.7 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 20 },
  banner: { width: '100%', aspectRatio: 16/9, overflow: 'hidden', borderRadius: 16, backgroundColor: COLORS.white },
  bannerImage: { width: '100%', height: '100%' },
  bannerFallback: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 16,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.white },
  fallbackText: { color: COLORS.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', flexShrink: 1 },
  title: { color: COLORS.text, fontSize: 25, fontWeight: '800', lineHeight: 32, letterSpacing: -0.5 },
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
  loading: { paddingVertical: 24 },
  errorCard: { padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.white },
  retryButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingVertical: 10 },
  retryText: { color: COLORS.brand, fontSize: 14, lineHeight: 21, fontWeight: '600' },
});
