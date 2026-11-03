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
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.gz': 'application/gzip', '.zip': 'application/zip', '.txt': 'text/plain' };

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
