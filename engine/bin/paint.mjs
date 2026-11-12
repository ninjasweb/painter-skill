#!/usr/bin/env node
// painter CLI — drives headless Chrome (WebGPU + WebCodecs) to turn a scene module into stills or video.
//
//   paint still   <scene.js> [--t 2,5,9 | --n 12] [--size 1280x720] [--out dir] [--sheet]
//   paint render  <scene.js> [--out video.mp4] [--size 1920x1080] [--fps 30] [--codec avc|hevc|av1|vp9]
//                            [--bitrate 16e6] [--start s] [--end s] [--audio file] [--params '{"k":1}']
//   paint preview <scene.js> [--port 4173]      live, scrubbable preview in your own Chrome
//   paint info    <scene.js>                    stroke counts, layers, phase times
//   paint qa      <video.mp4> [--still t.png --t 5]   probe + flicker/black/freeze check (+ colour match vs a still)
//
//   render --compat   re-encode with x264 to limited-range yuv420p/bt709 (maximum player compatibility)
//
// Requires Google Chrome (or CHROME_PATH) and, for --audio/--sheet, ffmpeg.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.wgsl': 'text/plain' };

function args(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true; o[k] = v; } else o._.push(a);
  }
  return o;
}

function findChrome() {
  const c = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);
  const f = c.find((p) => fs.existsSync(p));
  if (!f) throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH.');
  return f;
}

function serve(sceneFile, port = 0) {
  const sceneDir = path.dirname(sceneFile);
  const mb = path.join(ROOT, 'node_modules/mediabunny/dist/bundles/mediabunny.min.mjs');
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file;
    if (u === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    if (u === '/' || u === '/index.html') file = path.join(SRC, 'index.html');
    else if (u.startsWith('/engine/')) file = path.join(SRC, u.slice(8));
    else if (u.startsWith('/scene/')) file = path.join(sceneDir, u.slice(7));
    else if (u === '/vendor/mediabunny.min.mjs') file = mb;
    if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found: ' + u); return; }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((ok) => srv.listen(port, '127.0.0.1', () => ok(srv)));
}

function precheck(sceneFile) {
  if (!fs.existsSync(sceneFile)) throw new Error('Scene not found: ' + sceneFile);
  const tmp = path.join(os.tmpdir(), `paint-check-${process.pid}.mjs`);
  fs.copyFileSync(sceneFile, tmp);
  const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' }); fs.unlinkSync(tmp);
  if (r.status !== 0) throw new Error('Syntax error in ' + sceneFile + ':\n' + r.stderr.split('\n').slice(0, 6).join('\n').replaceAll(tmp, path.basename(sceneFile)));
}

async function open(sceneFile, o, w, h) {
  precheck(sceneFile);
  const { default: puppeteer } = await import('puppeteer-core');
  const srv = await serve(sceneFile);
  const browser = await puppeteer.launch({ executablePath: findChrome(), headless: true, protocolTimeout: 0, timeout: Number(process.env.PAINT_LAUNCH_TIMEOUT || 180000),
    args: ['--enable-unsafe-webgpu', '--enable-features=WebGPU', '--ignore-gpu-blocklist', ...(process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'linux' ? ['--enable-features=Vulkan', '--use-angle=vulkan'] : []),
      '--disable-background-timer-throttling', `--window-size=${w},${h}`] });
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(0); page.setDefaultTimeout(0);   // a loaded machine may take a minute to start Chrome and build the scene
  page.on('console', (m) => { const t = m.text(); if (/different format than is preferred/.test(t)) return; if (m.type() === 'error' || /WebGPU|error/i.test(t)) console.error('[page]', t); });
  page.on('pageerror', (e) => console.error('[page error]', e.message));
  const qs = new URLSearchParams({ scene: path.basename(sceneFile), w, h });
  for (const k of ['fps', 'seed', 'duration', 'params']) if (o[k] !== undefined) qs.set(k, o[k]);
  await page.goto(`http://127.0.0.1:${srv.address().port}/?${qs}`);
  try { await page.evaluate(() => window.__ready.then(() => true)); }
  catch (e) { const err = await page.evaluate(() => window.__error).catch(() => null); await browser.close(); srv.close(); throw new Error('Scene failed to build:\n' + (err || e.message)); }
  const info = await page.evaluate(() => window.__paint.info);
  return { page, browser, srv, info, close: async () => { await browser.close(); srv.close(); } };
}

const size = (o, d) => (o.size || d).split('x').map(Number);

async function still(o) {
  const scene = path.resolve(o._[1]); const [w, h] = size(o, '1280x720');
  const s = await open(scene, o, w, h);
  const out = path.resolve(o.out || path.join(path.dirname(scene), 'stills', path.basename(scene, '.js')));
  fs.mkdirSync(out, { recursive: true });
  const D = s.info.duration;
  const times = o.t !== undefined ? String(o.t).split(',').map(Number) : Array.from({ length: Number(o.n || 1) }, (_, i) => (Number(o.n || 1) === 1 ? D : (i / (Number(o.n) - 1)) * D * 0.999));
  const files = [];
  for (const t of times) {
    const b = await s.page.evaluate((t) => window.__paint.still(t), t);
    const f = path.join(out, `t${t.toFixed(2).padStart(6, '0')}.png`); fs.writeFileSync(f, Buffer.from(b, 'base64')); files.push(f);
  }
  console.log(JSON.stringify({ ...s.info, layers: undefined, stills: files }, null, 0));
  if (o.sheet && files.length > 1) {
    const cols = Math.min(4, Math.ceil(Math.sqrt(files.length))), rows = Math.ceil(files.length / cols);
    const list = path.join(out, '_list.txt'); fs.writeFileSync(list, files.map((f) => `file '${f}'\nduration 1`).join('\n'));
    const sheet = path.join(out, 'sheet.jpg');
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${Math.round(1920 / cols / 2) * 2}:-2,tile=${cols}x${rows}`, '-frames:v', '1', '-q:v', '3', sheet], { stdio: 'inherit' });
    fs.unlinkSync(list); console.log('sheet: ' + sheet);
  }
  await s.close();
}

async function render(o) {
  const scene = path.resolve(o._[1]); const [w, h] = size(o, '1920x1080');
  const out = path.resolve(o.out || path.join(path.dirname(scene), 'out', path.basename(scene, '.js') + '.mp4'));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const raw = out.replace(/\.mp4$/, '.raw.mp4');
  const s = await open(scene, o, w, h);
  const fd = fs.openSync(raw, 'w');
  await s.page.exposeFunction('__chunk', (b, pos) => { const buf = Buffer.from(b, 'base64'); fs.writeSync(fd, buf, 0, buf.length, pos); });
  await s.page.exposeFunction('__progress', (i, n, sec) => process.stderr.write(`\r  frame ${i}/${n}  ${(i / Math.max(sec, 0.01)).toFixed(1)} fps   `));
  console.error(`rendering ${path.basename(scene)} ${w}x${h}@${s.info.fps} · ${s.info.duration}s · ${s.info.strokes.toLocaleString()} strokes`);
  const opt = { codec: o.codec || 'avc', bitrate: Number(o.bitrate || 16e6) };
  if (o.start !== undefined) opt.start = Number(o.start); if (o.end !== undefined) opt.end = Number(o.end);
  const r = await s.page.evaluate((opt) => window.__paint.render(opt), opt);
  fs.closeSync(fd); await s.close();
  process.stderr.write(`\r  ${r.frames} frames in ${r.seconds.toFixed(1)} s (${(r.frames / r.seconds).toFixed(1)} fps)        \n`);
  // remux: faststart + bt709 tags (+ optional audio). Video stream is copied, never re-encoded.
  const a = ['-v', 'error', '-y', '-i', raw];
  if (o.audio) a.push('-i', path.resolve(o.audio), '-map', '0:v', '-map', '1:a', '-c:a', 'aac', '-b:a', '192k', '-shortest');
  if (o.compat) a.push('-vf', 'scale=in_range=full:out_range=tv:in_color_matrix=bt709:out_color_matrix=bt709,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', String(o.crf || 15),
    '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-movflags', '+faststart', out);
  else a.push('-c:v', 'copy', '-movflags', '+faststart', out);
  const ff = spawnSync('ffmpeg', a, { stdio: 'inherit' });
  if (ff.status === 0) fs.unlinkSync(raw); else { fs.renameSync(raw, out); console.error('ffmpeg remux failed; kept the raw WebCodecs file'); }
  const pr = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt:format=duration,size', '-of', 'json', out], { encoding: 'utf8' });
  console.log(JSON.stringify({ out, ...JSON.parse(pr.stdout || '{}') }));
}

async function preview(o) {
  const scene = path.resolve(o._[1]);
  const srv = await serve(scene, Number(o.port || 4173));
  console.log(`preview: http://127.0.0.1:${srv.address().port}/?scene=${path.basename(scene)}&h=720   (open in Chrome; reload after edits; Ctrl+C to stop)`);
}

async function info(o) {
  const s = await open(path.resolve(o._[1]), o, 640, 360); console.log(JSON.stringify(s.info, null, 1)); await s.close();
}

async function qa(o) {
  const v = path.resolve(o._[1]);
  const pr = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt,color_range:format=duration,size,bit_rate', '-of', 'json', v], { encoding: 'utf8' }).stdout);
  const st = pr.streams[0], dur = Number(pr.format.duration);
  // per-frame mean absolute difference to the previous frame (on a small grey copy): spikes = flicker/pop, zeros = freeze
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', v, '-vf', 'scale=320:-2,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const d = [...r.stdout.matchAll(/YAVG=([0-9.]+)/g)].map((m) => Number(m[1])).slice(1);
  const sorted = [...d].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)] || 0;
  const [fn, fd] = st.r_frame_rate.split('/').map(Number), fps = fn / fd;
  const spikes = d.map((x, i) => [i + 1, x]).filter(([, x]) => x > Math.max(6, med * 8)).map(([i, x]) => ({ t: +(i / fps).toFixed(2), diff: +x.toFixed(1) }));
  const frozen = d.filter((x) => x < 0.002).length;
  const bl = spawnSync('ffmpeg', ['-v', 'info', '-i', v, '-vf', 'blackdetect=d=0.2:pix_th=0.06', '-f', 'null', '-'], { encoding: 'utf8' });
  const black = [...bl.stderr.matchAll(/black_start:([0-9.]+) black_end:([0-9.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const rep = { file: v, codec: st.codec_name, size: `${st.width}x${st.height}`, fps, frames: Number(st.nb_frames), duration: dur, pix_fmt: st.pix_fmt, mbps: +(pr.format.bit_rate / 1e6).toFixed(1),
    motion_median: +med.toFixed(3), motion_max: +(sorted[sorted.length - 1] || 0).toFixed(2), spikes: spikes.slice(0, 12), frozen_frames: frozen, black_segments: black };
  if (o.still) { // colour fidelity: decoded frame vs the PNG still of the same instant
    const t = Number(o.t ?? 0), tmp = path.join(os.tmpdir(), `paint-qa-${process.pid}.png`);
    spawnSync('ffmpeg', ['-v', 'error', '-y', '-ss', String(t), '-i', v, '-frames:v', '1', tmp]);
    const ps = spawnSync('ffmpeg', ['-v', 'info', '-i', tmp, '-i', path.resolve(o.still), '-lavfi', '[1][0]scale2ref[b][a];[a][b]psnr', '-f', 'null', '-'], { encoding: 'utf8' });
    rep.still_psnr_db = Number((ps.stderr.match(/average:([0-9.]+)/) || [])[1]); fs.existsSync(tmp) && fs.unlinkSync(tmp);
  }
  rep.problems = [];
  if (spikes.length) rep.problems.push(`${spikes.length} motion spike(s): a pop or sudden change at the listed times`);
  if (black.length) rep.problems.push('black segment(s) found');
  if (rep.frames !== Math.round(dur * fps)) rep.problems.push(`frame count ${rep.frames} does not match duration x fps = ${Math.round(dur * fps)}`);
  if (rep.still_psnr_db !== undefined && !(rep.still_psnr_db > 30)) rep.problems.push(Number.isNaN(rep.still_psnr_db) ? 'could not compare with the still (is --t inside the video, i.e. below duration - 1/fps?)' : `decoded frame differs from the still (${rep.still_psnr_db} dB): wrong --t, or the scene changed since the render`);
  rep.ok = rep.problems.length === 0;
  console.log(JSON.stringify(rep, null, 1));
}

const o = args(process.argv.slice(2));
const cmd = { still, render, preview, info, qa }[o._[0]];
if (!cmd || !o._[1]) { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n')); process.exit(1); }
cmd(o).catch((e) => { console.error(e.message || e); process.exit(1); });
