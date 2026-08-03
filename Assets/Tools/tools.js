(function () {
  try {
    var t = localStorage.getItem('choseven_theme');
    if (t) document.documentElement.dataset.theme = JSON.parse(t);
    var a = localStorage.getItem('choseven_accentColor');
    if (a) document.documentElement.style.setProperty('--accent', JSON.parse(a));
    var s = localStorage.getItem('choseven_uiScale');
    if (s) document.documentElement.style.setProperty('--scale', JSON.parse(s));
  } catch (e) {}
})();

window.TOOLS = (function () {
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

  var toastEl = null, toastTimer = null;
  function toast(msg, icon) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.innerHTML = '<i></i><span></span>';
      document.body.appendChild(toastEl);
    }
    toastEl.querySelector('i').className = icon || 'ri-checkbox-circle-line';
    toastEl.querySelector('span').textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }

  function download(blob, filename) {
    var url = (blob instanceof Blob) ? URL.createObjectURL(blob) : blob;
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    if (blob instanceof Blob) setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function pickFile(accept, multiple, cb) {
    var inp = document.createElement('input');
    inp.type = 'file';
    if (accept) inp.accept = accept;
    if (multiple) inp.multiple = true;
    inp.style.display = 'none';
    inp.addEventListener('change', function () { if (inp.files && inp.files.length) cb(multiple ? inp.files : inp.files[0]); inp.remove(); });
    document.body.appendChild(inp); inp.click();
  }

  function matches(file, prefix) {
    if (!prefix) return true;
    if (prefix.charAt(prefix.length - 1) === '/') return file.type.indexOf(prefix) === 0 || (!file.type && false);
    return file.type === prefix;
  }

  function setupDrop(accept, label, onFiles) {
    var ov = document.createElement('div');
    ov.className = 'drop-overlay';
    ov.innerHTML = '<div class="drop-overlay-inner"><i class="ri-upload-cloud-2-line"></i><span>' + (label || 'Drop file to open') + '</span></div>';
    document.body.appendChild(ov);
    var depth = 0;
    function hasFiles(e) { return e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1; }
    window.addEventListener('dragenter', function (e) { if (!hasFiles(e)) return; e.preventDefault(); depth++; ov.classList.add('show'); });
    window.addEventListener('dragover', function (e) { if (!hasFiles(e)) return; e.preventDefault(); });
    window.addEventListener('dragleave', function (e) { if (!hasFiles(e)) return; depth--; if (depth <= 0) { depth = 0; ov.classList.remove('show'); } });
    window.addEventListener('drop', function (e) {
      if (!e.dataTransfer) return;
      e.preventDefault(); depth = 0; ov.classList.remove('show');
      var files = Array.prototype.slice.call(e.dataTransfer.files || []);
      if (accept) files = files.filter(function (f) { return matches(f, accept); });
      if (files.length) onFiles(files);
    });
  }

  function bindRange(range, valEl, fmt) {
    var f = fmt || function (v) { return v; };
    var upd = function () { if (valEl) valEl.textContent = f(parseFloat(range.value), range); };
    range.addEventListener('input', upd);
    upd();
    return upd;
  }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 100);
    return m + ':' + String(s).padStart(2, '0') + '.' + String(ms).padStart(2, '0');
  }

  function baseName(name) { return (name || 'export').replace(/\.[^.]+$/, ''); }

  function fmtBytes(n) {
    if (!isFinite(n) || n < 0) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(2) + ' MB';
  }

  /* ---- settings that survive a reload, per tool ---- */
  function store(toolKey) {
    var K = 'chosevn_tool_' + toolKey;
    return {
      load: function (fallback) {
        try {
          var v = JSON.parse(localStorage.getItem(K) || 'null');
          return (v && typeof v === 'object') ? Object.assign({}, fallback, v) : Object.assign({}, fallback);
        } catch (e) { return Object.assign({}, fallback); }
      },
      save: function (obj) { try { localStorage.setItem(K, JSON.stringify(obj)); } catch (e) {} },
      clear: function () { try { localStorage.removeItem(K); } catch (e) {} }
    };
  }

  /* ---- copy a canvas to the clipboard ---- */
  function copyCanvas(canvas, done) {
    if (!navigator.clipboard || !window.ClipboardItem) { toast('This browser cannot copy images', 'ri-error-warning-line'); return; }
    canvas.toBlob(function (bl) {
      if (!bl) { toast('Nothing to copy', 'ri-error-warning-line'); return; }
      navigator.clipboard.write([new ClipboardItem({ 'image/png': bl })]).then(
        function () { toast('Copied to the clipboard', 'ri-clipboard-line'); if (done) done(); },
        function () { toast('The browser refused clipboard access', 'ri-error-warning-line'); }
      );
    }, 'image/png');
  }

  /* ---- hand a result over to the Studio ---- */
  function sendToStudio(canvas, name) {
    try {
      var payload = {
        v: 2, id: 'h' + Date.now().toString(36), name: (name || 'From tools').slice(0, 60),
        w: canvas.width, h: canvas.height, frames: 1, fi: 0, li: 0, fps: 8, delays: [125],
        layers: [{ name: 'Image', visible: true, opacity: 1, blend: 'source-over', cels: [canvas.toDataURL('image/png')] }]
      };
      var id = payload.id;
      localStorage.setItem('chosevn_studio_doc_' + id, JSON.stringify(payload));
      var idx = [];
      try { idx = JSON.parse(localStorage.getItem('chosevn_studio_index') || '[]') || []; } catch (e) { idx = []; }
      idx.unshift(id);
      localStorage.setItem('chosevn_studio_index', JSON.stringify(idx.slice(0, 24)));
      location.href = '../../index.html#studio';
    } catch (e) {
      toast('That image is too large to hand over — export it instead', 'ri-error-warning-line');
    }
  }

  /* ---- drag-to-compare wipe between two stacked elements ---- */
  function compare(frame, topEl) {
    var handle = document.createElement('div');
    handle.className = 'cmp-handle';
    handle.innerHTML = '<span class="cmp-grip"><i class="ri-arrow-left-right-line"></i></span>';
    frame.appendChild(handle);
    var pos = 100, on = false;
    function set(p) {
      pos = clamp(p, 0, 100);
      topEl.style.clipPath = 'inset(0 ' + (100 - pos) + '% 0 0)';
      handle.style.left = pos + '%';
    }
    function fromEvent(e) {
      var r = frame.getBoundingClientRect();
      set(((e.clientX - r.left) / r.width) * 100);
    }
    handle.addEventListener('pointerdown', function (e) {
      on = true;
      try { handle.setPointerCapture(e.pointerId); } catch (x) {}
      e.preventDefault();
    });
    window.addEventListener('pointermove', function (e) { if (on) fromEvent(e); });
    window.addEventListener('pointerup', function () { on = false; });
    return {
      show: function (v) { frame.classList.toggle('comparing', !!v); if (!v) { topEl.style.clipPath = ''; } else set(pos); },
      set: set
    };
  }

  /* ---- keyboard shortcuts, skipped while typing ---- */
  function shortcuts(map) {
    document.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      var key = (e.ctrlKey || e.metaKey ? 'mod+' : '') + (e.shiftKey ? 'shift+' : '') + e.key.toLowerCase();
      var fn = map[key];
      if (fn) { e.preventDefault(); fn(e); }
    });
  }

  /* ---- double-click a slider to put it back to its default ---- */
  function resettable(range, def, after) {
    range.addEventListener('dblclick', function () {
      range.value = def;
      range.dispatchEvent(new Event('input', { bubbles: true }));
      if (after) after();
    });
    range.title = (range.title ? range.title + '  ·  ' : '') + 'double-click to reset';
  }

  return {
    $: $, $$: $$, clamp: clamp, toast: toast, download: download, pickFile: pickFile,
    setupDrop: setupDrop, bindRange: bindRange, fmtTime: fmtTime, baseName: baseName,
    fmtBytes: fmtBytes, store: store, copyCanvas: copyCanvas, sendToStudio: sendToStudio,
    compare: compare, shortcuts: shortcuts, resettable: resettable
  };
})();
