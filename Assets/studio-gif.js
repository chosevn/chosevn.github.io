/* ============================================================================
   Chosevn Studio — animated GIF writer.
   A self-contained GIF89a encoder: median-cut palette, optional dithering,
   LZW compression, per-frame delays and one transparent index. No libraries,
   nothing fetched from a CDN.
   ==========================================================================*/
(function () {
'use strict';

const ST = window.__ST;

function ByteStream() {
    this.buf = new Uint8Array(1024);
    this.len = 0;
}
ByteStream.prototype.need = function (n) {
    if (this.len + n <= this.buf.length) return;
    let cap = this.buf.length * 2;
    while (cap < this.len + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.len));
    this.buf = next;
};
ByteStream.prototype.byte = function (b) { this.need(1); this.buf[this.len++] = b & 255; };
ByteStream.prototype.bytes = function (arr) {
    this.need(arr.length);
    this.buf.set(arr, this.len);
    this.len += arr.length;
};
ByteStream.prototype.short = function (v) { this.byte(v & 255); this.byte((v >> 8) & 255); };
ByteStream.prototype.ascii = function (s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); };
ByteStream.prototype.done = function () { return this.buf.subarray(0, this.len); };

/* GIF LZW: variable-width codes, dictionary reset at 4096 entries. */
function lzwEncode(indices, minCodeSize, out) {
    const clearCode = 1 << minCodeSize;
    const eoiCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let next = eoiCode + 1;
    let dict = new Map();

    // block-buffered bit packing
    const block = new Uint8Array(255);
    let blockLen = 0;
    let bitBuf = 0, bitCount = 0;

    function flushBlock() {
        if (!blockLen) return;
        out.byte(blockLen);
        out.bytes(block.subarray(0, blockLen));
        blockLen = 0;
    }
    function emit(code) {
        bitBuf |= code << bitCount;
        bitCount += codeSize;
        while (bitCount >= 8) {
            block[blockLen++] = bitBuf & 255;
            bitBuf >>= 8;
            bitCount -= 8;
            if (blockLen === 255) flushBlock();
        }
    }
    function resetDict() {
        dict = new Map();
        codeSize = minCodeSize + 1;
        next = eoiCode + 1;
    }

    emit(clearCode);
    resetDict();

    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
        const k = indices[i];
        const key = prefix * 4096 + k;
        const found = dict.get(key);
        if (found !== undefined) {
            prefix = found;
            continue;
        }
        emit(prefix);
        if (next < 4096) {
            dict.set(key, next);
            if (next === (1 << codeSize) && codeSize < 12) codeSize++;
            next++;
        } else {
            emit(clearCode);
            resetDict();
        }
        prefix = k;
    }
    emit(prefix);
    emit(eoiCode);
    // flush remaining bits
    if (bitCount > 0) {
        block[blockLen++] = bitBuf & 255;
        if (blockLen === 255) flushBlock();
    }
    flushBlock();
    out.byte(0);
}

/* frames: [{ img: ImageData, delay: ms }] */
ST.encodeGIF = function (frames, opts) {
    opts = opts || {};
    const W = frames[0].img.width, H = frames[0].img.height;
    const dither = opts.dither || 'none';
    const transparent = opts.transparent !== false;
    const maxColours = transparent ? 255 : 256;

    // one shared palette so the animation does not shimmer between frames
    let sample;
    if (frames.length === 1) {
        sample = frames[0].img.data;
    } else {
        const total = frames.reduce((n, f) => n + f.img.data.length, 0);
        sample = new Uint8ClampedArray(total);
        let off = 0;
        frames.forEach(f => { sample.set(f.img.data, off); off += f.img.data.length; });
    }
    let palette = opts.palette && opts.palette.length
        ? opts.palette.map(ST.hexToRgb).slice(0, maxColours)
        : ST.medianCut(sample, maxColours);
    if (!palette.length) palette = [[0, 0, 0]];

    const transIndex = transparent ? palette.length : -1;
    const tableColours = transparent ? palette.concat([[0, 0, 0]]) : palette.slice();
    let bits = 1;
    while ((1 << bits) < tableColours.length) bits++;
    bits = Math.max(1, Math.min(8, bits));
    const tableSize = 1 << bits;

    const out = new ByteStream();
    out.ascii('GIF89a');
    out.short(W); out.short(H);
    out.byte(0xF0 | (bits - 1));   // global table, 8-bit colour resolution
    out.byte(transparent ? transIndex : 0);
    out.byte(0);
    for (let i = 0; i < tableSize; i++) {
        const c = tableColours[i] || [0, 0, 0];
        out.byte(c[0]); out.byte(c[1]); out.byte(c[2]);
    }

    // NETSCAPE2.0 loop block
    out.byte(0x21); out.byte(0xFF); out.byte(11);
    out.ascii('NETSCAPE2.0');
    out.byte(3); out.byte(1);
    out.short(opts.loops == null ? 0 : opts.loops);
    out.byte(0);

    const cache = new Map();
    frames.forEach(frame => {
        const img = frame.img;
        const data = img.data;
        if (dither !== 'none') {
            // dither a copy so alpha stays intact for the transparency test
            const copy = new Uint8ClampedArray(data);
            const tmp = { data: copy, width: W, height: H };
            ST.quantizeImage(tmp, palette, dither);
            data.set(copy);
        }
        const px = new Uint8Array(W * H);
        for (let i = 0, k = 0; i < data.length; i += 4, k++) {
            if (transparent && data[i + 3] < 128) { px[k] = transIndex; continue; }
            px[k] = ST.nearestIndex(palette, data[i], data[i + 1], data[i + 2], cache);
        }

        const delay = Math.max(2, Math.round((frame.delay || 100) / 10));  // GIF ticks
        out.byte(0x21); out.byte(0xF9); out.byte(4);
        out.byte((2 << 2) | (transparent ? 1 : 0));   // restore-to-background
        out.short(delay);
        out.byte(transparent ? transIndex : 0);
        out.byte(0);

        out.byte(0x2C);
        out.short(0); out.short(0);
        out.short(W); out.short(H);
        out.byte(0);

        const minCode = Math.max(2, bits);
        out.byte(minCode);
        lzwEncode(px, minCode, out);
    });

    out.byte(0x3B);
    return out.done();
};

})();
