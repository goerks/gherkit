// gherkit web editor – "Run" view: people test scenarios by hand (ADR 0009).
//
// A manual run walks through test cases (pickles) step by step. Per step the
// tester records passed, failed or blocked, a comment and evidence. The server
// saves every change (.gherkit/runs/<id>/session.json) and exports Cucumber
// JSON when the run is finished. app.js hands over its helpers in init().
(function () {
  'use strict';

  var TEXT = {
    de: {
      vRun: 'Ausführen', runNew: 'Neuer manueller Lauf', runTester: 'Testende Person', runEnv: 'Umgebung (z. B. URL oder Stage)', runBuild: 'Build / Version',
      runTitle: 'Titel (optional)', runScope: 'Umfang', scopeManual: 'Nur Testfälle mit @manual', scopeAll: 'Alle Testfälle', runFiles: 'Features',
      filesCurrent: 'Aktuelles Feature', filesAll: 'Alle Features im Ordner', runStart: 'Lauf starten', runPrev: 'Bisherige Läufe', runNone: 'Noch keine Läufe.',
      runResume: 'Fortsetzen', runView: 'Ansehen', runReport: 'Bericht', runFinish: 'Lauf abschliessen', runBack: 'Zur Übersicht', runRunning: 'läuft', runDone: 'abgeschlossen',
      sPassed: 'Bestanden', sFailed: 'Fehlgeschlagen', sBlocked: 'Blockiert', sClear: 'Zurücksetzen', sOpen: 'offen',
      stepsDone: '{n} Schritte erledigt', allPass: 'Alle offenen Schritte bestanden', comment: 'Kommentar (bei Fehlern: was wurde beobachtet?)',
      attach: 'Nachweis anhängen', pasteHint: 'Screenshot mit Strg+V einfügen', openSteps: 'Es sind noch {n} Schritte offen. Trotzdem abschliessen?',
      finished: 'Lauf abgeschlossen. Ergebnis (Cucumber JSON):', needTester: 'Bitte die testende Person angeben.', noRun: 'Wähle oder starte einen Lauf.',
      cStatusPassed: 'bestanden', cStatusFailed: 'fehlgeschlagen', cStatusBlocked: 'blockiert', cStatusOpen: 'offen', uploadFailed: 'Anhang konnte nicht gespeichert werden',
      readOnly: 'Dieser Lauf ist abgeschlossen und nur noch lesbar.', addNote: '+ Kommentar / Nachweis', skippedFiles: 'Nicht im Lauf, weil fehlerhaft:'
    },
    en: {
      vRun: 'Run', runNew: 'New manual run', runTester: 'Tester', runEnv: 'Environment (e.g. URL or stage)', runBuild: 'Build / version',
      runTitle: 'Title (optional)', runScope: 'Scope', scopeManual: 'Only test cases tagged @manual', scopeAll: 'All test cases', runFiles: 'Features',
      filesCurrent: 'Current feature', filesAll: 'All features in the folder', runStart: 'Start run', runPrev: 'Previous runs', runNone: 'No runs yet.',
      runResume: 'Resume', runView: 'View', runReport: 'Report', runFinish: 'Finish run', runBack: 'Back to overview', runRunning: 'running', runDone: 'finished',
      sPassed: 'Passed', sFailed: 'Failed', sBlocked: 'Blocked', sClear: 'Reset', sOpen: 'open',
      stepsDone: '{n} steps done', allPass: 'Pass all open steps', comment: 'Comment (for failures: what did you observe?)',
      attach: 'Attach evidence', pasteHint: 'Paste a screenshot with Ctrl+V', openSteps: '{n} steps are still open. Finish anyway?',
      finished: 'Run finished. Result (Cucumber JSON):', needTester: 'Please enter the tester.', noRun: 'Pick or start a run.',
      cStatusPassed: 'passed', cStatusFailed: 'failed', cStatusBlocked: 'blocked', cStatusOpen: 'open', uploadFailed: 'The attachment could not be saved',
      readOnly: 'This run is finished and read-only.', addNote: '+ Comment / evidence', skippedFiles: 'Left out because of syntax errors:'
    }
  };

  var c, R = { runs: [], run: null, open: '', done: null, error: '', scope: 'manual', files: 'all', form: {}, expanded: {} };
  var IMG = /\.(png|jpe?g|gif|webp)$/i;
  // The browser demo answers the API in process (window.gherkitFetch): there is no server to link to, and its
  // virtual folder holds text only, so attachments are not offered there.
  function demo() { return typeof window.gherkitFetch === 'function'; }

  function load(key) { try { return localStorage.getItem('gherkit.run.' + key) || ''; } catch (e) { return ''; } }
  function store(key, v) { try { localStorage.setItem('gherkit.run.' + key, v); } catch (e) { } }

  function root() { return c.$('view-run'); }
  function url(path) { return '/api/manual/runs/' + encodeURIComponent(R.run.id) + path; }
  function evidenceUrl(rel) { return url('/' + rel.split('/').map(encodeURIComponent).join('/')); }

  // The report is a page of its own. With a server a plain link does it; in the demo the page is fetched and shown
  // from a blob URL.
  function reportLink(id, id2) {
    var href = '/api/manual/runs/' + encodeURIComponent(id) + '/report?lang=' + (document.documentElement.lang || 'en');
    var a = c.el('a', { class: 'rn-link', id: id2 || null, href: href, target: '_blank', rel: 'noopener', text: c.t('runReport') });
    if (demo()) a.addEventListener('click', function (e) {
      e.preventDefault();
      fetch(href).then(function (r) { return r.text(); }).then(function (html) { window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank'); });
    });
    return a;
  }

  function loadRuns() {
    return c.api('GET', '/api/manual/runs').then(function (l) { R.runs = l || []; });
  }
  function show() {
    if (R.run) { render(); return; }
    loadRuns().then(render);
  }

  // The status of a case as the exporter sees it: after a failed or blocked step
  // the rest counts as skipped. Only used for the summary badge.
  function caseStatus(cs) {
    var failed = false, blocked = false, open = 0;
    cs.steps.forEach(function (s) {
      if (s.status === 'failed') failed = true;
      else if (s.status === 'blocked') blocked = true;
      else if (!s.status) open++;
    });
    if (failed) return 'failed';
    if (blocked) return 'blocked';
    return open ? 'open' : 'passed';
  }
  function progress(run) {
    var done = 0, total = 0;
    run.cases.forEach(function (cs) { cs.steps.forEach(function (s) { total++; if (s.status) done++; }); });
    return { done: done, total: total };
  }
  function isFinished(run) { return !!run.finished && run.finished.indexOf('0001-') !== 0; }

  // ---------- rendering ----------
  function render() {
    var host = root();
    var top = host.scrollTop;
    // text typed but not saved yet (a comment is saved when the field loses focus)
    // must survive a redraw, e.g. after an upload
    var typed = {}, active = document.activeElement, focusKey = '', caret = 0;
    host.querySelectorAll('textarea[data-key]').forEach(function (ta) { typed[ta.dataset.key] = ta.value; });
    if (active && active.dataset && active.dataset.key && host.contains(active)) { focusKey = active.dataset.key; caret = active.selectionStart; }
    host.innerHTML = '';
    host.appendChild(R.run ? renderRun() : renderHome());
    host.querySelectorAll('textarea[data-key]').forEach(function (ta) {
      if (typed[ta.dataset.key] !== undefined && !ta.disabled) ta.value = typed[ta.dataset.key];
      if (ta.dataset.key === focusKey) { ta.focus(); try { ta.setSelectionRange(caret, caret); } catch (e) { } }
    });
    host.scrollTop = top;
  }

  function field(label, input) { return c.el('label', { class: 'rn-field' }, [c.el('span', { text: label }), input]); }

  function renderHome() {
    var t = c.t, el = c.el, S = c.S;
    var tester = el('input', { id: 'rn-tester', value: R.form.tester !== undefined ? R.form.tester : load('tester'), autocomplete: 'name' });
    var env = el('input', { id: 'rn-env', value: R.form.env !== undefined ? R.form.env : load('env') });
    var build = el('input', { id: 'rn-build', value: R.form.build !== undefined ? R.form.build : load('build') });
    var title = el('input', { id: 'rn-title', value: R.form.title || '' });
    var scope = el('select', { id: 'rn-scope' }, [el('option', { value: 'manual', text: t('scopeManual') }), el('option', { value: 'all', text: t('scopeAll') })]);
    scope.value = R.scope;
    var files = el('select', { id: 'rn-files' }, [el('option', { value: 'current', text: t('filesCurrent') + (S.path ? ' (' + S.path + ')' : '') }), el('option', { value: 'all', text: t('filesAll') })]);
    if (!S.path) { files.value = 'all'; } else files.value = R.files;
    var err = el('div', { class: 'rn-error', id: 'rn-error', role: 'alert', text: R.error });
    var start = el('button', {
      class: 'primary', id: 'rn-start', text: t('runStart'), onclick: function () {
        R.form = { tester: tester.value, env: env.value, build: build.value, title: title.value };
        R.scope = scope.value; R.files = files.value;
        if (!tester.value.trim()) { R.error = t('needTester'); render(); return; }
        store('tester', tester.value); store('env', env.value); store('build', build.value);
        var body = { tester: tester.value, environment: env.value, build: build.value, title: title.value, tag: scope.value === 'manual' ? '@manual' : '' };
        if (files.value === 'current' && S.path) body.files = [S.path];
        c.api('POST', '/api/manual/runs', body).then(function (run) { R.error = ''; R.run = run; R.open = run.cases[0] ? run.cases[0].id : ''; R.done = null; render(); })
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
        el('span', { class: 'rn-badge ' + (r.finished ? 'passed' : 'open'), text: r.finished ? t('runDone') : t('runRunning') }),
        el('span', { class: 'rn-muted', text: r.done + '/' + r.total }),
        el('button', { text: r.finished ? t('runView') : t('runResume'), onclick: function () { openRun(r.id); } }),
        reportLink(r.id)
      ]));
    });
    return el('div', { class: 'rn' }, [form, el('div', { class: 'rn-card' }, [el('h2', { text: t('runPrev') }), list])]);
  }

  function openRun(id) {
    c.api('GET', '/api/manual/runs/' + encodeURIComponent(id)).then(function (run) {
      R.run = run; R.done = null; R.error = '';
      var first = run.cases.filter(function (cs) { return caseStatus(cs) === 'open'; })[0] || run.cases[0];
      R.open = first ? first.id : '';
      render();
    });
  }

  function statusLabel(s) { return c.t({ passed: 'cStatusPassed', failed: 'cStatusFailed', blocked: 'cStatusBlocked', open: 'cStatusOpen' }[s]); }

  function renderRun() {
    var t = c.t, el = c.el, run = R.run, fin = isFinished(run), p = progress(run);
    var back = el('button', { id: 'rn-back', text: '← ' + t('runBack'), onclick: function () { R.run = null; R.done = null; loadRuns().then(render); } });
    var report = reportLink(run.id, 'rn-report');
    var finish = fin ? null : el('button', {
      class: 'primary', id: 'rn-finish', text: t('runFinish'), onclick: function () {
        var open = p.total - p.done;
        if (open > 0 && !confirm(t('openSteps').replace('{n}', open))) return;
        c.api('POST', url('/finish')).then(function (r) { R.run = r.run; R.done = r.cucumber; render(); }).catch(function (e) { alert(e.message); });
      }
    });
    var bar = el('div', { class: 'rn-bar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': p.total, 'aria-valuenow': p.done }, [el('span', { style: 'width:' + (p.total ? Math.round(p.done * 100 / p.total) : 0) + '%' })]);
    var head = el('div', { class: 'rn-head' }, [
      back,
      el('div', { class: 'rn-head-main' }, [
        el('strong', { text: run.title || run.id }),
        el('span', { class: 'rn-muted', text: [run.tester, run.environment, run.build].filter(Boolean).join(' · ') })
      ]),
      el('span', { class: 'rn-muted', id: 'rn-progress', text: p.done + '/' + p.total }), bar, report, finish
    ]);
    var kids = [head];
    if (run.skipped && run.skipped.length) kids.push(el('div', { class: 'rn-banner warn', id: 'rn-skipped' }, [el('strong', { text: t('skippedFiles') }), el('ul', {}, run.skipped.map(function (m) { return el('li', { text: m }); }))]));
    if (R.done) kids.push(el('div', { class: 'rn-banner', id: 'rn-banner' }, [t('finished') + ' ', el('code', { text: R.done })]));
    else if (fin) kids.push(el('div', { class: 'rn-banner', text: t('readOnly') }));
    run.cases.forEach(function (cs) { kids.push(renderCase(cs, fin)); });
    return el('div', { class: 'rn' }, kids);
  }

  function renderCase(cs, fin) {
    var t = c.t, el = c.el, st = caseStatus(cs), open = R.open === cs.id;
    var done = cs.steps.filter(function (s) { return s.status; }).length;
    var head = el('button', {
      class: 'rn-case-head', 'aria-expanded': String(open), onclick: function () { R.open = open ? '' : cs.id; render(); }
    }, [
      el('span', { class: 'rn-badge ' + st, text: statusLabel(st) }),
      el('span', { class: 'rn-case-name', text: cs.name }),
      el('span', { class: 'rn-muted', text: cs.feature + ' · ' + done + '/' + cs.steps.length })
    ]);
    var box = el('section', { class: 'rn-case ' + st, id: 'case-' + cs.id }, [head]);
    if (!open) return box;
    var ol = el('ol', { class: 'rn-steps' });
    cs.steps.forEach(function (s, i) { ol.appendChild(renderStep(cs, s, i, fin)); });
    box.appendChild(ol);
    if (!fin) box.appendChild(el('div', { class: 'rn-case-actions' }, [el('button', {
      class: 'rn-allpass', text: t('allPass'), onclick: function () {
        var todo = []; cs.steps.forEach(function (s, i) { if (!s.status) todo.push(i); });
        todo.reduce(function (pr, i) { return pr.then(function () { return record(cs.id, i, 'passed', '', true); }); }, Promise.resolve()).then(render);
      }
    })]));
    return box;
  }

  function renderStep(cs, s, i, fin) {
    var t = c.t, el = c.el, key = cs.id + '-' + i;
    var li = el('li', { class: 'rn-step ' + (s.status || 'open'), id: 'step-' + key });
    li.appendChild(el('div', { class: 'rn-step-text' }, [el('span', { class: 'rn-kw', text: s.keyword.trim() }), ' ' + s.text]));
    if (s.rows && s.rows.length) li.appendChild(el('table', { class: 'rn-table' }, s.rows.map(function (r) { return el('tr', {}, r.map(function (x) { return el('td', { text: x }); })); })));
    if (s.docString) li.appendChild(el('pre', { class: 'rn-doc', text: s.docString }));
    if (!fin) {
      var btn = function (status, cls, label) {
        return el('button', { class: 'rn-b ' + cls, 'aria-pressed': String(s.status === status), text: label, onclick: function () { record(cs.id, i, status, s.comment || '', false, key); } });
      };
      li.appendChild(el('div', { class: 'rn-btns', role: 'group' }, [
        btn('passed', 'rs-pass', '✓ ' + t('sPassed')), btn('failed', 'rs-fail', '✗ ' + t('sFailed')), btn('blocked', 'rs-block', '⛔ ' + t('sBlocked')),
        s.status ? el('button', { class: 'rn-b rs-clear', text: '↺ ' + t('sClear'), onclick: function () { record(cs.id, i, '', '', false); } }) : null
      ]));
    }
    var open = !!R.expanded[key] || !!s.comment || (s.evidence && s.evidence.length) || s.status === 'failed' || s.status === 'blocked';
    if (s.status && !open && !fin) {
      li.appendChild(el('button', { class: 'rn-more', text: t('addNote'), onclick: function () { R.expanded[key] = true; render(); } }));
    }
    if (s.status && open || s.comment) {
      var ta = el('textarea', { class: 'rs-comment', rows: 2, placeholder: t('comment'), 'data-key': key, disabled: fin || null });
      ta.value = s.comment || '';
      if (!fin) {
        ta.addEventListener('change', function () { record(cs.id, i, s.status, ta.value, false, key); });
        if (!demo()) ta.addEventListener('paste', function (e) {
          var files = [].filter.call((e.clipboardData && e.clipboardData.files) || [], function (f) { return f.type.indexOf('image/') === 0; });
          if (!files.length) return;
          e.preventDefault();
          upload(cs.id, i, files.map(function (f, n) { return { file: f, name: f.name && f.name !== 'image.png' ? f.name : 'screenshot-' + Date.now() + (n ? '-' + n : '') + '.png' }; }));
        });
      }
      li.appendChild(ta);
    }
    if (s.status && open && !fin && !demo()) {
      var inp = el('input', { type: 'file', multiple: true, class: 'rs-file', 'aria-label': t('attach'), onchange: function () { upload(cs.id, i, [].map.call(inp.files, function (f) { return { file: f, name: f.name }; })); } });
      li.appendChild(el('div', { class: 'rn-attach' }, [el('span', { class: 'rn-muted', text: '📎 ' + t('attach') + ' · ' + t('pasteHint') }), inp]));
    }
    if (s.evidence && s.evidence.length) {
      li.appendChild(el('div', { class: 'rn-evidence' }, s.evidence.map(function (rel) {
        var a = el('a', { href: evidenceUrl(rel), target: '_blank', rel: 'noopener', title: rel }, [IMG.test(rel) ? el('img', { src: evidenceUrl(rel), alt: rel }) : null, el('span', { text: rel.replace(/^evidence\//, '') })]);
        return a;
      })));
    }
    return li;
  }

  // ---------- actions ----------
  function record(caseId, step, status, comment, quiet, focusKey) {
    return c.api('PUT', url('/step'), { case: caseId, step: step, status: status, comment: comment }).then(function (run) {
      R.run = run;
      if (quiet) return;
      render();
      if (focusKey && (status === 'failed' || status === 'blocked')) {
        var ta = root().querySelector('textarea[data-key="' + focusKey + '"]');
        if (ta && !ta.value) ta.focus();
      }
    }).catch(function (e) { alert(e.message); });
  }

  function upload(caseId, step, items) {
    return items.reduce(function (p, it) {
      return p.then(function () {
        return fetch(url('/evidence?case=' + encodeURIComponent(caseId) + '&step=' + step + '&name=' + encodeURIComponent(it.name)), { method: 'POST', body: it.file })
          .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.statusText); R.run = j.run; }); });
      });
    }, Promise.resolve()).then(render).catch(function (e) { alert(c.t('uploadFailed') + ': ' + e.message); });
  }

  window.GherkitRun = {
    TEXT: TEXT,
    init: function (ctx) { c = ctx; },
    show: show,
    render: function () { if (c && R) render(); },
    state: R // for browser tests
  };
})();
