// WGSL for the two passes:
//  1. STROKE — every brush stroke is an instanced ribbon along a quadratic bezier. The fragment shader
//     synthesises the brush mark (bristle streaks, frayed ends, paint running out, dry-brush breaking on the
//     canvas tooth) and writes colour + paint height (impasto) to two targets, in painting order.
//  2. FINISH — lights the height field like raking studio light on oil paint, lets the canvas weave show
//     through thin paint, adds gloss on thick paint, then grade, vignette and grain.

export const SEGMENTS = 12;

const COMMON = /* wgsl */`
struct Globals {
  a: vec4f, // res.xy, aspect, time
  b: vec4f, // cam.xy, zoom, parFar
  c: vec4f, // zoomFar, windStrength, windTime, boil
  d: vec4f, // ground.rgb, weave
  e: vec4f, // relief, gloss, vignette, grain
  f: vec4f, // light.xyz, exposure
  g: vec4f, // tint.rgb, frameSeed
};
@group(0) @binding(0) var<uniform> G: Globals;

fn hash11(p: f32) -> f32 { var x = fract(p * 0.1031); x *= x + 33.33; x *= x + x; return fract(x); }
fn hash21(p: vec2f) -> f32 { var q = fract(vec3f(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2f(1.0, 0.0)), u.x), mix(hash21(i + vec2f(0.0, 1.0)), hash21(i + vec2f(1.0, 1.0)), u.x), u.y);
}
fn fbm2(p: vec2f) -> f32 { return 0.6 * vnoise(p) + 0.3 * vnoise(p * 2.07 + 11.3) + 0.1 * vnoise(p * 4.3 + 37.1); }

// Plain-weave canvas height 0..1. p in scene units (height of the picture = 1).
fn weave(p: vec2f) -> f32 {
  var q = p * 170.0;
  q += (vec2f(vnoise(p * 7.0), vnoise(p * 7.0 + 19.0)) - 0.5) * 1.6;      // threads wander a little
  let c = floor(q); let f = fract(q) - 0.5;
  let knuckle = cos(f.x * 3.14159) * cos(f.y * 3.14159);                    // one bump per crossing
  let slub = vnoise(vec2f(c.x * 0.9, q.y * 0.06)) * vnoise(vec2f(q.x * 0.06, c.y * 0.9 + 31.0)); // uneven threads
  return clamp(knuckle * (0.25 + 1.3 * slub) + 0.5 * fbm2(q * 0.21) - 0.1, 0.0, 1.0);
}
`;

export const STROKE = COMMON + /* wgsl */`
struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,                         // u along 0..1, v across -1..1
  @location(1) @interpolate(flat) colA: vec4f,    // rgb, opacity
  @location(2) @interpolate(flat) colB: vec4f,    // rgb, mix2
  @location(3) @interpolate(flat) tool: vec4f,    // bristles, soft, dry, thick
  @location(4) @interpolate(flat) misc: vec4f,    // seed, progress, fray, load
  @location(5) @interpolate(flat) dims: vec2f,    // length, width (scene units)
  @location(6) scene: vec2f,                      // scene-space position: the paint sticks to this
};

const SEG = ${SEGMENTS}.0;

fn windAt(p: vec2f, seed: f32) -> vec2f {
  let t = G.c.z;
  let gust = 0.6 + 0.4 * sin(t * 0.37 + p.x * 1.7);
  let a = sin(t * 1.25 + p.x * 3.1 + p.y * 1.3 + seed * 0.37) + 0.45 * sin(t * 2.9 + p.x * 7.3 + seed * 1.9);
  let b = cos(t * 1.7 + p.y * 4.1 + seed * 0.61) * 0.35;
  return vec2f(a, b) * gust * G.c.y;
}

@vertex fn vs(@builtin(vertex_index) vi: u32,
  @location(0) a0: vec4f, @location(1) a1: vec4f, @location(2) a2: vec4f, @location(3) a3: vec4f,
  @location(4) a4: vec4f, @location(5) a5: vec4f, @location(6) a6: vec4f, @location(7) a7: vec4f) -> VOut {
  var o: VOut;
  var p0 = a0.xy; var p1 = a0.zw; var p2 = a1.xy;
  let width = a1.z; let tap0 = a1.w; let tap1 = a2.x;
  let seed = a5.y; let depth = a5.z; let t0 = a5.w; let dur = a6.x;
  let sway = a6.y; let swayRoot = a6.z; let drift = vec2f(a6.w, a7.x); let shimmer = a7.y;
  let time = G.a.w; let aspect = G.a.z;

  // living motion: wind sway (root may stay anchored), slow drift, optional hand-made boil
  if (sway > 0.0) {
    let w0 = windAt(p0, seed) * sway;
    p0 += w0 * swayRoot; p1 += w0 * mix(swayRoot, 1.0, 0.5); p2 += w0;
  }
  let dr = drift * time; p0 += dr; p1 += dr; p2 += dr;
  if (G.c.w > 0.0) {
    let j = (vec2f(hash11(seed + G.g.w), hash11(seed * 1.7 + G.g.w + 5.0)) - 0.5) * G.c.w * width;
    p0 += j; p1 += j * 0.5; p2 -= j;
  }

  let u = floor(f32(vi) * 0.5) / SEG;
  let side = f32(vi & 1u) * 2.0 - 1.0;
  let iu = 1.0 - u;
  let pos = iu * iu * p0 + 2.0 * iu * u * p1 + u * u * p2;
  var tan = 2.0 * iu * (p1 - p0) + 2.0 * u * (p2 - p1);
  if (dot(tan, tan) < 1e-12) { tan = p2 - p0 + vec2f(1e-6, 0.0); }
  let nrm = normalize(vec2f(-tan.y, tan.x));
  let scene = pos + nrm * side * width * 0.5 * mix(tap0, tap1, u);

  // multiplane camera: far layers shift and scale less than near ones
  let c0 = vec2f(aspect * 0.5, 0.5);
  let par = mix(G.b.w, 1.0, depth);
  let z = mix(1.0 + (G.b.z - 1.0) * G.c.x, G.b.z, depth);
  let v = (scene - c0 - (G.b.xy - c0) * par) * z;
  var clip = vec4f(v.x / (aspect * 0.5), -v.y / 0.5, 0.0, 1.0);

  let progress = (time - t0) / max(dur, 1e-4);
  if (progress <= 0.0) { clip = vec4f(2.0, 2.0, 2.0, 1.0); }

  var opacity = a3.x;
  if (shimmer > 0.0) { opacity *= 1.0 - shimmer * (0.5 + 0.5 * sin(time * (2.0 + 3.0 * hash11(seed)) + seed * 6.283)); }

  let chord = length(p2 - p0);
  o.pos = clip;
  o.uv = vec2f(u, side);
  o.colA = vec4f(a2.yzw, opacity);
  o.colB = vec4f(a3.yzw, a4.x);
  o.tool = vec4f(a4.y, a4.z, a4.w, a5.x);
  o.misc = vec4f(seed, progress, a7.z, a7.w);
  o.dims = vec2f(0.5 * (chord + length(p1 - p0) + length(p2 - p1)), width);
  o.scene = scene - dr;
  return o;
}

struct FOut { @location(0) color: vec4f, @location(1) height: vec4f };

@fragment fn fs(i: VOut) -> FOut {
  let u = i.uv.x; let v = i.uv.y;
  let bristles = i.tool.x; let soft = i.tool.y; let dry = i.tool.z; let thick = i.tool.w;
  let seed = i.misc.x; let progress = i.misc.y; let fray = i.misc.z; let load = i.misc.w;
  if (u > progress) { discard; }

  let ar = i.dims.x / max(i.dims.y, 1e-5);     // stroke length measured in brush widths
  let s = u * ar; let e = (1.0 - u) * ar;        // distance from the start / to the end, in widths

  // bristle coordinate and streaks that run the length of the stroke
  let bi = (v * 0.5 + 0.5) * bristles + seed * 13.1;
  let bid = floor(bi);
  let streak = 0.65 * vnoise(vec2f(bi, s * 0.22 + seed)) + 0.35 * vnoise(vec2f(bi * 2.3 + 7.0, s * 0.9 + seed * 3.0));
  let rag = vnoise(vec2f(v * 1.7 + seed * 3.3, s * 0.8 + seed * 5.1));

  // silhouette: rounded ends, edge softness, frayed outline
  let cap = max(max(0.5 - s, 0.5 - e), 0.0) * 2.0;
  let dd = length(vec2f(cap, v));
  let lim = 1.0 - fray * 0.38 * rag;
  let ew = max(soft, 0.03);
  var a = 1.0 - smoothstep(lim - ew, lim, dd);
  if (soft > 0.5) { a = a * a * (3.0 - 2.0 * a); }
  // individual bristles lift off at different moments
  a *= smoothstep(0.0, 0.25 + soft, e - hash11(bid * 1.31 + seed) * fray * 1.4);
  a *= smoothstep(0.0, 0.12 + soft * 0.6, s - hash11(bid * 2.17 + seed) * fray * 0.35);

  // paint runs out along the stroke; a dry brush only catches the top of the canvas tooth
  let dryness = clamp(dry + load * u * 0.7, 0.0, 1.0);
  let tooth = weave(i.scene) * 0.3 + 0.7 * fbm2(i.scene * 120.0);
  let gate = smoothstep(0.22, 0.78, streak) * 0.6 + tooth * 0.4;
  let cover = smoothstep(dryness * 0.68 - 0.12, dryness * 0.68 + 0.12, gate);
  a *= cover;

  // paint is never perfectly mixed on the brush
  let sel = smoothstep(1.0 - i.colB.w - 0.12, 1.0 - i.colB.w + 0.12, hash11(bid * 7.7 + seed * 1.9) * 0.8 + 0.2 * streak);
  var c = mix(i.colA.rgb, i.colB.rgb, sel * step(0.001, i.colB.w));
  c *= 0.955 + 0.09 * hash11(bid + seed * 3.1);
  c *= 0.95 + 0.10 * streak;

  a *= i.colA.w;

  // impasto: ridges between bristle tracks and along the edges of a loaded stroke
  let ridge = smoothstep(0.5, 0.88, dd) * (1.0 - smoothstep(0.88, 1.0, dd)) * (1.0 - soft);
  let h = thick * (0.35 + 0.65 * streak + 0.55 * ridge) * (0.55 + 0.45 * cover);

  var o: FOut;
  o.color = vec4f(c, a);
  o.height = vec4f(h, thick, 0.0, a * 0.85);
  return o;
}
`;

export const FINISH = COMMON + /* wgsl */`
@group(0) @binding(1) var colT: texture_2d<f32>;
@group(0) @binding(2) var hT: texture_2d<f32>;

@vertex fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
  return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn surf(px: vec2i) -> f32 {
  let res = vec2i(G.a.xy);
  let q = clamp(px, vec2i(0), res - vec2i(1));
  let ph = textureLoad(hT, q, 0).r;
  let sp = vec2f(q) / G.a.y;                       // scene units, canvas fixed to the frame
  return ph * 1.6 + weave(sp) * G.d.w * 0.3 * (1.0 - 0.85 * smoothstep(0.0, 0.3, ph));
}

@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy);
  let paint = textureLoad(colT, px, 0);
  let hh = textureLoad(hT, px, 0);
  var c = paint.rgb + G.d.rgb * (1.0 - paint.a);

  let k = G.a.y / 1080.0;
  let dx = surf(px + vec2i(1, 0)) - surf(px - vec2i(1, 0));
  let dy = surf(px + vec2i(0, 1)) - surf(px - vec2i(0, 1));
  let n = normalize(vec3f(-dx * 3.2 * k, -dy * 3.2 * k, 1.0));
  let L = normalize(G.f.xyz);
  let shade = dot(n, L) / L.z;
  c *= mix(1.0, clamp(shade, 0.45, 1.7), G.e.x);
  let H = normalize(L + vec3f(0.0, 0.0, 1.0));
  let spec = pow(max(dot(n, H), 0.0), 42.0) - pow(H.z, 42.0);
  c += max(spec, 0.0) * G.e.y * smoothstep(0.05, 0.6, hh.g) * 0.55;

  c *= G.f.w * G.g.rgb;
  let uv = fc.xy / G.a.xy;
  let vg = distance(uv, vec2f(0.5)) * 1.25;
  c *= 1.0 - G.e.z * vg * vg;
  c += (hash21(fc.xy) - 0.5) * G.e.w * (0.4 + 0.6 * (1.0 - dot(c, vec3f(0.33))));
  return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;
