// Offline demó építése: a platform kódja + a localStorage-os Supabase-utánzat egy HTML-fájlban
import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
const WEB = '/home/claude/kgy-platform/web';
const DEMO = '/home/claude/kgy-demo';
const SRC = '/tmp/demobuild/src';
fs.rmSync(SRC, { recursive: true, force: true });
fs.cpSync(WEB, SRC, { recursive: true });
for (const f of ['mock-supabase.js', 'demo-entry.js']) fs.copyFileSync(path.join(DEMO, f), path.join(SRC, f));
fs.writeFileSync(path.join(SRC, 'config.js'), "export const SUPABASE_URL = 'https://demo.local';\nexport const SUPABASE_ANON_KEY = 'demo';\n");
const alias = { name: 'alias', setup(b) {
  b.onResolve({ filter: /^https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase/ }, () => ({ path: path.join(SRC, 'mock-supabase.js') }));
}};
const r = await esbuild.build({ entryPoints: [path.join(SRC, 'demo-entry.js')], bundle: true, format: 'iife', write: false, target: 'es2020', plugins: [alias] });
const js = r.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const fontsCss = fs.readFileSync(path.join(SRC, 'fonts.css'), 'utf8').replace(/url\(fonts\/([^)]+)\)/g, (_, f) =>
  `url(data:font/woff2;base64,${fs.readFileSync(path.join(SRC, 'fonts', f)).toString('base64')})`);
const css = fontsCss + '\n' + fs.readFileSync(path.join(SRC, 'style.css'), 'utf8') + '\n' + fs.readFileSync(path.join(DEMO, 'demo.css'), 'utf8');
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const logoUri = 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, 'logo.png')).toString('base64');
html = html.replace(/\s*<link rel="preload"[^>]*>/g, '').replace('src="logo.png"', () => `src="${logoUri}"`).replace(/\s*<link rel="stylesheet" href="fonts.css">/, '').replace('<link rel="stylesheet" href="style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="app.js"></script>', () => `<script>\n${js}\n</script>`)
  .replace('<title>Kilométerekkel a Gyerekekért III</title>', '<title>DEMÓ – Kilométerekkel a Gyerekekért III</title>');
fs.writeFileSync(path.join(DEMO, 'KGY-platform-DEMO.html'), html);
console.log('ok', (html.length / 1024).toFixed(0) + ' KB');
