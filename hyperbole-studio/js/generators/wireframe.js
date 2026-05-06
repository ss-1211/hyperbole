/* ============================================================
   Wireframe Forward Generator
   ============================================================
   Each generator must export a global object with this shape:
   {
     id: 'wireframe',
     name: 'Wireframe Forward',
     defaultParams: { ... },
     paramSchema: [ ... ],   // array of UI control descriptors
     setup(state) { ... },   // optional one-time init
     render(ctx, w, h, t, params) { ... },  // render one frame at time t
     // for export looping:
     // suggestLoopDuration() returns natural loop length in seconds
     suggestLoopDuration(params) { ... }
   }
   ============================================================ */

window.HYPERBOLE_GENERATORS = window.HYPERBOLE_GENERATORS || {};

window.HYPERBOLE_GENERATORS.wireframe = (function () {

  const ROOM_W = 2.0;
  const ROOM_H = 1.0;
  const FOCAL  = 2.4;
  const FAR    = 12.0;

  // ----- param defaults -----
  const defaultParams = {
    color:        '#ffffff',
    bg:           '#000000',
    speed:        1.0,
    pulseAmp:     0.6,
    pulseRate:    0.3,
    pulseShape:   2.0,
    waveAmp:      14,
    waveFreq:     2.0,
    waveSpeed:    1.0,
    grid:         14,
    depth:        14,
    fadeDist:     0.7,
    lw:           1.0,
    glow:         0
  };

  // ----- UI schema (rendered into #paramPanel) -----
  const paramSchema = [
    { type: 'group', label: 'Color & Style' },
    { type: 'color',  key: 'color',     label: 'Line Color' },
    { type: 'color',  key: 'bg',        label: 'BG Color' },
    { type: 'range',  key: 'lw',        label: 'Line Weight', min: 0.5, max: 3.0, step: 0.1, fmt: v => v.toFixed(1) },
    { type: 'range',  key: 'glow',      label: 'Glow',        min: 0,   max: 40, step: 1,   fmt: v => v },

    { type: 'group',  label: 'Forward Motion' },
    { type: 'range',  key: 'speed',      label: 'Base Speed',  min: 0,   max: 5.0, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range',  key: 'pulseAmp',   label: 'Pulse Amount', min: 0,  max: 1.0, step: 0.01, fmt: v => v.toFixed(2) },
    // pulse-shape knobs only matter when pulseAmp > 0
    { type: 'range',  key: 'pulseRate',  label: 'Pulse Rate',  min: 0.01, max: 2.0, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { pulseAmp: [v => v > 0.001] }, indent: true },
    { type: 'range',  key: 'pulseShape', label: 'Pulse Shape', min: 1.0, max: 6.0, step: 0.1, fmt: v => v.toFixed(1),
      showFor: { pulseAmp: [v => v > 0.001] }, indent: true },

    { type: 'group',  label: 'Wave Distortion' },
    { type: 'range',  key: 'waveAmp',   label: 'Wave Amount', min: 0,   max: 60, step: 1,    fmt: v => v },
    // wave-frequency knobs only matter when waveAmp > 0
    { type: 'range',  key: 'waveFreq',  label: 'Wave Freq',   min: 0.5, max: 6.0, step: 0.1, fmt: v => v.toFixed(1),
      showFor: { waveAmp: [v => v > 0] }, indent: true },
    { type: 'range',  key: 'waveSpeed', label: 'Wave Speed',  min: 0,   max: 3.0, step: 0.05, fmt: v => v.toFixed(2),
      showFor: { waveAmp: [v => v > 0] }, indent: true },

    { type: 'group',  label: 'Geometry' },
    { type: 'range',  key: 'grid',     label: 'Grid Density',     min: 6,  max: 30, step: 1, fmt: v => v },
    { type: 'range',  key: 'depth',    label: 'Depth Segments',   min: 6,  max: 30, step: 1, fmt: v => v },
    { type: 'range',  key: 'fadeDist', label: 'Fade Distance',    min: 0,  max: 1.0, step: 0.01, fmt: v => v.toFixed(2) },

    { type: 'group',  label: 'Color Presets' },
    { type: 'preset-row', presets: [
      { id: 'mono',  label: 'MONO',  values: { color: '#ffffff', bg: '#000000', glow: 0 } },
      { id: 'crt',   label: 'CRT',   values: { color: '#00ff41', bg: '#001a08', glow: 18 } },
      { id: 'vhs',   label: 'VHS',   values: { color: '#ff2bd6', bg: '#0a0014', glow: 22 } },
      { id: 'amber', label: 'AMBER', values: { color: '#ffb000', bg: '#1a0d00', glow: 14 } },
      { id: 'cyber', label: 'CYBER', values: { color: '#00e5ff', bg: '#02060d', glow: 24 } }
    ]},

    { type: 'group',  label: 'Motion Presets' },
    { type: 'preset-row', presets: [
      { id: 'cruise',  label: 'CRUISE',  values: { speed: 1.0, pulseAmp: 0.0, pulseRate: 0.3, pulseShape: 2.0, waveAmp: 8, waveFreq: 2.0, waveSpeed: 0.6 } },
      { id: 'breathe', label: 'BREATHE', values: { speed: 0.8, pulseAmp: 0.7, pulseRate: 0.2, pulseShape: 2.0, waveAmp: 18, waveFreq: 1.5, waveSpeed: 0.4 } },
      { id: 'rush',    label: 'RUSH',    values: { speed: 2.5, pulseAmp: 0.9, pulseRate: 1.2, pulseShape: 4.0, waveAmp: 6,  waveFreq: 3.0, waveSpeed: 1.5 } },
      { id: 'dream',   label: 'DREAM',   values: { speed: 0.4, pulseAmp: 0.3, pulseRate: 0.15, pulseShape: 2.0, waveAmp: 22, waveFreq: 3.5, waveSpeed: 0.3 } }
    ]}
  ];

  // ----- internal state for travel accumulation -----
  // Wireframe state must be kept across frames during preview, but for
  // export we recompute travel deterministically from t (no integration).
  // So render() takes an optional `state` object.

  function project(x, y, z, cx, cy, scale) {
    if (FOCAL + z <= 0.01) return null;
    const k = FOCAL / (FOCAL + z);
    return { x: cx + x * k * scale, y: cy - y * k * scale, k };
  }

  function waveOffset(z, t, P) {
    const phase = 2 * Math.PI * (P.waveFreq * (z / FAR) - P.waveSpeed * t);
    const ampWorld = (P.waveAmp / 600) * ROOM_H;
    return Math.sin(phase) * ampWorld;
  }

  // Pulsed speed at instantaneous time t.
  // For export consistency, travel must equal integral over [0,t] of currentSpeed.
  // We compute the travel analytically when possible for clean loops.
  function currentSpeed(t, P) {
    const base = P.speed;
    if (P.pulseAmp <= 0.001) return base;
    const raw = Math.sin(2 * Math.PI * P.pulseRate * t);
    const shaped = Math.sign(raw) * Math.pow(Math.abs(raw), P.pulseShape);
    return base * (1 + shaped * P.pulseAmp);
  }

  // For correct loop-coherent travel during EXPORT, we numerically integrate
  // travel up to t using a fine fixed step. We expose a helper for this.
  function travelAtTime(t, P, dtSampleSeconds) {
    const dt = dtSampleSeconds || (1 / 240);  // default very fine integration
    let travel = 0;
    let cur = 0;
    while (cur + dt < t) {
      travel += dt * currentSpeed(cur + dt * 0.5, P);
      cur += dt;
    }
    travel += (t - cur) * currentSpeed((cur + t) * 0.5, P);
    return travel;
  }

  function depthAlpha(z, fadeDist) {
    const fadeStart = FAR * fadeDist;
    if (z <= fadeStart) return 1;
    if (z >= FAR) return 0;
    return 1 - (z - fadeStart) / (FAR - fadeStart);
  }

  function drawWorldLine(ctx, p1, p2, normal, t, segs, cx, cy, scale, alpha, P) {
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    let started = false;
    ctx.beginPath();
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const x = p1[0] + (p2[0] - p1[0]) * u;
      const y = p1[1] + (p2[1] - p1[1]) * u;
      const z = p1[2] + (p2[2] - p1[2]) * u;
      const w = waveOffset(z, t, P);
      const dx = x + normal[0] * w;
      const dy = y + normal[1] * w;
      const dz = z + normal[2] * w * 0.3;
      const pr = project(dx, dy, dz, cx, cy, scale);
      if (!pr) { started = false; continue; }
      if (!started) { ctx.moveTo(pr.x, pr.y); started = true; }
      else ctx.lineTo(pr.x, pr.y);
    }
    ctx.stroke();
    if (alpha !== undefined) ctx.globalAlpha = 1;
  }

  // ----- main render -----
  // ctx: 2d context. w, h: logical size. t: time in seconds. params: P.
  // Optional opts: { useAccumulatedTravel: true, prevState: {travel, lastT} }
  // For preview: state is kept across calls. For export: we use travelAtTime(t).
  function render(ctx, w, h, t, params, opts) {
    const P = params;

    // resolve travel
    let travel;
    if (opts && opts.useTravelAtTime) {
      travel = travelAtTime(t, P, opts.travelStep);
    } else {
      // accumulated mode (preview)
      const state = (opts && opts.state) || render._defaultState;
      const dt = Math.max(0, t - state.lastT);
      state.travel += dt * currentSpeed(t, P);
      state.lastT = t;
      travel = state.travel;
    }

    // bg
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = P.color;
    ctx.lineWidth = P.lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (P.glow > 0) {
      ctx.shadowColor = P.color;
      ctx.shadowBlur = P.glow;
    } else {
      ctx.shadowBlur = 0;
    }

    const cx = w / 2;
    const cy = h / 2;
    const scale = Math.min(w, h * 2) / (2 * ROOM_W) * 0.95;

    const G = P.grid;
    const D = P.depth;
    const Gh = Math.round(G * 0.6);
    const cellZ = FAR / D;
    const phase = ((travel % cellZ) + cellZ) % cellZ;

    const nFloor = [0, 1, 0];
    const nCeil  = [0, -1, 0];
    const nL     = [1, 0, 0];
    const nR     = [-1, 0, 0];

    const SEGS = 18;
    const SUB_FADE = 6;

    // longitudinal lines
    function drawLong(x0, y0, x1, y1, normal) {
      for (let s = 0; s < SUB_FADE; s++) {
        const z0 = FAR * (s / SUB_FADE);
        const z1 = FAR * ((s + 1) / SUB_FADE);
        const a = (depthAlpha(z0, P.fadeDist) + depthAlpha(z1, P.fadeDist)) / 2;
        if (a > 0.02) {
          drawWorldLine(ctx,
            [x0, y0, z0], [x1, y1, z1],
            normal, t,
            Math.max(3, Math.floor(SEGS / SUB_FADE)),
            cx, cy, scale, a, P);
        }
      }
    }

    for (let i = 0; i <= G; i++) {
      const x = -ROOM_W + (2 * ROOM_W) * (i / G);
      drawLong(x, -ROOM_H, x, -ROOM_H, nFloor); // floor
      drawLong(x,  ROOM_H, x,  ROOM_H, nCeil);  // ceiling
    }
    for (let i = 0; i <= Gh; i++) {
      const y = -ROOM_H + (2 * ROOM_H) * (i / Gh);
      drawLong(-ROOM_W, y, -ROOM_W, y, nL);     // left
      drawLong( ROOM_W, y,  ROOM_W, y, nR);     // right
    }

    // transverse lines (move with travel)
    for (let j = 0; j <= D + 1; j++) {
      let z = j * cellZ - phase;
      if (z < 0) continue;
      if (z > FAR) continue;
      const a = depthAlpha(z, P.fadeDist);
      if (a < 0.02) continue;

      drawWorldLine(ctx, [-ROOM_W, -ROOM_H, z], [ROOM_W, -ROOM_H, z], nFloor, t, 6, cx, cy, scale, a, P);
      drawWorldLine(ctx, [-ROOM_W,  ROOM_H, z], [ROOM_W,  ROOM_H, z], nCeil,  t, 6, cx, cy, scale, a, P);
      drawWorldLine(ctx, [-ROOM_W, -ROOM_H, z], [-ROOM_W, ROOM_H, z], nL,     t, 4, cx, cy, scale, a, P);
      drawWorldLine(ctx, [ ROOM_W, -ROOM_H, z], [ ROOM_W, ROOM_H, z], nR,     t, 4, cx, cy, scale, a, P);
    }
  }

  render._defaultState = { travel: 0, lastT: 0 };

  function setup(state) {
    if (state) {
      state.travel = 0;
      state.lastT = 0;
    } else {
      render._defaultState.travel = 0;
      render._defaultState.lastT = 0;
    }
  }

  // Suggest loop duration: this is tricky for wireframe because the wave
  // and travel have potentially incommensurable frequencies.
  // We pick a duration that matches one full wave-phase cycle plus
  // wavelength travel, with a sensible cap.
  function suggestLoopDuration(P) {
    // Cell length: FAR / depth; wave period in time: 1 / waveSpeed (if speed>0).
    // Travel speed average ~= base speed; one cell traverse: cellZ / speed.
    // Just default to 4 seconds; user can override in export panel.
    return 4.0;
  }

  return {
    id: 'wireframe',
    name: 'Wireframe Forward',
    defaultParams,
    paramSchema,
    setup,
    render,
    suggestLoopDuration
  };
})();
