// Steps for features/manual-run.feature: they drive the Run tab of the editor like a tester.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Given, When, Then } from '../support/gherkin.mjs';
import { bin } from '../support/world.mjs';

const copyResults = join(dirname(fileURLToPath(import.meta.url)), '..', 'support', 'copy-results.mjs');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

// ---------- helpers ----------
const text = (w, sel) => w.page.textContent(sel);
const doneSteps = async (w) => parseInt((await text(w, '#rn-progress')).split('/')[0], 10);
// Runs an action that records a step and waits until the view has moved on (the progress changed).
async function recording(w, action) {
  const before = await doneSteps(w);
  await action();
  await w.page.waitForFunction((n) => parseInt(document.getElementById('rn-progress').textContent.split('/')[0], 10) !== n, before);
}
async function chooseByText(w, selector, start) {
  const value = await w.page.evaluate(([sel, txt]) => { const o = [...document.querySelector(sel).options].find((x) => x.textContent.startsWith(txt)); return o && o.value; }, [selector, start]);
  assert.ok(value !== undefined && value !== null, `no option starting with "${start}"`);
  await w.page.selectOption(selector, value);
}
const exported = (w) => JSON.parse(readFileSync(join(w.runDir(), 'cucumber.json'), 'utf8')).flatMap((f) => f.elements);
const exportedStep = (w, c, s) => exported(w)[c - 1].steps[s - 1];

// ---------- setup and start ----------
Given(/^the editor is open on a copy of the examples$/, async (w) => { await w.openEditor(); });
Given(/^I open the Run tab$/, async (w) => { await w.page.click('.variants [data-variant="run"]'); await w.page.waitForSelector('#rn-start'); });

When(/^I select the feature file "([^"]*)"$/, async (w, file) => {
  await w.page.click(`#files a[data-path="${file}"]`);
  await w.page.waitForFunction((f) => window.gherkit.path === f, file);
});
When(/^I choose the scope "([^"]*)"$/, (w, label) => chooseByText(w, '#rn-scope', label));
When(/^I choose the features "([^"]*)"$/, (w, label) => chooseByText(w, '#rn-files', label));
When(/^I start a run without a tester$/, async (w) => { await w.page.fill('#rn-tester', ''); await w.page.click('#rn-start'); });
When(/^I start a run as "([^"]*)"$/, async (w, tester) => {
  await w.page.fill('#rn-tester', tester);
  await w.page.fill('#rn-env', 'Test-Stage');
  await w.page.fill('#rn-build', '2026.11');
  await w.page.click('#rn-start');
  await w.page.waitForFunction(() => document.getElementById('rn-focus') || (document.getElementById('rn-error') && document.getElementById('rn-error').textContent));
});

Then(/^I see the error "([^"]*)"$/, async (w, msg) => {
  await w.page.waitForFunction((m) => document.getElementById('rn-error') && document.getElementById('rn-error').textContent.includes(m), msg);
});
Then(/^the navigation lists (\d+) test cases? in (\d+) features?$/, async (w, cases, feats) => {
  assert.equal(await w.page.locator('.rn-nav-case').count(), Number(cases));
  assert.equal(await w.page.locator('.rn-nav-feat').count(), Number(feats));
});
Then(/^"([^"]*)" is named as left out$/, async (w, file) => { assert.match(await text(w, '#rn-skipped'), new RegExp(file.replace(/[.]/g, '\\.'))); });

// ---------- position and progress ----------
Then(/^I am at step (\d+) of (\d+)$/, async (w, n, of) => {
  await w.page.waitForFunction((re) => new RegExp(re).test(document.getElementById('rn-crumb').textContent), `Step ${n} of ${of}$`);
});
Then(/^I am at scenario (\d+) of (\d+) in feature (\d+) of (\d+)$/, async (w, s, sOf, f, fOf) => {
  await w.page.waitForFunction((re) => new RegExp(re).test(document.getElementById('rn-crumb').textContent), `Feature ${f} of ${fOf}:.*Scenario ${s} of ${sOf}`);
});
Then(/^the progress shows (\d+) steps? done$/, async (w, n) => {
  await w.page.waitForFunction((k) => document.getElementById('rn-progress').textContent.startsWith(k + '/'), String(n));
});
Then(/^test case (\d+) is marked as "([^"]*)"$/, async (w, n, state) => {
  const cls = await w.page.getAttribute(`#nav-c${n} .rn-dot`, 'class');
  assert.ok(cls.split(' ').includes(state), `test case ${n} has the classes "${cls}", not "${state}"`);
});
When(/^I go to test case (\d+) in the navigation$/, async (w, n) => { await w.page.click(`#nav-c${n}`); await w.page.waitForSelector('#rn-focus'); });

// ---------- answers ----------
When(/^I say good(?: (\d+) times)?$/, async (w, times) => {
  for (let i = 0; i < Number(times || 1); i++) await recording(w, () => w.page.click('#rn-good'));
});
When(/^I say bad$/, async (w) => { await w.page.click('#rn-bad'); await w.page.waitForSelector('#rn-confirm'); });
When(/^I say ignore$/, async (w) => { await w.page.click('#rn-ignore'); await w.page.waitForSelector('#rn-confirm'); });
When(/^I say bad with the reason "([^"]*)"$/, async (w, reason) => {
  await w.page.click('#rn-bad');
  await w.page.fill('#rn-comment', reason);
  await recording(w, () => w.page.click('#rn-confirm'));
});
When(/^I say ignore with the reason "([^"]*)"$/, async (w, reason) => {
  await w.page.click('#rn-ignore');
  await w.page.fill('#rn-comment', reason);
  await recording(w, () => w.page.click('#rn-confirm'));
});
When(/^I write "([^"]*)" as the (?:comment|reason)$/, (w, t) => w.page.fill('#rn-comment', t));
When(/^I confirm$/, (w) => recording(w, () => w.page.click('#rn-confirm')));
When(/^I cancel$/, async (w) => { await w.page.click('#rn-cancel'); await w.page.waitForSelector('#rn-good'); });
Then(/^saving is not possible without a reason$/, async (w) => { assert.equal(await w.page.locator('#rn-confirm').isDisabled(), true); });
When(/^I change step (\d+)$/, async (w, n) => {
  await w.page.locator(`.rn-steps > li:nth-child(${n}) .rn-link-btn`).first().click();
  await w.page.waitForSelector(`.rn-steps > li:nth-child(${n}).rn-focus`);
});
Then(/^the earlier step (\d+) shows the note "([^"]*)"$/, async (w, n, note) => {
  assert.match(await text(w, `.rn-steps > li:nth-child(${n}) .rn-note`), new RegExp(note));
});

// ---------- evidence ----------
When(/^I attach the evidence file "([^"]*)"$/, async (w, name) => {
  await w.page.setInputFiles('.rs-file', { name, mimeType: 'image/png', buffer: PNG });
  await w.page.waitForSelector('#rn-focus .rn-evidence a');
});
When(/^I paste a screenshot into the comment$/, async (w) => {
  await w.page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    document.getElementById('rn-comment').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG.toString('base64'));
  await w.page.waitForSelector('#rn-focus .rn-evidence a');
});
Then(/^the step shows the evidence "([^"]*)"$/, async (w, name) => { assert.match(await text(w, '#rn-focus .rn-evidence'), new RegExp(name.replace(/[.]/g, '\\.'))); });
Then(/^the step shows an evidence image$/, async (w) => { assert.equal(await w.page.locator('#rn-focus .rn-evidence img').count(), 1); });
Then(/^the comment still reads "([^"]*)"$/, async (w, t) => { assert.equal(await w.page.inputValue('#rn-comment'), t); });
Then(/^the evidence file "([^"]*)" is stored with the run$/, async (w, name) => {
  const dir = join(w.runDir(), 'evidence');
  assert.ok(existsSync(dir) && readdirSync(dir).some((f) => f.endsWith('-' + name)), `no evidence "${name}" in ${dir}`);
});

// ---------- companion window ----------
// A real browser can float the window (Document Picture-in-Picture); the test takes the popup that
// browsers without that API get, because it is a page Playwright can drive.
When(/^I open the companion window$/, async (w) => {
  await w.page.evaluate(() => { try { delete Window.prototype.documentPictureInPicture; } catch (e) { } try { delete window.documentPictureInPicture; } catch (e) { } });
  [w.cmp] = await Promise.all([w.page.context().waitForEvent('page'), w.page.click('#rn-companion')]);
  await w.cmp.waitForSelector('#cmp-focus');
});
Then(/^the companion window shows step (\d+) of (\d+)$/, async (w, n, of) => {
  await w.cmp.waitForFunction((re) => new RegExp(re).test(document.getElementById('cmp-crumb').textContent), `Step ${n} of ${of}$`);
});
When(/^I say good in the companion window$/, (w) => recording(w, () => w.cmp.click('#cmp-good')));
When(/^I say bad in the companion window$/, async (w) => { await w.cmp.click('#cmp-bad'); await w.cmp.waitForSelector('#cmp-confirm'); });
When(/^I say bad in the companion window with the reason "([^"]*)"$/, async (w, reason) => {
  // after "I say bad in the companion window" the window already asks for the reason
  if (await w.cmp.locator('#cmp-bad').count()) await w.cmp.click('#cmp-bad');
  await w.cmp.fill('#cmp-comment', reason);
  await recording(w, () => w.cmp.click('#cmp-confirm'));
});
When(/^I press "(.)" in the companion window$/, async (w, key) => {
  await w.cmp.keyboard.press(key);
  if (key === 'g') await w.cmp.waitForFunction(() => !document.getElementById('cmp-focus').classList.contains('failed'));
  else await w.cmp.waitForSelector('#cmp-confirm');
});
Then(/^saving in the companion window is not possible without a reason$/, async (w) => { assert.equal(await w.cmp.locator('#cmp-confirm').isDisabled(), true); });
When(/^I paste a screenshot into the companion window$/, async (w) => {
  await w.cmp.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG.toString('base64'));
  await w.cmp.waitForSelector('#cmp-focus ~ .cmp-ev .cmp-thumb');
});
Then(/^the companion window shows an evidence image$/, async (w) => { assert.equal(await w.cmp.locator('.cmp-ev .cmp-thumb').count(), 1); });
Then(/^a screenshot is stored with the run$/, async (w) => {
  const dir = join(w.runDir(), 'evidence');
  assert.ok(existsSync(dir) && readdirSync(dir).some((f) => /screenshot-\d+\.png$/.test(f)), `no screenshot in ${dir}`);
});
When(/^I close the companion window$/, async (w) => { await w.cmp.close(); });
Then(/^the companion window can be opened again$/, async (w) => {
  await w.page.waitForFunction(() => document.getElementById('rn-companion').getAttribute('aria-pressed') === 'false');
  assert.equal(await text(w, '#rn-companion'), 'Companion window');
});

// ---------- results and Jira ----------
When(/^I open the results$/, async (w) => { await w.page.click('#rn-tab-overview'); await w.page.waitForSelector('.rn-ov'); });
Then(/^the results show (\d+) failed, (\d+) ignored and (\d+) open$/, async (w, f, i, o) => {
  assert.equal(await text(w, '#ov-failed b'), f);
  assert.equal(await text(w, '#ov-ignored b'), i);
  assert.equal(await text(w, '#ov-open b'), o);
});
Then(/^test case (\d+) is listed with the reason "([^"]*)"$/, async (w, n, reason) => { assert.match(await text(w, `#ov-c${n}`), new RegExp(reason)); });
Then(/^test case (\d+) is listed with evidence$/, async (w, n) => { assert.match(await text(w, `#ov-c${n}`), /evidence file/); });
When(/^I open the Jira text for test case (\d+)$/, async (w, n) => { await w.page.click(`#ov-c${n} .rs-jira`); await w.page.waitForSelector('#rn-jira[open]'); });
Then(/^the Jira summary starts with "([^"]*)"$/, async (w, start) => { assert.ok((await w.page.inputValue('#rn-jira-summary')).startsWith(start)); });
Then(/^the Jira description contains "([^"]*)"$/, async (w, part) => { assert.ok((await w.page.inputValue('#rn-jira-desc')).includes(part), `the description lacks "${part}"`); });
Then(/^the Jira dialog names the Xray test "([^"]*)"$/, async (w, key) => { assert.match(await text(w, '#rn-jira'), new RegExp('Xray test: ' + key)); });
When(/^I close the Jira dialog$/, async (w) => { await w.page.keyboard.press('Escape'); await w.page.waitForSelector('#rn-jira', { state: 'detached' }); });

// ---------- resume, finish, report, build ----------
When(/^I reload the editor$/, async (w) => { await w.page.reload(); await w.page.waitForSelector('#rn-runs'); });
When(/^I resume the run$/, async (w) => { await w.page.locator('#rn-runs li button').first().click(); await w.page.waitForSelector('#rn-focus'); });
When(/^I finish the run and confirm that steps remain open$/, async (w) => {
  w.page.once('dialog', (d) => d.accept());
  await w.page.click('#rn-finish');
  await w.page.waitForSelector('#rn-banner');
});
Then(/^the run is read-only$/, async (w) => {
  assert.equal(await w.page.locator('#rn-good').count(), 0);
  assert.equal(await w.page.locator('#rn-finish').count(), 0);
});
Then(/^the banner names the exported file "([^"]*)"$/, async (w, name) => { assert.match(await text(w, '#rn-banner'), new RegExp(name.replace(/[.]/g, '\\.'))); });
When(/^I go back to all runs$/, async (w) => { await w.page.click('#rn-back'); await w.page.waitForSelector('#rn-runs li .rn-badge'); });
Then(/^the run is listed as "([^"]*)"$/, async (w, state) => { assert.match(await text(w, '#rn-runs li .rn-badge'), new RegExp(state)); });
Then(/^step (\d+) of test case (\d+) is exported as "([^"]*)"$/, (w, s, c, status) => { assert.equal(exportedStep(w, c, s).result.status, status); });
Then(/^step (\d+) of test case (\d+) is exported as "([^"]*)" with the reason "([^"]*)"$/, (w, s, c, status, reason) => {
  const st = exportedStep(w, c, s);
  assert.equal(st.result.status, status);
  assert.equal(st.result.error_message, reason);
});
Then(/^step (\d+) of test case (\d+) is exported as ignored with the reason "([^"]*)"$/, (w, s, c, reason) => {
  const st = exportedStep(w, c, s);
  assert.equal(st.result.status, 'skipped');
  assert.equal(st.gherkit.status, 'ignored');
  assert.equal(st.result.error_message, reason);
});
Then(/^step (\d+) of test case (\d+) is exported with the comment "([^"]*)"$/, (w, s, c, comment) => { assert.equal(exportedStep(w, c, s).gherkit.comment, comment); });
Then(/^test case (\d+) is exported as a manual test by "([^"]*)"$/, (w, c, tester) => {
  const el = exported(w)[c - 1];
  assert.equal(el.gherkit.manual, true);
  assert.equal(el.gherkit.tester, tester);
});
When(/^I open the report$/, async (w) => {
  w.report = await w.page.evaluate((id) => fetch(`/api/manual/runs/${id}/report?lang=en`).then((r) => r.text()), w.runId());
});
Then(/^the report contains "([^"]*)"$/, (w, part) => { assert.ok(w.report.includes(part), `the report lacks "${part}"`); });
When(/^I run gherkit with the exported result as the test results$/, (w) => {
  const exportedFile = join(w.runDir(), 'cucumber.json');
  try {
    const out = execFileSync(bin, ['run', '--cmd', `"${process.execPath}" "${copyResults}" "${exportedFile}"`], { cwd: w.dir, stdio: 'pipe' });
    w.exit = 0; w.stdout = String(out); w.stderr = '';
  } catch (e) { w.exit = e.status; w.stdout = String(e.stdout); w.stderr = String(e.stderr); }
});
Then(/^the exit code is (\d+)$/, (w, code) => { assert.equal(w.exit, Number(code), w.stderr); });
Then(/^the error output contains "([^"]*)"$/, (w, part) => { assert.ok(w.stderr.includes(part), `stderr: ${w.stderr}`); });
