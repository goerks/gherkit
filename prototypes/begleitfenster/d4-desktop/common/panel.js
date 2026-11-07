// Begleitfenster für die manuelle Ausführung: ein kleines Panel (ca. 340 x 480), das in jede Umgebung passt
// (Picture-in-Picture-Fenster, Popup, Erweiterungs-Seitenleiste, eingeblendet in der getesteten Seite,
// Desktop-Fenster). Es kennt nur sein Wurzelelement und optionale Hilfsfunktionen:
//   GherkitPanel.mount(root, { scenarios, load, save, locate, captureEvidence, onExport, title })
//   load()               -> gespeicherter Zustand oder null (synchron)
//   save(state)          -> Zustand sichern
//   locate(selector)     -> in der getesteten Anwendung zum Feld springen (nur D2, D3)
//   captureEvidence()    -> Promise<dataURL>; ohne: Bildschirmfreigabe des Browsers
//   onExport(name, json) -> Export selbst behandeln; ohne: Download im Browser
//   keysOnPanel          -> Tastenkürzel (G, S, I, Pfeil links) nur im Panel auslösen
(function (g) {
  'use strict';

  var CSS = [
    ':host,.gk{all:initial}',
    '.gk{display:flex;flex-direction:column;box-sizing:border-box;width:100%;height:100%;min-height:0;font:13px/1.35 system-ui,Segoe UI,sans-serif;color:#1d2433;background:#f6f7f9}',
    '.gk *{box-sizing:border-box}',
    '.gk button{font:inherit;cursor:pointer}',
    '.gk-top{display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1d2d44;color:#fff;-webkit-app-region:drag}',
    '.gk-top b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:600}',
    '.gk-top button{background:transparent;color:#fff;border:1px solid #ffffff55;border-radius:4px;padding:2px 7px;-webkit-app-region:no-drag}',
    '.gk-dots{display:flex;gap:4px;padding:8px 10px 0}',
    '.gk-dot{flex:1;height:6px;border-radius:3px;background:#d4d9e1;border:0;padding:0}',
    '.gk-dot.cur{outline:2px solid #1d2d44;outline-offset:1px}',
    '.gk-dot.passed{background:#2e9e5b}.gk-dot.failed{background:#d64545}.gk-dot.ignored{background:#6b7586}.gk-dot.skipped{background:#e6e9ef}',
    '.gk-body{flex:1;min-height:0;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px}',
    '.gk-meta{color:#5b6577;font-size:12px}',
    '.gk-step{background:#fff;border:1px solid #d4d9e1;border-radius:8px;padding:10px 12px;font-size:15px}',
    '.gk-step i{font-style:normal;font-weight:700;color:#1d2d44;margin-right:6px}',
    '.gk-btns{display:flex;gap:6px}',
    '.gk-btns button{flex:1;padding:9px 4px;border-radius:6px;border:0;color:#fff;font-weight:600}',
    '.gk-good{background:#2e9e5b}.gk-bad{background:#d64545}.gk-ign{background:#6b7586}',
    '.gk-btns u{text-decoration:none;opacity:.75;font-weight:400;font-size:11px;margin-left:3px}',
    '.gk textarea{width:100%;min-height:54px;resize:vertical;padding:6px 8px;border:1px solid #c3cad6;border-radius:6px;font:inherit;background:#fff;color:inherit}',
    '.gk textarea.need{border-color:#d64545;box-shadow:0 0 0 2px #d6454533}',
    '.gk-err{color:#d64545;font-size:12px}',
    '.gk-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}',
    '.gk-sm{background:#fff;border:1px solid #c3cad6;border-radius:6px;padding:4px 9px;color:#1d2433}',
    '.gk-sm:hover{background:#eef1f6}',
    '.gk-thumb{height:34px;border:1px solid #c3cad6;border-radius:4px}',
    '.gk-chk{display:flex;gap:5px;align-items:center;font-size:12px;color:#5b6577}',
    '.gk-list{display:flex;flex-direction:column;gap:6px}',
    '.gk-sc{display:flex;gap:8px;align-items:center;background:#fff;border:1px solid #d4d9e1;border-radius:8px;padding:8px 10px;text-align:left;width:100%}',
    '.gk-badge{border-radius:10px;padding:1px 8px;font-size:11px;color:#fff;background:#9aa3b2;white-space:nowrap}',
    '.gk-badge.passed{background:#2e9e5b}.gk-badge.failed{background:#d64545}.gk-badge.ignored{background:#6b7586}.gk-badge.open{background:#b8c0cc;color:#1d2433}',
    '.gk-foot{padding:6px 10px;border-top:1px solid #d4d9e1;display:flex;gap:6px;background:#fff}'
  ].join('\n');

  var KEYS = { g: 'passed', s: 'failed', i: 'ignored' };
  var LABEL = { passed: 'bestanden', failed: 'fehlgeschlagen', ignored: 'ignoriert', open: 'offen', skipped: 'übersprungen' };

  // Schritte nach einem Fehler oder «ignoriert» im selben Szenario gelten als übersprungen, nicht als offen.
  function stepState(st, si, i) {
    var r = (st.res[si + ':' + i] || {}).status;
    if (r) return r;
    for (var k = 0; k < i; k++) { var q = (st.res[si + ':' + k] || {}).status; if (q === 'failed' || q === 'ignored') return 'skipped'; }
    return 'open';
  }

  function scStatus(st, sc, si) {
    var s = sc.steps.map(function (_, i) { return (st.res[si + ':' + i] || {}).status; });
    if (s.indexOf('failed') >= 0) return 'failed';
    if (s.indexOf('ignored') >= 0) return 'ignored';
    if (s.every(function (x) { return x === 'passed'; })) return 'passed';
    return 'open';
  }

  function mount(root, opts) {
    var doc = root.ownerDocument, win = doc.defaultView || window;
    var scenarios = opts.scenarios || g.GK_SCENARIOS;
    var st = (opts.load && opts.load()) || null;
    if (!st || !st.res) st = { cur: { s: 0, i: 0 }, res: {}, started: Date.now(), view: 'run' };
    var auto = st.auto !== false;
    var err = '', stream = null;

    function el(tag, cls, text, kids) {
      var e = doc.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      (kids || []).forEach(function (k) { e.appendChild(k); });
      return e;
    }
    function btn(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function save() { st.auto = auto; if (opts.save) { try { opts.save(st); } catch (e) { /* Speicher voll */ } } }
    function key() { return st.cur.s + ':' + st.cur.i; }
    function res() { return (st.res[key()] = st.res[key()] || {}); }
    function step() { return scenarios[st.cur.s].steps[st.cur.i]; }
    function counts() {
      var c = { passed: 0, failed: 0, ignored: 0, open: 0, skipped: 0 };
      scenarios.forEach(function (sc, si) { sc.steps.forEach(function (_, i) { c[stepState(st, si, i)]++; }); });
      return c;
    }
    function maybeLocate() { if (auto && opts.locate && step().target) opts.locate(step().target); }
    function go(s, i) { st.cur = { s: s, i: i }; err = ''; save(); render(); maybeLocate(); }

    function next(failedOrIgnored) {
      var s = st.cur.s, i = st.cur.i;
      if (!failedOrIgnored && i + 1 < scenarios[s].steps.length) return go(s, i + 1);
      // Fehler oder Ende des Szenarios: weiter zum nächsten Szenario mit offenen Schritten
      for (var k = 1; k <= scenarios.length; k++) {
        var n = (s + k) % scenarios.length, sc = scenarios[n];
        for (var j = 0; j < sc.steps.length; j++) if (stepState(st, n, j) === 'open') { if (n === s && k === scenarios.length && j <= i) continue; return go(n, j); }
      }
      st.view = 'over'; save(); render();
    }

    function answer(status) {
      var r = res();
      if ((status === 'failed' || status === 'ignored') && !(r.note || '').trim()) { err = 'Bei «' + (status === 'failed' ? 'Schlecht' : 'Ignorieren') + '» ist eine Begründung Pflicht.'; render(); var t = root.querySelector('textarea'); if (t) t.focus(); return; }
      r.status = status; err = ''; save();
      next(status !== 'passed');
    }

    function capture() {
      var p = opts.captureEvidence ? opts.captureEvidence() : defaultCapture();
      Promise.resolve(p).then(function (data) { if (data) addEvidence(data, 'Bildschirm'); }, function (e) { err = 'Nachweis nicht möglich: ' + (e && e.message || e); render(); });
    }
    function addEvidence(data, name) { var r = res(); (r.ev = r.ev || []).push({ name: name, data: data }); save(); render(); }
    function defaultCapture() {
      var md = win.navigator.mediaDevices;
      if (!md || !md.getDisplayMedia) return Promise.reject(new Error('Bildschirmfreigabe wird nicht unterstützt'));
      var have = stream && stream.active ? Promise.resolve(stream) : md.getDisplayMedia({ video: true }).then(function (s) { stream = s; return s; });
      return have.then(function (s) {
        return new Promise(function (ok, fail) {
          var v = doc.createElement('video'); v.muted = true; v.srcObject = s;
          v.onloadedmetadata = function () {
            v.play().then(function () {
              setTimeout(function () {
                var c = doc.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight;
                c.getContext('2d').drawImage(v, 0, 0); ok(c.toDataURL('image/png'));
              }, 150);
            }, fail);
          };
        });
      });
    }
    var scope = opts.keysOnPanel ? root : doc; // D3: Tasten nur im Panel, nicht in der getesteten Seite
    scope.addEventListener('paste', function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var n = 0; n < items.length; n++) if (items[n].type.indexOf('image') === 0) {
        var f = items[n].getAsFile(), fr = new win.FileReader();
        fr.onload = function () { addEvidence(fr.result, 'Eingefügt'); }; fr.readAsDataURL(f);
      }
    });
    scope.addEventListener('keydown', function (e) {
      var o = (e.composedPath && e.composedPath()[0]) || e.target, t = o && o.tagName;
      if (t === 'TEXTAREA' || t === 'INPUT' || e.ctrlKey || e.altKey || e.metaKey || st.view !== 'run') return;
      var k = e.key.toLowerCase();
      if (KEYS[k]) { e.preventDefault(); answer(KEYS[k]); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    });
    function back() {
      var s = st.cur.s, i = st.cur.i;
      if (i > 0) go(s, i - 1); else if (s > 0) go(s - 1, scenarios[s - 1].steps.length - 1);
    }

    function exportXray() {
      var json = JSON.stringify(g.GherkitXray.build(scenarios, st, {}), null, 2), name = 'xray-lauf.json';
      if (opts.onExport) return opts.onExport(name, json);
      var a = doc.createElement('a'); a.href = win.URL.createObjectURL(new win.Blob([json], { type: 'application/json' })); a.download = name;
      doc.body.appendChild(a); a.click(); a.remove();
    }

    function top(title) {
      var kids = [el('b', null, title)];
      kids.push(btn('', st.view === 'run' ? 'Übersicht' : 'Zurück zum Test', function () { st.view = st.view === 'run' ? 'over' : 'run'; save(); render(); }));
      return el('div', 'gk-top', null, kids);
    }

    function renderRun() {
      var sc = scenarios[st.cur.s], stp = step(), r = res();
      var top_ = top(sc.feature + ' · ' + sc.name);
      var dots = el('div', 'gk-dots');
      sc.steps.forEach(function (_, i) {
        var d = el('button', 'gk-dot' + (i === st.cur.i ? ' cur' : '') + ' ' + (stepState(st, st.cur.s, i) === 'open' ? '' : stepState(st, st.cur.s, i)));
        d.type = 'button'; d.title = 'Schritt ' + (i + 1); d.addEventListener('click', function () { go(st.cur.s, i); }); dots.appendChild(d);
      });
      var body = el('div', 'gk-body');
      body.appendChild(el('div', 'gk-meta', 'Szenario ' + (st.cur.s + 1) + ' von ' + scenarios.length + ' · Schritt ' + (st.cur.i + 1) + ' von ' + sc.steps.length + (sc.testKey ? ' · ' + sc.testKey : '')));
      var card = el('div', 'gk-step'); card.appendChild(el('i', null, stp.kw)); card.appendChild(doc.createTextNode(stp.text)); body.appendChild(card);
      if (r.status) body.appendChild(el('div', 'gk-meta', 'Bisher: ' + LABEL[r.status]));
      var b = el('div', 'gk-btns');
      [['passed', 'gk-good', 'Gut', 'G'], ['failed', 'gk-bad', 'Schlecht', 'S'], ['ignored', 'gk-ign', 'Ignorieren', 'I']].forEach(function (x) {
        var bb = btn(x[1], x[2], function () { answer(x[0]); }); bb.appendChild(el('u', null, x[3])); b.appendChild(bb);
      });
      body.appendChild(b);
      var ta = el('textarea', err ? 'need' : ''); ta.placeholder = 'Kommentar (bei Schlecht/Ignorieren Pflicht)'; ta.value = r.note || '';
      ta.addEventListener('input', function () { res().note = ta.value; save(); });
      body.appendChild(ta);
      if (err) body.appendChild(el('div', 'gk-err', err));
      var row = el('div', 'gk-row');
      row.appendChild(btn('gk-sm', 'Nachweis', capture));
      if (opts.locate && stp.target) row.appendChild(btn('gk-sm', 'Zum Feld', function () { opts.locate(stp.target); }));
      (r.ev || []).forEach(function (x) { var im = el('img', 'gk-thumb'); im.src = x.data; im.title = x.name; row.appendChild(im); });
      body.appendChild(row);
      if (!opts.captureEvidence && !(r.ev || []).length) body.appendChild(el('div', 'gk-meta', 'Nachweis: Fenster einmal freigeben, danach genügt ein Klick. Oder Screenshot mit Strg+V einfügen.'));
      if (opts.locate) {
        var lab = el('label', 'gk-chk'), cb = doc.createElement('input'); cb.type = 'checkbox'; cb.checked = auto;
        cb.addEventListener('change', function () { auto = cb.checked; save(); if (auto) maybeLocate(); });
        lab.appendChild(cb); lab.appendChild(doc.createTextNode('Automatisch zum Feld springen')); body.appendChild(lab);
      }
      var foot = el('div', 'gk-foot', null, [btn('gk-sm', '◀ Zurück', back), btn('gk-sm', 'Überspringen ▶', function () { var s = st.cur.s, i = st.cur.i; if (i + 1 < sc.steps.length) go(s, i + 1); else if (s + 1 < scenarios.length) go(s + 1, 0); })]);
      return [top_, dots, body, foot];
    }

    function renderOver() {
      var c = counts(), body = el('div', 'gk-body');
      body.appendChild(el('div', 'gk-meta', c.passed + ' bestanden · ' + c.failed + ' fehlgeschlagen · ' + c.ignored + ' ignoriert · ' + c.skipped + ' übersprungen · ' + c.open + ' offen (Schritte)'));
      var list = el('div', 'gk-list');
      scenarios.forEach(function (sc, si) {
        var s = scStatus(st, sc, si), b = btn('gk-sc', '', function () { var first = 0; for (var j = 0; j < sc.steps.length; j++) if (stepState(st, si, j) === 'open') { first = j; break; } st.view = 'run'; go(si, first); });
        b.appendChild(el('span', 'gk-badge ' + s, LABEL[s])); b.appendChild(el('span', null, sc.name)); list.appendChild(b);
      });
      body.appendChild(list);
      var foot = el('div', 'gk-foot', null, [btn('gk-sm', 'Xray-JSON', exportXray), btn('gk-sm', 'Lauf zurücksetzen', function () { if (win.confirm('Alle Ergebnisse dieses Laufs löschen?')) { st = { cur: { s: 0, i: 0 }, res: {}, started: Date.now(), view: 'run' }; save(); render(); } })]);
      return [top('Ergebnisse'), body, foot];
    }

    function render() {
      var keep = root.querySelector('textarea'), pos = keep ? keep.selectionStart : 0, had = keep && doc.activeElement === keep;
      while (root.firstChild) root.removeChild(root.firstChild);
      var style = el('style', null, CSS), wrap = el('div', 'gk');
      (st.view === 'over' ? renderOver() : renderRun()).forEach(function (k) { wrap.appendChild(k); });
      root.appendChild(style); root.appendChild(wrap);
      if (had) { var t = root.querySelector('textarea'); if (t) { t.focus(); t.setSelectionRange(pos, pos); } }
    }

    render();
    setTimeout(maybeLocate, 300);
    return { go: go, state: function () { return st; }, stop: function () { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } };
  }

  g.GherkitPanel = {
    mount: mount,
    localStore: function (k) {
      return {
        load: function () { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
        save: function (s) { try { localStorage.setItem(k, JSON.stringify(s)); } catch (e) { /* voll */ } }
      };
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
