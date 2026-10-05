import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import {ConfirmationModal} from '@/components/confirmation-modal';
import {Stack,useFocusEffect,useLocalSearchParams,useRouter} from 'expo-router';
import {useCallback,useRef,useState,type ComponentProps} from 'react';
import {Image,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useAuth} from '@/contexts/auth-context';
import {errorMessage} from '@/services/api';
import {DONATION_STATUS,type DonationParticipation} from '@/services/donations';
// ========================================
// PROOF PICKER AND STORAGE
// Reuses the installed picker and delegates file transfers to the service.
// ========================================
import { pickProofFile, prepareProofUpload, reportProofFailure, type ProofFile } from '@/services/proof-storage';
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
const STATUS_PRESENTATION: Record<DonationParticipation['status'], {icon:ComponentProps<typeof MaterialIcons>['name'];color:string}> = {
  pending: { icon: 'schedule', color: COLORS.muted },
  for_verification: { icon: 'hourglass-empty', color: '#946313' },
  needs_revision: { icon: 'error-outline', color: '#A34C16' },
  completed: { icon: 'check-circle', color: '#287A47' },
  rejected: { icon: 'cancel', color: COLORS.brandPressed },
  cancelled: { icon: 'block', color: COLORS.muted },
};


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
 useFocusEffect(useCallback(()=>{void retry;let active=true;revision.current++;setItem(null);setError('');setSubmittingProof(false);donationDetail(id).then(r=>{if(active)setItem(r.participation);}).catch(e=>{if(active)setError(errorMessage(e));});return()=>{active=false;revision.current++;const delay=proofDisplayDelay.current;if(delay){clearTimeout(delay.timer);proofDisplayDelay.current=null;delay.resolve();}};},[id,donationDetail,retry]));
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
 return <><Stack.Screen options={{headerShown:false}}/><SafeAreaView edges={['top','bottom']} style={styles.safeArea}>
 <View style={styles.header}><Pressable accessibilityLabel="Go back" onPress={()=>router.back()} style={styles.backButton}><MaterialIcons name="arrow-back" size={23}/></Pressable><Text style={styles.headerTitle}>Activity Details</Text></View>
 <ScrollView contentContainerStyle={styles.scrollContent}><View style={styles.content}>
 {error?<Pressable onPress={()=>setRetry(n=>n+1)}><Text accessibilityRole="alert" style={styles.description}>{error} Tap to refresh.</Text></Pressable>:null}
 {item?<><View accessible accessibilityRole="text" accessibilityLabel={'Status: '+DONATION_STATUS[item.status]} style={styles.statusBlock}>
   <MaterialIcons name={STATUS_PRESENTATION[item.status].icon} size={52} color={STATUS_PRESENTATION[item.status].color} accessible={false} importantForAccessibility="no" accessibilityElementsHidden/>
   <Text style={[styles.statusText,{color:STATUS_PRESENTATION[item.status].color}]}>{DONATION_STATUS[item.status]}</Text>
 </View><Text style={styles.title}>{item.opportunity.title}</Text>
 <View style={styles.detailsCard}><Text style={styles.detailValue}>{item.opportunity.event_date || 'Confirm arrangements with the chapter'} {item.opportunity.start_time || ''}</Text><Text style={styles.detailValue}>{item.opportunity.location}</Text><Text style={styles.description}>{item.opportunity.description}</Text></View>
 <Text style={styles.pointsExplanation}>Verified donations earn 300 points for your first donation, increasing by 50 to a maximum of 500 per donation.</Text>
 <View style={styles.resultArea}>
   <Text style={styles.resultText}>{item.status==='completed'?'Donation Verified.':DONATION_STATUS[item.status]+'.'}</Text>
   {resultReason?<View style={styles.resultReason}><Text style={styles.reasonLabel}>Reason:</Text><Text style={styles.reasonText}>{resultReason}</Text></View>:null}
 </View>
 {item.status==='pending' || item.status==='needs_revision'?<>
 <Pressable disabled={busy} accessibilityState={{disabled:busy,busy}} onPress={upload} style={styles.uploadButton}><Text style={styles.uploadButtonText}>{pendingFile?'Retry Proof Upload':item.status==='needs_revision'?'Upload New Proof':'Upload Proof'}</Text></Pressable><Text style={styles.description}>Choose a JPEG, PNG, or PDF up to 5 MB.</Text>{item.status==='pending'?<Pressable disabled={busy} onPress={cancel} style={styles.cancelButton}><Text style={styles.cancelButtonText}>Cancel Participation</Text></Pressable>:null}</>:null}
 </>:!error?<Text style={styles.description}>Loading activity…</Text>:null}
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
  statusBlock: { width: '100%', alignItems: 'center', gap: 10, paddingVertical: 8 },
  statusText: { maxWidth: '100%', fontSize: 15, lineHeight: 22, fontWeight: '800', letterSpacing: 0.8, textAlign: 'center', textTransform: 'uppercase' },
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
  pointsExplanation: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
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
  resultArea: { width: '100%', gap: 10, paddingVertical: 4 },
  resultText: { color: COLORS.text, fontSize: 16, fontWeight: '700', lineHeight: 24, textAlign: 'center' },
  resultReason: { gap: 4 },
  reasonLabel: { color: COLORS.text, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  reasonText: { color: COLORS.muted, fontSize: 14, lineHeight: 21 },
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
