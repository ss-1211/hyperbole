/* ============================================================
   Audio Visualizer Generator
   ============================================================
   Three visualizer styles in one generator:
     - BAR    : FFT bar with peak hold
     - WAVE   : delay waveform with green + white traces
     - RADIAL : radial spectrum with 3-band EQ wiggle

   Simulation mode only — uses pseudo-random sine sums to drive
   the visuals so it loops cleanly and exports deterministically
   without requiring an audio source.

   Adapted from HYPERBOLE® VIZ GENERATOR (Apr 2026).
   ============================================================ */

window.HYPERBOLE_GENERATORS = window.HYPERBOLE_GENERATORS || {};

window.HYPERBOLE_GENERATORS.audioViz = (function () {

  // ----- defaults: BAR/WAVE/RADIALの値を1つにマージ -----
  const defaultParams = {
    style:        'bar',            // bar / wave / radial
    primaryColor: '#00FF41',
    bgColor:      '#000000',

    // BAR specific
    bands:        128,
    barWidth:     7,
    gap:          2.5,
    amp:          57,
    freqStart:    0.03,
    freqEnd:      0.71,
    peakShow:     1,
    peakHold:     5,
    peakDecay:    1.2,
    peakH:        2.5,

    // WAVE specific
    whiteAmp:     30,
    whiteWidth:   1.5,
    whiteOp:      1.0,
    greenAmp:     65,
    greenWidth:   1.5,
    greenOp:      1.0,
    delay:        13,
    delayOp:      0.4,
    vertShow:     1,
    vertWidth:    3,

    // RADIAL specific
    baseR:        115,
    fluid:        40,
    fspeed:       1.5,
    radialBands:  120,
    outerAmp:     80,
    innerAmp:     60,
    radialBarW:   1.5,
    contrast:     2.0,
    lowRange:     0.15,
    midRange:     0.18,
    highRange:    0.10,
    lowBase:      0.95, lowWAmt: 0.65, lowWSpd: 2.4,
    midBase:      1.15, midWAmt: 0.55, midWSpd: 1.3,
    highBase:     1.0,  highWAmt: 0.55, highWSpd: 0.1
  };

  const paramSchema = [
    { type: 'group', label: 'Style' },
    { type: 'select', key: 'style', label: 'Visualizer', options: [
      { value: 'bar',    label: 'BAR (FFT + Peak Hold)' },
      { value: 'wave',   label: 'WAVE (Delay Waveform)' },
      { value: 'radial', label: 'RADIAL (3-Band EQ)' }
    ]},

    { type: 'group', label: 'Color' },
    { type: 'color', key: 'primaryColor', label: 'Primary' },
    { type: 'color', key: 'bgColor',      label: 'Background' },
    { type: 'preset-row', presets: [
      { id: 'crt',   label: 'CRT',   values: { primaryColor: '#00FF41', bgColor: '#000000' } },
      { id: 'mono',  label: 'MONO',  values: { primaryColor: '#ffffff', bgColor: '#000000' } },
      { id: 'amber', label: 'AMBER', values: { primaryColor: '#ffb000', bgColor: '#1a0d00' } },
      { id: 'vhs',   label: 'VHS',   values: { primaryColor: '#ff2bd6', bgColor: '#0a0014' } },
      { id: 'cyber', label: 'CYBER', values: { primaryColor: '#00e5ff', bgColor: '#02060d' } }
    ]},

    // ─── BAR ───
    { type: 'group', label: 'BAR — Layout' },
    { type: 'range', key: 'bands',     label: 'Bands',     min: 8,  max: 256, step: 1, fmt: v => v },
    { type: 'range', key: 'barWidth',  label: 'Bar Width', min: 1,  max: 20,  step: 0.5, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'gap',       label: 'Gap',       min: 0,  max: 10,  step: 0.5, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'amp',       label: 'Amplitude', min: 10, max: 100, step: 1, fmt: v => v },
    { type: 'range', key: 'freqStart', label: 'Freq Start',min: 0,    max: 0.3, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'freqEnd',   label: 'Freq End',  min: 0.3,  max: 1,   step: 0.01, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'BAR — Peak Hold' },
    { type: 'select', key: 'peakShow', label: 'Show Peak Lines', options: [
      { value: 0, label: 'No' }, { value: 1, label: 'Yes' }
    ]},
    { type: 'range', key: 'peakHold',  label: 'Peak Hold (frames)', min: 1, max: 120, step: 1, fmt: v => v },
    { type: 'range', key: 'peakDecay', label: 'Peak Decay',         min: 0.1, max: 10, step: 0.1, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'peakH',     label: 'Peak Height',        min: 1, max: 8, step: 0.5, fmt: v => v.toFixed(1) },

    // ─── WAVE ───
    { type: 'group', label: 'WAVE — White Line' },
    { type: 'range', key: 'whiteAmp',   label: 'White Amp',     min: 5,   max: 100, step: 1, fmt: v => v },
    { type: 'range', key: 'whiteWidth', label: 'White Width',   min: 0.5, max: 5,   step: 0.5, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'whiteOp',    label: 'White Opacity', min: 0.1, max: 1,   step: 0.05, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'WAVE — Primary Line' },
    { type: 'range', key: 'greenAmp',   label: 'Primary Amp',     min: 5,   max: 100, step: 1, fmt: v => v },
    { type: 'range', key: 'greenWidth', label: 'Primary Width',   min: 0.5, max: 5,   step: 0.5, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'greenOp',    label: 'Primary Opacity', min: 0.1, max: 1,   step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'delay',      label: 'Delay Frames',    min: 1,   max: 20,  step: 1, fmt: v => v },
    { type: 'range', key: 'delayOp',    label: 'Delay Opacity',   min: 0.05, max: 0.8, step: 0.05, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'WAVE — Verticals' },
    { type: 'select', key: 'vertShow', label: 'Vert Lines', options: [
      { value: 0, label: 'No' }, { value: 1, label: 'Yes' }
    ]},
    { type: 'range', key: 'vertWidth', label: 'Vert Width', min: 1, max: 8, step: 0.5, fmt: v => v.toFixed(1) },

    // ─── RADIAL ───
    { type: 'group', label: 'RADIAL — Circle' },
    { type: 'range', key: 'baseR',  label: 'Base Radius', min: 40,  max: 240, step: 1, fmt: v => v },
    { type: 'range', key: 'fluid',  label: 'Shape Fluid', min: 0,   max: 120, step: 1, fmt: v => v },
    { type: 'range', key: 'fspeed', label: 'Fluid Speed', min: 0.1, max: 5,   step: 0.1, fmt: v => v.toFixed(1) },

    { type: 'group', label: 'RADIAL — Bars' },
    { type: 'range', key: 'radialBands', label: 'Bands',     min: 16, max: 256, step: 1, fmt: v => v },
    { type: 'range', key: 'outerAmp',    label: 'Amp Outer', min: 5,  max: 150, step: 1, fmt: v => v },
    { type: 'range', key: 'innerAmp',    label: 'Amp Inner', min: 0,  max: 150, step: 1, fmt: v => v },
    { type: 'range', key: 'radialBarW',  label: 'Bar Width', min: 0.5, max: 6, step: 0.5, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'contrast',    label: 'Contrast',  min: 0.5, max: 5, step: 0.1, fmt: v => v.toFixed(1) },

    { type: 'group', label: 'RADIAL — 3-Band EQ' },
    { type: 'range', key: 'lowRange',  label: 'Low End',  min: 0.01, max: 0.3, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'midRange',  label: 'Mid End',  min: 0.05, max: 0.6, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'highRange', label: 'High End', min: 0.1,  max: 1,   step: 0.01, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'RADIAL — Low Band' },
    { type: 'range', key: 'lowBase',  label: 'Base Gain',  min: 0,   max: 3, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'lowWAmt',  label: 'Wiggle Amt', min: 0,   max: 2, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'lowWSpd',  label: 'Wiggle Spd', min: 0.1, max: 5, step: 0.1, fmt: v => v.toFixed(1) },

    { type: 'group', label: 'RADIAL — Mid Band' },
    { type: 'range', key: 'midBase',  label: 'Base Gain',  min: 0,   max: 3, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'midWAmt',  label: 'Wiggle Amt', min: 0,   max: 2, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'midWSpd',  label: 'Wiggle Spd', min: 0.1, max: 5, step: 0.1, fmt: v => v.toFixed(1) },

    { type: 'group', label: 'RADIAL — High Band' },
    { type: 'range', key: 'highBase',  label: 'Base Gain',  min: 0,   max: 3, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'highWAmt',  label: 'Wiggle Amt', min: 0,   max: 2, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'highWSpd',  label: 'Wiggle Spd', min: 0.1, max: 5, step: 0.1, fmt: v => v.toFixed(1) }
  ];

  // ============================================================
  //  STATE  (peak hold / wave history) — kept as module-private
  //  These persist across frames during preview. For export we
  //  reset on setup() so the loop is deterministic.
  // ============================================================
  let peaks = [];
  let peakHolds = [];
  let waveHistory = [];

  function setup(state) {
    peaks = [];
    peakHolds = [];
    waveHistory = [];
  }

  // ============================================================
  //  HELPERS
  // ============================================================

  // 0-1 clamp
  function cl(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Pseudo audio level for one band at time t (drives sim mode for BAR & RADIAL)
  function fakeLevel(nx, t, falloffPow) {
    const v = Math.abs(
      Math.sin(nx * 8  + t * 1.3) * 0.45 +
      Math.sin(nx * 19 + t * 2.1) * 0.25 +
      Math.sin(nx * 4  + t * 0.7) * 0.20 +
      Math.sin(nx * 33 + t * 3.4) * 0.10
    ) * Math.pow(1 - nx * 0.5, falloffPow !== undefined ? falloffPow : 1.2);
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  // Wiggle for radial 3-band EQ
  function wiggle(base, amt, spd, phase, t) {
    const w =
      Math.sin(t * spd + phase)               * 0.5 +
      Math.sin(t * spd * 1.7 + phase * 1.3)   * 0.3 +
      Math.sin(t * spd * 0.4 + phase * 0.7)   * 0.2;
    return Math.max(0, base + w * amt);
  }

  // ============================================================
  //  STYLE: BAR  (VIZ_01)
  // ============================================================
  function drawBar(ctx, W, H, P, t) {
    const bands  = Math.round(P.bands);
    const barW   = P.barWidth;
    const gap    = P.gap;
    const amp    = P.amp / 100 * (H - 10);
    const totalW = bands * barW + (bands - 1) * gap;
    const startX = (W - totalW) / 2;

    if (peaks.length !== bands) {
      peaks = new Array(bands).fill(0);
      peakHolds = new Array(bands).fill(0);
    }

    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = P.primaryColor;

    for (let i = 0; i < bands; i++) {
      const nx = i / bands;
      const level = fakeLevel(nx, t, 1.2);

      const barH = Math.max(2, level * amp);
      const x = startX + i * (barW + gap);
      ctx.fillRect(x, H - barH, barW, barH);

      if (P.peakShow) {
        if (barH > peaks[i]) {
          peaks[i] = barH;
          peakHolds[i] = P.peakHold;
        } else if (peakHolds[i] > 0) {
          peakHolds[i]--;
        } else {
          peaks[i] = Math.max(0, peaks[i] - P.peakDecay * (H / 30));
        }
        if (peaks[i] > barH + P.peakH) {
          ctx.fillRect(x, H - peaks[i] - P.peakH, barW, P.peakH);
        }
      }
    }
  }

  // ============================================================
  //  STYLE: WAVE  (VIZ_02)
  // ============================================================
  function getWavePts(W, H, ampPct, t) {
    const cy = H / 2;
    const samples = 512;
    const pts = [];
    const ampPx = H * ampPct / 100 * 0.9;
    for (let i = 0; i < samples; i++) {
      const nx = i / samples;
      const x = nx * W;
      const v =
        Math.sin(nx * 23 + t * 2.1)  * 0.30 +
        Math.sin(nx * 51 + t * 3.7)  * 0.22 +
        Math.sin(nx * 11 + t * 1.3)  * 0.18 +
        Math.sin(nx * 89 + t * 5.1)  * 0.14 +
        Math.sin(nx * 7  + t * 0.9)  * 0.10 +
        Math.sin(nx * 137+ t * 6.3)  * 0.06;
      pts.push({ x, y: cy + v * ampPx });
    }
    return pts;
  }

  function drawWaveLine(ctx, pts, lw, color) {
    if (!pts || !pts.length) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.shadowBlur = 0;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 20;
    ctx.beginPath();
    pts.forEach((pt, i) => i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y));
    ctx.stroke();
    ctx.restore();
  }

  // hex to rgba string
  function hexToRgba(hex, alpha) {
    const m = hex.replace('#', '');
    const r = parseInt(m.slice(0, 2), 16);
    const g = parseInt(m.slice(2, 4), 16);
    const b = parseInt(m.slice(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  function drawWave(ctx, W, H, P, t) {
    const currentPts = getWavePts(W, H, P.greenAmp, t);
    waveHistory.unshift(currentPts);
    if (waveHistory.length > 21) waveHistory.pop();

    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    // delay layer (older frame of waveform)
    const delayIdx = Math.min(Math.round(P.delay), waveHistory.length - 1);
    if (delayIdx > 0 && waveHistory[delayIdx]) {
      drawWaveLine(ctx, waveHistory[delayIdx], P.greenWidth,
        hexToRgba(P.primaryColor, P.delayOp));
    }
    // primary line
    drawWaveLine(ctx, currentPts, P.greenWidth,
      hexToRgba(P.primaryColor, P.greenOp));
    // white line
    const whitePts = getWavePts(W, H, P.whiteAmp, t * 0.93);
    drawWaveLine(ctx, whitePts, P.whiteWidth,
      'rgba(255,255,255,' + P.whiteOp + ')');

    if (P.vertShow) {
      ctx.save();
      ctx.strokeStyle = P.primaryColor;
      ctx.lineWidth = P.vertWidth;
      [2, W - 2].forEach(x => {
        ctx.beginPath();
        ctx.moveTo(x, 10); ctx.lineTo(x, H - 10);
        ctx.stroke();
      });
      ctx.restore();
    }
  }

  // ============================================================
  //  STYLE: RADIAL  (VIZ_03)
  // ============================================================
  function getRadialLevel(i, bands, P, lowG, midG, highG, t) {
    const nx = i / bands;
    const falloff = Math.pow(1 - nx * 0.4, 1.0);
    const base = Math.abs(
      Math.sin(nx * 8  + t * 1.3) * 0.45 +
      Math.sin(nx * 19 + t * 2.1) * 0.25 +
      Math.sin(nx * 4  + t * 0.7) * 0.20 +
      Math.sin(nx * 33 + t * 3.4) * 0.10
    ) * falloff;
    const g = nx < 1/3 ? lowG : nx < 2/3 ? midG : highG;
    return Math.min(base * g, 1);
  }

  function drawRadial(ctx, W, H, P, t) {
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2, cy = H / 2;
    const lowG  = wiggle(P.lowBase,  P.lowWAmt,  P.lowWSpd,  0,   t);
    const midG  = wiggle(P.midBase,  P.midWAmt,  P.midWSpd,  2.1, t);
    const highG = wiggle(P.highBase, P.highWAmt, P.highWSpd, 4.3, t);

    const bands    = Math.round(P.radialBands);
    const baseR    = P.baseR;
    const fluid    = P.fluid;
    const fspeed   = P.fspeed;
    const outerAmp = P.outerAmp;
    const barW     = P.radialBarW;
    const contrast = P.contrast || 2.0;

    ctx.strokeStyle = P.primaryColor;
    ctx.lineWidth = barW;
    ctx.lineCap = 'butt';

    for (let i = 0; i < bands; i++) {
      const angle = (i / bands) * Math.PI * 2;
      const nx = i / bands;
      const rawLevel = getRadialLevel(i, bands, P, lowG, midG, highG, t);

      const level = Math.pow(rawLevel, 1.0 / contrast);

      const fo =
        Math.sin(nx * Math.PI * 3 + t * fspeed * 0.6) * 0.5 +
        Math.sin(nx * Math.PI * 5 - t * fspeed * 0.4) * 0.3 +
        Math.sin(nx * Math.PI * 1 + t * fspeed * 0.2) * 0.2;
      const r = baseR + fo * fluid * (0.1 + rawLevel * 1.2) + rawLevel * fluid * 0.5;

      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);

      const outerLen = level * outerAmp;
      const innerLen = level * P.innerAmp * (0.5 + rawLevel * 1.5);

      ctx.beginPath();
      ctx.moveTo(px - dx * innerLen, py - dy * innerLen);
      ctx.lineTo(px + dx * outerLen, py + dy * outerLen);
      ctx.stroke();
    }
  }

  // ============================================================
  //  MAIN RENDER
  // ============================================================
  function render(ctx, W, H, t, P, opts) {
    // Multiply t by 4 to roughly match the original VIZ generator's
    // globalT increment of 0.04 per frame at 60fps (= 2.4 per sec)
    const vt = t * 2.4;
    switch (P.style) {
      case 'wave':   drawWave(ctx, W, H, P, vt); break;
      case 'radial': drawRadial(ctx, W, H, P, vt); break;
      case 'bar':
      default:       drawBar(ctx, W, H, P, vt); break;
    }
  }

  function suggestLoopDuration(P) {
    // The sim functions use multiple irrational frequencies so an exact
    // loop is hard. 4 seconds feels long enough to look organic.
    return 4.0;
  }

  return {
    id: 'audioViz',
    name: 'Audio Visualizer',
    requiresImage: false,
    supportsAnimation: true,
    defaultParams,
    paramSchema,
    setup,
    render,
    suggestLoopDuration
  };
})();
