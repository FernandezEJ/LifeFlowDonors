import { ProfileSettingsPage } from '@/components/profile-settings-page';
import { supportEmail } from '@/constants/support';
import { LifeFlowColors as PALETTE } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

const GUIDANCE = [
  ['Forgot your contact number?', 'Use your registered email in Email or Contact Number. Your login code is sent to that verified inbox.'],
  ['Forgot your email address?', 'Use your registered Philippine contact number if you can still access its linked email inbox. Codes are sent by email, not SMS.'],
  ['Didn’t receive a code?', 'Check your inbox and spam or junk folder. Delivery may take a moment. Wait for the existing resend countdown, then request a new code and use the latest one.'],
  ['Lost access to your email?', 'Contact LifeFlow Support for assisted recovery. Knowing a name, contact number, or birth date alone is not proof of account ownership. This screen cannot reset or replace your email.'],
] as const;

export default function TroubleSigningInScreen() {
  const address = supportEmail();
  const [error, setError] = useState('');
  const [opening, setOpening] = useState(false);
  const lock = useRef(false), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const contact = async () => {
    if (!address || lock.current) return;
    lock.current = true; setOpening(true); setError('');
    try { await Linking.openURL('mailto:' + encodeURIComponent(address) + '?subject=LifeFlow%20sign-in%20support'); }
    catch { if (mounted.current) setError('Unable to open an email app. You can contact LifeFlow Support at ' + address + '.'); }
    finally { lock.current = false; if (mounted.current) setOpening(false); }
  };
  return <ProfileSettingsPage title="Trouble signing in?" fallback="/(auth)/login">
    <Text style={styles.intro}>LifeFlow uses a six-digit code sent to your registered, verified email. You do not need a donor password.</Text>
    {GUIDANCE.map(([title, description]) => <View key={title} style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>{title}</Text>
      <Text style={styles.copy}>{description}</Text>
    </View>)}
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>Contact LifeFlow Support</Text>
      {address ? <>
        <Text selectable style={styles.copy}>{address}</Text>
        <Pressable accessibilityRole="link" accessibilityLabel="Contact LifeFlow Support" disabled={opening} accessibilityState={{disabled:opening,busy:opening}}
          onPress={()=>void contact()} style={({pressed})=>[styles.contact,(pressed || opening) && styles.dimmed]}>
          <MaterialIcons name="mail-outline" size={22} color={PALETTE.primary} accessible={false}/>
          <Text style={styles.contactText}>{opening ? 'Opening email app…' : 'Contact LifeFlow Support'}</Text>
        </Pressable>
      </> : <Text style={styles.copy}>The LifeFlow support email has not been configured yet. Email contact will be available once the support address is provided.</Text>}
      <Text style={styles.copy}>Never share a login code or password. Contacting support does not automatically recover an account or change its email.</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </View>
  </ProfileSettingsPage>;
}

const styles = StyleSheet.create({
  intro: {color:PALETTE.neutral,fontSize:15,lineHeight:23},
  section: {gap:8},
  heading: {color:PALETTE.text,fontWeight:'700',fontSize:17,lineHeight:25},
  copy: {color:PALETTE.neutral,fontSize:15,lineHeight:23},
  contact: {flexDirection:'row',alignItems:'center',gap:10,minHeight:48,paddingVertical:12},
  contactText: {color:PALETTE.primary,fontWeight:'700',fontSize:15,lineHeight:23,flex:1},
  dimmed: {opacity:0.6},
  error: {color:PALETTE.danger,fontSize:14,lineHeight:22},
});
