// Document editor: the text color chosen at the caret ("Fără culoare" too) holds after deleting back into colored text.
//   node test/ui/writer-color.mjs
import { _electron as electron } from 'playwright-core';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'acm-col-'));
const app = await electron.launch({ args: ['.'], env: { ...process.env, ACM_USERDATA: DATA } });
const page = await app.firstWindow();
for (let i = 0; i < 160; i++) { if (await page.evaluate(() => typeof App !== 'undefined' && !document.getElementById('home').classList.contains('hidden')).catch(() => false)) break; await page.waitForTimeout(250); }
await page.waitForTimeout(1200);
await page.evaluate(() => { document.getElementById('auth')?.remove(); Plan.allow = async () => true; });
await page.click('#act-doc');
await page.waitForSelector('#writer:not(.hidden) #wr-page');
await page.click('#wr-page');
await page.keyboard.type('faci ');
const pick = async (none) => {
  await page.click('#writer button[title="Culoarea textului"]');
  await page.waitForTimeout(300);
  const sel = none ? '.cpop .cnone' : '.cpop .csw[title="#c00000"], .cpop .csw[title="#C00000"], .cpop .csw >> nth=12';
  const b = page.locator(sel).first();
  await b.click();
  await page.waitForTimeout(200);
};
await pick(false);
await page.keyboard.type('rosu');
await pick(true);
await page.keyboard.type(' alt');
for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
await page.keyboard.type('X');
const r = await page.evaluate(() => { const s = getSelection(); const n = s.anchorNode.nodeType === 3 ? s.anchorNode.parentNode : s.anchorNode; return { color: getComputedStyle(n).color, html: document.getElementById('wr-page').innerHTML.slice(-260) }; });
await app.close(); fs.rmSync(DATA, { recursive: true, force: true });
console.log(JSON.stringify(r));
console.log(/rgb\(0, 0, 0\)/.test(r.color) ? 'all passed' : 'FAILED');
