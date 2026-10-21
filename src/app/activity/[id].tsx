import { LifeFlowColors as PALETTE } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {ConfirmationModal} from '@/components/confirmation-modal';
import {AnnouncementBody} from '@/components/announcement-body';
import {formatDonationDate,formatJoinedDate} from '@/services/announcement-presentation';
import {Stack,useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useRef,useState,type ComponentProps} from 'react';
import {Image,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '@/contexts/auth-context';
import {ApiError,errorMessage} from '@/services/api';
import {DONATION_STATUS,type DonationParticipation} from '@/services/donations';
// ========================================
// PROOF PICKER AND STORAGE
// Reuses the installed picker and delegates file transfers to the service.
// ========================================
import { pickProofFile, prepareProofUpload, reportProofFailure, type ProofFile } from '@/services/proof-storage';
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
const STATUS_PRESENTATION: Record<DonationParticipation['status'], {icon:ComponentProps<typeof MaterialIcons>['name'];color:string;tint:string;message:string}> = {
  pending: { icon: 'schedule', color: PALETTE.pendingText, tint: PALETTE.pendingSurface, message: 'Please upload your donation proof for Admin review.' },
  for_verification: { icon: 'hourglass-empty', color: PALETTE.pendingText, tint: PALETTE.pendingSurface, message: 'Your proof has been submitted and is awaiting Admin review. No further upload is needed.' },
  needs_revision: { icon: 'error-outline', color: PALETTE.revisionText, tint: PALETTE.revisionSurface, message: 'Admin has requested a revision. Review the reason below and submit updated proof.' },
  completed: { icon: 'check-circle', color: PALETTE.successText, tint: PALETTE.successSurface, message: 'Your donation has been verified by Admin. No further action is needed.' },
  rejected: { icon: 'cancel', color: PALETTE.danger, tint: PALETTE.dangerSurface, message: 'This donation activity was permanently rejected. Proof cannot be resubmitted.' },
  cancelled: { icon: 'block', color: PALETTE.neutralText, tint: PALETTE.neutralSurface, message: 'This participation was cancelled. No proof upload is available.' },
};

function eventTime(value?: string | null) {
 const time=value?.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
 if(!time)return '';
 const hour=Number(time[1]);return `${hour%12 || 12}:${time[2]} ${hour>=12?'PM':'AM'}`;
}


// ========================================
// OWNED PARTICIPATION AND PROOF
// Keeps activity visible after expiry and permits donor actions only while pending.
// ========================================
export default function ActivityDetailScreen(){
 const router=useRouter(); const {id}=useLocalSearchParams<{id:string}>();
 const {user,donationDetail,cancelParticipation,submitProof}=useAuth();
 const [item,setItem]=useState<DonationParticipation|null>(null); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
 const [submittingProof,setSubmittingProof]=useState(false);
 const revision=useRef(0);
 const proofDisplayDelay=useRef<{timer:ReturnType<typeof setTimeout>;resolve:()=>void}|null>(null);
 const lock=useRef(false); const [retry,setRetry]=useState(0);
 useFocusEffect(useCallback(()=>{
   void retry;let active=true;revision.current++;setItem(null);setError('');setSubmittingProof(false);
   if(typeof id!=='string' || !/^[1-9]\d*$/.test(id))setError('This activity is unavailable.');
   else donationDetail(id).then(r=>{
     if(active){if(r?.participation)setItem(r.participation);else setError('This activity is unavailable.');}
   }).catch(e=>{if(active)setError(e instanceof ApiError && e.status===404?'This activity is unavailable.':errorMessage(e));});
   return()=>{active=false;revision.current++;const delay=proofDisplayDelay.current;if(delay){clearTimeout(delay.timer);proofDisplayDelay.current=null;delay.resolve();}};
 },[id,donationDetail,retry]));
 const run=async(action:()=>Promise<void>)=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();}catch(e){setError(errorMessage(e));}finally{lock.current=false;setBusy(false);}};
 const [confirmCancel,setConfirmCancel]=useState(false);
 const cancel=()=>setConfirmCancel(true);
 // Retain the selected cached file for retry; there is only one server upload.
 const [selected,setSelected]=useState<{id:string;userId:number;asset:ProofFile}|null>(null);
 const pendingFile=selected?.id===id && selected.userId===user?.id ? selected : null;
 const upload=()=>void run(async()=>{
   if(!user || !item || !['pending','needs_revision'].includes(item.status))return;
   const version=revision.current;
   let asset=pendingFile?.asset;
   if(!asset){
     const selection=await pickProofFile();
     if(!selection || version!==revision.current)return;
     asset=selection;
     setSelected({id,userId:user.id,asset});
   }
   const loadingStartedAt=Date.now();
   setSubmittingProof(true);
   const closeLoading=async()=>{
     if(version!==revision.current)return;
     const remaining=800-(Date.now()-loadingStartedAt);
     if(remaining>0){
       await new Promise<void>(resolve=>{
         const timer=setTimeout(()=>{proofDisplayDelay.current=null;resolve();},remaining);
         proofDisplayDelay.current={timer,resolve};
       });
     }
     if(version===revision.current)setSubmittingProof(false);
   };
   let closing:Promise<void>|undefined;
   try{
     const response=await submitProof(id,prepareProofUpload(asset));
     closing=closeLoading();
     if(version!==revision.current)return;
     setItem(response.participation);setSelected(null);
   }catch(e){
     closing ??= closeLoading();
     if(version!==revision.current)return;
     reportProofFailure(e);
     // A lost response may already have committed. Never infer success locally.
     const current=await donationDetail(id).catch(()=>null);
     if(version!==revision.current)return;
     if(current && !['pending','needs_revision'].includes(current.participation.status)){
       setItem(current.participation);setSelected(null);return;
     }
     throw e;
   }finally{
     await (closing ?? closeLoading());
   }
 });
 // ========================================
 // ACTIVITY DETAILS AND DONOR ACTIONS
 // Only server-confirmed pending activity exposes proof and cancellation.
 // ========================================
 const resultReason=item?.status==='needs_revision'?item.revision_reason?.trim():item?.status==='rejected'?item.rejection_reason?.trim():undefined;
 const knownStatus=item && Object.prototype.hasOwnProperty.call(STATUS_PRESENTATION,item.status) ? item.status : null;
 const status=knownStatus ? STATUS_PRESENTATION[knownStatus] : {icon:'help-outline' as const,color:COLORS.muted,tint:COLORS.white,message:'The current activity status is unavailable. Refresh to check for an update.'};
 const label=knownStatus ? DONATION_STATUS[knownStatus] : 'Status Unavailable';
 const hasProof=Boolean(item?.proof_uploaded_at || item?.proof_original_name?.trim() || (item?.proof_size && item.proof_size>0));
 const canUpload=item?.status==='pending' || item?.status==='needs_revision';
 const opportunity=item?.opportunity;
 const chapter=item?.source_type==='red_cross_dagupan' || opportunity?.source_type==='red_cross_dagupan';
 const start=eventTime(opportunity?.start_time),end=eventTime(opportunity?.end_time);
 const timeRange=start && end ? start+' – '+end : start || (end ? 'Until '+end : '');
 return <><Stack.Screen options={{headerShown:false}}/><SafeAreaView edges={['top','right','bottom','left']} style={styles.safeArea}>
 <View style={styles.header}>
   <Pressable accessibilityRole="button" accessibilityLabel="Go back" onPress={()=>router.back()} style={({pressed})=>[styles.backButton,pressed && styles.pressed]}>
     <MaterialIcons name="arrow-back" size={23} color={COLORS.text} accessible={false}/>
   </Pressable>
   <Text accessibilityRole="header" style={styles.headerTitle}>Activity Details</Text>
   <View style={styles.headerSpacer}/>
 </View>
 <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}><View style={styles.content}>
 {error?<View style={styles.errorCard}>
   <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[styles.description,{color:PALETTE.danger}]}>{error}</Text>
   <Pressable accessibilityRole="button" accessibilityLabel="Refresh activity" disabled={busy} onPress={()=>setRetry(n=>n+1)} style={styles.refreshButton}>
     <Text style={styles.refreshText}>Refresh activity</Text>
   </Pressable>
 </View>:null}
 {item?<>
   <View accessible accessibilityRole="text" accessibilityLabel={'Status: '+label} style={[styles.statusBanner,{backgroundColor:status.tint}]}>
     <View style={styles.statusIcon}><MaterialIcons name={status.icon} size={38} color={status.color} accessible={false} importantForAccessibility="no" accessibilityElementsHidden/></View>
     <View style={[styles.statusContent,{borderLeftColor:status.color}]}>
       <Text style={[styles.statusText,{color:status.color}]}>{label}</Text>
       <Text style={styles.statusDescription}>{item.status==='pending' && hasProof ? 'Donation proof is already on file. This activity is still pending; refresh to check its latest status.' : status.message}</Text>
     </View>
   </View>
   <View style={styles.card}>
     <View style={styles.cardHeading}>
       <View style={styles.cardIcon}><MaterialIcons name="water-drop" size={28} color={COLORS.brandPressed} accessible={false}/></View>
       <Text accessibilityRole="header" style={styles.title}>{opportunity?.title?.trim() || 'Donation activity'}</Text>
     </View>
     <View style={styles.detailRow}>
       <MaterialIcons name="event" size={25} color={COLORS.muted} accessible={false}/>
       <View style={styles.detailContent}>
         <Text style={styles.detailLabel}>Date</Text>
         <Text style={styles.detailValue}>{formatDonationDate(opportunity?.event_date ?? opportunity?.donation_date,chapter?'Confirm arrangements with the chapter':'Date to be announced')}</Text>
         {timeRange?<Text style={styles.detailTime}>{timeRange}</Text>:null}
       </View>
     </View>
     <View style={styles.detailRow}>
       <MaterialIcons name="location-on" size={25} color={COLORS.muted} accessible={false}/>
       <View style={styles.detailContent}><Text style={styles.detailLabel}>Location</Text><Text style={styles.detailValue}>{opportunity?.location?.trim() || 'Location to be announced'}</Text></View>
     </View>
     <View style={styles.about}>
       <Text accessibilityRole="header" style={styles.detailLabel}>About the Event</Text>
       <AnnouncementBody description={opportunity?.description || 'Event details are no longer available.'} document={opportunity?.description_document}/>
     </View>
   </View>
   <View style={[styles.card,styles.infoCard]}>
     <View style={styles.cardIcon}><MaterialIcons name="star" size={28} color={COLORS.brandPressed} accessible={false}/></View>
     <View style={styles.infoContent}>
       <Text accessibilityRole="header" style={styles.sectionTitle}>Reward Points</Text>
       <Text style={styles.description}>Points are awarded only after Admin verification. Verified donations earn 300 points for your first donation, increasing by 50 to a maximum of 500 per donation.</Text>
     </View>
   </View>
   <View style={styles.card}>
     {canUpload?<>
       <View style={styles.cardHeading}>
         <View style={styles.cardIcon}><MaterialIcons name="upload-file" size={28} color={COLORS.brandPressed} accessible={false}/></View>
         <View style={styles.infoContent}>
           <Text accessibilityRole="header" style={styles.sectionTitle}>{item.status==='needs_revision'?'Update Donation Proof':hasProof?'Replace Donation Proof':'Upload Donation Proof'}</Text>
           <Text style={styles.description}>{item.status==='needs_revision'?'Review the Admin feedback and submit a corrected photo or PDF.':hasProof?'Your proof is on file. You can submit a replacement while this activity remains pending.':'Submit a photo or PDF as proof of your participation.'}</Text>
         </View>
       </View>
       {item.status==='needs_revision'?<View style={styles.resultArea}>
         <Text style={[styles.resultText,{color:PALETTE.revisionText}]}>Needs Revision.</Text>
         {resultReason?<View style={styles.resultReason}><Text style={styles.reasonLabel}>Reason:</Text><Text style={styles.reasonText}>{resultReason}</Text></View>:null}
       </View>:null}
       <View style={styles.fileGuidance}><MaterialIcons name="insert-photo" size={22} color={COLORS.muted} accessible={false}/><Text style={styles.fileGuidanceText}>Accepted formats: JPEG, PNG, PDF · Max 5 MB</Text></View>
       <Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy,busy}} onPress={upload}
         style={({pressed})=>[styles.uploadButton,busy && styles.disabled,pressed && styles.uploadButtonPressed,item.status==='needs_revision' && {backgroundColor:pressed?PALETTE.revisionPressed:PALETTE.revisionAction}]}>
         <Text style={styles.uploadButtonText}>{pendingFile?'Retry Proof Upload':item.status==='needs_revision'?'Re-upload Proof':hasProof?'Upload New Proof':'Upload Proof'}</Text>
       </Pressable>
       <View style={styles.reviewNote}><MaterialIcons name="info-outline" size={20} color={COLORS.muted} accessible={false}/><Text style={styles.reviewText}>Your proof will be reviewed by the Admin team.</Text></View>
     </>:<View style={styles.resultArea}>
       <Text accessibilityRole="header" style={[styles.resultText,{color:status.color}]}>{item.status==='completed'?'Donation Verified.':knownStatus?label+'.':'Activity Status Unavailable.'}</Text>
       <Text style={styles.description}>{status.message}</Text>
       {item.status==='for_verification' && item.proof_uploaded_at?<Text style={styles.description}>{'Proof submitted: '+formatJoinedDate(item.proof_uploaded_at)}</Text>:null}
       {item.status==='completed' && item.verified_at?<Text style={styles.description}>{'Verified on: '+formatJoinedDate(item.verified_at)}</Text>:null}
       {resultReason?<View style={styles.resultReason}><Text style={styles.reasonLabel}>Reason:</Text><Text style={styles.reasonText}>{resultReason}</Text></View>:null}
       {!knownStatus?<Pressable accessibilityRole="button" disabled={busy} onPress={()=>setRetry(n=>n+1)} style={styles.refreshButton}><Text style={styles.refreshText}>Refresh activity</Text></Pressable>:null}
     </View>}
     {item.status==='pending'?<Pressable accessibilityRole="button" disabled={busy} accessibilityState={{disabled:busy}} onPress={cancel}
       style={({pressed})=>[styles.cancelButton,busy && styles.disabled,pressed && styles.cancelButtonPressed]}><Text style={styles.cancelButtonText}>Cancel Participation</Text></Pressable>:null}
   </View>
 </>:!error?<View accessibilityRole="progressbar" accessibilityLabel="Loading activity" accessibilityState={{busy:true}}><Text style={styles.description}>Loading activity…</Text></View>:null}
 </View></ScrollView></SafeAreaView>
 <ConfirmationModal visible={confirmCancel} icon="event-busy" variant="destructive" title="Cancel participation?" message="Only pending activities can be cancelled." secondaryLabel="Keep activity" primaryLabel="Cancel participation" dismissible={false} onSecondary={()=>setConfirmCancel(false)} onPrimary={()=>{setConfirmCancel(false);return run(async()=>setItem((await cancelParticipation(id)).participation));}}/>
 {submittingProof && <Modal visible transparent animationType="none" onRequestClose={()=>{}}>
   <SafeAreaView edges={['top','bottom']} accessibilityViewIsModal accessibilityState={{busy:true}} style={styles.proofLoading}>
     <Image accessible={false} source={require('../../../assets/images/LogoMascot.png')} resizeMode="contain" fadeDuration={0} style={styles.proofLoadingMascot}/>
     <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.proofLoadingText}>Flowie is submitting your proof...</Text>
   </SafeAreaView>
 </Modal>}
 </>;
}
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  proofLoading: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24, gap: 18, backgroundColor: COLORS.background },
  proofLoadingMascot: { width: 130, height: 130 },
  proofLoadingText: { color: COLORS.text, fontSize: 16, fontWeight: '600', lineHeight: 24, textAlign: 'center' },
  header: { minHeight: 60, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.background },
  backButton: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerSpacer: { width: 44 },
  headerTitle: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 17, lineHeight: 23, fontWeight: '800', textAlign: 'center' },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.55 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: 16 },
  statusBanner: { width: '100%', flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 14, borderRadius: 20 },
  statusIcon: { width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  statusContent: { flex: 1, minWidth: 0, paddingLeft: 14, borderLeftWidth: 1 },
  statusText: { fontSize: 20, lineHeight: 28, fontWeight: '800' },
  statusDescription: { marginTop: 6, color: PALETTE.neutralText, fontSize: 14, lineHeight: 21 },
  card: { padding: 18, gap: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 20, backgroundColor: COLORS.white },
  cardHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardIcon: { width: 44, minHeight: 44, borderRadius: 24, backgroundColor: COLORS.softRed, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, minWidth: 0, color: COLORS.text, fontSize: 23, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  detailContent: { flex: 1, minWidth: 0 },
  detailLabel: { color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  detailValue: { marginTop: 3, color: COLORS.text, fontSize: 15, lineHeight: 23, fontWeight: '600' },
  detailTime: { marginTop: 3, color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  about: { paddingTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border },
  infoCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  infoContent: { flex: 1, minWidth: 0 },
  sectionTitle: { color: COLORS.text, fontSize: 18, lineHeight: 25, fontWeight: '700' },
  description: { marginTop: 6, color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  resultArea: { width: '100%', gap: 10 },
  resultText: { color: COLORS.text, fontSize: 16, fontWeight: '700', lineHeight: 24, textAlign: 'center' },
  resultReason: { gap: 4 },
  reasonLabel: { color: COLORS.text, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  reasonText: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
  fileGuidance: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 12, backgroundColor: COLORS.background },
  fileGuidanceText: { flex: 1, minWidth: 0, color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  uploadButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 12,
    borderRadius: 14, backgroundColor: COLORS.brand },
  uploadButtonPressed: { backgroundColor: COLORS.brandPressed },
  uploadButtonText: { color: COLORS.white, fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  reviewNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  reviewText: { flex: 1, minWidth: 0, color: COLORS.muted, fontSize: 13, lineHeight: 20 },
  cancelButton: { minHeight: 48, paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: PALETTE.danger, borderRadius: 14, backgroundColor: COLORS.background },
  cancelButtonPressed: { backgroundColor: PALETTE.dangerSurface },
  cancelButtonText: { color: PALETTE.danger, fontSize: 14, lineHeight: 21, fontWeight: '700', textAlign: 'center' },
  errorCard: { padding: 16, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: COLORS.white },
  refreshButton: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
  refreshText: { color: COLORS.brand, fontSize: 14, lineHeight: 21, fontWeight: '600' },
});
