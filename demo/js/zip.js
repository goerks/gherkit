// A small ZIP writer (stored, UTF-8 names) and reader (stored and deflate) for the demo's export and import.
(function (g) {
  'use strict';
  const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  const enc = new TextEncoder(), dec = new TextDecoder();
  const u16 = (n) => [n & 255, (n >> 8) & 255];
  const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];

  // files: {path: text} -> Uint8Array
  function create(files) {
    const parts = [], central = []; let offset = 0;
    for (const [name, text] of Object.entries(files)) {
      const nameB = enc.encode(name), data = enc.encode(text), crc = crc32(data);
      const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0)]);
      const cen = new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]);
      parts.push(local, nameB, data); central.push(cen, nameB);
      offset += local.length + nameB.length + data.length;
    }
    const cenSize = central.reduce((n, p) => n + p.length, 0), count = Object.keys(files).length;
    const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(count), ...u16(count), ...u32(cenSize), ...u32(offset), ...u16(0)]);
    const all = [...parts, ...central, end], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
    let pos = 0; for (const p of all) { out.set(p, pos); pos += p.length; }
    return out;
  }

  // ArrayBuffer -> Promise<{path: text}> (folders are skipped)
  async function read(arrayBuffer) {
    const v = new DataView(arrayBuffer), bytes = new Uint8Array(arrayBuffer);
    let e = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (v.getUint32(i, true) === 0x06054b50) { e = i; break; }
    if (e < 0) throw new Error('Das ist keine gültige ZIP-Datei.');
    const count = v.getUint16(e + 10, true); let p = v.getUint32(e + 16, true); const out = {};
    for (let i = 0; i < count; i++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('Die ZIP-Datei ist beschädigt.');
      const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), el = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nl)); p += 46 + nl + el + cl;
      if (name.endsWith('/')) continue;
      const start = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
      let data = bytes.subarray(start, start + csize);
      if (method === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
      else if (method !== 0) throw new Error('Nicht unterstützte ZIP-Kompression in ' + name);
      out[name] = dec.decode(data);
    }
    return out;
  }

  g.GherkitZip = { create, read };
})(globalThis);
