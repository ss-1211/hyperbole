/* ============================================================
   SMPTE / VHS Color Bar Generator
   ============================================================
   Five glitch modes inspired by VHS test patterns:
     - CLASSIC      : full-stack: bars + PLUGE + scanline noise + jitter
     - TRACKING     : moving horizontal noise band sweeping vertically
     - DROPOUT      : random horizontal dropout strips (color loss)
     - HEAD_SWITCH  : bottom-edge tear/distortion (VHS head-switch)
     - DEGRADED     : heavy chroma bleed + color shift (multi-gen dub)

   All randomness is seeded by frame index modulo totalFrames so the
   sequence is fully loopable for PNG export.

   Auto-shuffle cycles modes at a chosen interval; loop duration is
   suggested as shuffleInterval × number_of_modes for clean export.
   ============================================================ */

window.HYPERBOLE_GENERATORS = window.HYPERBOLE_GENERATORS || {};

window.HYPERBOLE_GENERATORS.colorbar = (function () {

  // ===================================================================
  //  CONSTANTS
  // ===================================================================

  // SMPTE 75% color bars (the classic 7-bar)
  const SMPTE_BARS = [
    [192, 192, 192],  // 75% white (gray)
    [192, 192,   0],  // yellow
    [  0, 192, 192],  // cyan
    [  0, 192,   0],  // green
    [192,   0, 192],  // magenta
    [192,   0,   0],  // red
    [  0,   0, 192]   // blue
  ];

  // EBU 100% (8 bars including 100% white)
  const EBU_BARS = [
    [255, 255, 255],
    [255, 255,   0],
    [  0, 255, 255],
    [  0, 255,   0],
    [255,   0, 255],
    [255,   0,   0],
    [  0,   0, 255],
    [  0,   0,   0]
  ];

  // PLUGE strip colors (lower section of SMPTE pattern)
  const PLUGE = [
    [  0,  33,  76],   // -I (blue-purple)
    [255, 255, 255],   // 100 IRE white
    [ 50,   0, 105],   // +Q (purple)
    [  7,   7,   7],   // black (sub-black)
    [ 19,  19,  19],   // 7.5 IRE
    [  7,   7,   7],   // black
    [ 19,  19,  19],   // PLUGE
    [  7,   7,   7]
  ];

  const MODES = ['classic', 'tracking', 'dropout', 'headSwitch', 'degraded'];

  // ===================================================================
  //  DEFAULTS
  // ===================================================================
  const defaultParams = {
    mode:            'classic',     // classic / tracking / dropout / headSwitch / degraded
    barStyle:        'smpte',       // smpte / ebu
    showPluge:       1,             // 0/1: lower test strip
    plugeHeight:     0.25,          // ratio of canvas height

    // OSD
    osdShow:         1,
    osdText:         'PLAY \u25B6',  // ▶
    osdSize:         0.07,           // fraction of canvas height
    osdX:            0.05,           // 0..1 from left
    osdY:            0.10,           // 0..1 from top
    osdBlink:        0.5,            // 0..1 (0 = solid, 1 = aggressive flicker)

    // FX intensity
    scanNoise:       0.45,           // high-freq horizontal noise
    chromaBleed:     0.35,           // color smear horizontally
    colorBleedDown:  0.20,           // vertical bleed downward
    yJitter:         3,              // vertical jitter pixels
    trackingBar:     0.0,            // moving noise band intensity
    trackingSpeed:   0.6,            // band travel speed (cycles per loop)
    dropoutRate:     0.0,            // 0..1
    headSwitchAmt:   0.0,            // 0..1: bottom region tear
    colorBoost:      1.0,            // saturation multiplier 0.5..2.0

    // Auto-shuffle (cycle modes over time)
    autoShuffle:     0,
    shuffleInterval: 1.0             // seconds between mode swaps
  };

  // ===================================================================
  //  UI SCHEMA
  // ===================================================================
  const paramSchema = [
    { type: 'group', label: 'Mode' },
    { type: 'select', key: 'mode', label: 'Pattern', options: [
      { value: 'classic',    label: 'CLASSIC (full-stack)' },
      { value: 'tracking',   label: 'TRACKING (sweeping band)' },
      { value: 'dropout',    label: 'DROPOUT (signal loss)' },
      { value: 'headSwitch', label: 'HEAD-SWITCH (bottom tear)' },
      { value: 'degraded',   label: 'DEGRADED (multi-gen dub)' }
    ]},

    { type: 'group', label: 'Mode Presets' },
    { type: 'preset-row', presets: [
      { id: 'classic',  label: 'CLASSIC',
        values: { mode: 'classic',
          scanNoise: 0.45, chromaBleed: 0.35, colorBleedDown: 0.20,
          yJitter: 3, trackingBar: 0, dropoutRate: 0,
          headSwitchAmt: 0, colorBoost: 1.0 } },
      { id: 'track', label: 'TRACK',
        values: { mode: 'tracking',
          scanNoise: 0.30, chromaBleed: 0.25, colorBleedDown: 0.15,
          yJitter: 2, trackingBar: 0.85, trackingSpeed: 0.6,
          dropoutRate: 0, headSwitchAmt: 0, colorBoost: 1.0 } },
      { id: 'drop',  label: 'DROP',
        values: { mode: 'dropout',
          scanNoise: 0.20, chromaBleed: 0.15, colorBleedDown: 0.1,
          yJitter: 1, trackingBar: 0,
          dropoutRate: 0.55, headSwitchAmt: 0, colorBoost: 1.0 } },
      { id: 'head',  label: 'HEAD',
        values: { mode: 'headSwitch',
          scanNoise: 0.25, chromaBleed: 0.20, colorBleedDown: 0.15,
          yJitter: 2, trackingBar: 0, dropoutRate: 0,
          headSwitchAmt: 0.85, colorBoost: 1.0 } },
      { id: 'dub',   label: 'DUB',
        values: { mode: 'degraded',
          scanNoise: 0.55, chromaBleed: 0.85, colorBleedDown: 0.65,
          yJitter: 4, trackingBar: 0.2, dropoutRate: 0.1,
          headSwitchAmt: 0.2, colorBoost: 1.6 } }
    ]},

    { type: 'group', label: 'Pattern' },
    { type: 'select', key: 'barStyle', label: 'Bar Set', options: [
      { value: 'smpte', label: 'SMPTE 75% (7 bars)' },
      { value: 'ebu',   label: 'EBU 100% (8 bars)' }
    ]},
    { type: 'select', key: 'showPluge', label: 'Show PLUGE Strip', options: [
      { value: 0, label: 'No' }, { value: 1, label: 'Yes' }
    ]},
    { type: 'range', key: 'plugeHeight', label: 'PLUGE Height',
      min: 0.1, max: 0.4, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { showPluge: [1] }, indent: true },

    { type: 'group', label: 'OSD Text' },
    { type: 'select', key: 'osdShow', label: 'Show OSD', options: [
      { value: 0, label: 'No' }, { value: 1, label: 'Yes' }
    ]},
    { type: 'select', key: 'osdText', label: 'Preset',
      showFor: { osdShow: [1] }, indent: true,
      options: [
        { value: 'PLAY \u25B6',  label: 'PLAY ▶' },
        { value: 'REC \u25CF',   label: 'REC ●' },
        { value: '\u2759\u2759', label: 'PAUSE ❚❚' },
        { value: '\u25A0',       label: 'STOP ■' },
        { value: 'FF \u25B6\u25B6', label: 'FF ▶▶' },
        { value: 'REW \u25C0\u25C0', label: 'REW ◀◀' },
        { value: 'NO SIGNAL',    label: 'NO SIGNAL' },
        { value: 'AUTO TRACKING',label: 'AUTO TRACKING' },
        { value: 'CH 03',        label: 'CH 03' },
        { value: '__custom__',   label: '— Custom —' }
      ]
    },
    { type: 'text',  key: 'osdCustom', label: 'Custom Text',
      showFor: { osdShow: [1], osdText: ['__custom__'] }, indent: true,
      placeholder: 'TYPE TEXT' },
    { type: 'range', key: 'osdSize', label: 'Size',
      min: 0.03, max: 0.20, step: 0.005, fmt: v => v.toFixed(3),
      showFor: { osdShow: [1] }, indent: true },
    { type: 'range', key: 'osdX', label: 'Position X',
      min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { osdShow: [1] }, indent: true },
    { type: 'range', key: 'osdY', label: 'Position Y',
      min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { osdShow: [1] }, indent: true },
    { type: 'range', key: 'osdBlink', label: 'Flicker',
      min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { osdShow: [1] }, indent: true },

    { type: 'group', label: 'Effects' },
    { type: 'range', key: 'scanNoise',      label: 'Scanline Noise',     min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'chromaBleed',    label: 'Chroma Bleed',       min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'colorBleedDown', label: 'Bleed Down',         min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'yJitter',        label: 'Y Jitter (px)',      min: 0, max: 30, step: 1, fmt: v => v },
    { type: 'range', key: 'colorBoost',     label: 'Color Boost',        min: 0.5, max: 2.0, step: 0.05, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'Tracking Bar', showFor: { mode: ['tracking', 'degraded'] } },
    { type: 'range', key: 'trackingBar',   label: 'Bar Intensity', min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['tracking', 'degraded'] } },
    { type: 'range', key: 'trackingSpeed', label: 'Bar Speed',     min: -2, max: 2, step: 0.05, fmt: v => v.toFixed(2),
      showFor: { mode: ['tracking', 'degraded'], trackingBar: [v => v > 0] }, indent: true },

    { type: 'group', label: 'Dropout', showFor: { mode: ['dropout', 'degraded'] } },
    { type: 'range', key: 'dropoutRate', label: 'Dropout Rate', min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['dropout', 'degraded'] } },

    { type: 'group', label: 'Head Switch', showFor: { mode: ['headSwitch', 'degraded'] } },
    { type: 'range', key: 'headSwitchAmt', label: 'Tear Amount', min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['headSwitch', 'degraded'] } },

    { type: 'group', label: 'Auto-Shuffle' },
    { type: 'select', key: 'autoShuffle', label: 'Cycle Through Modes', options: [
      { value: 0, label: 'Off' }, { value: 1, label: 'On' }
    ]},
    { type: 'range', key: 'shuffleInterval', label: 'Interval (s)',
      min: 0.2, max: 5, step: 0.1, fmt: v => v.toFixed(1),
      showFor: { autoShuffle: [1] }, indent: true }
  ];

  // ===================================================================
  //  PRNG — seeded, deterministic per frame
  // ===================================================================
  // Mulberry32 hash; seed from frame index for loop coherence
  function hash32(x) {
    x |= 0; x = (x + 0x6D2B79F5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rng(seed, salt) {
    return hash32((seed * 73856093) ^ (salt * 19349663));
  }

  // ===================================================================
  //  DRAW BARS into an offscreen canvas (cached by params hash)
  // ===================================================================
  const barCache = { key: '', cv: document.createElement('canvas'), ctx: null };
  barCache.ctx = barCache.cv.getContext('2d');

  function buildBars(W, H, P) {
    const key = [W, H, P.barStyle, P.showPluge, P.plugeHeight].join('|');
    if (barCache.key === key) return barCache.cv;

    const cv = barCache.cv;
    cv.width = W;
    cv.height = H;
    const ctx = barCache.ctx;
    ctx.clearRect(0, 0, W, H);

    const bars = P.barStyle === 'ebu' ? EBU_BARS : SMPTE_BARS;
    const barH = P.showPluge ? Math.floor(H * (1 - P.plugeHeight)) : H;
    const barW = W / bars.length;
    for (let i = 0; i < bars.length; i++) {
      const c = bars[i];
      ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
      ctx.fillRect(Math.floor(i * barW), 0, Math.ceil(barW) + 1, barH);
    }

    if (P.showPluge) {
      const py = barH;
      const ph = H - barH;
      const pluge = PLUGE;
      const pw = W / pluge.length;
      for (let i = 0; i < pluge.length; i++) {
        const c = pluge[i];
        ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
        ctx.fillRect(Math.floor(i * pw), py, Math.ceil(pw) + 1, ph);
      }
    }

    barCache.key = key;
    return cv;
  }

  // ===================================================================
  //  EFFECTIVE MODE  (handles auto-shuffle)
  // ===================================================================
  function effectiveMode(t, P, loopDur) {
    if (!P.autoShuffle) return P.mode;
    // Cycle modes deterministically; one cycle = MODES.length × interval
    const interval = Math.max(0.05, P.shuffleInterval);
    const idx = Math.floor((t / interval) % MODES.length);
    return MODES[idx];
  }

  // ===================================================================
  //  EFFECTS  (all operate on the destination ctx)
  // ===================================================================

  // Apply Y jitter via offset compositing (shift entire image up/down)
  function applyYJitter(ctx, srcCv, W, H, t, P, frameSeed) {
    const amt = P.yJitter | 0;
    if (amt <= 0) {
      ctx.drawImage(srcCv, 0, 0);
      return;
    }
    // sub-frame jitter: change every ~3 frames worth of phase
    const phase = Math.floor(frameSeed / 2);
    const dy = ((rng(phase, 11) - 0.5) * 2 * amt) | 0;
    ctx.drawImage(srcCv, 0, dy);
    // wrap-around fill from opposite edge
    if (dy > 0) {
      ctx.drawImage(srcCv, 0, H - dy, W, dy, 0, 0, W, dy);
    } else if (dy < 0) {
      ctx.drawImage(srcCv, 0, 0, W, -dy, 0, H + dy, W, -dy);
    }
  }

  // Vertical color bleed: copy slightly-faded image downward
  function applyBleedDown(ctx, W, H, P) {
    if (P.colorBleedDown <= 0.001) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = P.colorBleedDown * 0.4;
    const offset = Math.max(2, Math.round(H * 0.012));
    ctx.drawImage(ctx.canvas, 0, offset);
    ctx.globalAlpha = P.colorBleedDown * 0.25;
    ctx.drawImage(ctx.canvas, 0, offset * 2);
    ctx.restore();
  }

  // Horizontal chroma bleed via sub-pixel shift of the canvas itself
  function applyChromaBleed(ctx, W, H, P) {
    if (P.chromaBleed <= 0.001) return;
    const shift = Math.max(1, Math.round(W * 0.008 * P.chromaBleed));
    // re-draw self shifted with multiply for soft bleed
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = P.chromaBleed * 0.5;
    ctx.drawImage(ctx.canvas, shift, 0);
    ctx.globalAlpha = P.chromaBleed * 0.4;
    ctx.drawImage(ctx.canvas, -shift, 0);
    ctx.restore();
  }

  // Random horizontal scanline noise (high-frequency salt-and-pepper rows)
  function applyScanNoise(ctx, W, H, P, frameSeed) {
    if (P.scanNoise <= 0.001) return;
    const intensity = P.scanNoise;
    const rowsToNoise = Math.floor(H * 0.4 * intensity);
    ctx.save();
    for (let n = 0; n < rowsToNoise; n++) {
      const y = (rng(frameSeed, n * 7 + 3) * H) | 0;
      const alpha = rng(frameSeed, n * 7 + 5) * 0.5 * intensity;
      const v = (rng(frameSeed, n * 7 + 11) * 255) | 0;
      ctx.fillStyle = `rgba(${v},${v},${v},${alpha.toFixed(3)})`;
      ctx.fillRect(0, y, W, 1);
    }
    ctx.restore();
  }

  // Tracking band: moving thick noise stripe
  function applyTrackingBar(ctx, W, H, t, P, loopDur, frameSeed) {
    if (P.trackingBar <= 0.001) return;
    // band travels through full height once per loopDur / abs(speed) cycles
    const cycles = Math.max(1, Math.round(P.trackingSpeed * loopDur));
    if (cycles === 0) return;
    const phase = ((t / loopDur) * cycles) % 1;
    const cy = phase * H;
    const bandH = Math.max(20, Math.floor(H * 0.10));
    const bandTop = (cy - bandH / 2) | 0;
    // dense noise inside the band
    const intensity = P.trackingBar;
    ctx.save();
    // dim the band area first
    ctx.fillStyle = `rgba(0,0,0,${(intensity * 0.3).toFixed(3)})`;
    ctx.fillRect(0, bandTop, W, bandH);
    // sprinkle white noise lines
    const lines = Math.floor(bandH * 0.8 * intensity);
    for (let n = 0; n < lines; n++) {
      const yo = (rng(frameSeed, n + 31) * bandH) | 0;
      const len = (rng(frameSeed, n + 41) * W * 0.6 + W * 0.2) | 0;
      const xo = (rng(frameSeed, n + 47) * (W - len)) | 0;
      const v = (rng(frameSeed, n + 53) * 200 + 55) | 0;
      const a = rng(frameSeed, n + 59) * intensity;
      ctx.fillStyle = `rgba(${v},${v},${v},${a.toFixed(3)})`;
      ctx.fillRect(xo, bandTop + yo, len, 1);
    }
    ctx.restore();
  }

  // Dropout: random horizontal strips replaced with a darker / desaturated copy
  function applyDropout(ctx, srcCv, W, H, P, frameSeed) {
    if (P.dropoutRate <= 0.001) return;
    const stripCount = Math.floor(P.dropoutRate * 12) + 1;
    ctx.save();
    for (let i = 0; i < stripCount; i++) {
      // appear/disappear deterministically per loop
      const present = rng(frameSeed, i * 13 + 1) < P.dropoutRate;
      if (!present) continue;
      const y = (rng(frameSeed, i * 13 + 3) * H) | 0;
      const h = Math.max(2, ((rng(frameSeed, i * 13 + 5) * 12 + 2) * P.dropoutRate) | 0);
      // Choose effect: full white-flash, full black, or shifted band
      const kind = rng(frameSeed, i * 13 + 7);
      if (kind < 0.4) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fillRect(0, y, W, h);
      } else if (kind < 0.7) {
        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, y, W, h);
      } else {
        // horizontal-shift dropout
        const dx = (rng(frameSeed, i * 13 + 9) - 0.5) * W * 0.4;
        ctx.drawImage(srcCv, 0, y, W, h, dx, y, W, h);
      }
    }
    ctx.restore();
  }

  // Head switch: bottom region progressively skewed/torn
  function applyHeadSwitch(ctx, srcCv, W, H, P, frameSeed) {
    if (P.headSwitchAmt <= 0.001) return;
    const amt = P.headSwitchAmt;
    const regionTop = Math.floor(H * 0.85);
    const regionH = H - regionTop;
    ctx.save();
    // Each row in region shifts horizontally by an increasing-then-jittered amount
    for (let y = 0; y < regionH; y++) {
      const u = y / regionH;
      const baseShift = u * u * W * 0.4 * amt;
      const jit = (rng(frameSeed, y + 71) - 0.5) * W * 0.05 * amt;
      const dx = (baseShift + jit) | 0;
      ctx.drawImage(srcCv, 0, regionTop + y, W, 1, dx, regionTop + y, W, 1);
    }
    // black gap above region
    const gapY = regionTop - 2;
    ctx.fillStyle = `rgba(0,0,0,${amt.toFixed(2)})`;
    ctx.fillRect(0, gapY, W, 2);
    ctx.restore();
  }

  // Color boost via canvas filter
  function applyColorBoost(ctx, W, H, P) {
    if (Math.abs(P.colorBoost - 1.0) < 0.01) return;
    // Use composite "saturation" approach: overlay a saturated copy
    // Simplest: use ctx.filter (supported in modern Canvas2D)
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    const tctx = tmp.getContext('2d');
    tctx.filter = `saturate(${P.colorBoost})`;
    tctx.drawImage(ctx.canvas, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(tmp, 0, 0);
  }

  // OSD text overlay with optional flicker
  function drawOSD(ctx, W, H, t, P, loopDur, frameSeed) {
    if (!P.osdShow) return;
    let text = P.osdText;
    if (text === '__custom__') {
      text = (P.osdCustom || '').toUpperCase() || ' ';
    }
    // flicker: deterministic per frame, off probability ~ blink
    if (P.osdBlink > 0.001) {
      const flick = rng(frameSeed, 999);
      if (flick < P.osdBlink * 0.4) return;  // skip frame entirely
    }
    const size = Math.max(10, H * P.osdSize);
    ctx.save();
    ctx.font = `900 ${size}px "Courier New", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffffff';
    // black drop-shadow for readability over saturated bars
    ctx.shadowColor = '#000';
    ctx.shadowBlur = size * 0.15;
    ctx.shadowOffsetX = size * 0.06;
    ctx.shadowOffsetY = size * 0.06;
    ctx.fillText(text, W * P.osdX, H * P.osdY);
    ctx.restore();
  }

  // ===================================================================
  //  MAIN RENDER
  // ===================================================================
  function render(ctx, W, H, t, P, opts) {
    // Determine total loop length used for seeding/looping
    const loopDur = (opts && opts.loopDur) || suggestLoopDuration(P);
    const fps = (opts && opts.fps) || 30;
    const totalFrames = Math.max(1, Math.round(loopDur * fps));
    // frame index in [0, totalFrames). For preview, use t directly.
    const frameIndex = Math.floor((t / loopDur) * totalFrames) % totalFrames;
    // distinct seed mixed with mode so shuffled modes don't share noise
    const Peff = Object.assign({}, P, { mode: effectiveMode(t, P, loopDur) });
    const seed = frameIndex + (MODES.indexOf(Peff.mode) + 1) * 100003;

    // Build base bars (cached)
    const barsCv = buildBars(W, H, Peff);

    // Stage A: clear + apply Y jitter (also draws base image)
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    applyYJitter(ctx, barsCv, W, H, t, Peff, seed);

    // Stage B: bleed downward (creates trail trail)
    applyBleedDown(ctx, W, H, Peff);

    // Stage C: chroma bleed horizontal
    applyChromaBleed(ctx, W, H, Peff);

    // Stage D: mode-specific
    if (Peff.mode === 'dropout' || Peff.mode === 'degraded') {
      applyDropout(ctx, barsCv, W, H, Peff, seed);
    }
    if (Peff.mode === 'tracking' || Peff.mode === 'degraded') {
      applyTrackingBar(ctx, W, H, t, Peff, loopDur, seed);
    }
    if (Peff.mode === 'headSwitch' || Peff.mode === 'degraded') {
      applyHeadSwitch(ctx, barsCv, W, H, Peff, seed);
    }

    // Stage E: scanline noise (always on)
    applyScanNoise(ctx, W, H, Peff, seed);

    // Stage F: color boost
    applyColorBoost(ctx, W, H, Peff);

    // Stage G: OSD
    drawOSD(ctx, W, H, t, Peff, loopDur, seed);
  }

  function setup(state) {
    barCache.key = '';  // invalidate cache between generator switches
  }

  function suggestLoopDuration(P) {
    if (P.autoShuffle) {
      return Math.max(0.5, P.shuffleInterval) * MODES.length;
    }
    // Default loop: tracking bar travels fully across once
    if (P.mode === 'tracking' && P.trackingBar > 0.01 && Math.abs(P.trackingSpeed) > 0.01) {
      return 1 / Math.abs(P.trackingSpeed) * 2;  // 2 traversals
    }
    return 2.0;
  }

  return {
    id: 'colorbar',
    name: 'SMPTE / VHS Bar',
    defaultParams,
    paramSchema,
    setup,
    render,
    suggestLoopDuration
  };
})();
