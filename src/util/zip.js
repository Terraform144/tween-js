// Writer ZIP minimal, "stored" (sans compression) — zéro dépendance.
// Les PNG sont déjà compressés, la méthode stored suffit ; CRC32 + en-têtes
// conformes à la spec (APPNOTE.TXT) pour un zip lisible partout.
//
// makeZip([{ name: 'a.png', data: Uint8Array }, ...]) -> Blob application/zip

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(files) {
  const encoder = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
  const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  const parts = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;

    // En-tête local (PK\x03\x04, méthode 0 = stored)
    const local = new Uint8Array(30 + name.length);
    const ldv = new DataView(local.buffer);
    ldv.setUint32(0, 0x04034b50, true);
    ldv.setUint16(4, 20, true);        // version minimale
    ldv.setUint16(6, 0, true);         // flags
    ldv.setUint16(8, 0, true);         // méthode : stored
    ldv.setUint16(10, dosTime, true);
    ldv.setUint16(12, dosDate, true);
    ldv.setUint32(14, crc, true);
    ldv.setUint32(18, size, true);     // compressé
    ldv.setUint32(22, size, true);     // non compressé
    ldv.setUint16(26, name.length, true);
    ldv.setUint16(28, 0, true);        // extra
    local.set(name, 30);

    parts.push(local, file.data);
    central.push({ name, crc, size, offset });
    offset += local.length + size;
  }

  // Répertoire central (PK\x01\x02)
  const centralStart = offset;
  let centralSize = 0;
  for (const entry of central) {
    const cd = new Uint8Array(46 + entry.name.length);
    const dv = new DataView(cd.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);         // version créateur
    dv.setUint16(6, 20, true);         // version minimale
    dv.setUint16(8, 0, true);          // flags
    dv.setUint16(10, 0, true);         // méthode
    dv.setUint16(12, dosTime, true);
    dv.setUint16(14, dosDate, true);
    dv.setUint32(16, entry.crc, true);
    dv.setUint32(20, entry.size, true);
    dv.setUint32(24, entry.size, true);
    dv.setUint16(28, entry.name.length, true);
    dv.setUint16(30, 0, true);         // extra
    dv.setUint16(32, 0, true);         // commentaire
    dv.setUint16(34, 0, true);         // disque de départ
    dv.setUint16(36, 0, true);         // attributs internes
    dv.setUint32(38, 0, true);         // attributs externes
    dv.setUint32(42, entry.offset, true);
    cd.set(entry.name, 46);
    parts.push(cd);
    centralSize += cd.length;
  }

  // Fin du répertoire central (PK\x05\x06)
  const eocd = new Uint8Array(22);
  const edv = new DataView(eocd.buffer);
  edv.setUint32(0, 0x06054b50, true);
  edv.setUint16(4, 0, true);
  edv.setUint16(6, 0, true);
  edv.setUint16(8, files.length, true);
  edv.setUint16(10, files.length, true);
  edv.setUint32(12, centralSize, true);
  edv.setUint32(16, centralStart, true);
  edv.setUint16(20, 0, true);

  parts.push(eocd);
  return new Blob(parts, { type: 'application/zip' });
}
