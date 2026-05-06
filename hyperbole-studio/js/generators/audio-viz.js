/* ============================================================
   Audio Visualizer Generator
   ============================================================
   Three visualizer styles in one generator:
     - BAR    : FFT bar with peak hold
     - WAVE   : delay waveform with green + white traces
     - RADIAL : radial spectrum with 3-band EQ wiggle

   Audio modes:
     - SIM (default): pseudo-random sine sums drive the visuals
     - LIVE: actual audio playback drives FFT analysis
     - EXPORT: OfflineAudioContext pre-bakes per-frame FFT data
              for deterministic PNG sequence export synced to audio

   Adapted from HYPERBOLE® VIZ GENERATOR (Apr 2026).
   ============================================================ */

window.HYPERBOLE_GENERATORS = window.HYPERBOLE_GENERATORS || {};

window.HYPERBOLE_GENERATORS.audioViz = (function () {

  // ----- defaults: BAR/WAVE/RADIALの値を1つにマージ -----
  const defaultParams = {
    style:        'bar',            // bar / wave / radial
    primaryColor: '#00FF41',
    bgColor:      '#000000',
    audioVolume:  0.7,
    audioPlaying: 0,                // playback flag (controlled by app.js via setPlaying)
    smoothing:    0.8,              // analyser smoothing constant

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
    { type: 'group', label: 'Audio Source' },
    { type: 'audio-input', key: '__audio' },
    { type: 'range', key: 'audioVolume', label: 'Volume', min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) },
    { type: 'range', key: 'smoothing', label: 'FFT Smoothing', min: 0, max: 0.99, step: 0.01, fmt: v => v.toFixed(2) },

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
  //  AUDIO STATE  (module-private)
  // ============================================================
  let audioBuffer = null;        // decoded AudioBuffer
  let audioCtx = null;           // shared AudioContext for live preview
  let analyser = null;           // AnalyserNode for live mode
  let gainNode = null;
  let liveSource = null;         // BufferSourceNode of currently-playing audio
  let isPlaying = false;
  let playStartCtxTime = 0;      // audioCtx.currentTime when playback started
  let playOffset = 0;            // resume position (seconds)
  let liveFreqArr = null;        // Uint8Array sized to fftSize/2
  let liveTimeArr = null;        // Float32Array sized to fftSize

  // For export: pre-baked per-frame FFT data
  // bakedFrames = [{ freq: Uint8Array, time: Float32Array }, ...]
  let bakedFrames = null;
  let bakedFps = 0;

  const FFT_SIZE = 4096;

  function ensureAudioCtx() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      gainNode = audioCtx.createGain();
      gainNode.gain.value = 0.7;
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);
      liveFreqArr = new Uint8Array(analyser.frequencyBinCount);
      liveTimeArr = new Float32Array(analyser.fftSize);
    }
  }

  // Public: load audio file (called by app.js audio-input handler)
  async function setAudioFile(file) {
    ensureAudioCtx();
    stopPlayback();
    audioBuffer = null;
    bakedFrames = null;
    try {
      const arr = await file.arrayBuffer();
      audioBuffer = await audioCtx.decodeAudioData(arr.slice(0));
      return { ok: true, duration: audioBuffer.duration };
    } catch (e) {
      console.error('[audio-viz] decode failed', e);
      return { ok: false, error: e.message };
    }
  }

  function hasAudio() { return audioBuffer !== null; }
  function getAudioDuration() { return audioBuffer ? audioBuffer.duration : 0; }

  function play() {
    if (!audioBuffer) return false;
    ensureAudioCtx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopPlayback();   // stop any existing source
    liveSource = audioCtx.createBufferSource();
    liveSource.buffer = audioBuffer;
    liveSource.connect(gainNode);
    const offset = playOffset % audioBuffer.duration;
    liveSource.start(0, offset);
    playStartCtxTime = audioCtx.currentTime - offset;
    isPlaying = true;
    liveSource.onended = () => {
      // natural end: reset to start
      isPlaying = false;
      playOffset = 0;
    };
    return true;
  }

  function pause() {
    if (!isPlaying || !audioCtx) return;
    playOffset = audioCtx.currentTime - playStartCtxTime;
    stopPlayback();
  }

  function stopPlayback() {
    if (liveSource) {
      try { liveSource.onended = null; liveSource.stop(); } catch (e) {}
      liveSource = null;
    }
    isPlaying = false;
  }

  function setVolume(v) {
    if (gainNode) gainNode.gain.value = v;
  }

  function setSmoothing(s) {
    if (analyser) analyser.smoothingTimeConstant = s;
  }

  function getPlaybackInfo() {
    if (!audioBuffer) return null;
    let pos = playOffset;
    if (isPlaying && audioCtx) {
      pos = audioCtx.currentTime - playStartCtxTime;
    }
    return {
      duration: audioBuffer.duration,
      position: pos,
      isPlaying
    };
  }

  // ============================================================
  //  OFFLINE BAKING  (for export)
  // ============================================================
  // Renders the audioBuffer through an OfflineAudioContext, capturing
  // the analyser output at each frame interval. Returns a Promise that
  // resolves to an array of { freq: Uint8Array, time: Float32Array }.
  async function bakeFrames(fps, durationSec, smoothing, onProgress) {
    if (!audioBuffer) return null;

    const sampleRate = audioBuffer.sampleRate;
    const bakeDuration = Math.min(durationSec, audioBuffer.duration);
    const totalSamples = Math.ceil(bakeDuration * sampleRate);
    const totalFrames = Math.round(bakeDuration * fps);
    const samplesPerFrame = sampleRate / fps;

    const offCtx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(
      audioBuffer.numberOfChannels, totalSamples, sampleRate
    );
    const offSrc = offCtx.createBufferSource();
    offSrc.buffer = audioBuffer;
    const offAnalyser = offCtx.createAnalyser();
    offAnalyser.fftSize = FFT_SIZE;
    offAnalyser.smoothingTimeConstant = smoothing;
    offSrc.connect(offAnalyser);
    offAnalyser.connect(offCtx.destination);

    // OfflineAudioContext renders synchronously without real-time playback,
    // so we cannot poll the analyser at intervals. Instead we use
    // ScriptProcessorNode (deprecated but works) or we render the buffer
    // and do FFT manually offline.
    //
    // SIMPLE APPROACH: Render the buffer to a flat Float32Array via offline
    // rendering, then do our own FFT analysis on time-domain windows.

    offSrc.start(0);
    const renderedBuffer = await offCtx.startRendering();

    // Mix down to mono Float32 array
    const ch0 = renderedBuffer.getChannelData(0);
    const chN = renderedBuffer.numberOfChannels;
    let mono;
    if (chN === 1) {
      mono = ch0;
    } else {
      const ch1 = renderedBuffer.getChannelData(1);
      mono = new Float32Array(ch0.length);
      for (let i = 0; i < ch0.length; i++) {
        mono[i] = (ch0[i] + ch1[i]) * 0.5;
      }
    }

    // FFT setup: simple radix-2 Cooley-Tukey
    const fft = makeFFT(FFT_SIZE);

    // For each frame, take a window centered (or starting) at frame time,
    // run FFT, store magnitudes scaled to 0..255 (matching getByteFrequencyData)
    const frames = new Array(totalFrames);
    const window = new Float32Array(FFT_SIZE);

    // smoothing buffer (previous frame's smoothed magnitudes)
    const smooth = new Float32Array(FFT_SIZE / 2);

    for (let f = 0; f < totalFrames; f++) {
      const startSample = Math.floor(f * samplesPerFrame);
      // copy window from mono
      for (let i = 0; i < FFT_SIZE; i++) {
        const idx = startSample + i;
        window[i] = idx < mono.length ? mono[idx] : 0;
      }
      // apply Hann window
      for (let i = 0; i < FFT_SIZE; i++) {
        const wv = 0.5 * (1 - Math.cos(2 * Math.PI * i / (FFT_SIZE - 1)));
        window[i] *= wv;
      }

      const { mag } = fft(window);
      // Convert magnitude to 0..255 with smoothing (mimics AnalyserNode)
      const freq = new Uint8Array(FFT_SIZE / 2);
      const dbMin = -100, dbMax = -30;
      for (let i = 0; i < FFT_SIZE / 2; i++) {
        // smoothing: prev * s + curr * (1-s)
        smooth[i] = smooth[i] * smoothing + mag[i] * (1 - smoothing);
        let db = 20 * Math.log10(smooth[i] + 1e-12);
        let v = (db - dbMin) / (dbMax - dbMin);
        if (v < 0) v = 0;
        else if (v > 1) v = 1;
        freq[i] = Math.round(v * 255);
      }
      // time-domain: just the (un-windowed) samples for this frame, sized FFT_SIZE
      const time = new Float32Array(FFT_SIZE);
      for (let i = 0; i < FFT_SIZE; i++) {
        const idx = startSample + i;
        time[i] = idx < mono.length ? mono[idx] : 0;
      }

      frames[f] = { freq, time };

      if (onProgress && (f % 8 === 0 || f === totalFrames - 1)) {
        onProgress(f + 1, totalFrames);
        // yield so UI can update
        await new Promise(r => setTimeout(r, 0));
      }
    }

    bakedFrames = frames;
    bakedFps = fps;
    return frames;
  }

  // Simple radix-2 Cooley-Tukey FFT, returns magnitude array of length n/2
  // Returns { mag } where mag[k] = magnitude at bin k (k = 0..n/2-1)
  function makeFFT(n) {
    // precompute bit-reversal table
    const log2n = Math.round(Math.log2(n));
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      let x = i;
      for (let j = 0; j < log2n; j++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    return function (real) {
      const re = new Float32Array(n);
      const im = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        re[rev[i]] = real[i];
      }
      // butterflies
      for (let size = 2; size <= n; size *= 2) {
        const half = size / 2;
        const ang = -2 * Math.PI / size;
        const wRe = Math.cos(ang), wIm = Math.sin(ang);
        for (let i = 0; i < n; i += size) {
          let curRe = 1, curIm = 0;
          for (let j = 0; j < half; j++) {
            const a = i + j;
            const b = i + j + half;
            const tRe = curRe * re[b] - curIm * im[b];
            const tIm = curRe * im[b] + curIm * re[b];
            re[b] = re[a] - tRe; im[b] = im[a] - tIm;
            re[a] = re[a] + tRe; im[a] = im[a] + tIm;
            const ncRe = curRe * wRe - curIm * wIm;
            const ncIm = curRe * wIm + curIm * wRe;
            curRe = ncRe; curIm = ncIm;
          }
        }
      }
      const half = n / 2;
      const mag = new Float32Array(half);
      const norm = 2 / n;
      for (let i = 0; i < half; i++) {
        mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) * norm;
      }
      return { mag };
    };
  }

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
  function drawBar(ctx, W, H, P, t, audioData) {
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

    const freqArr = audioData ? audioData.freq : null;

    for (let i = 0; i < bands; i++) {
      const nx = i / bands;
      let level;
      if (freqArr) {
        const start = Math.floor(P.freqStart * freqArr.length);
        const end   = Math.floor(P.freqEnd   * freqArr.length);
        const binIdx = Math.floor(start + (i / bands) * (end - start));
        level = freqArr[Math.min(binIdx, freqArr.length - 1)] / 255;
      } else {
        level = fakeLevel(nx, t, 1.2);
      }

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
  function getWavePts(W, H, ampPct, t, audioData) {
    const cy = H / 2;
    const samples = 512;
    const pts = [];
    const ampPx = H * ampPct / 100 * 0.9;
    if (audioData && audioData.time) {
      const time = audioData.time;
      for (let i = 0; i < samples; i++) {
        const x = (i / (samples - 1)) * W;
        const v = time[Math.floor(i / samples * time.length)];
        pts.push({ x, y: cy + v * ampPx });
      }
    } else {
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

  function drawWave(ctx, W, H, P, t, audioData) {
    const currentPts = getWavePts(W, H, P.greenAmp, t, audioData);
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
    const whitePts = getWavePts(W, H, P.whiteAmp, t * 0.93, audioData);
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
  function getRadialLevel(i, bands, P, lowG, midG, highG, t, audioData) {
    const nx = i / bands;
    if (audioData && audioData.freq) {
      const freqArr = audioData.freq;
      const totalBins = freqArr.length;
      const lowEnd  = Math.floor(P.lowRange  * totalBins);
      const midEnd  = Math.floor(P.midRange  * totalBins);
      const highEnd = Math.floor(P.highRange * totalBins);
      let binIdx, gain;
      if (nx < 1/3)      { binIdx = Math.floor((nx*3) * lowEnd); gain = lowG; }
      else if (nx < 2/3) { binIdx = Math.floor(lowEnd + (nx-1/3)*3*(midEnd-lowEnd)); gain = midG; }
      else               { binIdx = Math.floor(midEnd + (nx-2/3)*3*(highEnd-midEnd)); gain = highG; }
      binIdx = Math.min(Math.max(binIdx, 0), freqArr.length - 1);
      return Math.min(freqArr[binIdx] / 255 * gain, 1);
    }
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

  function drawRadial(ctx, W, H, P, t, audioData) {
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
      const rawLevel = getRadialLevel(i, bands, P, lowG, midG, highG, t, audioData);

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
    // sync runtime params
    setVolume(P.audioVolume);
    setSmoothing(P.smoothing);

    const vt = t * 2.4;

    // Resolve audio data for this frame
    let audioData = null;
    if (opts && opts.bakedFrameIndex !== undefined && bakedFrames) {
      // export mode: use baked frame data
      const idx = Math.min(opts.bakedFrameIndex, bakedFrames.length - 1);
      audioData = bakedFrames[idx];
    } else if (audioBuffer && analyser && isPlaying) {
      // live mode: pull current FFT from analyser
      analyser.smoothingTimeConstant = P.smoothing;
      analyser.getByteFrequencyData(liveFreqArr);
      analyser.getFloatTimeDomainData(liveTimeArr);
      audioData = { freq: liveFreqArr, time: liveTimeArr };
    }
    // else audioData stays null = simulation mode

    switch (P.style) {
      case 'wave':   drawWave(ctx, W, H, P, vt, audioData); break;
      case 'radial': drawRadial(ctx, W, H, P, vt, audioData); break;
      case 'bar':
      default:       drawBar(ctx, W, H, P, vt, audioData); break;
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
    requiresAudio: true,    // signals app.js to show audio controls
    supportsAnimation: true,
    defaultParams,
    paramSchema,
    setup,
    render,
    suggestLoopDuration,
    // audio API exposed to app.js
    setAudioFile,
    hasAudio,
    getAudioDuration,
    play,
    pause,
    stopPlayback,
    getPlaybackInfo,
    bakeFrames,
    clearBakedFrames: () => { bakedFrames = null; bakedFps = 0; }
  };
})();
