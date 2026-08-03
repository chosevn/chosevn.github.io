/* ============================================================================
   Chosevn Studio — core
   Helpers, constants, document model, selection engine, rendering, history.
   Shared through window.__ST; studio-paint / studio-ui / studio-export build
   on top of it. Nothing here touches the network.
   ==========================================================================*/
(function () {
'use strict';

const ST = (window.__ST = window.__ST || {});

/* ------------------------------------------------------------- helpers -- */

const $ = ST.$ = id => document.getElementById(id);
const clamp = ST.clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));
ST.uid = () => 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

ST.mkCanvas = function (w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
};
ST.ctx2d = c => c.getContext('2d', { willReadFrequently: true });
ST.copyCanvas = function (src) {
    const c = ST.mkCanvas(src.width, src.height);
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = false;
    x.drawImage(src, 0, 0);
    return c;
};
ST.clearCanvas = function (c) {
    const x = c.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, c.width, c.height);
    return x;
};

ST.esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

ST.note = function (text, icon) {
    if (typeof window.toast === 'function') window.toast(text, icon || 'ri-palette-line');
};

ST.hexToRgb = function (h) {
    h = String(h || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return [0, 0, 0];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
ST.rgbToHex = (r, g, b) =>
    '#' + [r, g, b].map(n => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')).join('');

ST.rgbToHsv = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
        if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0));
        else if (mx === g) h = (b - r) / d + 2;
        else h = (r - g) / d + 4;
        h *= 60;
    }
    return [h, mx ? d / mx : 0, mx];
};
ST.hsvToRgb = function (h, s, v) {
    h = ((h % 360) + 360) % 360;
    const c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
};

/* ----------------------------------------------------------- constants -- */

ST.MAX_DIM = 8192;
ST.MAX_HISTORY = 40;

ST.BLEND_MODES = [
    ['source-over', 'Normal'], ['multiply', 'Multiply'], ['screen', 'Screen'],
    ['overlay', 'Overlay'], ['darken', 'Darken'], ['lighten', 'Lighten'],
    ['color-dodge', 'Colour dodge'], ['color-burn', 'Colour burn'],
    ['hard-light', 'Hard light'], ['soft-light', 'Soft light'],
    ['difference', 'Difference'], ['exclusion', 'Exclusion'],
    ['hue', 'Hue'], ['saturation', 'Saturation'], ['color', 'Colour'], ['luminosity', 'Luminosity'],
];

ST.PRESETS = [
    { name: 'Icon',      w: 32,   h: 32 },
    { name: 'Sprite',    w: 64,   h: 64 },
    { name: 'Tile',      w: 128,  h: 128 },
    { name: 'Portrait',  w: 256,  h: 384 },
    { name: 'Square',    w: 512,  h: 512 },
    { name: 'Banner',    w: 1200, h: 400 },
    { name: 'HD',        w: 1280, h: 720 },
    { name: 'Full HD',   w: 1920, h: 1080 },
    { name: 'Post',      w: 1080, h: 1080 },
    { name: 'Story',     w: 1080, h: 1920 },
    { name: 'Wallpaper', w: 2560, h: 1440 },
    { name: 'Print A4',  w: 2480, h: 3508 },
];

/* Palettes people actually use, not a random rainbow. */
ST.PALETTES = {
    default: { name: 'Studio', colours: [
        '#000000', '#1c1c22', '#3a3a44', '#5c5c68', '#8a8a96', '#b8b8c2', '#e4e4ea', '#ffffff',
        '#7a1f1f', '#c62b2b', '#ff3b3b', '#ff7a1a', '#f0c040', '#fff2a8', '#3d7a2a', '#38c172',
        '#8ee06a', '#0f5c6b', '#19c8e0', '#8fe8f5', '#2b3a8f', '#3f86ff', '#7b86ff', '#b86bff',
        '#6b2a7a', '#ff5fae', '#ffb3d4', '#5a3a1f', '#8a5a2b', '#c99a5b', '#e8d3a8', '#2a1a10',
    ] },
    gameboy: { name: 'Game Boy', colours: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'] },
    nes: { name: 'NES', colours: [
        '#000000', '#fcfcfc', '#f8f8f8', '#bcbcbc', '#7c7c7c', '#a4e4fc', '#3cbcfc', '#0078f8',
        '#0000fc', '#b8b8f8', '#6888fc', '#0058f8', '#0000bc', '#d8b8f8', '#9878f8', '#6844fc',
        '#4428bc', '#f8b8f8', '#f878f8', '#d800cc', '#940084', '#f8a4c0', '#f85898', '#e40058',
        '#a80020', '#f0d0b0', '#f87858', '#f83800', '#a81000', '#fce0a8', '#fca044', '#e45c10',
    ] },
    pico8: { name: 'PICO-8', colours: [
        '#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8',
        '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa',
    ] },
    cga: { name: 'CGA', colours: [
        '#000000', '#0000aa', '#00aa00', '#00aaaa', '#aa0000', '#aa00aa', '#aa5500', '#aaaaaa',
        '#555555', '#5555ff', '#55ff55', '#55ffff', '#ff5555', '#ff55ff', '#ffff55', '#ffffff',
    ] },
    sweetie: { name: 'Sweetie 16', colours: [
        '#1a1c2c', '#5d275d', '#b13e53', '#ef7d57', '#ffcd75', '#a7f070', '#38b764', '#257179',
        '#29366f', '#3b5dc9', '#41a6f6', '#73eff7', '#f4f4f4', '#94b0c2', '#566c86', '#333c57',
    ] },
    ink: { name: 'Ink wash', colours: [
        '#0d0d0f', '#1c1c20', '#2e2e34', '#43434b', '#5c5c66', '#787883', '#9797a1', '#b8b8c0',
        '#d6d6dc', '#f2f2f5', '#ffffff',
    ] },
    warm: { name: 'Warm paper', colours: [
        '#2b1d12', '#4a3220', '#6b4a2e', '#8d6742', '#b08757', '#c9a677', '#ddc49b', '#eddec0',
        '#f7efdd', '#c0552c', '#e07a3c', '#f0a860',
    ] },
};

/* Tool rail. `grp` draws the separators. */
ST.TOOLS = [
    { id: 'sel-rect',    icon: 'ri-artboard-2-line',      key: 'M', label: 'Rectangle select', grp: 0 },
    { id: 'sel-ellipse', icon: 'ri-circle-line',          key: 'M', label: 'Ellipse select', grp: 0 },
    { id: 'sel-lasso',   icon: 'ri-lasso-line',           key: 'Q', label: 'Free select', grp: 0 },
    { id: 'sel-wand',    icon: 'ri-magic-line',           key: 'W', label: 'Select by colour', grp: 0 },
    { id: 'move',        icon: 'ri-drag-move-2-line',     key: 'V', label: 'Move layer or selection', grp: 0 },
    { id: 'crop',        icon: 'ri-crop-2-line',          key: 'C', label: 'Crop', grp: 0 },

    { id: 'brush',       icon: 'ri-brush-2-fill',         key: 'B', label: 'Brush', grp: 1 },
    { id: 'pencil',      icon: 'ri-pencil-fill',          key: 'P', label: 'Pencil — hard 1:1 pixels', grp: 1 },
    { id: 'eraser',      icon: 'ri-eraser-fill',          key: 'E', label: 'Eraser', grp: 1 },
    { id: 'dither',      icon: 'ri-scan-line',            key: 'K', label: 'Dither brush', grp: 1 },
    { id: 'fill',        icon: 'ri-paint-fill',           key: 'G', label: 'Paint bucket', grp: 1 },
    { id: 'gradient',    icon: 'ri-contrast-drop-2-fill', key: 'D', label: 'Gradient', grp: 1 },

    { id: 'line',        icon: 'ri-slash-commands-2',     key: 'L', label: 'Line', grp: 2 },
    { id: 'rect',        icon: 'ri-square-line',          key: 'R', label: 'Rectangle', grp: 2 },
    { id: 'ellipse',     icon: 'ri-circle-fill',          key: 'O', label: 'Ellipse', grp: 2 },
    { id: 'poly',        icon: 'ri-shape-2-line',         key: 'U', label: 'Polygon / star', grp: 2 },
    { id: 'text',        icon: 'ri-text',                 key: 'T', label: 'Text', grp: 2 },

    { id: 'clone',       icon: 'ri-stamp-line',           key: 'S', label: 'Clone stamp — Alt-click to set the source', grp: 3 },
    { id: 'smudge',      icon: 'ri-drop-line',            key: 'J', label: 'Smudge', grp: 3 },
    { id: 'dodge',       icon: 'ri-sun-line',             key: 'A', label: 'Dodge — lighten', grp: 3 },
    { id: 'burn',        icon: 'ri-moon-line',            key: 'N', label: 'Burn — darken', grp: 3 },

    { id: 'pick',        icon: 'ri-sip-line',             key: 'I', label: 'Eyedropper', grp: 4 },
    { id: 'pan',         icon: 'ri-drag-move-line',       key: 'H', label: 'Pan — or hold Space', grp: 4 },
];

ST.TOOL_OPTS = {
    'sel-rect':    ['selmode', 'feather'],
    'sel-ellipse': ['selmode', 'feather'],
    'sel-lasso':   ['selmode', 'feather'],
    'sel-wand':    ['selmode', 'tolerance', 'contiguous', 'sampleall'],
    move:          ['movewhat'],
    crop:          ['cropact'],
    brush:         ['size', 'flow', 'hardness'],
    pencil:        ['size', 'flow'],
    eraser:        ['size', 'flow', 'hardness'],
    dither:        ['size', 'ditherpat', 'ditherdens'],
    fill:          ['tolerance', 'contiguous', 'sampleall', 'flow'],
    gradient:      ['gradtype', 'gradend', 'flow'],
    line:          ['size', 'flow'],
    rect:          ['size', 'shapefill', 'flow'],
    ellipse:       ['size', 'shapefill', 'flow'],
    poly:          ['size', 'sides', 'star', 'shapefill', 'flow'],
    text:          ['textval', 'textsize', 'textfont', 'textbold'],
    clone:         ['size', 'hardness', 'flow', 'aligned'],
    smudge:        ['size', 'strength'],
    dodge:         ['size', 'exposure', 'range'],
    burn:          ['size', 'exposure', 'range'],
    pick:          ['sampleall'],
    pan:           [],
};

/* --------------------------------------------------------------- state -- */

const S = ST.S = {
    docs: [], doc: null,
    tool: 'brush',
    fg: '#ff3b3b', bg: '#ffffff', alpha: 1,
    size: 4, flow: 1, hardness: 1,
    tolerance: 24, contiguous: true, sampleAll: true,
    selMode: 'new', feather: 0,
    shapeFill: false, sides: 5, star: false,
    gradRadial: false, gradAlpha: true,
    ditherPat: 'bayer4', ditherDens: 50,
    aligned: true, strength: 50, exposure: 25, range: 'mid',
    moveWhat: 'layer',
    symX: false, symY: false,
    pixelMode: false, snap: false, gridSize: 8, grid: false,
    tile: false, refOpacity: 50, refBelow: true,
    zoom: 1, sel: null, ants: null, cropRect: null,
    palette: 'default', paletteSnap: false, recent: [],
    onion: false, playing: null,
    booted: false, active: false, pendingFit: false,
    saveTimer: null, storageWarned: false,
    cloneSrc: null, cloneOff: null,
};

/* Scratch surfaces, all document-sized. */
const B = ST.B = {
    view: null, viewCtx: null,
    ov: null, ovCtx: null,
    tile: null, tileCtx: null,
    stroke: null, strokeCtx: null,
    group: null, groupCtx: null,
    base: null, baseCtx: null,
    fx: null, fxCtx: null,
    sil: null, silCtx: null,
    mask: null, maskCtx: null,
};

ST.resizeScratch = function (w, h) {
    B.view.width = w; B.view.height = h;
    B.ov.width = w; B.ov.height = h;
    B.viewCtx = ST.ctx2d(B.view);
    B.ovCtx = B.ov.getContext('2d');
    ['stroke', 'group', 'base', 'fx', 'sil', 'mask'].forEach(k => {
        B[k] = ST.mkCanvas(w, h);
        B[k + 'Ctx'] = ST.ctx2d(B[k]);
    });
};

/* ------------------------------------------------------ document model -- */

ST.makeLayer = function (doc, name, frames) {
    const cels = [];
    const n = frames || doc.frames || 1;
    for (let i = 0; i < n; i++) cels.push(ST.mkCanvas(doc.w, doc.h));
    return {
        id: ST.uid(), name: name || 'Layer',
        visible: true, opacity: 1, blend: 'source-over',
        locked: false, alphaLock: false, clip: false,
        fx: null,
        cels,
    };
};

ST.makeDoc = function (w, h, name) {
    const doc = {
        id: ST.uid(), name: name || 'Untitled',
        w: clamp(Math.round(w) || 64, 1, ST.MAX_DIM),
        h: clamp(Math.round(h) || 64, 1, ST.MAX_DIM),
        frames: 1, fi: 0, li: 0, fps: 8, delays: [125],
        layers: [], history: [], future: [], dirty: true, saved: 'pending',
    };
    doc.layers.push(ST.makeLayer(doc, 'Background', 1));
    return doc;
};

ST.activeLayer = () => (S.doc ? S.doc.layers[S.doc.li] : null);
ST.activeCel = () => { const l = ST.activeLayer(); return l ? l.cels[S.doc.fi] : null; };
ST.layerEditable = function () {
    const l = ST.activeLayer();
    if (!l) { ST.note('Open a project first.', 'ri-information-line'); return null; }
    if (l.locked) { ST.note('That layer is locked.', 'ri-lock-line'); return null; }
    return l;
};

/* --------------------------------------------------- selection (masks) -- */
/* A selection is a document-sized canvas whose alpha is the coverage, plus a
   cached bounding box and an "ants" bitmap for the outline. Everything —
   rect, ellipse, lasso, wand — funnels through the same representation, so
   invert / grow / feather / clipping all work the same way for every shape. */

function boundsOf(mask) {
    const w = mask.width, h = mask.height;
    const d = ST.ctx2d(mask).getImageData(0, 0, w, h).data;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 4) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < 0) return null;
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
ST.boundsOf = boundsOf;

function buildAnts(mask) {
    const w = mask.width, h = mask.height;
    const src = ST.ctx2d(mask).getImageData(0, 0, w, h).data;
    const out = ST.mkCanvas(w, h);
    const oc = ST.ctx2d(out);
    const img = oc.createImageData(w, h);
    const d = img.data;
    const inside = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? 0 : src[(y * w + x) * 4 + 3] > 127;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!inside(x, y)) continue;
            if (inside(x - 1, y) && inside(x + 1, y) && inside(x, y - 1) && inside(x, y + 1)) continue;
            const i = (y * w + x) * 4;
            const on = (((x + y) >> 2) & 1) === 0;   // static dash pattern
            d[i] = d[i + 1] = d[i + 2] = on ? 255 : 0;
            d[i + 3] = 255;
        }
    }
    oc.putImageData(img, 0, 0);
    return out;
}

ST.selSet = function (mask, mode) {
    if (!S.doc) return;
    mode = mode || 'new';
    let next;
    if (!S.sel || mode === 'new') {
        next = mask;
    } else {
        next = ST.copyCanvas(S.sel.mask);
        const c = ST.ctx2d(next);
        c.globalCompositeOperation =
            mode === 'add' ? 'source-over' :
            mode === 'subtract' ? 'destination-out' : 'destination-in';
        c.drawImage(mask, 0, 0);
        c.globalCompositeOperation = 'source-over';
    }
    if (S.feather > 0) next = ST.featherMask(next, S.feather);
    const b = boundsOf(next);
    if (!b) { ST.selNone(); return; }
    S.sel = { mask: next, b };
    S.ants = buildAnts(next);
    ST.drawOverlay();
    ST.updateSelInfo();
};

ST.selNone = function () {
    S.sel = null; S.ants = null;
    ST.drawOverlay(); ST.updateSelInfo();
};

ST.selAll = function () {
    if (!S.doc) return;
    const m = ST.mkCanvas(S.doc.w, S.doc.h);
    const c = m.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, S.doc.w, S.doc.h);
    ST.selSet(m, 'new');
};

ST.selInvert = function () {
    if (!S.doc) return;
    if (!S.sel) { ST.selAll(); return; }
    const m = ST.mkCanvas(S.doc.w, S.doc.h);
    const c = m.getContext('2d');
    c.fillStyle = '#fff';
    c.fillRect(0, 0, S.doc.w, S.doc.h);
    c.globalCompositeOperation = 'destination-out';
    c.drawImage(S.sel.mask, 0, 0);
    ST.selSet(m, 'new');
};

ST.featherMask = function (mask, px) {
    if (px <= 0) return mask;
    const out = ST.mkCanvas(mask.width, mask.height);
    const c = out.getContext('2d');
    if ('filter' in c) c.filter = 'blur(' + px + 'px)';
    c.drawImage(mask, 0, 0);
    return out;
};

/* Grow / shrink by repeatedly stamping the mask at ring offsets. */
ST.growMask = function (n) {
    if (!S.sel || !n) return;
    const w = S.doc.w, h = S.doc.h;
    const out = ST.mkCanvas(w, h);
    const c = out.getContext('2d');
    const r = Math.abs(n);
    const offs = [];
    for (let a = 0; a < 16; a++) offs.push([Math.round(Math.cos(a * Math.PI / 8) * r), Math.round(Math.sin(a * Math.PI / 8) * r)]);
    if (n > 0) {
        c.drawImage(S.sel.mask, 0, 0);
        offs.forEach(o => c.drawImage(S.sel.mask, o[0], o[1]));
    } else {
        // shrink: invert, grow, invert back
        c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(S.sel.mask, 0, 0);
        const inv = ST.copyCanvas(out);
        ST.clearCanvas(out);
        c.globalCompositeOperation = 'source-over';
        c.drawImage(inv, 0, 0);
        offs.forEach(o => c.drawImage(inv, o[0], o[1]));
        const grown = ST.copyCanvas(out);
        ST.clearCanvas(out);
        c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(grown, 0, 0);
    }
    ST.selSet(out, 'new');
};

/* Apply `mask` to a freshly drawn buffer, honouring the active selection. */
ST.maskBySelection = function (src) {
    if (!S.sel) return src;
    const c = ST.clearCanvas(B.mask);
    c.drawImage(src, 0, 0);
    c.globalCompositeOperation = 'destination-in';
    c.drawImage(S.sel.mask, 0, 0);
    c.globalCompositeOperation = 'source-over';
    return B.mask;
};

ST.updateSelInfo = function () {
    const el = $('st-sel-info');
    if (!el) return;
    el.textContent = S.sel
        ? S.sel.b.w + ' × ' + S.sel.b.h + ' at ' + S.sel.b.x + ', ' + S.sel.b.y
        : 'No selection';
};

/* ----------------------------------------------------------- rendering -- */

let compRaf = 0;
ST.requestComposite = function () {
    if (compRaf) return;
    compRaf = requestAnimationFrame(() => { compRaf = 0; ST.composite(); });
};

function hasFx(l) {
    return !!(l.fx && (l.fx.stroke || l.fx.shadow || l.fx.glow));
}

/* Layer + its non-destructive effects, drawn into `dst`. */
function drawWithFx(dst, layer, cel) {
    if (!hasFx(layer)) { dst.drawImage(cel, 0, 0); return; }
    const fx = layer.fx, w = S.doc.w, h = S.doc.h;
    const tint = colour => {
        const c = ST.clearCanvas(B.sil);
        c.drawImage(cel, 0, 0);
        c.globalCompositeOperation = 'source-in';
        c.fillStyle = colour;
        c.fillRect(0, 0, w, h);
        c.globalCompositeOperation = 'source-over';
        return B.sil;
    };
    if (fx.shadow) {
        const sil = tint(fx.shadowColour || '#000000');
        dst.save();
        dst.globalAlpha = clamp(fx.shadowAlpha == null ? 0.5 : fx.shadowAlpha, 0, 1);
        if ('filter' in dst && fx.shadowBlur) dst.filter = 'blur(' + fx.shadowBlur + 'px)';
        dst.drawImage(sil, fx.shadowX || 0, fx.shadowY || 0);
        dst.restore();
    }
    if (fx.glow) {
        const sil = tint(fx.glowColour || '#ffd24a');
        dst.save();
        dst.globalAlpha = clamp(fx.glowAlpha == null ? 0.6 : fx.glowAlpha, 0, 1);
        if ('filter' in dst) dst.filter = 'blur(' + (fx.glowSize || 6) + 'px)';
        dst.drawImage(sil, 0, 0);
        dst.drawImage(sil, 0, 0);
        dst.restore();
    }
    if (fx.stroke) {
        const sil = tint(fx.strokeColour || '#000000');
        const r = clamp(fx.strokeWidth || 1, 1, 40);
        dst.save();
        dst.globalAlpha = 1;
        const rings = r > 3 ? [r, r * 0.55] : [r];
        rings.forEach(rr => {
            for (let a = 0; a < 16; a++) {
                const t = a * Math.PI / 8;
                dst.drawImage(sil, Math.round(Math.cos(t) * rr), Math.round(Math.sin(t) * rr));
            }
        });
        dst.restore();
    }
    dst.drawImage(cel, 0, 0);
}

ST.strokeLive = false;

/* Live stroke preview merged over the layer being painted. */
function drawActiveLayer(dst, layer, cel) {
    if (!ST.strokeLive) { drawWithFx(dst, layer, cel); return; }
    const c = ST.clearCanvas(B.fx);
    c.drawImage(cel, 0, 0);
    ST.applyStroke(c, layer);
    drawWithFx(dst, layer, B.fx);
}

ST.composite = function () {
    const d = S.doc;
    if (!d || !B.viewCtx) return;
    const vc = B.viewCtx;
    vc.setTransform(1, 0, 0, 1, 0, 0);
    vc.globalAlpha = 1;
    vc.globalCompositeOperation = 'source-over';
    vc.clearRect(0, 0, d.w, d.h);

    if (S.onion && d.frames > 1) {
        const draw = (idx, alpha) => {
            vc.globalAlpha = alpha;
            d.layers.forEach(l => { if (l.visible) vc.drawImage(l.cels[idx], 0, 0); });
        };
        if (d.fi > 0) draw(d.fi - 1, 0.3);
        if (d.fi < d.frames - 1) draw(d.fi + 1, 0.18);
        vc.globalAlpha = 1;
    }

    const act = ST.activeLayer();
    const layers = d.layers;
    let i = 0;
    while (i < layers.length) {
        const base = layers[i];
        let j = i + 1;
        while (j < layers.length && layers[j].clip) j++;
        const followers = layers.slice(i + 1, j);
        const drawBase = (dst) => {
            if (base === act) drawActiveLayer(dst, base, base.cels[d.fi]);
            else drawWithFx(dst, base, base.cels[d.fi]);
        };
        if (!base.visible || base.opacity <= 0) { i = j; continue; }

        if (!followers.length) {
            vc.globalAlpha = base.opacity;
            vc.globalCompositeOperation = base.blend;
            if (hasFx(base) || base === act) { const c = ST.clearCanvas(B.group); drawBase(c); vc.drawImage(B.group, 0, 0); }
            else vc.drawImage(base.cels[d.fi], 0, 0);
        } else {
            // followers clipped to the base's own alpha, then stacked on the base
            const gc = ST.clearCanvas(B.group);
            followers.forEach(f => {
                if (!f.visible || f.opacity <= 0) return;
                gc.globalAlpha = f.opacity;
                gc.globalCompositeOperation = f.blend;
                if (f === act) drawActiveLayer(gc, f, f.cels[d.fi]);
                else drawWithFx(gc, f, f.cels[d.fi]);
            });
            gc.globalAlpha = 1;
            gc.globalCompositeOperation = 'destination-in';
            gc.drawImage(base.cels[d.fi], 0, 0);
            gc.globalCompositeOperation = 'source-over';

            const fc = ST.clearCanvas(B.base);
            drawBase(fc);
            fc.drawImage(B.group, 0, 0);
            vc.globalAlpha = base.opacity;
            vc.globalCompositeOperation = base.blend;
            vc.drawImage(B.base, 0, 0);
        }
        i = j;
    }
    vc.globalAlpha = 1;
    vc.globalCompositeOperation = 'source-over';
    ST.drawOverlay();
    if (S.tile) ST.renderTile();
};

ST.drawOverlay = function () {
    const d = S.doc;
    if (!d || !B.ovCtx) return;
    const oc = B.ovCtx;
    oc.setTransform(1, 0, 0, 1, 0, 0);
    oc.clearRect(0, 0, d.w, d.h);
    if (S.cropRect) {
        const r = S.cropRect;
        oc.fillStyle = 'rgba(0,0,0,0.55)';
        oc.fillRect(0, 0, d.w, r.y);
        oc.fillRect(0, r.y + r.h, d.w, d.h - r.y - r.h);
        oc.fillRect(0, r.y, r.x, r.h);
        oc.fillRect(r.x + r.w, r.y, d.w - r.x - r.w, r.h);
        oc.strokeStyle = '#fff';
        oc.lineWidth = Math.max(1 / S.zoom, 0.5);
        oc.strokeRect(r.x, r.y, r.w, r.h);
    }
    if (S.ants) oc.drawImage(S.ants, 0, 0);
    if (ST.previewOverlay) ST.previewOverlay(oc);
};

ST.renderTile = function () {
    const d = S.doc;
    if (!B.tileCtx || !d) return;
    B.tile.width = d.w * 3;
    B.tile.height = d.h * 3;
    const c = B.tile.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.globalAlpha = 0.42;
    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
            if (x === 1 && y === 1) continue;
            c.drawImage(B.view, d.w * x, d.h * y);
        }
    }
    c.globalAlpha = 1;
};

ST.applyZoom = function () {
    const d = S.doc;
    if (!d) return;
    const w = Math.max(1, Math.round(d.w * S.zoom));
    const h = Math.max(1, Math.round(d.h * S.zoom));
    const px = w + 'px', py = h + 'px';
    B.view.style.width = px; B.view.style.height = py;
    B.ov.style.width = px; B.ov.style.height = py;
    const ref = $('st-ref');
    if (ref) { ref.style.width = px; ref.style.height = py; }
    const g = $('st-grid-ov');
    const cell = S.gridSize * S.zoom;
    const show = S.grid && cell >= 5;
    g.style.display = show ? 'block' : 'none';
    g.style.width = px; g.style.height = py;
    g.style.backgroundSize = cell + 'px ' + cell + 'px';
    if (S.tile) {
        B.tile.style.display = 'block';
        B.tile.style.width = (w * 3) + 'px';
        B.tile.style.height = (h * 3) + 'px';
        B.tile.style.left = -w + 'px';
        B.tile.style.top = -h + 'px';
    } else {
        B.tile.style.display = 'none';
    }
    $('st-zoom-val').textContent = Math.round(S.zoom * 100) + '%';
    $('st-root').classList.toggle('pixel-view', S.zoom >= 3 || S.pixelMode);
    ST.drawOverlay();
};

ST.setZoom = function (z, keepCentre) {
    const stage = $('st-stage');
    const before = { l: stage.scrollLeft, t: stage.scrollTop, w: stage.clientWidth, h: stage.clientHeight };
    const old = S.zoom;
    S.zoom = clamp(z, 0.02, 64);
    ST.applyZoom();
    if (keepCentre !== false && old) {
        const k = S.zoom / old;
        stage.scrollLeft = (before.l + before.w / 2) * k - before.w / 2;
        stage.scrollTop = (before.t + before.h / 2) * k - before.h / 2;
    }
};

ST.zoomToFit = function () {
    const d = S.doc;
    if (!d) return;
    const stage = $('st-stage');
    // a collapsed stage means the panel is not laid out yet — try again on entry
    if (stage.clientWidth < 80 || stage.clientHeight < 80) { S.pendingFit = true; return; }
    S.pendingFit = false;
    const pad = 64;
    const z = Math.min((stage.clientWidth - pad) / d.w, (stage.clientHeight - pad) / d.h);
    S.zoom = clamp(z > 1 ? Math.floor(z) : z, 0.02, 64);
    ST.applyZoom();
};

/* ------------------------------------------------------------- history -- */

ST.pushHistory = function (label, undo, redo) {
    const d = S.doc;
    if (!d) return;
    d.history.push({ label: label, undo: undo, redo: redo });
    if (d.history.length > ST.MAX_HISTORY) d.history.shift();
    d.future.length = 0;
    ST.markDirty();
    ST.syncHistory();
};

/* Swap-based cel snapshot: one canvas per entry, reused for redo. */
ST.celEntry = function (label, layer, fi) {
    const entry = { label: label, snap: ST.copyCanvas(layer.cels[fi]) };
    const swap = () => {
        const cur = layer.cels[fi];
        if (!cur) return;
        const tmp = ST.copyCanvas(cur);
        const c = ST.clearCanvas(cur);
        c.drawImage(entry.snap, 0, 0);
        entry.snap = tmp;
        if (S.doc) {
            const li = S.doc.layers.indexOf(layer);
            if (li >= 0) S.doc.li = li;
            S.doc.fi = clamp(fi, 0, S.doc.frames - 1);
        }
    };
    entry.undo = swap;
    entry.redo = swap;
    return entry;
};

ST.snapshotCel = function (label) {
    const l = ST.activeLayer();
    if (!l) return;
    const e = ST.celEntry(label || 'Paint', l, S.doc.fi);
    S.doc.history.push(e);
    if (S.doc.history.length > ST.MAX_HISTORY) S.doc.history.shift();
    S.doc.future.length = 0;
    ST.markDirty();
    ST.syncHistory();
};

ST.undo = function () {
    const d = S.doc;
    if (!d || !d.history.length) return;
    const e = d.history.pop();
    e.undo();
    d.future.push(e);
    ST.afterChange();
};
ST.redo = function () {
    const d = S.doc;
    if (!d || !d.future.length) return;
    const e = d.future.pop();
    e.redo();
    d.history.push(e);
    ST.afterChange();
};
ST.jumpHistory = function (targetPast) {
    const d = S.doc;
    if (!d) return;
    let guard = 0;
    while (d.history.length > targetPast && guard++ < 200) ST.undo();
    while (d.history.length < targetPast && d.future.length && guard++ < 200) ST.redo();
};

ST.afterChange = function () {
    const d = S.doc;
    if (!d) return;
    d.li = clamp(d.li, 0, d.layers.length - 1);
    d.fi = clamp(d.fi, 0, d.frames - 1);
    ST.renderLayers(); ST.renderFrames(); ST.renderDocs();
    ST.composite(); ST.syncHistory(); ST.markDirty();
};

/* Filled in by studio-ui. Stubs keep core independent. */
ST.renderLayers = function () {};
ST.renderFrames = function () {};
ST.renderDocs = function () {};
ST.syncHistory = function () {};
ST.markDirty = function () {};
ST.applyStroke = function () {};
ST.previewOverlay = null;

})();
