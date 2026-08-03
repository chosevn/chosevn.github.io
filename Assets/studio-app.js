/* ============================================================================
   Chosevn Studio — documents, dialogs, export, storage, keyboard, boot.
   ==========================================================================*/
(function () {
'use strict';

const ST = window.__ST;
const S = ST.S, B = ST.B, $ = ST.$, clamp = ST.clamp, esc = ST.esc;

const STORE_INDEX = 'chosevn_studio_index';
const STORE_DOC = 'chosevn_studio_doc_';
const STORE_PREFS = 'chosevn_studio_prefs';
const SAVE_BUDGET = 3.2 * 1024 * 1024;

/* ---------------------------------------------------------- documents -- */

ST.openDoc = function (doc, silent) {
    S.doc = doc;
    if (!doc.history) doc.history = [];
    if (!doc.future) doc.future = [];
    if (!doc.delays) doc.delays = new Array(doc.frames).fill(Math.round(1000 / doc.fps));
    ST.resizeScratch(doc.w, doc.h);
    ST.selNone();
    S.cropRect = null;
    $('st-root').classList.add('has-doc');
    $('st-doc-name').textContent = doc.name;
    $('st-doc-dims').textContent = doc.w + ' × ' + doc.h;
    $('st-fps').value = doc.fps;
    ST.zoomToFit();
    ST.renderDocs(); ST.renderLayers(); ST.renderFrames();
    ST.composite(); ST.syncHistory(); ST.updateSelInfo(); ST.syncSaveState();
    if (!silent) ST.markDirty();
};

ST.newDoc = function (w, h, name) {
    const doc = ST.makeDoc(w, h, name);
    S.docs.unshift(doc);
    ST.openDoc(doc);
    ST.note('New ' + doc.w + '×' + doc.h + ' project.', 'ri-add-line');
    return doc;
};

ST.closeDoc = function (doc) {
    const i = S.docs.indexOf(doc);
    if (i < 0) return;
    if (doc.dirty && !confirm('Close "' + doc.name + '"? Anything unexported is lost.')) return;
    S.docs.splice(i, 1);
    try { localStorage.removeItem(STORE_DOC + doc.id); } catch (e) {}
    if (S.doc === doc) {
        if (S.docs.length) ST.openDoc(S.docs[0], true);
        else {
            S.doc = null;
            $('st-root').classList.remove('has-doc');
            $('st-doc-name').textContent = 'Studio';
            $('st-doc-dims').textContent = '';
            ST.renderLayers(); ST.renderFrames(); ST.syncHistory();
        }
    }
    ST.renderDocs();
    ST.saveIndex();
};

ST.syncSaveState = function () {
    const el = $('st-save-state');
    if (!el || !S.doc) { if (el) el.textContent = ''; return; }
    const st = S.doc.saved;
    el.className = 'st-save-state ' + (st === 'too-big' ? 'warn' : '');
    el.textContent = st === 'too-big' ? 'too large to autosave' : (st === 'saved' ? 'saved on this device' : 'saving…');
};

/* --------------------------------------------------------------- sheets -- */

ST.openSheet = function (title, html, wire, wide) {
    $('st-sheet-title').textContent = title;
    $('st-sheet-body').innerHTML = html;
    $('st-sheet-card').classList.toggle('wide', !!wide);
    $('st-sheet').classList.add('show');
    if (wire) wire($('st-sheet-body'));
};
ST.closeSheet = function () {
    $('st-sheet').classList.remove('show');
    $('st-sheet-body').innerHTML = '';
};

function field(label, inner, note) {
    return '<div class="st-field"><label>' + esc(label) + '</label>' + inner +
        (note ? '<div class="st-sheet-note">' + note + '</div>' : '') + '</div>';
}
function opGrid(ops) {
    return '<div class="st-op-grid">' + ops.map(o =>
        '<button class="st-btn" data-op="' + o[0] + '"><i class="' + o[1] + '"></i>' + esc(o[2]) + '</button>').join('') + '</div>';
}
function wireOps(body, handlers, closeAfter) {
    body.querySelectorAll('[data-op]').forEach(b => b.addEventListener('click', () => {
        const fn = handlers[b.dataset.op];
        if (fn) fn();
        if (closeAfter !== false) ST.closeSheet();
    }));
}

ST.sheetNew = function () {
    ST.openSheet('New project',
        field('Presets', '<div class="st-preset-grid">' + ST.PRESETS.map((p, i) =>
            '<button class="st-preset" type="button" data-i="' + i + '">' +
            '<span class="st-preset-name">' + esc(p.name) + '</span>' +
            '<span class="st-preset-dim">' + p.w + ' × ' + p.h + '</span></button>').join('') + '</div>') +
        field('Name', '<input type="text" id="st-new-name" value="Untitled" maxlength="60">') +
        field('Size', '<div class="st-field-row"><input type="number" id="st-new-w" min="1" max="' + ST.MAX_DIM + '" value="64">' +
            '<span class="st-lbl">×</span><input type="number" id="st-new-h" min="1" max="' + ST.MAX_DIM + '" value="64"></div>',
            'Anything from a 16px icon up to ' + ST.MAX_DIM + 'px a side.') +
        field('Background', '<div class="st-field-row">' +
            '<button class="st-toggle on" id="st-new-bg-none" type="button"><i class="ri-checkbox-blank-line"></i>Transparent</button>' +
            '<button class="st-toggle" id="st-new-bg-fill" type="button"><i class="ri-paint-fill"></i>Background colour</button></div>') +
        '<div class="st-sheet-actions"><button class="st-btn" id="st-new-cancel" type="button">Cancel</button>' +
        '<button class="st-btn st-btn-accent" id="st-new-go" type="button"><i class="ri-add-line"></i>Create</button></div>',
        body => {
            let filled = false;
            body.querySelectorAll('.st-preset').forEach(b => b.addEventListener('click', () => {
                const p = ST.PRESETS[+b.dataset.i];
                $('st-new-w').value = p.w;
                $('st-new-h').value = p.h;
                if ($('st-new-name').value === 'Untitled') $('st-new-name').value = p.name;
            }));
            $('st-new-bg-none').addEventListener('click', () => {
                filled = false;
                $('st-new-bg-none').classList.add('on');
                $('st-new-bg-fill').classList.remove('on');
            });
            $('st-new-bg-fill').addEventListener('click', () => {
                filled = true;
                $('st-new-bg-fill').classList.add('on');
                $('st-new-bg-none').classList.remove('on');
            });
            $('st-new-cancel').addEventListener('click', ST.closeSheet);
            $('st-new-go').addEventListener('click', () => {
                const w = clamp(parseInt($('st-new-w').value, 10) || 64, 1, ST.MAX_DIM);
                const h = clamp(parseInt($('st-new-h').value, 10) || 64, 1, ST.MAX_DIM);
                const doc = ST.newDoc(w, h, ($('st-new-name').value || 'Untitled').slice(0, 60));
                if (filled) {
                    const c = ST.ctx2d(doc.layers[0].cels[0]);
                    c.fillStyle = S.bg;
                    c.fillRect(0, 0, w, h);
                    ST.composite();
                    ST.renderLayers();
                }
                ST.closeSheet();
            });
        });
};

ST.sheetSelect = function () {
    ST.openSheet('Selection',
        opGrid([
            ['all', 'ri-checkbox-multiple-line', 'Select all'],
            ['none', 'ri-checkbox-blank-line', 'Deselect'],
            ['invert', 'ri-contrast-2-line', 'Invert'],
            ['grow', 'ri-add-circle-line', 'Grow 1px'],
            ['shrink', 'ri-indeterminate-circle-line', 'Shrink 1px'],
            ['feather', 'ri-blur-off-line', 'Feather 2px'],
            ['opaque', 'ri-shape-line', 'Select the artwork'],
            ['copy', 'ri-file-copy-line', 'Copy'],
            ['cut', 'ri-scissors-cut-line', 'Cut'],
            ['paste', 'ri-clipboard-line', 'Paste'],
            ['pastelayer', 'ri-stack-line', 'Paste as layer'],
            ['fillfg', 'ri-paint-fill', 'Fill with foreground'],
            ['fillbg', 'ri-paint-brush-line', 'Fill with background'],
            ['clear', 'ri-eraser-line', 'Clear'],
            ['crop', 'ri-crop-line', 'Crop to selection'],
        ]),
        body => wireOps(body, {
            all: ST.selAll, none: ST.selNone, invert: ST.selInvert,
            grow: () => ST.growMask(1), shrink: () => ST.growMask(-1),
            feather: () => { if (S.sel) ST.selSet(ST.featherMask(S.sel.mask, 2), 'new'); },
            opaque: () => {
                const cel = ST.activeCel();
                if (!cel) return;
                const m = ST.mkCanvas(S.doc.w, S.doc.h);
                m.getContext('2d').drawImage(cel, 0, 0);
                ST.selSet(m, 'new');
            },
            copy: () => ST.copySelection(false),
            cut: () => ST.copySelection(true),
            paste: () => ST.pasteClipboard(false),
            pastelayer: () => ST.pasteClipboard(true),
            fillfg: () => ST.fillSelection(S.fg),
            fillbg: () => ST.fillSelection(S.bg),
            clear: ST.clearSelection,
            crop: ST.cropToSelection,
        }));
};

ST.sheetTransform = function () {
    const d = S.doc;
    if (!d) return;
    ST.openSheet('Transform',
        field('Rotate, flip and tidy', opGrid([
            ['rot90', 'ri-clockwise-line', 'Rotate 90°'],
            ['rot270', 'ri-anticlockwise-line', 'Rotate −90°'],
            ['rot180', 'ri-refresh-line', 'Rotate 180°'],
            ['flipH', 'ri-flip-horizontal-line', 'Flip across'],
            ['flipV', 'ri-flip-vertical-line', 'Flip down'],
            ['crop', 'ri-crop-line', 'Crop to selection'],
            ['trim', 'ri-scissors-cut-line', 'Trim empty edges'],
            ['flatten', 'ri-stack-line', 'Flatten layers'],
        ])) +
        field('Scale the artwork',
            '<div class="st-field-row"><input type="number" id="st-sc-w" min="1" max="' + ST.MAX_DIM + '" value="' + d.w + '">' +
            '<span class="st-lbl">×</span><input type="number" id="st-sc-h" min="1" max="' + ST.MAX_DIM + '" value="' + d.h + '">' +
            '<button class="st-toggle on" id="st-sc-lock" type="button" title="Keep proportions"><i class="ri-link"></i></button></div>' +
            '<div class="st-field-row" style="margin-top:8px">' +
            '<button class="st-toggle" id="st-sc-smooth" type="button"><i class="ri-blur-off-line"></i>Smooth</button>' +
            '<span class="st-lbl">or</span>' +
            '<button class="st-btn" data-mult="2">×2</button><button class="st-btn" data-mult="4">×4</button>' +
            '<button class="st-btn" data-mult="0.5">÷2</button>' +
            '<button class="st-btn st-btn-accent" id="st-sc-go" type="button">Scale</button></div>',
            'Leave Smooth off to keep pixel art crisp.') +
        field('Canvas size',
            '<div class="st-field-row"><input type="number" id="st-cv-w" min="1" max="' + ST.MAX_DIM + '" value="' + d.w + '">' +
            '<span class="st-lbl">×</span><input type="number" id="st-cv-h" min="1" max="' + ST.MAX_DIM + '" value="' + d.h + '"></div>' +
            '<div class="st-field-row" style="margin-top:8px"><div class="st-anchor-grid" id="st-anchor">' +
            [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => '<button class="st-anchor' + (i === 4 ? ' on' : '') + '" data-a="' + i + '" type="button">●</button>').join('') +
            '</div><button class="st-btn st-btn-accent" id="st-cv-go" type="button">Resize canvas</button></div>',
            'Grows or crops the canvas without scaling the artwork.'),
        body => {
            wireOps(body, {
                rot90: () => ST.rotate(90), rot270: () => ST.rotate(270), rot180: () => ST.rotate(180),
                flipH: () => ST.flip(true), flipV: () => ST.flip(false),
                crop: ST.cropToSelection, trim: ST.trimTransparent, flatten: ST.flatten,
            });
            let lock = true;
            const ratio = d.w / d.h;
            $('st-sc-lock').addEventListener('click', function () { lock = !lock; this.classList.toggle('on', lock); });
            $('st-sc-w').addEventListener('input', function () { if (lock) $('st-sc-h').value = Math.max(1, Math.round((parseInt(this.value, 10) || 1) / ratio)); });
            $('st-sc-h').addEventListener('input', function () { if (lock) $('st-sc-w').value = Math.max(1, Math.round((parseInt(this.value, 10) || 1) * ratio)); });
            let smooth = false;
            $('st-sc-smooth').addEventListener('click', function () { smooth = !smooth; this.classList.toggle('on', smooth); });
            body.querySelectorAll('[data-mult]').forEach(b => b.addEventListener('click', () => {
                const k = parseFloat(b.dataset.mult);
                ST.scaleImage(clamp(Math.round(d.w * k), 1, ST.MAX_DIM), clamp(Math.round(d.h * k), 1, ST.MAX_DIM), k < 1);
                ST.closeSheet();
            }));
            $('st-sc-go').addEventListener('click', () => {
                ST.scaleImage(clamp(parseInt($('st-sc-w').value, 10) || d.w, 1, ST.MAX_DIM),
                              clamp(parseInt($('st-sc-h').value, 10) || d.h, 1, ST.MAX_DIM), smooth);
                ST.closeSheet();
            });
            let anchor = 4;
            body.querySelectorAll('.st-anchor').forEach(b => b.addEventListener('click', () => {
                anchor = +b.dataset.a;
                body.querySelectorAll('.st-anchor').forEach(x => x.classList.toggle('on', x === b));
            }));
            $('st-cv-go').addEventListener('click', () => {
                ST.resizeCanvas(clamp(parseInt($('st-cv-w').value, 10) || d.w, 1, ST.MAX_DIM),
                                clamp(parseInt($('st-cv-h').value, 10) || d.h, 1, ST.MAX_DIM), anchor);
                ST.closeSheet();
            });
        });
};

ST.sheetAdjust = function () {
    if (!S.doc) return;
    const rows = [
        ['brightness', 'Brightness', 0, 300, 100],
        ['contrast', 'Contrast', 0, 300, 100],
        ['saturation', 'Saturation', 0, 300, 100],
        ['hue', 'Hue shift', -180, 180, 0],
        ['posterize', 'Posterise', 0, 32, 0],
        ['threshold', 'Threshold', 0, 255, 0],
    ];
    ST.openSheet('Adjust',
        '<div class="st-sheet-note" style="margin:0 0 12px">Applies to the active layer' + (S.sel ? ', inside the selection' : '') + '.</div>' +
        '<div class="st-tabs" id="st-adj-tabs">' +
            '<button class="st-tab on" data-t="basic">Basic</button>' +
            '<button class="st-tab" data-t="levels">Levels</button>' +
            '<button class="st-tab" data-t="curves">Curves</button>' +
            '<button class="st-tab" data-t="colour">Colour</button>' +
            '<button class="st-tab" data-t="filters">Filters</button>' +
        '</div>' +
        '<div class="st-tabpane on" data-t="basic">' +
            rows.map(r => '<div class="st-adj-row"><span class="st-lbl">' + r[1] + '</span>' +
                '<input class="st-range" type="range" id="adj-' + r[0] + '" min="' + r[2] + '" max="' + r[3] + '" value="' + r[4] + '">' +
                '<span class="st-num" id="adjv-' + r[0] + '">' + r[4] + '</span></div>').join('') +
            '<div class="st-adj-row"><span class="st-lbl">Toggles</span>' +
                '<button class="st-toggle" id="adj-grayscale" type="button">Grey</button>' +
                '<button class="st-toggle" id="adj-sepia" type="button">Sepia</button>' +
                '<button class="st-toggle" id="adj-invert" type="button">Invert</button></div>' +
            '<div class="st-sheet-actions"><button class="st-btn st-btn-accent" id="adj-apply" type="button"><i class="ri-check-line"></i>Apply</button></div>' +
        '</div>' +
        '<div class="st-tabpane" data-t="levels">' +
            '<canvas id="st-hist" class="st-hist-canvas" width="260" height="70"></canvas>' +
            '<div class="st-adj-row"><span class="st-lbl">In black</span><input class="st-range" type="range" id="lv-inb" min="0" max="254" value="0"><span class="st-num" id="lvv-inb">0</span></div>' +
            '<div class="st-adj-row"><span class="st-lbl">Gamma</span><input class="st-range" type="range" id="lv-gam" min="10" max="300" value="100"><span class="st-num" id="lvv-gam">1.00</span></div>' +
            '<div class="st-adj-row"><span class="st-lbl">In white</span><input class="st-range" type="range" id="lv-inw" min="1" max="255" value="255"><span class="st-num" id="lvv-inw">255</span></div>' +
            '<div class="st-adj-row"><span class="st-lbl">Out black</span><input class="st-range" type="range" id="lv-outb" min="0" max="255" value="0"><span class="st-num" id="lvv-outb">0</span></div>' +
            '<div class="st-adj-row"><span class="st-lbl">Out white</span><input class="st-range" type="range" id="lv-outw" min="0" max="255" value="255"><span class="st-num" id="lvv-outw">255</span></div>' +
            '<div class="st-sheet-actions"><button class="st-btn" id="lv-auto" type="button"><i class="ri-magic-line"></i>Auto</button>' +
            '<button class="st-btn st-btn-accent" id="lv-apply" type="button"><i class="ri-check-line"></i>Apply</button></div>' +
        '</div>' +
        '<div class="st-tabpane" data-t="curves">' +
            '<div class="st-curve-wrap"><canvas id="st-curve" width="220" height="220"></canvas></div>' +
            '<div class="st-sheet-note">Click to add a point, drag to shape it, right-click a point to remove it.</div>' +
            '<div class="st-sheet-actions"><button class="st-btn" id="cv-reset" type="button"><i class="ri-refresh-line"></i>Reset</button>' +
            '<button class="st-btn st-btn-accent" id="cv-apply" type="button"><i class="ri-check-line"></i>Apply</button></div>' +
        '</div>' +
        '<div class="st-tabpane" data-t="colour">' +
            field('Gradient map', '<div class="st-field-row">' +
                '<input type="color" id="gm-a" value="#1a1c2c" class="st-color-input">' +
                '<input type="color" id="gm-b" value="#f4f4f4" class="st-color-input">' +
                '<button class="st-btn st-btn-accent" id="gm-go" type="button">Map</button></div>',
                'Recolours by brightness — dark pixels take the first colour.') +
            field('Reduce colours', '<div class="st-field-row">' +
                '<input type="number" id="qz-n" min="2" max="256" value="16">' +
                '<select id="qz-mode" class="st-select"><option value="none">No dither</option>' +
                '<option value="ordered">Ordered</option><option value="diffuse">Diffused</option></select>' +
                '<button class="st-toggle" id="qz-pal" type="button" title="Use the active palette instead"><i class="ri-gradienter-line"></i>Palette</button>' +
                '<button class="st-btn st-btn-accent" id="qz-go" type="button">Reduce</button></div>',
                'Median-cut quantisation — the same engine the GIF writer uses.') +
        '</div>' +
        '<div class="st-tabpane" data-t="filters">' +
            field('Blur / sharpen', '<div class="st-field-row"><input type="number" id="fx-blur" min="0" max="100" value="2">' +
                '<button class="st-btn" id="fx-blur-go" type="button">Blur</button>' +
                '<input type="number" id="fx-sharp" min="1" max="100" value="60">' +
                '<button class="st-btn" id="fx-sharp-go" type="button">Sharpen</button></div>') +
            field('Pixelate', '<div class="st-field-row"><input type="number" id="fx-pix" min="2" max="256" value="8">' +
                '<button class="st-btn" id="fx-pix-go" type="button">Pixelate</button></div>') +
            field('Noise', '<div class="st-field-row"><input type="number" id="fx-noise" min="1" max="100" value="20">' +
                '<button class="st-toggle on" id="fx-noise-mono" type="button">Grey</button>' +
                '<button class="st-btn" id="fx-noise-go" type="button">Add noise</button></div>') +
            field('Outline the artwork', '<div class="st-field-row"><input type="color" id="fx-out-c" value="#000000" class="st-color-input">' +
                '<input type="number" id="fx-out-w" min="1" max="40" value="1">' +
                '<button class="st-toggle" id="fx-out-in" type="button">Inside</button>' +
                '<button class="st-btn" id="fx-out-go" type="button">Outline</button></div>') +
        '</div>',
        body => {
            body.querySelectorAll('.st-tab').forEach(t => t.addEventListener('click', () => {
                body.querySelectorAll('.st-tab').forEach(x => x.classList.toggle('on', x === t));
                body.querySelectorAll('.st-tabpane').forEach(p => p.classList.toggle('on', p.dataset.t === t.dataset.t));
                if (t.dataset.t === 'levels') drawHist();
                if (t.dataset.t === 'curves') drawCurve();
            }));

            rows.forEach(r => {
                const el = $('adj-' + r[0]);
                el.addEventListener('input', () => { $('adjv-' + r[0]).textContent = el.value; });
            });
            ['grayscale', 'sepia', 'invert'].forEach(k =>
                $('adj-' + k).addEventListener('click', function () { this.classList.toggle('on'); }));
            $('adj-apply').addEventListener('click', () => {
                ST.editCel('Adjust', cel => ST.adjustPixels(cel, {
                    brightness: +$('adj-brightness').value, contrast: +$('adj-contrast').value,
                    saturation: +$('adj-saturation').value, hue: +$('adj-hue').value,
                    posterize: +$('adj-posterize').value, threshold: +$('adj-threshold').value,
                    grayscale: $('adj-grayscale').classList.contains('on'),
                    sepia: $('adj-sepia').classList.contains('on'),
                    invert: $('adj-invert').classList.contains('on'),
                }));
                ST.closeSheet();
            });

            function drawHist() {
                const cv = $('st-hist');
                if (!cv || !ST.activeCel()) return;
                const h = ST.histogram(ST.activeCel());
                const c = cv.getContext('2d');
                c.clearRect(0, 0, cv.width, cv.height);
                let max = 1;
                for (let i = 1; i < 255; i++) max = Math.max(max, h[i]);
                c.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--dim').trim() || '#888';
                for (let i = 0; i < 256; i++) {
                    const v = Math.pow(h[i] / max, 0.45) * cv.height;
                    c.fillRect((i / 256) * cv.width, cv.height - v, cv.width / 256 + 0.5, v);
                }
            }
            const lv = { inb: 0, gam: 100, inw: 255, outb: 0, outw: 255 };
            Object.keys(lv).forEach(k => {
                const el = $('lv-' + k);
                el.addEventListener('input', () => {
                    lv[k] = +el.value;
                    $('lvv-' + k).textContent = k === 'gam' ? (lv.gam / 100).toFixed(2) : lv[k];
                });
            });
            $('lv-auto').addEventListener('click', () => {
                const h = ST.histogram(ST.activeCel());
                let lo = 0, hi = 255;
                while (lo < 255 && !h[lo]) lo++;
                while (hi > 0 && !h[hi]) hi--;
                $('lv-inb').value = lo; $('lvv-inb').textContent = lo; lv.inb = lo;
                $('lv-inw').value = hi; $('lvv-inw').textContent = hi; lv.inw = hi;
            });
            $('lv-apply').addEventListener('click', () => {
                ST.editCel('Levels', cel => ST.applyLevels(cel, {
                    inBlack: lv.inb, inWhite: lv.inw, gamma: lv.gam / 100,
                    outBlack: lv.outb, outWhite: lv.outw,
                }));
                ST.closeSheet();
            });

            let pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
            let dragPt = null;
            function drawCurve() {
                const cv = $('st-curve');
                if (!cv) return;
                const c = cv.getContext('2d');
                const w = cv.width, h = cv.height;
                c.clearRect(0, 0, w, h);
                const style = getComputedStyle(document.documentElement);
                c.strokeStyle = style.getPropertyValue('--border-2').trim() || '#333';
                c.lineWidth = 1;
                for (let i = 1; i < 4; i++) {
                    c.beginPath(); c.moveTo((w / 4) * i, 0); c.lineTo((w / 4) * i, h); c.stroke();
                    c.beginPath(); c.moveTo(0, (h / 4) * i); c.lineTo(w, (h / 4) * i); c.stroke();
                }
                const lut = ST.buildLut(pts);
                c.strokeStyle = style.getPropertyValue('--accent').trim() || '#f33';
                c.lineWidth = 1.6;
                c.beginPath();
                for (let i = 0; i < 256; i++) {
                    const x = (i / 255) * w, y = h - (lut[i] / 255) * h;
                    i ? c.lineTo(x, y) : c.moveTo(x, y);
                }
                c.stroke();
                c.fillStyle = style.getPropertyValue('--white').trim() || '#fff';
                pts.forEach(p => {
                    c.beginPath();
                    c.arc(p.x * w, h - p.y * h, 4, 0, Math.PI * 2);
                    c.fill();
                });
            }
            const curve = $('st-curve');
            if (curve) {
                const toPt = e => {
                    const r = curve.getBoundingClientRect();
                    return { x: clamp((e.clientX - r.left) / r.width, 0, 1), y: clamp(1 - (e.clientY - r.top) / r.height, 0, 1) };
                };
                curve.addEventListener('pointerdown', e => {
                    const p = toPt(e);
                    let near = null, nd = 0.06;
                    pts.forEach(q => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < nd) { nd = d; near = q; } });
                    if (e.button === 2) {
                        if (near && pts.length > 2) { pts = pts.filter(q => q !== near); drawCurve(); }
                        return;
                    }
                    if (!near) { near = p; pts.push(p); }
                    dragPt = near;
                    try { curve.setPointerCapture(e.pointerId); } catch (err) {}
                    drawCurve();
                });
                curve.addEventListener('pointermove', e => {
                    if (!dragPt) return;
                    const p = toPt(e);
                    dragPt.x = p.x; dragPt.y = p.y;
                    drawCurve();
                });
                curve.addEventListener('pointerup', () => { dragPt = null; });
                curve.addEventListener('contextmenu', e => e.preventDefault());
                $('cv-reset').addEventListener('click', () => { pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }]; drawCurve(); });
                $('cv-apply').addEventListener('click', () => {
                    const lut = ST.buildLut(pts);
                    const flat = new Uint8ClampedArray(256);
                    for (let i = 0; i < 256; i++) flat[i] = i;
                    ST.editCel('Curves', cel => ST.applyCurves(cel, { rgb: lut, r: flat, g: flat, b: flat }));
                    ST.closeSheet();
                });
            }

            $('gm-go').addEventListener('click', () => {
                ST.editCel('Gradient map', cel => ST.gradientMap(cel, [
                    { t: 0, c: $('gm-a').value }, { t: 1, c: $('gm-b').value },
                ]));
                ST.closeSheet();
            });
            let usePal = false;
            $('qz-pal').addEventListener('click', function () { usePal = !usePal; this.classList.toggle('on', usePal); });
            $('qz-go').addEventListener('click', () => {
                ST.editCel('Reduce colours', cel => ST.quantizeCel(
                    cel, parseInt($('qz-n').value, 10) || 16, $('qz-mode').value, usePal ? ST.currentPalette() : null));
                ST.closeSheet();
            });

            $('fx-blur-go').addEventListener('click', () => { ST.editCel('Blur', cel => ST.blurCel(cel, clamp(+$('fx-blur').value, 0, 100))); ST.closeSheet(); });
            $('fx-sharp-go').addEventListener('click', () => { ST.editCel('Sharpen', cel => ST.sharpenCel(cel, clamp(+$('fx-sharp').value, 1, 100) / 60)); ST.closeSheet(); });
            $('fx-pix-go').addEventListener('click', () => { ST.editCel('Pixelate', cel => ST.pixelateCel(cel, clamp(+$('fx-pix').value, 2, 256))); ST.closeSheet(); });
            $('fx-noise-mono').addEventListener('click', function () { this.classList.toggle('on'); });
            $('fx-noise-go').addEventListener('click', () => {
                ST.editCel('Noise', cel => ST.noiseCel(cel, clamp(+$('fx-noise').value, 1, 100), $('fx-noise-mono').classList.contains('on')));
                ST.closeSheet();
            });
            $('fx-out-in').addEventListener('click', function () { this.classList.toggle('on'); });
            $('fx-out-go').addEventListener('click', () => {
                ST.editCel('Outline', cel => ST.outlineCel(cel, $('fx-out-c').value, clamp(+$('fx-out-w').value, 1, 40), $('fx-out-in').classList.contains('on')));
                ST.closeSheet();
            });
            drawHist();
        }, true);
};

ST.sheetView = function () {
    ST.openSheet('View',
        field('Canvas aids', '<div class="st-field-row">' +
            '<button class="st-toggle' + (S.grid ? ' on' : '') + '" id="vw-grid" type="button"><i class="ri-layout-grid-line"></i>Grid</button>' +
            '<input type="number" id="vw-gridsize" min="1" max="256" value="' + S.gridSize + '" title="Grid size in pixels">' +
            '<button class="st-toggle' + (S.snap ? ' on' : '') + '" id="vw-snap" type="button"><i class="ri-magnet-line"></i>Snap</button>' +
            '<button class="st-toggle' + (S.tile ? ' on' : '') + '" id="vw-tile" type="button"><i class="ri-grid-line"></i>Tile preview</button></div>',
            'Tile preview repeats the canvas around itself so you can check a texture seams cleanly.') +
        field('Reference image', '<div class="st-field-row">' +
            '<button class="st-btn" id="vw-ref-pick" type="button"><i class="ri-image-add-line"></i>Choose</button>' +
            '<button class="st-btn" id="vw-ref-clear" type="button"><i class="ri-close-line"></i>Remove</button>' +
            '<input class="st-range" type="range" id="vw-ref-op" min="0" max="100" value="' + S.refOpacity + '">' +
            '<span class="st-num" id="vw-ref-opv">' + S.refOpacity + '%</span></div>' +
            '<div class="st-field-row" style="margin-top:8px">' +
            '<button class="st-toggle' + (S.refBelow ? ' on' : '') + '" id="vw-ref-below" type="button"><i class="ri-align-bottom"></i>Behind the artwork</button></div>',
            'Sits on the canvas as a guide. It is never drawn into the artwork or exported.') +
        field('Zoom', '<div class="st-field-row">' +
            [25, 50, 100, 200, 400, 800, 1600].map(z => '<button class="st-btn" data-zoom="' + z + '">' + z + '%</button>').join('') + '</div>'),
        body => {
            const flag = (id, key, after) => $(id).addEventListener('click', function () {
                S[key] = !S[key];
                this.classList.toggle('on', S[key]);
                if (after) after();
            });
            flag('vw-grid', 'grid', () => { ST.applyZoom(); ST.syncPinned(); });
            flag('vw-snap', 'snap', ST.syncPinned);
            flag('vw-tile', 'tile', () => { ST.applyZoom(); ST.composite(); });
            $('vw-gridsize').addEventListener('input', function () {
                S.gridSize = clamp(parseInt(this.value, 10) || 8, 1, 256);
                ST.applyZoom();
            });
            $('vw-ref-pick').addEventListener('click', () => $('st-ref-file').click());
            $('vw-ref-clear').addEventListener('click', () => {
                const r = $('st-ref');
                r.removeAttribute('src');
                r.style.display = 'none';
            });
            $('vw-ref-op').addEventListener('input', function () {
                S.refOpacity = +this.value;
                $('vw-ref-opv').textContent = S.refOpacity + '%';
                $('st-ref').style.opacity = S.refOpacity / 100;
            });
            $('vw-ref-below').addEventListener('click', function () {
                S.refBelow = !S.refBelow;
                this.classList.toggle('on', S.refBelow);
                $('st-ref').style.zIndex = S.refBelow ? 0 : 4;
            });
            body.querySelectorAll('[data-zoom]').forEach(b => b.addEventListener('click', () => {
                ST.setZoom(parseInt(b.dataset.zoom, 10) / 100);
                ST.closeSheet();
            }));
        });
};

ST.sheetFx = function () {
    const l = ST.activeLayer();
    if (!l) return;
    const fx = l.fx || {};
    const on = k => (fx[k] ? ' on' : '');
    ST.openSheet('Layer effects',
        '<div class="st-sheet-note" style="margin:0 0 12px">Live and non-destructive — the pixels underneath stay untouched.</div>' +
        field('Outline', '<div class="st-field-row">' +
            '<button class="st-toggle' + on('stroke') + '" id="fxe-stroke" type="button"><i class="ri-checkbox-blank-line"></i>On</button>' +
            '<input type="color" id="fxe-stroke-c" class="st-color-input" value="' + (fx.strokeColour || '#000000') + '">' +
            '<input type="number" id="fxe-stroke-w" min="1" max="40" value="' + (fx.strokeWidth || 1) + '"></div>') +
        field('Drop shadow', '<div class="st-field-row">' +
            '<button class="st-toggle' + on('shadow') + '" id="fxe-shadow" type="button"><i class="ri-checkbox-blank-line"></i>On</button>' +
            '<input type="color" id="fxe-shadow-c" class="st-color-input" value="' + (fx.shadowColour || '#000000') + '">' +
            '<input type="number" id="fxe-shadow-x" value="' + (fx.shadowX || 3) + '" title="X offset">' +
            '<input type="number" id="fxe-shadow-y" value="' + (fx.shadowY || 3) + '" title="Y offset">' +
            '<input type="number" id="fxe-shadow-b" min="0" max="60" value="' + (fx.shadowBlur == null ? 4 : fx.shadowBlur) + '" title="Blur"></div>') +
        field('Glow', '<div class="st-field-row">' +
            '<button class="st-toggle' + on('glow') + '" id="fxe-glow" type="button"><i class="ri-checkbox-blank-line"></i>On</button>' +
            '<input type="color" id="fxe-glow-c" class="st-color-input" value="' + (fx.glowColour || '#ffd24a') + '">' +
            '<input type="number" id="fxe-glow-s" min="1" max="60" value="' + (fx.glowSize || 6) + '" title="Size"></div>') +
        '<div class="st-sheet-actions"><button class="st-btn" id="fxe-clear" type="button">Remove all</button>' +
        '<button class="st-btn st-btn-accent" id="fxe-apply" type="button"><i class="ri-check-line"></i>Apply</button></div>',
        body => {
            ['fxe-stroke', 'fxe-shadow', 'fxe-glow'].forEach(id =>
                $(id).addEventListener('click', function () { this.classList.toggle('on'); }));
            $('fxe-clear').addEventListener('click', () => {
                const before = l.fx;
                l.fx = null;
                ST.pushHistory('Clear effects', () => { l.fx = before; }, () => { l.fx = null; });
                ST.afterChange();
                ST.closeSheet();
            });
            $('fxe-apply').addEventListener('click', () => {
                const before = l.fx;
                const next = {
                    stroke: $('fxe-stroke').classList.contains('on'),
                    strokeColour: $('fxe-stroke-c').value,
                    strokeWidth: clamp(+$('fxe-stroke-w').value, 1, 40),
                    shadow: $('fxe-shadow').classList.contains('on'),
                    shadowColour: $('fxe-shadow-c').value,
                    shadowX: +$('fxe-shadow-x').value, shadowY: +$('fxe-shadow-y').value,
                    shadowBlur: clamp(+$('fxe-shadow-b').value, 0, 60), shadowAlpha: 0.55,
                    glow: $('fxe-glow').classList.contains('on'),
                    glowColour: $('fxe-glow-c').value,
                    glowSize: clamp(+$('fxe-glow-s').value, 1, 60), glowAlpha: 0.6,
                };
                l.fx = next;
                ST.pushHistory('Layer effects', () => { l.fx = before; }, () => { l.fx = next; });
                ST.afterChange();
                ST.closeSheet();
            });
        });
};

ST.sheetPalette = function () {
    ST.openSheet('Palette',
        field('Pull colours out of the artwork', '<div class="st-field-row">' +
            '<input type="number" id="pl-n" min="2" max="64" value="16">' +
            '<button class="st-btn st-btn-accent" id="pl-extract" type="button"><i class="ri-magic-line"></i>Extract</button></div>',
            'Median-cut over the current frame.') +
        field('Snap', '<div class="st-field-row">' +
            '<button class="st-toggle' + (S.paletteSnap ? ' on' : '') + '" id="pl-snap" type="button"><i class="ri-magnet-line"></i>Snap picked colours to the palette</button></div>',
            'Every colour you choose is nudged to the nearest palette entry — handy for staying on-model.') +
        field('Export', '<div class="st-field-row">' +
            '<button class="st-btn" id="pl-copy" type="button"><i class="ri-clipboard-line"></i>Copy as hex list</button>' +
            '<button class="st-btn" id="pl-png" type="button"><i class="ri-image-line"></i>Save as a strip</button></div>'),
        () => {
            $('pl-extract').addEventListener('click', () => {
                ST.extractPalette(parseInt($('pl-n').value, 10) || 16);
                ST.closeSheet();
            });
            $('pl-snap').addEventListener('click', function () {
                S.paletteSnap = !S.paletteSnap;
                this.classList.toggle('on', S.paletteSnap);
                ST.savePrefs();
            });
            $('pl-copy').addEventListener('click', () => {
                const txt = ST.currentPalette().join('\n');
                if (navigator.clipboard) navigator.clipboard.writeText(txt).then(
                    () => ST.note('Palette copied.', 'ri-clipboard-line'),
                    () => ST.note('The browser blocked the clipboard.', 'ri-error-warning-line'));
                ST.closeSheet();
            });
            $('pl-png').addEventListener('click', () => {
                const pal = ST.currentPalette();
                const cell = 32;
                const cv = ST.mkCanvas(cell * pal.length, cell);
                const c = cv.getContext('2d');
                pal.forEach((col, i) => { c.fillStyle = col; c.fillRect(i * cell, 0, cell, cell); });
                cv.toBlob(bl => ST.download(bl, 'palette.png'), 'image/png');
                ST.closeSheet();
            });
        });
};

/* --------------------------------------------------------------- export -- */

ST.download = function (blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
};
const safeName = s => String(s || 'studio').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'studio';

ST.sheetExport = function () {
    const d = S.doc;
    if (!d) return;
    ST.openSheet('Export',
        field('Format', '<select id="ex-fmt"><option value="image/png">PNG — keeps transparency</option>' +
            '<option value="image/webp">WebP — smaller files</option>' +
            '<option value="image/jpeg">JPEG — no transparency</option></select>') +
        field('Scale', '<select id="ex-scale">' + [1, 2, 3, 4, 6, 8, 12, 16].map(n =>
            '<option value="' + n + '">×' + n + ' — ' + (d.w * n) + ' × ' + (d.h * n) + '</option>').join('') + '</select>') +
        field('Image', opGrid([
            ['frame', 'ri-image-line', 'This frame'],
            ['layers', 'ri-stack-line', 'Each layer'],
            ['copy', 'ri-clipboard-line', 'Copy to clipboard'],
        ].concat(d.frames > 1 ? [
            ['sheet', 'ri-layout-grid-line', 'Sprite sheet'],
            ['all', 'ri-file-copy-line', 'Every frame'],
        ] : []))) +
        (d.frames > 1 ? field('Animated GIF', '<div class="st-field-row">' +
            '<select id="ex-gif-dither"><option value="none">No dither</option>' +
            '<option value="ordered">Ordered dither</option><option value="diffuse">Diffused dither</option></select>' +
            '<button class="st-toggle on" id="ex-gif-trans" type="button"><i class="ri-checkbox-blank-line"></i>Transparency</button>' +
            '<button class="st-btn st-btn-accent" id="ex-gif" type="button"><i class="ri-film-line"></i>Write GIF</button></div>',
            'Written here in the browser — one shared 255-colour palette, per-frame timing taken from the fps box.') : '') +
        field('Project', '<div class="st-field-row">' +
            '<button class="st-btn" id="ex-proj" type="button"><i class="ri-save-3-line"></i>Save project file</button></div>',
            'Keeps every layer, frame and effect so you can pick the work back up anywhere.'),
        body => {
            const fmtOf = () => $('ex-fmt').value;
            const scaleOf = () => parseInt($('ex-scale').value, 10) || 1;
            const extOf = f => (f === 'image/png' ? 'png' : (f === 'image/webp' ? 'webp' : 'jpg'));
            wireOps(body, {
                frame: () => {
                    const f = fmtOf();
                    ST.flattenToCanvas(d, d.fi, scaleOf()).toBlob(bl => ST.download(bl, safeName(d.name) + '.' + extOf(f)), f, 0.92);
                },
                all: () => {
                    const f = fmtOf(), k = scaleOf();
                    for (let i = 0; i < d.frames; i++) {
                        (n => ST.flattenToCanvas(d, n, k).toBlob(bl =>
                            ST.download(bl, safeName(d.name) + '-' + String(n + 1).padStart(2, '0') + '.' + extOf(f)), f, 0.92))(i);
                    }
                },
                sheet: () => {
                    const f = fmtOf(), k = scaleOf();
                    const cols = Math.ceil(Math.sqrt(d.frames)) || 1;
                    const rowsN = Math.ceil(d.frames / cols);
                    const sheet = ST.mkCanvas(d.w * k * cols, d.h * k * rowsN);
                    const c = sheet.getContext('2d');
                    c.imageSmoothingEnabled = false;
                    for (let i = 0; i < d.frames; i++) {
                        c.drawImage(ST.flattenToCanvas(d, i, k), (i % cols) * d.w * k, Math.floor(i / cols) * d.h * k);
                    }
                    sheet.toBlob(bl => ST.download(bl, safeName(d.name) + '-sheet.' + extOf(f)), f, 0.92);
                },
                layers: () => {
                    const f = fmtOf(), k = scaleOf();
                    d.layers.forEach((l, i) => {
                        const out = ST.mkCanvas(d.w * k, d.h * k);
                        const c = out.getContext('2d');
                        c.imageSmoothingEnabled = false;
                        c.drawImage(l.cels[d.fi], 0, 0, out.width, out.height);
                        out.toBlob(bl => ST.download(bl, safeName(d.name) + '-' + safeName(l.name) + '-' + (i + 1) + '.' + extOf(f)), f, 0.92);
                    });
                },
                copy: () => {
                    ST.flattenToCanvas(d, d.fi, scaleOf()).toBlob(bl => {
                        if (!navigator.clipboard || !window.ClipboardItem) { ST.note('This browser cannot copy images.', 'ri-error-warning-line'); return; }
                        navigator.clipboard.write([new ClipboardItem({ 'image/png': bl })]).then(
                            () => ST.note('Copied to the clipboard.', 'ri-clipboard-line'),
                            () => ST.note('The browser refused clipboard access.', 'ri-error-warning-line'));
                    }, 'image/png');
                },
            });
            if ($('ex-gif')) {
                $('ex-gif-trans').addEventListener('click', function () { this.classList.toggle('on'); });
                $('ex-gif').addEventListener('click', () => {
                    const k = clamp(scaleOf(), 1, 8);
                    ST.note('Writing GIF…', 'ri-film-line');
                    setTimeout(() => {
                        try {
                            const frames = [];
                            for (let i = 0; i < d.frames; i++) {
                                const cv = ST.flattenToCanvas(d, i, k);
                                frames.push({
                                    img: ST.ctx2d(cv).getImageData(0, 0, cv.width, cv.height),
                                    delay: d.delays[i] || Math.round(1000 / d.fps),
                                });
                            }
                            const bytes = ST.encodeGIF(frames, {
                                dither: $('ex-gif-dither').value,
                                transparent: $('ex-gif-trans').classList.contains('on'),
                            });
                            ST.download(new Blob([bytes], { type: 'image/gif' }), safeName(d.name) + '.gif');
                            ST.note(d.frames + ' frames written.', 'ri-film-line');
                        } catch (e) {
                            ST.note('The GIF could not be written: ' + e.message, 'ri-error-warning-line');
                        }
                        ST.closeSheet();
                    }, 30);
                });
            }
            $('ex-proj').addEventListener('click', () => {
                ST.download(new Blob([ST.serializeDoc(d)], { type: 'application/json' }), safeName(d.name) + '.studio.json');
                ST.note('Project saved to your downloads.', 'ri-save-3-line');
                ST.closeSheet();
            });
        });
};

/* ---------------------------------------------------------- persistence -- */

ST.markDirty = function () {
    if (S.doc) { S.doc.dirty = true; S.doc.saved = 'pending'; ST.syncSaveState(); }
    clearTimeout(S.saveTimer);
    S.saveTimer = setTimeout(ST.saveAll, 2200);
};

ST.serializeDoc = function (doc) {
    return JSON.stringify({
        v: 2, id: doc.id, name: doc.name, w: doc.w, h: doc.h,
        frames: doc.frames, fi: doc.fi, li: doc.li, fps: doc.fps, delays: doc.delays,
        layers: doc.layers.map(l => ({
            name: l.name, visible: l.visible, opacity: l.opacity, blend: l.blend,
            locked: l.locked, alphaLock: l.alphaLock, clip: l.clip, fx: l.fx,
            cels: l.cels.map(c => c.toDataURL('image/png')),
        })),
    });
};

ST.deserializeDoc = function (raw) {
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!o || !o.w || !o.h || !Array.isArray(o.layers)) throw new Error('not a Studio project');
    const doc = {
        id: typeof o.id === 'string' ? o.id : ST.uid(),
        name: String(o.name || 'Untitled').slice(0, 60),
        w: clamp(o.w | 0, 1, ST.MAX_DIM), h: clamp(o.h | 0, 1, ST.MAX_DIM),
        frames: clamp(o.frames | 0 || 1, 1, 480),
        fi: 0, li: 0, fps: clamp(o.fps | 0 || 8, 1, 60),
        delays: [], layers: [], history: [], future: [], dirty: false, saved: 'saved',
    };
    for (let i = 0; i < doc.frames; i++) {
        const dl = Array.isArray(o.delays) ? o.delays[i] : null;
        doc.delays.push(clamp(parseInt(dl, 10) || Math.round(1000 / doc.fps), 10, 60000));
    }
    const validBlend = ST.BLEND_MODES.map(b => b[0]);
    o.layers.slice(0, 64).forEach(sl => {
        const layer = {
            id: ST.uid(), name: String(sl.name || 'Layer').slice(0, 40),
            visible: sl.visible !== false,
            opacity: clamp(typeof sl.opacity === 'number' ? sl.opacity : 1, 0, 1),
            blend: validBlend.indexOf(sl.blend) >= 0 ? sl.blend : 'source-over',
            locked: !!sl.locked, alphaLock: !!sl.alphaLock, clip: !!sl.clip,
            fx: (sl.fx && typeof sl.fx === 'object') ? sl.fx : null,
            cels: [],
        };
        for (let f = 0; f < doc.frames; f++) {
            const cel = ST.mkCanvas(doc.w, doc.h);
            const uri = Array.isArray(sl.cels) ? sl.cels[f] : null;
            // only ever load raster data URLs the Studio itself produces
            if (typeof uri === 'string' && /^data:image\/(png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(uri)) {
                const img = new Image();
                img.onload = () => {
                    const c = cel.getContext('2d');
                    c.imageSmoothingEnabled = false;
                    c.drawImage(img, 0, 0);
                    if (S.doc === doc) { ST.composite(); ST.renderLayers(); ST.renderFrames(); ST.renderDocs(); }
                };
                img.src = uri;
            }
            layer.cels.push(cel);
        }
        doc.layers.push(layer);
    });
    if (!doc.layers.length) doc.layers.push(ST.makeLayer(doc, 'Background'));
    doc.li = clamp(o.li | 0, 0, doc.layers.length - 1);
    return doc;
};

ST.saveIndex = function () {
    try { localStorage.setItem(STORE_INDEX, JSON.stringify(S.docs.map(d => d.id))); } catch (e) {}
};

ST.saveAll = function () {
    if (!S.docs.some(d => d.dirty)) { ST.saveIndex(); return; }
    let budget = SAVE_BUDGET;
    let skipped = 0;
    S.docs.forEach(doc => {
        try {
            const s = ST.serializeDoc(doc);
            if (s.length > budget) { skipped++; doc.saved = 'too-big'; localStorage.removeItem(STORE_DOC + doc.id); return; }
            budget -= s.length;
            localStorage.setItem(STORE_DOC + doc.id, s);
            doc.dirty = false;
            doc.saved = 'saved';
        } catch (e) {
            skipped++;
            doc.saved = 'too-big';
            try { localStorage.removeItem(STORE_DOC + doc.id); } catch (e2) {}
        }
    });
    ST.saveIndex();
    ST.syncSaveState();
    if (skipped && !S.storageWarned) {
        S.storageWarned = true;
        ST.note('Some projects are too large to keep on this device — export them.', 'ri-alert-line');
    }
};

ST.savePrefs = function () {
    try {
        localStorage.setItem(STORE_PREFS, JSON.stringify({
            fg: S.fg, bg: S.bg, recent: S.recent, pixelMode: S.pixelMode,
            palette: S.palette, paletteSnap: S.paletteSnap, gridSize: S.gridSize,
        }));
    } catch (e) {}
};

function loadAll() {
    let ids = [];
    try { ids = JSON.parse(localStorage.getItem(STORE_INDEX) || '[]'); } catch (e) { ids = []; }
    if (!Array.isArray(ids)) ids = [];
    ids.slice(0, 24).forEach(id => {
        if (typeof id !== 'string') return;
        try {
            const raw = localStorage.getItem(STORE_DOC + id);
            if (raw) S.docs.push(ST.deserializeDoc(raw));
        } catch (e) {}
    });
    try {
        const p = JSON.parse(localStorage.getItem(STORE_PREFS) || '{}');
        if (p && typeof p === 'object') {
            if (typeof p.fg === 'string') S.fg = p.fg;
            if (typeof p.bg === 'string') S.bg = p.bg;
            if (Array.isArray(p.recent)) S.recent = p.recent.filter(c => typeof c === 'string').slice(0, 18);
            if (typeof p.pixelMode === 'boolean') S.pixelMode = p.pixelMode;
            if (typeof p.palette === 'string' && ST.PALETTES[p.palette]) S.palette = p.palette;
            if (typeof p.paletteSnap === 'boolean') S.paletteSnap = p.paletteSnap;
            if (typeof p.gridSize === 'number') S.gridSize = clamp(p.gridSize, 1, 256);
        }
    } catch (e) {}
}

/* --------------------------------------------------------- file loading -- */

ST.loadFiles = function (files) {
    Array.from(files || []).slice(0, 12).forEach(file => {
        if (!file) return;
        if (file.type === 'application/json' || /\.json$/i.test(file.name)) {
            const r = new FileReader();
            r.onload = () => {
                try {
                    const doc = ST.deserializeDoc(r.result);
                    S.docs.unshift(doc);
                    ST.openDoc(doc);
                    ST.note('Project "' + doc.name + '" opened.', 'ri-folder-open-line');
                } catch (e) { ST.note('That file is not a Studio project.', 'ri-error-warning-line'); }
            };
            r.readAsText(file.slice(0, 60 * 1024 * 1024));
            return;
        }
        if (!/^image\//.test(file.type)) { ST.note('Only images and Studio projects can be opened.', 'ri-error-warning-line'); return; }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const w = clamp(img.naturalWidth, 1, ST.MAX_DIM);
            const h = clamp(img.naturalHeight, 1, ST.MAX_DIM);
            if (S.doc && w === S.doc.w && h === S.doc.h) {
                addImageAsLayer(img, file.name);
            } else {
                const doc = ST.makeDoc(w, h, file.name.replace(/\.[^.]+$/, ''));
                const c = ST.ctx2d(doc.layers[0].cels[0]);
                c.imageSmoothingEnabled = false;
                c.drawImage(img, 0, 0, w, h);
                S.docs.unshift(doc);
                ST.openDoc(doc);
                ST.note('Opened a ' + w + '×' + h + ' image.', 'ri-image-line');
                if (w >= h * 2 || h >= w * 2) offerSlice(doc);
            }
            URL.revokeObjectURL(url);
        };
        img.onerror = () => { URL.revokeObjectURL(url); ST.note('That image could not be read.', 'ri-error-warning-line'); };
        img.src = url;
    });
};

function addImageAsLayer(img, name) {
    const d = S.doc;
    const l = ST.makeLayer(d, String(name || 'Image').replace(/\.[^.]+$/, '').slice(0, 40));
    const c = ST.ctx2d(l.cels[d.fi]);
    c.imageSmoothingEnabled = false;
    c.drawImage(img, 0, 0, d.w, d.h);
    const at = d.layers.length;
    d.layers.push(l);
    d.li = at;
    ST.pushHistory('Add image layer', () => d.layers.splice(at, 1), () => d.layers.splice(at, 0, l));
    ST.afterChange();
    ST.note('Added as a new layer.', 'ri-image-add-line');
}

/* A long strip is usually a sprite sheet — offer to cut it into frames. */
function offerSlice(doc) {
    ST.openSheet('Slice into frames',
        '<div class="st-sheet-note" style="margin:0 0 12px">This image is ' + doc.w + ' × ' + doc.h +
        '. If it is a sprite sheet, say how it is laid out and each cell becomes a frame.</div>' +
        field('Grid', '<div class="st-field-row"><input type="number" id="sl-cols" min="1" max="128" value="' +
            Math.max(1, Math.round(doc.w / doc.h)) + '"><span class="st-lbl">columns ×</span>' +
            '<input type="number" id="sl-rows" min="1" max="128" value="1"><span class="st-lbl">rows</span></div>') +
        '<div class="st-sheet-actions"><button class="st-btn" id="sl-skip" type="button">Leave it whole</button>' +
        '<button class="st-btn st-btn-accent" id="sl-go" type="button"><i class="ri-scissors-cut-line"></i>Slice</button></div>',
        () => {
            $('sl-skip').addEventListener('click', ST.closeSheet);
            $('sl-go').addEventListener('click', () => {
                const cols = clamp(parseInt($('sl-cols').value, 10) || 1, 1, 128);
                const rowsN = clamp(parseInt($('sl-rows').value, 10) || 1, 1, 128);
                sliceSheet(doc, cols, rowsN);
                ST.closeSheet();
            });
        });
}

function sliceSheet(doc, cols, rowsN) {
    const cw = Math.floor(doc.w / cols), ch = Math.floor(doc.h / rowsN);
    if (cw < 1 || ch < 1) return;
    const src = ST.copyCanvas(doc.layers[0].cels[0]);
    const total = cols * rowsN;
    const cels = [];
    for (let i = 0; i < total; i++) {
        const cel = ST.mkCanvas(cw, ch);
        ST.ctx2d(cel).drawImage(src, (i % cols) * cw, Math.floor(i / cols) * ch, cw, ch, 0, 0, cw, ch);
        cels.push(cel);
    }
    doc.w = cw; doc.h = ch;
    doc.frames = total;
    doc.fi = 0;
    doc.delays = new Array(total).fill(Math.round(1000 / doc.fps));
    doc.layers = [{
        id: ST.uid(), name: 'Sheet', visible: true, opacity: 1, blend: 'source-over',
        locked: false, alphaLock: false, clip: false, fx: null, cels: cels,
    }];
    doc.li = 0;
    doc.history.length = 0;
    doc.future.length = 0;
    ST.openDoc(doc);
    ST.note('Sliced into ' + total + ' frames of ' + cw + '×' + ch + '.', 'ri-scissors-cut-line');
}

/* ------------------------------------------------------------ keyboard -- */

const KEYS = [
    ['B P E G', 'brush, pencil, eraser, bucket'],
    ['M Q W', 'select: box, free, colour'],
    ['V  ·  H', 'move  ·  pan'],
    ['[ ]', 'brush size'],
    ['X', 'swap colours'],
    ['Alt', 'pick a colour'],
    ['Space', 'pan  ·  0 fit  ·  1 actual'],
    ['Ctrl Z', 'undo  ·  Shift for redo'],
    ['Ctrl A D', 'select all  ·  deselect'],
    ['Ctrl C V', 'copy  ·  paste'],
    ['Ctrl E', 'merge down'],
    ['Del', 'clear selection'],
    ['Enter', 'play the animation'],
];

function renderKeys() {
    const box = $('st-keys');
    if (!box) return;
    box.innerHTML = KEYS.map(k =>
        '<div><span class="st-key-combo">' + k[0].split(' ').map(x => x === '·' ? '·' : '<kbd>' + esc(x) + '</kbd>').join('') +
        '</span><span class="st-key-what">' + esc(k[1]) + '</span></div>').join('');
}

function studioHasFocus() {
    return S.active &&
        !$('view-studio').classList.contains('hidden') &&
        !$('select-screen').classList.contains('hidden');
}
function typingInField(t) {
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

function onKeyDown(e) {
    if (!studioHasFocus()) return;
    if ($('settings-overlay').classList.contains('open')) return;
    const typing = typingInField(e.target);

    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === 'z') { e.preventDefault(); e.shiftKey ? ST.redo() : ST.undo(); return; }
        if (k === 'y') { e.preventDefault(); ST.redo(); return; }
        if (k === 's') { e.preventDefault(); ST.sheetExport(); return; }
        if (typing) return;
        if (k === 'a') { e.preventDefault(); ST.selAll(); return; }
        if (k === 'd') { e.preventDefault(); ST.selNone(); return; }
        if (k === 'i') { e.preventDefault(); ST.selInvert(); return; }
        if (k === 'n') { e.preventDefault(); e.shiftKey ? ST.addLayer() : ST.sheetNew(); return; }
        if (k === 'o') { e.preventDefault(); $('st-file').click(); return; }
        if (k === 'e') { e.preventDefault(); ST.mergeDown(); return; }
        if (k === 'c') { e.preventDefault(); ST.copySelection(false); return; }
        if (k === 'x') { e.preventDefault(); ST.copySelection(true); return; }
        if (k === 'v') { e.preventDefault(); ST.pasteClipboard(e.shiftKey); return; }
        return;
    }
    if (typing) return;

    if (e.key === ' ') { ST.setSpaceDown(true); B.view.style.cursor = 'grab'; e.preventDefault(); return; }
    if (e.key === 'Escape') {
        if ($('st-sheet').classList.contains('show')) ST.closeSheet();
        else if (S.cropRect) { S.cropRect = null; ST.drawOverlay(); ST.renderOpts(); }
        else ST.selNone();
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        if (S.tool === 'crop' && S.cropRect) ST.cropTo(S.cropRect);
        else ST.togglePlay();
        return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); ST.clearSelection(); return; }
    if (e.key === '[') { ST.setSize(S.size - Math.max(1, Math.round(S.size * 0.2))); return; }
    if (e.key === ']') { ST.setSize(S.size + Math.max(1, Math.round(S.size * 0.2))); return; }
    if (e.key === '0') { ST.zoomToFit(); return; }
    if (e.key === '1') { ST.setZoom(1); return; }
    if (e.key === '+' || e.key === '=') { ST.setZoom(S.zoom * 1.25); return; }
    if (e.key === '-' || e.key === '_') { ST.setZoom(S.zoom / 1.25); return; }
    if (e.key.toLowerCase() === 'x') { const f = S.fg; ST.setFg(S.bg); ST.setBg(f); return; }

    const key = e.key.toUpperCase();
    const matches = ST.TOOLS.filter(t => t.key === key);
    if (matches.length) {
        const at = matches.findIndex(t => t.id === S.tool);
        ST.setTool(matches[(at + 1) % matches.length].id);
    }
}
function onKeyUp(e) {
    if (e.key === ' ') { ST.setSpaceDown(false); if (studioHasFocus()) ST.setTool(S.tool); }
}

/* ---------------------------------------------------------------- boot -- */

ST.syncPinned = function () {
    $('st-sym-x').classList.toggle('on', S.symX);
    $('st-sym-y').classList.toggle('on', S.symY);
    $('st-pixel-mode').classList.toggle('on', S.pixelMode);
    $('st-snap').classList.toggle('on', S.snap);
};

function boot() {
    if (S.booted) return;
    S.booted = true;

    B.view = $('st-canvas');
    B.ov = $('st-overlay');
    B.tile = $('st-tile');
    B.viewCtx = ST.ctx2d(B.view);
    B.ovCtx = B.ov.getContext('2d');
    B.tileCtx = B.tile.getContext('2d');
    ['stroke', 'group', 'base', 'fx', 'sil', 'mask'].forEach(k => {
        B[k] = ST.mkCanvas(1, 1);
        B[k + 'Ctx'] = ST.ctx2d(B[k]);
    });

    loadAll();

    $('st-layer-blend').innerHTML = ST.BLEND_MODES.map(b => '<option value="' + b[0] + '">' + b[1] + '</option>').join('');
    ST.renderTools();
    ST.renderPaletteSelect();
    ST.renderSwatches();
    ST.initPicker();
    ST.setFg(S.fg);
    ST.setBg(S.bg);
    ST.setTool('brush');
    ST.syncPinned();
    renderKeys();

    B.view.addEventListener('pointerdown', ST.onDown);
    B.view.addEventListener('pointermove', ST.onMove);
    window.addEventListener('pointerup', ST.onUp);
    B.view.addEventListener('pointercancel', ST.onUp);
    B.view.addEventListener('contextmenu', e => e.preventDefault());
    $('st-stage').addEventListener('wheel', e => {
        if (!S.doc) return;
        if (!(e.ctrlKey || e.metaKey || e.altKey)) return;
        e.preventDefault();
        ST.setZoom(e.deltaY < 0 ? S.zoom * 1.18 : S.zoom / 1.18);
    }, { passive: false });

    $('st-doc-new').addEventListener('click', ST.sheetNew);
    $('st-empty-new').addEventListener('click', ST.sheetNew);
    $('st-doc-open').addEventListener('click', () => $('st-file').click());
    $('st-empty-open').addEventListener('click', () => $('st-file').click());
    $('st-file').addEventListener('change', e => { ST.loadFiles(e.target.files); e.target.value = ''; });
    $('st-ref-file').addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        const r = $('st-ref');
        r.src = URL.createObjectURL(f);
        r.style.display = 'block';
        r.style.opacity = S.refOpacity / 100;
        r.style.zIndex = S.refBelow ? 0 : 4;
    });

    $('st-layer-add').addEventListener('click', ST.addLayer);
    $('st-layer-dup').addEventListener('click', ST.duplicateLayer);
    $('st-layer-del').addEventListener('click', ST.deleteLayer);
    $('st-layer-up').addEventListener('click', () => ST.moveLayer(1));
    $('st-layer-down').addEventListener('click', () => ST.moveLayer(-1));
    $('st-layer-merge').addEventListener('click', ST.mergeDown);
    $('st-layer-fx').addEventListener('click', ST.sheetFx);
    const layerFlag = (id, key, label) => $(id).addEventListener('click', () => {
        const l = ST.activeLayer();
        if (!l) return;
        const was = l[key];
        l[key] = !was;
        ST.pushHistory(label, () => { l[key] = was; }, () => { l[key] = !was; });
        ST.renderLayers();
        ST.composite();
    });
    layerFlag('st-layer-alpha', 'alphaLock', 'Lock transparency');
    layerFlag('st-layer-lock', 'locked', 'Lock layer');
    layerFlag('st-layer-clip', 'clip', 'Clipping mask');
    $('st-layer-opacity').addEventListener('input', function () {
        const l = ST.activeLayer();
        if (!l) return;
        l.opacity = clamp(+this.value / 100, 0, 1);
        $('st-layer-opacity-val').textContent = this.value + '%';
        ST.composite();
        ST.markDirty();
    });
    $('st-layer-blend').addEventListener('change', function () {
        const l = ST.activeLayer();
        if (!l) return;
        l.blend = this.value;
        ST.composite();
        ST.markDirty();
    });
    $('st-hist-clear').addEventListener('click', () => {
        if (!S.doc) return;
        S.doc.history.length = 0;
        S.doc.future.length = 0;
        ST.syncHistory();
    });

    $('st-frame-add').addEventListener('click', () => ST.addFrame(false));
    $('st-frame-dup').addEventListener('click', () => ST.addFrame(true));
    $('st-onion').addEventListener('click', function () { S.onion = !S.onion; this.classList.toggle('on', S.onion); ST.composite(); });
    $('st-play').addEventListener('click', ST.togglePlay);
    $('st-fps').addEventListener('input', function () {
        if (!S.doc) return;
        S.doc.fps = clamp(+this.value || 8, 1, 60);
        S.doc.delays = S.doc.delays.map(() => Math.round(1000 / S.doc.fps));
        if (S.playing) { ST.togglePlay(); ST.togglePlay(); }
        ST.markDirty();
    });

    $('st-undo').addEventListener('click', ST.undo);
    $('st-redo').addEventListener('click', ST.redo);
    $('st-open-select').addEventListener('click', ST.sheetSelect);
    $('st-open-transform').addEventListener('click', ST.sheetTransform);
    $('st-open-adjust').addEventListener('click', ST.sheetAdjust);
    $('st-open-view').addEventListener('click', ST.sheetView);
    $('st-open-export').addEventListener('click', ST.sheetExport);
    $('st-sheet-close').addEventListener('click', ST.closeSheet);
    $('st-sheet').addEventListener('click', e => { if (e.target === $('st-sheet')) ST.closeSheet(); });
    $('st-doc-name').addEventListener('dblclick', () => {
        if (!S.doc) return;
        const n = prompt('Project name', S.doc.name);
        if (n != null && n.trim()) {
            S.doc.name = n.trim().slice(0, 60);
            $('st-doc-name').textContent = S.doc.name;
            ST.renderDocs();
            ST.markDirty();
        }
    });

    $('st-zoom-in').addEventListener('click', () => ST.setZoom(S.zoom * 1.25));
    $('st-zoom-out').addEventListener('click', () => ST.setZoom(S.zoom / 1.25));
    $('st-zoom-fit').addEventListener('click', ST.zoomToFit);
    $('st-zoom-100').addEventListener('click', () => ST.setZoom(1));

    ['st-fg', 'st-fg2'].forEach(id => $(id).addEventListener('input', function () { ST.setFg(this.value); }));
    ['st-bg', 'st-bg2'].forEach(id => $(id).addEventListener('input', function () { ST.setBg(this.value); }));
    const swap = () => { const f = S.fg; ST.setFg(S.bg); ST.setBg(f); };
    $('st-swap').addEventListener('click', swap);
    $('st-swap2').addEventListener('click', swap);
    $('st-hex').addEventListener('change', function () {
        const v = this.value.trim().replace(/^#?/, '#');
        if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) ST.setFg(ST.rgbToHex.apply(null, ST.hexToRgb(v)));
        else this.value = S.fg;
    });
    $('st-alpha').addEventListener('input', function () {
        S.alpha = clamp(+this.value / 100, 0, 1);
        $('st-alpha-val').textContent = this.value + '%';
    });
    $('st-pal-select').addEventListener('change', function () {
        S.palette = this.value;
        ST.renderSwatches();
        ST.savePrefs();
    });
    $('st-pal-menu').addEventListener('click', ST.sheetPalette);

    const pinFlag = (id, key, after) => $(id).addEventListener('click', function () {
        S[key] = !S[key];
        this.classList.toggle('on', S[key]);
        if (after) after();
    });
    pinFlag('st-sym-x', 'symX');
    pinFlag('st-sym-y', 'symY');
    pinFlag('st-pixel-mode', 'pixelMode', () => { ST.applyZoom(); ST.savePrefs(); });
    pinFlag('st-snap', 'snap');

    const root = $('st-root');
    let dragDepth = 0;
    root.addEventListener('dragenter', e => { e.preventDefault(); if (++dragDepth === 1) root.classList.add('is-dropping'); });
    root.addEventListener('dragover', e => e.preventDefault());
    root.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; root.classList.remove('is-dropping'); } });
    root.addEventListener('drop', e => {
        e.preventDefault();
        dragDepth = 0;
        root.classList.remove('is-dropping');
        if (e.dataTransfer && e.dataTransfer.files) ST.loadFiles(e.dataTransfer.files);
    });

    window.addEventListener('paste', e => {
        if (!studioHasFocus() || !e.clipboardData) return;
        const items = Array.from(e.clipboardData.items || []).filter(i => i.type && i.type.indexOf('image') === 0);
        if (!items.length) return;
        e.preventDefault();
        ST.loadFiles(items.map(i => i.getAsFile()).filter(Boolean));
    });

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('beforeunload', () => { clearTimeout(S.saveTimer); ST.saveAll(); });
    window.addEventListener('resize', () => { if (S.active && S.doc) ST.applyZoom(); });

    ST.renderDocs();
    ST.renderLayers();
    ST.renderFrames();
    ST.syncHistory();
    ST.updateSelInfo();
    if (S.docs.length) ST.openDoc(S.docs[0], true);
}

window.Studio = {
    enter() {
        boot();
        S.active = true;
        if (S.doc) requestAnimationFrame(() => {
            if (S.pendingFit || S.zoom <= 0.06) ST.zoomToFit(); else ST.applyZoom();
            ST.composite();
        });
    },
    leave() {
        S.active = false;
        if (S.playing) ST.togglePlay();
        clearTimeout(S.saveTimer);
        if (S.booted) ST.saveAll();
    },
    projectCount() { return S.docs.length; },
};

})();
