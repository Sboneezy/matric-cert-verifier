"use strict";

/**
 * Minimal DOCX buffer builder using Node.js built-in zlib.
 *
 * Produces a valid ZIP file (which is what a DOCX is) with DEFLATE-compressed
 * entries. This avoids requiring pizzip or any other zip library.
 *
 * ZIP format reference: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
 */

const zlib = require("zlib");

/**
 * Create a DOCX-compatible ZIP buffer from a map of filename → content strings.
 *
 * @param {Object} files  { "path/in/zip": "string content", ... }
 * @returns {Buffer}
 */
function createDocxBuffer(files) {
    const entries = [];
    let offset = 0;

    for (const [name, content] of Object.entries(files)) {
        const nameBuffer    = Buffer.from(name, "utf8");
        const contentBuffer = Buffer.from(content, "utf8");
        const compressed    = zlib.deflateRawSync(contentBuffer, { level: 6 });
        const crc           = crc32(contentBuffer);
        const now           = dosDateTime();

        // Local file header
        const localHeader = buildLocalHeader(nameBuffer, compressed, contentBuffer.length, crc, now);
        const totalSize   = localHeader.length + compressed.length;

        entries.push({
            nameBuffer,
            compressed,
            uncompressedSize: contentBuffer.length,
            compressedSize:   compressed.length,
            crc,
            now,
            localHeaderOffset: offset,
            localHeader,
        });

        offset += totalSize;
    }

    // Central directory
    const centralDir = entries.map((e) => buildCentralHeader(e));
    const centralDirBuf = Buffer.concat(centralDir);
    const centralDirOffset = offset;
    const centralDirSize   = centralDirBuf.length;

    // End of central directory
    const eocd = buildEocd(entries.length, centralDirOffset, centralDirSize);

    return Buffer.concat([
        ...entries.map((e) => Buffer.concat([e.localHeader, e.compressed])),
        centralDirBuf,
        eocd,
    ]);
}

// ── ZIP building helpers ─────────────────────────────────────────────

function buildLocalHeader(name, compressed, uncompressedSize, crc, dosTime) {
    const buf = Buffer.alloc(30 + name.length);
    buf.writeUInt32LE(0x04034b50, 0);   // local file header signature
    buf.writeUInt16LE(20, 4);            // version needed
    buf.writeUInt16LE(0, 6);             // general purpose bit flag
    buf.writeUInt16LE(8, 8);             // compression method: deflate
    buf.writeUInt32LE(dosTime, 10);      // mod date+time
    buf.writeUInt32LE(crc >>> 0, 14);    // crc-32
    buf.writeUInt32LE(compressed.length, 18);     // compressed size
    buf.writeUInt32LE(uncompressedSize, 22);       // uncompressed size
    buf.writeUInt16LE(name.length, 26);  // file name length
    buf.writeUInt16LE(0, 28);            // extra field length
    name.copy(buf, 30);
    return buf;
}

function buildCentralHeader(entry) {
    const { nameBuffer, compressed, uncompressedSize, compressedSize, crc, now, localHeaderOffset } = entry;
    const buf = Buffer.alloc(46 + nameBuffer.length);
    buf.writeUInt32LE(0x02014b50, 0);   // central dir signature
    buf.writeUInt16LE(20, 4);            // version made by
    buf.writeUInt16LE(20, 6);            // version needed
    buf.writeUInt16LE(0, 8);             // general purpose bit flag
    buf.writeUInt16LE(8, 10);            // compression method
    buf.writeUInt32LE(now, 12);          // mod date+time
    buf.writeUInt32LE(crc >>> 0, 16);    // crc-32
    buf.writeUInt32LE(compressedSize, 20);
    buf.writeUInt32LE(uncompressedSize, 24);
    buf.writeUInt16LE(nameBuffer.length, 28);
    buf.writeUInt16LE(0, 30);            // extra field length
    buf.writeUInt16LE(0, 32);            // file comment length
    buf.writeUInt16LE(0, 34);            // disk number start
    buf.writeUInt16LE(0, 36);            // internal attributes
    buf.writeUInt32LE(0, 38);            // external attributes
    buf.writeUInt32LE(localHeaderOffset, 42);
    nameBuffer.copy(buf, 46);
    return buf;
}

function buildEocd(entryCount, centralDirOffset, centralDirSize) {
    const buf = Buffer.alloc(22);
    buf.writeUInt32LE(0x06054b50, 0);   // end of central dir signature
    buf.writeUInt16LE(0, 4);             // disk number
    buf.writeUInt16LE(0, 6);             // start disk number
    buf.writeUInt16LE(entryCount, 8);    // entries on disk
    buf.writeUInt16LE(entryCount, 10);   // total entries
    buf.writeUInt32LE(centralDirSize, 12);
    buf.writeUInt32LE(centralDirOffset, 16);
    buf.writeUInt16LE(0, 20);            // comment length
    return buf;
}

/** CRC-32 implementation */
function crc32(buf) {
    const table = makeCrcTable();
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

let _crcTable = null;
function makeCrcTable() {
    if (_crcTable) return _crcTable;
    _crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        _crcTable[i] = c;
    }
    return _crcTable;
}

/** Pack current time into MS-DOS date/time format */
function dosDateTime() {
    const d = new Date();
    const time = ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | ((d.getSeconds() >> 1) & 0x1F);
    const date = (((d.getFullYear() - 1980) & 0x7F) << 9) | (((d.getMonth() + 1) & 0x0F) << 5) | (d.getDate() & 0x1F);
    return ((date << 16) | time) >>> 0;
}

module.exports = { createDocxBuffer };
