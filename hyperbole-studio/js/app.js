/* ============================================================
   HYPERBOLE Studio - Main App Shell (v2)
   adds image-input control type and static PNG export
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
  const exportStaticBtn = $('#exportStaticBtn');
  const staticBtnRow = $('#staticBtnRow');
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

    const wrapW = stageWrapper.clientWidth - 40;
    const wrapH = stageWrapper.clientHeight - 60;
    let stageW, stageH;
    if ((wrapW / ratio.w) * ratio.h <= wrapH) {
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
    const ratio = ASPECTS[aspectSelect.value];
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
            buildParamUI(generator);
          });
          row.appendChild(b);
        });
        wrapper.appendChild(row);
        paramPanel.appendChild(wrapper);
        return;
      }

      // ----- image-input: special handler -----
      if (item.type === 'image-input') {
        // Don't add a redundant label here; the group-title above already
        // says "Source Image". Just put the drop zone with inline styles
        // so it cannot be invisible due to CSS issues.
        const dropZone = document.createElement('button');
        dropZone.type = 'button';
        dropZone.className = 'drop-zone';
        // explicit inline styles to bypass any CSS conflicts
        dropZone.style.cssText = [
          'display: block',
          'width: 100%',
          'min-height: 80px',
          'border: 2px dashed #555',
          'background: #1a1a1a',
          'color: #aaa',
          'padding: 24px 12px',
          'text-align: center',
          'cursor: pointer',
          'font-family: inherit',
          'font-size: 11px',
          'letter-spacing: 0.1em'
        ].join('; ');
        dropZone.textContent = (generator.hasImage && generator.hasImage())
          ? 'IMAGE LOADED — CLICK TO REPLACE'
          : '📁 CLICK TO UPLOAD IMAGE';
        wrapper.appendChild(dropZone);

        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.style.display = 'none';
        wrapper.appendChild(fileInput);

        function loadFile(file) {
          if (!file || !file.type.startsWith('image/')) {
            console.warn('[HYPERBOLE] Not an image file:', file && file.type);
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
              if (generator.setImage) generator.setImage(img);
              dropZone.textContent = '✓ ' + file.name + ' — ' + img.naturalWidth + '×' + img.naturalHeight;
              dropZone.style.borderStyle = 'solid';
              dropZone.style.color = '#fff';
              const cap = 4096;
              let w = img.naturalWidth;
              let h = img.naturalHeight;
              if (w > cap || h > cap) {
                const s = Math.min(cap / w, cap / h);
                w = Math.round(w * s);
                h = Math.round(h * s);
              }
              inExportW.value = w;
              inExportH.value = h;
              updateFrameCount();
              console.log('[HYPERBOLE] Image loaded:', file.name, w + 'x' + h);
            };
            img.onerror = () => {
              console.error('[HYPERBOLE] Failed to decode image');
              dropZone.textContent = '✗ Failed to decode image';
            };
            img.src = ev.target.result;
          };
          reader.onerror = () => {
            console.error('[HYPERBOLE] FileReader error');
          };
          reader.readAsDataURL(file);
        }

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length) loadFile(e.target.files[0]);
        });
        ['dragenter', 'dragover'].forEach(ev => {
          dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = 'var(--accent, #fff)';
          });
        });
        ['dragleave', 'drop'].forEach(ev => {
          dropZone.addEventListener(ev, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.style.borderColor = '#555';
          });
        });
        dropZone.addEventListener('drop', (e) => {
          if (e.dataTransfer.files.length) loadFile(e.dataTransfer.files[0]);
        });

        paramPanel.appendChild(wrapper);
        return;
      }

      // ----- regular controls -----
      const label = document.createElement('label');
      const labelText = document.createElement('span');
      labelText.textContent = item.label;
      label.appendChild(labelText);

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
          // coerce comparison since some option values are numbers
          if (String(currentParams[item.key]) === String(opt.value)) o.selected = true;
          input.appendChild(o);
        });
        input.addEventListener('change', () => {
          // try to parse number if original was a number
          const cur = currentParams[item.key];
          if (typeof cur === 'number') {
            currentParams[item.key] = parseFloat(input.value);
          } else {
            currentParams[item.key] = input.value;
          }
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
    console.log('[HYPERBOLE] switchGenerator:', id, gen);
    console.log('[HYPERBOLE] paramSchema items:', gen.paramSchema.length);
    currentGen = gen;
    currentParams = JSON.parse(JSON.stringify(gen.defaultParams));
    buildParamUI(gen);
    console.log('[HYPERBOLE] paramPanel children after build:', paramPanel.children.length);
    previewState.travel = 0;
    previewState.lastT = 0;
    if (gen.setup) gen.setup(previewState);

    if (gen.suggestLoopDuration) {
      const dur = gen.suggestLoopDuration(currentParams);
      inExportDur.value = dur.toFixed(1);
      updateFrameCount();
    }

    // show/hide static button based on capability
    if (gen.requiresImage) {
      staticBtnRow.style.display = '';
    } else {
      staticBtnRow.style.display = 'none';
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

  // PNG sequence (animated loop)
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
    if (w * h > 7680 * 4320) {
      exportStatus.textContent = 'Output resolution too large';
      return;
    }
    if (fps * dur > 1800) {
      if (!confirm('This will render ' + Math.round(fps * dur) + ' frames. Continue?')) return;
    }

    exportBtn.disabled = true;
    if (exportStaticBtn) exportStaticBtn.disabled = true;
    try {
      await window.HYPERBOLE_EXPORTER.exportSequence({
        generator: currentGen,
        params: currentParams,
        width: w,
        height: h,
        fps,
        duration: dur,
        onStatus: (msg) => { exportStatus.textContent = msg; }
      });
    } catch (e) {
      exportStatus.textContent = 'ERROR: ' + e.message;
    } finally {
      exportBtn.disabled = false;
      if (exportStaticBtn) exportStaticBtn.disabled = false;
      setTimeout(() => {
        if (exportStatus.textContent.indexOf('Done') === 0) {
          exportStatus.textContent = '';
        }
      }, 5000);
    }
  });

  // PNG single frame (still)
  if (exportStaticBtn) {
    exportStaticBtn.addEventListener('click', async () => {
      if (!currentGen) return;
      const w = parseInt(inExportW.value, 10);
      const h = parseInt(inExportH.value, 10);
      if (!w || !h) {
        exportStatus.textContent = 'Invalid export size';
        return;
      }
      exportBtn.disabled = true;
      exportStaticBtn.disabled = true;
      try {
        await window.HYPERBOLE_EXPORTER.exportStill({
          generator: currentGen,
          params: currentParams,
          width: w,
          height: h,
          onStatus: (msg) => { exportStatus.textContent = msg; }
        });
      } catch (e) {
        exportStatus.textContent = 'ERROR: ' + e.message;
      } finally {
        exportBtn.disabled = false;
        exportStaticBtn.disabled = false;
        setTimeout(() => {
          if (exportStatus.textContent.indexOf('Done') === 0) {
            exportStatus.textContent = '';
          }
        }, 5000);
      }
    });
  }

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
