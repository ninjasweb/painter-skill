// Page host: loads a scene module, shows a scrubbable preview, and exposes window.__paint for the CLI.
import { Renderer } from './core/renderer.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const status = document.getElementById('status');
const say = (m) => { if (status) status.textContent = m; };

async function boot() {
  const mod = await import('/scene/' + (q.get('scene') || 'scene.js'));
  const meta = mod.meta || {};
  const aspect = num('aspect', meta.aspect ?? 16 / 9);
  const height = num('h', 720), width = num('w', Math.round(height * aspect / 2) * 2);
  let params = {}; try { params = JSON.parse(q.get('params') || '{}'); } catch { /* ignore */ }
  const t0 = performance.now();
  const painting = await mod.default({ aspect: width / height, seed: num('seed', meta.seed ?? 1), ...params });
  // opening: 'finished' (default) · 'paint-on' · 'final-pass'. Video time 0 = scene time painting.timeOffset.
  const off = painting.open(q.get('opening') || 'finished');
  // --duration is the length of the video; without it, the video runs to the end of the scene's own timeline
  painting.duration = q.has('duration') ? num('duration') : Math.max(3, +(painting.duration - off).toFixed(3));
  const buildMs = performance.now() - t0;
  const canvas = document.getElementById('c');
  const renderer = await Renderer.create(canvas, width, height);
  const fps = num('fps', painting.fps ?? 30);

  const api = {
    info: { width, height, fps, duration: painting.duration, strokes: painting.strokeCount, buildMs: Math.round(buildMs),
      opening: painting.opening, timeOffset: +off.toFixed(3),
      layers: painting.layers.map((l) => ({ name: l.name, strokes: l.count, depth: l.depth, dynamic: !!l.dynamic })),
      // phase times in VIDEO seconds (negative = already painted before the first frame)
      phases: painting.phaseTimes ? Object.fromEntries(Object.entries(painting.phaseTimes).map(([k, [a, b]]) => [k, [+(a - off).toFixed(3), +(b - off).toFixed(3)]])) : null },
    painting, renderer,
    /** PNG (base64) of the frame at time t. */
    async still(t) {
      const px = await renderer.pixels(painting, t);
      const oc = new OffscreenCanvas(width, height);
      oc.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(px.buffer), width, height), 0, 0);
      const blob = await oc.convertToBlob({ type: 'image/png' });
      return await b64(blob);
    },
    /** Encode [start, end) to MP4 with WebCodecs; chunks go to window.__chunk(base64, position). */
    async render({ start = 0, end = painting.duration, codec = 'avc', bitrate = 16e6, keyFrameInterval = 2 } = {}) {
      const mb = await import('mediabunny');
      const pending = [];
      const writable = new WritableStream({ write: async (c) => { pending.push(window.__chunk(await b64(new Blob([c.data])), c.position)); } });
      const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: false }), target: new mb.StreamTarget(writable, { chunked: true, chunkSize: 4 * 1024 * 1024 }) });
      const src = new mb.VideoSampleSource({ codec, bitrate, keyFrameInterval, latencyMode: 'quality' });
      output.addVideoTrack(src, { frameRate: fps });
      await output.start();
      const n = Math.round((end - start) * fps);
      const tStart = performance.now();
      for (let i = 0; i < n; i++) {
        const t = start + i / fps;
        const px = await renderer.pixels(painting, t);
        const sample = new mb.VideoSample(px, { format: 'RGBA', codedWidth: width, codedHeight: height, timestamp: i / fps, duration: 1 / fps,
          colorSpace: { primaries: 'bt709', transfer: 'iec61966-2-1', matrix: 'rgb', fullRange: true } });
        await src.add(sample); sample.close();
        if (i % 10 === 0) { window.__progress?.(i, n, (performance.now() - tStart) / 1000); say(`rendering ${i}/${n}`); }
      }
      await output.finalize();
      await Promise.all(pending);
      return { frames: n, seconds: (performance.now() - tStart) / 1000 };
    },
  };
  window.__paint = api;
  ui(api);
  return api;
}

function b64(blob) {
  return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result.slice(r.result.indexOf(',') + 1)); r.readAsDataURL(blob); });
}

function ui({ painting, renderer, info }) {
  const bar = document.getElementById('t'), play = document.getElementById('play');
  if (!bar) return;
  bar.max = info.duration; bar.step = 1 / info.fps;
  bar.value = num('t', info.duration);
  let playing = false, last = 0;
  const draw = () => { renderer.render(painting, Number(bar.value)); say(`${Number(bar.value).toFixed(2)}s / ${info.duration}s · ${info.strokes.toLocaleString()} strokes · built in ${info.buildMs} ms`); };
  bar.oninput = draw;
  play.onclick = () => { playing = !playing; play.textContent = playing ? 'pause' : 'play'; last = performance.now(); if (playing) requestAnimationFrame(tick); };
  const tick = (now) => {
    if (!playing) return;
    let t = Number(bar.value) + (now - last) / 1000; last = now;
    if (t >= info.duration) t = 0;
    bar.value = t; draw(); requestAnimationFrame(tick);
  };
  draw();
}

window.__ready = boot().catch((e) => { say('ERROR: ' + (e.stack || e)); console.error(e); window.__error = String(e.stack || e); throw e; });
