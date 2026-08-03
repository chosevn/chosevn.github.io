/* ============================================================================
   Chosevn Studio — canvas transforms, colour adjustments and filters.
   ==========================================================================*/
(function () {
'use strict';

const ST = window.__ST;
const S = ST.S, B = ST.B, clamp = ST.clamp;

/* ---------------------------------------------------------- transforms -- */

function settle() {
    const d = S.doc;
    ST.resizeScratch(d.w, d.h);
    ST.$('st-doc-dims').textContent = d.w + ' × ' + d.h;
    ST.selNone();
    S.cropRect = null;
    ST.applyZoom();
}

/* One snapshot per transform; redo replays the operation from it. */
ST.transformDoc = function (label, fn) {
    const d = S.doc;
    if (!d) return;
    const before = { w: d.w, h: d.h, cels: d.layers.map(l => l.cels.map(ST.copyCanvas)) };
    const restore = () => {
        d.w = before.w; d.h = before.h;
        d.layers.forEach((l, i) => { if (before.cels[i]) l.cels = before.cels[i].map(ST.copyCanvas); });
        settle();
    };
    fn(d);
    settle();
    ST.pushHistory(label, restore, () => { restore(); fn(d); settle(); });
    ST.afterChange();
    ST.note(label + '.', 'ri-crop-2-line');
};

function mapCels(d, nw, nh, painter) {
    d.layers.forEach(l => {
        l.cels = l.cels.map(cel => {
            const out = ST.mkCanvas(nw, nh);
            const c = out.getContext('2d');
            c.imageSmoothingEnabled = false;
            painter(c, cel, nw, nh);
            return out;
        });
    });
    d.w = nw; d.h = nh;
}
ST.mapCels = mapCels;

ST.flip = function (horizontal) {
    ST.transformDoc(horizontal ? 'Flip across' : 'Flip down', d => mapCels(d, d.w, d.h, (c, cel, w, h) => {
        c.translate(horizontal ? w : 0, horizontal ? 0 : h);
        c.scale(horizontal ? -1 : 1, horizontal ? 1 : -1);
        c.drawImage(cel, 0, 0);
    }));
};

ST.rotate = function (deg) {
    ST.transformDoc('Rotate ' + deg + '°', d => {
        const swap = deg === 90 || deg === 270;
        const nw = swap ? d.h : d.w, nh = swap ? d.w : d.h;
        mapCels(d, nw, nh, (c, cel) => {
            c.translate(nw / 2, nh / 2);
            c.rotate(deg * Math.PI / 180);
            c.drawImage(cel, -cel.width / 2, -cel.height / 2);
        });
    });
};

ST.resizeCanvas = function (nw, nh, anchor) {
    ST.transformDoc('Resize canvas to ' + nw + '×' + nh, d => {
        const ox = anchor % 3 === 0 ? 0 : (anchor % 3 === 1 ? Math.round((nw - d.w) / 2) : nw - d.w);
        const oy = anchor < 3 ? 0 : (anchor < 6 ? Math.round((nh - d.h) / 2) : nh - d.h);
        mapCels(d, nw, nh, (c, cel) => c.drawImage(cel, ox, oy));
    });
};

ST.scaleImage = function (nw, nh, smooth) {
    ST.transformDoc('Scale to ' + nw + '×' + nh, d => mapCels(d, nw, nh, (c, cel, w, h) => {
        c.imageSmoothingEnabled = !!smooth;
        if (smooth) c.imageSmoothingQuality = 'high';
        c.drawImage(cel, 0, 0, w, h);
    }));
};

ST.cropTo = function (r) {
    if (!r || r.w < 1 || r.h < 1) { ST.note('Drag a crop box first.', 'ri-crop-line'); return; }
    const s = { x: r.x, y: r.y, w: r.w, h: r.h };
    ST.transformDoc('Crop to ' + s.w + '×' + s.h, d => mapCels(d, s.w, s.h, (c, cel) => c.drawImage(cel, -s.x, -s.y)));
};

ST.cropToSelection = function () {
    if (!S.sel) { ST.note('Make a selection first.', 'ri-crop-line'); return; }
    ST.cropTo(S.sel.b);
};

ST.trimTransparent = function () {
    const d = S.doc;
    if (!d) return;
    const flat = ST.flattenToCanvas(d, d.fi);
    const img = ST.ctx2d(flat).getImageData(0, 0, d.w, d.h).data;
    let minX = d.w, minY = d.h, maxX = -1, maxY = -1;
    for (let y = 0; y < d.h; y++) {
        for (let x = 0; x < d.w; x++) {
            if (img[(y * d.w + x) * 4 + 3] > 0) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) { ST.note('This frame is empty — nothing to trim.', 'ri-crop-line'); return; }
    const w = maxX - minX + 1, h = maxY - minY + 1;
    if (w === d.w && h === d.h) { ST.note('Already tight to the artwork.', 'ri-crop-line'); return; }
    ST.transformDoc('Trim to ' + w + '×' + h, dd => mapCels(dd, w, h, (c, cel) => c.drawImage(cel, -minX, -minY)));
};

/* --------------------------------------------------------- pixel helpers -- */

/* Every adjustment runs on the active layer, inside the selection if there is
   one, and always through a snapshot so it is undoable. */
ST.editCel = function (label, fn) {
    const layer = ST.layerEditable();
    if (!layer) return;
    const cel = ST.activeCel();
    ST.snapshotCel(label);
    fn(cel, ST.ctx2d(cel));
    ST.composite();
    ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); ST.markDirty();
    ST.note(label + '.', 'ri-magic-line');
};

function area() {
    return S.sel ? S.sel.b : { x: 0, y: 0, w: S.doc.w, h: S.doc.h };
}
ST.adjustArea = area;

/* Blend an edited region back through the selection mask so feathered edges
   fade properly instead of showing a hard rectangle. */
function putThroughSelection(cel, img, a) {
    const c = ST.ctx2d(cel);
    if (!S.sel) { c.putImageData(img, a.x, a.y); return; }
    const tmp = ST.mkCanvas(a.w, a.h);
    ST.ctx2d(tmp).putImageData(img, 0, 0);
    const m = ST.clearCanvas(B.mask);
    m.drawImage(tmp, a.x, a.y);
    m.globalCompositeOperation = 'destination-in';
    m.drawImage(S.sel.mask, 0, 0);
    m.globalCompositeOperation = 'source-over';
    c.save();
    c.globalCompositeOperation = 'destination-out';
    const cut = ST.clearCanvas(B.sil);
    cut.drawImage(S.sel.mask, 0, 0);
    cut.globalCompositeOperation = 'destination-in';
    cut.fillStyle = '#fff';
    cut.fillRect(a.x, a.y, a.w, a.h);
    c.drawImage(B.sil, 0, 0);
    c.restore();
    c.drawImage(B.mask, 0, 0);
}
ST.putThroughSelection = putThroughSelection;

ST.readArea = function (cel) {
    const a = area();
    return { a: a, img: ST.ctx2d(cel).getImageData(a.x, a.y, a.w, a.h) };
};

/* --------------------------------------------------------- adjustments -- */

ST.adjustPixels = function (cel, o) {
    const r = ST.readArea(cel);
    const p = r.img.data;
    const bri = o.brightness / 100;
    const con = o.contrast / 100;
    const sat = o.saturation / 100;
    const hue = o.hue * Math.PI / 180;
    const cosA = Math.cos(hue), sinA = Math.sin(hue);
    const m = [
        0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928,
        0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.140, 0.072 - cosA * 0.072 - sinA * 0.283,
        0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072,
    ];
    const levels = o.posterize > 1 ? o.posterize : 0;
    for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        let R = p[i], G = p[i + 1], Bv = p[i + 2];
        if (bri !== 1) { R *= bri; G *= bri; Bv *= bri; }
        if (con !== 1) { R = (R - 128) * con + 128; G = (G - 128) * con + 128; Bv = (Bv - 128) * con + 128; }
        if (sat !== 1) {
            const lum = 0.213 * R + 0.715 * G + 0.072 * Bv;
            R = lum + (R - lum) * sat; G = lum + (G - lum) * sat; Bv = lum + (Bv - lum) * sat;
        }
        if (hue !== 0) {
            const nr = R * m[0] + G * m[1] + Bv * m[2];
            const ng = R * m[3] + G * m[4] + Bv * m[5];
            const nb = R * m[6] + G * m[7] + Bv * m[8];
            R = nr; G = ng; Bv = nb;
        }
        if (o.grayscale) { const l = 0.299 * R + 0.587 * G + 0.114 * Bv; R = G = Bv = l; }
        if (o.sepia) {
            const sr = R * 0.393 + G * 0.769 + Bv * 0.189;
            const sg = R * 0.349 + G * 0.686 + Bv * 0.168;
            const sb = R * 0.272 + G * 0.534 + Bv * 0.131;
            R = sr; G = sg; Bv = sb;
        }
        if (o.invert) { R = 255 - R; G = 255 - G; Bv = 255 - Bv; }
        if (levels) {
            const step = 255 / (levels - 1);
            R = Math.round(R / step) * step; G = Math.round(G / step) * step; Bv = Math.round(Bv / step) * step;
        }
        if (o.threshold > 0) {
            const l = 0.299 * R + 0.587 * G + 0.114 * Bv;
            R = G = Bv = l >= o.threshold ? 255 : 0;
        }
        p[i] = clamp(R, 0, 255); p[i + 1] = clamp(G, 0, 255); p[i + 2] = clamp(Bv, 0, 255);
    }
    putThroughSelection(cel, r.img, r.a);
};

/* Levels: input black/white with gamma, remapped onto an output range. */
ST.applyLevels = function (cel, o) {
    const r = ST.readArea(cel);
    const p = r.img.data;
    const inB = o.inBlack, inW = Math.max(o.inBlack + 1, o.inWhite);
    const outB = o.outBlack, outW = o.outWhite;
    const g = clamp(o.gamma, 0.05, 10);
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
        let v = (i - inB) / (inW - inB);
        v = clamp(v, 0, 1);
        v = Math.pow(v, 1 / g);
        lut[i] = clamp(outB + v * (outW - outB), 0, 255);
    }
    for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        p[i] = lut[p[i]]; p[i + 1] = lut[p[i + 1]]; p[i + 2] = lut[p[i + 2]];
    }
    putThroughSelection(cel, r.img, r.a);
};

/* Curves: `luts` is {rgb,r,g,b} of 256-entry Uint8ClampedArrays. */
ST.applyCurves = function (cel, luts) {
    const r = ST.readArea(cel);
    const p = r.img.data;
    for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        p[i] = luts.r[luts.rgb[p[i]]];
        p[i + 1] = luts.g[luts.rgb[p[i + 1]]];
        p[i + 2] = luts.b[luts.rgb[p[i + 2]]];
    }
    putThroughSelection(cel, r.img, r.a);
};

ST.buildLut = function (points) {
    const lut = new Uint8ClampedArray(256);
    const pts = points.slice().sort((a, b) => a.x - b.x);
    for (let i = 0; i < 256; i++) {
        const x = i / 255;
        let a = pts[0], b = pts[pts.length - 1];
        for (let k = 0; k < pts.length - 1; k++) {
            if (x >= pts[k].x && x <= pts[k + 1].x) { a = pts[k]; b = pts[k + 1]; break; }
        }
        const span = b.x - a.x;
        const t = span <= 0 ? 0 : (x - a.x) / span;
        const smooth = t * t * (3 - 2 * t);
        lut[i] = clamp((a.y + (b.y - a.y) * smooth) * 255, 0, 255);
    }
    return lut;
};

ST.histogram = function (cel) {
    const r = ST.readArea(cel);
    const p = r.img.data;
    const h = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        h[Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2])]++;
    }
    return h;
};

/* Gradient map: luminance drives a two- or three-stop ramp. */
ST.gradientMap = function (cel, stops) {
    const r = ST.readArea(cel);
    const p = r.img.data;
    const ramp = [];
    for (let i = 0; i < 256; i++) {
        const t = i / 255;
        let a = stops[0], b = stops[stops.length - 1];
        for (let k = 0; k < stops.length - 1; k++) {
            if (t >= stops[k].t && t <= stops[k + 1].t) { a = stops[k]; b = stops[k + 1]; break; }
        }
        const span = b.t - a.t;
        const f = span <= 0 ? 0 : (t - a.t) / span;
        const ca = ST.hexToRgb(a.c), cb = ST.hexToRgb(b.c);
        ramp.push([ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f]);
    }
    for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        const l = Math.round(0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2]);
        const c = ramp[l];
        p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2];
    }
    putThroughSelection(cel, r.img, r.a);
};

/* --------------------------------------------------------------- filters -- */

ST.blurCel = function (cel, radius) {
    if (radius <= 0) return;
    const tmp = ST.copyCanvas(cel);
    const c = ST.ctx2d(cel);
    const a = area();
    c.save();
    c.beginPath(); c.rect(a.x, a.y, a.w, a.h); c.clip();
    c.clearRect(a.x, a.y, a.w, a.h);
    if ('filter' in c) c.filter = 'blur(' + radius + 'px)';
    c.drawImage(tmp, 0, 0);
    if ('filter' in c) c.filter = 'none';
    c.restore();
};

ST.sharpenCel = function (cel, amount) {
    if (amount <= 0) return;
    const r = ST.readArea(cel);
    const p = r.img.data;
    const src = new Uint8ClampedArray(p);
    const W = r.a.w, H = r.a.h;
    for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
            const i = (y * W + x) * 4;
            for (let ch = 0; ch < 3; ch++) {
                const c0 = src[i + ch];
                const around = src[i - 4 + ch] + src[i + 4 + ch] + src[i - W * 4 + ch] + src[i + W * 4 + ch];
                p[i + ch] = clamp(c0 + amount * (c0 * 4 - around) / 4, 0, 255);
            }
        }
    }
    putThroughSelection(cel, r.img, r.a);
};

ST.pixelateCel = function (cel, block) {
    if (block < 2) return;
    const a = area();
    const c = ST.ctx2d(cel);
    const sw = Math.max(1, Math.round(a.w / block));
    const sh = Math.max(1, Math.round(a.h / block));
    const small = ST.mkCanvas(sw, sh);
    const sc = small.getContext('2d');
    sc.imageSmoothingEnabled = true;
    sc.drawImage(cel, a.x, a.y, a.w, a.h, 0, 0, sw, sh);
    c.save();
    c.clearRect(a.x, a.y, a.w, a.h);
    c.imageSmoothingEnabled = false;
    c.drawImage(small, 0, 0, sw, sh, a.x, a.y, a.w, a.h);
    c.restore();
};

ST.noiseCel = function (cel, amount, mono) {
    const r = ST.readArea(cel);
    const p = r.img.data;
    const k = amount * 2.55;
    for (let i = 0; i < p.length; i += 4) {
        if (p[i + 3] === 0) continue;
        if (mono) {
            const n = (Math.random() - 0.5) * k;
            p[i] = clamp(p[i] + n, 0, 255);
            p[i + 1] = clamp(p[i + 1] + n, 0, 255);
            p[i + 2] = clamp(p[i + 2] + n, 0, 255);
        } else {
            p[i] = clamp(p[i] + (Math.random() - 0.5) * k, 0, 255);
            p[i + 1] = clamp(p[i + 1] + (Math.random() - 0.5) * k, 0, 255);
            p[i + 2] = clamp(p[i + 2] + (Math.random() - 0.5) * k, 0, 255);
        }
    }
    putThroughSelection(cel, r.img, r.a);
};

/* Outline: dilate the silhouette and keep only the ring outside the artwork. */
ST.outlineCel = function (cel, colour, width, inside) {
    const d = S.doc;
    const sil = ST.clearCanvas(B.sil);
    sil.drawImage(cel, 0, 0);
    sil.globalCompositeOperation = 'source-in';
    sil.fillStyle = colour;
    sil.fillRect(0, 0, d.w, d.h);
    sil.globalCompositeOperation = 'source-over';

    const ring = ST.clearCanvas(B.group);
    const r = clamp(width, 1, 40);
    const rings = r > 3 ? [r, r * 0.55] : [r];
    rings.forEach(rr => {
        for (let a = 0; a < 16; a++) {
            const t = a * Math.PI / 8;
            ring.drawImage(B.sil, Math.round(Math.cos(t) * rr), Math.round(Math.sin(t) * rr));
        }
    });
    const c = ST.ctx2d(cel);
    if (inside) {
        // keep only the part of the ring that lands on existing pixels
        ring.globalCompositeOperation = 'destination-in';
        ring.drawImage(cel, 0, 0);
        ring.globalCompositeOperation = 'source-over';
        c.drawImage(B.group, 0, 0);
    } else {
        ring.globalCompositeOperation = 'destination-out';
        ring.drawImage(cel, 0, 0);
        ring.globalCompositeOperation = 'source-over';
        const merged = ST.clearCanvas(B.fx);
        merged.drawImage(B.group, 0, 0);
        merged.drawImage(cel, 0, 0);
        ST.clearCanvas(cel);
        c.drawImage(B.fx, 0, 0);
    }
};

/* ------------------------------------------------- colour quantisation -- */
/* Median cut, shared by the palette extractor, the posterise-to-palette
   filter and the GIF encoder. */

ST.medianCut = function (pixels, maxColours) {
    const buckets = new Map();
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 8) continue;
        const key = ((pixels[i] >> 2) << 12) | ((pixels[i + 1] >> 2) << 6) | (pixels[i + 2] >> 2);
        const b = buckets.get(key);
        if (b) { b[0] += pixels[i]; b[1] += pixels[i + 1]; b[2] += pixels[i + 2]; b[3]++; }
        else buckets.set(key, [pixels[i], pixels[i + 1], pixels[i + 2], 1]);
    }
    let list = [];
    buckets.forEach(b => list.push({ r: b[0] / b[3], g: b[1] / b[3], b: b[2] / b[3], n: b[3] }));
    if (!list.length) return [[0, 0, 0]];
    if (list.length <= maxColours) return list.map(c => [Math.round(c.r), Math.round(c.g), Math.round(c.b)]);

    let boxes = [list];
    while (boxes.length < maxColours) {
        let bi = -1, bestRange = -1;
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i].length < 2) continue;
            const rng = boxRange(boxes[i]);
            if (rng.range > bestRange) { bestRange = rng.range; bi = i; }
        }
        if (bi < 0) break;
        const box = boxes[bi];
        const ch = boxRange(box).ch;
        box.sort((a, b) => a[ch] - b[ch]);
        const mid = Math.floor(box.length / 2);
        boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
    }
    return boxes.filter(b => b.length).map(box => {
        let r = 0, g = 0, b = 0, n = 0;
        box.forEach(c => { r += c.r * c.n; g += c.g * c.n; b += c.b * c.n; n += c.n; });
        return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
    });

    function boxRange(box) {
        let mn = [255, 255, 255], mx = [0, 0, 0];
        box.forEach(c => {
            mn[0] = Math.min(mn[0], c.r); mx[0] = Math.max(mx[0], c.r);
            mn[1] = Math.min(mn[1], c.g); mx[1] = Math.max(mx[1], c.g);
            mn[2] = Math.min(mn[2], c.b); mx[2] = Math.max(mx[2], c.b);
        });
        const dr = mx[0] - mn[0], dg = mx[1] - mn[1], db = mx[2] - mn[2];
        const m = Math.max(dr, dg, db);
        return { range: m, ch: m === dr ? 'r' : (m === dg ? 'g' : 'b') };
    }
};

ST.nearestIndex = function (palette, r, g, b, cache) {
    const key = (r << 16) | (g << 8) | b;
    if (cache) { const v = cache.get(key); if (v !== undefined) return v; }
    let best = 0, bestD = Infinity;
    for (let i = 0; i < palette.length; i++) {
        const p = palette[i];
        const dr = r - p[0], dg = g - p[1], db = b - p[2];
        const d = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
        if (d < bestD) { bestD = d; best = i; }
    }
    if (cache) cache.set(key, best);
    return best;
};

const BAYER8 = (function () {
    const m = [[0, 32, 8, 40, 2, 34, 10, 42], [48, 16, 56, 24, 50, 18, 58, 26],
               [12, 44, 4, 36, 14, 46, 6, 38], [60, 28, 52, 20, 62, 30, 54, 22],
               [3, 35, 11, 43, 1, 33, 9, 41], [51, 19, 59, 27, 49, 17, 57, 25],
               [15, 47, 7, 39, 13, 45, 5, 37], [63, 31, 55, 23, 61, 29, 53, 21]];
    return m;
})();
ST.BAYER8 = BAYER8;

/* Reduce an ImageData to a palette, optionally with ordered or diffused
   dithering. Mutates in place. */
ST.quantizeImage = function (img, palette, mode) {
    const p = img.data, W = img.width, H = img.height;
    const cache = new Map();
    if (mode === 'diffuse') {
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const i = (y * W + x) * 4;
                if (p[i + 3] < 8) continue;
                const or_ = p[i], og = p[i + 1], ob = p[i + 2];
                const idx = ST.nearestIndex(palette, clamp(or_ | 0, 0, 255), clamp(og | 0, 0, 255), clamp(ob | 0, 0, 255), cache);
                const c = palette[idx];
                p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2];
                const er = or_ - c[0], eg = og - c[1], eb = ob - c[2];
                const spread = (dx, dy, k) => {
                    const nx = x + dx, ny = y + dy;
                    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
                    const j = (ny * W + nx) * 4;
                    if (p[j + 3] < 8) return;
                    p[j] = clamp(p[j] + er * k, 0, 255);
                    p[j + 1] = clamp(p[j + 1] + eg * k, 0, 255);
                    p[j + 2] = clamp(p[j + 2] + eb * k, 0, 255);
                };
                spread(1, 0, 7 / 16); spread(-1, 1, 3 / 16); spread(0, 1, 5 / 16); spread(1, 1, 1 / 16);
            }
        }
        return;
    }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4;
            if (p[i + 3] < 8) continue;
            let r = p[i], g = p[i + 1], b = p[i + 2];
            if (mode === 'ordered') {
                const t = (BAYER8[y & 7][x & 7] / 64 - 0.5) * 32;
                r = clamp(r + t, 0, 255); g = clamp(g + t, 0, 255); b = clamp(b + t, 0, 255);
            }
            const c = palette[ST.nearestIndex(palette, r | 0, g | 0, b | 0, cache)];
            p[i] = c[0]; p[i + 1] = c[1]; p[i + 2] = c[2];
        }
    }
};

ST.quantizeCel = function (cel, colours, mode, fixedPalette) {
    const r = ST.readArea(cel);
    const pal = fixedPalette && fixedPalette.length
        ? fixedPalette.map(ST.hexToRgb)
        : ST.medianCut(r.img.data, clamp(colours, 2, 256));
    ST.quantizeImage(r.img, pal, mode);
    putThroughSelection(cel, r.img, r.a);
};

/* ------------------------------------------------------------ flatten -- */

ST.flattenToCanvas = function (doc, frame, scale) {
    const k = scale || 1;
    const out = ST.mkCanvas(doc.w * k, doc.h * k);
    const c = out.getContext('2d');
    c.imageSmoothingEnabled = k < 1;
    const layers = doc.layers;
    let i = 0;
    while (i < layers.length) {
        const base = layers[i];
        let j = i + 1;
        while (j < layers.length && layers[j].clip) j++;
        if (!base.visible || base.opacity <= 0) { i = j; continue; }
        const followers = layers.slice(i + 1, j).filter(l => l.visible && l.opacity > 0);
        if (!followers.length) {
            c.save();
            c.globalAlpha = base.opacity;
            c.globalCompositeOperation = base.blend;
            c.drawImage(base.cels[frame], 0, 0, out.width, out.height);
            c.restore();
        } else {
            const g = ST.mkCanvas(doc.w, doc.h);
            const gc = ST.ctx2d(g);
            followers.forEach(f => {
                gc.globalAlpha = f.opacity;
                gc.globalCompositeOperation = f.blend;
                gc.drawImage(f.cels[frame], 0, 0);
            });
            gc.globalAlpha = 1;
            gc.globalCompositeOperation = 'destination-in';
            gc.drawImage(base.cels[frame], 0, 0);
            gc.globalCompositeOperation = 'source-over';
            const merged = ST.mkCanvas(doc.w, doc.h);
            const mc = ST.ctx2d(merged);
            mc.drawImage(base.cels[frame], 0, 0);
            mc.drawImage(g, 0, 0);
            c.save();
            c.globalAlpha = base.opacity;
            c.globalCompositeOperation = base.blend;
            c.drawImage(merged, 0, 0, out.width, out.height);
            c.restore();
        }
        i = j;
    }
    return out;
};

})();
