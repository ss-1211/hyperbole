/* ============================================================
   Corridor Generator
   ============================================================
   Anime/cinematic 1-point-perspective corridor with 7 modes:
     - WINDOWS  : left wall windows + light shafts on floor
     - PILLARS  : repeating pillars on both walls
     - GRID     : Tron-style wireframe corridor
     - SHAFTS   : ceiling slits casting beams down
     - TUNNEL   : concentric receding rings
     - STAIRS   : descending stair perspective
     - ARCHES   : repeating arch frames

   Camera advances continuously; loop-coherent because the world
   is periodic with period SPACING along z.
   ============================================================ */

window.HYPERBOLE_GENERATORS = window.HYPERBOLE_GENERATORS || {};

window.HYPERBOLE_GENERATORS.corridor = (function () {

  const MODES = ['windows','pillars','grid','shafts','tunnel','stairs','arches'];

  // ===================================================================
  //  DEFAULTS
  // ===================================================================
  const defaultParams = {
    mode:           'windows',

    // Camera / projection
    focal:          0.55,        // smaller → wider FOV
    vanishX:        0.62,        // 0..1 horizontal
    vanishY:        0.50,        // 0..1 vertical

    // Motion
    speed:          1.0,         // window-units per second
    bobAmount:      0.0,         // pixels of vertical bob
    bobRate:        0.6,         // bobs per loop
    rollAmount:     0,           // degrees of camera roll
    rollRate:       0.5,

    // Geometry
    spacing:        0.40,        // distance between repeated objects
    nearZ:          0.45,
    farZ:           5.0,
    corridorW:      0.85,        // half-width of corridor
    corridorH:      0.65,        // half-height

    // WINDOWS-specific
    windowWidthRatio: 0.7,       // fraction of spacing
    windowHeight:   0.55,        // window vertical extent (top)
    windowBottom:   0.10,        // window bottom y (lower than top, smaller value=higher)
    shaftLength:    0.50,        // floor light shaft length in world units
    shaftAngle:     0.6,         // skew of shaft direction (0=straight, 1=45deg)
    shaftAlpha:     0.55,

    // PILLARS-specific
    pillarWidth:    0.10,
    pillarBoth:     1,            // 0/1 : both walls or just left

    // GRID-specific
    gridLineWeight: 1.2,
    gridFade:       0.7,         // how aggressively far lines fade

    // SHAFTS-specific
    shaftCount:     12,          // number of ceiling slits per corridor

    // TUNNEL-specific
    ringCount:      14,
    ringDividers:   8,           // radial slices

    // STAIRS-specific
    stepDrop:       0.18,        // how much each step descends
    stairsDirection: 'down',     // 'down' or 'up'

    // ARCHES-specific
    archInnerRatio: 0.78,        // inner cutout vs outer arch frame
    archHeight:     0.55,

    // Style
    bgColor:        '#0a1820',
    wallColor:      '#162938',
    shadowColor:    '#06121b',
    lightColor:     '#a8d8e0',
    brightColor:    '#e8f4f6',
    cellShade:      0.5,         // 0=smooth, 1=hard
    bloom:          0.15,        // glow strength

    // Auto-cycle
    autoShuffle:    0,
    shuffleInterval: 2.0
  };

  // ===================================================================
  //  UI SCHEMA
  // ===================================================================
  const paramSchema = [
    { type: 'group', label: 'Mode' },
    { type: 'select', key: 'mode', label: 'Pattern', options: [
      { value: 'windows', label: 'WINDOWS (anime corridor)' },
      { value: 'pillars', label: 'PILLARS (colonnade)' },
      { value: 'grid',    label: 'GRID (Tron wireframe)' },
      { value: 'shafts',  label: 'SHAFTS (ceiling beams)' },
      { value: 'tunnel',  label: 'TUNNEL (concentric rings)' },
      { value: 'stairs',  label: 'STAIRS (descending steps)' },
      { value: 'arches',  label: 'ARCHES (gothic gallery)' }
    ]},

    { type: 'group', label: 'Mode Presets' },
    { type: 'preset-row', presets: [
      { id: 'eva',   label: 'EVA',   values: { mode: 'windows',
          bgColor: '#0a1820', wallColor: '#162938', shadowColor: '#06121b',
          lightColor: '#a8d8e0', brightColor: '#e8f4f6' } },
      { id: 'mono',  label: 'MONO',  values: {
          bgColor: '#000000', wallColor: '#222222', shadowColor: '#0a0a0a',
          lightColor: '#dddddd', brightColor: '#ffffff' } },
      { id: 'blood', label: 'BLOOD', values: {
          bgColor: '#1a0508', wallColor: '#3d0a14', shadowColor: '#0d0203',
          lightColor: '#e8345a', brightColor: '#ff8aa0' } },
      { id: 'amber', label: 'AMBER', values: {
          bgColor: '#1a0d00', wallColor: '#3d2308', shadowColor: '#0a0500',
          lightColor: '#ffb000', brightColor: '#ffe080' } },
      { id: 'matrix',label: 'MTRX',  values: {
          bgColor: '#020a05', wallColor: '#0d2010', shadowColor: '#000503',
          lightColor: '#00ff41', brightColor: '#aaffaa' } }
    ]},

    { type: 'group', label: 'Camera' },
    { type: 'range', key: 'focal',   label: 'FOV (focal)', min: 0.25, max: 1.20, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'vanishX', label: 'Vanish X',    min: 0,    max: 1,    step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'vanishY', label: 'Vanish Y',    min: 0,    max: 1,    step: 0.01, fmt: v => v.toFixed(2) },

    { type: 'group', label: 'Motion' },
    { type: 'range', key: 'speed',     label: 'Speed (units/s)',  min: -3, max: 3, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'bobAmount', label: 'Bob Amount (px)',  min: 0, max: 30, step: 1, fmt: v => v },
    { type: 'range', key: 'bobRate',   label: 'Bob Rate',         min: 0.1, max: 3, step: 0.05, fmt: v => v.toFixed(2),
      showFor: { bobAmount: [v => v > 0] }, indent: true },
    { type: 'range', key: 'rollAmount',label: 'Roll Amount (°)',  min: 0, max: 15, step: 0.5, fmt: v => v.toFixed(1) },
    { type: 'range', key: 'rollRate',  label: 'Roll Rate',        min: 0.1, max: 3, step: 0.05, fmt: v => v.toFixed(2),
      showFor: { rollAmount: [v => v > 0] }, indent: true },

    { type: 'group', label: 'Geometry' },
    { type: 'range', key: 'spacing',   label: 'Spacing',     min: 0.15, max: 1.0, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'nearZ',     label: 'Near Z',      min: 0.2,  max: 1.5, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'farZ',      label: 'Far Z',       min: 2.0,  max: 10,  step: 0.1,  fmt: v => v.toFixed(1) },
    { type: 'range', key: 'corridorW', label: 'Corridor W',  min: 0.4,  max: 1.5, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'corridorH', label: 'Corridor H',  min: 0.4,  max: 1.5, step: 0.05, fmt: v => v.toFixed(2) },

    // ─── WINDOWS ───
    { type: 'group', label: 'Windows', showFor: { mode: ['windows'] } },
    { type: 'range', key: 'windowWidthRatio', label: 'Window Width', min: 0.2, max: 1.0, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['windows'] } },
    { type: 'range', key: 'windowHeight',     label: 'Window Top',   min: 0.3, max: 0.9, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['windows'] } },
    { type: 'range', key: 'windowBottom',     label: 'Window Bottom',min: 0,   max: 0.5, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['windows'] } },
    { type: 'range', key: 'shaftLength',      label: 'Shaft Length', min: 0,   max: 1.5, step: 0.02, fmt: v => v.toFixed(2),
      showFor: { mode: ['windows'] } },
    { type: 'range', key: 'shaftAngle',       label: 'Shaft Angle',  min: 0,   max: 1.5, step: 0.05, fmt: v => v.toFixed(2),
      showFor: { mode: ['windows'], shaftLength: [v => v > 0] }, indent: true },
    { type: 'range', key: 'shaftAlpha',       label: 'Shaft Alpha',  min: 0,   max: 1,   step: 0.05, fmt: v => v.toFixed(2),
      showFor: { mode: ['windows'], shaftLength: [v => v > 0] }, indent: true },

    // ─── PILLARS ───
    { type: 'group', label: 'Pillars', showFor: { mode: ['pillars'] } },
    { type: 'range', key: 'pillarWidth', label: 'Pillar Width', min: 0.04, max: 0.30, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['pillars'] } },
    { type: 'select', key: 'pillarBoth', label: 'Both Walls',
      showFor: { mode: ['pillars'] }, options: [
        { value: 0, label: 'Left only' }, { value: 1, label: 'Both walls' }
      ]},

    // ─── GRID ───
    { type: 'group', label: 'Grid', showFor: { mode: ['grid'] } },
    { type: 'range', key: 'gridLineWeight', label: 'Line Weight', min: 0.5, max: 4, step: 0.1, fmt: v => v.toFixed(1),
      showFor: { mode: ['grid'] } },
    { type: 'range', key: 'gridFade',       label: 'Distance Fade', min: 0, max: 1, step: 0.05, fmt: v => v.toFixed(2),
      showFor: { mode: ['grid'] } },

    // ─── SHAFTS ───
    { type: 'group', label: 'Light Shafts', showFor: { mode: ['shafts'] } },
    { type: 'range', key: 'shaftCount', label: 'Slit Count', min: 4, max: 30, step: 1, fmt: v => v,
      showFor: { mode: ['shafts'] } },

    // ─── TUNNEL ───
    { type: 'group', label: 'Tunnel', showFor: { mode: ['tunnel'] } },
    { type: 'range', key: 'ringCount',    label: 'Ring Count', min: 4, max: 30, step: 1, fmt: v => v,
      showFor: { mode: ['tunnel'] } },
    { type: 'range', key: 'ringDividers', label: 'Dividers (0=off)', min: 0, max: 16, step: 1, fmt: v => v,
      showFor: { mode: ['tunnel'] } },

    // ─── STAIRS ───
    { type: 'group', label: 'Stairs', showFor: { mode: ['stairs'] } },
    { type: 'select', key: 'stairsDirection', label: 'Direction',
      showFor: { mode: ['stairs'] }, options: [
        { value: 'down', label: 'Descending' }, { value: 'up', label: 'Ascending' }
      ]},
    { type: 'range', key: 'stepDrop', label: 'Step Height', min: 0.04, max: 0.25, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['stairs'] } },

    // ─── ARCHES ───
    { type: 'group', label: 'Arches', showFor: { mode: ['arches'] } },
    { type: 'range', key: 'archHeight',     label: 'Arch Height', min: 0.3, max: 0.9, step: 0.02, fmt: v => v.toFixed(2),
      showFor: { mode: ['arches'] } },
    { type: 'range', key: 'archInnerRatio', label: 'Opening Size', min: 0.5, max: 0.95, step: 0.01, fmt: v => v.toFixed(2),
      showFor: { mode: ['arches'] } },

    // ─── STYLE ───
    { type: 'group', label: 'Palette' },
    { type: 'color', key: 'bgColor',     label: 'BG / Sky' },
    { type: 'color', key: 'wallColor',   label: 'Wall' },
    { type: 'color', key: 'shadowColor', label: 'Shadow' },
    { type: 'color', key: 'lightColor',  label: 'Light' },
    { type: 'color', key: 'brightColor', label: 'Bright Highlight' },

    { type: 'group', label: 'Shading' },
    { type: 'range', key: 'cellShade', label: 'Cel Hardness', min: 0, max: 1, step: 0.05, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'bloom',     label: 'Bloom',        min: 0, max: 1, step: 0.05, fmt: v => v.toFixed(2) },

    // ─── AUTO-SHUFFLE ───
    { type: 'group', label: 'Auto-Shuffle' },
    { type: 'select', key: 'autoShuffle', label: 'Cycle Through Modes', options: [
      { value: 0, label: 'Off' }, { value: 1, label: 'On' }
    ]},
    { type: 'range', key: 'shuffleInterval', label: 'Interval (s)',
      min: 0.5, max: 8, step: 0.1, fmt: v => v.toFixed(1),
      showFor: { autoShuffle: [1] }, indent: true }
  ];

  // ===================================================================
  //  HELPERS
  // ===================================================================

  // 1-point perspective projection.
  // World coords: x = horizontal (-=left), y = vertical (-=up), z = depth (+ = forward).
  // Camera is at origin, looking down +z.
  function project(x, y, z, vx, vy, F, W, H) {
    if (z < 0.001) return null;
    const k = F / z;
    return { x: vx + x * k * W, y: vy + y * k * H, k };
  }

  function fillPoly(ctx, pts, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
  }

  // Linearly interpolate between two hex colors at u in [0,1]
  function hex2rgb(hex) {
    if (typeof hex !== 'string') return [0,0,0];
    let h = hex.replace('#','');
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  function lerpColor(a, b, u) {
    const A = hex2rgb(a), B = hex2rgb(b);
    return `rgb(${(A[0]+(B[0]-A[0])*u)|0},${(A[1]+(B[1]-A[1])*u)|0},${(A[2]+(B[2]-A[2])*u)|0})`;
  }
  // depth-based shade between shadow and light, modulated by cellShade hardness
  function depthShade(P, depthRatio /* 0=near, 1=far */) {
    const u = Math.max(0, Math.min(1, depthRatio));
    // hardness=0: smooth interp (near is fully light, far approaches shadow)
    if (P.cellShade < 0.01) {
      return lerpColor(P.lightColor, P.shadowColor, u);
    }
    // hardness=1: only 2 buckets {light, shadow}
    if (P.cellShade > 0.99) {
      return u < 0.5 ? P.lightColor : P.shadowColor;
    }
    // intermediate: snap to nearest of N levels.
    // We bias toward the brighter end so near objects look lit.
    const levels = Math.round(2 + (1 - P.cellShade) * 6); // 2..8
    // Use floor not round so that u=0..(1/levels) is fully light.
    const stepped = Math.min(levels - 1, Math.floor(u * levels)) / (levels - 1);
    return lerpColor(P.lightColor, P.shadowColor, stepped);
  }

  // ===================================================================
  //  EFFECTIVE MODE  (auto-shuffle)
  // ===================================================================
  function effectiveMode(t, P) {
    if (!P.autoShuffle) return P.mode;
    const interval = Math.max(0.1, P.shuffleInterval);
    const idx = Math.floor((t / interval) % MODES.length);
    return MODES[idx];
  }

  // ===================================================================
  //  MODE RENDERS
  // ===================================================================

  // --- WINDOWS ---
  function renderWindows(ctx, W, H, P, vx, vy, camZ, F) {
    // BG (deep dark right side)
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);
    // floor (wall color)
    fillPoly(ctx, [[0, H], [W, H], [vx, vy]], P.wallColor);
    // ceiling (shadow)
    fillPoly(ctx, [[0, 0], [W, 0], [vx, vy]], P.shadowColor);
    // left wall background (slightly lighter than bg, will be cut by windows)
    fillPoly(ctx, [[0, 0], [vx, vy], [0, H]], P.shadowColor);

    const xWall = -P.corridorW / 2;
    const yTop  = -P.windowHeight;
    const yBot  =  P.windowBottom;
    const wRatio = P.windowWidthRatio;

    // Iterate from far → near, painting windows + shafts
    // We draw each window at z = (i*spacing - camZ%spacing) for integer i
    const phase = ((camZ % P.spacing) + P.spacing) % P.spacing;
    const startI = Math.ceil(P.farZ / P.spacing);
    for (let i = startI; i >= 0; i--) {
      const z1 = i * P.spacing - phase;
      const z2 = z1 + P.spacing * wRatio;
      if (z2 < P.nearZ || z1 > P.farZ) continue;

      // depth ratio for shading
      const dr = (z1 - P.nearZ) / (P.farZ - P.nearZ);

      // window itself (on left wall)
      const tl = project(xWall, yTop, z1, vx, vy, F, W, H);
      const tr = project(xWall, yTop, z2, vx, vy, F, W, H);
      const br = project(xWall, yBot, z2, vx, vy, F, W, H);
      const bl = project(xWall, yBot, z1, vx, vy, F, W, H);
      if (!tl || !tr || !br || !bl) continue;

      // window glass — bright, fade by depth to suggest atmosphere
      const fade = 1 - dr * 0.6;
      ctx.save();
      ctx.globalAlpha = fade;
      fillPoly(ctx, [[tl.x,tl.y],[tr.x,tr.y],[br.x,br.y],[bl.x,bl.y]], P.brightColor);
      ctx.restore();

      // light shaft on floor (parallelogram from window's bottom edge into corridor)
      if (P.shaftLength > 0.001) {
        const sx1 = xWall;
        const sx2 = xWall + P.shaftLength;
        const sz1 = z1 + P.shaftLength * P.shaftAngle;
        const sz2 = z2 + P.shaftLength * P.shaftAngle;
        const a = project(sx1, P.corridorH, z1, vx, vy, F, W, H);
        const b = project(sx1, P.corridorH, z2, vx, vy, F, W, H);
        const c = project(sx2, P.corridorH, sz2, vx, vy, F, W, H);
        const d = project(sx2, P.corridorH, sz1, vx, vy, F, W, H);
        if (a && b && c && d) {
          ctx.save();
          ctx.globalAlpha = P.shaftAlpha * fade;
          fillPoly(ctx, [[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]], P.lightColor);
          ctx.restore();
        }
      }
    }

    // bloom — radial glow over the lit half of the corridor
    if (P.bloom > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = vx * 0.4;
      const cy = vy;
      const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, Math.min(W, H) * 0.5);
      grad.addColorStop(0, P.lightColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = P.bloom * 0.6;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // --- PILLARS ---
  function renderPillars(ctx, W, H, P, vx, vy, camZ, F) {
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    // Project four corner edges of the corridor box at nearZ
    // to find the continuous wall planes (drawn as quads from near to vanish).
    const cw = P.corridorW / 2, ch = P.corridorH;
    const nearTL = project(-cw, -ch, P.nearZ, vx, vy, F, W, H);
    const nearTR = project( cw, -ch, P.nearZ, vx, vy, F, W, H);
    const nearBR = project( cw,  ch, P.nearZ, vx, vy, F, W, H);
    const nearBL = project(-cw,  ch, P.nearZ, vx, vy, F, W, H);

    // floor (bottom triangle from near-bottom corners to vanish)
    if (nearBL && nearBR)
      fillPoly(ctx, [[nearBL.x, nearBL.y], [nearBR.x, nearBR.y], [vx, vy]], P.wallColor);
    // ceiling
    if (nearTL && nearTR)
      fillPoly(ctx, [[nearTL.x, nearTL.y], [nearTR.x, nearTR.y], [vx, vy]], P.shadowColor);
    // left wall (from camera-near-left to vanish, mid-tone)
    if (nearTL && nearBL)
      fillPoly(ctx, [[nearTL.x, nearTL.y], [nearBL.x, nearBL.y], [vx, vy]],
               lerpColor(P.wallColor, P.shadowColor, 0.4));
    // right wall (mirror)
    if (nearTR && nearBR)
      fillPoly(ctx, [[nearTR.x, nearTR.y], [nearBR.x, nearBR.y], [vx, vy]],
               lerpColor(P.wallColor, P.shadowColor, 0.4));

    // pillars
    const phase = ((camZ % P.spacing) + P.spacing) % P.spacing;
    const startI = Math.ceil(P.farZ / P.spacing);

    for (let i = startI; i >= 0; i--) {
      const z = i * P.spacing - phase;
      if (z < P.nearZ || z > P.farZ) continue;
      const z2 = z + P.spacing * 0.5;
      const dr = (z - P.nearZ) / (P.farZ - P.nearZ);

      const sides = P.pillarBoth ? [-1, 1] : [-1];
      for (const s of sides) {
        const xOuter = s * P.corridorW / 2;
        const xInner = xOuter - s * P.pillarWidth;
        const yTop = -P.corridorH;
        const yBot =  P.corridorH;

        const tl = project(xOuter, yTop, z,  vx, vy, F, W, H);
        const tr = project(xOuter, yTop, z2, vx, vy, F, W, H);
        const br = project(xOuter, yBot, z2, vx, vy, F, W, H);
        const bl = project(xOuter, yBot, z,  vx, vy, F, W, H);
        if (!tl || !tr || !br || !bl) continue;

        const faceColor = depthShade(P, dr);
        fillPoly(ctx, [[tl.x,tl.y],[tr.x,tr.y],[br.x,br.y],[bl.x,bl.y]], faceColor);

        // inner side (the corridor-facing edge), darker
        const tli = project(xInner, yTop, z, vx, vy, F, W, H);
        const bli = project(xInner, yBot, z, vx, vy, F, W, H);
        if (tli && bli) {
          fillPoly(ctx, [[tl.x,tl.y],[tli.x,tli.y],[bli.x,bli.y],[bl.x,bl.y]], P.shadowColor);
        }
      }
    }
  }

  // --- GRID ---
  function renderGrid(ctx, W, H, P, vx, vy, camZ, F) {
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = P.lightColor;
    ctx.lineWidth = P.gridLineWeight;
    ctx.lineCap = 'round';

    // 4 corners of corridor box
    const cw = P.corridorW / 2, ch = P.corridorH;
    const corners = [
      [-cw, -ch], [ cw, -ch],
      [ cw,  ch], [-cw,  ch]  // ordered for closed loop
    ];

    // longitudinal lines (corner → vanish)
    ctx.beginPath();
    for (const [x, y] of corners) {
      const near = project(x, y, P.nearZ, vx, vy, F, W, H);
      if (near) {
        ctx.moveTo(near.x, near.y);
        ctx.lineTo(vx, vy);
      }
    }
    ctx.stroke();

    // transverse rectangles at each z slice (animated by camZ)
    const phase = ((camZ % P.spacing) + P.spacing) % P.spacing;
    const startI = Math.ceil(P.farZ / P.spacing);
    for (let i = 0; i <= startI; i++) {
      const z = i * P.spacing - phase;
      if (z < P.nearZ || z > P.farZ) continue;
      const dr = (z - P.nearZ) / (P.farZ - P.nearZ);
      const a = 1 - dr * P.gridFade;
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      const c = corners.map(([x, y]) => project(x, y, z, vx, vy, F, W, H));
      if (c.every(p => p)) {
        ctx.beginPath();
        ctx.moveTo(c[0].x, c[0].y);
        for (let j = 1; j < c.length; j++) ctx.lineTo(c[j].x, c[j].y);
        ctx.closePath();
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // --- SHAFTS ---
  function renderShafts(ctx, W, H, P, vx, vy, camZ, F) {
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);
    // dark floor
    fillPoly(ctx, [[0, H], [W, H], [vx, vy]], P.shadowColor);

    // We treat shafts as pairs of quads:
    //   - ceiling slit (bright)
    //   - floor light strip (mid-light)
    const slitW = 0.08;
    const halfW = P.corridorW / 2 * 0.7;  // floor strip narrower than corridor
    const yCeil = -P.corridorH;
    const yFloor =  P.corridorH;

    const localSpacing = P.spacing;
    const phase = ((camZ % localSpacing) + localSpacing) % localSpacing;
    const startI = Math.ceil(P.farZ / localSpacing);

    for (let i = startI; i >= 0; i--) {
      const z = i * localSpacing - phase;
      const z2 = z + slitW * 2;
      if (z2 < P.nearZ || z > P.farZ) continue;
      const dr = (z - P.nearZ) / (P.farZ - P.nearZ);
      const fade = Math.max(0, 1 - dr * 0.7);

      // floor light strip
      const fl1 = project(-halfW, yFloor, z,  vx, vy, F, W, H);
      const fr1 = project( halfW, yFloor, z,  vx, vy, F, W, H);
      const fr2 = project( halfW, yFloor, z2, vx, vy, F, W, H);
      const fl2 = project(-halfW, yFloor, z2, vx, vy, F, W, H);
      if (fl1 && fr1 && fr2 && fl2) {
        ctx.save();
        ctx.globalAlpha = fade * 0.85;
        fillPoly(ctx, [[fl1.x,fl1.y],[fr1.x,fr1.y],[fr2.x,fr2.y],[fl2.x,fl2.y]], P.lightColor);
        ctx.restore();
      }

      // ceiling slit (bright)
      const cl1 = project(-halfW, yCeil, z,  vx, vy, F, W, H);
      const cr1 = project( halfW, yCeil, z,  vx, vy, F, W, H);
      const cr2 = project( halfW, yCeil, z2, vx, vy, F, W, H);
      const cl2 = project(-halfW, yCeil, z2, vx, vy, F, W, H);
      if (cl1 && cr1 && cr2 && cl2) {
        fillPoly(ctx, [[cl1.x,cl1.y],[cr1.x,cr1.y],[cr2.x,cr2.y],[cl2.x,cl2.y]], P.brightColor);
      }
    }

    // bloom — radial glow at vanishing point
    if (P.bloom > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(vx, vy, 2, vx, vy, Math.min(W, H) * 0.4);
      grad.addColorStop(0, P.lightColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = P.bloom * 0.6;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // --- TUNNEL ---
  function renderTunnel(ctx, W, H, P, vx, vy, camZ, F) {
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    const cx = vx, cy = vy;
    const N = Math.max(2, P.ringCount | 0);
    const rMax = Math.max(W, H) * 0.85;

    // animated ring phase: rings move outward as camera advances
    const phase = (camZ / P.spacing) % 1;

    // draw from far (small) → near (large) by FILLING each ring
    // alternate light/shadow for dimensional ring stack
    for (let i = N - 1; i >= 0; i--) {
      // each ring i has a base radius scaled by perspective
      // position with phase so they appear to expand outward
      const u = ((i + phase) % N) / N;  // 0..1 (small to large)
      const r = Math.pow(u, 1.6) * rMax + 6;
      const dr = 1 - u;  // depth ratio: u=0 means far (small), u=1 near (big)
      const fillCol = (i % 2 === 0)
        ? depthShade(P, dr)
        : P.shadowColor;
      ctx.fillStyle = fillCol;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // radial dividers (drawn ON TOP, but very thin)
    if (P.ringDividers > 0) {
      ctx.strokeStyle = P.shadowColor;
      ctx.lineWidth = 1;
      const D = P.ringDividers | 0;
      const aOff = (camZ * 0.02) * Math.PI;  // slow drift
      for (let k = 0; k < D; k++) {
        const a = aOff + k * Math.PI * 2 / D;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * rMax * 1.5, cy + Math.sin(a) * rMax * 1.5);
        ctx.stroke();
      }
    }

    // bloom at center
    if (P.bloom > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, rMax * 0.3);
      grad.addColorStop(0, P.brightColor);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = P.bloom;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  // --- STAIRS ---
  function renderStairs(ctx, W, H, P, vx, vy, camZ, F) {
    ctx.fillStyle = P.bgColor;
    ctx.fillRect(0, 0, W, H);

    // STAIRS conceptual model:
    //   The camera is at world (x=0, y=eyeHeight, z=0).
    //   eyeHeight is BELOW the first step's top surface — the camera is at the
    //   level of the floor between steps so we look down on the stair top edges.
    //   Each step i has a TOP face at y = stepDrop * i (deeper steps are LOWER, larger y).
    //   We subtract eyeHeight from all y values to put the camera at world origin.
    //
    //   With dir = +1 (descending), the eye is ABOVE the steps so eyeHeight < 0
    //   in our subtraction frame.  With dir = -1 (ascending), eye is below first
    //   step (we look up) so eyeHeight > 0.

    const phase = ((camZ % P.spacing) + P.spacing) % P.spacing;
    const startI = Math.ceil(P.farZ / P.spacing);
    const dir = P.stairsDirection === 'up' ? -1 : 1;
    const halfW = P.corridorW;

    // eye-height offset: simulate camera positioned 1 step above (descending)
    // or below (ascending) the first visible step
    const eyeOffset = -dir * P.stepDrop * 1.5;

    for (let i = startI; i >= 0; i--) {
      const z = i * P.spacing - phase;
      const z2 = z + P.spacing;
      if (z2 < P.nearZ || z > P.farZ) continue;

      // step i's top face world-y (before eye correction)
      const yTopThis = dir * P.stepDrop * i + eyeOffset;
      const yTopNext = yTopThis + dir * P.stepDrop;

      const dr = (z - P.nearZ) / (P.farZ - P.nearZ);
      const top = depthShade(P, dr * 0.5);
      const front = depthShade(P, Math.min(1, dr * 0.5 + 0.4));

      const a = project(-halfW, yTopThis, z,  vx, vy, F, W, H);
      const b = project( halfW, yTopThis, z,  vx, vy, F, W, H);
      const c = project( halfW, yTopThis, z2, vx, vy, F, W, H);
      const d = project(-halfW, yTopThis, z2, vx, vy, F, W, H);
      if (a && b && c && d) {
        fillPoly(ctx, [[a.x,a.y],[b.x,b.y],[c.x,c.y],[d.x,d.y]], top);
      }

      // riser
      const e = project(-halfW, yTopNext, z2, vx, vy, F, W, H);
      const f = project( halfW, yTopNext, z2, vx, vy, F, W, H);
      if (c && d && e && f) {
        fillPoly(ctx, [[d.x,d.y],[c.x,c.y],[f.x,f.y],[e.x,e.y]], front);
      }
    }
  }

  // --- ARCHES ---
  function renderArches(ctx, W, H, P, vx, vy, camZ, F) {
    // bright sky behind arches
    ctx.fillStyle = P.brightColor;
    ctx.fillRect(0, 0, W, H);

    // ground triangle (something to stand on)
    fillPoly(ctx, [[0, H], [W, H], [vx, vy]], P.wallColor);

    // arches need denser spacing than the global default; cap at 0.18 so frames stack densely
    const archSpacing = Math.min(P.spacing, 0.18);
    const phase = ((camZ % archSpacing) + archSpacing) % archSpacing;
    const startI = Math.ceil(P.farZ / archSpacing);
    const aw = P.corridorW;
    const ah = P.archHeight;
    const innerW = aw * P.archInnerRatio;
    const innerH = ah * P.archInnerRatio;
    const segs = 18;

    // Draw far → near. Each arch is rendered as a "donut" using even-odd fill.
    // For the FARTHEST arch, fill the inner with sky (brightColor) so we don't
    // see the wallColor ground triangle through it.
    const farthestI = (function () {
      for (let i = startI; i >= 0; i--) {
        const z = i * archSpacing - phase;
        if (z >= P.nearZ && z <= P.farZ) return i;
      }
      return -1;
    })();

    for (let i = startI; i >= 0; i--) {
      const z = i * archSpacing - phase;
      if (z < P.nearZ || z > P.farZ) continue;
      const dr = (z - P.nearZ) / (P.farZ - P.nearZ);
      const archCol = depthShade(P, dr * 0.6);

      // OUTER silhouette
      const outer = [];
      outer.push(project(-aw/2,  P.corridorH, z, vx, vy, F, W, H));
      outer.push(project(-aw/2, -ah * 0.2,    z, vx, vy, F, W, H));
      for (let s = 0; s <= segs; s++) {
        const a = Math.PI - (s / segs) * Math.PI;
        const x = Math.cos(a) * aw / 2;
        const y = -ah * 0.2 - Math.sin(a) * (ah * 0.55);
        outer.push(project(x, y, z, vx, vy, F, W, H));
      }
      outer.push(project(aw/2, -ah * 0.2,    z, vx, vy, F, W, H));
      outer.push(project(aw/2,  P.corridorH, z, vx, vy, F, W, H));
      if (!outer.every(p => p)) continue;

      // INNER cutout
      const inner = [];
      inner.push(project(-innerW/2,  P.corridorH, z, vx, vy, F, W, H));
      inner.push(project(-innerW/2, -ah * 0.15,   z, vx, vy, F, W, H));
      for (let s = 0; s <= segs; s++) {
        const a = Math.PI - (s / segs) * Math.PI;
        const x = Math.cos(a) * innerW / 2;
        const y = -ah * 0.15 - Math.sin(a) * (innerH * 0.5);
        inner.push(project(x, y, z, vx, vy, F, W, H));
      }
      inner.push(project(innerW/2, -ah * 0.15,   z, vx, vy, F, W, H));
      inner.push(project(innerW/2,  P.corridorH, z, vx, vy, F, W, H));
      if (!inner.every(p => p)) continue;

      // For the farthest arch, FILL the inner with sky first.
      // Otherwise, the ground/wall triangle behind would peek through.
      if (i === farthestI) {
        fillPoly(ctx, inner.map(p => [p.x, p.y]), P.brightColor);
      }

      // Donut fill: outer (CW) + inner reversed (CCW), even-odd rule
      ctx.fillStyle = archCol;
      ctx.beginPath();
      ctx.moveTo(outer[0].x, outer[0].y);
      for (let k = 1; k < outer.length; k++) ctx.lineTo(outer[k].x, outer[k].y);
      ctx.closePath();
      ctx.moveTo(inner[inner.length - 1].x, inner[inner.length - 1].y);
      for (let k = inner.length - 2; k >= 0; k--) ctx.lineTo(inner[k].x, inner[k].y);
      ctx.closePath();
      ctx.fill('evenodd');
    }
  }

  // ===================================================================
  //  MAIN RENDER
  // ===================================================================
  function render(ctx, W, H, t, P, opts) {
    // resolve mode (with auto-shuffle)
    const mode = effectiveMode(t, P);

    // camera position: continuous z advance
    // For loop-coherence in export: t/loopDur * (integer #cycles) * spacing,
    // but speed is in window-units/s, so simply: camZ = t * speed.
    // Loop-friendliness handled by suggestLoopDuration.
    const camZ = t * P.speed;

    // optional bob & roll
    const bobY = P.bobAmount * Math.sin(2 * Math.PI * P.bobRate * t);
    const rollDeg = P.rollAmount * Math.sin(2 * Math.PI * P.rollRate * t);

    const F = P.focal;
    const vx = W * P.vanishX;
    const vy = H * P.vanishY + bobY;

    // apply roll via canvas transform
    if (rollDeg !== 0) {
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(rollDeg * Math.PI / 180);
      ctx.translate(-W / 2, -H / 2);
    }

    // dispatch
    switch (mode) {
      case 'windows': renderWindows(ctx, W, H, P, vx, vy, camZ, F); break;
      case 'pillars': renderPillars(ctx, W, H, P, vx, vy, camZ, F); break;
      case 'grid':    renderGrid   (ctx, W, H, P, vx, vy, camZ, F); break;
      case 'shafts':  renderShafts (ctx, W, H, P, vx, vy, camZ, F); break;
      case 'tunnel':  renderTunnel (ctx, W, H, P, vx, vy, camZ, F); break;
      case 'stairs':  renderStairs (ctx, W, H, P, vx, vy, camZ, F); break;
      case 'arches':  renderArches (ctx, W, H, P, vx, vy, camZ, F); break;
      default:        renderWindows(ctx, W, H, P, vx, vy, camZ, F);
    }

    if (rollDeg !== 0) ctx.restore();
  }

  function setup(state) {
    /* nothing stateful */
  }

  function suggestLoopDuration(P) {
    // For auto-shuffle, full cycle = MODES.length * interval
    if (P.autoShuffle) {
      return MODES.length * Math.max(0.1, P.shuffleInterval);
    }
    // For continuous mode: one window-spacing of travel = perfect loop
    // duration = spacing / speed (if speed > 0)
    const sp = Math.abs(P.speed);
    if (sp < 0.01) return 4.0;
    const oneCycle = P.spacing / sp;
    // pick a multiple that gives 2-6 second loop
    let dur = oneCycle;
    while (dur < 2.0) dur += oneCycle;
    return dur;
  }

  return {
    id: 'corridor',
    name: 'Corridor (Anime/CG)',
    defaultParams,
    paramSchema,
    setup,
    render,
    suggestLoopDuration
  };
})();
