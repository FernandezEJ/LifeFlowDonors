// Offline presentation checks; physical Android appearance still requires device QA.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { load, host, nodes, texts, flush, shared, native } = require('./flowie-test-boundaries.cjs');

let currentHost, resolveMotion, rejectMotion, writes = 0;
const appListeners = new Set(), motionListeners = new Set(), animations = [];
const react = {
  ...Object.fromEntries(['useEffect'].map(name => [name, (...args) => currentHost.react[name](...args)])),
  useState(initial) {
    const [value, update] = currentHost.react.useState(initial);
    return [value, next => { writes++;update(next); }];
  },
};
const nativeMocks = {
  ...native, StyleSheet: { create: value => value },
  AccessibilityInfo: {
    isReduceMotionEnabled: () => new Promise((resolve, reject) => { resolveMotion = resolve;rejectMotion = reject; }),
    addEventListener: (_, callback) => { motionListeners.add(callback);return { remove: () => motionListeners.delete(callback) }; },
  },
  AppState: { currentState: 'active', addEventListener: (_, callback) => { appListeners.add(callback);return { remove: () => appListeners.delete(callback) }; } },
  Easing: { linear: 'linear' },
  Animated: {
    View: 'Animated.View',
    Value: class { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate(options) { return options; } },
    timing: (value, options) => ({ value, options }),
    loop: timing => { const result = { timing, running: false, start() { this.running = true; }, stop() { this.running = false; } };animations.push(result);return result; },
  },
};
const { ProofSubmissionLoading } = load('src/components/proof-submission-loading.tsx', {
  ...shared, react, 'react-native': nativeMocks,
  '@expo/vector-icons/MaterialCommunityIcons': { __esModule: true, default: 'Icon' },
});
const find = (tree, type) => nodes(tree).find(node => node.type === type);
const appearance = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
const emit = (listeners, value) => { for (const callback of listeners) callback(value); };
const running = () => animations.filter(animation => animation.running).length;
function screen() {
  const owner = host();let phase = 'uploading';
  return {
    draw() { currentHost = owner;return owner.render(() => ProofSubmissionLoading({ phase })); },
    phase(value) { phase = value; },
    close() { owner.unmount(); },
  };
}
async function main() {
  let ui = screen(), tree = ui.draw();
  assert.equal(find(tree, 'Modal').props.animationType, 'none');assert.equal(find(tree, 'Modal').props.visible, true);
  const safe = find(tree, 'SafeAreaView');
  assert.equal(safe.props.edges.join(','), 'top,right,bottom,left');assert.equal(safe.props.accessibilityViewIsModal, true);
  assert.equal(safe.props.style.backgroundColor, '#FFF9F2');
  const scroll = find(tree, 'ScrollView');assert.equal(scroll.props.contentContainerStyle.flexGrow, 1);
  assert.equal(scroll.props.contentContainerStyle.justifyContent, 'center');assert.equal(scroll.props.contentContainerStyle.height, undefined);
  const content = scroll.props.children;
  assert.deepEqual(Array.from(content.props.children, node => node.type), ['Icon', 'View', 'Text'], 'Only static icon, one bar and one description');
  assert.equal(content.props.style.alignItems, 'center');
  const icon = find(tree, 'Icon');assert.equal(icon.props.name, 'send-outline');assert.equal(icon.props.color, '#892325');
  assert.equal(icon.props.accessibilityRole, 'image');assert.ok(icon.props.accessibilityLabel);
  const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json');
  assert.ok(glyphs[icon.props.name], 'The installed icon family contains the actual glyph');
  assert.equal(nodes(tree).filter(node => node.type === 'Animated.View').length, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'Text').length, 1);
  assert.ok(!nodes(tree).some(node => ['Image', 'ExpoImage', 'VideoView', 'Pressable', 'Spinner'].includes(node.type)));
  const bar = nodes(tree).find(node => node.props?.accessibilityRole === 'progressbar');
  assert.equal(bar.props.style.height, 5);assert.equal(bar.props.accessibilityValue.now, undefined);
  assert.equal(bar.props.accessibilityValue.max, undefined);assert.equal(bar.props.accessibilityState.busy, true);
  assert.equal(find(tree, 'Text').props.accessibilityLiveRegion, 'polite');
  assert.equal(find(tree, 'Text').props.numberOfLines, undefined);assert.equal(find(tree, 'Text').props.allowFontScaling, undefined);
  assert.deepEqual(Array.from(texts(tree)), ['Submitting your donation proof...']);
  bar.props.onLayout({ nativeEvent: { layout: { width: 272 } } });ui.draw();assert.equal(running(), 0, 'Stationary until motion preference is known');
  resolveMotion(false);await flush();tree = ui.draw();assert.equal(running(), 1);
  assert.equal(animations.at(-1).timing.options.isInteraction, false);assert.equal(animations.at(-1).timing.options.useNativeDriver, true);
  ui.phase('checking');tree = ui.draw();assert.deepEqual(Array.from(texts(tree)), ['Confirming your submission...']);
  assert.equal(running(), 1, 'Changing the description does not add another loader');
  assert.ok(!texts(tree).some(text => /100%|success|verified/i.test(text)));
  find(tree, 'Modal').props.onRequestClose();assert.ok(find(ui.draw(), 'Modal'), 'Android Back cannot dismiss an unfinished upload');
  assert.equal(find(tree, 'SafeAreaView').props.onAccessibilityEscape, undefined);
  emit(appListeners, 'background');tree = ui.draw();assert.equal(running(), 0);assert.equal(find(tree, 'Icon').props.name, 'send-outline');
  emit(appListeners, 'active');ui.draw();assert.equal(running(), 1);
  emit(motionListeners, true);tree = ui.draw();assert.equal(running(), 0);
  assert.ok(!appearance(find(tree, 'Animated.View').props.style).transform, 'Reduced motion preserves a stationary status bar');
  emit(motionListeners, false);ui.draw();assert.equal(running(), 1);
  ui.close();assert.equal(appListeners.size, 0);assert.equal(motionListeners.size, 0);assert.equal(running(), 0);
  ui = screen();ui.draw();emit(motionListeners, true);resolveMotion(false);await flush();tree = ui.draw();
  assert.ok(!appearance(find(tree, 'Animated.View').props.style).transform, 'Late preference read cannot override reduced motion');ui.close();
  ui = screen();ui.draw();rejectMotion(Error('Unavailable'));await flush();ui.draw();assert.equal(running(), 0);ui.close();
  ui = screen();ui.draw();ui.close();const before = writes;resolveMotion(false);await flush();assert.equal(writes, before);
  const source = fs.readFileSync('src/components/proof-submission-loading.tsx', 'utf8');
  assert.ok(!/expo-image|expo-video|require\(|\.gif|\.mp4|mascot|preview/i.test(source), 'No obsolete asset imports, playback or preview logic');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.ok(pkg.dependencies['expo-image'], 'Keep the shared image dependency');assert.equal(pkg.dependencies['expo-video'], undefined);
  console.log('PASS: static send-outline glyph, exact colors, single honest loader/description, safe-area scrolling, real-upload modal semantics, reduced motion/background/unmount cleanup and no image/video/preview infrastructure');
}
main().catch(error => { console.error(error);process.exitCode = 1; });
