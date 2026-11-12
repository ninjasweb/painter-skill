// WebGPU renderer: draws a Painting at time t. Deterministic — the image depends only on (painting, t, size).

import { STROKE, FINISH, SEGMENTS } from './shaders.js';
import { STRIDE } from './painting.js';

export class Renderer {
  static async create(canvas, width, height) {
    if (!navigator.gpu) throw new Error('WebGPU not available (use Chrome/Edge 113+, or headless Chrome with --enable-unsafe-webgpu)');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();
    device.addEventListener?.('uncapturederror', (e) => console.error('WebGPU error: ' + e.error.message));
    const r = new Renderer(); r.device = device; r.canvas = canvas;
    r.ctx = canvas.getContext('webgpu');
    r._pipelines();
    r.resize(width, height);
    return r;
  }

  _pipelines() {
    const d = this.device;
    this.ubo = d.createBuffer({ size: 28 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const attributes = Array.from({ length: 8 }, (_, i) => ({ shaderLocation: i, offset: i * 16, format: 'float32x4' }));
    const sm = d.createShaderModule({ code: STROKE });
    const over = { color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
    this.strokeBGL = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: {} }] });
    this.strokePipe = d.createRenderPipeline({
      layout: d.createPipelineLayout({ bindGroupLayouts: [this.strokeBGL] }),
      vertex: { module: sm, entryPoint: 'vs', buffers: [{ arrayStride: STRIDE * 4, stepMode: 'instance', attributes }] },
      fragment: { module: sm, entryPoint: 'fs', targets: [{ format: 'rgba16float', blend: over }, { format: 'rgba16float', blend: over }] },
      primitive: { topology: 'triangle-strip' },
    });
    this.strokeBG = d.createBindGroup({ layout: this.strokeBGL, entries: [{ binding: 0, resource: { buffer: this.ubo } }] });
    const fm = d.createShaderModule({ code: FINISH });
    this.finishPipe = d.createRenderPipeline({
      layout: 'auto', vertex: { module: fm, entryPoint: 'vs' },
      fragment: { module: fm, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
      primitive: { topology: 'triangle-list' },
    });
    this.buffers = new Map(); // layer -> { buf, cap, version }
  }

  resize(w, h) {
    const d = this.device; this.w = w; this.h = h;
    this.canvas.width = w; this.canvas.height = h;
    this.ctx.configure({ device: d, format: 'rgba8unorm', alphaMode: 'opaque', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST });
    for (const t of [this.colT, this.hT, this.outT]) t?.destroy();
    const mk = (format, usage) => d.createTexture({ size: [w, h], format, usage });
    this.colT = mk('rgba16float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    this.hT = mk('rgba16float', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING);
    this.outT = mk('rgba8unorm', GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC);
    this.finishBG = d.createBindGroup({ layout: this.finishPipe.getBindGroupLayout(0), entries: [
      { binding: 0, resource: { buffer: this.ubo } }, { binding: 1, resource: this.colT.createView() }, { binding: 2, resource: this.hT.createView() }] });
    this.bpr = Math.ceil(w * 4 / 256) * 256;
    this.readBuf?.destroy();
    this.readBuf = d.createBuffer({ size: this.bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }

  _upload(layer) {
    const d = this.device; let e = this.buffers.get(layer);
    if (!e || e.cap < layer.count) {
      e?.buf.destroy();
      const cap = Math.max(256, Math.ceil(layer.count * 1.3));
      e = { buf: d.createBuffer({ size: cap * STRIDE * 4, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST }), cap, version: -1 };
      this.buffers.set(layer, e);
    }
    if (e.version !== layer.version) {
      if (layer.count) d.queue.writeBuffer(e.buf, 0, layer.data.buffer, layer.data.byteOffset, layer.count * STRIDE * 4);
      e.version = layer.version;
    }
    return e.buf;
  }

  /** Render the painting at time t. opts.boil: hand-made jitter amount (0 = rock steady), opts.boilFps. */
  render(painting, t, opts = {}) {
    const d = this.device, f = painting.frame(t), k = painting.look;
    const la = k.lightAngle, lz = 0.62;
    const u = new Float32Array([
      this.w, this.h, painting.aspect, t,
      f.cam.x, f.cam.y, f.cam.zoom, painting.parallax.far,
      painting.parallax.zoomFar, f.wind.strength, t * f.wind.speed, opts.boil ?? k.boil ?? 0,
      ...painting.ground, k.weave,
      k.relief, k.gloss, k.vignette, k.grain,
      Math.cos(la) * 0.78, Math.sin(la) * 0.78, lz, f.grade.exposure,
      ...f.grade.tint, Math.floor(t * (opts.boilFps ?? k.boilFps ?? 8)) * 17.31,
    ]);
    d.queue.writeBuffer(this.ubo, 0, u);
    const enc = d.createCommandEncoder();
    const clear = { r: 0, g: 0, b: 0, a: 0 };
    const pass = enc.beginRenderPass({ colorAttachments: [
      { view: this.colT.createView(), loadOp: 'clear', storeOp: 'store', clearValue: clear },
      { view: this.hT.createView(), loadOp: 'clear', storeOp: 'store', clearValue: clear }] });
    pass.setPipeline(this.strokePipe); pass.setBindGroup(0, this.strokeBG);
    for (const layer of f.layers) {
      if (!layer.count || layer.hidden) continue;
      pass.setVertexBuffer(0, this._upload(layer));
      pass.draw((SEGMENTS + 1) * 2, layer.count);
    }
    pass.end();
    const fin = enc.beginRenderPass({ colorAttachments: [{ view: this.outT.createView(), loadOp: 'clear', storeOp: 'store', clearValue: clear }] });
    fin.setPipeline(this.finishPipe); fin.setBindGroup(0, this.finishBG); fin.draw(3); fin.end();
    enc.copyTextureToTexture({ texture: this.outT }, { texture: this.ctx.getCurrentTexture() }, [this.w, this.h]);
    if (opts.readback) enc.copyTextureToBuffer({ texture: this.outT }, { buffer: this.readBuf, bytesPerRow: this.bpr }, [this.w, this.h]);
    d.queue.submit([enc.finish()]);
  }

  /** Render and return tightly packed RGBA8 pixels (Uint8Array, top row first). */
  async pixels(painting, t, opts = {}) {
    this.render(painting, t, { ...opts, readback: true });
    await this.readBuf.mapAsync(GPUMapMode.READ);
    const src = new Uint8Array(this.readBuf.getMappedRange());
    const out = new Uint8Array(this.w * this.h * 4);
    for (let y = 0; y < this.h; y++) out.set(src.subarray(y * this.bpr, y * this.bpr + this.w * 4), y * this.w * 4);
    this.readBuf.unmap();
    return out;
  }
}
