// Small deterministic React/native boundaries. These checks execute production handlers without a device or Groq calls.
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const jsx = (type, props) => ({ type, props });
function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, require: name => {
    if (name.endsWith('.png')) return name;
    if (!(name in imports)) throw Error('Unexpected import: ' + name);
    return imports[name];
  }, setInterval: () => 0, clearInterval() {}, ...globals }, { filename: file });
  return module.exports;
}
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value) ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const texts = tree => nodes(tree).filter(n => n.type === 'Text').flatMap(n => n.props.children);
const native = { View: 'View', Text: 'Text', Image: 'Image', Pressable: 'Pressable', TextInput: 'TextInput', FlatList: 'FlatList', Modal: 'Modal',
  ActivityIndicator: 'Spinner', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'android' }, StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 360 }) };
const shared = { 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'Fragment' }, 'react-native': native,
  '@expo/vector-icons/MaterialIcons': { __esModule: true, default: 'Icon' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
  'expo-router/head': { __esModule: true, default: 'Head' }, '@/components/tab-skeleton': { TabSkeleton: 'TabSkeleton' } };
const flush = async () => { for (let i = 0; i < 40; i++) await Promise.resolve(); };
function host() {
  const slots = [], queued = [], focuses = new Set(); let cursor = 0, focused = true;
  const effect = (fn, deps = []) => {
    const i = cursor++, old = slots[i];
    if (!old || deps.some((d, j) => d !== old.deps[j])) {
      slots[i] = { deps, cleanup: old?.cleanup }; queued.push(() => { slots[i].cleanup?.(); slots[i].cleanup = fn(); });
    }
  };
  const react = {
    useState: initial => { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef: initial => { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback: (fn, deps) => { const i = cursor++, old = slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) slots[i] = { deps, fn }; return slots[i].fn; },
    useEffect: effect,
  };
  const focus = fn => effect(() => { const entry = { fn, cleanup: focused ? fn() : null }; focuses.add(entry); return () => { entry.cleanup?.(); focuses.delete(entry); }; }, [fn]);
  return { react, focus, render: fn => { cursor = 0; const result = fn(); while (queued.length) queued.shift()(); return result; },
    blur: () => { focused = false; for (const item of focuses) { item.cleanup?.(); item.cleanup = null; } },
    refocus: () => { focused = true; for (const item of focuses) item.cleanup = item.fn(); },
    unmount: () => slots.forEach(s => s?.cleanup?.()) };
}
module.exports = { load, nodes, texts, native, shared, host, flush };
