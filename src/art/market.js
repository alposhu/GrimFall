// ---------------------------------------------------------------------------
// market.js — the Long Market.
//
// The hub between boss fights. Everything here is drawn in code like the rest
// of the game: cobbles are a seamless tile, the stalls and props are pixel
// maps, and the three vendors are authored figures rather than recoloured
// heroes, because you spend a whole conversation looking at them.
//
// The palette deliberately breaks from the run — the world outside is cold and
// desaturated, so the market is warm: ochre awnings, terracotta, brass and
// lamplight. Walking in should feel like stepping indoors.
// ---------------------------------------------------------------------------

import { rasterize, mirror, sprite, pixelSurface, outlinePixels, upscale, glow } from './pixel.js';
import { makeRng } from '../core/util.js';
import { itemIcon } from './items.js';

const OUT = '#1a1119';

// ---------------------------------------------------------------------------
// Ground
// ---------------------------------------------------------------------------
/** A seamless cobble tile. Four variants so the paving does not visibly repeat. */
export function cobbleTile(variant = 0, size = 32) {
  return sprite(`market:cobble:${variant}:${size}`, () => {
    const s = pixelSurface(size, size);
    const rng = makeRng(9001 + variant * 77);
    s.rect(0, 0, size, size, '#3a2f33');

    // Irregular stones on a jittered grid, clipped by the tile edge so opposite
    // sides still meet: a stone that runs off the right comes back on the left.
    const step = 8;
    for (let gy = 0; gy < size; gy += step) {
      for (let gx = 0; gx < size; gx += step) {
        const ox = (rng() * 3 - 1.5) | 0;
        const oy = (rng() * 3 - 1.5) | 0;
        const w = 5 + ((rng() * 3) | 0);
        const h = 4 + ((rng() * 3) | 0);
        const shade = rng();
        const c = shade < 0.25 ? '#584a4c' : shade < 0.6 ? '#4c4042' : shade < 0.85 ? '#453a3d' : '#5f5154';
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            s.px((gx + ox + x + size) % size, (gy + oy + y + size) % size, c);
          }
        }
        // A lit top edge gives the stone a little height.
        for (let x = 0; x < w; x++) s.px((gx + ox + x + size) % size, (gy + oy + size) % size, '#6b5b5e');
      }
    }
    // Scattered grit and the odd wet patch catching lamplight.
    for (let i = 0; i < 26; i++) {
      s.px((rng() * size) | 0, (rng() * size) | 0, rng() < 0.5 ? '#2e2528' : '#6f6063');
    }
    return s.canvas;
  });
}

// ---------------------------------------------------------------------------
// Stalls
// ---------------------------------------------------------------------------
// Awning colour, counter timber, and what is piled on the counter.
const STALLS = {
  arms:   { cloth: '#8f2f2a', cloth2: '#6a201d', wood: '#5a3a22', goods: 'blades' },
  herbs:  { cloth: '#3f7d5a', cloth2: '#2a5540', wood: '#4a3520', goods: 'bottles' },
  coin:   { cloth: '#3c4f8f', cloth2: '#2a3766', wood: '#523a26', goods: 'scales' },
  cloth:  { cloth: '#8a5f2a', cloth2: '#63431d', wood: '#4f3a24', goods: 'bolts' },
  fruit:  { cloth: '#a8562a', cloth2: '#7a3c1d', wood: '#563d24', goods: 'produce' },
};

export const STALL_KINDS = Object.keys(STALLS);

/** A market stall: striped awning on posts, counter, and goods on top. */
export function stallSprite(kind = 'arms', scale = 2) {
  return sprite(`market:stall:${kind}:${scale}`, () => {
    const def = STALLS[kind] || STALLS.arms;
    const W = 68, H = 60;
    const s = pixelSurface(W, H);
    const rng = makeRng(kind.length * 131 + 7);

    // --- awning: a shallow arc of vertical stripes, scalloped along the front
    for (let x = 2; x < W - 2; x++) {
      const t = (x - 2) / (W - 5);
      const sag = Math.round(Math.sin(t * Math.PI) * -2);
      const top = 6 + sag;
      const bot = 17 + sag + Math.round(Math.sin(t * Math.PI) * 2);
      const c = ((x / 6) | 0) % 2 === 0 ? def.cloth : '#e8dcc0';
      s.rect(x, top, 1, bot - top, c);
      s.px(x, top, '#f2e8d2');                       // sun on the ridge
      // scalloped hem
      const notch = Math.abs(((x - 2) % 12) - 6) < 2 ? 2 : 0;
      s.rect(x, bot, 1, 2 + notch, def.cloth2);
    }

    // --- posts
    for (const px of [4, W - 6]) {
      s.rect(px, 14, 3, H - 20, def.wood);
      s.rect(px, 14, 1, H - 20, '#7a5334');
    }

    // --- counter
    s.rect(2, H - 20, W - 4, 4, '#7a5334');
    s.rect(2, H - 16, W - 4, 10, def.wood);
    for (let x = 4; x < W - 4; x += 7) s.rect(x, H - 16, 1, 10, '#3e2a18');
    s.rect(2, H - 7, W - 4, 2, '#2e1f14');

    // --- goods on the counter
    const y = H - 24;
    if (def.goods === 'blades') {
      for (let i = 0; i < 5; i++) {
        const x = 10 + i * 11;
        s.rect(x, y - 8, 2, 9, '#b9c2d0');
        s.px(x, y - 8, '#e6ecf5');
        s.rect(x - 1, y + 1, 4, 2, '#6b4a25');
      }
    } else if (def.goods === 'bottles') {
      for (let i = 0; i < 6; i++) {
        const x = 8 + i * 9;
        const c = ['#7fe05a', '#ff6a8a', '#9ad4ff', '#ffd75e', '#c58aff', '#6ee0d0'][i];
        s.rect(x, y - 6, 4, 7, c);
        s.rect(x + 1, y - 9, 2, 3, '#cfd8e6');
        s.px(x, y - 6, '#ffffff');
      }
    } else if (def.goods === 'scales') {
      s.rect(30, y - 12, 2, 13, '#c9a45c');
      s.rect(22, y - 12, 18, 1, '#c9a45c');
      s.rect(21, y - 9, 5, 2, '#e0c07a');
      s.rect(36, y - 8, 5, 2, '#e0c07a');
      for (let i = 0; i < 8; i++) s.px(46 + (i % 4) * 3, y - 1 - ((i / 4) | 0) * 3, '#ffd75e');
    } else if (def.goods === 'bolts') {
      for (let i = 0; i < 4; i++) {
        const x = 10 + i * 13;
        const c = ['#8f2f2a', '#3c4f8f', '#3f7d5a', '#8a5f2a'][i];
        s.rect(x, y - 7, 10, 8, c);
        s.rect(x, y - 7, 10, 1, '#e8dcc0');
      }
    } else {
      for (let i = 0; i < 22; i++) {
        const x = 8 + ((rng() * (W - 18)) | 0);
        const yy = y - ((rng() * 6) | 0);
        s.disc(x, yy, 2, ['#c2431a', '#ff8a2a', '#7fe05a', '#a83a5a'][(rng() * 4) | 0]);
      }
    }

    outlinePixels(s.canvas, OUT);
    return s.canvas;
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
const PROPS = {
  barrel: () => {
    const s = pixelSurface(16, 20);
    s.rect(2, 2, 12, 17, '#6b4a25');
    s.rect(2, 2, 2, 17, '#8a6234');
    s.rect(12, 2, 2, 17, '#4a3218');
    for (const y of [4, 10, 16]) s.rect(1, y, 14, 2, '#3a3f4a');
    s.ellipse(8, 3, 6, 2, '#8a6234');
    return s.canvas;
  },
  crate: () => {
    const s = pixelSurface(18, 16);
    s.rect(1, 2, 16, 13, '#7a5334');
    s.rect(1, 2, 16, 2, '#96683a');
    s.line(1, 3, 16, 14, '#4a3218');
    s.line(16, 3, 1, 14, '#4a3218');
    s.rect(1, 2, 1, 13, '#4a3218');
    s.rect(16, 2, 1, 13, '#4a3218');
    return s.canvas;
  },
  sack: () => {
    const s = pixelSurface(14, 16);
    s.ellipse(7, 10, 6, 5, '#c9b78c');
    s.rect(2, 7, 11, 6, '#c9b78c');
    s.rect(4, 3, 6, 5, '#b3a07a');
    s.rect(4, 5, 6, 1, '#6b5a3a');
    s.px(5, 9, '#8a7a56'); s.px(9, 11, '#8a7a56');
    return s.canvas;
  },
  basket: () => {
    const s = pixelSurface(16, 14);
    s.ellipse(8, 9, 7, 5, '#a8823f');
    for (let y = 5; y < 13; y += 2) s.rect(2, y, 12, 1, '#7a5f2a');
    s.ellipse(8, 5, 7, 2, '#c9a45c');
    s.disc(5, 4, 2, '#c2431a'); s.disc(9, 4, 2, '#ff8a2a'); s.disc(7, 3, 2, '#7fe05a');
    return s.canvas;
  },
  urn: () => {
    const s = pixelSurface(14, 20);
    s.ellipse(7, 13, 6, 6, '#a05a3a');
    s.rect(4, 5, 6, 8, '#a05a3a');
    s.rect(3, 3, 8, 3, '#c27a4a');
    s.rect(4, 5, 2, 8, '#c27a4a');
    s.rect(2, 11, 1, 4, '#7a3f28');
    return s.canvas;
  },
  bench: () => {
    const s = pixelSurface(30, 14);
    s.rect(1, 4, 28, 4, '#6b4a25');
    s.rect(1, 4, 28, 1, '#8a6234');
    s.rect(3, 8, 3, 5, '#4a3218');
    s.rect(24, 8, 3, 5, '#4a3218');
    return s.canvas;
  },
  lamppost: () => {
    const s = pixelSurface(12, 44);
    s.rect(5, 10, 2, 32, '#3a3f4a');
    s.ellipse(6, 42, 4, 2, '#2b2f38');
    s.rect(3, 3, 6, 8, '#ffd75e');       // the glass
    s.rect(3, 3, 6, 1, '#c9a45c');
    s.rect(2, 1, 8, 2, '#5a4a2a');
    s.rect(3, 11, 6, 1, '#5a4a2a');
    return s.canvas;
  },
  brazierBase: () => {
    const s = pixelSurface(18, 22);
    s.ellipse(9, 19, 7, 3, '#3a3f4a');
    s.rect(7, 10, 4, 9, '#4a4f5c');
    s.poly([[2, 6], [16, 6], [13, 13], [5, 13]], '#5a6274');
    s.poly([[3, 6], [15, 6], [14, 8], [4, 8]], '#7a8496');
    s.rect(4, 8, 10, 3, '#2b1a12');       // embers under the flame
    s.rect(5, 8, 8, 1, '#ff6a3c');
    return s.canvas;
  },
  well: () => {
    const s = pixelSurface(44, 40);
    s.ellipse(22, 30, 20, 9, '#5a5054');
    s.ellipse(22, 28, 17, 7, '#3a3236');
    s.ellipse(22, 27, 13, 5, '#1c2a33');   // water
    s.ellipse(22, 26, 9, 3, '#2f4a58');
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      s.px(22 + Math.cos(a) * 19, 30 + Math.sin(a) * 8.5, i % 3 ? '#6b6165' : '#4a4245');
    }
    // posts and the crossbeam
    s.rect(6, 4, 3, 24, '#5a3a22');
    s.rect(35, 4, 3, 24, '#5a3a22');
    s.rect(5, 2, 34, 3, '#7a5334');
    s.rect(21, 5, 2, 7, '#3a3f4a');        // rope
    s.rect(19, 12, 6, 5, '#6b4a25');       // bucket
    return s.canvas;
  },
  arch: () => {
    const s = pixelSurface(72, 64);
    // Two piers and a round arch — the way out, back to the run.
    s.rect(2, 12, 12, 52, '#5f5154');
    s.rect(58, 12, 12, 52, '#5f5154');
    s.rect(2, 12, 3, 52, '#77686c');
    s.rect(58, 12, 3, 52, '#77686c');
    for (let y = 16; y < 64; y += 8) { s.rect(2, y, 12, 1, '#3f3538'); s.rect(58, y, 12, 1, '#3f3538'); }
    for (let x = 0; x < 72; x++) {
      const t = (x - 36) / 34;
      if (Math.abs(t) > 1) continue;
      const y = 12 - Math.round(Math.cos(t * Math.PI / 2) * 10);
      s.rect(x, y, 1, 12 - y + 2, '#5f5154');
      s.px(x, y, '#8a7b7f');
    }
    s.rect(14, 12, 44, 3, '#4a4043');
    return s.canvas;
  },
};

export const PROP_KINDS = Object.keys(PROPS);

export function marketProp(kind, scale = 2) {
  return sprite(`market:prop:${kind}:${scale}`, () => {
    const src = (PROPS[kind] || PROPS.crate)();
    outlinePixels(src, OUT);
    return scale === 1 ? src : upscale(src, scale);
  });
}

// ---------------------------------------------------------------------------
// Vendors
// ---------------------------------------------------------------------------
// Palette keys: r robe/apron  R robe light  k dark  s skin  S skin shade
//               m metal       g gold        h hair  o outline  w white
const VENDOR_ART = {
  // Broad, bald, white beard, leather apron. Stands square to you.
  oswin: {
    pal: { o: OUT, r: '#6b4a25', R: '#8a6234', k: '#3a2818', s: '#c98d5a', S: '#9c6740', m: '#8b93a8', g: '#ffd75e', h: '#4a3218', w: '#e8dcc0' },
    map: mirror([
      '....oooo',
      '...ossss',
      '..osssss',
      '..ossoss',
      '..osssss',
      '..owwwss',
      '...owwww',
      '..orrrrr',
      '.osrrrrr',
      'osrrrrrr',
      'osrrRRrr',
      'osrrRRrr',
      'osrrrrrr',
      '.okrrrrr',
      '..okkkkk',
      '..okkkkk',
    ]),
  },
  // Tall and hooded, the face set back inside the cowl.
  marta: {
    pal: { o: OUT, r: '#3f7d5a', R: '#57a377', k: '#25543c', s: '#e0b48a', S: '#b98a63', m: '#c9a45c', g: '#ffd75e', h: '#6b4326', w: '#e8dcc0' },
    map: mirror([
      '.....ooo',
      '...oorrr',
      '..orrrrr',
      '..orrsss',
      '..orssss',
      '..orssos',
      '...orsss',
      '....orrr',
      '...orrrr',
      '..orrrrr',
      '..orrRRR',
      '..orrRRR',
      '..orrrrr',
      '..orrrrr',
      '.okrrrrr',
      '.okkkkkk',
    ]),
  },
  // Thin and stooped under a wide brim that hides the eyes.
  coinweigher: {
    pal: { o: OUT, r: '#3d334a', R: '#57496b', k: '#241d30', s: '#cfa87e', S: '#9e7a56', m: '#8b93a8', g: '#ffd75e', h: '#2b2f38', w: '#b9a8cf' },
    map: mirror([
      '..hhhhhh',
      '.ohhhhhh',
      'ohhhhhhh',
      '...ossss',
      '...ossos',
      '...osSss',
      '....orrr',
      '...orrrr',
      '..orrrrr',
      '..orrRRr',
      '..orrRRr',
      '..orrrrr',
      '...orrrr',
      '...orrrr',
      '...okrrr',
      '...okkkk',
    ]),
  },
};

export const VENDOR_IDS = Object.keys(VENDOR_ART);

export function vendorSprite(id, scale = 3) {
  return sprite(`market:vendor:${id}:${scale}`, () => {
    const def = VENDOR_ART[id] || VENDOR_ART.oswin;
    return rasterize(def.map, { scale, palette: def.pal });
  });
}

/** Head-and-shoulders crop for the dialogue box. */
export function vendorPortrait(id, scale = 6) {
  return sprite(`market:vendorface:${id}:${scale}`, () => {
    const def = VENDOR_ART[id] || VENDOR_ART.oswin;
    return rasterize(def.map.slice(0, 9), { scale, palette: def.pal });
  });
}

// ---------------------------------------------------------------------------
// Things that move
// ---------------------------------------------------------------------------
/**
 * A hanging trade sign: a board on two chains with the vendor's mark burned
 * into it. Every market square in every game solves "what does this stall
 * sell?" this way, because it works from across the square and needs no words.
 */
export function drawTradeSign(ctx, x, y, icon, t, seed = 0) {
  const swing = Math.sin(t * 0.9 + seed) * 0.045;      // radians
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  // Chains up to the bracket.
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(-16, -22, 2, 22);
  ctx.fillRect(14, -22, 2, 22);
  // The board.
  ctx.fillStyle = '#1a1119';
  ctx.fillRect(-26, -2, 52, 34);
  ctx.fillStyle = '#5a3a22';
  ctx.fillRect(-24, 0, 48, 30);
  ctx.fillStyle = '#7a5334';
  ctx.fillRect(-24, 0, 48, 3);
  ctx.fillStyle = '#3e2a18';
  ctx.fillRect(-24, 27, 48, 3);
  const img = itemIcon(icon, 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, Math.round(-img.width / 2), Math.round(15 - img.height / 2));
  ctx.restore();
}

/**
 * A long banner hung down a wall. Two hang either side of the arch, which is
 * what stops the boundary reading as a flat black wall.
 */
export function drawWallBanner(ctx, x, y, h, color, trim, t, seed = 0) {
  const segs = 10;
  const w = 26;
  ctx.save();
  for (let i = 0; i < segs; i++) {
    const p = i / segs;
    const sway = Math.sin(t * 1.1 + seed + p * 2.2) * (2 + p * 3);
    const yy = y + p * h;
    ctx.fillStyle = i % 3 === 1 ? trim : color;
    ctx.fillRect(x - w / 2 + sway, yy, w, h / segs + 1);
    // A darker edge down one side gives the cloth a fold.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + w / 2 - 6 + sway, yy, 6, h / segs + 1);
  }
  // A pointed hem, and a finial at the top.
  const swayEnd = Math.sin(t * 1.1 + seed + 2.2) * 5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - w / 2 + swayEnd, y + h);
  ctx.lineTo(x + w / 2 + swayEnd, y + h);
  ctx.lineTo(x + swayEnd, y + h + 12);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = trim;
  ctx.fillRect(x - w / 2 - 3, y - 5, w + 6, 5);
  ctx.restore();
}

/** A brazier flame — drawn live so every one in the square flickers apart. */
export function drawFlame(ctx, x, y, scale, t, seed = 0) {
  const n = 7;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const p = i / n;
    const wob = Math.sin(t * 7 + seed + i * 1.7) * (2 + p * 4);
    const h = (1 - p) * 22 * scale;
    const w = (1 - p * 0.6) * 7 * scale;
    ctx.globalAlpha = 0.5 + 0.5 * (1 - p);
    ctx.fillStyle = p < 0.3 ? '#fff2c0' : p < 0.62 ? '#ffb648' : '#e2521f';
    ctx.fillRect(x + wob * scale * 0.5 - w / 2, y - h, w, h * 0.5);
  }
  ctx.restore();
  glow(ctx, x, y - 10 * scale, 34 * scale, '#ff8a2a', 0.32 + Math.sin(t * 9 + seed) * 0.06);
}

/** A hanging pennant that ripples. Cloth is one strip of quads, cheap to draw. */
export function drawPennant(ctx, x, y, scale, t, color = '#8f2f2a', seed = 0) {
  const segs = 8;
  const len = 26 * scale;
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < segs; i++) {
    const p = i / segs;
    const sway = Math.sin(t * 2.6 + seed + p * 3.4) * p * 5 * scale;
    const h = (16 - p * 11) * scale;
    ctx.fillRect(x + p * len + sway * 0.3, y + sway, (len / segs) + 1, h);
  }
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  for (let i = 0; i < segs; i += 2) {
    const p = i / segs;
    const sway = Math.sin(t * 2.6 + seed + p * 3.4) * p * 5 * scale;
    ctx.fillRect(x + p * len + sway * 0.3, y + sway, (len / segs) + 1, (16 - p * 11) * scale);
  }
  ctx.restore();
}

/** A string of lanterns strung between two posts, sagging under its own weight. */
export function drawLanternLine(ctx, x0, y0, x1, y1, scale, t, count = 7) {
  const sag = 18 * scale;
  ctx.save();
  ctx.strokeStyle = '#2b2016';
  ctx.lineWidth = Math.max(1, scale);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 + sag * 2, x1, y1);
  ctx.stroke();
  for (let i = 1; i < count; i++) {
    const p = i / count;
    // Point on the quadratic, so the lanterns hang from the rope, not near it.
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag * 2;
    const px = (1 - p) * (1 - p) * x0 + 2 * (1 - p) * p * mx + p * p * x1;
    const py = (1 - p) * (1 - p) * y0 + 2 * (1 - p) * p * my + p * p * y1;
    const swing = Math.sin(t * 1.6 + i * 0.9) * 1.6 * scale;
    const c = ['#ffd75e', '#ff8a5e', '#ffe9a8'][i % 3];
    ctx.fillStyle = c;
    ctx.fillRect(px + swing - 2.5 * scale, py, 5 * scale, 6 * scale);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(px + swing - 2.5 * scale, py + 5 * scale, 5 * scale, scale);
    glow(ctx, px + swing, py + 3 * scale, 16 * scale, c, 0.3);
  }
  ctx.restore();
}
