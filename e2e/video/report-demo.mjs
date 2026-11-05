// Records a video of the report demo: the browser demo (built site) with the terminal that generates reports and
// shows them right away. Used by .github/workflows/demo-video.yml; the video shows how the page behaves for a
// reviewer who cannot try it locally.
//
//   SKIP_DOWNLOADS=1 scripts/build-site.sh build/site
//   cd e2e && GHERKIT_VIDEO_DIR=../build/video node video/report-demo.mjs
import { createServer } from 'node:http';
import { existsSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(process.env.GHERKIT_SITE || join(here, '..', '..', 'build', 'site'));
const outDir = resolve(process.env.GHERKIT_VIDEO_DIR || join(here, '..', '..', 'build', 'video'));
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.gz': 'application/gzip', '.svg': 'image/svg+xml', '.css': 'text/css' };
mkdirSync(outDir, { recursive: true });

const server = createServer((req, res) => {
  const path = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  if (!path.startsWith(root) || !existsSync(path)) { res.statusCode = 404; return res.end('not found'); }
  res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
  res.end(readFileSync(path));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'de-CH', recordVideo: { dir: outDir, size: { width: 1280, height: 800 } } });
const page = await ctx.newPage();
const sleep = (ms) => page.waitForTimeout(ms);

// A caption at the bottom of the page tells what is going on.
async function say(text, ms = 2500) {
  await page.evaluate((t) => {
    let c = document.getElementById('video-caption');
    if (!c) {
      c = document.createElement('div'); c.id = 'video-caption';
      c.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);max-width:90vw;z-index:99999;background:rgba(0,0,0,.82);color:#fff;font:600 20px/1.35 system-ui,sans-serif;padding:10px 20px;border-radius:12px;text-align:center;pointer-events:none';
      document.body.appendChild(c);
    }
    c.textContent = t;
  }, text);
  await sleep(ms);
}
async function typeCmd(cmd) {
  await page.click('#term-input');
  await page.type('#term-input', cmd, { delay: 35 });
  await sleep(500);
  await page.press('#term-input', 'Enter');
  await page.waitForFunction(() => !document.getElementById('term-input').disabled, null, { timeout: 60000 });
  await sleep(1200);
}
async function scrollReport(top, ms = 2500) {
  await page.frameLocator('#report iframe, #dock-report iframe').locator('body').evaluate((_, y) => window.scrollTo({ top: y, behavior: 'smooth' }), top);
  await sleep(ms);
}

// 1. landing page
await page.goto(base);
await say('gherkit: Reports aus Testresultaten und Feature-Dateien, direkt im Browser', 3500);
await page.locator('#demo').scrollIntoViewIfNeeded();
await page.evaluate(() => document.getElementById('demo').scrollIntoView({ behavior: 'smooth' }));
await sleep(1200);
await say('«Demo starten» lädt die echte gherkit-CLI (WebAssembly). Es gibt keinen Server.', 2000);
await page.click('#demo-start');
await page.waitForSelector('#term-input', { timeout: 90000 });
await sleep(800);

// 2. what is there
await say('Das Standardset enthält Feature-Dateien und Testergebnisse (Cucumber JSON)', 2200);
await typeCmd('ls');
await typeCmd('ls results');

// 3. automated report
await say('Report aus den automatisierten Ergebnissen: Befehl eintippen …', 1800);
await typeCmd('gherkit report results/examples.cucumber.json -o report.html --title Beispiele');
await say('… und der Report erscheint sofort unter dem Terminal', 2500);
await scrollReport(300, 2500);
await say('Fehlgeschlagene und undefinierte Szenarien sind aufgeklappt', 3000);
await scrollReport(700, 2500);

// 4. manual run
await say('Der manuelle Testlauf (@manual): Tester, Umgebung, Kommentare, Nachweis', 2000);
await page.click('[data-cmd*="manual.cucumber.json"]');
await page.waitForFunction(() => !document.getElementById('term-input').disabled);
await sleep(1500);
await scrollReport(0, 1500);
await scrollReport(500, 3000);

// 5. everything together
await say('Alle Ergebnisse zusammen, auf Deutsch', 1800);
await typeCmd('gherkit report results/gherkit.cucumber.json results/examples.cucumber.json results/manual.cucumber.json -o alle.html --lang de');
await scrollReport(0, 3500);

// 6. edited data: the report follows
await say('Eigene Daten: Der Demo-Runner führt die Szenarien aus und schreibt den Report', 2200);
await typeCmd('gherkit run --adapter demo . --report lauf.html --title Lauf');
await scrollReport(0, 3000);
await say('Jetzt eine eigene Feature-Datei anlegen …', 2000);
await typeCmd('echo "Feature: Meine Idee\\n  Scenario: Neues Verhalten\\n    Given ein neuer Schritt ohne Umsetzung" > neu.feature');
await say('… und den Lauf wiederholen: der Report enthält das neue Szenario', 2200);
await typeCmd('gherkit run --adapter demo . --report lauf.html --title Lauf');
await scrollReport(0, 2000);
await scrollReport(900, 3500);

// 7. the editor has the same terminal
await say('Im Editor gibt es dasselbe Terminal unter der Bearbeitung', 2000);
await page.goto(base + 'editor/');
await page.waitForSelector('#dock-toggle', { timeout: 90000 });
await sleep(1500);
await say('Editor mit Terminal: unten «Aufklappen»', 2000);
await page.click('#dock-toggle');
await page.waitForSelector('#term-input');
await typeCmd('gherkit report results/examples.cucumber.json -o report.html --title Editor');
await page.evaluate(() => document.getElementById('dock').scrollTo({ top: 99999, behavior: 'smooth' }));
await sleep(3500);
await say('Alles läuft im Browser. Eigene Dateien verlassen ihn nie.', 3500);

const video = page.video();
await ctx.close();
await browser.close();
server.close();
renameSync(await video.path(), join(outDir, 'report-demo.webm'));
console.log('video:', join(outDir, 'report-demo.webm'));
