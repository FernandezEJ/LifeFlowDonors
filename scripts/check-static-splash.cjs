// Offline validation only: no native build, export, API calls, or file generation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const config = JSON.parse(fs.readFileSync('app.json', 'utf8')).expo;
const splash = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen')[1];
assert.equal(splash.image, './assets/images/splash-lockup.png');
assert.equal(splash.imageWidth, 200);
assert.equal(splash.resizeMode, 'contain');
assert.equal(splash.backgroundColor, '#FFF9F2');
assert.deepEqual(splash.dark, { image: splash.image, backgroundColor: '#FFF9F2' });
assert.equal(config.icon, './assets/images/icon.png');
assert.deepEqual(config.android.adaptiveIcon, { backgroundColor: '#FFF9F2', foregroundImage: './assets/images/android-icon-foreground.png',
  backgroundImage: './assets/images/android-icon-background.png', monochromeImage: './assets/images/android-icon-monochrome.png' });
assert.equal(config.web.favicon, config.icon);
const notifications = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === 'expo-notifications')[1];
assert.deepEqual(notifications, { defaultChannel: 'important', icon: './assets/images/notification-icon.png', color: '#892325' });
assert.equal(config.userInterfaceStyle, 'automatic', 'Only the splash overrides dark appearance');

const images = new Set();
function collectImages(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    if (['icon', 'image', 'foregroundImage', 'backgroundImage', 'monochromeImage', 'favicon'].includes(key) && typeof entry === 'string') images.add(entry);
    else collectImages(entry);
  }
}
collectImages(config);
for (const image of images) {
  let directory = process.cwd();
  for (const part of image.replace(/^\.\//, '').split('/')) {
    assert.ok(fs.readdirSync(directory).includes(part), `Exact asset filename casing: ${image}`);
    directory = path.join(directory, part);
  }
  assert.ok(fs.statSync(directory).isFile());
}
const png = fs.readFileSync(splash.image);
assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(png.readUInt32BE(16), 1024);assert.equal(png.readUInt32BE(20), 1024);
assert.equal(png[25], 6, 'RGBA PNG retains transparent padding');
const chunks = [];
for (let offset = 8; offset < png.length;) {
  const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8);
  chunks.push(type);offset += length + 12;assert.ok(offset <= png.length);
}
assert.equal(chunks.at(-1), 'IEND');assert.ok(!chunks.includes('acTL'), 'Splash is static, not an animated PNG');

const options = [];
const unexpected = () => { throw new Error('Splash setup must not hold/hide the screen, start timers, or perform navigation'); };
const mocks = {
  'react/jsx-runtime': {}, '@/constants/theme': { LifeFlowColors: {} }, '@/contexts/notification-context': {},
  'expo-router': {}, 'expo-router/react-navigation': { DefaultTheme: { colors: {} }, DarkTheme: {} },
  'react-native': {}, 'react-native-safe-area-context': {}, '@/contexts/auth-context': {}, 'expo-status-bar': {}, '@/hooks/use-color-scheme': {},
  'expo-splash-screen': { setOptions: value => options.push(JSON.parse(JSON.stringify(value))), preventAutoHideAsync: unexpected, hideAsync: unexpected, hide: unexpected },
};
const source = fs.readFileSync('src/app/_layout.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const moduleState = { exports: {} };
vm.runInNewContext(compiled, { module: moduleState, exports: moduleState.exports, setTimeout: unexpected, setInterval: unexpected,
  require(name) { assert.ok(name in mocks, `Expected startup import: ${name}`);return mocks[name]; },
});
assert.deepEqual(options, [{ fade: false, duration: 0 }], 'The existing native fade is disabled without changing readiness');
assert.equal(typeof moduleState.exports.default, 'function');
assert.ok(source.includes('Stack.Protected guard={!user}') && source.includes('Stack.Protected guard={!!user}'));
const landing = fs.readFileSync('src/app/index.tsx', 'utf8');
assert.ok(landing.includes("user ? '/(tabs)' : '/(auth)/welcome'"));
console.log(`PASS: static 1024x1024 RGBA lockup, ${images.size} exact-case image paths, light/dark Floral White, approved launcher wiring, zero-duration native exit and preserved routing guards`);

// Decode real PNG alpha; headers alone cannot detect an opaque notification icon.
(async () => {
  const Jimp = require('jimp-compact');
  for (const name of ['icon.png', 'android-icon-foreground.png', 'android-icon-background.png', 'android-icon-monochrome.png']) {
    const image = await Jimp.read('assets/images/' + name);
    assert.equal(image.bitmap.width, 1024);assert.equal(image.bitmap.height, 1024);
    const corners = [[0,0],[1023,0],[0,1023],[1023,1023]].map(([x,y]) => Jimp.intToRGBA(image.getPixelColor(x,y)));
    if (name === 'icon.png' || name === 'android-icon-background.png') {
      assert.ok(corners.every(({r,g,b,a}) => r===255 && g===249 && b===242 && a===255), name + ': approved Floral White');
    } else assert.ok(corners.every(({a}) => a===0), name + ': transparent corners');
  }
  const small = await Jimp.read(notifications.icon);let visible=0,transparent=0;
  assert.equal(small.bitmap.width,96);assert.equal(small.bitmap.height,96);
  small.scan(0,0,96,96,function(x,y,i){const [r,g,b,a]=this.bitmap.data.subarray(i,i+4);
    if(a){visible++;assert.equal(r,255);assert.equal(g,255);assert.equal(b,255);assert.ok(x>=10 && x<86 && y>=10 && y<86);}
    else transparent++;
  });
  assert.ok(visible>1000 && transparent>3000,'Recognizable white glyph with transparent padding');
  console.log('PASS: four final 1024px assets, Floral White/transparent corners, 96px all-white alpha notification icon, unchanged important channel and brand tint; no native build required');
})().catch(error=>{console.error(error);process.exitCode=1;});
