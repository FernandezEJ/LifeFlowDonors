import { LifeFlowColors as PALETTE } from '@/constants/theme';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

function imageIdentity(uri: string | null): string | null {
  if (!uri) return null;
  try {
    const url = new URL(uri);
    // R2 re-signs the same immutable upload on API refresh. Keep version/content query parameters.
    if (url.searchParams.get('X-Amz-Algorithm') !== 'AWS4-HMAC-SHA256' || !url.searchParams.has('X-Amz-Signature')) return uri;
    for (const key of ['Algorithm', 'Credential', 'Date', 'Expires', 'SignedHeaders', 'Signature', 'Security-Token']) {
      url.searchParams.delete(`X-Amz-${key}`);
    }
    return url.href;
  } catch {
    return uri;
  }
}

/** Dashboard covers stay uniform; details retain the original aspect ratio. */
export const AnnouncementImage = memo(function AnnouncementImage({ uri, title, preview = false, compact = false, label, fallbackText = 'No event image available' }: { uri: string | null; title: string; preview?: boolean; compact?: boolean; label?: string; fallbackText?: string }) {
  const [width, setWidth] = useState(0);
  const [size, setSize] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [request, setRequest] = useState({ uri, loaded: false, failed: false });
  let current = request;
  // Retain decoded previews across signature rotation, but always use a fresh URL before load/on failure.
  if (request.uri !== uri && (!preview || !request.loaded || imageIdentity(request.uri) !== imageIdentity(uri))) {
    current = { uri, loaded: false, failed: false };
    setRequest(current);
  }
  const source = useMemo(() => current.uri ? { uri: current.uri } : undefined, [current.uri]);
  const height = current.uri && !current.failed && width > 0 && size?.uri === current.uri
    ? width * size.height / size.width : 180;
  return <View style={[styles.container, preview ? compact ? styles.compactPreview : styles.preview : { height }]} onLayout={({ nativeEvent }) => {
    const measured = nativeEvent.layout.width;
    if (Number.isFinite(measured) && measured > 0) setWidth(measured);
  }}>
    {source && !current.failed ? <Image source={source} accessibilityLabel={label ?? `${title} event banner`}
      resizeMode={preview ? 'cover' : 'contain'} fadeDuration={preview ? 0 : undefined} style={styles.image}
      onError={() => setRequest(previous => previous.uri !== source.uri ? previous
        : uri !== source.uri ? { uri, loaded: false, failed: false } : { ...previous, loaded: false, failed: true })}
      onLoad={({ nativeEvent }) => {
        setRequest(previous => previous.uri === source.uri ? { ...previous, loaded: true, failed: false } : previous);
        const { width: imageWidth, height: imageHeight } = nativeEvent.source;
        // Tag measurements with the URL so late events never resize a different image.
        if (Number.isFinite(imageWidth) && imageWidth > 0 && Number.isFinite(imageHeight) && imageHeight > 0) {
          setSize({ uri: source.uri, width: imageWidth, height: imageHeight });
        }
      }} /> : <View style={styles.fallback}>
        <MaterialIcons name="image-not-supported" size={30} color={PALETTE.primary} accessible={false} />
        <Text style={styles.fallbackText}>{fallbackText}</Text>
      </View>}
  </View>;
});

const styles = StyleSheet.create({
  container: { width: '100%', overflow: 'hidden', borderRadius: 16, backgroundColor: PALETTE.surface },
  preview: { aspectRatio: 16 / 9 },
  compactPreview: { aspectRatio: 32 / 9 },
  image: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: PALETTE.neutralSurface },
  fallbackText: { color: PALETTE.neutralText, textAlign: 'center', fontSize: 13, flexShrink: 1 },
});
