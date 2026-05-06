/* ============================================================
   Glitch Morph Generator
   Two texts, A→B→A→B ping-pong with progressive top-to-bottom
   glitch distortion.
   ============================================================ */

window.HYPERBOLE_GENERATORS = window.HYPERBOLE_GENERATORS || {};

window.HYPERBOLE_GENERATORS.glitch = (function () {

  const defaultParams = {
    textA: 'REQUESTS',
    textB: 'NO',
    font: 'Helvetica, Arial, sans-serif',
    weight: '900',
    textSize: 0.40,
    cycleDur: 4.0,
    holdDur: 0.5,
    waveSpread: 0.40,
    easing: 'ease-in-out',
    pixPeak: 0.70,
    hShiftPeak: 0.30,
    skewPeak: 0.30,
    bandRes: 60,
    subtleGlitch: 0.05,
    scanlines: 0.20,
    noise: 0.05,
    color: '#000000',
    bg: '#e8d7d7'
  };

  const paramSchema = [
    { type: 'group', label: 'Text' },
    { type: 'text',  key: 'textA', label: 'Text A' },
    { type: 'text',  key: 'textB', label: 'Text B' },
    { type: 'select', key: 'font', label: 'Font', options: [
      { value: 'Helvetica, Arial, sans-serif', label: 'Helvetica' },
      { value: '"Arial Black", sans-serif',   label: 'Arial Black' },
      { value: 'Impact, sans-serif',          label: 'Impact' },
      { value: 'Georgia, serif',              label: 'Georgia' },
      { value: '"Times New Roman", serif',    label: 'Times' },
      { value: '"Courier New", monospace',    label: 'Courier' },
      { value: '"SF Mono", Menlo, monospace', label: 'SF Mono' }
    ]},
    { type: 'select', key: 'weight', label: 'Weight', options: [
      { value: '400', label: 'Regular' },
      { value: '700', label: 'Bold' },
      { value: '900', label: 'Black' }
    ]},
    { type: 'range', key: 'textSize', label: 'Text Size', min: 0.10, max: 0.90, step: 0.01, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'Transition Timing' },
    { type: 'range', key: 'cycleDur',   label: 'Cycle Duration (s)', min: 0.5, max: 20, step: 0.1, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'holdDur',    label: 'Hold After (s)',     min: 0,   max: 5,  step: 0.1, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'waveSpread', label: 'Wave Spread',        min: 0,   max: 1,  step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'select', key: 'easing', label: 'Easing', options: [
      { value: 'linear',      label: 'Linear' },
      { value: 'ease-in-out', label: 'Ease In Out' },
      { value: 'ease-in',     label: 'Ease In' },
      { value: 'ease-out',    label: 'Ease Out' }
    ]},

    { type: 'group', label: 'Glitch (mid-transition)' },
    { type: 'range', key: 'pixPeak',    label: 'Pixelate Peak',    min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'hShiftPeak', label: 'H-Shift Peak',     min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'skewPeak',   label: 'Skew Peak',        min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'bandRes',    label: 'Band Resolution',  min: 10, max: 200, step: 1, fmt: v => v },

    { type: 'group', label: 'Always-on FX' },
    { type: 'range', key: 'subtleGlitch', label: 'Subtle Glitch', min: 0, max: 0.5, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'scanlines',    label: 'Scanlines',     min: 0, max: 1,   step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'noise',        label: 'Noise',         min: 0, max: 1,   step: 0.01, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'Style' },
    { type: 'color', key: 'color', label: 'Text Color' },
    { type: 'color', key: 'bg',    label: 'BG Color' },

    { type: 'group', label: 'Color Presets' },
    { type: 'preset-row', presets: [
      { id: 'orig',  label: 'ORIG',  values: { color: '#000000', bg: '#e8d7d7' } },
      { id: 'mono',  label: 'MONO',  values: { color: '#ffffff', bg: '#000000' } },
      { id: 'crt',   label: 'CRT',   values: { color: '#00ff41', bg: '#001a08' } },
      { id: 'vhs',   label: 'VHS',   values: { color: '#ff2bd6', bg: '#0a0014' } },
      { id: 'amber', label: 'AMBER', values: { color: '#ffb000', bg: '#1a0d00' } }
    ]}
  ];

  // ----- offscreen canvases (reused across calls) -----
  // These are module-private so we don't recreate every frame.
  const textCvA = document.createElement('canvas');
  const textCtxA = textCvA.getContext('2d');
  const textCvB = document.createElement('canvas');
  const textCtxB = textCvB.getContext('2d');
  const pxCv = document.createElement('canvas');
  const pxCtx = pxCv.getContext('2d');
  const nzCv = document.createElement('canvas');
  const nzCtx = nzCv.getContext('2d');

  function drawTextTo(ctx2, txt, w, h, P) {
    // canvas at native pixel size of caller
    if (ctx2.canvas.width !== w || ctx2.canvas.height !== h) {
      ctx2.canvas.width = w;
      ctx2.canvas.height = h;
    }
    ctx2.setTransform(1, 0, 0, 1, 0, 0);
    ctx2.clearRect(0, 0, w, h);

    let fontSize = h * P.textSize;
    if (fontSize < 12) fontSize = 12;
    ctx2.font = P.weight + ' ' + fontSize + 'px ' + P.font;
    ctx2.fillStyle = P.color;
    ctx2.textAlign = 'center';
    ctx2.textBaseline = 'middle';

    const maxW = w * 0.92;
    const measured = ctx2.measureText(txt).width;
    if (measured > maxW && measured > 0) {
      fontSize *= maxW / measured;
      ctx2.font = P.weight + ' ' + fontSize + 'px ' + P.font;
    }
    ctx2.fillText(txt, w / 2, h / 2);
  }

  function easing(t, kind) {
    switch (kind) {
      case 'ease-in':     return t * t;
      case 'ease-out':    return 1 - (1 - t) * (1 - t);
      case 'ease-in-out': return t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t + 2, 2) / 2;
      default:            return t;
    }
  }

  function hash(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
  }

  function bandProgress(globalP, bandU, spread) {
    const ext = globalP * (1 + spread) - bandU * spread;
    if (ext < 0) return 0;
    if (ext > 1) return 1;
    return ext;
  }

  function render(ctx, W, H, t, P, opts) {
    // text canvases at full output size (no DPR — this is unified)
    drawTextTo(textCtxA, P.textA, W, H, P);
    drawTextTo(textCtxB, P.textB, W, H, P);

    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, W, H);

    // ----- compute global progress -----
    const halfCycle = P.cycleDur + P.holdDur;
    const fullCycle = halfCycle * 2;
    const ct = ((t % fullCycle) + fullCycle) % fullCycle;

    let globalP;
    if (ct < halfCycle) {
      const sub = ct;
      globalP = (sub < P.cycleDur) ? easing(sub / P.cycleDur, P.easing) : 1;
    } else {
      const sub = ct - halfCycle;
      globalP = (sub < P.cycleDur) ? 1 - easing(sub / P.cycleDur, P.easing) : 0;
    }

    // ----- draw bands -----
    const N = Math.max(2, Math.floor(P.bandRes));
    const bandH = H / N;
    const stepFrame = Math.floor(t * 12);

    for (let b = 0; b < N; b++) {
      const sy = b * bandH;
      const sh = bandH + 0.5;
      const bandCenter = sy + bandH / 2;
      const bandU = 1 - (bandCenter / H);
      const lp = bandProgress(globalP, bandU, P.waveSpread);
      const activeness = 4 * lp * (1 - lp);

      const r1 = hash(b, stepFrame);
      const r2 = hash(b + 0.31, stepFrame);
      const r3 = hash(b + 0.71, stepFrame);
      const r4 = hash(b + 0.97, stepFrame);

      const flipThresh = 0.5 + (r1 - 0.5) * 0.3;
      const useB = lp > flipThresh;
      const src = useB ? textCvB : textCvA;

      const hShiftPx =
        (r2 - 0.5) * 2 * W * (P.hShiftPeak * activeness + P.subtleGlitch * 0.5);
      const skew = (r3 - 0.5) * 2 * (P.skewPeak * activeness);
      const pixActive = activeness > 0.2 && r4 < P.pixPeak * activeness * 1.5;
      const pxBlock = pixActive
        ? Math.max(2, Math.round(bandH * (0.6 + r4 * 1.6)))
        : 0;

      ctx.save();
      const cx = W / 2;
      const cy = bandCenter;
      ctx.translate(cx + hShiftPx, cy);
      ctx.transform(1, 0, skew, 1, 0, 0);
      ctx.translate(-cx, -cy);

      if (pixActive) {
        const lowW = Math.max(2, Math.floor(W / pxBlock));
        const lowH = Math.max(1, Math.floor(sh / pxBlock));
        if (pxCv.width !== lowW || pxCv.height !== lowH) {
          pxCv.width = lowW;
          pxCv.height = lowH;
        }
        pxCtx.imageSmoothingEnabled = false;
        pxCtx.clearRect(0, 0, lowW, lowH);
        pxCtx.drawImage(src, 0, sy, W, sh, 0, 0, lowW, lowH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(pxCv, 0, 0, lowW, lowH, 0, sy, W, sh);
        ctx.imageSmoothingEnabled = true;
      } else {
        ctx.drawImage(src, 0, sy, W, sh, 0, sy, W, sh);
      }
      ctx.restore();
    }

    // scanlines
    if (P.scanlines > 0.001) {
      ctx.globalAlpha = P.scanlines * 0.5;
      ctx.fillStyle = '#000';
      const lineH = 2;
      for (let y = 0; y < H; y += lineH * 2) {
        ctx.fillRect(0, y, W, lineH);
      }
      ctx.globalAlpha = 1;
    }

    // noise
    if (P.noise > 0.001) {
      const nW = Math.max(1, Math.floor(W));
      const nH = Math.max(1, Math.floor(H));
      if (nzCv.width !== nW || nzCv.height !== nH) {
        nzCv.width = nW;
        nzCv.height = nH;
      }
      const ns = nzCtx.createImageData(nW, nH);
      const d = ns.data;
      const intensity = P.noise * 80;
      for (let k = 0; k < d.length; k += 4) {
        if (Math.random() < P.noise * 0.4) {
          const v = Math.random() * 255 | 0;
          d[k] = v; d[k+1] = v; d[k+2] = v;
          d[k+3] = intensity;
        } else {
          d[k+3] = 0;
        }
      }
      nzCtx.putImageData(ns, 0, 0);
      ctx.drawImage(nzCv, 0, 0, nW, nH, 0, 0, W, H);
    }
  }

  function setup(state) {
    // nothing stateful
  }

  function suggestLoopDuration(P) {
    // full ping-pong = 2 * (cycleDur + holdDur)
    return 2 * (P.cycleDur + P.holdDur);
  }

  return {
    id: 'glitch',
    name: 'Glitch Morph',
    defaultParams,
    paramSchema,
    setup,
    render,
    suggestLoopDuration
  };
})();
