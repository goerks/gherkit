// The terminal of the browser demo. "gherkit ..." runs the real CLI (WebAssembly, see demo.js); a few helpers
// (ls, cat, cd, ...) work on the same virtual folder.
(function (g) {
  'use strict';
  const fsx = g.memfs;
  const HOME = '/work';

  function split(line) { // simple quoting, for the helpers only; the CLI splits its own line
    const out = []; let cur = '', has = false, q = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) { if (c === q) q = ''; else if (c === '\\' && q === '"' && /["\\]/.test(line[i + 1] || '')) cur += line[++i]; else cur += c; }
      else if (c === '"' || c === "'") { q = c; has = true; }
      else if (/\s/.test(c)) { if (has || cur) { out.push(cur); cur = ''; has = false; } }
      else { cur += c; has = true; }
    }
    if (has || cur) out.push(cur);
    return out;
  }


  // ---- report pane -----------------------------------------------------------------------------------------
  // A HTML report that a command produced (stdout or a written .html file) is shown right below the terminal.
  const CSS = `
.rp{border:1px solid var(--line,#2c3727);border-radius:10px;margin-top:10px;background:var(--surface,#192016);overflow:hidden}
.rp-head{display:flex;align-items:center;gap:10px;padding:6px 12px;font-size:13px;color:var(--muted,#9ba998)}
.rp-head b{color:var(--fg,#e7eee2)} .rp-head .sp{flex:1}
.rp-head button{font:inherit;font-size:12px;padding:1px 10px;cursor:pointer;border-radius:6px;border:1px solid var(--line,#2c3727);background:var(--sunken,transparent);color:var(--fg,#e7eee2)}
.rp iframe{display:block;width:100%;height:var(--rp-h,520px);border:0;background:#fff}`;
  const TYPES = { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', txt: 'text/plain', md: 'text/plain', json: 'application/json', html: 'text/html' };

  function dirOf(p) { return p.slice(0, p.lastIndexOf('/')) || '/'; }
  // Links to files of the virtual folder (the evidence of manual steps) become blob URLs, so that they open from the preview.
  function resolveLinks(html, baseDir) {
    let doc; try { doc = new DOMParser().parseFromString(html, 'text/html'); } catch (e) { return html; }
    for (const a of doc.querySelectorAll('a[href]')) {
      const h = a.getAttribute('href');
      if (!h || /^([a-z]+:|#|\/\/)/i.test(h)) continue;
      const path = h.startsWith('/') ? h : baseDir + '/' + h;
      let text; try { const st = fsx.stat(path); if (!st || st.dir) continue; text = fsx.readFile(path); } catch (e) { continue; }
      const ext = (path.split('.').pop() || '').toLowerCase();
      a.setAttribute('href', URL.createObjectURL(new Blob([text], { type: TYPES[ext] || 'text/plain' })));
      a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener');
    }
    return '<!doctype html>' + doc.documentElement.outerHTML;
  }
  function htmlFiles() { // {path: text} of all .html files in the virtual folder
    const out = {};
    if (!fsx.exists(HOME)) return out;
    for (const [p, t] of Object.entries(fsx.list(HOME))) if (/\.html?$/i.test(p)) out[p] = t;
    return out;
  }
  const isHtml = (t) => /^\s*<!doctype html|^\s*<html/i.test(t || '');

  function createPane(el) {
    if (!document.getElementById('rp-style')) { const st = document.createElement('style'); st.id = 'rp-style'; st.textContent = CSS; document.head.appendChild(st); }
    el.className = (el.className ? el.className + ' ' : '') + 'rp'; el.hidden = true; el.innerHTML = '';
    const head = document.createElement('div'); head.className = 'rp-head';
    const title = document.createElement('b'); const sp = document.createElement('span'); sp.className = 'sp';
    const tab = document.createElement('button'); tab.type = 'button'; tab.textContent = 'In neuem Tab';
    const close = document.createElement('button'); close.type = 'button'; close.textContent = 'Schliessen'; close.setAttribute('aria-label', 'Report schliessen');
    head.append(Object.assign(document.createElement('span'), { textContent: 'Report:' }), title, sp, tab, close);
    const frame = document.createElement('iframe'); frame.title = 'Report'; frame.setAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
    el.append(head, frame);
    let current = '';
    close.addEventListener('click', () => { el.hidden = true; frame.srcdoc = ''; });
    tab.addEventListener('click', () => { const url = URL.createObjectURL(new Blob([current], { type: 'text/html' })); window.open(url, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(url), 60000); });
    return {
      show(name, html, baseDir) {
        current = resolveLinks(html, baseDir || HOME);
        title.textContent = name; frame.srcdoc = current; el.hidden = false;
        if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      },
    };
  }

  // ---- terminal -------------------------------------------------------------------------------------------
  // opts.afterCommand(line) is called after every command, for example to refresh an editor.
  // opts.report is an element in which HTML reports produced by a command are shown.
  function create(mount, opts) {
    opts = opts || {};
    mount.innerHTML = '';
    const out = document.createElement('div'); out.className = 'term-out'; out.setAttribute('role', 'log'); out.setAttribute('aria-live', 'polite');
    const row = document.createElement('div'); row.className = 'term-row';
    const prompt = document.createElement('span'); prompt.className = 'term-prompt';
    const input = document.createElement('input'); input.id = 'term-input'; input.type = 'text'; input.spellcheck = false; input.autocapitalize = 'off'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Befehl');
    row.append(prompt, input); mount.append(out, row);
    const history = []; let hpos = 0, busy = false;
    const pane = opts.report ? createPane(opts.report) : null;

    const rel = () => { const c = fsx.cwd(); return c === HOME ? '~' : c.startsWith(HOME + '/') ? '~' + c.slice(HOME.length) : c; };
    const setPrompt = () => { prompt.textContent = rel() + ' $'; };
    function print(text, cls) {
      if (text === '') return;
      for (const line of text.replace(/\n$/, '').split('\n')) { const d = document.createElement('div'); d.className = 'term-line' + (cls ? ' ' + cls : ''); d.textContent = line === '' ? ' ' : line; out.appendChild(d); }
      mount.scrollTop = mount.scrollHeight;
    }
    function abs(p) { return p.startsWith('/') ? p : (p === '~' ? HOME : p.startsWith('~/') ? HOME + p.slice(1) : fsx.cwd() + '/' + p); }

    const helpers = {
      help() {
        print('gherkit-Befehle:  gherkit fmt · lint · parse · report · run · dialects · help   (Beispiel: gherkit lint --strict .)\n' +
          'Report:           gherkit report results/examples.cucumber.json -o report.html   (wird gleich angezeigt)\n' +
          'Dateien:          ls · cat · cd · pwd · mkdir · rm · cp · mv · echo "text" > datei\n' +
          'Sonstiges:        clear · reset (Standardset wiederherstellen)');
      },
      clear() { out.innerHTML = ''; },
      pwd() { print(fsx.cwd()); },
      ls(a) {
        const p = abs(a[0] || '.');
        const st = fsx.stat(p); if (!st) return print('ls: ' + (a[0] || '.') + ': Datei oder Ordner nicht gefunden', 'err');
        if (!st.dir) return print(a[0]);
        print(fsx.readdir(p).map((e) => e.name + (e.dir ? '/' : '')).join('\n') || '(leer)');
      },
      cat(a) { if (!a.length) return print('cat: Datei angeben', 'err'); for (const f of a) { try { print(fsx.readFile(abs(f)).replace(/\n$/, '') || ' '); } catch (e) { print('cat: ' + f + ': ' + (e.code === 'EISDIR' ? 'ist ein Ordner' : 'Datei nicht gefunden'), 'err'); } } },
      cd(a) { try { fsx.chdir(abs(a[0] || '~')); } catch (e) { print('cd: ' + a[0] + ': Ordner nicht gefunden', 'err'); } setPrompt(); },
      mkdir(a) { for (const d of a) { try { fsx.mkdir(abs(d)); } catch (e) { print('mkdir: ' + d + ': ' + e.code, 'err'); } } },
      rm(a) { if (!a.length) return print('rm: Datei angeben', 'err'); for (const f of a.filter((x) => !x.startsWith('-'))) { try { fsx.remove(abs(f)); } catch (e) { print('rm: ' + f + ': Datei oder Ordner nicht gefunden', 'err'); } } },
      mv(a) { if (a.length !== 2) return print('mv: mv QUELLE ZIEL', 'err'); try { fsx.rename(abs(a[0]), abs(a[1])); } catch (e) { print('mv: ' + a[0] + ': nicht gefunden', 'err'); } },
      cp(a) { if (a.length !== 2) return print('cp: cp QUELLE ZIEL', 'err'); try { fsx.writeFile(abs(a[1]), fsx.readFile(abs(a[0]))); } catch (e) { print('cp: ' + a[0] + ': nicht gefunden', 'err'); } },
    };

    async function exec(line) {
      line = line.trim(); if (!line) return;
      print(prompt.textContent + ' ' + line, 'cmd');
      const m = line.match(/^echo\s+(.*?)\s*(>>?)\s*(\S+)\s*$/s);   // echo "text" > file
      if (m) {
        const text = split(m[1]).join(' ').replace(/\\n/g, '\n');
        try { const p = abs(m[3]); fsx.writeFile(p, (m[2] === '>>' && fsx.exists(p) ? fsx.readFile(p) : '') + text + '\n'); } catch (e) { print('echo: ' + m[3] + ': ' + e.code, 'err'); }
        return;
      }
      const words = split(line), cmd = words[0];
      if (cmd === 'gherkit') {
        const rest = line.replace(/^\s*gherkit\s*/, '');
        const before = pane ? htmlFiles() : null;
        const r = await g.gherkitRun(rest);
        let stdout = r.stdout, shown = null;
        if (pane) {
          if (isHtml(stdout)) { shown = { name: 'Ausgabe des Befehls', html: stdout, dir: fsx.cwd() }; stdout = ''; }
          else {
            const after = htmlFiles();
            for (const p of Object.keys(after)) if (after[p] !== before[p] && isHtml(after[p])) shown = { name: p.slice(HOME.length + 1), html: after[p], dir: dirOf(p) };
          }
        }
        print(stdout); print(r.stderr, r.code ? 'err' : 'info');
        if (shown) { print('Report «' + shown.name + '» wird unter dem Terminal angezeigt.', 'info'); pane.show(shown.name, shown.html, shown.dir); }
        if (r.code) print('[exit ' + r.code + ']', 'dim');
        return;
      }
      if (cmd === 'echo') return print(words.slice(1).join(' '));
      if (cmd === 'reset') { const n = await g.GherkitDemo.reset(); print('Standardset wiederhergestellt (' + n + ' Dateien).'); setPrompt(); return; }
      if (helpers[cmd]) return helpers[cmd](words.slice(1));
      print('Befehl nicht gefunden: ' + cmd + '  (mit "help" sehen Sie, was möglich ist)', 'err');
    }

    input.addEventListener('keydown', async (e) => {
      if (e.key === 'ArrowUp') { e.preventDefault(); if (hpos > 0) input.value = history[--hpos]; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (hpos < history.length - 1) input.value = history[++hpos]; else { hpos = history.length; input.value = ''; } }
      else if (e.key === 'Enter' && !busy) {
        const line = input.value; input.value = ''; if (line.trim()) { history.push(line); hpos = history.length; }
        busy = true; input.disabled = true;
        try { await exec(line); } catch (err) { print('Fehler: ' + (err && err.message || err), 'err'); }
        if (opts.afterCommand) { try { await opts.afterCommand(line); } catch (err) { } }
        busy = false; input.disabled = false; setPrompt(); input.focus();
      }
    });
    mount.addEventListener('click', () => { if (!getSelection().toString()) input.focus(); });
    setPrompt();
    return { run: async (line) => { input.value = line; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }, print, input };
  }

  g.GherkitTerminal = { create };
})(globalThis);
