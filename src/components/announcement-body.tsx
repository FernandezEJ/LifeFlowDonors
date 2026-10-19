import { StyleSheet, Text, View } from 'react-native';
import type { AnnouncementDocument } from '@/services/donations';

// Never interpret HTML, URLs, or editor commands received from the API.
export function isAnnouncementDocument(value: unknown): value is AnnouncementDocument {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  let count = 0, length = 0, items = 0;
  const inline = (value: unknown) => Array.isArray(value) && value.every((run) => {
    if (!object(run) || typeof run.text !== 'string' || ++count > 1000) return false;
    length += run.text.length;
    return length <= 10000 && Object.keys(run).every((key) => ['text', 'bold', 'italic'].includes(key)) &&
      ['bold', 'italic'].every((key) => run[key] === undefined || typeof run[key] === 'boolean');
  });
  return object(value) && value.version === 1 && Object.keys(value).every((key) => ['version', 'blocks'].includes(key)) &&
    Array.isArray(value.blocks) && value.blocks.length <= 100 && value.blocks.every((block: unknown) => object(block) &&
      (block.type === 'paragraph' ? Object.keys(block).every((key) => ['type', 'content'].includes(key)) && inline(block.content) :
        ['bullet_list', 'ordered_list'].includes(String(block.type)) && Object.keys(block).every((key) => ['type', 'items'].includes(key)) &&
        Array.isArray(block.items) && block.items.length > 0 && block.items.every((content: unknown) => ++items <= 100 && inline(content))));
}

export function AnnouncementBody({ description, document }: { description: string; document?: AnnouncementDocument | null }) {
  if (!isAnnouncementDocument(document)) return <Text style={[styles.text, styles.legacy]}>{description}</Text>;
  const inline = (content: { text: string; bold?: boolean; italic?: boolean }[]) => content.map((run, index) =>
    <Text key={index} style={[run.bold && styles.bold, run.italic && styles.italic]}>{run.text}</Text>);
  return <View style={styles.body}>{document.blocks.map((block, index) => block.type === 'paragraph' ?
    <Text key={index} style={styles.text}>{inline(block.content)}</Text> :
    <View key={index} style={styles.list}>{block.items.map((content, item) => <View key={item} style={styles.row}>
      <Text accessible={false} style={[styles.text, styles.marker]}>{block.type === 'ordered_list' ? `${item + 1}.` : '•'}</Text>
      <Text style={[styles.text, styles.item]}>{inline(content)}</Text>
    </View>)}</View>)}</View>;
}

const styles = StyleSheet.create({
  body: { gap: 12, marginTop: 8 },
  legacy: { marginTop: 8 },
  text: { color: '#766A68', fontSize: 14, lineHeight: 21 },
  bold: { fontWeight: '700' }, italic: { fontStyle: 'italic' },
  list: { gap: 5, paddingLeft: 8 }, row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  marker: { minWidth: 20 }, item: { flex: 1, flexShrink: 1 },
});
