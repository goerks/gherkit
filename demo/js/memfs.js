// A small in-memory file system for Go's js/wasm runtime: it implements the Node-style `fs` and `process`
// objects that Go's syscall package calls. It must be loaded before wasm_exec.js.
(function (g) {
  'use strict';
  const C = { O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 0x40, O_EXCL: 0x80, O_NOCTTY: 0x100, O_TRUNC: 0x200, O_APPEND: 0x400, O_SYNC: 0x101000, O_DIRECTORY: 0x10000 };
  const S_IFDIR = 0o40000, S_IFREG = 0o100000;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const root = { dir: true, kids: new Map(), mtime: Date.now(), mode: 0o755 };
  let cwd = '/', dirty = false, onChange = null;
  const fds = new Map(); let nextFd = 3;
  let outBuf = '';

  function err(code, msg) { const e = new Error(code + ': ' + (msg || '')); e.code = code; return e; }
  function norm(p) {
    if (!p.startsWith('/')) p = cwd + '/' + p;
    const out = [];
    for (const s of p.split('/')) { if (!s || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
    return out;
  }
  function walk(parts) { let n = root; for (const s of parts) { if (!n.dir) throw err('ENOTDIR', s); n = n.kids.get(s); if (!n) throw err('ENOENT', s); } return n; }
  function lookup(path) { return walk(norm(path)); }
  function parentOf(path) { const p = norm(path); if (!p.length) throw err('EEXIST', path); const name = p.pop(); const dir = walk(p); if (!dir.dir) throw err('ENOTDIR', path); return { dir, name }; }
  function touch() { dirty = true; if (onChange) onChange(); }
  function stat(n) {
    const size = n.dir ? 4096 : n.data.length;
    return { dev: 1, ino: 1, mode: (n.dir ? S_IFDIR : S_IFREG) | (n.mode & 0o777), nlink: 1, uid: 0, gid: 0, rdev: 0, size, blksize: 4096, blocks: Math.ceil(size / 512),
      atimeMs: n.mtime, mtimeMs: n.mtime, ctimeMs: n.mtime, isDirectory() { return n.dir; }, isFile() { return !n.dir; } };
  }
  const cb = (f) => (...a) => { const done = a.pop(); let r; try { r = f(...a); } catch (e) { return done(e); } done(null, r); };

  const fs = {
    constants: C,
    writeSync(fd, buf) { if (fd === 1 || fd === 2) { outBuf += dec.decode(buf); const i = outBuf.lastIndexOf('\n'); if (i >= 0) { (g.gherkitStdout || console.log)(outBuf.slice(0, i), fd); outBuf = outBuf.slice(i + 1); } return buf.length; } throw err('EBADF'); },
    write(fd, buf, offset, length, position, done) {
      try {
        const b = buf.subarray(offset, offset + length);
        if (fd === 1 || fd === 2) return done(null, fs.writeSync(fd, b));
        const f = fds.get(fd); if (!f || !f.w) throw err('EBADF');
        const n = f.node; let pos = f.append ? n.data.length : (position == null ? f.pos : position);
        if (pos + b.length > n.data.length) { const d = new Uint8Array(pos + b.length); d.set(n.data); n.data = d; }
        n.data.set(b, pos); if (position == null) f.pos = pos + b.length; n.mtime = Date.now(); touch(); done(null, b.length);
      } catch (e) { done(e); }
    },
    read(fd, buf, offset, length, position, done) {
      try {
        const f = fds.get(fd); if (!f) throw err('EBADF'); if (f.node.dir) throw err('EISDIR');
        const n = f.node, pos = position == null ? f.pos : position, count = Math.max(0, Math.min(length, n.data.length - pos));
        buf.set(n.data.subarray(pos, pos + count), offset); if (position == null) f.pos = pos + count; done(null, count);
      } catch (e) { done(e); }
    },
    open: cb((path, flags, mode) => {
      const parts = norm(path); let n;
      try { n = walk(parts); if ((flags & C.O_CREAT) && (flags & C.O_EXCL)) throw err('EEXIST', path); }
      catch (e) {
        if (e.code !== 'ENOENT' || !(flags & C.O_CREAT)) throw e;
        const { dir, name } = parentOf(path); n = { dir: false, data: new Uint8Array(0), mtime: Date.now(), mode: mode & 0o777 || 0o644 }; dir.kids.set(name, n); touch();
      }
      const acc = flags & 3;
      if (!n.dir && (flags & C.O_TRUNC) && acc !== C.O_RDONLY) { n.data = new Uint8Array(0); n.mtime = Date.now(); touch(); }
      const fd = nextFd++; fds.set(fd, { node: n, pos: 0, w: acc !== C.O_RDONLY, append: !!(flags & C.O_APPEND) }); return fd;
    }),
    close: cb((fd) => { fds.delete(fd); }),
    fsync: cb(() => { }), ftruncate: cb((fd, len) => { const n = fds.get(fd).node; const d = new Uint8Array(len); d.set(n.data.subarray(0, len)); n.data = d; touch(); }),
    stat: cb((p) => stat(lookup(p))), lstat: cb((p) => stat(lookup(p))), fstat: cb((fd) => { const f = fds.get(fd); if (!f) throw err('EBADF'); return stat(f.node); }),
    readdir: cb((p) => { const n = lookup(p); if (!n.dir) throw err('ENOTDIR', p); return [...n.kids.keys()].sort(); }),
    mkdir: cb((p, perm) => { const { dir, name } = parentOf(p); if (dir.kids.has(name)) throw err('EEXIST', p); dir.kids.set(name, { dir: true, kids: new Map(), mtime: Date.now(), mode: perm & 0o777 || 0o755 }); touch(); }),
    rmdir: cb((p) => { const { dir, name } = parentOf(p); const n = dir.kids.get(name); if (!n) throw err('ENOENT', p); if (!n.dir) throw err('ENOTDIR', p); if (n.kids.size) throw err('ENOTEMPTY', p); dir.kids.delete(name); touch(); }),
    unlink: cb((p) => { const { dir, name } = parentOf(p); const n = dir.kids.get(name); if (!n) throw err('ENOENT', p); if (n.dir) throw err('EISDIR', p); dir.kids.delete(name); touch(); }),
    rename: cb((a, b) => { const s = parentOf(a), n = s.dir.kids.get(s.name); if (!n) throw err('ENOENT', a); const d = parentOf(b); s.dir.kids.delete(s.name); d.dir.kids.set(d.name, n); touch(); }),
    chmod: cb(() => { }), fchmod: cb(() => { }), chown: cb(() => { }), fchown: cb(() => { }), lchown: cb(() => { }), utimes: cb(() => { }), truncate: cb((p, len) => { const n = lookup(p); const d = new Uint8Array(len); d.set(n.data.subarray(0, len)); n.data = d; touch(); }),
    readlink: cb((p) => { lookup(p); throw err('EINVAL', p); }), symlink: cb(() => { throw err('ENOSYS'); }), link: cb(() => { throw err('ENOSYS'); }),
  };
  g.fs = fs;
  g.process = { getuid() { return 0; }, getgid() { return 0; }, geteuid() { return 0; }, getegid() { return 0; }, getgroups() { return [0]; }, pid: 1, ppid: 0, umask() { return 0o22; },
    cwd() { return cwd; }, chdir(d) { const n = lookup(d); if (!n.dir) throw err('ENOTDIR', d); cwd = '/' + norm(d).join('/'); } };

  // Host API for the page: seed, inspect and change files, follow changes.
  function ensureDir(parts) {
    let d = root;
    for (const s of parts) { let k = d.kids.get(s); if (!k) { k = { dir: true, kids: new Map(), mtime: Date.now(), mode: 0o755 }; d.kids.set(s, k); } else if (!k.dir) throw err('ENOTDIR', s); d = k; }
    return d;
  }
  function removeNode(path) { const { dir, name } = parentOf(path); if (!dir.kids.has(name)) throw err('ENOENT', path); dir.kids.delete(name); touch(); }
  g.memfs = {
    writeFile(path, text) { const p = norm(path); const name = p.pop(); ensureDir(p).kids.set(name, { dir: false, data: enc.encode(text), mtime: Date.now(), mode: 0o644 }); touch(); },
    readFile(path) { const n = lookup(path); if (n.dir) throw err('EISDIR', path); return dec.decode(n.data); },
    readdir(path) { const n = lookup(path || '.'); if (!n.dir) throw err('ENOTDIR', path); return [...n.kids.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([name, v]) => ({ name, dir: v.dir })); },
    stat(path) { try { const n = lookup(path); return { dir: n.dir, size: n.dir ? 0 : n.data.length }; } catch (e) { return null; } },
    exists(path) { try { lookup(path); return true; } catch (e) { return false; } },
    mkdir(path) { ensureDir(norm(path)); touch(); },
    remove(path) { removeNode(path); },
    rename(from, to) { const s = parentOf(from), n = s.dir.kids.get(s.name); if (!n) throw err('ENOENT', from); const p = norm(to), name = p.pop(); const d = ensureDir(p); s.dir.kids.delete(s.name); d.kids.set(name, n); touch(); },
    list(prefix) { const out = {}; (function rec(n, p) { for (const [k, v] of n.kids) { const q = p + '/' + k; if (v.dir) rec(v, q); else out[q] = dec.decode(v.data); } })(prefix ? lookup(prefix) : root, prefix ? '/' + norm(prefix).join('/') : ''); return out; },
    clear() { root.kids.clear(); touch(); },
    cwd() { return cwd; },
    chdir(path) { const n = lookup(path); if (!n.dir) throw err('ENOTDIR', path); cwd = '/' + norm(path).join('/'); },
    onChange(f) { onChange = f; }, isDirty() { return dirty; }, markClean() { dirty = false; },
    onOutput(f) { g.gherkitStdout = f; },
  };
})(globalThis);
