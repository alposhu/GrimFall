// ---------------------------------------------------------------------------
// pixel.js — the pixel-art toolkit every sprite in the game is built with.
//
// Sprites are written as arrays of strings ("pixel maps") where each character
// is a palette key. They are rasterised once at boot into offscreen canvases
// and blitted from there, so the hot loop never touches per-pixel work.
// ---------------------------------------------------------------------------

/** Shared palette keys used by the pixel maps. `.` and ` ` are transparent. */
export const PAL = {
  '.': null, ' ': null,
  o: '#0d0a14',      // hard outline
  O: '#1b1626',      // soft outline / shadow
  w: '#ffffff',
  W: '#e8e6f2',
  g: '#9aa0b5',      // grey
  G: '#5a6070',      // dark grey
  s: '#f0c9a0',      // skin
  S: '#c08f66',      // skin shade
  h: '#5a3a22',      // hair
  H: '#8a5a33',      // hair light
  l: '#7a4a2a',      // leather
  L: '#4a2c18',      // leather dark
  m: '#c9d2e0',      // metal
  M: '#7d8798',      // metal dark
  y: '#ffd75e',      // gold
  Y: '#c9922a',      // gold dark
  r: '#e8455f',      // red
  R: '#8f1f34',      // red dark
  b: '#4f9dff',      // blue
  B: '#23538f',      // blue dark
  c: '#5ee8d0',      // cyan
  C: '#1f8f86',      // cyan dark
  p: '#b76bff',      // purple
  P: '#5d2b8f',      // purple dark
  e: '#7fe05a',      // green
  E: '#2f7a34',      // green dark
  f: '#ff9a3c',      // fire orange
  F: '#c2431a',      // fire dark
  n: '#2a2438',      // night / cloth dark
  N: '#151020',      // deepest cloth
  t: '#d8d3c0',      // bone
  T: '#9a9280',      // bone shade
};

const cache = new Map();

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas: c, ctx };
}

/**
 * Rasterise a pixel map.
 * @param {string[]} rows   pixel map, one string per row
 * @param {object}   opts   { scale, palette, overrides }
 */
export function rasterize(rows, opts = {}) {
  const scale = opts.scale || 1;
  const palette = { ...PAL, ...(opts.palette || {}) };
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const { canvas, ctx } = makeCanvas(w * scale, h * scale);
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const col = palette[row[x]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return canvas;
}

/** Mirror a half-map into a full symmetric sprite (left half authored only). */
export function mirror(rows) {
  return rows.map((r) => r + [...r].reverse().join(''));
}

/** Flip an existing canvas horizontally — used for west-facing frames. */
export function flipX(src) {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.translate(src.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return canvas;
}

/** Replace every opaque pixel with `color` — cheap silhouettes and hit flashes. */
export function silhouette(src, color) {
  const { canvas, ctx } = makeCanvas(src.width, src.height);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Add a 1px (scaled) outline of `color` around the sprite silhouette. */
export function outline(src, color, thickness = 1) {
  const t = thickness;
  const { canvas, ctx } = makeCanvas(src.width + t * 2, src.height + t * 2);
  const sil = silhouette(src, color);
  for (let dx = -t; dx <= t; dx++) {
    for (let dy = -t; dy <= t; dy++) {
      if (dx === 0 && dy === 0) continue;
      ctx.drawImage(sil, t + dx, t + dy);
    }
  }
  ctx.drawImage(src, t, t);
  return canvas;
}

// ---------------------------------------------------------------------------
// Pixel drawing surface
//
// Some art is better described by geometry than by a hand-typed map — anything
// large, layered or anatomical. This is a tiny pixel-exact drawing toolkit:
// every primitive snaps to the pixel grid, so the result still reads as pixel
// art rather than as smooth vector shapes scaled up.
// ---------------------------------------------------------------------------
export function pixelSurface(w, h) {
  const { canvas, ctx } = makeCanvas(w, h);
  const api = {
    canvas, ctx,
    px(x, y, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
      return api;
    },
    rect(x, y, w2, h2, c) {
      ctx.fillStyle = c;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w2), Math.round(h2));
      return api;
    },
    disc(cx, cy, r, c) {
      ctx.fillStyle = c;
      for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
        const half = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
        ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
      }
      return api;
    },
    ellipse(cx, cy, rx, ry, c) {
      ctx.fillStyle = c;
      for (let y = -Math.ceil(ry); y <= Math.ceil(ry); y++) {
        const k = 1 - (y * y) / (ry * ry);
        if (k < 0) continue;
        const half = Math.floor(rx * Math.sqrt(k));
        ctx.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
      }
      return api;
    },
    line(x0, y0, x1, y1, c, thick = 1) {
      // Bresenham, so diagonals step cleanly instead of anti-aliasing.
      let x = Math.round(x0), y = Math.round(y0);
      const xe = Math.round(x1), ye = Math.round(y1);
      const dx = Math.abs(xe - x), dy = -Math.abs(ye - y);
      const sx = x < xe ? 1 : -1, sy = y < ye ? 1 : -1;
      let err = dx + dy;
      ctx.fillStyle = c;
      for (let guard = 0; guard < 4096; guard++) {
        ctx.fillRect(x - ((thick - 1) >> 1), y - ((thick - 1) >> 1), thick, thick);
        if (x === xe && y === ye) break;
        const e2 = 2 * err;
        if (e2 >= dy) { err += dy; x += sx; }
        if (e2 <= dx) { err += dx; y += sy; }
      }
      return api;
    },
    poly(points, c) {
      let minY = Infinity, maxY = -Infinity;
      for (const p of points) { if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; }
      ctx.fillStyle = c;
      for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
        const xs = [];
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
            xs.push(a[0] + ((y - a[1]) / (b[1] - a[1])) * (b[0] - a[0]));
          }
        }
        xs.sort((m, n) => m - n);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
          ctx.fillRect(x0, y, Math.max(1, x1 - x0), 1);
        }
      }
      return api;
    },
  };
  return api;
}

/** Adds a 1px outline around everything drawn so far. */
export function outlinePixels(canvas, color = '#0d0a14') {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const src = ctx.getImageData(0, 0, w, h);
  const out = ctx.createImageData(w, h);
  out.data.set(src.data);
  const alphaAt = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : src.data[(y * w + x) * 4 + 3]);
  const rgb = [parseInt(color.slice(1, 3), 16), parseInt(color.slice(3, 5), 16), parseInt(color.slice(5, 7), 16)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src.data[i + 3] > 0) continue;
      if (alphaAt(x - 1, y) || alphaAt(x + 1, y) || alphaAt(x, y - 1) || alphaAt(x, y + 1)) {
        out.data[i] = rgb[0]; out.data[i + 1] = rgb[1]; out.data[i + 2] = rgb[2]; out.data[i + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/** Nearest-neighbour upscale — keeps hard pixel edges. */
export function upscale(src, scale) {
  const { canvas, ctx } = makeCanvas(src.width * scale, src.height * scale);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Mirror the left half of a canvas onto its right half, guaranteeing symmetry. */
export function mirrorHalf(canvas) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const half = Math.ceil(w / 2);
  const { canvas: left } = (() => {
    const m = makeCanvas(half, h);
    m.ctx.drawImage(canvas, 0, 0, half, h, 0, 0, half, h);
    return m;
  })();
  ctx.save();
  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(left, 0, 0);
  ctx.restore();
  return canvas;
}

/** Memoised sprite build: `sprite('slime', () => rasterize(...))`. */
export function sprite(key, build) {
  let c = cache.get(key);
  if (!c) { c = build(); cache.set(key, c); }
  return c;
}

export function clearSpriteCache() { cache.clear(); }

/**
 * Draw a canvas centred on (x, y) with optional rotation/scale/alpha.
 * `anchorBottom` pins the sprite's feet to y instead of its centre.
 */
export function blit(ctx, img, x, y, {
  scale = 1, rot = 0, alpha = 1, flip = false, anchorBottom = false, tint = null, tintAlpha = 0,
} = {}) {
  if (!img) return;
  const w = img.width * scale, h = img.height * scale;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, anchorBottom ? y - h / 2 : y);
  if (rot) ctx.rotate(rot);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  if (tint && tintAlpha > 0) {
    ctx.globalAlpha *= tintAlpha;
    ctx.drawImage(silhouetteCached(img, tint), -w / 2, -h / 2, w, h);
  }
  ctx.restore();
}

const silCache = new Map();
function silhouetteCached(img, color) {
  const key = `${img.width}x${img.height}:${img.__id || (img.__id = ++silId)}:${color}`;
  let c = silCache.get(key);
  if (!c) { c = silhouette(img, color); silCache.set(key, c); }
  return c;
}
let silId = 0;

/**
 * Soft radial glow.
 *
 * Building a gradient per call is far too expensive here — a busy frame asks for
 * hundreds of these. Instead each colour gets one 128px gradient sprite, built
 * once and then blitted at whatever size the caller wants.
 */
const GLOW_R = 64;
const glowCache = new Map();

function fadeOut(color) {
  // A gradient must fade to the *same* hue at zero alpha; fading to
  // `transparent` (rgba(0,0,0,0)) drags every glow through a grey halo.
  if (color[0] === '#') {
    const hex = color.length === 4
      ? color.slice(1).split('').map((c) => c + c).join('')
      : color.slice(1, 7);
    const n = parseInt(hex, 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},0)`;
  }
  if (color.startsWith('rgb')) {
    const parts = color.slice(color.indexOf('(') + 1, color.lastIndexOf(')')).split(',');
    return `rgba(${parts[0]},${parts[1]},${parts[2]},0)`;
  }
  return 'transparent';
}

function glowSprite(color) {
  let c = glowCache.get(color);
  if (!c) {
    const { canvas, ctx } = makeCanvas(GLOW_R * 2, GLOW_R * 2);
    const g = ctx.createRadialGradient(GLOW_R, GLOW_R, 0, GLOW_R, GLOW_R, GLOW_R);
    g.addColorStop(0, color);
    g.addColorStop(1, fadeOut(color));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GLOW_R * 2, GLOW_R * 2);
    c = canvas;
    glowCache.set(color, c);
  }
  return c;
}

export function glow(ctx, x, y, r, color, alpha = 0.5) {
  if (r <= 0) return;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
