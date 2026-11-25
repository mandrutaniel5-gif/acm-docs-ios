// Windows: the app may show notifications, and clicking one brings the window to the front.
//   node test/ui/notify-win.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-notify-'));
const app = await electron.launch({ args: [ROOT], env: { ...process.env, ACM_USERDATA: DATA } });
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
const ready = () => page.evaluate(() => typeof Push !== 'undefined').catch(() => false);
for (let i = 0; i < 60 && !(await ready()); i++) await page.waitForTimeout(250);
await page.waitForTimeout(1000);
const r = await page.evaluate(async () => ({
  push: typeof Push,
  permission: await Notification.requestPermission(),
  shown: (() => { try { new Notification('Mesaj nou', { body: 'Test' }).close(); return true; } catch (e) { return String(e); } })(),
  focus: await window.ElectronHost.invoke('focus-window'),
}));
await app.close();
fs.rmSync(DATA, { recursive: true, force: true });
const ok = r.push === 'object' && r.permission === 'granted' && r.shown === true && r.focus === true;
console.log(JSON.stringify(r), ok ? 'all passed' : 'FAILED');
process.exit(ok ? 0 : 1);
