// The browser demo: loads gherkit as WebAssembly, seeds the virtual folder with the standard set and offers a small
// terminal. "gherkit ..." runs the real CLI; a few helpers (ls, cat, cd, ...) work on the same virtual folder.
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

  async function loadWasm(base, status) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'wasm_exec.js'; s.onload = res; s.onerror = () => rej(new Error('wasm_exec.js konnte nicht geladen werden')); document.head.appendChild(s); });
    status('Lade gherkit …');
    const r = await fetch(base + 'gherkit.wasm.gz');
    if (!r.ok) throw new Error('gherkit.wasm.gz: HTTP ' + r.status);
    if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser ist zu alt (DecompressionStream fehlt). Bitte einen aktuellen Browser verwenden.');
    const bytes = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    status('Starte gherkit …');
    const go = new g.Go();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(instance); // runs until the page is closed
    for (let i = 0; i < 200 && !g.gherkitReady; i++) await new Promise((r2) => setTimeout(r2, 25));
    if (!g.gherkitReady) throw new Error('gherkit hat nicht gestartet');
  }

  async function seed(base, force) {
    const r = await fetch(base + 'standard-set.json');
    if (!r.ok) throw new Error('standard-set.json: HTTP ' + r.status);
    const set = await r.json();
    if (force) { try { fsx.remove(HOME); } catch (e) { } }
    fsx.mkdir(HOME);
    for (const [p, text] of Object.entries(set.files)) fsx.writeFile(HOME + '/' + p, text);
    fsx.chdir(HOME);
    return Object.keys(set.files).length;
  }

  // ---- terminal -------------------------------------------------------------------------------------------
  function create(mount, base) {
    mount.innerHTML = '';
    const out = document.createElement('div'); out.className = 'term-out'; out.setAttribute('role', 'log'); out.setAttribute('aria-live', 'polite');
    const row = document.createElement('div'); row.className = 'term-row';
    const prompt = document.createElement('span'); prompt.className = 'term-prompt';
    const input = document.createElement('input'); input.id = 'term-input'; input.type = 'text'; input.spellcheck = false; input.autocapitalize = 'off'; input.autocomplete = 'off'; input.setAttribute('aria-label', 'Befehl');
    row.append(prompt, input); mount.append(out, row);
    const history = []; let hpos = 0, busy = false;

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
        print('gherkit-Befehle:  gherkit fmt · lint · parse · report · dialects · help   (Beispiel: gherkit lint --strict .)\n' +
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
        const r = await g.gherkitRun(rest);
        print(r.stdout); print(r.stderr, r.code ? 'err' : 'info');
        if (r.code) print('[exit ' + r.code + ']', 'dim');
        return;
      }
      if (cmd === 'echo') return print(words.slice(1).join(' '));
      if (cmd === 'reset') { const n = await seed(base, true); print('Standardset wiederhergestellt (' + n + ' Dateien).'); setPrompt(); return; }
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
        busy = false; input.disabled = false; setPrompt(); input.focus();
      }
    });
    mount.addEventListener('click', () => { if (!getSelection().toString()) input.focus(); });
    setPrompt();
    return { run: async (line) => { input.value = line; input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); }, print, input };
  }

  g.GherkitDemo = {
    // Loads everything and shows the terminal in `mount`. `status(text)` reports progress.
    async start(mount, base, status) {
      status = status || function () { };
      status('Lade Standardset …');
      const n = await seed(base, false);
      await loadWasm(base, status);
      status('');
      const term = create(mount, base);
      term.print('gherkit läuft in Ihrem Browser. ' + n + ' Beispieldateien liegen im Ordner ~ (mit "ls" ansehen, mit "help" geht es los).', 'info');
      return term;
    },
  };
})(globalThis);
