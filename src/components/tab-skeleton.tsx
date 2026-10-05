import { StyleSheet, View } from 'react-native';

export function TabSkeleton({ variant = 'cards' }: { variant?: 'cards' | 'profile' | 'summary' }) {
  return <View accessibilityRole="progressbar" accessibilityLabel="Loading content" accessibilityState={{ busy: true }} style={styles.container}>
    <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <View style={[styles.block, { width: variant === 'profile' ? 88 : '55%', height: variant === 'profile' ? 88 : 22, alignSelf: variant === 'profile' ? 'center' : 'flex-start' }]} />
      <View style={[styles.block, { height: variant === 'summary' ? 130 : 160 }]} />
      {[1, 2, 3].map(key => <View key={key} style={styles.card}><View style={[styles.block, { width: '65%', height: 16 }]} /><View style={[styles.block, { width: '90%', height: 12 }]} /></View>)}
    </View>
  </View>;
}
const styles = StyleSheet.create({ container: { padding: 16, width: '100%' }, block: { borderRadius: 12, backgroundColor: '#EEE5DF', marginBottom: 14 }, card: { borderRadius: 18, backgroundColor: '#FFFFFF', padding: 18, marginBottom: 14 } });
