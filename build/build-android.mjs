// ACM Docs for Android: a signed .apk, built by Gradle (needed for Firebase Cloud Messaging, the notifications).
//   node build/build-android.mjs
// Needs: the Android SDK (ANDROID_HOME, default: where Android Studio puts it), a JDK 17+ (JAVA_HOME, default: the one
// inside Android Studio) and Gradle (GRADLE, default: the newest one Gradle keeps in ~/.gradle). Signing key:
// ACM_ANDROID_KEY=<folder with acmdocs-release.jks and parola.txt>, default Downloads/ACM Docs/cheie-android (NU STERGE).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const [a, b, c] = VERSION.split('.').map(Number);
const CODE = a * 10000 + b * 100 + c; // 2.0.0 -> 20000
const win = process.platform === 'win32';

const SDK = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || (win ? path.join(os.homedir(), 'AppData/Local/Android/Sdk') : path.join(os.homedir(), 'Android/Sdk'));
const JAVA = process.env.JAVA_HOME || (win ? 'C:/Program Files/Android/Android Studio/jbr' : '');
function gradle() {
  if (process.env.GRADLE) return process.env.GRADLE;
  const dists = path.join(os.homedir(), '.gradle/wrapper/dists');
  const found = [];
  for (const d of fs.existsSync(dists) ? fs.readdirSync(dists) : []) {
    if (!fs.statSync(path.join(dists, d)).isDirectory()) continue;
    for (const h of fs.readdirSync(path.join(dists, d))) {
      const g = path.join(dists, d, h, d.replace(/-(all|bin)$/, ''), 'bin', win ? 'gradle.bat' : 'gradle');
      if (fs.existsSync(g)) found.push(g);
    }
  }
  found.sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  if (!found.length) throw new Error('Gradle not found (set GRADLE)');
  return found.pop();
}

const OUT = path.join(ROOT, 'dist', 'android');
const ASSETS = path.join(OUT, 'assets');
fs.rmSync(ASSETS, { recursive: true, force: true });
fs.mkdirSync(path.join(ASSETS, 'www'), { recursive: true });

console.log('== web app');
fs.cpSync(path.join(ROOT, 'app'), path.join(ASSETS, 'www'), { recursive: true });
fs.rmSync(path.join(ASSETS, 'www/assets/legacy-logo.jpg'), { force: true });
fs.cpSync(path.join(ROOT, 'build/fonts'), path.join(ASSETS, 'www/fonts'), { recursive: true });

console.log('== gradle');
fs.writeFileSync(path.join(ROOT, 'android/local.properties'), 'sdk.dir=' + SDK.replace(/\\/g, '/') + '\n');
const KEY = process.env.ACM_ANDROID_KEY || path.join(os.homedir(), 'Downloads/ACM Docs/cheie-android (NU STERGE)');
const jks = path.join(KEY, 'acmdocs-release.jks');
const signed = fs.existsSync(jks);
const pw = signed ? ((/^storePassword=(.*)$/m.exec(fs.readFileSync(path.join(KEY, 'parola.txt'), 'utf8')) || [])[1] || '').trim() : '';
// (the password goes through the environment, never on a command line)
const env = { ...process.env, JAVA_HOME: JAVA, ANDROID_HOME: SDK, ACM_ASSETS: ASSETS, ACM_VERSION: VERSION, ACM_CODE: String(CODE), ...(signed ? { ACM_KS: jks, ACM_KS_PW: pw } : {}) };
execFileSync(gradle(), ['--no-daemon', '-q', 'assembleRelease'], { cwd: path.join(ROOT, 'android'), env, stdio: 'inherit', shell: win });

const built = path.join(ROOT, 'android/build/outputs/apk/release', signed ? 'acm-docs-release.apk' : 'acm-docs-release-unsigned.apk');
const APK = path.join(OUT, `ACM-Docs-${VERSION}${signed ? '' : '-unsigned'}.apk`);
fs.copyFileSync(built, APK);
// what the app cannot live without is in the package, at the right place
const zip = await JSZip.loadAsync(fs.readFileSync(APK));
for (const must of ['AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'assets/www/index.html', 'assets/www/js/app.js', 'assets/www/pdfium/pdfium.wasm', 'assets/www/fonts/Carlito-Regular.ttf']) {
  if (!zip.file(must)) throw new Error('missing from the package: ' + must);
}
fs.rmSync(ASSETS, { recursive: true, force: true });
console.log(APK, Math.round(fs.statSync(APK).size / 1048576) + ' MB');
