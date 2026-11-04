// gherkit web editor – "Run" view: people test scenarios by hand (ADR 0009).
//
// A manual run is guided: feature by feature, scenario by scenario, step by step. The tester always sees the
// one step that is next, says good / bad / ignore, and the view moves on. A failed or ignored step needs a
// reason, every step takes a comment and evidence. An overview lists the results; a failed scenario can be
// turned into the text of a Jira bug. The server saves every change (.gherkit/runs/<id>/session.json) and
// exports Cucumber JSON when the run is finished. app.js hands over its helpers in init().
(function () {
  'use strict';

  var RAW = {
    de: {
      vRun: 'Ausführen', runNew: 'Neuer manueller Lauf', runTester: 'Testende Person', runEnv: 'Umgebung (z. B. URL oder Stage)', runBuild: 'Build / Version',
      runTitle: 'Titel (optional)', runScope: 'Umfang', scopeManual: 'Nur Testfälle mit @manual', scopeAll: 'Alle Testfälle', runFiles: 'Features',
      filesCurrent: 'Aktuelles Feature', filesAll: 'Alle Features im Ordner', runStart: 'Lauf starten', runPrev: 'Bisherige Läufe', runNone: 'Noch keine Läufe.',
      runResume: 'Fortsetzen', runView: 'Ansehen', runReport: 'Bericht', runFinish: 'Lauf abschliessen', runBack: 'Zur Übersicht aller Läufe', runRunning: 'läuft', runDone: 'abgeschlossen',
      tabRun: 'Durchführen', tabOverview: 'Ergebnisse',
      good: 'Gut', bad: 'Schlecht', ignore: 'Ignorieren', clear: 'Zurücksetzen', saveBad: 'Als fehlgeschlagen speichern', saveIgnore: 'Als ignoriert speichern', cancel: 'Abbrechen',
      infoLabel: 'Testinformationen / Beobachtung (optional)', whyBad: 'Was ist passiert? Begründung (Pflicht)', whyIgnore: 'Warum wird der Schritt nicht beurteilt? Begründung (Pflicht)',
      infoPh: 'z. B. verwendete Testdaten, gemessene Werte, Auffälligkeiten', reasonPh: 'Beobachtetes Verhalten, erwartetes Verhalten',
      attach: 'Nachweis anhängen', pasteHint: 'oder Screenshot mit Strg+V einfügen', change: 'ändern',
      sPassed: 'bestanden', sFailed: 'fehlgeschlagen', sIgnored: 'ignoriert', sOpen: 'offen', sRunning: 'läuft', sSkipped: 'übersprungen',
      feature: 'Feature', scenario: 'Szenario', step: 'Schritt', ofN: 'von',
      allDone: 'Alle Schritte sind erledigt. Prüfe die Ergebnisse und schliesse den Lauf ab.', openSteps: 'Es sind noch {n} Schritte offen. Trotzdem abschliessen?',
      finished: 'Lauf abgeschlossen. Ergebnis (Cucumber JSON):', needTester: 'Bitte die testende Person angeben.', uploadFailed: 'Anhang konnte nicht gespeichert werden',
      readOnly: 'Dieser Lauf ist abgeschlossen und nur noch lesbar.', skippedFiles: 'Nicht im Lauf, weil fehlerhaft:',
      nScenarios: 'Szenarien', nSteps: 'Schritte', reason: 'Begründung', jira: 'Jira-Text', jump: 'Hin', colScenario: 'Szenario', colResult: 'Ergebnis', colSteps: 'Schritte', colNote: 'Begründung',
      jiraTitle: 'Jira-Bug aus fehlgeschlagenem Test', jiraSummary: 'Zusammenfassung', jiraDesc: 'Beschreibung (Jira-Wiki-Format)', copySummary: 'Zusammenfassung kopieren', copyDesc: 'Beschreibung kopieren',
      copied: 'Kopiert', close: 'Schliessen', jiraXray: 'Xray-Test:', jiraHint: 'Nachweis-Dateien bitte von Hand an das Ticket anhängen.', noMore: 'Keine offenen Schritte mehr.',
      mandatory: 'Pflicht', evidenceN: '{n} Nachweis(e)', next: 'Nächster Schritt'
    },
    en: {
      vRun: 'Run', runNew: 'New manual run', runTester: 'Tester', runEnv: 'Environment (e.g. URL or stage)', runBuild: 'Build / version',
      runTitle: 'Title (optional)', runScope: 'Scope', scopeManual: 'Only test cases tagged @manual', scopeAll: 'All test cases', runFiles: 'Features',
      filesCurrent: 'Current feature', filesAll: 'All features in the folder', runStart: 'Start run', runPrev: 'Previous runs', runNone: 'No runs yet.',
      runResume: 'Resume', runView: 'View', runReport: 'Report', runFinish: 'Finish run', runBack: 'All runs', runRunning: 'running', runDone: 'finished',
      tabRun: 'Run', tabOverview: 'Results',
      good: 'Good', bad: 'Bad', ignore: 'Ignore', clear: 'Reset', saveBad: 'Save as failed', saveIgnore: 'Save as ignored', cancel: 'Cancel',
      infoLabel: 'Test information / observation (optional)', whyBad: 'What happened? Reason (required)', whyIgnore: 'Why is the step not judged? Reason (required)',
      infoPh: 'e.g. test data used, measured values, anything unusual', reasonPh: 'Observed behaviour, expected behaviour',
      attach: 'Attach evidence', pasteHint: 'or paste a screenshot with Ctrl+V', change: 'change',
      sPassed: 'passed', sFailed: 'failed', sIgnored: 'ignored', sOpen: 'open', sRunning: 'running', sSkipped: 'skipped',
      feature: 'Feature', scenario: 'Scenario', step: 'Step', ofN: 'of',
      allDone: 'All steps are done. Check the results and finish the run.', openSteps: '{n} steps are still open. Finish anyway?',
      finished: 'Run finished. Result (Cucumber JSON):', needTester: 'Please enter the tester.', uploadFailed: 'The attachment could not be saved',
      readOnly: 'This run is finished and read-only.', skippedFiles: 'Left out because of syntax errors:',
      nScenarios: 'Scenarios', nSteps: 'Steps', reason: 'Reason', jira: 'Jira text', jump: 'Go', colScenario: 'Scenario', colResult: 'Result', colSteps: 'Steps', colNote: 'Reason',
      jiraTitle: 'Jira bug from a failed test', jiraSummary: 'Summary', jiraDesc: 'Description (Jira wiki format)', copySummary: 'Copy summary', copyDesc: 'Copy description',
      copied: 'Copied', close: 'Close', jiraXray: 'Xray test:', jiraHint: 'Please attach the evidence files to the ticket by hand.', noMore: 'No open steps left.',
      mandatory: 'required', evidenceN: '{n} evidence file(s)', next: 'Next step'
    }
  };

  // The texts share one table with the editor (app.js): every key gets the prefix r_, so that none of
  // the editor's own texts (nSteps, cancel, ...) is overwritten. Only the label of the tab keeps its name.
  var TEXT = { de: {}, en: {} };
  ['de', 'en'].forEach(function (l) { Object.keys(RAW[l]).forEach(function (k) { TEXT[l][k === 'vRun' ? k : 'r_' + k] = RAW[l][k]; }); });

  var c, R = { runs: [], run: null, tab: 'run', cur: null, pending: null, done: null, error: '', scope: 'manual', files: 'all', form: {}, allDone: false };
  var IMG = /\.(png|jpe?g|gif|webp)$/i;
  // The browser demo answers the API in process (window.gherkitFetch): there is no server to link to, and its
  // virtual folder holds text only, so attachments are not offered there.
  function demo() { return typeof window.gherkitFetch === 'function'; }

  function load(key) { try { return localStorage.getItem('gherkit.run.' + key) || ''; } catch (e) { return ''; } }
  function store(key, v) { try { localStorage.setItem('gherkit.run.' + key, v); } catch (e) { } }
  function lang() { return document.documentElement.lang || 'en'; }
  function root() { return c.$('view-run'); }
  function url(path) { return '/api/manual/runs/' + encodeURIComponent(R.run.id) + path; }
  function evidenceUrl(rel) { return url('/' + rel.split('/').map(encodeURIComponent).join('/')); }
  function t(k, n) { return c.t('r_' + k, n); }

  // ---------- the model of a run, as the server's exporter sees it ----------
  // After a failed or ignored step the rest of the case counts as skipped; steps nobody judged are "undefined".
  function eff(cs) {
    var stopped = false;
    return cs.steps.map(function (s) {
      var st = s.status || (stopped ? 'skipped' : 'undefined');
      if (s.status === 'failed' || s.status === 'ignored') stopped = true;
      return st;
    });
  }
  function settled(cs) { return eff(cs).indexOf('undefined') < 0; }
  function caseState(cs) {
    var e = eff(cs), failed = false, ign = false, open = false, started = false;
    e.forEach(function (x, i) {
      if (x === 'failed') failed = true; else if (x === 'ignored') ign = true; else if (x === 'undefined') open = true;
      if (cs.steps[i].status) started = true;
    });
    if (failed) return 'failed';
    if (ign) return 'ignored';
    if (open) return started ? 'running' : 'open';
    return 'passed';
  }
  function progress(run) {
    var done = 0, total = 0;
    run.cases.forEach(function (cs) { eff(cs).forEach(function (x) { total++; if (x !== 'undefined') done++; }); });
    return { done: done, total: total };
  }
  function isFinished(run) { return !!run.finished && run.finished.indexOf('0001-') !== 0; }
  function caseIndex(run, id) { for (var i = 0; i < run.cases.length; i++) if (run.cases[i].id === id) return i; return -1; }
  function firstOpen(cs) { return eff(cs).indexOf('undefined'); }
  // The step that comes next: the open steps of the same case first, then the next scenario with open steps.
  function nextPos(run, ci, si) {
    var cs = run.cases[ci], e = eff(cs), j;
    for (j = si + 1; j < e.length; j++) if (e[j] === 'undefined') return { c: cs.id, s: j };
    j = e.indexOf('undefined');
    if (j >= 0) return { c: cs.id, s: j };
    for (var k = 1; k <= run.cases.length; k++) {
      var other = run.cases[(ci + k) % run.cases.length], o = firstOpen(other);
      if (o >= 0) return { c: other.id, s: o };
    }
    return null;
  }
  function startPos(run) {
    for (var i = 0; i < run.cases.length; i++) { var o = firstOpen(run.cases[i]); if (o >= 0) return { c: run.cases[i].id, s: o }; }
    return null;
  }
  function features(run) {
    var out = [], by = {};
    run.cases.forEach(function (cs) {
      if (!by[cs.uri]) { by[cs.uri] = { uri: cs.uri, name: cs.feature || cs.uri, cases: [] }; out.push(by[cs.uri]); }
      by[cs.uri].cases.push(cs);
    });
    return out;
  }
  // The reason of a failed or ignored case: the comment of that step.
  function note(cs) {
    for (var i = 0; i < cs.steps.length; i++) {
      var s = cs.steps[i];
      if (s.status === 'failed' || s.status === 'ignored') return { step: s, text: s.comment || '' };
    }
    return null;
  }
  function stateLabel(st) { return t({ passed: 'sPassed', failed: 'sFailed', ignored: 'sIgnored', open: 'sOpen', running: 'sRunning', skipped: 'sSkipped', undefined: 'sOpen' }[st]); }

  // ---------- loading ----------
  function loadRuns() { return c.api('GET', '/api/manual/runs').then(function (l) { R.runs = l || []; }); }
  function show() {
    if (R.run) { render(); return; }
    loadRuns().then(render);
  }

  // ---------- rendering ----------
  function render() {
    var host = root(), top = host.scrollTop;
    // text typed but not saved yet must survive a redraw, e.g. after an upload
    var typed = {}, active = document.activeElement, focusKey = '', caret = 0;
    host.querySelectorAll('textarea[data-key]').forEach(function (ta) { typed[ta.dataset.key] = ta.value; });
    if (active && active.dataset && active.dataset.key && host.contains(active)) { focusKey = active.dataset.key; caret = active.selectionStart; }
    host.innerHTML = '';
    host.appendChild(R.run ? renderRun() : renderHome());
    host.querySelectorAll('textarea[data-key]').forEach(function (ta) {
      if (typed[ta.dataset.key] !== undefined && !ta.disabled) { ta.value = typed[ta.dataset.key]; ta.dispatchEvent(new Event('input')); }
      if (ta.dataset.key === focusKey) { ta.focus(); try { ta.setSelectionRange(caret, caret); } catch (e) { } }
    });
    host.scrollTop = top;
  }

  function field(label, input) { return c.el('label', { class: 'rn-field' }, [c.el('span', { text: label }), input]); }

  // The report is a page of its own. With a server a plain link does it; in the demo the page is fetched and
  // shown from a blob URL.
  function reportLink(id, domId) {
    var href = '/api/manual/runs/' + encodeURIComponent(id) + '/report?lang=' + lang();
    var a = c.el('a', { class: 'rn-link', id: domId || null, href: href, target: '_blank', rel: 'noopener', text: t('runReport') });
    if (demo()) a.addEventListener('click', function (e) {
      e.preventDefault();
      fetch(href).then(function (r) { return r.text(); }).then(function (html) { window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank'); });
    });
    return a;
  }

  function renderHome() {
    var el = c.el, S = c.S;
    var tester = el('input', { id: 'rn-tester', value: R.form.tester !== undefined ? R.form.tester : load('tester'), autocomplete: 'name' });
    var env = el('input', { id: 'rn-env', value: R.form.env !== undefined ? R.form.env : load('env') });
    var build = el('input', { id: 'rn-build', value: R.form.build !== undefined ? R.form.build : load('build') });
    var title = el('input', { id: 'rn-title', value: R.form.title || '' });
    var scope = el('select', { id: 'rn-scope' }, [el('option', { value: 'manual', text: t('scopeManual') }), el('option', { value: 'all', text: t('scopeAll') })]);
    scope.value = R.scope;
    var files = el('select', { id: 'rn-files' }, [el('option', { value: 'current', text: t('filesCurrent') + (S.path ? ' (' + S.path + ')' : '') }), el('option', { value: 'all', text: t('filesAll') })]);
    files.value = S.path ? R.files : 'all';
    var err = el('div', { class: 'rn-error', id: 'rn-error', role: 'alert', text: R.error });
    var start = el('button', {
      class: 'primary', id: 'rn-start', text: t('runStart'), onclick: function () {
        R.form = { tester: tester.value, env: env.value, build: build.value, title: title.value };
        R.scope = scope.value; R.files = files.value;
        if (!tester.value.trim()) { R.error = t('needTester'); render(); return; }
        store('tester', tester.value); store('env', env.value); store('build', build.value);
        var body = { tester: tester.value, environment: env.value, build: build.value, title: title.value, tag: scope.value === 'manual' ? '@manual' : '' };
        if (files.value === 'current' && S.path) body.files = [S.path];
        c.api('POST', '/api/manual/runs', body).then(function (run) { R.error = ''; enter(run); })
          .catch(function (e) { R.error = e.message; render(); });
      }
    });
    var form = el('form', { class: 'rn-card', onsubmit: function (e) { e.preventDefault(); } }, [
      el('h2', { text: t('runNew') }),
      el('div', { class: 'rn-grid' }, [field(t('runTester'), tester), field(t('runEnv'), env), field(t('runBuild'), build), field(t('runTitle'), title), field(t('runScope'), scope), field(t('runFiles'), files)]),
      err, el('div', { class: 'rn-actions' }, [start])
    ]);

    var list = el('ul', { class: 'rn-runs', id: 'rn-runs' });
    if (!R.runs.length) list.appendChild(el('li', { class: 'rn-none', text: t('runNone') }));
    R.runs.forEach(function (r) {
      list.appendChild(el('li', {}, [
        el('span', { class: 'rn-run-name', text: (r.title || r.id) }),
        el('span', { class: 'rn-muted', text: r.tester + ' · ' + new Date(r.started).toLocaleString() }),
        el('span', { class: 'rn-badge ' + (r.finished ? 'passed' : 'running'), text: r.finished ? t('runDone') : t('runRunning') }),
        el('span', { class: 'rn-muted', text: r.done + '/' + r.total }),
        el('button', { text: r.finished ? t('runView') : t('runResume'), onclick: function () { openRun(r.id); } }),
        reportLink(r.id)
      ]));
    });
    return el('div', { class: 'rn' }, [form, el('div', { class: 'rn-card' }, [el('h2', { text: t('runPrev') }), list])]);
  }

  function enter(run) {
    R.run = run; R.done = null; R.pending = null; R.allDone = false; R.tab = isFinished(run) ? 'overview' : 'run';
    R.cur = startPos(run);
    render();
  }
  function openRun(id) { c.api('GET', '/api/manual/runs/' + encodeURIComponent(id)).then(enter); }

  function renderRun() {
    var el = c.el, run = R.run, fin = isFinished(run), p = progress(run);
    var back = el('button', { id: 'rn-back', text: '← ' + t('runBack'), onclick: function () { R.run = null; R.done = null; loadRuns().then(render); } });
    var finish = fin ? null : el('button', {
      class: R.allDone ? 'primary' : '', id: 'rn-finish', text: t('runFinish'), onclick: function () {
        var open = p.total - p.done;
        if (open > 0 && !confirm(t('openSteps', open))) return;
        c.api('POST', url('/finish')).then(function (r) { R.run = r.run; R.done = r.cucumber; R.tab = 'overview'; R.pending = null; render(); }).catch(function (e) { alert(e.message); });
      }
    });
    var bar = el('div', { class: 'rn-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': p.total, 'aria-valuenow': p.done }, [el('span', { style: 'width:' + (p.total ? Math.round(p.done * 100 / p.total) : 0) + '%' })]);
    var tabs = el('div', { class: 'seg rn-tabs', role: 'tablist' }, [
      el('button', { id: 'rn-tab-run', role: 'tab', 'aria-pressed': String(R.tab === 'run'), text: t('tabRun'), onclick: function () { R.tab = 'run'; render(); } }),
      el('button', { id: 'rn-tab-overview', role: 'tab', 'aria-pressed': String(R.tab === 'overview'), text: t('tabOverview'), onclick: function () { R.tab = 'overview'; render(); } })
    ]);
    var head = el('div', { class: 'rn-head' }, [
      back,
      el('div', { class: 'rn-head-main' }, [
        el('strong', { text: run.title || run.id }),
        el('span', { class: 'rn-muted', text: [run.tester, run.environment, run.build].filter(Boolean).join(' · ') })
      ]),
      tabs,
      el('span', { class: 'rn-muted', id: 'rn-progress', text: p.done + '/' + p.total + ' ' + t('nSteps') }), bar, reportLink(run.id, 'rn-report'), finish
    ]);
    var kids = [head];
    if (run.skipped && run.skipped.length) kids.push(el('div', { class: 'rn-banner warn', id: 'rn-skipped' }, [el('strong', { text: t('skippedFiles') }), el('ul', {}, run.skipped.map(function (m) { return el('li', { text: m }); }))]));
    if (R.done) kids.push(el('div', { class: 'rn-banner', id: 'rn-banner' }, [t('finished') + ' ', el('code', { text: R.done })]));
    else if (fin) kids.push(el('div', { class: 'rn-banner', id: 'rn-banner', text: t('readOnly') }));
    else if (R.allDone) kids.push(el('div', { class: 'rn-banner', id: 'rn-alldone', text: t('allDone') }));
    kids.push(R.tab === 'overview' ? renderOverview(run) : renderGuided(run, fin));
    return el('div', { class: 'rn rn-wide' }, kids);
  }

  // ---------- guided run ----------
  function renderGuided(run, fin) {
    var el = c.el;
    if (!R.cur || caseIndex(run, R.cur.c) < 0) R.cur = startPos(run) || { c: run.cases[0].id, s: 0 };
    var ci = caseIndex(run, R.cur.c), cs = run.cases[ci];
    var feats = features(run);

    var nav = el('nav', { class: 'rn-nav', 'aria-label': t('feature') });
    feats.forEach(function (f, fi) {
      var done = f.cases.filter(settled).length;
      nav.appendChild(el('div', { class: 'rn-nav-feat' }, [el('span', { class: 'rn-nav-name', text: f.name }), el('span', { class: 'rn-muted', text: done + '/' + f.cases.length })]));
      f.cases.forEach(function (x) {
        var st = caseState(x), cur = x.id === cs.id;
        nav.appendChild(el('button', {
          class: 'rn-nav-case ' + st + (cur ? ' current' : ''), id: 'nav-' + x.id, 'aria-current': cur ? 'step' : null, title: x.name + (x.example ? ' – ' + x.example : ''),
          onclick: function () { R.pending = null; var o = firstOpen(x); R.cur = { c: x.id, s: o >= 0 ? o : 0 }; render(); }
        }, [el('span', { class: 'rn-dot ' + st, 'aria-hidden': 'true' }), el('span', { class: 'rn-nav-title' }, [x.name, x.example ? el('small', { class: 'rn-muted', text: ' ' + x.example }) : null]), el('span', { class: 'rn-muted', text: stateLabel(st) })]));
      });
    });

    var fi = 0; feats.forEach(function (f, i) { if (f.uri === cs.uri) fi = i; });
    var inFeat = feats[fi].cases.indexOf(cs) + 1;
    var crumb = el('div', { class: 'rn-crumb', id: 'rn-crumb' }, [
      el('span', { text: t('feature') + ' ' + (fi + 1) + ' ' + t('ofN') + ' ' + feats.length + ': ' + feats[fi].name }),
      el('span', { text: ' › ' + t('scenario') + ' ' + inFeat + ' ' + t('ofN') + ' ' + feats[fi].cases.length }),
      el('span', { text: ' › ' + t('step') + ' ' + (R.cur.s + 1) + ' ' + t('ofN') + ' ' + cs.steps.length })
    ]);
    var st = caseState(cs);
    var card = el('section', { class: 'rn-case ' + st, id: 'case-' + cs.id }, [
      el('div', { class: 'rn-case-head' }, [el('span', { class: 'rn-badge ' + st, text: stateLabel(st) }), el('h2', { class: 'rn-case-name', text: cs.name }), cs.example ? el('span', { class: 'rn-muted rn-example', id: 'rn-example', text: cs.example }) : null])
    ]);
    var ol = el('ol', { class: 'rn-steps' });
    var e = eff(cs);
    cs.steps.forEach(function (s, i) {
      var isCur = i === R.cur.s;
      ol.appendChild(isCur && !fin ? renderFocus(cs, s, i) : renderCompact(cs, s, i, e[i], fin));
    });
    card.appendChild(ol);
    return el('div', { class: 'rn-guided' }, [nav, el('div', { class: 'rn-main' }, [crumb, card])]);
  }

  function evidenceBlock(s) {
    var el = c.el;
    if (!s.evidence || !s.evidence.length) return null;
    return el('div', { class: 'rn-evidence' }, s.evidence.map(function (rel) {
      return el('a', { href: evidenceUrl(rel), target: '_blank', rel: 'noopener', title: rel }, [IMG.test(rel) ? el('img', { src: evidenceUrl(rel), alt: rel }) : null, el('span', { text: rel.replace(/^evidence\//, '') })]);
    }));
  }

  // A step that is not the current one: a line with its result; a click makes it current again.
  function renderCompact(cs, s, i, st, fin) {
    var el = c.el, icon = { passed: '✓', failed: '✗', ignored: '⏭', skipped: '·', undefined: '○' }[st] || '○';
    var li = el('li', { class: 'rn-step ' + st, id: 'step-' + cs.id + '-' + i }, []);
    var line = el('div', { class: 'rn-step-line' }, [
      el('span', { class: 'rn-icon', 'aria-hidden': 'true', text: icon }),
      el('span', { class: 'rn-step-text' }, [el('span', { class: 'rn-kw', text: s.keyword.trim() }), ' ' + s.text])
    ]);
    if (!fin) line.appendChild(el('button', { class: 'rn-link-btn', text: t('change'), onclick: function () { R.pending = null; R.cur = { c: cs.id, s: i }; render(); } }));
    if (s.status === 'failed') line.appendChild(el('button', { class: 'rn-link-btn rs-jira', text: t('jira'), onclick: function () { showJira(cs.id, i); } }));
    li.appendChild(line);
    if (s.rows && s.rows.length && st !== 'skipped') li.appendChild(el('table', { class: 'rn-table' }, s.rows.map(function (r) { return el('tr', {}, r.map(function (x) { return el('td', { text: x }); })); })));
    if (s.comment) li.appendChild(el('div', { class: 'rn-note', text: s.comment }));
    var ev = evidenceBlock(s);
    if (ev) li.appendChild(ev);
    return li;
  }

  // The current step: what to do, room for comment and evidence, and the three answers.
  function renderFocus(cs, s, i) {
    var el = c.el, key = cs.id + '-' + i;
    var pend = R.pending && R.pending.key === key ? R.pending.status : '';
    var li = el('li', { class: 'rn-step rn-focus ' + (pend || (s.status || 'open')), id: 'rn-focus' });
    li.appendChild(el('div', { class: 'rn-step-text big' }, [el('span', { class: 'rn-kw', text: s.keyword.trim() }), ' ' + s.text]));
    if (s.rows && s.rows.length) li.appendChild(el('table', { class: 'rn-table' }, s.rows.map(function (r) { return el('tr', {}, r.map(function (x) { return el('td', { text: x }); })); })));
    if (s.docString) li.appendChild(el('pre', { class: 'rn-doc', text: s.docString }));

    var label = pend === 'failed' ? t('whyBad') : pend === 'ignored' ? t('whyIgnore') : t('infoLabel');
    var ta = el('textarea', { id: 'rn-comment', class: 'rs-comment' + (pend ? ' required' : ''), rows: pend ? 3 : 2, 'data-key': key, placeholder: pend === 'failed' ? t('reasonPh') : t('infoPh'), 'aria-label': label });
    ta.value = s.comment || '';
    li.appendChild(el('label', { class: 'rn-label', for: 'rn-comment', text: label }));
    li.appendChild(ta);

    var buttons;
    if (pend) {
      var ok = el('button', { id: 'rn-confirm', class: 'primary', text: pend === 'failed' ? t('saveBad') : t('saveIgnore'), disabled: true, onclick: function () { record(cs.id, i, pend, ta.value); } });
      var sync = function () { ok.disabled = !ta.value.trim(); };
      ta.addEventListener('input', sync); sync();
      buttons = [ok, el('button', { id: 'rn-cancel', text: t('cancel'), onclick: function () { R.pending = null; render(); } })];
      setTimeout(function () { var x = document.getElementById('rn-comment'); if (x && !x.disabled) x.focus(); }, 0);
    } else {
      buttons = [
        el('button', { id: 'rn-good', class: 'rn-b rs-pass primary', text: '✓ ' + t('good'), onclick: function () { record(cs.id, i, 'passed', ta.value); } }),
        el('button', { id: 'rn-bad', class: 'rn-b rs-fail', text: '✗ ' + t('bad'), onclick: function () { R.pending = { key: key, status: 'failed' }; render(); } }),
        el('button', { id: 'rn-ignore', class: 'rn-b rs-ignore', text: '⏭ ' + t('ignore'), onclick: function () { R.pending = { key: key, status: 'ignored' }; render(); } })
      ];
      if (s.status) buttons.push(el('button', { id: 'rn-clear', class: 'rn-b rs-clear', text: '↺ ' + t('clear'), onclick: function () { record(cs.id, i, '', ''); } }));
    }
    if (!demo()) {
      var inp = el('input', { type: 'file', multiple: true, class: 'rs-file', 'aria-label': t('attach'), onchange: function () { upload(cs.id, i, [].map.call(inp.files, function (f) { return { file: f, name: f.name }; })); } });
      li.appendChild(el('div', { class: 'rn-attach' }, [el('span', { class: 'rn-muted', text: '📎 ' + t('attach') + ' ' + t('pasteHint') }), inp]));
      ta.addEventListener('paste', function (e) {
        var files = [].filter.call((e.clipboardData && e.clipboardData.files) || [], function (f) { return f.type.indexOf('image/') === 0; });
        if (!files.length) return;
        e.preventDefault();
        upload(cs.id, i, files.map(function (f, n) { return { file: f, name: f.name && f.name !== 'image.png' ? f.name : 'screenshot-' + Date.now() + (n ? '-' + n : '') + '.png' }; }));
      });
    }
    var ev = evidenceBlock(s);
    if (ev) li.appendChild(ev);
    li.appendChild(el('div', { class: 'rn-btns', role: 'group' }, buttons));
    return li;
  }

  // ---------- results overview ----------
  function renderOverview(run) {
    var el = c.el, p = progress(run), cnt = { passed: 0, failed: 0, ignored: 0, open: 0 };
    run.cases.forEach(function (cs) { var s = caseState(cs); cnt[s === 'running' ? 'open' : s]++; });
    var tile = function (cls, label, n, id) { return el('div', { class: 'rn-tile ' + cls, id: id }, [el('b', { text: String(n) }), el('span', { text: label })]); };
    var tiles = el('div', { class: 'rn-tiles' }, [
      tile('', t('nScenarios'), run.cases.length, 'ov-total'),
      tile('passed', t('sPassed'), cnt.passed, 'ov-passed'), tile('failed', t('sFailed'), cnt.failed, 'ov-failed'),
      tile('ignored', t('sIgnored'), cnt.ignored, 'ov-ignored'), tile('open', t('sOpen'), cnt.open, 'ov-open'),
      tile('', t('nSteps'), p.done + '/' + p.total, 'ov-steps')
    ]);
    var out = [tiles];
    features(run).forEach(function (f) {
      var table = el('table', { class: 'rn-ov' }, [el('thead', {}, [el('tr', {}, [t('colScenario'), t('colResult'), t('colSteps'), t('colNote'), ''].map(function (h) { return el('th', { text: h }); }))])]);
      var body = el('tbody');
      f.cases.forEach(function (cs) {
        var st = caseState(cs), n = note(cs), e = eff(cs), done = e.filter(function (x) { return x !== 'undefined'; }).length;
        var nEv = 0; cs.steps.forEach(function (s) { nEv += (s.evidence || []).length; });
        var actions = el('td', { class: 'rn-ov-actions' }, []);
        if (!isFinished(run)) actions.appendChild(el('button', { class: 'rn-link-btn', text: t('jump'), onclick: function () { var o = firstOpen(cs); var fs = n ? cs.steps.indexOf(n.step) : -1; R.cur = { c: cs.id, s: o >= 0 ? o : (fs >= 0 ? fs : 0) }; R.tab = 'run'; R.pending = null; render(); } }));
        if (st === 'failed') actions.appendChild(el('button', { class: 'rn-link-btn rs-jira', text: t('jira'), onclick: function () { showJira(cs.id, -1); } }));
        body.appendChild(el('tr', { id: 'ov-' + cs.id, class: st }, [
          el('td', {}, [cs.name, cs.example ? el('div', { class: 'rn-muted', text: cs.example }) : null]),
          el('td', {}, [el('span', { class: 'rn-badge ' + st, text: stateLabel(st) })]),
          el('td', { class: 'rn-muted', text: done + '/' + cs.steps.length }),
          el('td', {}, n ? [el('div', { class: 'rn-ov-step', text: n.step.keyword.trim() + ' ' + n.step.text }), el('div', { text: n.text }), nEv ? el('div', { class: 'rn-muted', text: '📎 ' + t('evidenceN', nEv) }) : null] : (nEv ? [el('div', { class: 'rn-muted', text: '📎 ' + t('evidenceN', nEv) })] : [])),
          actions
        ]));
      });
      table.appendChild(body);
      out.push(el('section', { class: 'rn-card' }, [el('h2', { text: f.name + ' ' }), table]));
    });
    return el('div', { class: 'rn-overview' }, out);
  }

  // ---------- Jira text ----------
  function showJira(caseId, step) {
    var el = c.el;
    c.api('GET', url('/issue?case=' + encodeURIComponent(caseId) + (step >= 0 ? '&step=' + step : '') + '&lang=' + lang())).then(function (is) {
      var dlg = el('dialog', { id: 'rn-jira', class: 'rn-dlg' });
      var sum = el('input', { id: 'rn-jira-summary', readonly: true, value: is.summary });
      var desc = el('textarea', { id: 'rn-jira-desc', readonly: true, rows: 16 });
      desc.value = is.description;
      var msg = el('span', { class: 'rn-muted', 'aria-live': 'polite' });
      var copy = function (src, label) {
        return el('button', {
          text: label, onclick: function () {
            var done = function () { msg.textContent = t('copied'); };
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(src.value).then(done, function () { src.select(); document.execCommand('copy'); done(); });
            else { src.select(); document.execCommand('copy'); done(); }
          }
        });
      };
      dlg.appendChild(el('form', { method: 'dialog', class: 'dlg' }, [
        el('h2', { text: t('jiraTitle') }),
        field(t('jiraSummary'), sum), field(t('jiraDesc'), desc),
        el('p', { class: 'rn-muted', text: (is.xray && is.xray.length ? t('jiraXray') + ' ' + is.xray.join(', ') + ' · ' : '') + t('jiraHint') }),
        el('div', { class: 'row end' }, [msg, copy(sum, t('copySummary')), copy(desc, t('copyDesc')), el('button', { class: 'primary', value: 'close', text: t('close') })])
      ]));
      dlg.addEventListener('close', function () { dlg.remove(); });
      document.body.appendChild(dlg);
      dlg.showModal();
    }).catch(function (e) { alert(e.message); });
  }

  // ---------- actions ----------
  function record(caseId, step, status, comment) {
    return c.api('PUT', url('/step'), { case: caseId, step: step, status: status, comment: comment }).then(function (run) {
      R.run = run; R.pending = null;
      if (status) {
        var ci = caseIndex(run, caseId), np = nextPos(run, ci, step);
        if (np) R.cur = np; else { R.cur = { c: caseId, s: step }; R.allDone = true; R.tab = 'overview'; }
      }
      render();
      var f = document.getElementById('rn-focus');
      if (f && f.scrollIntoView) f.scrollIntoView({ block: 'nearest' });
    }).catch(function (e) { alert(e.message); });
  }

  function upload(caseId, step, items) {
    return items.reduce(function (p, it) {
      return p.then(function () {
        return fetch(url('/evidence?case=' + encodeURIComponent(caseId) + '&step=' + step + '&name=' + encodeURIComponent(it.name)), { method: 'POST', body: it.file })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.statusText); R.run = j.run; }); });
      });
    }, Promise.resolve()).then(render).catch(function (e) { alert(t('uploadFailed') + ': ' + e.message); });
  }

  window.GherkitRun = {
    TEXT: TEXT,
    init: function (ctx) { c = ctx; },
    show: show,
    render: function () { if (c && R) render(); },
    state: R // for browser tests
  };
})();
