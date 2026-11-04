// Starts the editor page of the demo: boots gherkit, answers the editor's API requests in the browser, adds the demo
// bar (reset, export, import) and a terminal, then loads the editor itself.
(function (g) {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const css = `
.demo-badge{font:600 11px system-ui,sans-serif;border-radius:999px;padding:1px 9px;background:var(--accent-soft);color:var(--accent)}
.demo-banner{background:var(--accent-soft);border-bottom:1px solid var(--accent);color:var(--fg);font-size:13px;padding:6px 14px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.demo-banner b{color:var(--accent)} .demo-banner .sp{flex:1}
.demo-banner a{color:var(--accent)}
.dock{border-top:1px solid var(--line);background:var(--surface);flex:none}
.dock-head{display:flex;align-items:center;gap:10px;padding:0 14px;height:34px;font-size:12px;color:var(--muted)}
.dock-head b{color:var(--fg);font-weight:600} .dock-head .sp{flex:1} .dock-head button{font-size:11px;padding:1px 9px}
#dock-term{height:230px;background:#14181a;color:#d9e1dc;padding:10px 16px;overflow:auto;font:12.5px/1.5 ui-monospace,"SF Mono",Menlo,Consolas,monospace}
.term-line{white-space:pre-wrap;word-break:break-word}.term-line.cmd{color:#fff}.term-line.err{color:#ef8f82}.term-line.dim{color:#8b9892}.term-line.info{color:#b9c6bf}
.term-row{display:flex;gap:8px;align-items:center}.term-prompt{color:#8cc56d;white-space:nowrap}
#term-input{flex:1;min-width:0;background:transparent;border:0;outline:0;color:#fff;font:inherit;caret-color:#8cc56d;padding:0}
.demo-load{position:fixed;inset:0;background:var(--bg);color:var(--fg);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;z-index:50;font:15px system-ui,sans-serif}
.demo-load small{color:var(--muted)}`;

  function overlay() {
    const o = document.createElement('div'); o.className = 'demo-load';
    o.innerHTML = '<b>gherkit</b><span id="demo-load-text">Lade …</span><small>Läuft vollständig in Ihrem Browser.</small>';
    document.body.appendChild(o);
    return { set(t) { const e = $('demo-load-text'); if (e) e.textContent = t || 'Lade …'; }, fail(t) { o.innerHTML = '<b>Die Demo konnte nicht starten</b><span>' + t + '</span><small><a href="../">Zurück zur Startseite</a></small>'; }, done() { o.remove(); } };
  }
  const V = (document.currentScript && document.currentScript.src.split('?')[1]) ? '?' + document.currentScript.src.split('?')[1] : '';
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src + V; s.onload = res; s.onerror = () => rej(new Error(src + ' konnte nicht geladen werden')); document.body.appendChild(s); }); }
  function button(id, text, title) { const b = document.createElement('button'); b.id = id; b.type = 'button'; b.textContent = text; if (title) b.title = title; return b; }

  function decorate() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const brand = document.querySelector('.brand'); const badge = document.createElement('span'); badge.className = 'demo-badge'; badge.textContent = 'Demo'; brand.appendChild(badge);

    const banner = document.createElement('div'); banner.className = 'demo-banner';
    banner.innerHTML = '<span><b>Demo.</b> Läuft vollständig in Ihrem Browser. Ihre Dateien verlassen ihn nie und sind für andere nicht sichtbar.</span><span class="sp"></span><span>Standardbeispiele ändern ist erlaubt, „Zurücksetzen“ stellt sie wieder her. · Manueller Test: Tab „Ausführen“ (Beispiel: Bibliothek, Ordner <code>bibliothek</code>). · <a href="../">Startseite und Downloads</a></span>';
    document.querySelector('header.top').after(banner);

    const actions = document.querySelector('.actions');
    const reset = button('demo-reset', 'Zurücksetzen', 'Standardset wiederherstellen, eigene Dateien entfernen');
    const exp = button('demo-export', 'Export ZIP', 'Alle Dateien als ZIP herunterladen');
    const imp = button('demo-import', 'Import', 'Dateien oder ein ZIP hinzufügen');
    const input = document.createElement('input'); input.type = 'file'; input.id = 'demo-import-input'; input.multiple = true; input.hidden = true; input.accept = '.feature,.zip,.json,.txt,.md,.tmpl,.csv';
    actions.prepend(imp, exp, reset, input);
    reset.addEventListener('click', async () => { if (!confirm('Standardset wiederherstellen? Eigene Dateien und Änderungen gehen verloren.')) return; await GherkitDemo.reset(); location.reload(); });
    exp.addEventListener('click', () => { const url = URL.createObjectURL(GherkitDemo.zipBlob()); const a = document.createElement('a'); a.href = url; a.download = 'gherkit-demo.zip'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000); });
    imp.addEventListener('click', () => input.click());
    input.addEventListener('change', async () => { try { const n = await GherkitDemo.importFiles(input.files); alert(n + ' Datei(en) hinzugefügt.'); } catch (e) { alert('Import nicht möglich: ' + (e && e.message || e)); } location.reload(); });
    addEventListener('dragover', (e) => e.preventDefault());
    addEventListener('drop', async (e) => { if (!e.dataTransfer || !e.dataTransfer.files.length) return; e.preventDefault(); try { await GherkitDemo.importFiles(e.dataTransfer.files); } catch (err) { alert('Import nicht möglich: ' + (err && err.message || err)); } location.reload(); });
    document.getElementById('ws-btn').disabled = true; // one virtual folder, no folder picker in the demo

    // terminal dock below the editor
    const dock = document.createElement('div'); dock.className = 'dock'; dock.id = 'dock';
    dock.innerHTML = '<div class="dock-head"><b>Terminal</b><span>gherkit im Browser</span><span class="sp"></span><span>fmt · lint · parse · report · dialects · help</span><button id="dock-toggle" type="button">Aufklappen</button></div><div id="dock-term" hidden></div>';
    document.querySelector('.layout').after(dock);
    let term = null;
    $('dock-toggle').addEventListener('click', () => {
      const open = $('dock-term').hidden; $('dock-term').hidden = !open; $('dock-toggle').textContent = open ? 'Einklappen' : 'Aufklappen';
      if (open && !term) {
        term = GherkitTerminal.create($('dock-term'), { afterCommand: () => g.gherkitApp && g.gherkitApp.refresh() });
        term.print('Dieselben Dateien wie im Editor. Änderungen aus dem Terminal erscheinen dort sofort.', 'info');
      }
      if (open && term) term.input.focus();
    });
  }

  (async function () {
    const o = overlay();
    try {
      g.GHERKIT_V = V;
      await GherkitDemo.boot('../', (t) => o.set(t));
      GherkitDemo.installFetchBridge();
      decorate();
      await loadScript('highlight.js');
      await loadScript('run.js');
      await loadScript('app.js');
      o.done();
    } catch (e) { o.fail((e && e.message) || String(e)); }
  })();
})(globalThis);
