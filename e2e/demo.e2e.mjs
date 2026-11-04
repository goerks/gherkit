// Browser test of the static site (GitHub Pages): it serves the built site, starts the demo and uses the
// terminal, which runs the real gherkit CLI as WebAssembly.
//
//   scripts/build-site.sh build/site && (cd e2e && npm run test:demo)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = resolve(process.env.GHERKIT_SITE || join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'site'));
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.gz': 'application/gzip', '.zip': 'application/zip', '.txt': 'text/plain', '.svg': 'image/svg+xml' };

let server, base, browser;

before(async () => {
  server = createServer((req, res) => {
    const path = join(root, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
    if (!path.startsWith(root) || !existsSync(path)) { res.statusCode = 404; return res.end('not found'); }
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.close();
});

async function open() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, locale: 'de-CH' });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(base);
  return page;
}

async function startDemo(page) {
  await page.click('#demo-start');
  await page.waitForSelector('#term-input', { timeout: 60000 });
}

async function run(page, cmd) {
  await page.fill('#term-input', cmd);
  await page.press('#term-input', 'Enter');
  await page.waitForFunction(() => !document.getElementById('term-input').disabled, null, { timeout: 60000 });
  return page.evaluate(() => document.getElementById('term').innerText);
}

test('the landing page offers every download and hides the demo until it is started', async () => {
  const page = await open();
  assert.match(await page.textContent('h1'), /Gherkin/);
  for (const f of ['gherkit-windows-amd64', 'gherkit-linux-amd64', 'gherkit-darwin-arm64', 'standard-set']) {
    assert.ok(await page.$(`a[href="downloads/${f}.zip"]`), `link to ${f}`);
  }
  assert.equal(await page.locator('#demo-chips').isHidden(), true, 'example commands are hidden before the start');
  assert.equal(await page.locator('#term').isHidden(), true, 'terminal is hidden before the start');
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the terminal runs the real CLI in the browser on the standard set', async () => {
  const page = await open();
  await startDemo(page);
  assert.equal(await page.locator('#demo-start-row').isHidden(), true, 'the start button goes away');
  assert.equal(await page.locator('#demo-chips').isVisible(), true, 'example commands are shown');

  let t = await run(page, 'gherkit --version');
  assert.match(t, /gherkit \S+ \(/);
  t = await run(page, 'ls');
  assert.match(t, /shop\//);
  t = await run(page, 'gherkit lint .');
  assert.match(t, /broken\.feature/);
  assert.match(t, /\[exit 2\]/, 'a lint error gives exit code 2');
  t = await run(page, 'gherkit parse shop/checkout.feature');
  assert.match(t, /Checkout/);
  t = await run(page, 'gherkit dialects');
  assert.match(t, /\bde\b/);
  t = await run(page, 'gherkit edit');
  assert.match(t, /the editor is the page/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('own files can be created, formatted and reported in the virtual folder', async () => {
  const page = await open();
  await startDemo(page);
  let t = await run(page, 'echo "Feature:   Neu" > neu.feature');
  t = await run(page, 'gherkit fmt neu.feature');
  t = await run(page, 'cat neu.feature');
  assert.match(t, /Feature: Neu/, 'fmt wrote the canonical layout into the virtual file');
  // a Cucumber JSON result becomes a report
  const result = '[{"uri":"f.feature","keyword":"Feature","name":"F","elements":[{"keyword":"Scenario","name":"ok","type":"scenario","steps":[{"keyword":"Given ","name":"a","line":1,"result":{"status":"passed","duration":1}}]},{"keyword":"Scenario","name":"bad","type":"scenario","steps":[{"keyword":"Given ","name":"b","line":2,"result":{"status":"failed","duration":1}}]}]}]';
  await run(page, 'echo "' + result.replace(/"/g, '\\"') + '" > results.json');
  t = await run(page, 'gherkit report results.json -f md --title Demo');
  assert.match(t, /2 scenario\(s\): 1 passed, 1 failed/);
  t = await run(page, 'gherkit report results.json -o report.html');
  t = await run(page, 'ls');
  assert.match(t, /report\.html/, 'report.html was written into the virtual folder');
  // reset brings back the standard set and removes own files
  t = await run(page, 'reset');
  t = await run(page, 'ls');
  assert.doesNotMatch(t.split('Standardset wiederhergestellt')[1] || '', /neu\.feature|report\.html/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

async function openEditor() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'de-CH', acceptDownloads: true });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  await page.goto(base + 'editor/');
  await page.waitForSelector('#files a[data-path]', { timeout: 60000 });
  return page;
}

test('the editor runs in the browser on the standard set and keeps changes across reloads', async () => {
  const page = await openEditor();
  const files = await page.$$eval('#files a[data-path]', (as) => as.map((a) => a.dataset.path));
  assert.ok(files.includes('shop/checkout.feature') && files.includes('de/anmeldung.feature'), 'standard set is listed: ' + files);
  assert.match(await page.textContent('.demo-badge'), /Demo/);
  assert.equal(await page.locator('#ws-btn').isDisabled(), true, 'no folder picker in the demo');

  await page.click('#files a[data-path="shop/checkout.feature"]');
  await page.click('[data-variant="code"]');
  await page.waitForFunction(() => document.getElementById('src').value.includes('Checkout'));
  await page.fill('#src', (await page.inputValue('#src')) + '\n\n  Scenario: Eigenes Szenario\n    Given ein Gast\n');
  await page.click('#save-btn');
  await page.waitForFunction(() => !window.gherkit || !window.gherkit.text || window.gherkit.text === window.gherkit.saved);
  await page.waitForTimeout(500);

  await page.reload();
  await page.waitForSelector('#files a[data-path]');
  await page.click('#files a[data-path="shop/checkout.feature"]');
  await page.waitForFunction(() => document.getElementById('src').value.includes('Eigenes Szenario'));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the terminal below the editor shares its files', async () => {
  const page = await openEditor();
  await page.click('#dock-toggle');
  await page.waitForSelector('#term-input');
  await page.fill('#term-input', 'echo "Feature: Aus dem Terminal" > terminal.feature');
  await page.press('#term-input', 'Enter');
  await page.waitForSelector('#files a[data-path="terminal.feature"]', { timeout: 15000 });
  await page.fill('#term-input', 'rm terminal.feature');
  await page.press('#term-input', 'Enter');
  await page.waitForFunction(() => !document.querySelector('#files a[data-path="terminal.feature"]'), null, { timeout: 15000 });
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('export, import and reset work on the editor page', async () => {
  const page = await openEditor();
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#demo-export')]);
  assert.equal(dl.suggestedFilename(), 'gherkit-demo.zip');
  const path = await dl.path();
  const zip = readFileSync(path);
  assert.equal(zip.subarray(0, 2).toString(), 'PK', 'a ZIP file');

  await page.setInputFiles('#demo-import-input', [{ name: 'importiert.feature', mimeType: 'text/plain', buffer: Buffer.from('Feature: Importiert\n\n  Scenario: S\n    Given x\n') }]);
  page.once('dialog', (d) => d.accept());
  await page.waitForSelector('#files a[data-path="importiert.feature"]', { timeout: 15000 });

  page.on('dialog', (d) => d.accept());
  await page.click('#demo-reset');
  await page.waitForSelector('#files a[data-path="shop/checkout.feature"]', { timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector('#files a[data-path="importiert.feature"]'));
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the landing page links to the editor', async () => {
  const page = await open();
  assert.equal(await page.getAttribute('#open-editor', 'href'), 'editor/');
  await page.close();
});

test('a report command shows the generated report right below the terminal', async () => {
  const page = await open();
  await startDemo(page);
  let t = await run(page, 'ls results');
  assert.match(t, /examples\.cucumber\.json/);
  assert.match(t, /manual\.cucumber\.json/);
  assert.equal(await page.locator('#report').isHidden(), true, 'no report before the first report command');

  t = await run(page, 'gherkit report results/examples.cucumber.json -o report.html --title Beispiele');
  assert.match(t, /17 scenario\(s\): 15 passed, 1 failed, 1 other/);
  assert.match(t, /Report «report\.html» wird unter dem Terminal angezeigt/);
  await page.waitForSelector('#report:not([hidden]) iframe');
  const frame = page.frameLocator('#report iframe');
  assert.match(await frame.locator('h1').innerText(), /Beispiele/);
  assert.match(await frame.locator('body').innerText(), /Discount code NOPE/, 'the failing scenario is in the report');

  // all three files together, in German, and the manual run with its evidence
  await run(page, 'gherkit report results/gherkit.cucumber.json results/examples.cucumber.json results/manual.cucumber.json -o alle.html --lang de');
  assert.match(await frame.locator('h1').innerText(), /Abnahmetest-Report/);
  assert.match(await frame.locator('body').innerText(), /Anna Muster/, 'the manual tester is shown');
  assert.equal(await frame.locator('a[href^="blob:"]').count() >= 1, true, 'evidence links point to files of the virtual folder');

  // output without -o is shown too; Markdown stays in the terminal
  t = await run(page, 'gherkit report results/manual.cucumber.json');
  assert.doesNotMatch(t, /<!doctype/i, 'the HTML itself is not dumped into the terminal');
  t = await run(page, 'gherkit report results/manual.cucumber.json -f md');
  assert.match(t, /# /);

  await page.click('#report button[aria-label="Report schliessen"]');
  assert.equal(await page.locator('#report').isHidden(), true);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the demo runner executes the standard set and writes a report', async () => {
  const page = await open();
  await startDemo(page);
  let t = await run(page, 'gherkit run --adapter demo . --report report.html');
  assert.match(t, /✓ shop\/checkout\.feature:\d+ Invoice is sent as PDF/);
  assert.match(t, /✓ de\/anmeldung\.feature:\d+ Erfolgreiche Anmeldung/);
  assert.match(t, /broken\.feature: syntax errors/);
  assert.match(t, /17 scenario\(s\): 16 passed, 1 failed/);
  assert.match(t, /\[exit 1\]/, 'a failing scenario gives exit code 1');
  t = await run(page, 'ls');
  assert.match(t, /report\.html/);
  await run(page, 'cd shop');
  t = await run(page, 'gherkit run --adapter demo checkout.feature');
  assert.match(t, /5 scenario\(s\): 5 passed, 0 failed/);
  assert.deepEqual(page.errors, []);
  await page.close();
});

test('the Run view works in the demo: a manual run is guided and finished without a server', async () => {
  const page = await openEditor();
  await page.click('.variants [data-variant="run"]');
  await page.waitForSelector('#rn-start');
  await page.fill('#rn-tester', 'Demo');
  await page.click('#rn-start');
  await page.waitForSelector('#rn-focus'); // the @manual test cases of the standard set
  assert.equal(await page.locator('.rn-nav-case').count(), 6);
  assert.match(await page.textContent('#rn-skipped'), /broken\.feature/, 'the broken file is named, not silently dropped');
  await page.click('#rn-good');
  await page.waitForFunction(() => /^1\//.test(document.getElementById('rn-progress').textContent));
  assert.equal(await page.locator('.rs-file').count(), 0, 'the demo offers no attachments');
  await page.click('#rn-bad');
  await page.fill('#rn-comment', 'Demo-Fehler');
  await page.click('#rn-confirm');
  await page.click('#rn-tab-overview');
  assert.equal(await page.textContent('#ov-failed b'), '1');
  page.once('dialog', (d) => d.accept());
  await page.click('#rn-finish');
  await page.waitForSelector('#rn-banner');
  assert.match(await page.textContent('#rn-banner'), /cucumber\.json/);
  assert.deepEqual(page.errors, []);
  await page.close();
});
