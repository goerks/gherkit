// gherkit web editor – three editing variants on one shared model.
//
// Source of truth is the Gherkin text. The server parses it with the
// official Cucumber parser (/api/parse) and returns AST, pickles, tokens and
// errors. Code view edits the text, Document view renders the AST, Structure
// view edits a copy of the AST and lets the server print it (/api/render).
(function () {
  'use strict';
  var HL = window.GherkitHL, esc = HL.esc;

  // ---------- i18n ----------
  var TEXT = {
    de: {
      vCode: 'Code', vDoc: 'Dokument', vStruct: 'Struktur', vSplit: 'Split', format: 'Formatieren', save: 'Speichern',
      problems: 'Probleme', outline: 'Gliederung', facts: 'Kennzahlen', filter: 'Filter…', newFeature: 'Neues Feature',
      switchFolder: 'Ordner wechseln', openFolder: 'Ordner öffnen', cancel: 'Abbrechen', openThis: 'Diesen Ordner öffnen',
      noFile: 'Wähle links ein Feature oder öffne einen anderen Ordner.', noFiles: 'Keine .feature-Dateien in diesem Ordner.',
      saved: 'gespeichert', unsaved: 'ungespeichert', saving: 'speichere…', formatted: 'formatiert', none: 'Keine Probleme',
      language: 'Sprache', scenarios: 'Szenarien', testcases: 'Testfälle', steps: 'Schritte', tags: 'Tags', rules: 'Regeln',
      workspaceSteps: 'Steps im Ordner', line: 'Zeile', edit: 'bearbeiten', testcasesFrom: 'ergibt {n} Testfälle',
      fixFirst: 'Die Struktur-Ansicht braucht gültiges Gherkin. Bitte zuerst diese Fehler beheben:', brokenDoc: 'Das Dokument enthält Syntaxfehler. Angezeigt wird der letzte gültige Stand.',
      name: 'Name', description: 'Beschreibung', tagsHint: 'Tags (mit Leerzeichen getrennt)', addScenario: '+ Szenario', addOutline: '+ Szenario-Vorlage',
      addBackground: '+ Hintergrund', addRule: '+ Regel', addStep: '+ Schritt', addExamples: '+ Beispiele', table: 'Tabelle', docstring: 'DocString',
      row: '+ Zeile', col: '+ Spalte', newFileName: 'Dateiname für das neue Feature (z. B. login.feature):', discard: 'Ungespeicherte Änderungen verwerfen?',
      folderFeatures: '{n} Features', fmtFailed: 'Formatieren nicht möglich: Syntaxfehler', comments: 'Kommentare',
      tagFilter: 'Nach Tag filtern', clearFilter: 'Filter aufheben', noMatch: 'Kein Szenario mit diesem Tag.',
      copy: 'Kopie', leftForm: 'Formular', leftFormTitle: 'Formular (Alt+1)', leftCodeTitle: 'Code (Alt+2)', tabDoc: 'Dokument', tabProblems: 'Probleme', tabCases: 'Testfälle', casesSummary: '{n} Testfälle aus {m} Szenarien', caseNo: 'Nr.', caseEx: 'Beispiele', caseVals: 'Werte', noCases: 'Keine Testfälle.', layoutCards: 'Karten', layoutList: 'Liste', layoutLabel: 'Darstellung', ruleHint: 'Die Szenarien dieser Regel stehen in der Liste links.', badOrder: 'Reihenfolge nicht erlaubt: Hintergrund steht zuerst, Szenarien vor den Regeln.', noName: '(ohne Namen)', featureItem: 'Funktionalität', openCase: 'Testfall ein-/ausklappen', leftCode: 'Code', splitLeftLabel: 'Linke Seite', stepHint: 'Enter: nächster Schritt · Alt+↑/↓: Schlüsselwort wechseln', chipTags: '+ Tags', chipDesc: '+ Beschreibung', kwTitle: 'Schlüsselwort wechseln (Klick, Umschalt+Klick rückwärts)', pasteHint: 'Aus Excel einfügen: Tabellenbereich kopieren und hier einfügen', duplicate: 'Duplizieren', fold: 'Auf-/zuklappen', splitHandle: 'Breite anpassen', nSteps: '{n} Schritte', nBlocks: '{n} Blöcke'
    },
    en: {
      vCode: 'Code', vDoc: 'Document', vStruct: 'Structure', vSplit: 'Split', format: 'Format', save: 'Save',
      problems: 'Problems', outline: 'Outline', facts: 'Facts', filter: 'Filter…', newFeature: 'New feature',
      switchFolder: 'Switch folder', openFolder: 'Open folder', cancel: 'Cancel', openThis: 'Open this folder',
      noFile: 'Pick a feature on the left or open another folder.', noFiles: 'No .feature files in this folder.',
      saved: 'saved', unsaved: 'unsaved', saving: 'saving…', formatted: 'formatted', none: 'No problems',
      language: 'Language', scenarios: 'Scenarios', testcases: 'Test cases', steps: 'Steps', tags: 'Tags', rules: 'Rules',
      workspaceSteps: 'Steps in folder', line: 'line', edit: 'edit', testcasesFrom: 'yields {n} test cases',
      fixFirst: 'The structure view needs valid Gherkin. Please fix these errors first:', brokenDoc: 'The document has syntax errors. Showing the last valid state.',
      name: 'Name', description: 'Description', tagsHint: 'Tags (space separated)', addScenario: '+ Scenario', addOutline: '+ Scenario Outline',
      addBackground: '+ Background', addRule: '+ Rule', addStep: '+ Step', addExamples: '+ Examples', table: 'Table', docstring: 'DocString',
      row: '+ Row', col: '+ Column', newFileName: 'File name for the new feature (e.g. login.feature):', discard: 'Discard unsaved changes?',
      folderFeatures: '{n} features', fmtFailed: 'Cannot format: syntax errors', comments: 'Comments',
      tagFilter: 'Filter by tag', clearFilter: 'Clear filter', noMatch: 'No scenario with this tag.',
      copy: 'copy', leftForm: 'Form', leftFormTitle: 'Form (Alt+1)', leftCodeTitle: 'Code (Alt+2)', tabDoc: 'Document', tabProblems: 'Problems', tabCases: 'Test cases', casesSummary: '{n} test cases from {m} scenarios', caseNo: 'No.', caseEx: 'Examples', caseVals: 'Values', noCases: 'No test cases.', layoutCards: 'Cards', layoutList: 'List', layoutLabel: 'Layout', ruleHint: 'The scenarios of this rule are in the list on the left.', badOrder: 'Order not allowed: Background comes first, scenarios before rules.', noName: '(no name)', featureItem: 'Feature', openCase: 'Toggle test case', leftCode: 'Code', splitLeftLabel: 'Left pane', stepHint: 'Enter: next step · Alt+↑/↓: change keyword', chipTags: '+ Tags', chipDesc: '+ Description', kwTitle: 'Change keyword (click, Shift+click backwards)', pasteHint: 'Paste from Excel: copy a cell range and paste it here', duplicate: 'Duplicate', fold: 'Collapse/expand', splitHandle: 'Adjust width', nSteps: '{n} steps', nBlocks: '{n} blocks'
    }
  };
  var lang = 'de';
  try { lang = localStorage.getItem('gherkit.lang') || ((navigator.language || 'de').slice(0, 2) === 'de' ? 'de' : 'en'); } catch (e) { }
  function t(k, n) { var s = (TEXT[lang] && TEXT[lang][k]) || TEXT.en[k] || k; return n === undefined ? s : s.replace('{n}', n); }
  function applyI18n() {
    document.documentElement.lang = lang;
    document.querySelectorAll('[data-i18n]').forEach(function (e) { e.textContent = t(e.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach(function (e) { e.title = t(e.dataset.i18nTitle); });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (e) { e.placeholder = t(e.dataset.i18nPh); });
    $('ui-lang').value = lang;
  }

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }
  function api(method, url, body) {
    return fetch(url, { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.statusText); return j; }); });
  }
  function debounce(fn, ms) { var h; return function () { clearTimeout(h); h = setTimeout(fn, ms); }; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  var idSeq = 0; function newId() { return 'n' + (++idSeq); }

  // ---------- state ----------
  var S = {
    root: '', files: [], path: '', text: '', saved: '', parsed: null, lastGood: null, diags: [],
    variant: 'code', dialect: null, dialectCode: '', steps: [], edit: null, tagFilter: '', folded: {}, opened: {}, focusKey: '', curPath: '', splitLeft: 'form', rightTab: 'doc', caseOpen: '', layout: 'cards', sel: ''
  };

  try { S.splitLeft = localStorage.getItem('gherkit.splitLeft') === 'code' ? 'code' : 'form'; } catch (e) { }
  try { var rt = localStorage.getItem('gherkit.rightTab'); if (['doc', 'problems', 'cases'].indexOf(rt) >= 0) S.rightTab = rt; S.layout = localStorage.getItem('gherkit.structLayout') === 'list' ? 'list' : 'cards'; } catch (e) { }
  function structActive() { return S.variant === 'struct' || (S.variant === 'split' && S.splitLeft === 'form'); }
  function codeActive() { return S.variant === 'code' || (S.variant === 'split' && S.splitLeft === 'code'); }

  function setStatus(msg, cls) { var s = $('status'); s.textContent = msg || ''; s.className = 'status ' + (cls || ''); }
  function dirty() { return S.text !== S.saved; }
  function updateDirty() { if (S.path) setStatus(dirty() ? '● ' + t('unsaved') : t('saved'), dirty() ? 'dirty' : ''); }

  // ---------- workspace & files ----------
  function loadWorkspace() {
    return api('GET', '/api/workspace').then(function (w) {
      S.root = w.root; S.files = w.files;
      $('ws-path').textContent = w.root;
      renderFiles();
      loadSteps();
    });
  }
  function loadSteps() { api('GET', '/api/steps').then(function (s) { S.steps = s || []; renderFacts(); }); }

  function renderFiles() {
    var ul = $('files'), q = $('filter').value.toLowerCase();
    ul.innerHTML = '';
    if (!S.files.length) { ul.appendChild(el('li', { class: 'dir', text: t('noFiles') })); return; }
    var lastDir = null;
    S.files.filter(function (f) { return f.toLowerCase().indexOf(q) >= 0; }).forEach(function (f) {
      var i = f.lastIndexOf('/'), dir = i >= 0 ? f.slice(0, i) : '', name = f.slice(i + 1);
      if (dir !== lastDir) { ul.appendChild(el('li', { class: 'dir', text: dir || '.' })); lastDir = dir; }
      var a = el('a', { href: '#', class: f === S.path ? 'active' : '', title: f, text: name, 'data-path': f, onclick: function (e) { e.preventDefault(); openFile(f); } });
      ul.appendChild(el('li', {}, [a]));
    });
  }

  function openFile(path) {
    if (dirty() && !confirm(t('discard'))) return Promise.resolve();
    return api('GET', '/api/file?path=' + encodeURIComponent(path)).then(function (f) {
      S.path = f.path; S.text = f.content; S.saved = f.content; S.edit = null; S.lastGood = null; S.parsed = null; S.tagFilter = ''; S.folded = {}; S.opened = {}; S.caseOpen = ''; S.sel = '';
      var remembered = readLeftMap()[leftKey()]; if (remembered === 'form' || remembered === 'code') S.splitLeft = remembered;
      persist(); renderFiles(); showVariant(); setSource(S.text, true); updateDirty();
      return reparse();
    });
  }

  function save() {
    if (!S.path) return;
    setStatus(t('saving'));
    return api('PUT', '/api/file', { path: S.path, content: S.text }).then(function () {
      S.saved = S.text; updateDirty(); loadSteps();
    }).catch(function (e) { setStatus(e.message, 'dirty'); });
  }

  function formatSource() {
    return api('POST', '/api/format', { content: S.text }).then(function (r) {
      if (r.errors && r.errors.length) { setStatus(t('fmtFailed'), 'dirty'); return; }
      if (r.content !== S.text) { S.text = r.content; setSource(S.text, true); reparse(); }
      setStatus(t('formatted'));
      setTimeout(updateDirty, 1200);
    });
  }

  // ---------- parsing ----------
  var parseSeq = 0;
  function reparse() {
    var seq = ++parseSeq, text = S.text;
    return Promise.all([
      api('POST', '/api/parse', { path: S.path, content: text }),
      api('POST', '/api/lint', { path: S.path, content: text })
    ]).then(function (r) {
      if (seq !== parseSeq) return;
      S.parsed = r[0]; S.diags = r[1].diagnostics || [];
      if (!S.parsed.errors.length) S.lastGood = S.parsed;
      return ensureDialect(S.parsed.language).then(function () {
        renderCodeHL(); renderProblems(); renderOutline(); renderFacts();
        if (S.variant === 'doc' || S.variant === 'split') renderDoc();
        if (structActive() && !S.edit) renderStruct();
      });
    });
  }
  var reparseSoon = debounce(reparse, 150);

  function ensureDialect(code) {
    code = code || 'en';
    if (S.dialectCode === code && S.dialect) return Promise.resolve();
    return api('GET', '/api/dialects/' + encodeURIComponent(code)).then(function (d) { S.dialect = d.keywords; S.dialectCode = code; })
      .catch(function () { S.dialect = null; });
  }

  // ---------- variants ----------
  function showVariant() {
    document.querySelectorAll('.variants button').forEach(function (b) { b.setAttribute('aria-selected', String(b.dataset.variant === S.variant)); });
    var has = !!S.path, v = S.variant;
    $('empty').hidden = has;
    $('empty').textContent = S.files.length ? t('noFile') : t('noFiles');
    $('view-code').hidden = !has || !codeActive();
    $('view-doc').hidden = !has || !(v === 'doc' || v === 'split');
    $('view-struct').hidden = !has || !structActive();
    $('left-head').hidden = !(v === 'split' && has);
    $('left-code-tools').hidden = S.splitLeft !== 'code';
    document.querySelectorAll('#split-left button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.left === S.splitLeft)); });
    $('main').classList.toggle('split', v === 'split' && has);
    $('split-handle').hidden = !(v === 'split' && has);
    if (!has) return;
    if (v === 'doc' || v === 'split') renderDoc();
    if (structActive()) renderStruct();
    if (codeActive()) { setSource(S.text, false); renderCodeHL(); }
  }
  function setVariant(v) {
    if (structActive() && !(v === 'struct' || (v === 'split' && S.splitLeft === 'form'))) S.edit = null;
    S.variant = v; persist(); showVariant();
  }
  // Split: choose what the left half shows (form or code); the right half is always the preview.
  // The choice is remembered per file; the last choice is also the default for files without one.
  function leftKey() { return S.root + '|' + S.path; }
  function readLeftMap() { try { return JSON.parse(localStorage.getItem('gherkit.splitLeftByFile') || '{}') || {}; } catch (e) { return {}; } }
  function rememberLeft(side) {
    try {
      localStorage.setItem('gherkit.splitLeft', side);
      if (!S.path) return;
      var m = readLeftMap(), keys;
      m[leftKey()] = side; keys = Object.keys(m);
      if (keys.length > 300) delete m[keys[0]];
      localStorage.setItem('gherkit.splitLeftByFile', JSON.stringify(m));
    } catch (e) { }
  }
  // Positions in document order: every block and step with its path (c1, c1.s2, c2.c0.s1) and first line.
  function positions(doc) {
    var out = [], f = doc && doc.feature;
    if (!f) return out;
    function start(n) { var l = n.location.line; (n.tags || []).forEach(function (t) { if (t.location.line < l) l = t.location.line; }); return l; }
    function block(b, p) { out.push({ path: p, line: start(b) }); (b.steps || []).forEach(function (s, k) { out.push({ path: p + '.s' + k, line: s.location.line }); }); }
    f.children.forEach(function (c, i) {
      var p = 'c' + i;
      if (c.background) block(c.background, p);
      if (c.scenario) block(c.scenario, p);
      if (c.rule) {
        out.push({ path: p, line: start(c.rule) });
        c.rule.children.forEach(function (rc, j) { var q = p + '.c' + j; if (rc.background) block(rc.background, q); if (rc.scenario) block(rc.scenario, q); });
      }
    });
    return out;
  }
  function currentDoc() { var r = S.parsed && !S.parsed.errors.length ? S.parsed : S.lastGood; return r && r.document; }
  function pathAtLine(line) { var best = ''; positions(currentDoc()).forEach(function (x) { if (x.line <= line) best = x.path; }); return best; }
  function lineOfPath(path) { var hit = 0; positions(currentDoc()).forEach(function (x) { if (x.path === path) hit = x.line; }); return hit; }
  function focusLine(line) {
    var lines = src.value.split('\n'), pos = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    var end = pos + (lines[line - 1] || '').length;
    src.focus(); src.setSelectionRange(end, end);
    $('view-code').scrollTop = Math.max(0, (line - 6) * lineH);
    syncDocSoon();
  }
  // Split: choose what the left half shows (form or code); the right half is always the preview.
  // The place you are working at is taken along: the focused form step becomes the code cursor line and the other way round.
  // Switches run one after the other, so a quick second switch (Alt+1 then Alt+2) starts from the state the first one left.
  var leftQueue = Promise.resolve();
  function setLeft(side) {
    leftQueue = leftQueue.then(function () { return switchLeft(side); }).catch(function () { });
    return leftQueue;
  }
  function switchLeft(side) {
    if (side === S.splitLeft) return Promise.resolve();
    var from = S.splitLeft, line = 0, path = '', prep;
    if (from === 'form') {
      prep = syncNow().then(function () { if (S.curPath) line = lineOfPath(S.curPath); });
    } else {
      var caretLine = src.value.slice(0, src.selectionStart).split('\n').length;
      prep = reparse().then(function () { path = pathAtLine(caretLine); });
    }
    return prep.then(function () {
      if (from === 'form') S.edit = null;
      S.splitLeft = side; rememberLeft(side);
      showVariant();
      if (side === 'code' && line) focusLine(line);
      if (side === 'form' && path) focusForm(path);
    });
  }
  document.querySelectorAll('#split-left button').forEach(function (b) { b.addEventListener('click', function () { setLeft(b.dataset.left); }); });
  function persist() {
    var h = '#variant=' + S.variant + (S.path ? '&file=' + encodeURIComponent(S.path) : '');
    if (location.hash !== h) history.replaceState(null, '', h);
    try { localStorage.setItem('gherkit.variant', S.variant); } catch (e) { }
  }

  // ---------- code view ----------
  var src = $('src'), hl = $('hl'), gutter = $('gutter'), complete = $('complete');
  var lineH = 21, charW = 8.4;
  function measure() {
    var probe = el('span', { text: 'MMMMMMMMMM' }); probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    hl.appendChild(probe); charW = probe.getBoundingClientRect().width / 10 || charW; probe.remove();
    lineH = parseFloat(getComputedStyle(hl).lineHeight) || lineH;
  }
  function setSource(text, force) {
    if (force || src.value !== text) {
      var pos = src.selectionStart;
      src.value = text;
      if (!force) src.selectionStart = src.selectionEnd = Math.min(pos, text.length);
    }
    sizeEditor(); renderCodeHL();
  }
  function sizeEditor() {
    var lines = src.value.split('\n'), longest = 0;
    lines.forEach(function (l) { if (l.length > longest) longest = l.length; });
    src.style.height = (lines.length * lineH + 24) + 'px';
    src.style.width = 'max(100%, ' + Math.ceil(longest * charW + 40) + 'px)';
  }
  function renderCodeHL() {
    if (!S.path) return;
    var lines = src.value.split('\n');
    var tokens = S.hlFor === S.parsed && S.hlTokens ? S.hlTokens : (S.parsed ? S.parsed.tokens : []);
    var bad = new Set(), sev = {}, msgs = {};
    S.diags.forEach(function (d) {
      (msgs[d.line] = msgs[d.line] || []).push(d.message);
      if (d.severity === 'error') bad.add(d.line);
      var c = d.severity === 'error' ? 'err' : d.severity === 'warning' ? 'warn' : 'info';
      if (!sev[d.line] || c === 'err') sev[d.line] = c;
    });
    hl.innerHTML = HL.highlight(lines, tokens, bad);
    var g = '';
    for (var i = 1; i <= lines.length; i++) g += '<div class="' + (sev[i] || '') + '"' + (msgs[i] ? ' title="' + esc(msgs[i].join('\n')) + '"' : '') + '>' + i + '</div>';
    gutter.innerHTML = g;
  }
  function jumpTo(line) {
    if (!codeActive()) {
      if (S.variant === 'split') { setLeft('code').then(function () { jumpTo(line); }); return; }
      setVariant('code');
    }
    var lines = src.value.split('\n'), pos = 0;
    for (var i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    src.focus(); src.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
    $('view-code').scrollTop = Math.max(0, (line - 4) * lineH);
  }

  // Until the parser has answered, the colours of the old text would be applied to the new lines (garbled
  // keywords after pressing Enter). Move the tokens of unchanged lines along with the edit instead; the
  // lines that changed stay plain for a moment.
  function shiftTokens(prev, next) {
    var base = S.hlFor === S.parsed && S.hlTokens ? S.hlTokens : (S.parsed ? S.parsed.tokens : null);
    if (!base || !base.length) return;
    var a = prev.split('\n'), b = next.split('\n'), delta = b.length - a.length;
    if (delta === 0) return;
    var min = Math.min(a.length, b.length), p = 0, s = 0;
    while (p < min && a[p] === b[p]) p++;
    while (s < min - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
    S.hlTokens = base.filter(function (t) { return t.line <= p || t.line > a.length - s; }).map(function (t) {
      if (t.line <= p) return t;
      var m = {}; for (var k in t) m[k] = t[k]; m.line = t.line + delta; return m;
    });
    S.hlFor = S.parsed;
  }
  src.addEventListener('input', function () {
    shiftTokens(S.text, src.value);
    S.text = src.value; S.edit = null; sizeEditor(); renderCodeHL(); updateDirty(); reparseSoon(); suggest();
    if (S.variant === 'split') renderDocSoon();
  });
  src.addEventListener('keydown', function (e) {
    if (!complete.hidden) {
      var items = complete.querySelectorAll('li'), cur = complete.querySelector('li.sel'), idx = Array.prototype.indexOf.call(items, cur);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        idx = (idx + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (li, i) { li.classList.toggle('sel', i === idx); });
        items[idx].scrollIntoView({ block: 'nearest' });
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); accept(cur || items[0]); return; }
      if (e.key === 'Escape') { hideComplete(); return; }
    }
    var plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === 'Tab' && plain) {
      e.preventDefault();
      var multi = src.value.slice(src.selectionStart, src.selectionEnd).indexOf('\n') >= 0;
      if (multi) transformLines(function (l) { return e.shiftKey ? l.replace(/^ {1,2}/, '') : (l.trim() ? '  ' + l : l); });
      else autoTab(e.shiftKey);
    } else if (e.key === 'Enter' && plain && !e.shiftKey) {
      e.preventDefault(); autoEnter();
    } else if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key === '/') {
      e.preventDefault(); toggleComment();
    }
  });
  function insertText(text) {
    src.focus();
    if (!document.execCommand || !document.execCommand('insertText', false, text)) {
      src.setRangeText(text, src.selectionStart, src.selectionEnd, 'end'); src.dispatchEvent(new Event('input'));
    }
  }
  // ---------- automatic indentation ----------
  // The layout is the one the formatter prints: Feature 0, Rule and Scenario 2
  // (4 inside a Rule), steps and Examples one level deeper, tables and doc
  // strings one more. Enter and Tab put lines on that grid so nobody has to count spaces.
  function leadingLen(line) { return line.match(/^[ \t]*/)[0].length; }
  function spaces(n) { return new Array(n + 1).join(' '); }
  function kindOf(tr) {
    if (!tr) return 'blank';
    if (tr[0] === '#') return 'comment';
    if (tr[0] === '@') return 'tag';
    if (tr[0] === '|') return 'table';
    if (/^("""|```)/.test(tr)) return 'doc';
    var d = S.dialect; if (!d) return 'other';
    var map = { feature: 'feature', rule: 'rule', background: 'background', scenario: 'scenario', scenarioOutline: 'scenario', examples: 'examples' };
    for (var k in map) { var ws = d[k] || []; for (var i = 0; i < ws.length; i++) if (tr.indexOf(ws[i] + ':') === 0) return map[k]; }
    var st = stepKeywords();
    for (var j = 0; j < st.length; j++) if (st[j].trim() && tr.indexOf(st[j]) === 0) return 'step';
    return 'other';
  }
  // What is known about the document above line `upto`.
  function contextAt(lines, upto) {
    var c = { inDoc: false, docDelim: '', docIndent: 0, inRule: false, feature: false };
    for (var i = 0; i < upto; i++) {
      var raw = lines[i], tr = raw.trim();
      if (c.inDoc) { if (tr.indexOf(c.docDelim) === 0) c.inDoc = false; continue; }
      var k = kindOf(tr);
      if (k === 'doc') { c.inDoc = true; c.docDelim = tr.slice(0, 3); c.docIndent = leadingLen(raw); }
      else if (k === 'feature') c.feature = true;
      else if (k === 'rule') c.inRule = true;
    }
    return c;
  }
  function blockLevel(c) { return c.inRule ? 2 : 1; }
  function levelFor(kind, c) {
    switch (kind) {
      case 'feature': return 0;
      case 'rule': return 1;
      case 'background': case 'scenario': return blockLevel(c);
      case 'step': case 'examples': return blockLevel(c) + 1;
      case 'table': case 'doc': return blockLevel(c) + 2;
      default: return null;
    }
  }
  // Indentation (in spaces) a line belongs to, or null for free text such as descriptions and comments.
  function canonicalSpaces(lines, i, c) {
    var k = kindOf(lines[i].trim());
    if (k === 'tag') {
      for (var j = i + 1; j < lines.length; j++) {
        var k2 = kindOf(lines[j].trim());
        if (k2 === 'blank' || k2 === 'comment' || k2 === 'tag') continue;
        var lv = levelFor(k2, c); return lv === null ? null : lv * 2;
      }
      return c.feature ? blockLevel(c) * 2 : 0;
    }
    var l = levelFor(k, c); return l === null ? null : l * 2;
  }
  // Indentation of the line that follows line i (what Enter produces).
  function nextIndentAfter(lines, i) {
    var c = contextAt(lines, i), raw = lines[i], tr = raw.trim(), cur = leadingLen(raw);
    if (c.inDoc) return tr.indexOf(c.docDelim) === 0 ? Math.max(0, c.docIndent - 2) : cur;
    var k = kindOf(tr);
    if (k === 'doc') return cur;
    if (k === 'blank') return c.feature ? blockLevel(c) * 2 : 0;
    var base = canonicalSpaces(lines, i, c); if (base === null) base = cur;
    switch (k) {
      case 'feature': return 2;
      case 'rule': return 4;
      case 'background': case 'scenario': case 'examples': return base + 2;
      default: return base;
    }
  }
  function indentStops(c) { return c.feature ? (c.inRule ? [0, 2, 4, 6, 8] : [0, 2, 4, 6]) : [0, 2]; }
  function lineAt(v, p) {
    var ls = v.lastIndexOf('\n', p - 1) + 1;
    return { ls: ls, li: (v.slice(0, ls).match(/\n/g) || []).length };
  }
  function setIndent(ls, curLen, target, caret) {
    src.focus(); src.setSelectionRange(ls, ls + curLen); insertText(spaces(target));
    var np = caret >= ls + curLen ? caret + target - curLen : ls + target;
    src.setSelectionRange(np, np);
  }
  function autoEnter() {
    if (!S.dialect || src.selectionStart !== src.selectionEnd) { insertText('\n'); return; }
    var v = src.value, p = src.selectionStart, at = lineAt(v, p), ls = at.ls, li = at.li;
    var lines = v.split('\n'), raw = lines[li], lead = leadingLen(raw);
    if (raw.trim() && p - ls <= lead) { insertText('\n'); return; } // caret in the indentation: just push the line down
    var c = contextAt(lines, li);
    if (!c.inDoc) {
      var want = raw.trim() ? canonicalSpaces(lines, li, c) : 0; // an empty line loses its spaces
      if (want !== null && want !== lead) { setIndent(ls, lead, want, p); lines = src.value.split('\n'); }
    }
    insertText('\n' + spaces(nextIndentAfter(lines, li)));
  }
  function autoTab(back) {
    var v = src.value, p = src.selectionStart, at = lineAt(v, p), ls = at.ls, li = at.li;
    var lines = v.split('\n'), raw = lines[li], lead = leadingLen(raw), c = contextAt(lines, li);
    if (!S.dialect || c.inDoc) { // doc string content or unknown language: plain steps of two
      if (back) transformLines(function (l) { return l.replace(/^ {1,2}/, ''); }); else insertText('  ');
      return;
    }
    var kind = kindOf(raw.trim()), stops = indentStops(c), target;
    function smaller() { return stops.filter(function (x) { return x < lead; }).pop(); }
    function larger() { return stops.filter(function (x) { return x > lead; })[0]; }
    if (kind === 'blank') {
      var predicted = li > 0 && lines[li - 1].trim() ? nextIndentAfter(lines, li - 1) : (c.feature ? blockLevel(c) * 2 : 0);
      if (back) target = smaller();
      else target = lead < predicted ? predicted : larger();
      if (target === undefined) target = back ? 0 : stops[0];
    } else if (back) {
      target = smaller();
    } else {
      var want = canonicalSpaces(lines, li, c);
      if (want !== null && want !== lead) target = want;
      else if (p - ls <= lead) target = larger();
    }
    if (target !== undefined && target !== lead) setIndent(ls, lead, target, p);
  }
  // Apply fn to every line touched by the selection, keep the selection on them.
  function transformLines(fn) {
    var v = src.value, a = v.lastIndexOf('\n', src.selectionStart - 1) + 1, b = v.indexOf('\n', src.selectionEnd);
    if (b < 0) b = v.length;
    var out = v.slice(a, b).split('\n').map(fn).join('\n');
    src.focus(); src.setSelectionRange(a, b); insertText(out);
    src.setSelectionRange(a, a + out.length);
  }
  function toggleComment() {
    var v = src.value, a = v.lastIndexOf('\n', src.selectionStart - 1) + 1, b = v.indexOf('\n', src.selectionEnd);
    if (b < 0) b = v.length;
    var lines = v.slice(a, b).split('\n'), body = lines.filter(function (l) { return l.trim(); });
    var allCommented = body.length > 0 && body.every(function (l) { return /^\s*#/.test(l); });
    var indent = Math.min.apply(null, body.map(function (l) { return l.match(/^\s*/)[0].length; }).concat([1e9]));
    transformLines(function (l) {
      if (!l.trim()) return l;
      return allCommented ? l.replace(/^(\s*)# ?/, '$1') : l.slice(0, indent) + '# ' + l.slice(indent);
    });
  }
  // In Split, mark the document block that belongs to the cursor line.
  var syncDocSoon = debounce(syncDocToCursor, 80);
  function syncDocToCursor() {
    if (S.variant !== 'split' || S.splitLeft !== 'code') return;
    var line = src.value.slice(0, src.selectionStart).split('\n').length, best = null, bestLine = 0;
    var first = null;
    $('view-doc').querySelectorAll('[id^="n-"]').forEach(function (n) {
      var l = +n.id.slice(2); if (!first) first = n;
      if (l <= line && l >= bestLine) { best = n; bestLine = l; }
    });
    if (!best) best = first; // cursor on the tag line above "Feature:".
    var old = $('view-doc').querySelector('.cur'); if (old && old !== best) old.classList.remove('cur');
    if (best) { best.classList.add('cur'); best.scrollIntoView({ block: 'nearest' }); }
  }
  src.addEventListener('keyup', syncDocSoon);
  src.addEventListener('click', syncDocSoon);
  src.addEventListener('blur', function () { setTimeout(hideComplete, 150); });
  src.addEventListener('click', hideComplete);

  // ---------- completion ----------
  var completion = null;
  function keywordsAll() {
    var d = S.dialect || {}, out = [];
    ['feature', 'rule', 'background', 'scenario', 'scenarioOutline', 'examples'].forEach(function (k) {
      (d[k] || []).forEach(function (w) { out.push({ label: w + ':', insert: w + ': ', kind: k }); });
    });
    stepKeywords().forEach(function (w) { out.push({ label: w.trim(), insert: w, kind: 'step' }); });
    return out;
  }
  function stepKeywords() {
    var d = S.dialect || {}, seen = {}, out = [];
    ['given', 'when', 'then', 'and', 'but'].forEach(function (k) { (d[k] || []).forEach(function (w) { if (!seen[w]) { seen[w] = 1; out.push(w); } }); });
    return out;
  }
  function suggest() {
    var pos = src.selectionStart, text = src.value;
    var ls = text.lastIndexOf('\n', pos - 1) + 1, le = text.indexOf('\n', pos); if (le < 0) le = text.length;
    var before = text.slice(ls, pos), indent = before.match(/^\s*/)[0], typed = before.slice(indent.length);
    var list = [], from = 0, to = le - ls;
    if (!typed) { hideComplete(); return; }
    var kw = stepKeywords().filter(function (k) { return k.trim() !== '' && typed.indexOf(k) === 0; }).sort(function (a, b) { return b.length - a.length; })[0];
    if (kw) {
      var partial = typed.slice(kw.length).toLowerCase(), words = partial.split(/\s+/).filter(Boolean);
      if (!words.length) { hideComplete(); return; }
      S.steps.forEach(function (s) {
        var low = s.text.toLowerCase();
        if (low !== partial && words.every(function (w) { return low.indexOf(w) >= 0; })) list.push({ label: s.text, hint: '×' + s.count, insert: s.text });
      });
      from = indent.length + kw.length;
    } else if (/^[^\s:|@#"]+$/.test(typed) || /^\S+ \S*$/.test(typed) && typed.indexOf(':') < 0) {
      var low = typed.toLowerCase();
      keywordsAll().forEach(function (k) { if (k.label.toLowerCase().indexOf(low) === 0 && k.label.toLowerCase() !== low) list.push({ label: k.label, hint: k.kind, insert: k.insert }); });
      from = indent.length;
    }
    list = list.slice(0, 12);
    if (!list.length) { hideComplete(); return; }
    completion = { lineStart: ls, from: from, to: to };
    complete.innerHTML = '';
    list.forEach(function (it, i) {
      var li = el('li', { class: i === 0 ? 'sel' : '', role: 'option', onmousedown: function (e) { e.preventDefault(); accept(li); } }, [el('span', { text: it.label }), el('small', { text: it.hint })]);
      li.dataset.insert = it.insert; complete.appendChild(li);
    });
    var line = text.slice(0, ls).split('\n').length;
    complete.style.top = (10 + line * lineH) + 'px';
    complete.style.left = (14 + before.length * charW) + 'px';
    complete.hidden = false;
  }
  function accept(li) {
    if (!li || !completion) return;
    var c = completion, text = src.value;
    var start = c.lineStart + c.from, end = c.lineStart + c.to;
    src.focus(); src.setSelectionRange(start, end);
    if (!document.execCommand || !document.execCommand('insertText', false, li.dataset.insert)) src.setRangeText(li.dataset.insert, start, end, 'end');
    hideComplete();
    S.text = src.value; sizeEditor(); renderCodeHL(); updateDirty(); reparseSoon();
  }
  function hideComplete() { complete.hidden = true; completion = null; }

  // ---------- document view ----------
  function md(text) {
    var lines = String(text || '').split('\n'), min = Infinity;
    lines.forEach(function (l) { if (l.trim()) min = Math.min(min, l.match(/^\s*/)[0].length); });
    lines = lines.map(function (l) { return l.slice(min === Infinity ? 0 : min); });
    var html = '', para = [], list = [];
    function inline(s) {
      return esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
        .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    }
    function flush() {
      if (para.length) html += '<p>' + inline(para.join(' ')) + '</p>';
      if (list.length) html += '<ul>' + list.map(function (i) { return '<li>' + inline(i) + '</li>'; }).join('') + '</ul>';
      para = []; list = [];
    }
    lines.forEach(function (l) {
      var m = l.match(/^\s*[-*]\s+(.*)$/);
      if (!l.trim()) flush();
      else if (m) { if (para.length) { html += '<p>' + inline(para.join(' ')) + '</p>'; para = []; } list.push(m[1]); }
      else { if (list.length) flush(); para.push(l.trim()); }
    });
    flush();
    return html;
  }
  function picklesFor(id) { var n = 0; ((S.lastGood || {}).pickles || []).forEach(function (p) { if (p.astNodeIds[0] === id) n++; }); return n; }
  var renderDocSoon = debounce(function () { renderDoc(); }, 200);

  function renderDoc() {
    var view = $('view-doc'), res = S.parsed && !S.parsed.errors.length ? S.parsed : S.lastGood;
    if (!S.path) return;
    var split = S.variant === 'split', tabs = split ? rightTabs(res) : '';
    view.classList.toggle('has-tabs', split);
    function put(html) { view.innerHTML = split ? tabs + '<div class="rbody">' + html + '</div>' : html; }
    if (split && S.rightTab === 'problems') { put(problemsHtml()); return; }
    if (split && S.rightTab === 'cases') { put(casesHtml(res)); return; }
    var out = '<div class="doc">';
    if (S.parsed && S.parsed.errors.length) out += '<p class="broken">' + esc(t('brokenDoc')) + '</p>';
    if (!res || !res.document || !res.document.feature) { put(out + '</div>'); return; }
    var f = res.document.feature, comments = (res.document.comments || []).slice();
    var flt = S.tagFilter;
    function cm(line) {
      var h = '';
      while (comments.length && comments[0].location.line < line) { var c = comments.shift(); if (!flt) h += '<div class="comment">' + esc(c.text.trim()) + '</div>'; }
      return h;
    }
    function names(ts) { return (ts || []).map(function (x) { return x.name; }); }
    function tags(ts) { return ts && ts.length ? '<div class="tags">' + ts.map(function (x) { return '<button class="tag' + (x.name === flt ? ' on' : '') + '" data-tag="' + esc(x.name) + '" title="' + esc(t('tagFilter')) + '">' + esc(x.name) + '</button>'; }).join('') + '</div>' : ''; }
    // A scenario is shown when the filter matches its own, its Examples', its Rule's or the Feature's tags.
    function shown(s, inherited) {
      if (!flt) return true;
      var all = inherited.concat(names(s.tags)); (s.examples || []).forEach(function (e) { all = all.concat(names(e.tags)); });
      return all.indexOf(flt) >= 0;
    }
    function editBtn(loc) { return '<button class="edit" data-line="' + loc.line + '">✎ ' + esc(t('edit')) + '</button>'; }
    function table(rows, cls, head) {
      return '<table class="' + (cls || '') + '">' + rows.map(function (r, i) {
        var tag = head && i === 0 ? 'th' : 'td';
        return '<tr>' + r.cells.map(function (c) { return '<' + tag + '>' + HL.stepText(c.value, { str: 'str', ph: 'ph', num: '' }) + '</' + tag + '>'; }).join('') + '</tr>';
      }).join('') + '</table>';
    }
    function steps(list, path) {
      return '<ol class="steps">' + list.map(function (s, k) {
        var kt = s.keywordType || 'Unknown';
        var h = cm(s.location.line) + '<li id="n-' + s.location.line + '" data-path="' + path + '.s' + k + '"><span class="skw ' + kt + '">' + esc(s.keyword.trim()) + '</span> ' + HL.stepText(s.text, { str: 'str', ph: 'ph', num: '' });
        var tbl = s.dataTable ? table(s.dataTable.rows, '', false) : '';
        var doc = s.docString ? '<pre>' + (s.docString.mediaType ? '<span class="media">' + esc(s.docString.mediaType) + '</span>' : '') + esc(s.docString.content) + '</pre>' : '';
        h += s.docString && s.dataTable && s.docString.location.line < s.dataTable.location.line ? doc + tbl : tbl + doc;
        return h + '</li>';
      }).join('') + '</ol>';
    }
    function bg(b, path) {
      return cm(b.location.line) + '<div class="card bg" id="n-' + b.location.line + '" data-path="' + path + '">' + editBtn(b.location) + '<div class="kind">' + esc(b.keyword) + '</div>' +
        (b.name ? '<h3>' + esc(b.name) + '</h3>' : '') + (b.description ? '<div class="desc">' + md(b.description) + '</div>' : '') + steps(b.steps, path) + '</div>';
    }
    function scenario(s, inherited, path) {
      var line = (s.tags[0] || s).location.line, n = picklesFor(s.id), pre = cm(line);
      if (!shown(s, inherited)) return '';
      var h = pre + '<div class="card" id="n-' + s.location.line + '" data-path="' + path + '">' + editBtn(s.location) + '<div class="kind">' + esc(s.keyword) + '</div><h3>' + HL.stepText(s.name, { str: 'str', ph: 'ph', num: '' }) + '</h3>' + tags(s.tags) +
        (s.description ? '<div class="desc">' + md(s.description) + '</div>' : '') + steps(s.steps, path);
      (s.examples || []).forEach(function (ex) {
        var rows = (ex.tableHeader ? [ex.tableHeader] : []).concat(ex.tableBody || []);
        h += cm((ex.tags[0] || ex).location.line) + '<div class="examples-head">' + esc(ex.keyword) + (ex.name ? ': ' + esc(ex.name) : '') + '</div>' + tags(ex.tags) +
          (ex.description ? '<div class="desc">' + md(ex.description) + '</div>' : '') + (rows.length ? table(rows, 'examples', true) : '');
      });
      if (s.examples && s.examples.length) h += '<div class="pickles">→ ' + esc(t('testcasesFrom', n)) + '</div>';
      return h + '</div>';
    }
    out += cm(f.location.line) + '<div class="eyebrow">' + esc(f.keyword) + '</div><h1 id="n-' + f.location.line + '">' + esc(f.name) + '</h1>' + tags(f.tags);
    if (f.description) out += '<div class="desc">' + md(f.description) + '</div>';
    var c = counts(res);
    out += '<div class="stats"><span><b>' + c.scenarios + '</b> ' + esc(t('scenarios')) + '</span><span><b>' + c.pickles + '</b> ' + esc(t('testcases')) + '</span><span><b>' + c.steps + '</b> ' + esc(t('steps')) + '</span><span>' + esc(t('language')) + ' <b>' + esc(f.language) + '</b></span></div>';
    var all = {};
    function collect(ts) { names(ts).forEach(function (n) { all[n] = (all[n] || 0) + 1; }); }
    collect(f.tags);
    f.children.forEach(function (ch) {
      var sc = ch.scenario ? [ch.scenario] : ch.rule ? (collect(ch.rule.tags), ch.rule.children.map(function (c) { return c.scenario; }).filter(Boolean)) : [];
      sc.forEach(function (s) { collect(s.tags); (s.examples || []).forEach(function (e) { collect(e.tags); }); });
    });
    var tagNames = Object.keys(all).sort();
    if (tagNames.length) {
      out += '<div class="tagbar" aria-label="' + esc(t('tagFilter')) + '">' + tagNames.map(function (n) {
        return '<button class="tag' + (n === flt ? ' on' : '') + '" data-tag="' + esc(n) + '">' + esc(n) + ' <small>' + all[n] + '</small></button>';
      }).join('') + (flt ? '<button class="clear" data-tag="">✕ ' + esc(t('clearFilter')) + '</button>' : '') + '</div>';
    }
    var visible = 0, ftags = names(f.tags);
    f.children.forEach(function (ch, ci) {
      var cp = 'c' + ci;
      if (ch.background) out += bg(ch.background, cp);
      if (ch.scenario) { var o = scenario(ch.scenario, ftags, cp); if (o) visible++; out += o; }
      if (ch.rule) {
        var r = ch.rule, inh = ftags.concat(names(r.tags)), body = '';
        r.children.forEach(function (rc, rj) { var rp = cp + '.c' + rj; if (rc.background) body += bg(rc.background, rp); if (rc.scenario) { var o2 = scenario(rc.scenario, inh, rp); if (o2) visible++; body += o2; } });
        if (flt && body.indexOf('class="card"') < 0) return;
        out += cm((r.tags[0] || r).location.line) + '<section class="rule" id="n-' + r.location.line + '" data-path="' + cp + '"><div class="kind">' + esc(r.keyword) + '</div><h2>' + esc(r.name) + '</h2>' + tags(r.tags) + (r.description ? '<div class="desc">' + md(r.description) + '</div>' : '');
        out += body + '</section>';
      }
    });
    if (flt && !visible) out += '<p class="broken">' + esc(t('noMatch')) + '</p>';
    out += cm(1e9) + '</div>';
    put(out);
    markPath(S.curPath, true);
  }
  // ---------- preview tabs: document, problems, test cases ----------
  function rightTabs(res) {
    function b(id, label, n) {
      return '<button role="tab" data-rtab="' + id + '" aria-selected="' + (S.rightTab === id) + '">' + esc(label) + (n === undefined ? '' : ' <span class="count">' + n + '</span>') + '</button>';
    }
    return '<div class="rtabs" role="tablist">' + b('doc', t('tabDoc')) + b('problems', t('tabProblems'), S.diags.length) + b('cases', t('tabCases'), ((res && res.pickles) || []).length) + '</div>';
  }
  function problemsHtml() {
    if (!S.diags.length) return '<div class="doc"><p class="hint">' + esc(t('none')) + '</p></div>';
    return '<ul class="plist">' + S.diags.map(function (d) {
      return '<li tabindex="0" data-pline="' + d.line + '"><span class="sev ' + esc(d.severity) + '"></span><span>' + esc(d.message) + ' <small>' + esc(t('line')) + ' ' + d.line + ' · ' + esc(d.rule) + '</small></span></li>';
    }).join('') + '</ul>';
  }
  // One row per test case (pickle), grouped by scenario; a click shows the case as readable steps.
  function casesHtml(res) {
    var f = res && res.document && res.document.feature;
    if (!f || !(res.pickles || []).length) return '<div class="doc"><p class="hint">' + esc(t('noCases')) + '</p></div>';
    var sc = {}, rows = {}, kw = {};
    function steps(list) { list.forEach(function (st) { kw[st.id] = st.keyword; }); }
    function scen(x) {
      sc[x.id] = x; steps(x.steps);
      (x.examples || []).forEach(function (ex) {
        var head = ex.tableHeader ? ex.tableHeader.cells.map(function (c) { return c.value; }) : [];
        (ex.tableBody || []).forEach(function (r) { rows[r.id] = { ex: ex, head: head, vals: r.cells.map(function (c) { return c.value; }) }; });
      });
    }
    f.children.forEach(function (ch) {
      if (ch.background) steps(ch.background.steps);
      if (ch.scenario) scen(ch.scenario);
      if (ch.rule) ch.rule.children.forEach(function (rc) { if (rc.background) steps(rc.background.steps); if (rc.scenario) scen(rc.scenario); });
    });
    var order = [], groups = {};
    res.pickles.forEach(function (pk) { var id = pk.astNodeIds[0]; if (!groups[id]) { groups[id] = []; order.push(id); } groups[id].push(pk); });
    var out = '<div class="doc"><p class="hint cases-sum">' + esc(t('casesSummary', res.pickles.length).replace('{m}', order.length)) + '</p>';
    order.forEach(function (id) {
      var x = sc[id], list = groups[id];
      out += '<section class="case-group"><h3>' + esc(x ? x.name : '') + ' <span class="count">' + list.length + '</span></h3>' +
        '<table class="cases"><thead><tr><th>' + esc(t('caseNo')) + '</th><th>' + esc(t('caseEx')) + '</th><th>' + esc(t('caseVals')) + '</th></tr></thead><tbody>';
      list.forEach(function (pk, i) {
        var r = rows[pk.astNodeIds[1]], open = S.caseOpen === pk.id;
        var vals = r ? r.vals.map(function (v, k) { return '<span class="kv"><i>' + esc(r.head[k] || '') + '</i>' + esc(v) + '</span>'; }).join('') : '';
        out += '<tr class="case' + (open ? ' open' : '') + '" tabindex="0" data-case="' + esc(pk.id) + '" aria-expanded="' + open + '" title="' + esc(t('openCase')) + '"><td>' + (i + 1) + '</td><td>' + esc(r && r.ex.name ? r.ex.name : '–') + '</td><td>' + vals + '</td></tr>';
        if (open) {
          out += '<tr class="case-detail"><td colspan="3"><ol class="steps">' + pk.steps.map(function (st) {
            return '<li><span class="skw ' + esc(st.type || 'Unknown') + '">' + esc((kw[st.astNodeIds[0]] || '').trim()) + '</span> ' + esc(st.text) + '</li>';
          }).join('') + '</ol></td></tr>';
        }
      });
      out += '</tbody></table></section>';
    });
    return out + '</div>';
  }
  function toggleCase(id) { S.caseOpen = S.caseOpen === id ? '' : id; renderDoc(); }
  $('view-doc').addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var r = e.target.closest('tr[data-case]'), p = e.target.closest('[data-pline]');
    if (r) { e.preventDefault(); toggleCase(r.dataset.case); }
    else if (p) { e.preventDefault(); jumpTo(+p.dataset.pline); }
  });
  // Mark the preview block that belongs to a form block or step (identified by its position, e.g. c1.s2).
  function markPath(p, keepScroll) {
    var d = $('view-doc'), old = d.querySelector('.cur');
    if (old) old.classList.remove('cur');
    if (S.variant !== 'split' || S.splitLeft !== 'form') return;
    S.curPath = p || '';
    if (!p) return;
    var n = d.querySelector('[data-path="' + p + '"]');
    if (n) { n.classList.add('cur'); if (!keepScroll) n.scrollIntoView({ block: 'nearest' }); }
  }
  function focusForm(p) {
    markPath(p);
    var blk = $('view-struct').querySelector('[data-path="' + p + '"]');
    if (!blk) return;
    var isStep = /\.s\d+$/.test(p), inp = isStep ? blk.querySelector('input[aria-label="step"]') : (blk.querySelector('.block-head input') || blk.querySelector('input'));
    if (inp) inp.focus();
    blk.scrollIntoView({ block: 'nearest' });
  }
  $('view-struct').addEventListener('focusin', function (e) {
    if (S.variant !== 'split') return;
    var n = e.target.closest('[data-path]'); markPath(n ? n.dataset.path : '');
  });
  $('view-doc').addEventListener('click', function (e) {
    var rtab = e.target.closest('[data-rtab]');
    if (rtab) { S.rightTab = rtab.dataset.rtab; try { localStorage.setItem('gherkit.rightTab', S.rightTab); } catch (x) { } renderDoc(); return; }
    var cr = e.target.closest('tr[data-case]'); if (cr) { toggleCase(cr.dataset.case); return; }
    var pl = e.target.closest('[data-pline]'); if (pl) { jumpTo(+pl.dataset.pline); return; }
    var b = e.target.closest('button.edit'); if (b) { jumpTo(+b.dataset.line); return; }
    var tg = e.target.closest('[data-tag]');
    if (tg) { S.tagFilter = tg.dataset.tag === S.tagFilter ? '' : tg.dataset.tag; renderDoc(); return; }
    // In Split a click on a block puts the code cursor on its line.
    if (S.variant === 'split') {
      if (S.splitLeft === 'form') { var pn = e.target.closest('[data-path]'); if (pn) focusForm(pn.dataset.path); }
      else { var n = e.target.closest('[id^="n-"]'); if (n) { jumpTo(+n.id.slice(2)); syncDocSoon(); } }
    }
  });

  // ---------- split handle ----------
  var handle = $('split-handle'), splitPct = 50;
  function setSplit(p) {
    splitPct = Math.max(20, Math.min(80, p));
    $('main').style.setProperty('--split', splitPct + '%');
    handle.setAttribute('aria-valuenow', String(Math.round(splitPct)));
    try { localStorage.setItem('gherkit.split', String(splitPct)); } catch (e) { }
  }
  try { var sp = parseFloat(localStorage.getItem('gherkit.split')); if (sp) setSplit(sp); } catch (e) { }
  handle.addEventListener('pointerdown', function (e) { handle.setPointerCapture(e.pointerId); handle.dataset.drag = '1'; e.preventDefault(); });
  handle.addEventListener('pointermove', function (e) {
    if (!handle.dataset.drag) return;
    var r = $('main').getBoundingClientRect(); setSplit((e.clientX - r.left) / r.width * 100);
  });
  handle.addEventListener('pointerup', function () { delete handle.dataset.drag; });
  handle.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') { e.preventDefault(); setSplit(splitPct - 5); }
    if (e.key === 'ArrowRight') { e.preventDefault(); setSplit(splitPct + 5); }
  });
  handle.addEventListener('dblclick', function () { setSplit(50); });

  function counts(res) {
    var c = { scenarios: 0, steps: 0, rules: 0, tags: 0, pickles: (res.pickles || []).length };
    var f = res.document && res.document.feature; if (!f) return c;
    var tagSet = {};
    function tg(ts) { (ts || []).forEach(function (x) { tagSet[x.name] = 1; }); }
    tg(f.tags);
    function sc(s) { c.scenarios++; c.steps += s.steps.length; tg(s.tags); (s.examples || []).forEach(function (e) { tg(e.tags); }); }
    f.children.forEach(function (ch) {
      if (ch.background) c.steps += ch.background.steps.length;
      if (ch.scenario) sc(ch.scenario);
      if (ch.rule) { c.rules++; tg(ch.rule.tags); ch.rule.children.forEach(function (rc) { if (rc.scenario) sc(rc.scenario); if (rc.background) c.steps += rc.background.steps.length; }); }
    });
    c.tags = Object.keys(tagSet).length;
    return c;
  }

  // ---------- panel ----------
  function renderProblems() {
    var ul = $('problems'); ul.innerHTML = '';
    if (!S.diags.length) { ul.appendChild(el('li', { class: 'none', text: t('none') })); return; }
    S.diags.forEach(function (d) {
      ul.appendChild(el('li', { onclick: function () { jumpTo(d.line); }, title: d.rule }, [
        el('span', { class: 'sev ' + d.severity }),
        el('span', {}, [d.message + ' ', el('small', { text: t('line') + ' ' + d.line + ' · ' + d.rule })])
      ]));
    });
  }
  function renderOutline() {
    var ul = $('outline'); ul.innerHTML = '';
    var res = S.lastGood; if (!res || !res.document || !res.document.feature) return;
    function item(kw, name, line, depth) {
      var li = el('li', { onclick: function () { goto(line); } }, [el('span', { class: 'kw', text: kw + ' ' }), name || '']);
      li.style.paddingLeft = (6 + depth * 12) + 'px'; ul.appendChild(li);
    }
    var f = res.document.feature;
    item(f.keyword, f.name, f.location.line, 0);
    f.children.forEach(function (ch) {
      if (ch.background) item(ch.background.keyword, ch.background.name, ch.background.location.line, 1);
      if (ch.scenario) item(ch.scenario.keyword, ch.scenario.name, ch.scenario.location.line, 1);
      if (ch.rule) {
        item(ch.rule.keyword, ch.rule.name, ch.rule.location.line, 1);
        ch.rule.children.forEach(function (rc) { var x = rc.background || rc.scenario; item(x.keyword, x.name, x.location.line, 2); });
      }
    });
  }
  function goto(line) {
    if (S.variant === 'doc' || (S.variant === 'split' && S.splitLeft === 'form')) { var n = document.getElementById('n-' + line); if (n) n.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    jumpTo(line);
  }
  function renderFacts() {
    var dl = $('facts'); dl.innerHTML = '';
    var res = S.lastGood;
    function row(k, v) { dl.appendChild(el('dt', { text: k })); dl.appendChild(el('dd', { text: String(v) })); }
    if (res && res.document && res.document.feature) {
      var c = counts(res);
      row(t('language'), res.document.feature.language);
      row(t('rules'), c.rules); row(t('scenarios'), c.scenarios); row(t('testcases'), c.pickles); row(t('steps'), c.steps); row(t('tags'), c.tags);
    }
    row(t('workspaceSteps'), S.steps.length);
  }

  // ---------- structure view ----------
  // Only edits are printed back into the text: looking at the form must not rewrite (or "dirty") a file.
  var pendingEdit = false;
  function syncNow() {
    if (!S.edit || !pendingEdit) return Promise.resolve();
    pendingEdit = false;
    return api('POST', '/api/render', S.edit).then(function (r) {
      S.text = r.content; S.parsed = r.parsed; if (!r.parsed.errors.length) S.lastGood = r.parsed;
      setSource(S.text, true); updateDirty();
      api('POST', '/api/lint', { path: S.path, content: S.text }).then(function (l) { S.diags = l.diagnostics || []; renderProblems(); renderCodeHL(); if (S.variant === 'split') renderDoc(); });
      renderOutline(); renderFacts();
      if (S.variant === 'split') renderDoc();
    });
  }
  var syncSoon = debounce(syncNow, 250);
  function changed() { pendingEdit = true; syncSoon(); }

  function kwOptions(kind) { return ((S.dialect || {})[kind] || []).slice(); }
  function select(options, value, onchange, cls) {
    if (options.indexOf(value) < 0) options = [value].concat(options);
    return el('select', { class: cls || '', onchange: function (e) { onchange(e.target.value); } }, options.map(function (o) { return el('option', { value: o, text: o.trim() || o, selected: o === value }); }));
  }
  function input(value, onchange, attrs) {
    var a = Object.assign({ value: value || '', oninput: function (e) { onchange(e.target.value); } }, attrs || {});
    return el('input', a);
  }
  // Descriptions keep their source indentation in the AST; show them dedented
  // (the printer re-indents anyway) and size the box to its content.
  function dedent(v) {
    var lines = String(v || '').split('\n'), min = Infinity;
    lines.forEach(function (l) { if (l.trim()) min = Math.min(min, l.match(/^\s*/)[0].length); });
    return min === Infinity ? '' : lines.map(function (l) { return l.slice(Math.min(min, l.match(/^\s*/)[0].length)); }).join('\n');
  }
  function textarea(value, onchange, key) {
    var tx = el('textarea', { 'data-key': key, oninput: function (e) { onchange(e.target.value); tx.rows = Math.max(2, e.target.value.split('\n').length); } });
    tx.value = dedent(value); tx.rows = Math.max(2, tx.value.split('\n').length); return tx;
  }
  function tagsInput(obj) {
    return input((obj.tags || []).map(function (x) { return x.name; }).join(' '), function (v) {
      obj.tags = v.split(/\s+/).filter(Boolean).map(function (n) { return { name: n[0] === '@' ? n : '@' + n, id: newId() }; }); changed();
    }, { placeholder: '@tag', 'aria-label': t('tagsHint'), 'data-key': (obj.id || 'feature') + ':tags' });
  }
  // Tags and description are shown when they have content or were opened with a chip; otherwise a chip offers them.
  function optionalFields(obj, withTags) {
    var id = obj.id || 'feature', out = { fields: [], chips: [] };
    function chip(kind, label) {
      return el('button', { class: 'chip', text: label, onclick: function () { S.opened[id + ':' + kind] = true; S.focusKey = id + ':' + kind; renderStruct(); } });
    }
    if (withTags) {
      if ((obj.tags && obj.tags.length) || S.opened[id + ':tags']) out.fields.push(el('label', { text: t('tagsHint') }), tagsInput(obj));
      else out.chips.push(chip('tags', t('chipTags')));
    }
    if ((obj.description && obj.description.trim()) || S.opened[id + ':desc']) out.fields.push(el('label', { text: t('description') }), textarea(obj.description, function (v) { obj.description = v; changed(); }, id + ':desc'));
    else out.chips.push(chip('desc', t('chipDesc')));
    return out;
  }
  function chipRow(chips) { return chips.length ? el('div', { class: 'chips' }, chips) : null; }
  // Gherkin order: Background first, scenarios before the first Rule.
  function validOrder(arr) {
    var rule = false;
    for (var i = 0; i < arr.length; i++) {
      if (arr[i].background && i > 0) return false;
      if (arr[i].rule) rule = true; else if (arr[i].scenario && rule) return false;
    }
    return true;
  }
  // List layout: keep the selection on the block that was moved or duplicated.
  function followSel(arr, from, to) {
    if (S.variant !== 'struct' || S.layout !== 'list' || !S.sel || S.sel === 'f' || !S.edit || !S.edit.feature) return;
    var parent = S.sel.indexOf('.') >= 0 ? S.sel.slice(0, S.sel.lastIndexOf('.')) : '';
    var cur = +S.sel.slice(S.sel.lastIndexOf('c') + 1), pn = parent ? nodeAt(S.edit.feature, parent) : null;
    var same = parent ? !!(pn && pn.rule && pn.rule.children === arr) : S.edit.feature.children === arr;
    if (same && cur === from) S.sel = (parent ? parent + '.' : '') + 'c' + to;
  }
  function syncListLabel(v) {
    var l = document.querySelector('.st .lst-item.sel .lbl');
    if (l && l.lastChild && l.lastChild.nodeType === 3) l.lastChild.nodeValue = v || t('noName');
  }
  function moveIn(arr, i, d) {
    var j = i + d; if (j < 0 || j >= arr.length) return;
    var x = arr[i]; arr[i] = arr[j]; arr[j] = x;
    if (!validOrder(arr)) { arr[j] = arr[i]; arr[i] = x; setStatus(t('badOrder'), 'dirty'); return; }
    followSel(arr, i, j); changed(); renderStruct();
  }
  function removeAt(arr, i) { arr.splice(i, 1); changed(); renderStruct(); }
  function reid(o) {
    if (Array.isArray(o)) o.forEach(reid);
    else if (o && typeof o === 'object') { if ('id' in o) o.id = newId(); Object.keys(o).forEach(function (k) { if (k !== 'id') reid(o[k]); }); }
  }
  function duplicateAt(arr, i) {
    var c = clone(arr[i]); reid(c);
    var b = c.rule || c.scenario || c.background || c;
    if (b && typeof b.name === 'string' && b.name) b.name += ' (' + t('copy') + ')';
    arr.splice(i + 1, 0, c); followSel(arr, i, i + 1); changed(); renderStruct();
  }
  function tools(arr, i, dup) {
    return el('div', { class: 'tools' }, [
      el('button', { title: '↑', text: '↑', onclick: function () { moveIn(arr, i, -1); } }),
      el('button', { title: '↓', text: '↓', onclick: function () { moveIn(arr, i, 1); } }),
      dup ? el('button', { class: 'dup', title: t('duplicate'), text: '⧉', onclick: function () { duplicateAt(arr, i); } }) : null,
      el('button', { title: '✕', text: '✕', onclick: function () { removeAt(arr, i); } })
    ]);
  }
  function foldButton(id) {
    var folded = !!S.folded[id];
    return el('button', { class: 'fold', title: t('fold'), 'aria-expanded': String(!folded), text: folded ? '▸' : '▾', onclick: function () { S.folded[id] = !folded; renderStruct(); } });
  }
  function stepKwType(kw) {
    var d = S.dialect || {}, map = { given: 'Context', when: 'Action', then: 'Outcome', and: 'Conjunction', but: 'Conjunction' };
    for (var k in map) if ((d[k] || []).indexOf(kw) >= 0) return kw.trim() === '*' ? 'Unknown' : map[k];
    return 'Unknown';
  }
  // rows is edited in place; after() lets the caller copy rows back (Examples).
  // Paste from a spreadsheet: tab/newline separated text fills the grid from the
  // focused cell on and adds the rows and columns it needs.
  function pasteGrid(rows, ri, ci, e, after) {
    var txt = (e.clipboardData || window.clipboardData).getData('text');
    if (txt.indexOf('\t') < 0 && txt.indexOf('\n') < 0) return; // a single value: normal paste
    e.preventDefault();
    var data = txt.replace(/\r/g, '').replace(/\n$/, '').split('\n').map(function (l) { return l.split('\t'); });
    var width = Math.max.apply(null, data.map(function (r) { return r.length; }));
    var cols = Math.max(rows[0] ? rows[0].cells.length : 0, ci + width);
    data.forEach(function (vals, di) {
      var r = rows[ri + di];
      if (!r) { r = { cells: [], id: newId() }; rows.push(r); }
      vals.forEach(function (v, vi) { while (r.cells.length <= ci + vi) r.cells.push({ value: '' }); r.cells[ci + vi].value = v.trim(); });
    });
    rows.forEach(function (r) { while (r.cells.length < cols) r.cells.push({ value: '' }); });
    after(); changed(); renderStruct();
  }
  function gridEditor(rows, headClass, after) {
    after = after || function () { };
    var tb = el('table', { class: 'grid' });
    rows.forEach(function (r, ri) {
      var tr = el('tr');
      r.cells.forEach(function (c) {
        tr.appendChild(el('td', {}, [input(c.value, function (v) { c.value = v; changed(); }, {
          class: ri === 0 && headClass ? 'head' : '', title: t('pasteHint'),
          onpaste: function (e) { pasteGrid(rows, ri, r.cells.indexOf(c), e, after); }
        })]));
      });
      tr.appendChild(el('td', {}, [el('button', { text: '−', title: 'row', onclick: function () { rows.splice(ri, 1); after(); changed(); renderStruct(); } })]));
      tb.appendChild(tr);
    });
    return tb;
  }
  function gridButtons(rows, after) {
    after = after || function () { };
    return el('div', { class: 'add' }, [
      el('button', { text: t('row'), onclick: function () { var n = rows.length ? rows[0].cells.length : 1; rows.push({ cells: Array.from({ length: n }, function () { return { value: '' }; }), id: newId() }); after(); changed(); renderStruct(); } }),
      el('button', { text: t('col'), onclick: function () { rows.forEach(function (r) { r.cells.push({ value: '' }); }); if (!rows.length) rows.push({ cells: [{ value: '' }], id: newId() }); after(); changed(); renderStruct(); } })
    ]);
  }
  function stepTools(s, steps, i) {
    var tb = tools(steps, i);
    tb.insertBefore(el('button', { text: '❝', title: t('docstring'), onclick: function () { if (s.docString) delete s.docString; else { s.docString = { content: '', delimiter: '"""', mediaType: '' }; } changed(); renderStruct(); } }), tb.firstChild);
    tb.insertBefore(el('button', { text: '⊞', title: t('table'), onclick: function () { if (s.dataTable) delete s.dataTable; else { s.dataTable = { rows: [{ cells: [{ value: '' }, { value: '' }], id: newId() }] }; } changed(); renderStruct(); } }), tb.firstChild);
    return tb;
  }
  var STEP_ROLES = ['given', 'when', 'then', 'and', 'but'];
  function firstKw(role) { return kwOptions(role).filter(function (k) { return k.trim() !== '*'; })[0]; }
  function roleOf(kw) { for (var i = 0; i < STEP_ROLES.length; i++) if (kwOptions(STEP_ROLES[i]).indexOf(kw) >= 0) return i; return -1; }
  function cycleKeyword(s, dir, pillEl) {
    var next = STEP_ROLES[(roleOf(s.keyword) + dir + STEP_ROLES.length) % STEP_ROLES.length], kw = firstKw(next);
    if (!kw) return;
    s.keyword = kw; s.keywordType = stepKwType(kw); setPill(pillEl, s); changed();
  }
  function setPill(pillEl, s) { pillEl.textContent = s.keyword.trim(); pillEl.className = 'pill ' + (s.keywordType || 'Unknown'); }
  function pill(s) {
    var b = el('button', { type: 'button', title: t('kwTitle') });
    setPill(b, s);
    b.addEventListener('click', function (e) { cycleKeyword(s, e.shiftKey ? -1 : 1, b); });
    return b;
  }
  // Suggested keyword for the step that follows prev.
  function nextKeyword(prev) { return firstKw(prev.keywordType === 'Action' ? 'then' : 'and') || prev.keyword; }
  function stepsEditor(steps, path) {
    var box = el('div', {}, []), list = (S.steps || []).map(function (s) { return s.text; });
    var dl = el('datalist', { id: 'dl-steps' }, list.slice(0, 500).map(function (x) { return el('option', { value: x }); }));
    box.appendChild(dl);
    steps.forEach(function (s, i) {
      var pl = pill(s);
      var row = el('div', { class: 'step', 'data-path': path + '.s' + i }, [
        pl,
        input(s.text, function (v) { s.text = v; changed(); }, { list: 'dl-steps', 'aria-label': 'step', 'data-key': 'step:' + s.id, onkeydown: function (e) {
          if (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); cycleKeyword(s, e.key === 'ArrowDown' ? 1 : -1, pl); }
          else if (e.key === 'Enter' && !e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && s.text.trim()) {
            e.preventDefault();
            var kw = nextKeyword(s), ns = { keyword: kw, keywordType: stepKwType(kw), text: '', id: newId() };
            steps.splice(i + 1, 0, ns); S.focusKey = 'step:' + ns.id; changed(); renderStruct();
          }
        } }),
        stepTools(s, steps, i)
      ]);
      box.appendChild(row);
      if (s.dataTable) box.appendChild(el('div', { class: 'step' }, [el('span'), el('div', { class: 'arg' }, [gridEditor(s.dataTable.rows, false), gridButtons(s.dataTable.rows)])]));
      if (s.docString) {
        var d = s.docString;
        box.appendChild(el('div', { class: 'step' }, [el('span'), el('div', { class: 'arg' }, [
          el('div', { class: 'grid2' }, [select(['"""', '```'], d.delimiter || '"""', function (v) { d.delimiter = v; changed(); }), input(d.mediaType, function (v) { d.mediaType = v; changed(); }, { placeholder: 'media type (json, markdown…)' })]),
          textarea(d.content, function (v) { d.content = v; changed(); })
        ])]));
      }
    });
    box.appendChild(el('div', { class: 'add' }, [el('button', { text: t('addStep'), onclick: function () {
      var prev = steps[steps.length - 1], and = kwOptions('and').filter(function (k) { return k.trim() !== '*'; })[0] || '* ';
      var kw = prev ? and : (kwOptions('given').filter(function (k) { return k.trim() !== '*'; })[0] || '* ');
      var ns = { keyword: kw, keywordType: stepKwType(kw), text: '', id: newId() };
      steps.push(ns); S.focusKey = 'step:' + ns.id; changed(); renderStruct();
    } })]));
    box.appendChild(el('div', { class: 'hint step-hint', text: t('stepHint') }));
    return box;
  }
  function examplesEditor(sc) {
    var box = el('div');
    (sc.examples || []).forEach(function (ex, i) {
      var rows = (ex.tableHeader ? [ex.tableHeader] : []).concat(ex.tableBody || []);
      function commit() { ex.tableHeader = rows[0] || undefined; ex.tableBody = rows.slice(1); }
      box.appendChild(el('div', { class: 'block' }, [
        el('div', { class: 'block-head' }, [select(kwOptions('examples'), ex.keyword, function (v) { ex.keyword = v; changed(); }), input(ex.name, function (v) { ex.name = v; changed(); }, { placeholder: t('name') }), tools(sc.examples, i, true)]),
        el('label', { text: t('tagsHint') }), tagsInput(ex),
        gridEditor(rows, true, commit),
        gridButtons(rows, commit)
      ]));
    });
    box.appendChild(el('div', { class: 'add' }, [el('button', { text: t('addExamples'), onclick: function () {
      sc.examples = sc.examples || [];
      sc.examples.push({ keyword: kwOptions('examples')[0] || 'Examples', name: '', description: '', tags: [], tableHeader: { cells: [{ value: 'param' }], id: newId() }, tableBody: [{ cells: [{ value: '' }], id: newId() }], id: newId() });
      changed(); renderStruct();
    } })]));
    return box;
  }
  function blockEditor(child, arr, i, inRule, path, opts) {
    opts = opts || {};
    if (child.rule) {
      var r = child.rule, rf = !opts.noFold && !!S.folded[r.id], ro = optionalFields(r, true);
      var rhead = el('div', { class: 'block-head' }, [opts.noFold ? null : foldButton(r.id), select(kwOptions('rule'), r.keyword, function (v) { r.keyword = v; changed(); }), input(r.name, function (v) { r.name = v; syncListLabel(v); changed(); }, { placeholder: t('name') }), tools(arr, i, true)]);
      if (opts.shallow) return el('div', { class: 'block rule', 'data-path': path }, [rhead].concat(ro.fields, [chipRow(ro.chips), el('p', { class: 'hint', text: t('ruleHint') })]));
      return el('div', { class: 'block rule' + (rf ? ' collapsed' : ''), 'data-path': path }, [rhead].concat(rf ? [el('div', { class: 'summary', text: t('nBlocks', r.children.length) })] : [].concat(ro.fields, [
        chipRow(ro.chips),
        el('div', { class: 'children' }, r.children.map(function (c, j) { return blockEditor(c, r.children, j, true, path + '.c' + j); })),
        addButtons(r.children, true, path)
      ])));
    }
    var b = child.background || child.scenario, isBg = !!child.background, bf = !opts.noFold && !!S.folded[b.id], bo = optionalFields(b, !isBg);
    var kinds = isBg ? kwOptions('background') : kwOptions('scenario').concat(kwOptions('scenarioOutline'));
    var head = el('div', { class: 'block-head' }, [opts.noFold ? null : foldButton(b.id), select(kinds, b.keyword, function (v) { b.keyword = v; changed(); }), input(b.name, function (v) { b.name = v; syncListLabel(v); changed(); }, { placeholder: t('name') }), tools(arr, i, true)]);
    return el('div', { class: 'block ' + (isBg ? 'background' : 'scenario') + (bf ? ' collapsed' : ''), 'data-path': path }, [head].concat(bf ? [el('div', { class: 'summary', text: t('nSteps', b.steps.length) })] : [].concat(bo.fields, [
      stepsEditor(b.steps, path),
      isBg ? null : examplesEditor(b),
      chipRow(bo.chips)
    ])));
  }
  function addButtons(children, inRule, parentPath) {
    var pre = parentPath ? parentPath + '.' : '';
    function first(k) { return kwOptions(k)[0] || k; }
    function given() { return kwOptions('given').filter(function (k) { return k.trim() !== '*'; })[0] || '* '; }
    // Feature-level scenarios must come before the first Rule (Gherkin
    // would otherwise attach them to that Rule).
    function add(obj) {
      var at = children.length;
      if (!inRule && !obj.rule) { for (var k = 0; k < children.length; k++) if (children[k].rule) { at = k; break; } }
      children.splice(at, 0, obj); S.sel = pre + 'c' + at; changed(); renderStruct();
    }
    var btns = [
      el('button', { text: t('addScenario'), onclick: function () { add({ scenario: { keyword: first('scenario'), name: '', description: '', tags: [], steps: [{ keyword: given(), keywordType: 'Context', text: '', id: newId() }], examples: [], id: newId() } }); } }),
      el('button', { text: t('addOutline'), onclick: function () { add({ scenario: { keyword: first('scenarioOutline'), name: '', description: '', tags: [], steps: [{ keyword: given(), keywordType: 'Context', text: '<param>', id: newId() }], examples: [{ keyword: first('examples'), name: '', description: '', tags: [], tableHeader: { cells: [{ value: 'param' }], id: newId() }, tableBody: [{ cells: [{ value: 'a' }], id: newId() }], id: newId() }], id: newId() } }); } }),
      el('button', { text: t('addBackground'), onclick: function () { children.unshift({ background: { keyword: first('background'), name: '', description: '', steps: [{ keyword: given(), keywordType: 'Context', text: '', id: newId() }], id: newId() } }); S.sel = pre + 'c0'; changed(); renderStruct(); } })
    ];
    if (!inRule) btns.push(el('button', { text: t('addRule'), onclick: function () { add({ rule: { keyword: first('rule'), name: '', description: '', tags: [], children: [], id: newId() } }); } }));
    return el('div', { class: 'add' }, btns);
  }
  // ---------- structure, list layout: scenario list on the left, one block on the right ----------
  function childrenAt(f, parent) { return !parent ? f.children : nodeAt(f, parent).rule.children; }
  function nodeAt(f, path) {
    var cur = null, arr = f.children, ps = path.split('.');
    for (var k = 0; k < ps.length; k++) {
      var idx = +ps[k].slice(1); cur = arr[idx]; if (!cur) return null;
      if (k < ps.length - 1) { if (!cur.rule) return null; arr = cur.rule.children; }
    }
    return cur;
  }
  function caseCount(c) {
    if (c.scenario) { var ex = c.scenario.examples || []; return ex.length ? ex.reduce(function (a, e) { return a + (e.tableBody || []).length; }, 0) : 1; }
    if (c.rule) return c.rule.children.reduce(function (a, x) { return a + (x.scenario ? caseCount(x) : 0); }, 0);
    return 0;
  }
  function moveByPath(f, from, to) {
    var pf = from.slice(0, Math.max(0, from.lastIndexOf('.'))), pt = to.slice(0, Math.max(0, to.lastIndexOf('.')));
    if (from.indexOf('.') < 0) pf = ''; if (to.indexOf('.') < 0) pt = '';
    if (pf !== pt || from === to) return;
    var arr = childrenAt(f, pf), a = +from.slice(from.lastIndexOf('c') + 1), b = +to.slice(to.lastIndexOf('c') + 1);
    var copy = arr.slice(), item = copy.splice(a, 1)[0]; copy.splice(b, 0, item);
    if (!validOrder(copy)) { setStatus(t('badOrder'), 'dirty'); return; }
    arr.splice(0, arr.length); copy.forEach(function (x) { arr.push(x); });
    S.sel = (pf ? pf + '.' : '') + 'c' + b; changed(); renderStruct();
  }
  function listLayout(f, layoutBar, featureHead) {
    if (!S.sel || (S.sel !== 'f' && !nodeAt(f, S.sel))) {
      var firstSc = -1; f.children.forEach(function (c, i) { if (firstSc < 0 && c.scenario) firstSc = i; });
      S.sel = firstSc >= 0 ? 'c' + firstSc : 'f';
    }
    var ul = el('ul', { class: 'lst', role: 'listbox', 'aria-label': t('outline') });
    function item(path, kind, name, count, depth, draggable) {
      var li = el('li', { class: 'lst-item' + (S.sel === path ? ' sel' : ''), tabindex: '0', role: 'option', 'aria-selected': String(S.sel === path), 'data-path': path, draggable: draggable ? 'true' : null,
        onclick: function () { S.sel = path; renderStruct(); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); S.sel = path; renderStruct(); } } },
        [el('span', { class: 'grip', 'aria-hidden': 'true', text: draggable ? '⋮⋮' : '' }), el('span', { class: 'lbl' }, [kind ? el('i', { text: kind + ' ' }) : null, name || t('noName')]), count === null ? null : el('span', { class: 'cnt', title: t('testcases'), text: String(count) })]);
      li.style.paddingLeft = (8 + depth * 16) + 'px';
      if (draggable) {
        li.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', path); e.dataTransfer.effectAllowed = 'move'; });
        li.addEventListener('dragover', function (e) { e.preventDefault(); li.classList.add('over'); });
        li.addEventListener('dragleave', function () { li.classList.remove('over'); });
        li.addEventListener('drop', function (e) { e.preventDefault(); li.classList.remove('over'); moveByPath(f, e.dataTransfer.getData('text/plain'), path); });
      }
      ul.appendChild(li);
    }
    item('f', t('featureItem'), f.name, null, 0, false);
    f.children.forEach(function (c, i) {
      var p = 'c' + i;
      if (c.background) item(p, c.background.keyword.replace(/:$/, ''), c.background.name, null, 1, true);
      if (c.scenario) item(p, '', c.scenario.name, caseCount(c), 1, true);
      if (c.rule) {
        item(p, c.rule.keyword.replace(/:$/, ''), c.rule.name, caseCount(c), 1, true);
        c.rule.children.forEach(function (rc, j) {
          var q = p + '.c' + j;
          if (rc.background) item(q, rc.background.keyword.replace(/:$/, ''), rc.background.name, null, 2, true);
          if (rc.scenario) item(q, '', rc.scenario.name, caseCount(rc), 2, true);
        });
      }
    });
    var detail;
    if (S.sel === 'f') detail = el('div', {}, featureHead);
    else {
      var parent = S.sel.indexOf('.') >= 0 ? S.sel.slice(0, S.sel.lastIndexOf('.')) : '', arr = childrenAt(f, parent), idx = +S.sel.slice(S.sel.lastIndexOf('c') + 1);
      detail = blockEditor(arr[idx], arr, idx, !!parent, S.sel, { noFold: true, shallow: !!arr[idx].rule });
    }
    return el('div', { class: 'st st-wide' }, [layoutBar, el('div', { class: 'st-cols' }, [
      el('div', { class: 'st-list' }, [ul, addButtons(f.children, false, '')]),
      el('div', { class: 'st-detail' }, [detail])
    ])]);
  }
  function renderStruct() {
    var view = $('view-struct');
    if (!S.path || !structActive()) return;
    var res = S.parsed;
    if (!res) { view.innerHTML = ''; return; }
    if (res.errors.length) {
      view.innerHTML = '';
      view.appendChild(el('div', { class: 'st' }, [el('p', { class: 'hint', text: t('fixFirst') }), el('ul', {}, res.errors.map(function (e) { return el('li', {}, [el('a', { href: '#', text: t('line') + ' ' + e.line + ': ' + e.message, onclick: function (ev) { ev.preventDefault(); jumpTo(e.line); } })]); }))]));
      return;
    }
    if (!S.edit) { S.edit = clone(res.document); pendingEdit = false; }
    var doc = S.edit;
    if (!doc.feature) doc.feature = { keyword: kwOptions('feature')[0] || 'Feature', name: '', description: '', language: S.dialectCode || 'en', tags: [], children: [] };
    var f = doc.feature;
    var langSel = el('select', { 'aria-label': t('language'), onchange: function (e) { translateTo(e.target.value); } }, []);
    api('GET', '/api/dialects').then(function (list) {
      list.forEach(function (d) { langSel.appendChild(el('option', { value: d.code, text: d.code + ' – ' + d.native, selected: d.code === f.language })); });
    });
    var fo = optionalFields(f, true);
    var listMode = S.variant === 'struct' && S.layout === 'list';
    var layoutBar = S.variant === 'struct' ? el('div', { class: 'st-bar' }, [el('span', { class: 'hint', text: t('layoutLabel') }), el('div', { class: 'seg', role: 'group', 'aria-label': t('layoutLabel') }, ['cards', 'list'].map(function (m) {
      return el('button', { 'data-layout': m, 'aria-pressed': String(S.layout === m), text: t(m === 'cards' ? 'layoutCards' : 'layoutList'), onclick: function () { S.layout = m; try { localStorage.setItem('gherkit.structLayout', m); } catch (e) { } renderStruct(); } });
    }))]) : null;
    var featureHead = [
      el('div', { class: 'grid2' }, [
        el('div', {}, [el('label', { text: t('language') }), langSel]),
        el('div', {}, [el('label', { text: t('name') }), el('div', { class: 'block-head' }, [select(kwOptions('feature'), f.keyword, function (v) { f.keyword = v; changed(); }), input(f.name, function (v) { f.name = v; syncListLabel(v); changed(); }, { class: 'name', placeholder: t('name') })])])
      ]),
      el('div', {}, fo.fields),
      chipRow(fo.chips)
    ];
    var root = listMode ? listLayout(f, layoutBar, featureHead) : el('div', { class: 'st' }, [layoutBar].concat(featureHead, [
      el('div', {}, f.children.map(function (c, i) { return blockEditor(c, f.children, i, false, 'c' + i); })),
      addButtons(f.children, false, '')
    ]));
    var scroll = view.scrollTop;
    view.innerHTML = ''; view.appendChild(root); view.scrollTop = scroll;
    if (S.focusKey) { var ft = view.querySelector('[data-key="' + S.focusKey + '"]'); S.focusKey = ''; if (ft) ft.focus(); }
  }

  // Translate all keywords of the edited document into another language by
  // keyword role (feature, scenario, given, ...) – keeps names and steps.
  function translateTo(code) {
    var from = S.dialect || {};
    api('GET', '/api/dialects/' + encodeURIComponent(code)).then(function (d) {
      var to = d.keywords;
      function map(kw, kinds) {
        for (var i = 0; i < kinds.length; i++) {
          var idx = (from[kinds[i]] || []).indexOf(kw);
          if (idx >= 0) { var list = (to[kinds[i]] || []).filter(function (k) { return k.trim() !== '*'; }); if (kw.trim() === '*') return kw; return list[Math.min(idx, list.length - 1)] || list[0] || kw; }
        }
        return kw;
      }
      var f = S.edit.feature;
      f.keyword = map(f.keyword, ['feature']); f.language = code;
      function steps(ss) { ss.forEach(function (s) { s.keyword = map(s.keyword, ['given', 'when', 'then', 'and', 'but']); }); }
      function sc(s) { s.keyword = map(s.keyword, ['scenario', 'scenarioOutline']); steps(s.steps); (s.examples || []).forEach(function (e) { e.keyword = map(e.keyword, ['examples']); }); }
      function bgk(b) { b.keyword = map(b.keyword, ['background']); steps(b.steps); }
      f.children.forEach(function (c) {
        if (c.background) bgk(c.background);
        if (c.scenario) sc(c.scenario);
        if (c.rule) { c.rule.keyword = map(c.rule.keyword, ['rule']); c.rule.children.forEach(function (rc) { if (rc.background) bgk(rc.background); if (rc.scenario) sc(rc.scenario); }); }
      });
      S.dialect = to; S.dialectCode = code;
      changed(); renderStruct();
    });
  }

  // ---------- folder dialog ----------
  var dlg = $('folder-dlg');
  function browse(dir) {
    return api('GET', '/api/browse?dir=' + encodeURIComponent(dir)).then(function (b) {
      $('folder-input').value = b.dir; dlg.dataset.parent = b.parent;
      var ul = $('folder-list'); ul.innerHTML = '';
      (b.dirs || []).forEach(function (d) {
        ul.appendChild(el('li', { onclick: function () { browse(d.path); } }, [el('span', { text: '▸ ' + d.name }), d.features ? el('small', { text: t('folderFeatures', d.features) }) : null]));
      });
    });
  }
  $('ws-btn').addEventListener('click', function () { browse(S.root).then(function () { dlg.showModal(); }); });
  $('folder-up').addEventListener('click', function () { browse(dlg.dataset.parent); });
  $('folder-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); browse(e.target.value); } });
  $('folder-open').addEventListener('click', function (e) {
    e.preventDefault();
    if (dirty() && !confirm(t('discard'))) return;
    api('POST', '/api/workspace', { root: $('folder-input').value }).then(function () {
      dlg.close(); S.path = ''; S.text = S.saved = ''; S.parsed = S.lastGood = null; S.diags = []; S.edit = null;
      return loadWorkspace();
    }).then(function () { persist(); showVariant(); renderProblems(); renderOutline(); renderFacts(); if (S.files.length) openFile(S.files[0]); })
      .catch(function (err) { alert(err.message); });
  });

  // ---------- new feature ----------
  $('new-btn').addEventListener('click', function () {
    var name = prompt(t('newFileName'), 'new.feature'); if (!name) return;
    if (!/\.feature$/.test(name)) name += '.feature';
    var de = lang === 'de';
    var content = de ? '# language: de\nFunktionalität: Neues Feature\n\n  Szenario: Erstes Szenario\n    Angenommen ein Ausgangszustand\n    Wenn etwas passiert\n    Dann ist das Ergebnis sichtbar\n'
      : 'Feature: New feature\n\n  Scenario: First scenario\n    Given a starting point\n    When something happens\n    Then the result is visible\n';
    api('PUT', '/api/file', { path: name, content: content }).then(loadWorkspace).then(function () { openFile(name); }).catch(function (e) { alert(e.message); });
  });

  // ---------- wiring ----------
  document.querySelectorAll('.variants button').forEach(function (b) { b.addEventListener('click', function () { setVariant(b.dataset.variant); }); });
  $('save-btn').addEventListener('click', save);
  $('fmt-btn').addEventListener('click', formatSource);
  $('left-fmt').addEventListener('click', formatSource);
  $('filter').addEventListener('input', renderFiles);
  $('ui-lang').addEventListener('change', function (e) { lang = e.target.value; try { localStorage.setItem('gherkit.lang', lang); } catch (x) { } applyI18n(); showVariant(); renderProblems(); renderFacts(); });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); }
    if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f')) { e.preventDefault(); formatSource(); }
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && S.variant === 'split' && S.path && (e.code === 'Digit1' || e.code === 'Digit2')) { e.preventDefault(); setLeft(e.code === 'Digit1' ? 'form' : 'code'); }
  });
  window.addEventListener('hashchange', function () {
    var p = new URLSearchParams(location.hash.slice(1)), v = p.get('variant'), f = p.get('file');
    var okV = v && ['code', 'doc', 'struct', 'split'].indexOf(v) >= 0;
    if (f && f !== S.path && S.files.indexOf(f) >= 0) { if (okV) S.variant = v; openFile(f); return; }
    if (okV && v !== S.variant) setVariant(v);
  });
  window.addEventListener('beforeunload', function (e) { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });

  // ---------- start ----------
  applyI18n(); measure();
  var params = new URLSearchParams(location.hash.slice(1));
  var stored = null; try { stored = localStorage.getItem('gherkit.variant'); } catch (e) { }
  S.variant = params.get('variant') || stored || 'code';
  if (['code', 'doc', 'struct', 'split'].indexOf(S.variant) < 0) S.variant = 'code';
  loadWorkspace().then(function () {
    showVariant(); renderProblems(); renderFacts();
    var want = params.get('file');
    if (want && S.files.indexOf(want) >= 0) return openFile(want);
    if (S.files.length) return openFile(S.files[0]);
  });
  window.gherkit = S; // handy for debugging and browser tests
  // Lets the page around the editor (the browser demo) tell it that files changed outside, for example in the terminal.
  window.gherkitApp = {
    refresh: function () {
      return loadWorkspace().then(function () {
        if (!S.path) return;
        if (S.files.indexOf(S.path) < 0) {
          S.path = ''; S.text = S.saved = ''; S.parsed = S.lastGood = null; S.diags = []; S.edit = null;
          showVariant(); renderProblems(); renderOutline(); renderFacts(); return;
        }
        if (!dirty()) return openFile(S.path);
      });
    }
  };
})();
