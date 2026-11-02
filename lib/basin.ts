// The basin: black water under every screen. A photo stands above the waterline and its
// reflection ripples below it. Scrolling and swiping pass from one photo to the next as a wave.
// Without WebGL2 the app falls back to plain images: see `[data-water="off"]` in globals.css.

const WATERLINE = 0.3;
const RIPPLE_WIDTH = 150;
const CACHE_SIZE = 10;

const VERTEX = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const head = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 o;
`;

const WAVE = `${head}
uniform sampler2D uRipple;
uniform vec2 uTexel;
void main() {
  vec4 c = texture(uRipple, vUv);
  float around = (
    texture(uRipple, vUv - vec2(uTexel.x, 0.0)).r + texture(uRipple, vUv + vec2(uTexel.x, 0.0)).r +
    texture(uRipple, vUv - vec2(0.0, uTexel.y)).r + texture(uRipple, vUv + vec2(0.0, uTexel.y)).r
  ) * 0.25;
  float speed = (c.g + (around - c.r) * 1.6) * 0.991;
  o = vec4((c.r + speed) * 0.999, speed, 0.0, 1.0);
}`;

const DROP = `${head}
uniform sampler2D uRipple;
uniform vec2 uPoint;
uniform float uRadius, uStrength, uAspect;
void main() {
  vec4 c = texture(uRipple, vUv);
  vec2 d = vUv - uPoint;
  d.x *= uAspect;
  float t = clamp(length(d) / uRadius, 0.0, 1.0);
  o = vec4(c.r - uStrength * (0.5 + 0.5 * cos(t * 3.14159265)), c.g, 0.0, 1.0);
}`;

const DISPLAY = `${head}
uniform sampler2D uRipple, uPhotoA, uPhotoB;
uniform vec2 uRippleTexel, uScaleA, uScaleB, uFocusA, uFocusB;
uniform float uMix, uHasA, uHasB, uTime, uReveal, uDim;
const float W = ${WATERLINE.toFixed(3)};
const vec3 GROUND = vec3(0.043, 0.039, 0.031);
const vec3 GLINT = vec3(1.0, 0.9, 0.74);

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = fract(sin(dot(i, vec2(127.1, 311.7))) * 43758.5453);
  float b = fract(sin(dot(i + vec2(1.0, 0.0), vec2(127.1, 311.7))) * 43758.5453);
  float c = fract(sin(dot(i + vec2(0.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  float d = fract(sin(dot(i + vec2(1.0, 1.0), vec2(127.1, 311.7))) * 43758.5453);
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

/** Photo colour at a point of the area above the waterline, cropped to fill it. */
vec3 photo(sampler2D tex, vec2 p, vec2 scale, vec2 focus, float zoom) {
  vec2 area = vec2(p.x, (p.y - W) / (1.0 - W));
  // The crop never leaves the picture, or its edge pixels would smear into streaks.
  vec2 span = scale * zoom * 0.5;
  vec2 uv = (area - 0.5) * scale * zoom + clamp(focus, span, 1.0 - span);
  uv = clamp(uv, 0.0, 1.0);
  return texture(tex, vec2(uv.x, 1.0 - uv.y)).rgb;
}

void main() {
  vec2 e = uRippleTexel * 1.5;
  vec2 slope = vec2(
    texture(uRipple, vUv + vec2(e.x, 0.0)).r - texture(uRipple, vUv - vec2(e.x, 0.0)).r,
    texture(uRipple, vUv + vec2(0.0, e.y)).r - texture(uRipple, vUv - vec2(0.0, e.y)).r
  );

  bool water = vUv.y < W;
  float depth = water ? (W - vUv.y) / W : 0.0;

  // Below the line the picture is mirrored, and the swell grows towards the viewer.
  vec2 p = vec2(vUv.x, water ? W + (W - vUv.y) * 1.2 : vUv.y);
  if (water) {
    float swell = depth * depth;
    p.x += (sin(vUv.y * 120.0 + uTime * 1.1) * 0.003 + sin(vUv.y * 46.0 - uTime * 0.7) * 0.007) * (0.25 + swell);
    p.y += sin(vUv.y * 80.0 + uTime * 0.9) * 0.006 * (0.25 + swell);
  }
  p += slope * (water ? 0.5 : 0.16);

  // The change of photo is a wave climbing the screen: the scroll position decides how far it got.
  float rough = noise(vUv * vec2(4.0, 3.0) + uTime * 0.12) * 0.3;
  float front = uMix * 1.5 - 0.25;
  float m = uMix <= 0.0 ? 0.0 : uMix >= 1.0 ? 1.0 : smoothstep(-0.11, 0.11, front - (vUv.y * 0.9 + rough * 0.5));
  float bend = sin(m * 3.14159265) * 0.05;

  float zoom = 0.94 - 0.03 * (0.5 + 0.5 * sin(uTime * 0.13));
  vec3 a = uHasA > 0.5 ? photo(uPhotoA, p + vec2(0.0, bend), uScaleA, uFocusA, zoom) : GROUND;
  vec3 b = uHasB > 0.5 ? photo(uPhotoB, p - vec2(0.0, bend), uScaleB, uFocusB, zoom) : GROUND;
  vec3 color = mix(a, b, m);

  // The picture rises out of black when a screen opens.
  float reveal = smoothstep(-0.14, 0.14, uReveal * 1.6 - 0.3 - (vUv.y * 0.9 + rough * 0.5));
  color = mix(GROUND, color, reveal);

  if (water) {
    color = mix(GROUND, color, mix(0.32, 0.05, smoothstep(0.0, 0.6, depth)));
    vec3 n = normalize(vec3(-slope * 26.0, 1.0));
    float glint = pow(max(dot(n, normalize(vec3(-0.25, 0.55, 0.8))), 0.0), 120.0);
    color += GLINT * glint * 0.5 * (1.0 - depth * 0.6);
  } else {
    // The photo darkens slightly where it meets the water, so the line reads as a surface.
    color *= 0.86 + 0.14 * smoothstep(W, W + 0.018, vUv.y);
  }
  o = vec4(color * uDim, 1.0);
}`;

type Target = { fbo: WebGLFramebuffer; tex: WebGLTexture };
type Program = { select(): void; u: Record<string, WebGLUniformLocation | null> };
type Photo = { tex: WebGLTexture; aspect: number; lightTop: boolean };

/** Whether the top of a photo is light, so the logo above it can stay readable. */
function isLightTop(image: HTMLImageElement) {
  const c = document.createElement("canvas");
  c.width = 8;
  c.height = 2;
  const x = c.getContext("2d", { willReadFrequently: true })!;
  x.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight * 0.14, 0, 0, 8, 2);
  const { data } = x.getImageData(0, 0, 8, 2);
  let sum = 0;
  for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return sum / (data.length / 4) > 150;
}

/** Same-origin copies, so the GPU may read them. */
export const photoUrl = (src: string) => (/^https?:/.test(src) ? `/_next/image?url=${encodeURIComponent(src)}&w=828&q=75` : src);

class Basin {
  private gl: WebGL2RenderingContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ready = false;
  private still = false;
  private programs!: Record<string, Program>;
  private ripple!: { read: Target; write: Target };
  private rippleSize: [number, number] = [0, 0];
  private photos = new Map<string, Photo>();
  private loading = new Map<string, Promise<Photo | null>>();
  private a: string | null = null;
  private b: string | null = null;
  private mixTo = 0;
  private dimGoal = 1;
  private dim = 1;
  private reveal = 0;
  private frame = 0;
  private nextDrop = 0;
  private queue: { x: number; y: number; radius: number; strength: number }[] = [];
  private focus: Record<string, [number, number]> = {};

  mount(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl || (!gl.getExtension("EXT_color_buffer_float") && !gl.getExtension("EXT_color_buffer_half_float"))) return false;
    this.gl = gl;
    try {
      this.compile();
      this.resize();
      if (!this.allocate()) return false;
    } catch {
      this.gl = null;
      return false;
    }
    gl.bindVertexArray(gl.createVertexArray());
    gl.disable(gl.BLEND);
    this.ready = true;
    this.frame = requestAnimationFrame(this.tick);
    addEventListener("resize", this.resize);
    document.addEventListener("visibilitychange", this.onVisible);
    return true;
  }

  unmount() {
    cancelAnimationFrame(this.frame);
    removeEventListener("resize", this.resize);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.ready = false;
  }

  /** Shows photo a, or the wave passing from a to b when `mix` is between 0 and 1. */
  show(a: string | null, b: string | null = null, mix = 0) {
    this.a = a && photoUrl(a);
    this.b = b && photoUrl(b);
    this.mixTo = b ? mix : 0;
    if (this.a) void this.load(this.a);
    if (this.b) void this.load(this.b);
  }

  /** Opens a new screen: black water, then the picture rises through it. */
  open(url: string | null, dim = 1) {
    this.show(url);
    this.dimGoal = dim;
    this.reveal = 0;
    this.ring();
  }

  preload(urls: (string | null | undefined)[]) {
    for (const url of urls) if (url) void this.load(photoUrl(url));
  }

  /** Where the subject sits in a photo: 0 to 1 from the left and from the bottom. */
  setFocus(url: string, x: number, y: number) {
    this.focus[photoUrl(url)] = [x, y];
  }

  /** A touch on the water, in CSS pixels. */
  touch(x: number, y: number, strength = 0.05, radius = 0.05) {
    const c = this.canvas;
    if (!this.ready || !c) return;
    const box = c.getBoundingClientRect();
    if (x < box.left || x > box.right) return;
    if (this.queue.length < 24) this.queue.push({ x: (x - box.left) / box.width, y: 1 - (y - box.top) / box.height, radius, strength });
  }

  /** One slow ring from the waterline, used when something changes. */
  ring(x = 0.5) {
    this.queue.push({ x, y: WATERLINE * 0.72, radius: 0.09, strength: 0.34 });
  }

  private onVisible = () => {
    cancelAnimationFrame(this.frame);
    if (!document.hidden && this.ready) this.frame = requestAnimationFrame(this.tick);
  };

  private resize = () => {
    const c = this.canvas!;
    const ratio = Math.min(Math.max(devicePixelRatio || 1, 1.5), 2);
    c.width = Math.round(c.clientWidth * ratio);
    c.height = Math.round(c.clientHeight * ratio);
  };

  private compile() {
    const gl = this.gl!;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader failed");
      return s;
    };
    const vertex = shader(gl.VERTEX_SHADER, VERTEX);
    const program = (source: string): Program => {
      const p = gl.createProgram()!;
      gl.attachShader(p, vertex);
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, source));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link failed");
      const u: Program["u"] = {};
      const total = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < total; i++) {
        const name = gl.getActiveUniform(p, i)!.name;
        u[name] = gl.getUniformLocation(p, name);
      }
      return { select: () => gl.useProgram(p), u };
    };
    this.programs = { wave: program(WAVE), drop: program(DROP), display: program(DISPLAY) };
  }

  private target(w: number, h: number): Target | null {
    const gl = this.gl!;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return null;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return { fbo, tex };
  }

  private allocate() {
    const c = this.canvas!;
    const w = RIPPLE_WIDTH;
    const h = Math.round((w * c.clientHeight) / Math.max(1, c.clientWidth));
    const read = this.target(w, h);
    const write = this.target(w, h);
    if (!read || !write) return false;
    this.ripple = { read, write };
    this.rippleSize = [w, h];
    return true;
  }

  private load(url: string) {
    const known = this.loading.get(url);
    if (known) return known;
    const job = new Promise<Photo | null>((resolve) => {
      const image = new Image();
      image.decoding = "async";
      image.onerror = () => resolve(null);
      image.onload = () => {
        const gl = this.gl;
        if (!gl) return resolve(null);
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const photo = { tex, aspect: image.naturalWidth / image.naturalHeight, lightTop: isLightTop(image) };
        this.photos.set(url, photo);
        this.evict();
        resolve(photo);
      };
      image.src = url;
    });
    this.loading.set(url, job);
    return job;
  }

  /** Phones have little texture memory, so only the photos around the current one stay loaded. */
  private evict() {
    for (const url of this.photos.keys()) {
      if (this.photos.size <= CACHE_SIZE) return;
      if (url === this.a || url === this.b) continue;
      this.gl!.deleteTexture(this.photos.get(url)!.tex);
      this.photos.delete(url);
      this.loading.delete(url);
    }
  }

  private bind(unit: number, tex: WebGLTexture, location: WebGLUniformLocation | null) {
    const gl = this.gl!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(location, unit);
  }

  private pass(program: Program) {
    const gl = this.gl!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ripple.write.fbo);
    gl.viewport(0, 0, this.rippleSize[0], this.rippleSize[1]);
    this.bind(0, this.ripple.read.tex, program.u.uRipple);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.ripple = { read: this.ripple.write, write: this.ripple.read };
  }

  private cover(photo: Photo | undefined): [number, number] {
    const c = this.canvas!;
    const area = c.clientWidth / (c.clientHeight * (1 - WATERLINE));
    const wide = (photo?.aspect ?? area) / area;
    return wide > 1 ? [1 / wide, 1] : [1, wide];
  }

  private tick = (now: number) => {
    this.frame = requestAnimationFrame(this.tick);
    const gl = this.gl!;
    const P = this.programs;

    if (!this.still && now > this.nextDrop) {
      this.queue.push({ x: 0.1 + Math.random() * 0.8, y: Math.random() * WATERLINE * 0.8, radius: 0.03, strength: 0.05 });
      this.nextDrop = now + 1800 + Math.random() * 1800;
    }
    P.drop.select();
    gl.uniform1f(P.drop.u.uAspect, this.canvas!.clientWidth / this.canvas!.clientHeight);
    for (const d of this.queue.splice(0, 3)) {
      gl.uniform2f(P.drop.u.uPoint, d.x, d.y);
      gl.uniform1f(P.drop.u.uRadius, d.radius);
      gl.uniform1f(P.drop.u.uStrength, d.strength);
      this.pass(P.drop);
    }
    P.wave.select();
    gl.uniform2f(P.wave.u.uTexel, 1 / this.rippleSize[0], 1 / this.rippleSize[1]);
    this.pass(P.wave);
    this.pass(P.wave);

    const A = this.a ? this.photos.get(this.a) : undefined;
    const B = this.b ? this.photos.get(this.b) : undefined;
    if (A) this.reveal = Math.min(1, this.reveal + (this.still ? 1 : 0.016));
    const shown = this.mixTo > 0.5 ? B : A;
    const chrome = shown?.lightTop ? "dark" : "light";
    if (document.documentElement.dataset.chrome !== chrome) document.documentElement.dataset.chrome = chrome;
    this.dim += (this.dimGoal - this.dim) * 0.06;

    const D = P.display;
    D.select();
    gl.uniform2f(D.u.uRippleTexel, 1 / this.rippleSize[0], 1 / this.rippleSize[1]);
    gl.uniform1f(D.u.uMix, this.mixTo);
    gl.uniform1f(D.u.uHasA, A ? 1 : 0);
    gl.uniform1f(D.u.uHasB, B ? 1 : 0);
    gl.uniform1f(D.u.uTime, this.still ? 0 : now / 1000);
    gl.uniform1f(D.u.uReveal, this.reveal);
    gl.uniform1f(D.u.uDim, this.dim);
    gl.uniform2f(D.u.uScaleA, ...this.cover(A));
    gl.uniform2f(D.u.uScaleB, ...this.cover(B));
    gl.uniform2f(D.u.uFocusA, ...(this.focus[this.a ?? ""] ?? [0.5, 0.55]));
    gl.uniform2f(D.u.uFocusB, ...(this.focus[this.b ?? ""] ?? [0.5, 0.55]));
    this.bind(0, this.ripple.read.tex, D.u.uRipple);
    if (A) this.bind(1, A.tex, D.u.uPhotoA);
    if (B) this.bind(2, B.tex, D.u.uPhotoB);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas!.width, this.canvas!.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
}

export const basin = new Basin();
