// Offline component/route checks: no network, build, export, or file generation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const jsx = (type, props, key) => ({ type, props: props || {}, key });
const native = Object.fromEntries(['Image', 'Pressable', 'ScrollView', 'Text', 'View'].map(name => [name, name]));
native.StyleSheet = { create: value => value };
let dimensions = { width: 360, height: 720, fontScale: 1 };
native.useWindowDimensions = () => dimensions;
const routes = [];
const instances = new Map();
let active;
const react = {
  useState(initial) {
    const index = active.cursor++, instance = active;
    if (!(index in instance.slots)) instance.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [instance.slots[index], next => {
      instance.slots[index] = typeof next === 'function' ? next(instance.slots[index]) : next;
    }];
  },
};
function load(file, extra = {}) {
  const module = { exports: {} };
  const imports = {
    'react/jsx-runtime': { jsx, jsxs: jsx }, react, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    'expo-router': { useRouter: () => ({ push: route => routes.push(route) }) },
    '@/constants/theme': { LifeFlowColors: {} }, ...extra,
  };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, {
    module, exports: module.exports,
    require(name) {
      if (name.endsWith('.png')) return name;
      assert.ok(name in imports, `Unexpected import ${name}`);
      return imports[name];
    },
  }, { filename: file });
  return module.exports;
}
function render(node, path = 'root') {
  if (Array.isArray(node)) return node.map((item, index) => render(item, `${path}:${index}`));
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') {
    const id = `${path}:${node.key ?? ''}`;
    if (!instances.has(id)) instances.set(id, { slots: [] });
    active = instances.get(id); active.cursor = 0;
    return render(node.type(node.props), `${id}:child`);
  }
  return { ...node, props: { ...node.props, children: render(node.props.children, `${path}:children`) } };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return tree && typeof tree === 'object' ? [tree, ...nodes(tree.props?.children)] : [];
}
const shared = load('src/components/onboarding-screen.tsx');
const screens = [1, 2].map(page => load(`src/app/(auth)/onboarding${page}.tsx`, {
  '@/components/onboarding-screen': shared,
}).default);
const welcome = load('src/app/(auth)/welcome.tsx').default;
const welcomeTree = render(jsx(welcome));
const welcomeButtons = nodes(welcomeTree).filter(node => node.type === 'Pressable');
assert.equal(welcomeButtons.length, 2);
welcomeButtons[0].props.onPress(); assert.equal(routes.at(-1), '/(auth)/onboarding1');
welcomeButtons[1].props.onPress(); assert.equal(routes.at(-1), '/(auth)/login');
assert.ok(nodes(welcomeTree).some(node => node.type === 'Text' && node.props.children === 'Already have an account?'));

const bandNodes = tree => nodes(tree).filter(node => node.props.style && Object.keys(node.props.style).length === 1 && 'minHeight' in node.props.style);
let layouts = 0;
for (const [width, height, fontScale] of [[320, 568, 1], [360, 720, 1], [440, 900, 1], [320, 568, 2], [360, 640, 3], [720, 320, 2]]) {
  dimensions = { width, height, fontScale };
  const results = [];
  for (const [index, Screen] of screens.entries()) {
    instances.clear();
    const draw = () => render(jsx(Screen));
    let tree = draw();
    assert.equal(tree.type, 'SafeAreaView');
    const scroll = nodes(tree).find(node => node.type === 'ScrollView');
    assert.equal(scroll.props.scrollEnabled, undefined);
    assert.equal(scroll.props.contentContainerStyle.flexGrow, 1);
    assert.equal(scroll.props.contentContainerStyle.justifyContent, 'center');
    assert.equal(scroll.props.contentContainerStyle.height, undefined);
    const image = nodes(tree).find(node => node.type === 'Image');
    assert.ok(image.props.source.endsWith(index === 0 ? 'GreetMascot.png' : 'GoodMascot.png'));
    assert.equal(image.props.resizeMode, 'contain');
    assert.equal(image.props.style.width, image.props.style.height);
    assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === `Page ${index + 1} of 2` && node.props.accessible));
    const layers = nodes(tree).filter(node => node.props.importantForAccessibility === 'no-hide-descendants');
    assert.equal(layers.length, 3);
    const expected = [];
    for (const [band, layer] of layers.entries()) {
      assert.equal(layer.props.pointerEvents, 'none');
      assert.equal(layer.props.accessibilityElementsHidden, true);
      assert.equal(layer.props.style.opacity, 0);
      assert.equal(layer.props.style.position, 'absolute');
      const texts = nodes(layer).filter(node => node.type === 'Text');
      assert.equal(texts.length, 2);
      const available = Math.min(width - 48, band === 1 ? 350 : 440) - (band === 2 ? 32 : 0);
      const heights = texts.map(text => {
        const style = text.props.style;
        // Simulate different native wrapping results and accessibility scaling.
        const lines = Math.ceil(text.props.children.length * style.fontSize * fontScale * 0.55 / available);
        return lines * (style.lineHeight || style.fontSize * 1.3) * fontScale;
      });
      // Native layout callbacks can arrive out of order.
      texts[1].props.onLayout({ nativeEvent: { layout: { height: heights[1] } } });
      assert.ok(bandNodes(draw()).every(node => Number.isFinite(node.props.style.minHeight)));
      texts[0].props.onLayout({ nativeEvent: { layout: { height: heights[0] } } });
      expected.push(Math.ceil(Math.max(...heights)));
    }
    tree = draw();
    assert.deepEqual(bandNodes(tree).map(node => node.props.style.minHeight), expected);
    for (const text of nodes(tree).filter(node => node.type === 'Text')) {
      assert.equal(text.props.numberOfLines, undefined, 'No text truncation');
      assert.equal(text.props.allowFontScaling, undefined, 'Respect system text scaling');
      assert.equal(text.props.maxFontSizeMultiplier, undefined, 'No accessibility scaling cap');
      assert.equal(text.props.style.height, undefined);
      assert.ok(!/Already have an account|^Login$/.test(text.props.children));
    }
    const buttons = nodes(tree).filter(node => node.type === 'Pressable');
    assert.equal(buttons.length, 1);
    const button = buttons[0];
    assert.equal(button.props.accessibilityRole, 'button');
    assert.equal(button.props.accessibilityLabel, index ? 'Create Account' : 'Next');
    button.props.onPress(); assert.equal(routes.at(-1), index ? '/(auth)/register' : '/(auth)/onboarding2');
    const buttonStyle = button.props.style({ pressed: false })[0];
    assert.ok(buttonStyle.minHeight >= 48);
    assert.equal(buttonStyle.position, undefined, 'CTA remains in scroll flow');
    results.push({ bands: expected, mascot: image.props.style, buttonStyle });
    dimensions = { ...dimensions, width: width + 1, fontScale: fontScale + 0.1 };
    assert.ok(bandNodes(draw()).every(node => node.props.style.minHeight === 0), 'Discard stale measurements after viewport/font changes');
    dimensions = { width, height, fontScale };
  }
  assert.deepEqual(results[0], results[1], 'Both slides reserve identical text, mascot and CTA bands');
  layouts++;
}
console.log(`PASS: ${layouts} paired viewport/font-scale cases, measured band alignment, accessibility, scrolling structure, original mascots, real onboarding and Welcome Login route callbacks`);
