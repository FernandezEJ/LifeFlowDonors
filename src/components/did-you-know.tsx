import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { AppState, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LifeFlowColors as COLORS } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { ApiError, errorMessage } from '@/services/api';
import { publishedArticle, type EducationalArticle, type EducationalPage } from '@/services/educational-articles';
import { publicImageUrl } from '@/services/announcement-presentation';
import { AnnouncementImage } from './announcement-image';
import { AnnouncementBody } from './announcement-body';
import { LoadError } from './load-state';
import { TabSkeleton } from './tab-skeleton';

export function DidYouKnow() {
  const { user, educationalArticles, educationalArticle } = useAuth();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(420, Math.max(220, width - 72));
  const [carouselWidth, setCarouselWidth] = useState(Math.min(560, width-40));
  const generation = useRef(0), listPending = useRef<number|null>(null), retryPage = useRef(1);
  const [stored, setStored] = useState<{ owner?: number; page: EducationalPage }|null>(null);
  const page = stored?.owner === user?.id ? stored?.page : null;
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [index, setIndex] = useState(0);
  const selectedRef = useRef<number|null>(null), detailVersion = useRef(0), detailPending = useRef<number|null>(null);
  const [selected, setSelected] = useState<number|null>(null), [detail, setDetail] = useState<EducationalArticle|null>(null);
  const [detailLoading, setDetailLoading] = useState(false), [detailError, setDetailError] = useState('');
  const close = () => { selectedRef.current = null;detailVersion.current++;setSelected(null);setDetail(null);setDetailError('');setDetailLoading(false); };
  const loadDetail = useCallback(async (id: number) => {
    if (detailPending.current === detailVersion.current) return;
    const version = ++detailVersion.current;detailPending.current = version;
    setDetailLoading(true);setDetailError('');
    try {
      const result = await educationalArticle(id);
      if (version !== detailVersion.current || selectedRef.current !== id) return;
      if (!publishedArticle(result.article) || result.article.id !== id) throw new ApiError('This article is no longer available.', 404);
      setDetail(result.article);
    } catch (cause) {
      if (version !== detailVersion.current || selectedRef.current !== id) return;
      if (cause instanceof ApiError && [401,403,404,410].includes(cause.status)) {
        setDetail(null);
        setStored(previous => previous ? { ...previous, page: { ...previous.page, data: previous.page.data.filter(item => item.id !== id) } } : null);
        setDetailError('This article is no longer available.');
      } else setDetailError(errorMessage(cause));
    } finally {
      if (detailPending.current === version) detailPending.current = null;
      if (version === detailVersion.current) setDetailLoading(false);
    }
  }, [educationalArticle]);
  const load = useCallback(async (number=1) => {
    if (listPending.current === generation.current) return;
    const version = ++generation.current;listPending.current = version;retryPage.current = number;
    setLoading(true);setError('');
    try {
      const result = await educationalArticles(number);
      if (version !== generation.current) return;
      const rows = result.data.filter(publishedArticle);
      setStored(previous => {
        const existing = number > 1 && previous && previous.owner === user?.id ? previous.page.data : [];
        const data = [...new Map([...existing,...rows].map(item => [item.id,item])).values()];
        return { owner: user?.id, page: { ...result, data } };
      });
    } catch (cause) {
      if (version !== generation.current) return;
      if (cause instanceof ApiError && [401,403].includes(cause.status)) setStored(null);
      setError(errorMessage(cause));
    } finally {
      if (listPending.current === version) listPending.current = null;
      if (version === generation.current) setLoading(false);
    }
  }, [educationalArticles, user?.id]);
  useFocusEffect(useCallback(() => {
    const refresh = () => { void load();if (selectedRef.current !== null) void loadDetail(selectedRef.current); };
    refresh();
    const timer = setInterval(refresh, 30000);
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { generation.current++;detailVersion.current++;clearInterval(timer);foreground.remove(); };
  }, [load, loadDetail]));
  const open = (article: EducationalArticle) => {
    if (selectedRef.current !== null || !publishedArticle(article)) return;
    selectedRef.current = article.id;setSelected(article.id);setDetail(null);setDetailError('');void loadDetail(article.id);
  };
  const items = page?.data ?? [];
  const activeIndex = Math.max(0, Math.min(items.length-1, index));
  const dotStart = Math.max(0, Math.min(activeIndex-2, items.length-5));
  if (page && items.length === 0 && !error && selected === null) return null;
  return <View style={styles.section}>
    <Text accessibilityRole="header" style={styles.heading}>Did You Know?</Text>
    {error ? <LoadError message={error} subject="educational articles" loading={loading} onRetry={() => load(retryPage.current)} /> : null}
    {!page && loading ? <TabSkeleton variant="announcement" label="Loading educational articles" /> : null}
    {items.length ? <>
      <FlatList horizontal data={items} keyExtractor={item => String(item.id)} accessibilityLabel="Educational articles carousel"
        showsHorizontalScrollIndicator={false} snapToInterval={cardWidth+12} snapToAlignment="start" decelerationRate="fast" disableIntervalMomentum
        onLayout={event => { const measured=event.nativeEvent.layout.width;if(measured>0)setCarouselWidth(measured); }}
        contentContainerStyle={[styles.carousel,{paddingRight:Math.max(0,carouselWidth-cardWidth)}]} scrollEventThrottle={16}
        onScroll={event => setIndex(Math.max(0,Math.min(items.length-1,Math.round(event.nativeEvent.contentOffset.x/(cardWidth+12)))))}
        onEndReachedThreshold={0.5} onEndReached={() => { if (!loading && !error && page && page.meta.current_page<page.meta.last_page) void load(page.meta.current_page+1); }}
        renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={`Read article: ${item.title}`} onPress={() => open(item)} style={({pressed}) => [styles.card,{width:cardWidth},pressed && styles.pressed]}>
          <AnnouncementImage uri={publicImageUrl(item.image_url,'education')} title={item.title} label={`${item.title} article cover`} fallbackText="No article image available" preview />
          <View style={styles.cardBody}><View style={styles.row}><Text style={styles.category}>{item.category_label}</Text><MaterialIcons name="chevron-right" size={22} color={COLORS.primary} accessible={false} /></View>
            <Text style={styles.title}>{item.title}</Text><Text style={styles.description} numberOfLines={3}>{item.short_description}</Text></View>
        </Pressable>} />
      {items.length>1 ? <View accessible accessibilityRole="text" accessibilityLabel={`Article ${activeIndex+1} of ${items.length}`} style={styles.pagination}>
        {Array.from({length:Math.min(5,items.length)},(_,offset) => <View key={dotStart+offset} accessible={false} style={[styles.dot,dotStart+offset===activeIndex && styles.activeDot]} />)}
      </View> : null}
    </> : null}
    <Modal visible={selected!==null} transparent animationType="slide" onRequestClose={close}>
      <SafeAreaView edges={['top','bottom']} style={styles.overlay}>
        <Pressable accessible={false} style={styles.backdrop} onPress={close} />
        <View accessibilityViewIsModal onAccessibilityEscape={close} style={styles.sheet}>
          <View style={styles.sheetHeader}><Text accessibilityRole="header" style={styles.heading}>Did You Know?</Text><Pressable accessibilityRole="button" accessibilityLabel="Close article" onPress={close} style={styles.control}><MaterialIcons name="close" size={24} color={COLORS.primary} /></Pressable></View>
          <ScrollView style={styles.sheetScroll} contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
            {detailError ? <LoadError message={detailError} subject="article" loading={detailLoading} onRetry={() => selected !== null ? loadDetail(selected) : undefined} /> : null}
            {detailLoading && !detail ? <TabSkeleton variant="detail" label="Loading educational article" /> : detail && publishedArticle(detail) ? <>
              <AnnouncementImage uri={publicImageUrl(detail.image_url,'education')} title={detail.title} label={`${detail.title} article cover`} fallbackText="No article image available" />
              <Text style={styles.category}>{detail.category_label}</Text><Text accessibilityRole="header" style={styles.sheetTitle}>{detail.title}</Text><Text style={styles.description}>{detail.short_description}</Text>
              <AnnouncementBody description={detail.description} document={detail.description_document} />
              <Text style={styles.caption}>Educational information only. Final donation eligibility is determined by the donation facility.</Text>
            </> : null}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  backdrop:{position:'absolute',top:0,bottom:0,left:0,right:0},
  section:{gap:14},heading:{color:COLORS.text,fontSize:20,fontWeight:'800'},carousel:{gap:12},card:{overflow:'hidden',borderRadius:20,borderWidth:1,borderColor:COLORS.border,backgroundColor:COLORS.surface},cardBody:{padding:14,gap:8},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},category:{color:COLORS.primary,fontSize:13,fontWeight:'700',flexShrink:1},title:{color:COLORS.text,fontSize:17,lineHeight:23,fontWeight:'700'},description:{color:COLORS.neutralText,fontSize:14,lineHeight:21},pressed:{opacity:0.75},pagination:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:6,minHeight:16},dot:{width:6,height:6,borderRadius:3,backgroundColor:COLORS.pastelPink},activeDot:{width:20,backgroundColor:COLORS.primary},control:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',paddingHorizontal:8},caption:{color:COLORS.neutralText,fontSize:12,lineHeight:19},overlay:{flex:1,justifyContent:'flex-end',backgroundColor:COLORS.backdrop},sheet:{width:'100%',maxWidth:620,maxHeight:'90%',alignSelf:'center',backgroundColor:COLORS.cream,borderTopLeftRadius:24,borderTopRightRadius:24,overflow:'hidden'},sheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,paddingHorizontal:20,paddingTop:8,},sheetScroll:{flexGrow:0,flexShrink:1},sheetBody:{padding:20,gap:14,paddingBottom:32},sheetTitle:{color:COLORS.text,fontSize:23,lineHeight:30,fontWeight:'800'},
});
