// ACM Docs for Android: a signed .apk, without Gradle (aapt2 + javac + d8 + apksigner). Runs on Windows or Linux.
//   node build/build-android.mjs
// Android SDK: ANDROID_HOME (default: the place Android Studio uses). Signing key: ACM_ANDROID_KEY=<folder with
// acmdocs-release.jks and parola.txt>, default Downloads/ACM Docs/cheie-android (NU STERGE). Without it: an unsigned .apk.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const [a, b, c] = VERSION.split('.').map(Number);
const CODE = a * 10000 + b * 100 + c; // 2.0.0 -> 20000
const win = process.platform === 'win32';

const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (win ? path.join(os.homedir(), 'AppData/Local/Android/Sdk') : '/usr/lib/android-sdk');
const newest = (dir) => fs.readdirSync(dir).filter((x) => /^\d/.test(x)).sort((x, y) => x.localeCompare(y, undefined, { numeric: true })).pop();
const TOOLS = path.join(SDK, 'build-tools', newest(path.join(SDK, 'build-tools')));
const AJ = path.join(SDK, 'platforms', 'android-34', 'android.jar');
const tool = (n, ext) => path.join(TOOLS, win ? n + ext : n);
// (a .bat runs through the shell on Windows, so paths with spaces need their quotes)
const run = (cmd, args, opts = {}) => {
  const shell = win && /\.bat$/.test(cmd);
  return execFileSync(cmd, shell ? args.map((x) => (/[\s()]/.test(x) ? `"${x}"` : x)) : args, { stdio: 'inherit', shell, ...opts });
};

const OUT = path.join(ROOT, 'dist', 'android');
const W = path.join(OUT, 'work');
fs.rmSync(W, { recursive: true, force: true });
for (const d of ['assets/www', 'cls', 'gen']) fs.mkdirSync(path.join(W, d), { recursive: true });

console.log('== web app');
fs.cpSync(path.join(ROOT, 'app'), path.join(W, 'assets/www'), { recursive: true });
fs.rmSync(path.join(W, 'assets/www/assets/legacy-logo.jpg'), { force: true });
fs.cpSync(path.join(ROOT, 'build/fonts'), path.join(W, 'assets/www/fonts'), { recursive: true });

console.log('== resources');
run(tool('aapt2', '.exe'), ['compile', '--dir', path.join(ROOT, 'android/res'), '-o', path.join(W, 'res.zip')]);
run(tool('aapt2', '.exe'), ['link', '-o', path.join(W, 'base.apk'), '-I', AJ, '--manifest', path.join(ROOT, 'android/AndroidManifest.xml'),
  '--min-sdk-version', '21', '--target-sdk-version', '34', '--version-code', String(CODE), '--version-name', VERSION,
  '-A', path.join(W, 'assets'), '--java', path.join(W, 'gen'), path.join(W, 'res.zip')]);

console.log('== code');
const sources = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.java')) sources.push(p); } };
walk(path.join(ROOT, 'android/src'));
walk(path.join(W, 'gen'));
run('javac', ['-source', '8', '-target', '8', '-bootclasspath', AJ, '-nowarn', '-Xlint:-options', '-encoding', 'UTF-8', '-d', path.join(W, 'cls'), ...sources]);
const classes = [];
const walkC = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walkC(p); else if (p.endsWith('.class')) classes.push(p); } };
walkC(path.join(W, 'cls'));
fs.writeFileSync(path.join(W, 'classes.txt'), classes.join('\n'));
run(tool('d8', '.bat'), ['--min-api', '21', '--release', '--lib', AJ, '--output', W, `@${path.join(W, 'classes.txt')}`]);

// classes.dex goes into the package (a .apk is a zip); no external zip tool needed.
// aapt2 on Windows writes the assets' folders with backslashes: Android would not find a single file.
const JSZip = (await import('jszip')).default;
const base = await JSZip.loadAsync(fs.readFileSync(path.join(W, 'base.apk')));
const zip = new JSZip();
for (const f of Object.values(base.files)) {
  if (f.dir) continue;
  // resources.arsc must stay uncompressed for Android 11 and later (target SDK 30+)
  zip.file(f.name.split(String.fromCharCode(92)).join('/'), await f.async('nodebuffer'), { createFolders: false, compression: /^resources\.arsc$|\.png$/.test(f.name) ? 'STORE' : 'DEFLATE' });
}
zip.file('classes.dex', fs.readFileSync(path.join(W, 'classes.dex')), { createFolders: false, compression: 'DEFLATE' });
for (const must of ['AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'assets/www/index.html', 'assets/www/js/app.js', 'assets/www/pdfium/pdfium.wasm', 'assets/www/fonts/Carlito-Regular.ttf']) {
  if (!zip.file(must)) throw new Error('missing from the package: ' + must);
}
fs.writeFileSync(path.join(W, 'unsigned.apk'), await zip.generateAsync({ type: 'nodebuffer', compressionOptions: { level: 6 } }));

console.log('== sign');
run(tool('zipalign', '.exe'), ['-f', '-p', '4', path.join(W, 'unsigned.apk'), path.join(W, 'aligned.apk')]);
const KEY = process.env.ACM_ANDROID_KEY || path.join(os.homedir(), 'Downloads/ACM Docs/cheie-android (NU STERGE)');
const jks = path.join(KEY, 'acmdocs-release.jks');
if (!fs.existsSync(jks)) {
  const u = path.join(OUT, `ACM-Docs-${VERSION}-unsigned.apk`);
  fs.copyFileSync(path.join(W, 'aligned.apk'), u);
  console.log('no signing key:', u);
  process.exit(0);
}
const pw = (/^storePassword=(.*)$/m.exec(fs.readFileSync(path.join(KEY, 'parola.txt'), 'utf8')) || [])[1];
if (!pw) throw new Error('parola.txt has no storePassword');
const APK = path.join(OUT, `ACM-Docs-${VERSION}.apk`);
// (the password goes through the environment, never on a command line)
const env = { ...process.env, ACM_KS_PW: pw.trim() };
run(tool('apksigner', '.bat'), ['sign', '--ks', jks, '--ks-key-alias', 'acmdocs', '--ks-pass', 'env:ACM_KS_PW', '--key-pass', 'env:ACM_KS_PW', '--min-sdk-version', '21', '--out', APK, path.join(W, 'aligned.apk')], { env });
run(tool('apksigner', '.bat'), ['verify', APK]);
fs.rmSync(W, { recursive: true, force: true });
console.log(APK, Math.round(fs.statSync(APK).size / 1048576) + ' MB');
