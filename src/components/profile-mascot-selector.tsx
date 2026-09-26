import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '@/contexts/auth-context';
import { errorMessage } from '@/services/api';
import { PROFILE_MASCOTS, profileMascotKey, type ProfileMascotKey } from '@/constants/profile-settings';

// ========================================
// PERSISTED MASCOT SELECTOR
// Selection is a draft until Laravel confirms Save.
// Focus/retry reload the saved choice; no image paths leave this screen.
// ========================================
export function ProfileMascotSelector() {
  const { profile, loadProfile, saveAvatar, busy } = useAuth();
  const [draft, setDraft] = useState<ProfileMascotKey | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  const savingLock = useRef(false);
  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setLoadError(''); setDraft(null); setSaved(false);
    try { await loadProfile(); }
    catch (error) { if (version === generation.current) setLoadError(errorMessage(error)); }
    finally { if (version === generation.current) setLoading(false); }
  }, [loadProfile]);
  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { generation.current++; };
  }, [refresh]));
  const current = profileMascotKey(profile?.profile_avatar);
  const selected = draft ?? current;
  const disabled = loading || !!loadError || !profile || busy || saving;
  const save = async () => {
    if (disabled || savingLock.current || selected === current) return;
    savingLock.current = true; setSaving(true); setSaveError(''); setSaved(false);
    const version = generation.current;
    try {
      await saveAvatar(selected);
      if (version === generation.current) { setDraft(null); setSaved(true); }
    } catch (error) {
      if (version === generation.current) {
        setSaveError(errorMessage(error));
        // An interrupted response may have committed. Reconcile before another save.
        await refresh();
      }
    } finally { savingLock.current = false; setSaving(false); }
  };
  return <View style={styles.content}>
    <Text accessibilityRole="header" style={styles.title}>Choose your LifeFlow mascot</Text>
    <Text style={styles.note}>Temporary preview: final mascot artwork will be added later.</Text>
    {loading ? <ActivityIndicator color="#D93A3A" /> : null}
    {loadError ? <><Text accessibilityRole="alert" style={styles.error}>{loadError}</Text>
      <Pressable accessibilityRole="button" onPress={() => void refresh()} style={styles.button}><Text style={styles.buttonText}>Retry loading avatars</Text></Pressable></> : null}
    <View style={styles.grid}>
      {(Object.keys(PROFILE_MASCOTS) as ProfileMascotKey[]).map((key, index) => <Pressable key={key}
        accessibilityRole="radio" accessibilityLabel={`Mascot ${index + 1}`}
        accessibilityState={{ checked: selected === key, disabled }} disabled={disabled}
        onPress={() => { setDraft(key); setSaved(false); setSaveError(''); }}
        style={[styles.choice, selected === key && styles.selected, disabled && { opacity: 0.6 }]}>
        <Image source={PROFILE_MASCOTS[key]} resizeMode="contain" style={styles.image} />
        <Text style={styles.label}>Mascot {index + 1}</Text>
        <Text style={styles.note}>{selected === key ? 'Selected' : 'Choose'}</Text>
      </Pressable>)}
    </View>
    {saveError ? <Text accessibilityRole="alert" style={styles.error}>{saveError}</Text> : null}
    {saved ? <Text accessibilityRole="alert" style={styles.label}>Avatar saved.</Text> : null}
    <Pressable accessibilityRole="button" disabled={disabled || selected === current} onPress={() => void save()}
      style={[styles.button, (disabled || selected === current) && { opacity: 0.5 }]}>
      <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Avatar'}</Text>
    </Pressable>
  </View>;
}
const styles = StyleSheet.create({
  content: { gap: 16 },
  title: { color: '#372E2E', fontSize: 18, fontWeight: '700' },
  note: { color: '#766A68', fontSize: 12, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 },
  choice: { width: '47%', minHeight: 138, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 10, borderWidth: 2, borderColor: '#F0E2DC', borderRadius: 16, backgroundColor: '#FFFFFF' },
  selected: { borderColor: '#D93A3A', backgroundColor: '#FDE8E8' },
  image: { width: 80, height: 80 },
  label: { color: '#372E2E', fontSize: 14, fontWeight: '700' },
  error: { color: '#B42318', fontSize: 13 },
  button: { minHeight: 50, alignItems: 'center', justifyContent: 'center', padding: 12, borderRadius: 14, backgroundColor: '#D93A3A' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
