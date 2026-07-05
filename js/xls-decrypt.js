/**
 * Legacy .xls (BIFF8) RC4 CryptoAPI decryption — client-side.
 * Decrypts the Workbook stream in place inside its CFB/OLE2 container and rewrites an
 * unencrypted .xls. Algorithm mirrors MS-XLS / [MS-OFFCRYPTO] RC4 CryptoAPI.
 * Requires window.cfbTools (from ooxml-decrypt.js).
 * Exposes window.xlsDecrypt(arrayBuffer, password) -> Promise<Uint8Array>.
 */
(() => {
  const BLOCK_SIZE = 1024;
  const FILEPASS = 0x002f;
  const BOF = 0x0809;
  const BOUNDSHEET8 = 0x0085;
  // Records that MUST NOT be encrypted (MS-XLS 2.4.117): BOF, FilePass, UsrExcl,
  // FileLock, InterfaceHdr, RRDInfo, RRDHead.
  const PLAINTEXT_RECORDS = new Set([BOF, FILEPASS, 0x0194, 0x0195, 0x00e1, 0x0196, 0x0198]);

  function rc4(key, data) {
    const s = new Uint8Array(256);
    for (let i = 0; i < 256; i++) s[i] = i;
    let j = 0;
    for (let i = 0; i < 256; i++) {
      j = (j + s[i] + key[i % key.length]) & 0xff;
      const t = s[i]; s[i] = s[j]; s[j] = t;
    }
    const out = new Uint8Array(data.length);
    let a = 0, b = 0;
    for (let k = 0; k < data.length; k++) {
      a = (a + 1) & 0xff;
      b = (b + s[a]) & 0xff;
      const t = s[a]; s[a] = s[b]; s[b] = t;
      out[k] = data[k] ^ s[(s[a] + s[b]) & 0xff];
    }
    return out;
  }

  function u32le(n) {
    const b = new Uint8Array(4);
    new DataView(b.buffer).setUint32(0, n, true);
    return b;
  }

  function pwToUtf16(password) {
    const buf = new Uint8Array(password.length * 2);
    for (let i = 0; i < password.length; i++) {
      const c = password.charCodeAt(i);
      buf[i * 2] = c & 0xff;
      buf[i * 2 + 1] = c >> 8;
    }
    return buf;
  }

  function concat(a, b) {
    const out = new Uint8Array(a.length + b.length);
    out.set(a); out.set(b, a.length);
    return out;
  }

  async function sha1(bytes) {
    return new Uint8Array(await crypto.subtle.digest('SHA-1', bytes));
  }

  async function makeKey(password, salt, keyBits, block) {
    const h0 = await sha1(concat(salt, pwToUtf16(password)));
    const hFinal = await sha1(concat(h0, u32le(block)));
    if (keyBits === 40) return concat(hFinal.slice(0, 5), new Uint8Array(11));
    return hFinal.slice(0, keyBits / 8);
  }

  function parseFilepass(body) {
    const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
    let p = 0;
    const encType = dv.getUint16(p, true); p += 2;
    if (encType === 0) throw new Error('.xls usa ofuscação XOR (não suportado). Reencripte no Excel.');
    const vMajor = dv.getUint16(p, true); const vMinor = dv.getUint16(p + 2, true); p += 4;
    if (!([2, 3, 4].includes(vMajor) && vMinor === 2)) {
      throw new Error('.xls: criptografia RC4 antiga não suportada. Reencripte no Excel 2003+.');
    }
    p += 4; // flags
    const headerSize = dv.getUint32(p, true); p += 4;
    const header = body.slice(p, p + headerSize);
    const hdv = new DataView(header.buffer, header.byteOffset, header.byteLength);
    const algId = hdv.getUint32(8, true);
    const keyBits = hdv.getUint32(16, true);
    if (algId !== 0x6801) throw new Error('.xls: algoritmo não é RC4.');
    p += headerSize;
    const saltSize = dv.getUint32(p, true); p += 4;
    const salt = body.slice(p, p + saltSize); p += saltSize;
    const encVerifier = body.slice(p, p + 16); p += 16;
    p += 4; // verifierHashSize
    const encVerifierHash = body.slice(p, p + 16);
    return { salt, keyBits, encVerifier, encVerifierHash };
  }

  async function verifyPassword(password, info) {
    const key = await makeKey(password, info.salt, info.keyBits, 0);
    // Single continuous RC4 stream over verifier (16) then verifierHash (16).
    const combined = rc4(key, concat(info.encVerifier, info.encVerifierHash));
    const verifier = combined.slice(0, 16);
    const verifierHash = combined.slice(16, 32);
    const computed = await sha1(verifier);
    for (let i = 0; i < 16; i++) if (computed[i] !== verifierHash[i]) return false;
    return true;
  }

  async function decryptWorkbook(wb, password, info) {
    // Build the RC4 input buffer with plaintext records zeroed, and a plain overlay.
    const encInput = new Uint8Array(wb.length);
    const overlay = new Int16Array(wb.length).fill(-1); // -1 => keep decrypted; >=0 => forced byte
    const dvWb = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);

    let pos = 0;
    while (pos + 4 <= wb.length) {
      const num = dvWb.getUint16(pos, true);
      const size = dvWb.getUint16(pos + 2, true);
      const bodyStart = pos + 4;
      const recTotal = 4 + size;

      if (num === FILEPASS) {
        overlay[pos] = 0; overlay[pos + 1] = 0;
        overlay[pos + 2] = size & 0xff; overlay[pos + 3] = (size >> 8) & 0xff;
        for (let k = 0; k < size; k++) overlay[bodyStart + k] = 0;
        // encInput already zero for this range
      } else if (PLAINTEXT_RECORDS.has(num)) {
        overlay[pos] = num & 0xff; overlay[pos + 1] = (num >> 8) & 0xff;
        overlay[pos + 2] = size & 0xff; overlay[pos + 3] = (size >> 8) & 0xff;
        for (let k = 0; k < size; k++) overlay[bodyStart + k] = wb[bodyStart + k];
      } else if (num === BOUNDSHEET8) {
        overlay[pos] = num & 0xff; overlay[pos + 1] = (num >> 8) & 0xff;
        overlay[pos + 2] = size & 0xff; overlay[pos + 3] = (size >> 8) & 0xff;
        for (let k = 0; k < 4; k++) overlay[bodyStart + k] = wb[bodyStart + k]; // lbPlyPos plaintext
        for (let k = 4; k < size; k++) encInput[bodyStart + k] = wb[bodyStart + k];
      } else {
        overlay[pos] = num & 0xff; overlay[pos + 1] = (num >> 8) & 0xff;
        overlay[pos + 2] = size & 0xff; overlay[pos + 3] = (size >> 8) & 0xff;
        for (let k = 0; k < size; k++) encInput[bodyStart + k] = wb[bodyStart + k];
      }
      pos += recTotal;
    }

    // RC4-decrypt encInput in 1024-byte blocks, rekeying each block.
    const dec = new Uint8Array(wb.length);
    let block = 0;
    for (let off = 0; off < encInput.length; off += BLOCK_SIZE) {
      const key = await makeKey(password, info.salt, info.keyBits, block);
      const chunk = encInput.slice(off, off + BLOCK_SIZE);
      dec.set(rc4(key, chunk), off);
      block++;
    }

    // Apply plaintext overlay.
    for (let i = 0; i < overlay.length; i++) {
      if (overlay[i] >= 0) dec[i] = overlay[i];
    }
    return dec;
  }

  async function xlsDecrypt(arrayBuffer, password) {
    const cfb = window.cfbTools.readCFB(arrayBuffer);
    const wb = cfb.getStream('Workbook') || cfb.getStream('Book');
    if (!wb) throw new Error('.xls: stream Workbook não encontrado.');

    const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
    if (dv.getUint16(0, true) !== BOF) throw new Error('.xls: cabeçalho BIFF inválido.');
    const bofSize = dv.getUint16(2, true);
    const fpPos = 4 + bofSize;
    if (dv.getUint16(fpPos, true) !== FILEPASS) {
      return new Uint8Array(arrayBuffer); // not encrypted
    }
    const fpSize = dv.getUint16(fpPos + 2, true);
    const fpBody = wb.slice(fpPos + 4, fpPos + 4 + fpSize);
    const info = parseFilepass(fpBody);

    if (!(await verifyPassword(password, info))) {
      const err = new Error('Senha incorreta');
      err.wrongPassword = true;
      throw err;
    }

    const decWb = await decryptWorkbook(wb, password, info);
    const streamName = cfb.getStream('Workbook') ? 'Workbook' : 'Book';
    return cfb.writeStream(streamName, decWb);
  }

  window.xlsDecrypt = xlsDecrypt;
})();
