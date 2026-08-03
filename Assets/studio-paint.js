/* ============================================================================
   Chosevn Studio — paint engine and pointer input.
   Brushes, shapes, fills, gradients, retouch tools, selections, crop, move.
   ==========================================================================*/
(function () {
'use strict';

const ST = window.__ST;
const S = ST.S, B = ST.B, $ = ST.$, clamp = ST.clamp;

/* --------------------------------------------------------- stamp shapes -- */

const DITHER = {
    bayer2: [[0, 2], [3, 1]],
    bayer4: [
        [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
    ],
    checker: [[0, 2], [2, 0]],
    lines: [[0, 0], [3, 3]],
    noise: null,
};

function ditherOn(x, y) {
    const dens = S.ditherDens / 100;
    const pat = DITHER[S.ditherPat];
    if (!pat) return Math.random() < dens;
    const n = pat.length;
    const max = n * n;
    const t = pat[((y % n) + n) % n][((x % n) + n) % n] / max;
    return t < dens;
}

function stampRound(c, x, y, r, colour, hard) {
    if (hard >= 1 || r <= 1.2) {
        c.fillStyle = colour;
        c.beginPath();
        c.arc(x, y, Math.max(0.5, r), 0, Math.PI * 2);
        c.fill();
        return;
    }
    const rgb = ST.hexToRgb(colour);
    const g = c.createRadialGradient(x, y, r * hard, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',1)');
    g.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
}

function stampSquare(c, x, y, size, colour) {
    const off = Math.floor(size / 2);
    c.fillStyle = colour;
    c.fillRect(Math.floor(x) - off, Math.floor(y) - off, size, size);
}

function stampDither(c, x, y, size, colour) {
    const off = Math.floor(size / 2);
    const x0 = Math.floor(x) - off, y0 = Math.floor(y) - off;
    c.fillStyle = colour;
    for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
            if (ditherOn(x0 + dx, y0 + dy)) c.fillRect(x0 + dx, y0 + dy, 1, 1);
        }
    }
}

/* Mirror a point through the enabled symmetry axes. */
function mirrored(x, y) {
    const d = S.doc, out = [[x, y]];
    if (S.symX) out.push([d.w - 1 - x, y]);
    if (S.symY) out.push([x, d.h - 1 - y]);
    if (S.symX && S.symY) out.push([d.w - 1 - x, d.h - 1 - y]);
    return out;
}
ST.mirrored = mirrored;

ST.clearStroke = function () {
    if (!S.doc) return;
    ST.clearCanvas(B.stroke);
};

/* Merge the live stroke buffer into a target context, honouring selection,
   alpha lock and the eraser. */
ST.applyStroke = function (target, layer) {
    const src = ST.maskBySelection(B.stroke);
    const eraser = S.tool === 'eraser';
    target.save();
    target.globalAlpha = clamp(S.flow * S.alpha, 0, 1);
    target.globalCompositeOperation = eraser ? 'destination-out'
        : (layer && layer.alphaLock ? 'source-atop' : 'source-over');
    target.drawImage(src, 0, 0);
    target.restore();
};

/* ---------------------------------------------------------- brush paint -- */

function paintSegment(a, b) {
    const c = ST.ctx2d(B.stroke);
    const colour = S.tool === 'eraser' ? '#000000' : S.fg;
    const pixel = S.pixelMode || S.tool === 'pencil';
    const dither = S.tool === 'dither';
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = 1;

    const from = mirrored(a.x, a.y), to = mirrored(b.x, b.y);
    for (let m = 0; m < from.length; m++) {
        const pa = from[m], pb = to[m];
        if (pixel || dither) {
            let x0 = Math.floor(pa[0]), y0 = Math.floor(pa[1]);
            const x1 = Math.floor(pb[0]), y1 = Math.floor(pb[1]);
            const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
            const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
            let err = dx - dy, guard = 0;
            for (;;) {
                if (dither) stampDither(c, x0, y0, S.size, colour);
                else stampSquare(c, x0, y0, S.size, colour);
                if ((x0 === x1 && y0 === y1) || ++guard > 20000) break;
                const e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x0 += sx; }
                if (e2 < dx) { err += dx; y0 += sy; }
            }
        } else {
            const r = S.size / 2;
            const dist = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
            const step = Math.max(0.55, r * 0.25);
            const n = Math.max(1, Math.ceil(dist / step));
            for (let i = 0; i <= n; i++) {
                const t = i / n;
                stampRound(c, pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, r, colour, S.hardness);
            }
        }
    }
}
ST.paintSegment = paintSegment;

ST.commitStroke = function (label) {
    const layer = ST.activeLayer();
    const cel = ST.activeCel();
    if (!cel) return;
    ST.snapshotCel(label || 'Paint');
    ST.applyStroke(ST.ctx2d(cel), layer);
    ST.strokeLive = false;
    ST.clearStroke();
    ST.composite();
    ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); ST.markDirty();
};

/* -------------------------------------------------- retouch (direct px) -- */
/* Clone, smudge, dodge and burn read from the destination, so they paint
   straight onto the cel with a snapshot taken when the stroke starts. */

function circleClip(c, x, y, r, fn) {
    c.save();
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.clip();
    fn(c);
    c.restore();
}

function retouchStamp(p, prev) {
    const cel = ST.activeCel();
    if (!cel) return;
    const c = ST.ctx2d(cel);
    const r = Math.max(1, S.size / 2);
    const d = S.doc;

    if (S.tool === 'clone') {
        if (!S.cloneOff) return;
        const sx = p.x - S.cloneOff.dx, sy = p.y - S.cloneOff.dy;
        c.save();
        c.globalAlpha = clamp(S.flow * S.alpha, 0, 1);
        c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
        if (S.sel) { /* respect selection by clipping to its bounds too */ }
        c.clip();
        c.drawImage(cel, sx - r - 2, sy - r - 2, r * 2 + 4, r * 2 + 4,
                         p.x - r - 2, p.y - r - 2, r * 2 + 4, r * 2 + 4);
        c.restore();
        return;
    }

    if (S.tool === 'smudge') {
        if (!prev) return;
        const k = clamp(S.strength / 100, 0, 0.95);
        circleClip(c, p.x, p.y, r, cc => {
            cc.globalAlpha = k;
            cc.drawImage(cel, prev.x - r - 1, prev.y - r - 1, r * 2 + 2, r * 2 + 2,
                              p.x - r - 1, p.y - r - 1, r * 2 + 2, r * 2 + 2);
            cc.globalAlpha = 1;
        });
        return;
    }

    // dodge / burn
    const x0 = clamp(Math.floor(p.x - r), 0, d.w - 1);
    const y0 = clamp(Math.floor(p.y - r), 0, d.h - 1);
    const w = clamp(Math.ceil(r * 2), 1, d.w - x0);
    const h = clamp(Math.ceil(r * 2), 1, d.h - y0);
    const img = c.getImageData(x0, y0, w, h);
    const px = img.data;
    const amt = (S.exposure / 100) * (S.tool === 'dodge' ? 1 : -1);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (px[i + 3] === 0) continue;
            const dist = Math.hypot(x0 + x - p.x, y0 + y - p.y);
            if (dist > r) continue;
            const falloff = 1 - (dist / r) * (1 - S.hardness * 0.5);
            const lum = (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]) / 255;
            let weight = 1;
            if (S.range === 'shadow') weight = clamp(1 - lum * 1.6, 0, 1);
            else if (S.range === 'high') weight = clamp((lum - 0.35) * 1.6, 0, 1);
            else weight = 1 - Math.abs(lum - 0.5) * 1.4;
            const k = amt * falloff * clamp(weight, 0, 1) * 0.6;
            for (let ch = 0; ch < 3; ch++) {
                const v = px[i + ch];
                px[i + ch] = clamp(k >= 0 ? v + (255 - v) * k : v * (1 + k), 0, 255);
            }
        }
    }
    c.putImageData(img, x0, y0);
}

/* -------------------------------------------------------------- shapes -- */

function polyPoints(cx, cy, rx, ry, sides, star) {
    const pts = [];
    const n = Math.max(3, sides) * (star ? 2 : 1);
    for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2 - Math.PI / 2;
        const k = star && (i % 2) ? 0.46 : 1;
        pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k]);
    }
    return pts;
}

function drawShape(kind, a, b, shiftKey) {
    const c = ST.ctx2d(B.stroke);
    ST.clearStroke();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.strokeStyle = S.fg;
    c.fillStyle = S.fg;
    c.lineWidth = Math.max(1, S.size);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    const snap = v => (S.pixelMode ? Math.floor(v) + 0.5 : v);

    if (kind === 'line') {
        c.beginPath();
        c.moveTo(snap(a.x), snap(a.y));
        c.lineTo(snap(b.x), snap(b.y));
        c.stroke();
        return;
    }
    const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (kind === 'rect') {
        if (S.shapeFill) c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
        else c.strokeRect(snap(x), snap(y), Math.round(w), Math.round(h));
    } else if (kind === 'ellipse') {
        c.beginPath();
        c.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
        if (S.shapeFill) c.fill(); else c.stroke();
    } else if (kind === 'poly') {
        const pts = polyPoints(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), S.sides, S.star);
        c.beginPath();
        pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
        c.closePath();
        if (S.shapeFill) c.fill(); else c.stroke();
    }
}

function drawGradient(a, b) {
    const c = ST.ctx2d(B.stroke);
    ST.clearStroke();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    const rgb = ST.hexToRgb(S.fg);
    let grad;
    if (S.gradRadial) {
        const rad = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
        grad = c.createRadialGradient(a.x, a.y, 0, a.x, a.y, rad);
    } else {
        grad = c.createLinearGradient(a.x, a.y, b.x, b.y);
    }
    grad.addColorStop(0, S.fg);
    grad.addColorStop(1, S.gradAlpha ? 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0)' : S.bg);
    c.fillStyle = grad;
    const area = S.sel ? S.sel.b : { x: 0, y: 0, w: S.doc.w, h: S.doc.h };
    c.fillRect(area.x, area.y, area.w, area.h);
}

/* ---------------------------------------------------------------- fill -- */

function sampleSource() {
    if (S.sampleAll) return B.view;
    return ST.activeCel();
}

ST.floodFill = function (sx, sy) {
    const d = S.doc;
    const layer = ST.layerEditable();
    if (!layer) return;
    const cel = ST.activeCel();
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= d.w || sy >= d.h) return;

    const src = ST.ctx2d(sampleSource()).getImageData(0, 0, d.w, d.h).data;
    const out = ST.ctx2d(cel);
    const img = out.getImageData(0, 0, d.w, d.h);
    const data = img.data;
    const at = (x, y) => (y * d.w + x) * 4;
    const s = at(sx, sy);
    const sr = src[s], sg = src[s + 1], sb = src[s + 2], sa = src[s + 3];
    const rgb = ST.hexToRgb(S.fg);
    const ta = Math.round(clamp(S.flow * S.alpha, 0, 1) * 255);
    const tol = S.tolerance;
    const match = i => Math.abs(src[i] - sr) <= tol && Math.abs(src[i + 1] - sg) <= tol &&
                       Math.abs(src[i + 2] - sb) <= tol && Math.abs(src[i + 3] - sa) <= tol;

    const selData = S.sel ? ST.ctx2d(S.sel.mask).getImageData(0, 0, d.w, d.h).data : null;
    const inSel = k => !selData || selData[k * 4 + 3] > 127;
    const area = S.sel ? S.sel.b : { x: 0, y: 0, w: d.w, h: d.h };

    ST.snapshotCel('Fill');
    const alphaLock = layer.alphaLock;
    const put = i => {
        if (alphaLock && data[i + 3] === 0) return;
        data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2];
        data[i + 3] = alphaLock ? data[i + 3] : Math.max(data[i + 3], ta);
    };

    if (!S.contiguous) {
        for (let y = area.y; y < area.y + area.h; y++) {
            for (let x = area.x; x < area.x + area.w; x++) {
                const k = y * d.w + x;
                if (!inSel(k)) continue;
                const i = k * 4;
                if (match(i)) put(i);
            }
        }
    } else {
        const stack = [[sx, sy]];
        const seen = new Uint8Array(d.w * d.h);
        while (stack.length) {
            const p = stack.pop(), x = p[0], y = p[1];
            if (x < area.x || y < area.y || x >= area.x + area.w || y >= area.y + area.h) continue;
            const k = y * d.w + x;
            if (seen[k] || !inSel(k)) continue;
            const i = k * 4;
            if (!match(i)) continue;
            seen[k] = 1;
            put(i);
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
    out.putImageData(img, 0, 0);
    ST.composite(); ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); ST.markDirty();
};

/* -------------------------------------------------- selection builders -- */

function maskFromPainter(fn) {
    const m = ST.mkCanvas(S.doc.w, S.doc.h);
    const c = m.getContext('2d');
    c.fillStyle = '#ffffff';
    fn(c);
    return m;
}

ST.wandSelect = function (sx, sy) {
    const d = S.doc;
    sx = Math.floor(sx); sy = Math.floor(sy);
    if (sx < 0 || sy < 0 || sx >= d.w || sy >= d.h) return;
    const src = ST.ctx2d(sampleSource()).getImageData(0, 0, d.w, d.h).data;
    const at = (x, y) => (y * d.w + x) * 4;
    const s = at(sx, sy);
    const sr = src[s], sg = src[s + 1], sb = src[s + 2], sa = src[s + 3];
    const tol = S.tolerance;
    const match = i => Math.abs(src[i] - sr) <= tol && Math.abs(src[i + 1] - sg) <= tol &&
                       Math.abs(src[i + 2] - sb) <= tol && Math.abs(src[i + 3] - sa) <= tol;

    const m = ST.mkCanvas(d.w, d.h);
    const mc = ST.ctx2d(m);
    const img = mc.createImageData(d.w, d.h);
    const md = img.data;
    const hit = k => { md[k * 4] = md[k * 4 + 1] = md[k * 4 + 2] = 255; md[k * 4 + 3] = 255; };

    if (!S.contiguous) {
        for (let k = 0; k < d.w * d.h; k++) if (match(k * 4)) hit(k);
    } else {
        const stack = [[sx, sy]];
        const seen = new Uint8Array(d.w * d.h);
        while (stack.length) {
            const p = stack.pop(), x = p[0], y = p[1];
            if (x < 0 || y < 0 || x >= d.w || y >= d.h) continue;
            const k = y * d.w + x;
            if (seen[k]) continue;
            if (!match(k * 4)) continue;
            seen[k] = 1;
            hit(k);
            stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
        }
    }
    mc.putImageData(img, 0, 0);
    ST.selSet(m, S.selMode);
};

/* --------------------------------------------------------------- text -- */

ST.resolveFont = function (v) {
    if (typeof v === 'string' && v.slice(0, 4) === 'var(') {
        const name = v.slice(4, -1).trim();
        return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || 'sans-serif';
    }
    return v || 'sans-serif';
};

ST.commitText = function (p) {
    const el = $('st-opt-textval');
    const txt = el ? el.value : '';
    if (!txt.trim()) { ST.note('Type something into the text box first.', 'ri-text'); return; }
    if (!ST.layerEditable()) return;
    const size = clamp(parseInt(($('st-opt-textsize') || {}).value, 10) || 48, 4, 600);
    const font = ST.resolveFont(($('st-opt-textfont') || {}).value);
    const bold = $('st-opt-textbold') && $('st-opt-textbold').classList.contains('on');
    ST.strokeLive = true;
    ST.clearStroke();
    const c = ST.ctx2d(B.stroke);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = S.fg;
    c.textBaseline = 'middle';
    c.font = (bold ? '700 ' : '') + size + 'px ' + font;
    c.fillText(txt, p.x, p.y);
    ST.commitStroke('Text');
};

/* ------------------------------------------------------ pointer plumbing -- */

let drag = null;
let spaceDown = false;
ST.isSpaceDown = () => spaceDown;
ST.setSpaceDown = v => { spaceDown = v; };

function docPoint(e) {
    const r = B.view.getBoundingClientRect();
    let x = (e.clientX - r.left) / r.width * S.doc.w;
    let y = (e.clientY - r.top) / r.height * S.doc.h;
    if (S.snap && S.gridSize > 1) {
        x = Math.round(x / S.gridSize) * S.gridSize;
        y = Math.round(y / S.gridSize) * S.gridSize;
    }
    return { x: x, y: y };
}
ST.docPoint = docPoint;

function pickColour(x, y) {
    const d = S.doc;
    x = Math.floor(clamp(x, 0, d.w - 1));
    y = Math.floor(clamp(y, 0, d.h - 1));
    const px = ST.ctx2d(sampleSource()).getImageData(x, y, 1, 1).data;
    if (px[3] === 0) return;
    ST.setFg(ST.rgbToHex(px[0], px[1], px[2]));
}

const SHAPE_TOOLS = { line: 1, rect: 1, ellipse: 1, poly: 1, gradient: 1 };
const SEL_TOOLS = { 'sel-rect': 1, 'sel-ellipse': 1, 'sel-lasso': 1 };
const RETOUCH = { clone: 1, smudge: 1, dodge: 1, burn: 1 };

ST.onDown = function (e) {
    if (!S.doc || e.button === 2) return;
    const p = docPoint(e);
    const panning = S.tool === 'pan' || e.button === 1 || spaceDown;
    try { B.view.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();

    if (panning) {
        const stage = $('st-stage');
        drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
        stage.classList.add('is-panning');
        return;
    }

    if (S.tool === 'pick') { pickColour(p.x, p.y); return; }
    if (S.tool === 'fill') { ST.floodFill(p.x, p.y); return; }
    if (S.tool === 'sel-wand') { ST.wandSelect(p.x, p.y); return; }
    if (S.tool === 'text') { ST.commitText(p); return; }

    if (S.tool === 'clone' && (e.altKey || e.metaKey)) {
        S.cloneSrc = { x: p.x, y: p.y };
        S.cloneOff = null;
        ST.note('Clone source set.', 'ri-stamp-line');
        return;
    }

    if (S.tool === 'crop') {
        drag = { kind: 'crop', a: p };
        S.cropRect = { x: Math.round(p.x), y: Math.round(p.y), w: 0, h: 0 };
        return;
    }

    if (SEL_TOOLS[S.tool]) {
        drag = { kind: 'sel', a: p, pts: [[p.x, p.y]], shape: S.tool };
        return;
    }

    if (S.tool === 'move') {
        const layer = ST.layerEditable();
        if (!layer) return;
        const cel = ST.activeCel();
        ST.snapshotCel('Move');
        const base = ST.mkCanvas(S.doc.w, S.doc.h);
        const bc = ST.ctx2d(base);
        let floatCv;
        if (S.sel && S.moveWhat !== 'layer') {
            floatCv = ST.mkCanvas(S.doc.w, S.doc.h);
            const fc = ST.ctx2d(floatCv);
            fc.drawImage(cel, 0, 0);
            fc.globalCompositeOperation = 'destination-in';
            fc.drawImage(S.sel.mask, 0, 0);
            bc.drawImage(cel, 0, 0);
            bc.globalCompositeOperation = 'destination-out';
            bc.drawImage(S.sel.mask, 0, 0);
        } else {
            floatCv = ST.copyCanvas(cel);
        }
        drag = { kind: 'move', a: p, base: base, float: floatCv, movedSel: !!(S.sel && S.moveWhat !== 'layer'), sel0: S.sel ? S.sel.b : null };
        return;
    }

    if (RETOUCH[S.tool]) {
        if (!ST.layerEditable()) return;
        if (S.tool === 'clone') {
            if (!S.cloneSrc) { ST.note('Alt-click to set the clone source first.', 'ri-stamp-line'); return; }
            if (!S.aligned || !S.cloneOff) S.cloneOff = { dx: p.x - S.cloneSrc.x, dy: p.y - S.cloneSrc.y };
        }
        ST.snapshotCel(S.tool === 'clone' ? 'Clone' : S.tool === 'smudge' ? 'Smudge' : 'Dodge / burn');
        drag = { kind: 'retouch', last: p };
        retouchStamp(p, null);
        ST.requestComposite();
        return;
    }

    if (SHAPE_TOOLS[S.tool]) {
        if (!ST.layerEditable()) return;
        drag = { kind: 'shape', a: p, shape: S.tool };
        ST.strokeLive = true;
        return;
    }

    if (!ST.layerEditable()) return;
    drag = { kind: 'paint', last: p };
    ST.strokeLive = true;
    ST.clearStroke();
    paintSegment(p, p);
    ST.requestComposite();
};

ST.onMove = function (e) {
    if (!S.doc) return;
    const p = docPoint(e);
    const posEl = $('st-pos');
    if (posEl) posEl.textContent = Math.floor(p.x) + ', ' + Math.floor(p.y);
    if (!drag) return;

    if (drag.kind === 'pan') {
        const stage = $('st-stage');
        stage.scrollLeft = drag.l - (e.clientX - drag.sx);
        stage.scrollTop = drag.t - (e.clientY - drag.sy);
        return;
    }
    if (drag.kind === 'paint') {
        paintSegment(drag.last, p);
        drag.last = p;
        ST.requestComposite();
        return;
    }
    if (drag.kind === 'retouch') {
        retouchStamp(p, drag.last);
        drag.last = p;
        ST.requestComposite();
        return;
    }
    if (drag.kind === 'shape') {
        let b = p;
        if (e.shiftKey && drag.shape !== 'gradient') {
            const dx = p.x - drag.a.x, dy = p.y - drag.a.y;
            const m = Math.max(Math.abs(dx), Math.abs(dy));
            b = { x: drag.a.x + Math.sign(dx) * m, y: drag.a.y + Math.sign(dy) * m };
        }
        drag.b = b;
        if (drag.shape === 'gradient') drawGradient(drag.a, b);
        else drawShape(drag.shape, drag.a, b, e.shiftKey);
        ST.requestComposite();
        return;
    }
    if (drag.kind === 'crop') {
        S.cropRect = {
            x: clamp(Math.round(Math.min(drag.a.x, p.x)), 0, S.doc.w),
            y: clamp(Math.round(Math.min(drag.a.y, p.y)), 0, S.doc.h),
            w: clamp(Math.round(Math.abs(p.x - drag.a.x)), 0, S.doc.w),
            h: clamp(Math.round(Math.abs(p.y - drag.a.y)), 0, S.doc.h),
        };
        ST.drawOverlay();
        return;
    }
    if (drag.kind === 'sel') {
        drag.b = p;
        drag.pts.push([p.x, p.y]);
        ST.previewOverlay = oc => {
            oc.save();
            oc.strokeStyle = 'rgba(255,255,255,0.9)';
            oc.lineWidth = Math.max(1 / S.zoom, 0.4);
            oc.setLineDash([3 / S.zoom, 3 / S.zoom]);
            if (drag.shape === 'sel-rect') {
                oc.strokeRect(Math.min(drag.a.x, p.x), Math.min(drag.a.y, p.y), Math.abs(p.x - drag.a.x), Math.abs(p.y - drag.a.y));
            } else if (drag.shape === 'sel-ellipse') {
                const x = Math.min(drag.a.x, p.x), y = Math.min(drag.a.y, p.y);
                const w = Math.abs(p.x - drag.a.x), h = Math.abs(p.y - drag.a.y);
                oc.beginPath();
                oc.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
                oc.stroke();
            } else {
                oc.beginPath();
                drag.pts.forEach((q, i) => (i ? oc.lineTo(q[0], q[1]) : oc.moveTo(q[0], q[1])));
                oc.stroke();
            }
            oc.restore();
        };
        ST.drawOverlay();
        return;
    }
    if (drag.kind === 'move') {
        const dx = Math.round(p.x - drag.a.x), dy = Math.round(p.y - drag.a.y);
        const cel = ST.activeCel();
        const c = ST.clearCanvas(cel);
        if (drag.movedSel) {
            c.drawImage(drag.base, 0, 0);
            c.drawImage(drag.float, dx, dy);
        } else {
            c.drawImage(drag.float, dx, dy);
        }
        drag.dx = dx; drag.dy = dy;
        ST.requestComposite();
    }
};

ST.onUp = function () {
    if (!drag) return;
    const kind = drag.kind;
    if (kind === 'pan') $('st-stage').classList.remove('is-panning');

    if (kind === 'paint') ST.commitStroke('Paint');
    else if (kind === 'shape') {
        if (drag.b) ST.commitStroke(drag.shape === 'gradient' ? 'Gradient' : 'Shape');
        else { ST.strokeLive = false; ST.clearStroke(); ST.composite(); }
    } else if (kind === 'retouch') {
        ST.composite(); ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); ST.markDirty();
    } else if (kind === 'sel') {
        ST.previewOverlay = null;
        const a = drag.a, b = drag.b;
        if (!b || (Math.abs(b.x - a.x) < 1 && Math.abs(b.y - a.y) < 1 && drag.pts.length < 4)) {
            ST.selNone();
        } else if (drag.shape === 'sel-rect') {
            ST.selSet(maskFromPainter(c => c.fillRect(
                Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y))), S.selMode);
        } else if (drag.shape === 'sel-ellipse') {
            const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
            const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
            ST.selSet(maskFromPainter(c => {
                c.beginPath();
                c.ellipse(x + w / 2, y + h / 2, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
                c.fill();
            }), S.selMode);
        } else {
            const pts = drag.pts;
            ST.selSet(maskFromPainter(c => {
                c.beginPath();
                pts.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
                c.closePath();
                c.fill();
            }), S.selMode);
        }
    } else if (kind === 'crop') {
        if (!S.cropRect || S.cropRect.w < 1 || S.cropRect.h < 1) S.cropRect = null;
        ST.drawOverlay();
        ST.renderOpts();
    } else if (kind === 'move') {
        if (drag.movedSel && drag.sel0 && (drag.dx || drag.dy)) {
            const m = ST.mkCanvas(S.doc.w, S.doc.h);
            m.getContext('2d').drawImage(S.sel.mask, drag.dx || 0, drag.dy || 0);
            ST.selSet(m, 'new');
        }
        ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); ST.markDirty();
    }
    drag = null;
};

ST.cancelDrag = function () {
    if (!drag) return;
    if (drag.kind === 'shape' || drag.kind === 'paint') { ST.strokeLive = false; ST.clearStroke(); }
    ST.previewOverlay = null;
    drag = null;
    ST.composite();
};

/* ------------------------------------------------------- selection edit -- */

ST.clearSelection = function () {
    const layer = ST.layerEditable();
    if (!layer) return;
    const cel = ST.activeCel();
    ST.snapshotCel('Clear');
    const c = ST.ctx2d(cel);
    if (S.sel) {
        c.save();
        c.globalCompositeOperation = 'destination-out';
        c.drawImage(S.sel.mask, 0, 0);
        c.restore();
    } else {
        ST.clearCanvas(cel);
    }
    ST.composite(); ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); ST.markDirty();
};

ST.fillSelection = function (colour) {
    const layer = ST.layerEditable();
    if (!layer) return;
    const cel = ST.activeCel();
    ST.snapshotCel('Fill selection');
    const c = ST.ctx2d(cel);
    c.save();
    if (S.sel) {
        const tmp = ST.clearCanvas(B.stroke);
        tmp.fillStyle = colour;
        tmp.fillRect(0, 0, S.doc.w, S.doc.h);
        tmp.globalCompositeOperation = 'destination-in';
        tmp.drawImage(S.sel.mask, 0, 0);
        c.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over';
        c.globalAlpha = S.alpha;
        c.drawImage(B.stroke, 0, 0);
        ST.clearStroke();
    } else {
        c.globalCompositeOperation = layer.alphaLock ? 'source-atop' : 'source-over';
        c.globalAlpha = S.alpha;
        c.fillStyle = colour;
        c.fillRect(0, 0, S.doc.w, S.doc.h);
    }
    c.restore();
    ST.composite(); ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); ST.markDirty();
};

ST.copySelection = function (cut) {
    const cel = ST.activeCel();
    if (!cel) return null;
    const b = S.sel ? S.sel.b : { x: 0, y: 0, w: S.doc.w, h: S.doc.h };
    const out = ST.mkCanvas(b.w, b.h);
    const c = ST.ctx2d(out);
    c.drawImage(cel, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    if (S.sel) {
        c.globalCompositeOperation = 'destination-in';
        c.drawImage(S.sel.mask, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
        c.globalCompositeOperation = 'source-over';
    }
    ST.clipboard = { canvas: out, x: b.x, y: b.y };
    if (cut) ST.clearSelection();
    ST.note(cut ? 'Cut.' : 'Copied.', 'ri-clipboard-line');
    return ST.clipboard;
};

ST.pasteClipboard = function (asLayer) {
    if (!ST.clipboard || !S.doc) { ST.note('Nothing copied yet.', 'ri-clipboard-line'); return; }
    const d = S.doc;
    if (asLayer) {
        const l = ST.makeLayer(d, 'Pasted');
        ST.ctx2d(l.cels[d.fi]).drawImage(ST.clipboard.canvas, ST.clipboard.x, ST.clipboard.y);
        const at = d.li + 1;
        d.layers.splice(at, 0, l);
        d.li = at;
        ST.pushHistory('Paste as layer',
            () => d.layers.splice(d.layers.indexOf(l), 1),
            () => d.layers.splice(at, 0, l));
        ST.afterChange();
    } else {
        if (!ST.layerEditable()) return;
        ST.snapshotCel('Paste');
        ST.ctx2d(ST.activeCel()).drawImage(ST.clipboard.canvas, ST.clipboard.x, ST.clipboard.y);
        ST.composite(); ST.renderLayers(); ST.markDirty();
    }
};

})();
