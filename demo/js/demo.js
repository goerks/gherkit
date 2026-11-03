// The core of the browser demo: starts gherkit (WebAssembly), keeps the virtual folder /work in the browser
// (IndexedDB), and offers reset, export and import. Pages use it before they show anything.
(function (g) {
  'use strict';
  const fsx = g.memfs, HOME = '/work';
  const DB = 'gherkit-demo', STORE = 'kv', KEY = 'work';
  const TEXT = /\.(feature|json|txt|md|html|tmpl|csv)$/i, MAX_FILE = 2 * 1024 * 1024, MAX_TOTAL = 20 * 1024 * 1024;
  let base = '', standard = null, timer = null;

  // ---- storage in the browser (best effort: private windows may refuse it) ----------------------------------
  function open() { return new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function dbGet(k) { try { const db = await open(); return await new Promise((res, rej) => { const q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); } catch (e) { return undefined; } }
  async function dbPut(k, v) { try { const db = await open(); await new Promise((res, rej) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).put(v, k); t.oncomplete = res; t.onerror = () => rej(t.error); }); return true; } catch (e) { return false; } }

  async function standardSet() {
    if (!standard) {
      const r = await fetch(base + 'standard-set.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('standard-set.json: HTTP ' + r.status);
      standard = (await r.json()).files;
    }
    return standard;
  }
  function files() { // the virtual folder as {relative path: text}
    const out = {};
    if (!fsx.exists(HOME)) return out;
    for (const [p, t] of Object.entries(fsx.list(HOME))) out[p.slice(HOME.length + 1)] = t;
    return out;
  }
  function write(map) { fsx.mkdir(HOME); for (const [p, t] of Object.entries(map)) fsx.writeFile(HOME + '/' + p, t); fsx.chdir(HOME); }
  function saveNow() { clearTimeout(timer); return dbPut(KEY, { v: 1, files: files() }); }
  function saveSoon() { clearTimeout(timer); timer = setTimeout(saveNow, 400); }

  // ---- WebAssembly --------------------------------------------------------------------------------------------
  async function loadWasm(status) {
    await new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'wasm_exec.js' + (g.GHERKIT_V || ''); s.onload = res; s.onerror = () => rej(new Error('wasm_exec.js konnte nicht geladen werden')); document.head.appendChild(s); });
    status('Lade gherkit …');
    const r = await fetch(base + 'gherkit.wasm.gz', { cache: 'no-cache' });
    if (!r.ok) throw new Error('gherkit.wasm.gz: HTTP ' + r.status);
    if (typeof DecompressionStream === 'undefined') throw new Error('Dieser Browser ist zu alt (DecompressionStream fehlt). Bitte einen aktuellen Browser verwenden.');
    const bytes = await new Response(r.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    status('Starte gherkit …');
    const go = new g.Go();
    const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
    go.run(instance); // runs as long as the page is open
    for (let i = 0; i < 200 && !g.gherkitReady; i++) await new Promise((r2) => setTimeout(r2, 25));
    if (!g.gherkitReady) throw new Error('gherkit hat nicht gestartet');
  }

  // ---- public API ---------------------------------------------------------------------------------------------
  const Demo = {
    // base: URL of the site root relative to the page ('' or '../'). Resolves to {fresh}.
    async boot(baseUrl, status) {
      base = baseUrl; status = status || function () { };
      status('Lade Dateien …');
      const stored = await dbGet(KEY);
      const fresh = !(stored && stored.files);
      write(fresh ? await standardSet() : stored.files);
      await loadWasm(status);
      fsx.onChange(saveSoon);
      status('');
      return { fresh };
    },
    // Back to the standard set; own files are removed.
    async reset() {
      try { fsx.remove(HOME); } catch (e) { }
      write(await standardSet());
      await saveNow();
      return Object.keys(standard).length;
    },
    files,
    saveNow,
    zipBlob() { return new Blob([g.GherkitZip.create(files())], { type: 'application/zip' }); },
    // Adds files chosen by the visitor (.feature and other text files, or ZIP archives). Resolves to the number added.
    async importFiles(list) {
      const found = {};
      const clean = (name) => name.split('/').filter((s) => s && s !== '.' && s !== '..').join('/');
      for (const f of Array.from(list)) {
        if (/\.zip$/i.test(f.name)) { const z = await g.GherkitZip.read(await f.arrayBuffer()); for (const [n, t] of Object.entries(z)) found[clean(n)] = t; }
        else found[clean(f.webkitRelativePath || f.name)] = await f.text();
      }
      let total = 0, n = 0;
      for (const [p, t] of Object.entries(found)) {
        if (!p || !TEXT.test(p) || t.length > MAX_FILE || (total += t.length) > MAX_TOTAL) continue;
        fsx.writeFile(HOME + '/' + p, t); n++;
      }
      await saveNow();
      return n;
    },
    // The editor talks to /api/...: answer those requests with the WebAssembly program instead of a server.
    installFetchBridge() {
      const real = g.fetch.bind(g);
      g.fetch = async function (input, init) {
        const u = new URL(typeof input === 'string' ? input : input.url, g.location.href);
        if (u.origin === g.location.origin && u.pathname.startsWith('/api/')) {
          const method = (init && init.method) || 'GET', body = init && init.body ? String(init.body) : '';
          const r = await g.gherkitFetch(method, u.pathname + u.search, body);
          return new Response(r.body, { status: r.status, headers: { 'Content-Type': r.contentType || 'application/json' } });
        }
        return real(input, init);
      };
    },
  };
  g.GherkitDemo = Demo;
})(globalThis);
