/**
 * OOXML (ECMA-376) decryption — client-side.
 * Decrypts password-protected .xlsx/.docx/.pptx (encrypted-for-opening) files.
 * Supports Agile encryption (AES-CBC, common in Excel 2010+) via WebCrypto,
 * and Standard encryption (AES-ECB, SHA-1) via a minimal in-JS AES fallback.
 * Exposes window.ooxmlDecrypt(arrayBuffer, password) -> Promise<Uint8Array> (the inner zip).
 */
(() => {
  const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

  const te = new TextEncoder();

  function readCFB(buffer) {
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < 8; i++) {
      if (bytes[i] !== CFB_SIGNATURE[i]) throw new Error('Não é um arquivo OOXML criptografado.');
    }

    const sectorShift = view.getUint16(30, true);
    const miniSectorShift = view.getUint16(32, true);
    const sectorSize = 1 << sectorShift;
    const miniSectorSize = 1 << miniSectorShift;
    const numFatSectors = view.getUint32(44, true);
    const firstDirSector = view.getUint32(48, true);
    const miniStreamCutoff = view.getUint32(56, true);
    const firstMiniFatSector = view.getUint32(60, true);
    const numMiniFatSectors = view.getUint32(64, true);
    const firstDifatSector = view.getUint32(68, true);
    const numDifatSectors = view.getUint32(72, true);

    const sectorOffset = (id) => (id + 1) * sectorSize;

    const difat = [];
    for (let i = 0; i < 109; i++) {
      const v = view.getUint32(76 + i * 4, true);
      if (v === 0xffffffff) break;
      difat.push(v);
    }
    let difatSector = firstDifatSector;
    for (let i = 0; i < numDifatSectors && difatSector !== 0xfffffffe && difatSector !== 0xffffffff; i++) {
      const base = sectorOffset(difatSector);
      const entriesPerSector = sectorSize / 4 - 1;
      for (let j = 0; j < entriesPerSector; j++) {
        const v = view.getUint32(base + j * 4, true);
        if (v !== 0xffffffff) difat.push(v);
      }
      difatSector = view.getUint32(base + (sectorSize - 4), true);
    }

    const fat = [];
    for (const fatSec of difat) {
      const base = sectorOffset(fatSec);
      for (let j = 0; j < sectorSize / 4; j++) fat.push(view.getUint32(base + j * 4, true));
    }

    const readChain = (startSector, sizeSize) => {
      const chunks = [];
      let sec = startSector;
      let guard = 0;
      while (sec !== 0xfffffffe && sec !== 0xffffffff && guard++ < fat.length + 1) {
        const base = sectorOffset(sec);
        chunks.push(bytes.slice(base, base + sizeSize));
        sec = fat[sec];
      }
      return concat(chunks);
    };

    const dirBytes = readChain(firstDirSector, sectorSize);
    const dirView = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    const entries = [];
    const numDirEntries = Math.floor(dirBytes.length / 128);
    for (let i = 0; i < numDirEntries; i++) {
      const off = i * 128;
      const nameLen = dirView.getUint16(off + 64, true);
      if (nameLen === 0) continue;
      let name = '';
      for (let c = 0; c < nameLen / 2 - 1; c++) name += String.fromCharCode(dirView.getUint16(off + c * 2, true));
      const objType = dirView.getUint8(off + 66);
      const startSector = dirView.getUint32(off + 116, true);
      const streamSizeLo = dirView.getUint32(off + 120, true);
      const streamSizeHi = dirView.getUint32(off + 124, true);
      const size = streamSizeHi * 0x100000000 + streamSizeLo;
      entries.push({ name, objType, startSector, size });
    }

    const root = entries.find((e) => e.objType === 5);
    const miniStreamBytes = root ? readChain(root.startSector, sectorSize) : new Uint8Array(0);

    const readMiniChain = (startSector, size) => {
      const miniFatBytes = firstMiniFatSector === 0xfffffffe ? new Uint8Array(0) : readChain(firstMiniFatSector, sectorSize);
      const miniFatView = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
      const chunks = [];
      let sec = startSector;
      let remaining = size;
      let guard = 0;
      while (sec !== 0xfffffffe && sec !== 0xffffffff && remaining > 0 && guard++ < 1e6) {
        const base = sec * miniSectorSize;
        const take = Math.min(miniSectorSize, remaining);
        chunks.push(miniStreamBytes.slice(base, base + take));
        remaining -= take;
        sec = miniFatView.getUint32(sec * 4, true);
      }
      return concat(chunks);
    };

    const getStream = (name) => {
      const e = entries.find((x) => x.name === name && x.objType === 2);
      if (!e) return null;
      if (e.size < miniStreamCutoff) return readMiniChain(e.startSector, e.size).slice(0, e.size);
      return readChain(e.startSector, sectorSize).slice(0, e.size);
    };

    // Overwrite a stream in place with newData (must match the stream's byte length).
    // Writes into a copy of the source buffer and returns it. Handles regular and mini
    // streams; for mini streams, patches the underlying mini-stream container sectors.
    const writeStream = (name, newData) => {
      const e = entries.find((x) => x.name === name && x.objType === 2);
      if (!e) throw new Error(`Stream ${name} não encontrado para escrita.`);
      if (newData.length !== e.size) throw new Error('Tamanho do stream alterado — escrita não suportada.');
      const outBytes = bytes.slice();

      if (e.size >= miniStreamCutoff) {
        let sec = e.startSector, written = 0, guard = 0;
        while (sec !== 0xfffffffe && sec !== 0xffffffff && written < e.size && guard++ < fat.length + 1) {
          const base = sectorOffset(sec);
          const take = Math.min(sectorSize, e.size - written);
          outBytes.set(newData.slice(written, written + take), base);
          written += take;
          sec = fat[sec];
        }
      } else {
        // Mini stream lives inside the root storage's regular-sector chain.
        const miniFatBytes = firstMiniFatSector === 0xfffffffe ? new Uint8Array(0) : readChain(firstMiniFatSector, sectorSize);
        const miniFatView = new DataView(miniFatBytes.buffer, miniFatBytes.byteOffset, miniFatBytes.byteLength);
        const rootSectors = [];
        let rs = root.startSector, g = 0;
        while (rs !== 0xfffffffe && rs !== 0xffffffff && g++ < fat.length + 1) { rootSectors.push(rs); rs = fat[rs]; }
        const miniPerSector = sectorSize / miniSectorSize;
        let sec = e.startSector, written = 0, guard = 0;
        while (sec !== 0xfffffffe && sec !== 0xffffffff && written < e.size && guard++ < 1e6) {
          const rootSecIndex = Math.floor((sec * miniSectorSize) / sectorSize);
          const withinRootSec = (sec * miniSectorSize) % sectorSize;
          const fileOff = sectorOffset(rootSectors[rootSecIndex]) + withinRootSec;
          const take = Math.min(miniSectorSize, e.size - written);
          outBytes.set(newData.slice(written, written + take), fileOff);
          written += take;
          sec = miniFatView.getUint32(sec * 4, true);
        }
      }
      return outBytes;
    };

    return { getStream, writeStream };
  }

  window.cfbTools = { readCFB };

  function concat(chunks) {
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.length; }
    return out;
  }

  function pwToUtf16(password) {
    const buf = new Uint8Array(password.length * 2);
    for (let i = 0; i < password.length; i++) {
      const code = password.charCodeAt(i);
      buf[i * 2] = code & 0xff;
      buf[i * 2 + 1] = code >> 8;
    }
    return buf;
  }

  async function hash(algo, ...parts) {
    const buf = concat(parts.map((p) => (p instanceof Uint8Array ? p : new Uint8Array(p))));
    const digest = await crypto.subtle.digest(algo, buf);
    return new Uint8Array(digest);
  }

  function u32le(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  }

  const HASH_MAP = { SHA1: 'SHA-1', SHA256: 'SHA-256', SHA384: 'SHA-384', SHA512: 'SHA-512' };

  async function deriveKey(algo, password, salt, spinCount, blockKey, keyBits) {
    const h0 = await hash(algo, salt, pwToUtf16(password));
    let h = h0;
    for (let i = 0; i < spinCount; i++) h = await hash(algo, u32le(i), h);
    const hFinal = await hash(algo, h, blockKey);
    return hFinal.slice(0, keyBits / 8);
  }

  async function decryptAgile(encInfoXml, encPackage, password) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(encInfoXml, 'application/xml');
    const keyData = doc.getElementsByTagName('keyData')[0];
    const enc = doc.getElementsByTagNameNS('*', 'encryptedKey')[0];

    const attr = (el, n) => el.getAttribute(n);
    const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

    const keyBits = parseInt(attr(enc, 'keyBits'), 10);
    const hashAlgo = HASH_MAP[attr(enc, 'hashAlgorithm').toUpperCase()] || 'SHA-512';
    const spinCount = parseInt(attr(enc, 'spinCount'), 10);
    const encKeySalt = b64(attr(enc, 'saltValue'));
    const encKeyValue = b64(attr(enc, 'encryptedKeyValue'));

    const blkVerifierInput = new Uint8Array([0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79]);
    const blkVerifierValue = new Uint8Array([0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e]);
    const blkKeyValue = new Uint8Array([0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6]);

    const keyForKeyValue = await deriveKey(hashAlgo, password, encKeySalt, spinCount, blkKeyValue, keyBits);
    const secretKey = await aesCbcNoPad(keyForKeyValue, encKeySalt.slice(0, 16), encKeyValue);

    // Verify password using verifier hash/value.
    const encVerifierHashInput = b64(attr(enc, 'encryptedVerifierHashInput'));
    const encVerifierHashValue = b64(attr(enc, 'encryptedVerifierHashValue'));
    const keyVerInput = await deriveKey(hashAlgo, password, encKeySalt, spinCount, blkVerifierInput, keyBits);
    const keyVerValue = await deriveKey(hashAlgo, password, encKeySalt, spinCount, blkVerifierValue, keyBits);
    const verInput = await aesCbcNoPad(keyVerInput, encKeySalt.slice(0, 16), encVerifierHashInput);
    const verValueDec = await aesCbcNoPad(keyVerValue, encKeySalt.slice(0, 16), encVerifierHashValue);
    const verHash = await hash(hashAlgo, verInput);
    if (!bytesEqual(verHash.slice(0, verValueDec.length), verValueDec.slice(0, verHash.length))) {
      const err = new Error('Senha incorreta');
      err.wrongPassword = true;
      throw err;
    }

    // Decrypt package: keyData salt + per-segment IV = hash(salt, blockIndex).
    const kdSalt = b64(attr(keyData, 'saltValue'));
    const kdHashAlgo = HASH_MAP[attr(keyData, 'hashAlgorithm').toUpperCase()] || hashAlgo;
    const segLen = 4096;
    const totalSize = Number(new DataView(encPackage.buffer, encPackage.byteOffset, 8).getUint32(0, true));
    const cipher = encPackage.slice(8);
    const out = new Uint8Array(cipher.length);
    let written = 0;
    for (let i = 0, off = 0; off < cipher.length; i++, off += segLen) {
      const iv = (await hash(kdHashAlgo, kdSalt, u32le(i))).slice(0, 16);
      const chunk = cipher.slice(off, off + segLen);
      const dec = await aesCbcNoPad(secretKey, iv, chunk);
      out.set(dec, written);
      written += dec.length;
    }
    return out.slice(0, totalSize);
  }

  // AES-CBC decryption without PKCS#7 padding (OOXML pads streams to the block size).
  // WebCrypto forces PKCS#7 on AES-CBC and lacks ECB, so we drive CBC ourselves over a
  // pure-JS single-block AES decrypt.
  async function aesCbcNoPad(keyBytes, iv, data) {
    const key = new Uint8Array(keyBytes);
    const out = new Uint8Array(data.length);
    let prev = new Uint8Array(iv);
    for (let off = 0; off < data.length; off += 16) {
      const block = data.slice(off, off + 16);
      const ecb = AES.decryptBlock(key, block);
      for (let j = 0; j < 16; j++) out[off + j] = ecb[j] ^ prev[j];
      prev = block;
    }
    return out;
  }

  function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  // ---- Minimal pure-JS AES (decrypt single block, 128/192/256) ----
  const AES = (() => {
    const sbox = new Uint8Array(256), inv = new Uint8Array(256);
    (function () {
      let p = 1, q = 1;
      do {
        p = p ^ (p << 1) ^ (p & 0x80 ? 0x11b : 0);
        p &= 0xff;
        q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
        if (q & 0x80) q ^= 0x09;
        const x = q ^ (rotl8(q, 1)) ^ (rotl8(q, 2)) ^ (rotl8(q, 3)) ^ (rotl8(q, 4)) ^ 0x63;
        sbox[p] = x & 0xff;
      } while (p !== 1);
      sbox[0] = 0x63;
      for (let i = 0; i < 256; i++) inv[sbox[i]] = i;
    })();
    function rotl8(x, s) { return ((x << s) | (x >> (8 - s))) & 0xff; }
    function xtime(a) { return ((a << 1) ^ (a & 0x80 ? 0x11b : 0)) & 0xff; }
    function mul(a, b) { let r = 0; for (let i = 0; i < 8; i++) { if (b & 1) r ^= a; const hi = a & 0x80; a = (a << 1) & 0xff; if (hi) a ^= 0x1b; b >>= 1; } return r; }
    const rcon = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36, 0x6c, 0xd8, 0xab, 0x4d];
    function expandKey(key) {
      const Nk = key.length / 4, Nr = Nk + 6;
      const w = new Array(4 * (Nr + 1));
      for (let i = 0; i < Nk; i++) w[i] = [key[4 * i], key[4 * i + 1], key[4 * i + 2], key[4 * i + 3]];
      for (let i = Nk; i < w.length; i++) {
        let t = w[i - 1].slice();
        if (i % Nk === 0) { t = [t[1], t[2], t[3], t[0]].map((b) => sbox[b]); t[0] ^= rcon[i / Nk - 1]; }
        else if (Nk > 6 && i % Nk === 4) t = t.map((b) => sbox[b]);
        w[i] = w[i - Nk].map((b, j) => b ^ t[j]);
      }
      return { w, Nr };
    }
    function decryptBlock(key, input) {
      const { w, Nr } = expandKey(key);
      let s = [];
      for (let i = 0; i < 16; i++) s[i] = input[i];
      addRoundKey(s, w, Nr);
      for (let round = Nr - 1; round >= 1; round--) {
        invShiftRows(s); invSubBytes(s); addRoundKey(s, w, round); invMixColumns(s);
      }
      invShiftRows(s); invSubBytes(s); addRoundKey(s, w, 0);
      return new Uint8Array(s);
    }
    function addRoundKey(s, w, round) { for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) s[c * 4 + r] ^= w[round * 4 + c][r]; }
    function invSubBytes(s) { for (let i = 0; i < 16; i++) s[i] = inv[s[i]]; }
    function invShiftRows(s) {
      const t = s.slice();
      for (let r = 1; r < 4; r++) for (let c = 0; c < 4; c++) s[c * 4 + r] = t[((c - r + 4) % 4) * 4 + r];
    }
    function invMixColumns(s) {
      for (let c = 0; c < 4; c++) {
        const a = [s[c * 4], s[c * 4 + 1], s[c * 4 + 2], s[c * 4 + 3]];
        s[c * 4] = mul(a[0], 14) ^ mul(a[1], 11) ^ mul(a[2], 13) ^ mul(a[3], 9);
        s[c * 4 + 1] = mul(a[0], 9) ^ mul(a[1], 14) ^ mul(a[2], 11) ^ mul(a[3], 13);
        s[c * 4 + 2] = mul(a[0], 13) ^ mul(a[1], 9) ^ mul(a[2], 14) ^ mul(a[3], 11);
        s[c * 4 + 3] = mul(a[0], 11) ^ mul(a[1], 13) ^ mul(a[2], 9) ^ mul(a[3], 14);
      }
    }
    return { decryptBlock };
  })();

  async function ooxmlDecrypt(arrayBuffer, password) {
    const cfb = readCFB(arrayBuffer);
    const encInfo = cfb.getStream('EncryptionInfo');
    const encPackage = cfb.getStream('EncryptedPackage');
    if (!encInfo || !encPackage) throw new Error('Estrutura de criptografia OOXML não encontrada.');

    const view = new DataView(encInfo.buffer, encInfo.byteOffset, encInfo.byteLength);
    const versionMajor = view.getUint16(0, true);
    const versionMinor = view.getUint16(2, true);

    if (versionMajor === 4 && versionMinor === 4) {
      const xml = new TextDecoder('utf-8').decode(encInfo.slice(8));
      return decryptAgile(xml, encPackage, password);
    }
    throw new Error('Formato de criptografia XLSX não suportado (apenas Agile/AES-CBC). Reencripte o arquivo no Excel 2013+.');
  }

  window.ooxmlDecrypt = ooxmlDecrypt;
})();
