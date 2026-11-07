// Prototyp D3: startet einen Browser mit der Anwendung und blendet das Begleitfenster direkt in die Seite ein.
// Aufruf:  node launch.mjs [URL] [--browser msedge|chrome|chromium] [--headless] [--state datei.json]
// Ergebnisse landen in der Zustandsdatei (Standard: gherkit-lauf.json), der Xray-Export daneben.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const flag = n => args.includes('--' + n);
const url = args.find((a, i) => !a.startsWith('--') && !(args[i - 1] || '').startsWith('--')) || pathToFileURL(path.join(here, '..', 'testapp', 'index.html')).href;
const stateFile = path.resolve(opt('state', 'gherkit-lauf.json'));
const browser = opt('browser', process.platform === 'win32' ? 'msedge' : 'chromium');

const launchOpts = { headless: flag('headless') };
if (browser !== 'chromium') launchOpts.channel = browser; // msedge oder chrome des Rechners, kein Download nötig
const b = await chromium.launch(launchOpts);
const ctx = await b.newContext({ viewport: null, acceptDownloads: true });

let state = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : null;
await ctx.exposeFunction('__gkLoad', () => state);
await ctx.exposeFunction('__gkSave', s => { state = s; fs.writeFileSync(stateFile, s); });
await ctx.exposeFunction('__gkExport', (name, json) => {
  const f = path.resolve(path.dirname(stateFile), name); fs.writeFileSync(f, json); console.log('Xray-JSON geschrieben:', f);
});
await ctx.exposeBinding('__gkShot', async ({ page }) => {
  // Panel kurz ausblenden, damit es nicht auf dem Nachweis erscheint
  await page.evaluate(() => { const h = document.getElementById('gk-host'); if (h) h.style.visibility = 'hidden'; });
  const buf = await page.screenshot();
  await page.evaluate(() => { const h = document.getElementById('gk-host'); if (h) h.style.visibility = 'visible'; });
  return 'data:image/png;base64,' + buf.toString('base64');
});
for (const f of ['common/scenario.js', 'common/xray.js', 'common/panel.js', 'd3-launcher/overlay.js']) {
  await ctx.addInitScript({ path: path.join(here, '..', f) });
}
const page = await ctx.newPage();
await page.goto(url);
console.log('Browser offen:', url, '\nZustand:', stateFile, '\nZum Beenden den Browser schliessen.');
if (process.env.GK_TEST) globalThis.__gkTest = { page, ctx, b, getState: () => state };
else await new Promise(r => b.on('disconnected', r));
export const test = () => globalThis.__gkTest;
