/* ============================================================
   HYPERBOLE Studio - Main App Shell
   ============================================================ */

(function () {

  // ----- error catcher -----
  window.addEventListener('error', (e) => {
    const box = document.getElementById('errBox');
    if (!box) return;
    box.style.display = 'block';
    box.textContent = `ERROR: ${e.message}\nFile: ${e.filename}\nLine: ${e.lineno}, Col: ${e.colno}\nStack: ${(e.error && e.error.stack) || 'n/a'}`;
  });

  // ----- DOM refs -----
  const $ = (sel) => document.querySelector(sel);
  const cv = $('#cv');
  const ctx = cv.getContext('2d');
  const stage = $('#stage');
  const stageWrapper = $('#stage-wrapper');
  const paramPanel = $('#paramPanel');
  const generatorSelect = $('#generatorSelect');
  const aspectSelect = $('#aspectSelect');
  const accentColor = $('#accentColor');
  const fpsDisplay = $('#fpsDisplay');
  const aspectDisplay = $('#aspectDisplay');
  const exportBtn = $('#exportBtn');
  const exportStatus = $('#exportStatus');
  const exportFramesEl = $('#exportFrames');
  const inExportW = $('#exportW');
  const inExportH = $('#exportH');
  const inExportFps = $('#exportFps');
  const inExportDur = $('#exportDur');

  // ----- state -----
  let currentGen = null;
  let currentParams = {};
  const previewState = { travel: 0, lastT: 0 };

  // ----- accent color -----
  function setAccent(hex) {
    document.documentElement.style.setProperty('--accent', hex);
  }
  setAccent(accentColor.value);
  accentColor.addEventListener('input', () => setAccent(accentColor.value));

  // ----- aspect ratio -----
  const ASPECTS = {
    '1:1':  { w: 1, h: 1 },
    '4:3':  { w: 4, h: 3 },
    '4:5':  { w: 4, h: 5 },
    '16:9': { w: 16, h: 9 }
  };

  let DPR = 1;

  function fitStage() {
    const ratioStr = aspectSelect.value;
    const ratio = ASPECTS[ratioStr];
    aspectDisplay.textContent = ratioStr;

    // available area (stage-wrapper minus padding)
    const wrapW = stageWrapper.clientWidth - 40;
    const wrapH = stageWrapper.clientHeight - 60;
    let stageW, stageH;
    const scaleByW = wrapW / ratio.w;
    const scaleByH = wrapH / ratio.h;
    if (scaleByW * ratio.h <= wrapH) {
      stageW = wrapW;
      stageH = wrapW * ratio.h / ratio.w;
    } else {
      stageH = wrapH;
      stageW = wrapH * ratio.w / ratio.h;
    }
    stage.style.width = stageW + 'px';
    stage.style.height = stageH + 'px';

    DPR = Math.min(window.devicePixelRatio || 1, 2);
    cv.width  = Math.floor(stageW * DPR);
    cv.height = Math.floor(stageH * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  window.addEventListener('resize', fitStage);
  aspectSelect.addEventListener('change', () => {
    fitStage();
    // also auto-fill default export size based on aspect
    const ratio = ASPECTS[aspectSelect.value];
    // default to 1080-something
    const targetH = 1080;
    inExportW.value = Math.round(targetH * ratio.w / ratio.h);
    inExportH.value = targetH;
    updateFrameCount();
  });

  // ----- param panel rendering -----
  function buildParamUI(generator) {
    paramPanel.innerHTML = '';

    generator.paramSchema.forEach((item) => {
      if (item.type === 'group') {
        const t = document.createElement('div');
        t.className = 'group-title';
        t.textContent = item.label;
        paramPanel.appendChild(t);
        return;
      }
      const wrapper = document.createElement('div');
      wrapper.className = 'ctrl';

      if (item.type === 'preset-row') {
        const row = document.createElement('div');
        row.className = 'preset-row';
        item.presets.forEach(p => {
          const b = document.createElement('button');
          b.className = 'preset-btn';
          b.textContent = p.label;
          b.addEventListener('click', () => {
            Object.keys(p.values).forEach(k => {
              currentParams[k] = p.values[k];
            });
            // re-render UI to reflect new values
            buildParamUI(generator);
          });
          row.appendChild(b);
        });
        wrapper.appendChild(row);
        paramPanel.appendChild(wrapper);
        return;
      }

      const label = document.createElement('label');
      const labelText = document.createElement('span');
      labelText.textContent = item.label;
      label.appendChild(labelText);

      // value display for ranges
      let valueSpan;
      if (item.type === 'range') {
        valueSpan = document.createElement('span');
        valueSpan.className = 'v';
        valueSpan.textContent = (item.fmt || (v => v))(currentParams[item.key]);
        label.appendChild(valueSpan);
      }
      wrapper.appendChild(label);

      let input;
      if (item.type === 'range') {
        input = document.createElement('input');
        input.type = 'range';
        input.min = item.min;
        input.max = item.max;
        input.step = item.step;
        input.value = currentParams[item.key];
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          currentParams[item.key] = v;
          if (valueSpan) valueSpan.textContent = (item.fmt || (v => v))(v);
        });
      } else if (item.type === 'color') {
        input = document.createElement('input');
        input.type = 'color';
        input.value = currentParams[item.key];
        input.addEventListener('input', () => {
          currentParams[item.key] = input.value;
        });
      } else if (item.type === 'text') {
        input = document.createElement('input');
        input.type = 'text';
        input.value = currentParams[item.key];
        input.addEventListener('input', () => {
          currentParams[item.key] = input.value;
        });
      } else if (item.type === 'select') {
        input = document.createElement('select');
        item.options.forEach(opt => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (currentParams[item.key] === opt.value) o.selected = true;
          input.appendChild(o);
        });
        input.addEventListener('change', () => {
          currentParams[item.key] = input.value;
        });
      }
      if (input) wrapper.appendChild(input);
      paramPanel.appendChild(wrapper);
    });
  }

  // ----- switch generator -----
  function switchGenerator(id) {
    const gen = window.HYPERBOLE_GENERATORS[id];
    if (!gen) {
      console.error('Generator not found:', id);
      return;
    }
    currentGen = gen;
    // copy default params
    currentParams = JSON.parse(JSON.stringify(gen.defaultParams));
    buildParamUI(gen);
    // reset preview state
    previewState.travel = 0;
    previewState.lastT = 0;
    if (gen.setup) gen.setup(previewState);

    // suggest loop duration in export panel
    if (gen.suggestLoopDuration) {
      const dur = gen.suggestLoopDuration(currentParams);
      inExportDur.value = dur.toFixed(1);
      updateFrameCount();
    }
  }

  generatorSelect.addEventListener('change', () => {
    switchGenerator(generatorSelect.value);
  });

  // ----- export panel -----
  function updateFrameCount() {
    const fps = parseFloat(inExportFps.value);
    const dur = parseFloat(inExportDur.value);
    const frames = Math.round(fps * dur);
    exportFramesEl.textContent = frames;
  }
  inExportFps.addEventListener('input', updateFrameCount);
  inExportDur.addEventListener('input', updateFrameCount);

  exportBtn.addEventListener('click', async () => {
    if (!currentGen) return;
    const w = parseInt(inExportW.value, 10);
    const h = parseInt(inExportH.value, 10);
    const fps = parseFloat(inExportFps.value);
    const dur = parseFloat(inExportDur.value);

    if (!w || !h || !fps || !dur) {
      exportStatus.textContent = 'Invalid export settings';
      return;
    }
    // sanity caps
    if (w * h > 7680 * 4320) {
      exportStatus.textContent = 'Output resolution too large';
      return;
    }
    if (fps * dur > 1800) {
      if (!confirm('This will render ' + Math.round(fps * dur) + ' frames. Continue?')) return;
    }

    exportBtn.disabled = true;
    try {
      await window.HYPERBOLE_EXPORTER.exportSequence({
        generator: currentGen,
        params: currentParams,
        width: w,
        height: h,
        fps,
        duration: dur,
        onStatus: (msg, progress) => {
          exportStatus.textContent = msg;
        }
      });
    } catch (e) {
      exportStatus.textContent = 'ERROR: ' + e.message;
    } finally {
      exportBtn.disabled = false;
      // clear status after a bit if success
      setTimeout(() => {
        if (exportStatus.textContent.indexOf('Done') === 0) {
          exportStatus.textContent = '';
        }
      }, 5000);
    }
  });

  // ----- preview render loop -----
  let last = performance.now();
  let frames = 0, fpsAcc = 0;

  function renderLoop(now) {
    const dt = (now - last) / 1000;
    last = now;
    fpsAcc += dt; frames++;
    if (fpsAcc >= 0.5) {
      fpsDisplay.textContent = (frames / fpsAcc).toFixed(0) + ' FPS';
      frames = 0; fpsAcc = 0;
    }

    if (currentGen) {
      const t = now / 1000;
      const w = cv.width / DPR;
      const h = cv.height / DPR;
      try {
        currentGen.render(ctx, w, h, t, currentParams, { state: previewState });
      } catch (e) {
        console.error(e);
      }
    }

    requestAnimationFrame(renderLoop);
  }

  // ----- init -----
  fitStage();
  switchGenerator(generatorSelect.value);
  updateFrameCount();
  requestAnimationFrame(renderLoop);

})();
