/* ============================================================
   Image Dither Generator
   ============================================================
   Takes an uploaded image and converts it to monochrome via
   one of several dithering algorithms. Optionally animates by
   modulating parameters over time.

   Styles:
     - Floyd-Steinberg : classic error-diffusion dither
     - Atkinson        : Mac-original error diffusion
     - Bayer 8x8       : ordered dither
     - Halftone        : circular dot screening
     - ASCII Art       : luminance-to-character mapping
     - Modulated Diffuse Y : horizontal scanline density modulation
                             (matches the reference video's style)
   ============================================================ */

window.HYPERBOLE_GENERATORS = window.HYPERBOLE_GENERATORS || {};

window.HYPERBOLE_GENERATORS.dither = (function () {

  // ----- generator metadata -----
  const requiresImage = true;
  const supportsAnimation = true;

  // ----- defaults -----
  const defaultParams = {
    style:        'mod-diffuse-y',
    inkColor:     '#ffffff',
    bgColor:      '#000000',
    scale:        1.0,           // resolution scaling (1 = full, lower = blockier)
    lineScale:    2,             // horizontal-line spacing for mod-diffuse
    contrast:     50,            // -100..100
    midtones:     50,            // 0..100
    highlights:   50,            // 0..100
    luminanceThreshold: 50,      // 0..100
    dotSize:      8,             // for halftone
    asciiSize:    10,            // pixel cell size for ASCII (smaller=denser)
    bayerLevel:   3,             // 0..3 (1=2x2, 2=4x4, 3=8x8)
    invert:       0,             // 0/1
    // animation params (active when running)
    animate:      0,             // 0/1
    animSpeed:    1.0,
    animMode:     'threshold',   // threshold / scale / scanlinesShift
    // style shuffle (cycles through algorithms)
    shuffleEnabled: 0,           // 0/1
    shuffleInterval: 1.0         // seconds between style swaps
  };

  // ----- UI schema -----
  const paramSchema = [
    { type: 'group', label: 'Source Image' },
    { type: 'image-input', key: '__image' },

    { type: 'group', label: 'Algorithm' },
    { type: 'select', key: 'style', label: 'Algorithm', options: [
      { value: 'mod-diffuse-y',    label: 'Modulated Diffuse Y' },
      { value: 'floyd-steinberg',  label: 'Floyd-Steinberg' },
      { value: 'atkinson',         label: 'Atkinson' },
      { value: 'bayer',            label: 'Bayer Ordered' },
      { value: 'halftone',         label: 'Halftone Dots' },
      { value: 'ascii',            label: 'ASCII Art' }
    ]},
    // algorithm-specific knobs (indented under Algorithm select)
    { type: 'range', key: 'lineScale', label: 'Line Scale', min: 1, max: 12, step: 1, fmt: v => v,
      showFor: { style: ['mod-diffuse-y'] }, indent: true },
    { type: 'range', key: 'dotSize', label: 'Dot Size', min: 2, max: 30, step: 1, fmt: v => v,
      showFor: { style: ['halftone'] }, indent: true },
    { type: 'range', key: 'asciiSize', label: 'Cell Size', min: 4, max: 24, step: 1, fmt: v => v,
      showFor: { style: ['ascii'] }, indent: true },
    { type: 'range', key: 'bayerLevel', label: 'Bayer Level (1=2x2..3=8x8)', min: 1, max: 3, step: 1, fmt: v => v,
      showFor: { style: ['bayer'] }, indent: true },

    { type: 'group', label: 'Tonal' },
    { type: 'range', key: 'contrast',           label: 'Contrast',            min: -100, max: 100, step: 1, fmt: v => v },
    { type: 'range', key: 'midtones',           label: 'Midtones',            min: 0,    max: 100, step: 1, fmt: v => v },
    { type: 'range', key: 'highlights',         label: 'Highlights',          min: 0,    max: 100, step: 1, fmt: v => v },
    { type: 'range', key: 'luminanceThreshold', label: 'Luminance Threshold', min: 0,    max: 100, step: 1, fmt: v => v },

    { type: 'group', label: 'Resolution' },
    { type: 'range', key: 'scale', label: 'Scale', min: 0.1, max: 1.0, step: 0.05, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'Color' },
    { type: 'color', key: 'inkColor', label: 'Ink Color' },
    { type: 'color', key: 'bgColor',  label: 'BG Color' },
    { type: 'select', key: 'invert', label: 'Invert', options: [
      { value: 0, label: 'No' },
      { value: 1, label: 'Yes' }
    ]},

    { type: 'group', label: 'Color Presets' },
    { type: 'preset-row', presets: [
      { id: 'mono',  label: 'MONO',  values: { inkColor: '#ffffff', bgColor: '#000000' } },
      { id: 'paper', label: 'PAPER', values: { inkColor: '#000000', bgColor: '#e8d7d7' } },
      { id: 'crt',   label: 'CRT',   values: { inkColor: '#00ff41', bgColor: '#001a08' } },
      { id: 'amber', label: 'AMBER', values: { inkColor: '#ffb000', bgColor: '#1a0d00' } },
      { id: 'cyber', label: 'CYBER', values: { inkColor: '#00e5ff', bgColor: '#02060d' } }
    ]},

    { type: 'group', label: 'Animation' },
    { type: 'select', key: 'animate', label: 'Animate Preview', options: [
      { value: 0, label: 'Off (still)' },
      { value: 1, label: 'On (loop)' }
    ]},
    { type: 'select', key: 'animMode', label: 'Anim Mode',
      showFor: { animate: [1] }, indent: true,
      options: [
        { value: 'threshold',     label: 'Threshold sweep' },
        { value: 'scale',         label: 'Scale breath' },
        { value: 'scanlinesShift',label: 'Scanlines shift' }
      ]
    },
    { type: 'range', key: 'animSpeed', label: 'Anim Speed', min: 0.1, max: 3.0, step: 0.05, fmt: v => v.toFixed(2),
      showFor: { animate: [1] }, indent: true },

    { type: 'group', label: 'Style Shuffle' },
    { type: 'select', key: 'shuffleEnabled', label: 'Auto-Shuffle Style', options: [
      { value: 0, label: 'Off' },
      { value: 1, label: 'On' }
    ]},
    { type: 'range', key: 'shuffleInterval', label: 'Shuffle Interval (s)', min: 0.1, max: 10, step: 0.1, fmt: v => v.toFixed(1),
      showFor: { shuffleEnabled: [1] }, indent: true }
  ];

  // ============================================================
  //  IMAGE PIPELINE
  //
  //  When the user uploads an image, we keep two things:
  //    sourceImg : an HTMLImageElement (full-resolution original)
  //    sourceCv  : an offscreen canvas at the working resolution
  //                (rebuilt when scale changes)
  //  Each render frame:
  //    1) draw sourceImg → workCv at scale*W x scale*H
  //    2) read pixels, apply contrast/midtones/highlights to luminance
  //    3) apply chosen dither algorithm to luminance buffer
  //    4) draw to output canvas at full size, scaled with nearest-neighbor
  // ============================================================

  // module-private
  let sourceImg = null;            // current loaded HTMLImageElement
  const workCv = document.createElement('canvas');
  const workCtx = workCv.getContext('2d', { willReadFrequently: true });
  const outCv = document.createElement('canvas');
  const outCtx = outCv.getContext('2d');

  // ----- public API for image input -----
  function setImage(htmlImg) {
    sourceImg = htmlImg;
  }
  function hasImage() {
    return sourceImg !== null;
  }

  // ----- helpers -----
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // adjust luminance with contrast/midtones/highlights
  function tonalAdjust(L, P) {
    // contrast: -100..100 → factor 0..2 around 0.5
    const c = (P.contrast + 100) / 100; // 0..2
    let v = (L - 0.5) * c + 0.5;
    // midtones: 0..100 → gamma 0.4..2.5
    const mid = P.midtones / 100;
    const gamma = mid > 0.5
      ? 1 + (mid - 0.5) * 3       // 1..2.5
      : 1 - (0.5 - mid) * 1.2;    // 0.4..1
    v = Math.pow(clamp(v, 0, 1), gamma);
    // highlights: pull/push high end
    const hl = (P.highlights - 50) / 50;  // -1..1
    if (v > 0.5) {
      v = v + hl * (v - 0.5) * 0.6;
    }
    return clamp(v, 0, 1);
  }

  // hex to rgb
  function hexToRgb(hex) {
    const m = hex.replace('#', '');
    return [
      parseInt(m.slice(0, 2), 16),
      parseInt(m.slice(2, 4), 16),
      parseInt(m.slice(4, 6), 16)
    ];
  }

  // ============================================================
  //  DITHER ALGORITHMS
  //  All operate on a Float32 luminance buffer in [0..1]
  //  Output: ImageData where ink/bg colors are applied
  // ============================================================

  function ditherFloydSteinberg(lum, w, h, threshold) {
    // mutate lum, then write
    const buf = new Float32Array(lum); // copy so we can re-run
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const old = buf[i];
        const newP = old > threshold ? 1 : 0;
        buf[i] = newP;
        const err = old - newP;
        if (x + 1 < w) buf[i + 1] += err * 7 / 16;
        if (y + 1 < h) {
          if (x > 0)     buf[i + w - 1] += err * 3 / 16;
                          buf[i + w]     += err * 5 / 16;
          if (x + 1 < w) buf[i + w + 1] += err * 1 / 16;
        }
      }
    }
    return buf; // 0/1 mask
  }

  function ditherAtkinson(lum, w, h, threshold) {
    const buf = new Float32Array(lum);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const old = buf[i];
        const newP = old > threshold ? 1 : 0;
        buf[i] = newP;
        const err = (old - newP) / 8;
        if (x + 1 < w)             buf[i + 1] += err;
        if (x + 2 < w)             buf[i + 2] += err;
        if (y + 1 < h) {
          if (x > 0)     buf[i + w - 1] += err;
                          buf[i + w]     += err;
          if (x + 1 < w) buf[i + w + 1] += err;
        }
        if (y + 2 < h)             buf[i + 2 * w] += err;
      }
    }
    return buf;
  }

  // Bayer thresholds (0..1 normalized)
  const BAYER_2 = [
    [0/4, 2/4],
    [3/4, 1/4]
  ];
  const BAYER_4 = [
    [ 0, 8, 2,10],
    [12, 4,14, 6],
    [ 3,11, 1, 9],
    [15, 7,13, 5]
  ].map(row => row.map(v => v / 16));
  const BAYER_8 = (() => {
    // generate 8x8 from 4x4 + offset
    const m = [];
    for (let y = 0; y < 8; y++) {
      m.push([]);
      for (let x = 0; x < 8; x++) {
        const v = BAYER_4[y % 4][x % 4] / 4 + (((x >> 2) ^ (y >> 2)) ? 0.0625 : 0);
        m[y].push(v);
      }
    }
    return m;
  })();

  function ditherBayer(lum, w, h, threshold, level) {
    let mat;
    if (level <= 1) mat = BAYER_2;
    else if (level === 2) mat = BAYER_4;
    else mat = BAYER_8;
    const ms = mat.length;
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const t = mat[y % ms][x % ms] * (1 - threshold) + threshold * 0.5;
        out[i] = lum[i] > t ? 1 : 0;
      }
    }
    return out;
  }

  // ----- non-mask renders (write directly to output canvas) -----

  function renderHalftone(ctx, lum, w, h, dotSize, threshold, ink, bg) {
    // ctx is output context, w,h is output size, lum is sample at smaller working res
    // We sample on a grid of dotSize spacing. Each cell: dot radius from luminance.
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ink;

    const cell = dotSize;
    const cols = Math.ceil(w / cell);
    const rows = Math.ceil(h / cell);
    // lum dimensions (working)
    // We'll just sample lum at proportional position
    const lw = Math.round(Math.sqrt(lum.length * (w / h)));
    // safer: assume caller passes the right dims via lum.cols (we'll attach)
    const cw = lum.__w || lw;
    const ch = lum.__h || Math.round(lum.length / cw);

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = x * cell + cell / 2;
        const cy = y * cell + cell / 2;
        // sample luminance
        const sx = Math.floor((cx / w) * cw);
        const sy = Math.floor((cy / h) * ch);
        const li = sy * cw + sx;
        const L = lum[li];
        // dark area = bigger dot, bright = smaller. Use threshold to remap.
        let v = (1 - L) - (1 - threshold);     // higher = bigger dot
        v = clamp(v, 0, 1);
        const r = v * (cell * 0.5 - 0.5);
        if (r > 0.3) {
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  const ASCII_RAMP = ' .:-=+*#%@';

  function renderAscii(ctx, lum, w, h, cellSize, threshold, ink, bg, fontFamily) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = ink;
    const fontSize = cellSize * 1.2;
    ctx.font = 'bold ' + fontSize + 'px ' + (fontFamily || 'monospace');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const cw = lum.__w;
    const ch = lum.__h;
    const cols = Math.ceil(w / cellSize);
    const rows = Math.ceil(h / cellSize);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = x * cellSize + cellSize / 2;
        const cy = y * cellSize + cellSize / 2;
        const sx = Math.floor((cx / w) * cw);
        const sy = Math.floor((cy / h) * ch);
        const L = lum[sy * cw + sx];
        // remap with threshold
        let v = L - (threshold - 0.5);
        v = clamp(v, 0, 1);
        const idx = Math.floor(v * (ASCII_RAMP.length - 1));
        const ch2 = ASCII_RAMP.charAt(idx);
        if (ch2 !== ' ') ctx.fillText(ch2, cx, cy);
      }
    }
  }

  // ----- Modulated Diffuse Y (the reference style) -----
  // Algorithm: for each scanline (every `lineScale` pixels vertically),
  // walk left to right. Accumulate luminance; when accumulator exceeds 1,
  // place a dot and subtract 1. Otherwise advance. This makes the
  // horizontal frequency of dots proportional to local luminance.
  function renderModDiffuseY(ctx, lum, lumW, lumH, outW, outH, lineSpacing, threshold, ink, bg, dotShift) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, outW, outH);
    ctx.fillStyle = ink;

    // dotShift: optional horizontal phase offset (animation)
    dotShift = dotShift || 0;

    // compute pixel size in output canvas per lum sample
    const sx = outW / lumW;
    const sy = outH / lumH;

    // dot radius based on output pixel size
    const dotR = Math.max(0.6, Math.min(sx, sy * lineSpacing) * 0.45);

    // walk every `lineSpacing` rows
    for (let y = 0; y < lumH; y += lineSpacing) {
      let acc = dotShift;
      for (let x = 0; x < lumW; x++) {
        const L = lum[y * lumW + x];
        // remap by threshold: threshold = 0.5 means linear; >0.5 means
        // suppress dark pixels, <0.5 means amplify dark
        const v = clamp((1 - L) - (threshold - 0.5), 0, 1);
        // tune density: factor controls how many dots per row at full black
        acc += v * 1.0;
        if (acc >= 1) {
          // place a dot
          const px = (x + 0.5) * sx;
          const py = (y + 0.5) * sy + dotR * 0.4;  // slight visual offset
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, Math.PI * 2);
          ctx.fill();
          acc -= 1;
        }
      }
    }
  }

  // List of available styles for shuffling
  const STYLE_LIST = [
    'mod-diffuse-y',
    'floyd-steinberg',
    'atkinson',
    'bayer',
    'halftone',
    'ascii'
  ];

  // ============================================================
  //  MAIN RENDER
  // ============================================================
  function render(ctx, W, H, t, P, opts) {
    // ----- determine effective style (for this frame) -----
    // If shuffle is on and animation is enabled (i.e. preview, not still export),
    // override P.style with one chosen by t / shuffleInterval.
    let effectiveStyle = P.style;
    const allowShuffle = opts && opts.animEnabled !== false;
    if (P.shuffleEnabled && allowShuffle && P.shuffleInterval > 0.01) {
      const slot = Math.floor(t / P.shuffleInterval);
      // Use a deterministic pseudo-random pick per slot so it's stable
      // within one slot but different across slots.
      const idx = Math.abs((slot * 2654435761) | 0) % STYLE_LIST.length;
      effectiveStyle = STYLE_LIST[idx];
    }

    // bg
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    if (!sourceImg) {
      // draw placeholder text
      ctx.fillStyle = P.inkColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '14px monospace';
      ctx.fillText('UPLOAD AN IMAGE', W / 2, H / 2);
      return;
    }

    // determine working canvas size from scale
    // Aim: match aspect ratio of source image into stage area, fit-contain.
    const imgAspect = sourceImg.naturalWidth / sourceImg.naturalHeight;
    const stageAspect = W / H;
    let dispW, dispH;
    if (imgAspect > stageAspect) {
      dispW = W;
      dispH = W / imgAspect;
    } else {
      dispH = H;
      dispW = H * imgAspect;
    }

    // working size scaled by P.scale
    const workW = Math.max(8, Math.round(dispW * P.scale));
    const workH = Math.max(8, Math.round(dispH * P.scale));

    if (workCv.width !== workW || workCv.height !== workH) {
      workCv.width = workW;
      workCv.height = workH;
    }
    workCtx.imageSmoothingEnabled = true;
    workCtx.drawImage(sourceImg, 0, 0, workW, workH);

    // read pixels
    const img = workCtx.getImageData(0, 0, workW, workH);
    const data = img.data;
    const lum = new Float32Array(workW * workH);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // luminance using ITU-R BT.709
      const L = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      lum[j] = tonalAdjust(L, P);
    }
    lum.__w = workW;
    lum.__h = workH;

    if (P.invert) {
      for (let i = 0; i < lum.length; i++) lum[i] = 1 - lum[i];
    }

    // animation modulation
    let threshold = P.luminanceThreshold / 100;
    let scanShift = 0;
    if (P.animate && opts && opts.animEnabled !== false) {
      const phase = t * P.animSpeed;
      switch (P.animMode) {
        case 'threshold':
          threshold += Math.sin(phase * Math.PI * 2) * 0.15;
          threshold = clamp(threshold, 0.05, 0.95);
          break;
        case 'scale':
          // ignored here, handled by P-clone per-frame
          break;
        case 'scanlinesShift':
          scanShift = (Math.sin(phase * Math.PI * 2) + 1) * 0.5;
          break;
      }
    }

    // compute output draw rect (centered)
    const offsetX = (W - dispW) / 2;
    const offsetY = (H - dispH) / 2;

    // apply chosen style (effectiveStyle = P.style or shuffled value)
    const ink = P.inkColor;
    const bg = P.bgColor;

    if (effectiveStyle === 'mod-diffuse-y') {
      renderModDiffuseY(ctx, lum, workW, workH, W, H, P.lineScale, threshold, ink, bg, scanShift);
      return;
    }

    if (effectiveStyle === 'halftone') {
      renderHalftone(ctx, lum, W, H, P.dotSize, threshold, ink, bg);
      return;
    }

    if (effectiveStyle === 'ascii') {
      renderAscii(ctx, lum, W, H, P.asciiSize, threshold, ink, bg);
      return;
    }

    // mask-based dithers (Floyd, Atkinson, Bayer)
    let mask;
    if (effectiveStyle === 'floyd-steinberg') {
      mask = ditherFloydSteinberg(lum, workW, workH, threshold);
    } else if (effectiveStyle === 'atkinson') {
      mask = ditherAtkinson(lum, workW, workH, threshold);
    } else if (effectiveStyle === 'bayer') {
      mask = ditherBayer(lum, workW, workH, threshold, P.bayerLevel);
    } else {
      // fallback: simple threshold
      mask = new Float32Array(lum.length);
      for (let i = 0; i < lum.length; i++) mask[i] = lum[i] > threshold ? 1 : 0;
    }

    // write mask to outCv (working size), then draw scaled to ctx
    if (outCv.width !== workW || outCv.height !== workH) {
      outCv.width = workW;
      outCv.height = workH;
    }
    const outImg = outCtx.createImageData(workW, workH);
    const outData = outImg.data;
    const inkRgb = hexToRgb(ink);
    const bgRgb = hexToRgb(bg);
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
      const m = mask[i];
      if (m > 0.5) {
        outData[j]     = inkRgb[0];
        outData[j + 1] = inkRgb[1];
        outData[j + 2] = inkRgb[2];
      } else {
        outData[j]     = bgRgb[0];
        outData[j + 1] = bgRgb[1];
        outData[j + 2] = bgRgb[2];
      }
      outData[j + 3] = 255;
    }
    outCtx.putImageData(outImg, 0, 0);

    // scale up to output canvas
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(outCv, 0, 0, workW, workH, offsetX, offsetY, dispW, dispH);
    ctx.imageSmoothingEnabled = true;
  }

  function setup(state) {
    // nothing stateful per-frame
  }

  function suggestLoopDuration(P) {
    // If shuffle is on, loop = full cycle through all styles
    if (P.shuffleEnabled && P.shuffleInterval > 0.01) {
      return P.shuffleInterval * STYLE_LIST.length;
    }
    // 4 seconds default for animation loops
    return 4.0 / Math.max(0.1, P.animSpeed);
  }

  return {
    id: 'dither',
    name: 'Image Dither',
    requiresImage: true,
    supportsAnimation: true,
    defaultParams,
    paramSchema,
    setup,
    render,
    suggestLoopDuration,
    setImage,
    hasImage
  };
})();
