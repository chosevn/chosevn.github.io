/* ============================================================================
   Chosevn Studio — panels, options bar, colour and palettes.
   ==========================================================================*/
(function () {
'use strict';

const ST = window.__ST;
const S = ST.S, B = ST.B, $ = ST.$, clamp = ST.clamp, esc = ST.esc;

/* --------------------------------------------------------- options bar -- */
/* Declared once and rendered per tool, so every tool gets exactly the
   controls it uses and nothing else. */

const OPTS = {
    size:       { t: 'range', label: 'Size', min: 1, max: 400, get: () => S.size, set: v => ST.setSize(v), fmt: v => v },
    flow:       { t: 'range', label: 'Flow', min: 1, max: 100, get: () => Math.round(S.flow * 100), set: v => { S.flow = v / 100; }, fmt: v => v + '%' },
    hardness:   { t: 'range', label: 'Hard', min: 0, max: 100, get: () => Math.round(S.hardness * 100), set: v => { S.hardness = v / 100; }, fmt: v => v + '%' },
    tolerance:  { t: 'range', label: 'Tolerance', min: 0, max: 255, get: () => S.tolerance, set: v => { S.tolerance = v; }, fmt: v => v },
    feather:    { t: 'range', label: 'Feather', min: 0, max: 40, get: () => S.feather, set: v => { S.feather = v; }, fmt: v => v + 'px' },
    strength:   { t: 'range', label: 'Strength', min: 1, max: 95, get: () => S.strength, set: v => { S.strength = v; }, fmt: v => v + '%' },
    exposure:   { t: 'range', label: 'Exposure', min: 1, max: 100, get: () => S.exposure, set: v => { S.exposure = v; }, fmt: v => v + '%' },
    sides:      { t: 'num', label: 'Sides', min: 3, max: 24, get: () => S.sides, set: v => { S.sides = clamp(v, 3, 24); } },
    ditherdens: { t: 'range', label: 'Density', min: 5, max: 95, get: () => S.ditherDens, set: v => { S.ditherDens = v; }, fmt: v => v + '%' },

    contiguous: { t: 'toggle', label: 'Contiguous', icon: 'ri-focus-3-line', get: () => S.contiguous, set: v => { S.contiguous = v; }, tip: 'Only reach pixels that touch' },
    sampleall:  { t: 'toggle', label: 'All layers', icon: 'ri-stack-line', get: () => S.sampleAll, set: v => { S.sampleAll = v; }, tip: 'Sample the merged image instead of just this layer' },
    shapefill:  { t: 'toggle', label: 'Filled', icon: 'ri-paint-brush-fill', get: () => S.shapeFill, set: v => { S.shapeFill = v; } },
    star:       { t: 'toggle', label: 'Star', icon: 'ri-star-line', get: () => S.star, set: v => { S.star = v; } },
    aligned:    { t: 'toggle', label: 'Aligned', icon: 'ri-links-line', get: () => S.aligned, set: v => { S.aligned = v; }, tip: 'Keep the source offset between strokes' },
    textbold:   { t: 'toggle', label: 'Bold', icon: 'ri-bold', get: () => false, set: () => {}, id: 'st-opt-textbold', sticky: true },

    selmode:    { t: 'seg', label: 'Mode', get: () => S.selMode, set: v => { S.selMode = v; },
                  opts: [['new', 'New', 'ri-checkbox-blank-line'], ['add', 'Add', 'ri-add-line'],
                         ['subtract', 'Take', 'ri-subtract-line'], ['intersect', 'Cross', 'ri-close-line']] },
    movewhat:   { t: 'seg', label: 'Move', get: () => S.moveWhat, set: v => { S.moveWhat = v; },
                  opts: [['layer', 'Layer', 'ri-stack-line'], ['selection', 'Selection', 'ri-artboard-2-line']] },
    range:      { t: 'seg', label: 'Range', get: () => S.range, set: v => { S.range = v; },
                  opts: [['shadow', 'Dark', 'ri-moon-line'], ['mid', 'Mid', 'ri-contrast-line'], ['high', 'Light', 'ri-sun-line']] },
    gradtype:   { t: 'seg', label: 'Shape', get: () => (S.gradRadial ? 'radial' : 'linear'), set: v => { S.gradRadial = v === 'radial'; },
                  opts: [['linear', 'Linear', 'ri-arrow-right-line'], ['radial', 'Radial', 'ri-focus-mode']] },
    gradend:    { t: 'seg', label: 'Fades to', get: () => (S.gradAlpha ? 'alpha' : 'bg'), set: v => { S.gradAlpha = v === 'alpha'; },
                  opts: [['alpha', 'Clear', 'ri-blur-off-line'], ['bg', 'Background', 'ri-palette-line']] },
    ditherpat:  { t: 'seg', label: 'Pattern', get: () => S.ditherPat, set: v => { S.ditherPat = v; },
                  opts: [['bayer2', '2×2'], ['bayer4', '4×4'], ['checker', 'Check'], ['lines', 'Lines'], ['noise', 'Noise']] },

    textval:    { t: 'text', label: 'Text', id: 'st-opt-textval', ph: 'Type, then click the canvas' },
    textsize:   { t: 'num', label: 'Size', id: 'st-opt-textsize', min: 4, max: 600, value: 48 },
    textfont:   { t: 'select', label: 'Font', id: 'st-opt-textfont',
                  opts: [['var(--f-sans)', 'Sans'], ['var(--f-chara)', 'Mono'], ['var(--f-det)', 'Display'],
                         ['Georgia, serif', 'Serif'], ['"Courier New", monospace', 'Typewriter']] },
    cropact:    { t: 'buttons', buttons: [
                    ['Apply crop', 'ri-check-line', () => { ST.cropTo(S.cropRect); }],
                    ['Clear', 'ri-close-line', () => { S.cropRect = null; ST.drawOverlay(); ST.renderOpts(); }],
                  ] },
};

ST.renderOpts = function () {
    const box = $('st-opt-scroll');
    if (!box) return;
    const list = ST.TOOL_OPTS[S.tool] || [];
    box.innerHTML = '';
    list.forEach(key => {
        const def = OPTS[key];
        if (!def) return;
        const wrap = document.createElement('div');
        wrap.className = 'st-opt';

        if (def.t === 'buttons') {
            def.buttons.forEach(b => {
                const el = document.createElement('button');
                el.type = 'button';
                el.className = 'st-btn';
                el.innerHTML = '<i class="' + b[1] + '"></i>' + esc(b[0]);
                el.addEventListener('click', b[2]);
                wrap.appendChild(el);
            });
            box.appendChild(wrap);
            return;
        }

        if (def.label) {
            const lbl = document.createElement('span');
            lbl.className = 'st-lbl';
            lbl.textContent = def.label;
            wrap.appendChild(lbl);
        }

        if (def.t === 'range') {
            const r = document.createElement('input');
            r.type = 'range';
            r.className = 'st-range st-range-sm';
            r.min = def.min; r.max = def.max;
            r.value = def.get();
            const num = document.createElement('span');
            num.className = 'st-num';
            num.textContent = def.fmt(+r.value);
            r.addEventListener('input', () => { def.set(+r.value); num.textContent = def.fmt(+r.value); });
            wrap.appendChild(r);
            wrap.appendChild(num);
        } else if (def.t === 'toggle') {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'st-toggle' + (def.get() ? ' on' : '');
            if (def.id) b.id = def.id;
            if (def.tip) b.title = def.tip;
            b.innerHTML = '<i class="' + def.icon + '"></i>' + esc(def.label);
            b.addEventListener('click', () => {
                const on = !b.classList.contains('on');
                b.classList.toggle('on', on);
                def.set(on);
            });
            wrap.innerHTML = '';
            wrap.appendChild(b);
        } else if (def.t === 'seg') {
            const seg = document.createElement('div');
            seg.className = 'st-seg';
            def.opts.forEach(o => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'st-seg-btn' + (def.get() === o[0] ? ' on' : '');
                b.title = o[1];
                b.innerHTML = o[2] ? '<i class="' + o[2] + '"></i>' : esc(o[1]);
                b.addEventListener('click', () => {
                    def.set(o[0]);
                    seg.querySelectorAll('.st-seg-btn').forEach(x => x.classList.toggle('on', x === b));
                });
                seg.appendChild(b);
            });
            wrap.appendChild(seg);
        } else if (def.t === 'num') {
            const n = document.createElement('input');
            n.type = 'number';
            n.className = 'st-num-input';
            n.min = def.min; n.max = def.max;
            if (def.id) n.id = def.id;
            n.value = def.get ? def.get() : def.value;
            if (def.set) n.addEventListener('input', () => def.set(parseInt(n.value, 10) || def.min));
            wrap.appendChild(n);
        } else if (def.t === 'text') {
            const t = document.createElement('input');
            t.type = 'text';
            t.className = 'st-text-input';
            t.id = def.id;
            t.placeholder = def.ph || '';
            t.maxLength = 200;
            t.spellcheck = false;
            t.value = ST.lastText || '';
            t.addEventListener('input', () => { ST.lastText = t.value; });
            wrap.appendChild(t);
        } else if (def.t === 'select') {
            const s = document.createElement('select');
            s.className = 'st-select st-select-sm';
            s.id = def.id;
            def.opts.forEach(o => {
                const op = document.createElement('option');
                op.value = o[0]; op.textContent = o[1];
                s.appendChild(op);
            });
            wrap.appendChild(s);
        }
        box.appendChild(wrap);
    });
    if (!list.length) {
        const hint = document.createElement('div');
        hint.className = 'st-opt-hint';
        const t = ST.TOOLS.find(x => x.id === S.tool);
        hint.textContent = t ? t.label : '';
        box.appendChild(hint);
    }
};

ST.setSize = function (n) {
    S.size = clamp(Math.round(n), 1, 400);
    const r = $('st-opt-scroll') && $('st-opt-scroll').querySelector('input[type="range"]');
    ST.renderOpts();
};

ST.setTool = function (t) {
    if (!ST.TOOL_OPTS[t]) return;
    S.tool = t;
    document.querySelectorAll('.st-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    ST.renderOpts();
    const cursors = { pick: 'crosshair', pan: 'grab', move: 'move', crop: 'crosshair', text: 'text' };
    B.view.style.cursor = cursors[t] || (t.indexOf('sel-') === 0 ? 'crosshair' : 'crosshair');
    if (t !== 'crop' && S.cropRect) { S.cropRect = null; ST.drawOverlay(); }
};

ST.renderTools = function () {
    const rail = $('st-tools');
    rail.innerHTML = '';
    let lastGrp = 0;
    ST.TOOLS.forEach(t => {
        if (t.grp !== lastGrp) {
            const sep = document.createElement('div');
            sep.className = 'st-tool-sep';
            rail.appendChild(sep);
            lastGrp = t.grp;
        }
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'st-tool' + (t.id === S.tool ? ' active' : '');
        b.dataset.tool = t.id;
        b.title = t.label + (t.key ? '  (' + t.key + ')' : '');
        b.innerHTML = '<i class="' + t.icon + '"></i>';
        b.addEventListener('click', () => ST.setTool(t.id));
        rail.appendChild(b);
    });
};

/* -------------------------------------------------------------- panels -- */

ST.thumbFor = function (doc, px) {
    const k = Math.min(px / doc.w, px / doc.h);
    const c = ST.mkCanvas(Math.max(1, doc.w * k), Math.max(1, doc.h * k));
    const x = c.getContext('2d');
    x.imageSmoothingEnabled = doc.w > px;
    const fi = Math.min(doc.fi, doc.frames - 1);
    doc.layers.forEach(l => {
        if (!l.visible) return;
        x.globalAlpha = l.opacity;
        x.drawImage(l.cels[fi], 0, 0, c.width, c.height);
    });
    return c;
};

ST.renderDocs = function () {
    const box = $('st-doc-list');
    if (!box) return;
    if (!S.docs.length) { box.innerHTML = '<div class="st-list-empty">No projects yet.</div>'; return; }
    box.innerHTML = '';
    S.docs.forEach(doc => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'st-doc' + (doc === S.doc ? ' active' : '');
        b.innerHTML =
            '<span class="st-thumb"></span>' +
            '<span class="st-doc-meta">' +
                '<span class="st-doc-name-txt">' + esc(doc.name) + '</span>' +
                '<span class="st-doc-size">' + doc.w + '×' + doc.h +
                    (doc.frames > 1 ? ' · ' + doc.frames + 'f' : '') +
                    (doc.layers.length > 1 ? ' · ' + doc.layers.length + 'L' : '') + '</span>' +
            '</span>' +
            '<span class="st-doc-x" title="Close project"><i class="ri-close-line"></i></span>';
        b.querySelector('.st-thumb').appendChild(ST.thumbFor(doc, 30));
        b.addEventListener('click', e => {
            if (e.target.closest('.st-doc-x')) { e.stopPropagation(); ST.closeDoc(doc); return; }
            if (doc !== S.doc) ST.openDoc(doc, true);
        });
        box.appendChild(b);
    });
};

ST.renderLayers = function () {
    const box = $('st-layer-list');
    if (!box) return;
    box.innerHTML = '';
    if (!S.doc) return;
    const d = S.doc;
    d.layers.forEach((l, i) => {
        const b = document.createElement('div');
        b.className = 'st-layer' + (i === d.li ? ' active' : '') + (l.clip ? ' clipped' : '');
        b.draggable = true;
        b.dataset.i = i;
        const marks =
            (l.clip ? '<i class="ri-corner-left-down-line st-layer-mark" title="Clipped to the layer below"></i>' : '') +
            (l.alphaLock ? '<i class="ri-checkbox-blank-circle-line st-layer-mark" title="Transparency locked"></i>' : '') +
            (l.locked ? '<i class="ri-lock-line st-layer-mark" title="Locked"></i>' : '') +
            (l.fx && (l.fx.stroke || l.fx.shadow || l.fx.glow) ? '<i class="ri-sparkling-fill st-layer-mark" title="Has effects"></i>' : '');
        b.innerHTML =
            '<button class="st-layer-eye' + (l.visible ? ' on' : '') + '" type="button" title="Show / hide">' +
                '<i class="' + (l.visible ? 'ri-eye-line' : 'ri-eye-off-line') + '"></i></button>' +
            '<span class="st-thumb"></span>' +
            '<span class="st-layer-name" title="Double-click to rename">' + esc(l.name) + '</span>' +
            '<span class="st-layer-marks">' + marks + '</span>';
        const t = ST.mkCanvas(26, 26);
        const tx = t.getContext('2d');
        const k = Math.min(26 / d.w, 26 / d.h);
        tx.imageSmoothingEnabled = d.w > 26;
        tx.drawImage(l.cels[d.fi], 0, 0, Math.max(1, d.w * k), Math.max(1, d.h * k));
        b.querySelector('.st-thumb').appendChild(t);

        b.addEventListener('click', e => {
            if (e.target.closest('.st-layer-eye')) {
                const was = l.visible;
                l.visible = !was;
                ST.pushHistory((was ? 'Hide' : 'Show') + ' layer', () => { l.visible = was; }, () => { l.visible = !was; });
                ST.renderLayers(); ST.composite();
                return;
            }
            d.li = i;
            ST.renderLayers();
        });
        b.addEventListener('dblclick', e => {
            if (!e.target.closest('.st-layer-name')) return;
            const n = prompt('Layer name', l.name);
            if (n != null && n.trim()) { l.name = n.trim().slice(0, 40); ST.renderLayers(); ST.markDirty(); }
        });
        b.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', String(i)); b.classList.add('dragging'); });
        b.addEventListener('dragend', () => b.classList.remove('dragging'));
        b.addEventListener('dragover', e => { e.preventDefault(); b.classList.add('drop-target'); });
        b.addEventListener('dragleave', () => b.classList.remove('drop-target'));
        b.addEventListener('drop', e => {
            e.preventDefault();
            b.classList.remove('drop-target');
            const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
            if (isNaN(from) || from === i) return;
            ST.reorderLayer(from, i);
        });
        box.appendChild(b);
    });
    ST.syncLayerProps();
};

ST.syncLayerProps = function () {
    const l = ST.activeLayer();
    const on = !!l;
    ['st-layer-opacity', 'st-layer-blend'].forEach(id => { if ($(id)) $(id).disabled = !on; });
    if (!on) return;
    $('st-layer-opacity').value = Math.round(l.opacity * 100);
    $('st-layer-opacity-val').textContent = Math.round(l.opacity * 100) + '%';
    $('st-layer-blend').value = l.blend;
    $('st-layer-del').disabled = S.doc.layers.length <= 1;
    $('st-layer-merge').disabled = S.doc.li === 0;
    $('st-layer-clip').disabled = S.doc.li === 0;
    $('st-layer-alpha').classList.toggle('on', !!l.alphaLock);
    $('st-layer-lock').classList.toggle('on', !!l.locked);
    $('st-layer-lock').innerHTML = '<i class="' + (l.locked ? 'ri-lock-line' : 'ri-lock-unlock-line') + '"></i>';
    $('st-layer-clip').classList.toggle('on', !!l.clip);
    $('st-layer-fx').classList.toggle('on', !!(l.fx && (l.fx.stroke || l.fx.shadow || l.fx.glow)));
};

ST.reorderLayer = function (from, to) {
    const d = S.doc;
    if (!d || from === to) return;
    const l = d.layers[from];
    const apply = (a, b) => { const x = d.layers.splice(a, 1)[0]; d.layers.splice(b, 0, x); };
    apply(from, to);
    d.li = to;
    ST.pushHistory('Reorder layers', () => apply(to, from), () => apply(from, to));
    ST.afterChange();
};

ST.renderFrames = function () {
    const strip = $('st-frame-strip');
    if (!strip) return;
    strip.innerHTML = '';
    if (!S.doc) return;
    const d = S.doc;
    for (let i = 0; i < d.frames; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'st-frame' + (i === d.fi ? ' active' : '');
        b.title = 'Frame ' + (i + 1) + ' — ' + (d.delays[i] || Math.round(1000 / d.fps)) + 'ms';
        const t = ST.mkCanvas(30, 30);
        const tx = t.getContext('2d');
        const k = Math.min(30 / d.w, 30 / d.h);
        tx.imageSmoothingEnabled = d.w > 30;
        d.layers.forEach(l => {
            if (!l.visible) return;
            tx.globalAlpha = l.opacity;
            tx.drawImage(l.cels[i], 0, 0, Math.max(1, d.w * k), Math.max(1, d.h * k));
        });
        b.appendChild(t);
        const n = document.createElement('span');
        n.className = 'st-frame-n';
        n.textContent = i + 1;
        b.appendChild(n);
        if (d.frames > 1) {
            const x = document.createElement('span');
            x.className = 'st-frame-del';
            x.textContent = '×';
            x.title = 'Delete frame';
            x.addEventListener('click', e => { e.stopPropagation(); ST.delFrame(i); });
            b.appendChild(x);
        }
        b.addEventListener('click', () => { d.fi = i; ST.renderFrames(); ST.renderLayers(); ST.composite(); });
        strip.appendChild(b);
    }
};

ST.syncHistory = function () {
    const box = $('st-hist-list');
    if (!box) return;
    const d = S.doc;
    $('st-undo').disabled = !d || !d.history.length;
    $('st-redo').disabled = !d || !d.future.length;
    if (!d) { box.innerHTML = '<div class="st-list-empty">Nothing yet.</div>'; return; }
    const rows = [];
    rows.push({ label: 'Opened', at: 0, future: false });
    d.history.forEach((e, i) => rows.push({ label: e.label, at: i + 1, future: false }));
    d.future.slice().reverse().forEach((e, i) => rows.push({ label: e.label, at: d.history.length + i + 1, future: true }));
    box.innerHTML = '';
    rows.forEach(r => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'st-hist' + (r.future ? ' future' : '') + (r.at === d.history.length ? ' current' : '');
        b.innerHTML = '<i class="ri-arrow-right-s-line"></i><span>' + esc(r.label) + '</span>';
        b.addEventListener('click', () => ST.jumpHistory(r.at));
        box.appendChild(b);
    });
    box.scrollTop = box.scrollHeight;
};

/* ---------------------------------------------------- colour + palettes -- */

let pickerHue = 0, pickerSat = 1, pickerVal = 1, pickerLock = false;

function drawPicker() {
    const sv = $('st-sv'), hue = $('st-hue');
    if (!sv) return;
    const sc = sv.getContext('2d');
    const w = sv.width, h = sv.height;
    const base = ST.hsvToRgb(pickerHue, 1, 1);
    sc.fillStyle = 'rgb(' + base.map(Math.round).join(',') + ')';
    sc.fillRect(0, 0, w, h);
    let g = sc.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    sc.fillStyle = g; sc.fillRect(0, 0, w, h);
    g = sc.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    sc.fillStyle = g; sc.fillRect(0, 0, w, h);
    const px = pickerSat * w, py = (1 - pickerVal) * h;
    sc.strokeStyle = pickerVal > 0.6 && pickerSat < 0.6 ? '#000' : '#fff';
    sc.lineWidth = 1.5;
    sc.beginPath(); sc.arc(px, py, 5, 0, Math.PI * 2); sc.stroke();

    const hc = hue.getContext('2d');
    const hg = hc.createLinearGradient(0, 0, 0, hue.height);
    for (let i = 0; i <= 6; i++) {
        const c = ST.hsvToRgb(i * 60, 1, 1);
        hg.addColorStop(i / 6, 'rgb(' + c.map(Math.round).join(',') + ')');
    }
    hc.fillStyle = hg;
    hc.fillRect(0, 0, hue.width, hue.height);
    const hy = (pickerHue / 360) * hue.height;
    hc.fillStyle = '#fff';
    hc.fillRect(0, clamp(hy - 1, 0, hue.height - 2), hue.width, 2);
}

function pickerToColour() {
    const rgb = ST.hsvToRgb(pickerHue, pickerSat, pickerVal);
    ST.setFg(ST.rgbToHex(rgb[0], rgb[1], rgb[2]), true);
}

ST.setFg = function (hex, fromPicker) {
    if (S.paletteSnap) {
        const pal = ST.currentPalette();
        if (pal.length) {
            const rgb = ST.hexToRgb(hex);
            const i = ST.nearestIndex(pal.map(ST.hexToRgb), rgb[0], rgb[1], rgb[2]);
            hex = pal[i];
        }
    }
    S.fg = hex;
    ['st-fg', 'st-fg2'].forEach(id => { if ($(id)) $(id).value = hex; });
    if ($('st-hex')) $('st-hex').value = hex;
    S.recent = [hex].concat(S.recent.filter(c => c.toLowerCase() !== hex.toLowerCase())).slice(0, 18);
    if (!fromPicker && !pickerLock) {
        const rgb = ST.hexToRgb(hex);
        const hsv = ST.rgbToHsv(rgb[0], rgb[1], rgb[2]);
        if (hsv[1] > 0.02) pickerHue = hsv[0];
        pickerSat = hsv[1];
        pickerVal = hsv[2];
    }
    drawPicker();
    ST.renderSwatches();
    ST.savePrefs();
};

ST.setBg = function (hex) {
    S.bg = hex;
    ['st-bg', 'st-bg2'].forEach(id => { if ($(id)) $(id).value = hex; });
    ST.savePrefs();
};

ST.currentPalette = function () {
    const p = ST.PALETTES[S.palette];
    return p ? p.colours : ST.PALETTES.default.colours;
};

ST.renderSwatches = function () {
    const build = (box, list) => {
        if (!box) return;
        box.innerHTML = '';
        list.forEach(c => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'st-swatch' + (c.toLowerCase() === S.fg.toLowerCase() ? ' active' : '');
            b.style.background = c;
            b.title = c + '  (right-click sets the background)';
            b.addEventListener('click', () => ST.setFg(c));
            b.addEventListener('contextmenu', e => { e.preventDefault(); ST.setBg(c); });
            box.appendChild(b);
        });
    };
    build($('st-swatches'), ST.currentPalette());
    build($('st-recent'), S.recent);
};

ST.extractPalette = function (n) {
    if (!S.doc) return;
    const flat = ST.flattenToCanvas(S.doc, S.doc.fi);
    const img = ST.ctx2d(flat).getImageData(0, 0, S.doc.w, S.doc.h);
    const pal = ST.medianCut(img.data, clamp(n, 2, 64));
    ST.PALETTES.extracted = { name: 'From artwork', colours: pal.map(c => ST.rgbToHex(c[0], c[1], c[2])) };
    S.palette = 'extracted';
    ST.renderPaletteSelect();
    ST.renderSwatches();
    ST.note(pal.length + ' colours pulled from the artwork.', 'ri-palette-line');
};

ST.renderPaletteSelect = function () {
    const sel = $('st-pal-select');
    if (!sel) return;
    sel.innerHTML = Object.keys(ST.PALETTES)
        .map(k => '<option value="' + k + '">' + esc(ST.PALETTES[k].name) + ' · ' + ST.PALETTES[k].colours.length + '</option>')
        .join('');
    sel.value = S.palette;
};

ST.initPicker = function () {
    const sv = $('st-sv'), hue = $('st-hue');
    if (!sv) return;
    let dragging = null;
    const svPick = e => {
        const r = sv.getBoundingClientRect();
        pickerSat = clamp((e.clientX - r.left) / r.width, 0, 1);
        pickerVal = clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
        pickerLock = true;
        pickerToColour();
        pickerLock = false;
    };
    const huePick = e => {
        const r = hue.getBoundingClientRect();
        pickerHue = clamp((e.clientY - r.top) / r.height, 0, 1) * 360;
        pickerLock = true;
        pickerToColour();
        pickerLock = false;
    };
    sv.addEventListener('pointerdown', e => { dragging = svPick; try { sv.setPointerCapture(e.pointerId); } catch (err) {} svPick(e); e.preventDefault(); });
    hue.addEventListener('pointerdown', e => { dragging = huePick; try { hue.setPointerCapture(e.pointerId); } catch (err) {} huePick(e); e.preventDefault(); });
    window.addEventListener('pointermove', e => { if (dragging) dragging(e); });
    window.addEventListener('pointerup', () => { dragging = null; });
    drawPicker();
};

/* ------------------------------------------------------- layer commands -- */

ST.addLayer = function () {
    const d = S.doc;
    if (!d) return;
    const l = ST.makeLayer(d, 'Layer ' + (d.layers.length + 1));
    const at = d.li + 1;
    d.layers.splice(at, 0, l);
    d.li = at;
    ST.pushHistory('New layer',
        () => d.layers.splice(d.layers.indexOf(l), 1),
        () => d.layers.splice(at, 0, l));
    ST.afterChange();
};

ST.duplicateLayer = function () {
    const d = S.doc, src = ST.activeLayer();
    if (!src) return;
    const l = {
        id: ST.uid(), name: src.name + ' copy', visible: true,
        opacity: src.opacity, blend: src.blend, locked: false,
        alphaLock: src.alphaLock, clip: src.clip,
        fx: src.fx ? Object.assign({}, src.fx) : null,
        cels: src.cels.map(ST.copyCanvas),
    };
    const at = d.li + 1;
    d.layers.splice(at, 0, l);
    d.li = at;
    ST.pushHistory('Duplicate layer',
        () => d.layers.splice(d.layers.indexOf(l), 1),
        () => d.layers.splice(at, 0, l));
    ST.afterChange();
};

ST.deleteLayer = function () {
    const d = S.doc;
    if (!d || d.layers.length <= 1) return;
    const at = d.li, l = d.layers[at];
    d.layers.splice(at, 1);
    ST.pushHistory('Delete layer',
        () => d.layers.splice(at, 0, l),
        () => d.layers.splice(d.layers.indexOf(l), 1));
    ST.afterChange();
};

ST.moveLayer = function (dir) {
    const d = S.doc;
    if (!d) return;
    const at = d.li, to = at + dir;
    if (to < 0 || to >= d.layers.length) return;
    ST.reorderLayer(at, to);
};

ST.mergeDown = function () {
    const d = S.doc;
    if (!d || d.li === 0) return;
    const at = d.li;
    const top = d.layers[at], below = d.layers[at - 1];
    const beforeCels = below.cels.map(ST.copyCanvas);
    const doMerge = () => {
        for (let f = 0; f < d.frames; f++) {
            const c = ST.ctx2d(below.cels[f]);
            c.save();
            c.globalAlpha = top.opacity;
            c.globalCompositeOperation = top.blend;
            if (top.visible) c.drawImage(top.cels[f], 0, 0);
            c.restore();
        }
    };
    doMerge();
    d.layers.splice(at, 1);
    d.li = at - 1;
    ST.pushHistory('Merge down',
        () => { below.cels = beforeCels.map(ST.copyCanvas); d.layers.splice(at, 0, top); },
        () => { below.cels = beforeCels.map(ST.copyCanvas); doMerge(); d.layers.splice(d.layers.indexOf(top), 1); });
    ST.afterChange();
};

ST.flatten = function () {
    const d = S.doc;
    if (!d || d.layers.length < 2) return;
    const before = d.layers;
    const flat = ST.makeLayer(d, 'Flattened');
    for (let f = 0; f < d.frames; f++) {
        const merged = ST.flattenToCanvas(d, f);
        ST.ctx2d(flat.cels[f]).drawImage(merged, 0, 0);
    }
    d.layers = [flat];
    d.li = 0;
    ST.pushHistory('Flatten', () => { d.layers = before; }, () => { d.layers = [flat]; });
    ST.afterChange();
};

/* ------------------------------------------------------------- frames -- */

ST.addFrame = function (duplicate) {
    const d = S.doc;
    if (!d) return;
    const at = d.fi + 1;
    const made = d.layers.map(l => (duplicate ? ST.copyCanvas(l.cels[d.fi]) : ST.mkCanvas(d.w, d.h)));
    d.layers.forEach((l, i) => l.cels.splice(at, 0, made[i]));
    d.delays.splice(at, 0, d.delays[d.fi] || Math.round(1000 / d.fps));
    d.frames++;
    d.fi = at;
    ST.pushHistory(duplicate ? 'Duplicate frame' : 'Add frame',
        () => { d.layers.forEach(l => l.cels.splice(at, 1)); d.delays.splice(at, 1); d.frames--; },
        () => { d.layers.forEach((l, i) => l.cels.splice(at, 0, made[i])); d.delays.splice(at, 0, 100); d.frames++; });
    ST.afterChange();
};

ST.delFrame = function (i) {
    const d = S.doc;
    if (!d || d.frames <= 1) return;
    const removed = d.layers.map(l => l.cels[i]);
    const delay = d.delays[i];
    d.layers.forEach(l => l.cels.splice(i, 1));
    d.delays.splice(i, 1);
    d.frames--;
    if (d.fi >= d.frames) d.fi = d.frames - 1;
    ST.pushHistory('Delete frame',
        () => { d.layers.forEach((l, n) => l.cels.splice(i, 0, removed[n])); d.delays.splice(i, 0, delay); d.frames++; },
        () => { d.layers.forEach(l => l.cels.splice(i, 1)); d.delays.splice(i, 1); d.frames--; });
    ST.afterChange();
};

ST.togglePlay = function () {
    const btn = $('st-play');
    if (S.playing) {
        clearInterval(S.playing);
        S.playing = null;
        btn.classList.remove('on');
        btn.innerHTML = '<i class="ri-play-fill"></i>';
        return;
    }
    if (!S.doc || S.doc.frames < 2) { ST.note('Add a second frame first.', 'ri-film-line'); return; }
    btn.classList.add('on');
    btn.innerHTML = '<i class="ri-pause-fill"></i>';
    const tick = () => {
        if (!S.doc) return;
        S.doc.fi = (S.doc.fi + 1) % S.doc.frames;
        ST.renderFrames();
        ST.composite();
    };
    S.playing = setInterval(tick, Math.round(1000 / clamp(S.doc.fps, 1, 60)));
};

})();
