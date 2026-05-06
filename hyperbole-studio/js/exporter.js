/* ============================================================
   PNG Sequence Exporter
   Renders a generator at fixed output size and FPS, writes each
   frame as PNG, packages into a ZIP using JSZip + FileSaver.
   ============================================================ */

window.HYPERBOLE_EXPORTER = (function () {

  // status callback signature: (msg, progress 0..1)
  async function exportSequence({
    generator,
    params,
    width,
    height,
    fps,
    duration,
    onStatus
  }) {
    if (!generator || !generator.render) {
      throw new Error('Invalid generator');
    }
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip not loaded');
    }
    if (typeof saveAs === 'undefined') {
      throw new Error('FileSaver not loaded');
    }

    const totalFrames = Math.round(duration * fps);
    if (totalFrames < 1 || totalFrames > 9999) {
      throw new Error('Frame count out of range: ' + totalFrames);
    }

    const cv = document.createElement('canvas');
    cv.width = width;
    cv.height = height;
    const ctx = cv.getContext('2d');

    // fresh state for stateful generators
    const state = { travel: 0, lastT: 0 };
    if (generator.setup) generator.setup(state);

    const zip = new JSZip();
    const folder = zip.folder('frames');

    const padLen = String(totalFrames).length;
    const pad = (n) => String(n).padStart(padLen, '0');

    for (let i = 0; i < totalFrames; i++) {
      const t = i / fps;

      // For wireframe, use travelAtTime for clean export (non-state based)
      const opts = (generator.id === 'wireframe')
        ? { useTravelAtTime: true, travelStep: 1 / Math.max(60, fps * 4) }
        : { state };

      generator.render(ctx, width, height, t, params, opts);

      // convert to PNG blob
      const blob = await new Promise((resolve, reject) => {
        cv.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
      });
      folder.file('frame_' + pad(i) + '.png', blob);

      if (onStatus) {
        onStatus(
          'Rendering frame ' + (i + 1) + ' / ' + totalFrames,
          (i + 1) / totalFrames * 0.9   // 0..0.9 for rendering, 0.9..1 for zipping
        );
      }
      // yield to UI between frames
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    if (onStatus) onStatus('Compressing ZIP…', 0.95);

    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (meta) => {
        if (onStatus) onStatus('Compressing ZIP… ' + Math.round(meta.percent) + '%', 0.9 + meta.percent / 100 * 0.1);
      }
    );

    const fname = 'hyperbole_' + generator.id + '_' +
                  width + 'x' + height + '_' +
                  fps + 'fps_' +
                  totalFrames + 'f.zip';
    saveAs(zipBlob, fname);

    if (onStatus) onStatus('Done — ' + totalFrames + ' frames exported.', 1.0);
  }

  return { exportSequence };
})();
