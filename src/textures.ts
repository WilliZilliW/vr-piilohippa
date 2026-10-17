import * as THREE from 'three';

/**
 * Proseduraaliset tekstuurit: kaikki pinnat piirretään koodilla canvasille,
 * joten peli ei tarvitse ladattavia kuvatiedostoja.
 */

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;
type Draw = (ctx: Ctx, s: number, r: () => number, rough: Ctx) => void;

interface Tex {
  map: THREE.CanvasTexture;
  roughness: THREE.CanvasTexture;
}

function makeTex(size: number, seed: number, baseRough: number, draw: Draw): Tex {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const rc = document.createElement('canvas');
  rc.width = rc.height = size;
  const ctx = c.getContext('2d')!;
  const rough = rc.getContext('2d')!;
  const v = Math.round(baseRough * 255);
  rough.fillStyle = `rgb(${v},${v},${v})`;
  rough.fillRect(0, 0, size, size);
  draw(ctx, size, rng(seed), rough);

  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const roughness = new THREE.CanvasTexture(rc);
  for (const t of [map, roughness]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, roughness };
}

function speckle(ctx: Ctx, s: number, r: () => number, n: number, colors: string[], min: number, max: number, alpha = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    const sz = min + r() * (max - min);
    ctx.fillRect(r() * s, r() * s, sz, sz);
  }
  ctx.globalAlpha = 1;
}

function blotches(ctx: Ctx, s: number, r: () => number, n: number, color: string, maxR: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * s;
    const y = r() * s;
    const rad = maxR * (0.3 + r() * 0.7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    // Piirretään myös reunojen yli, jotta tekstuuri toistuu saumattomasti.
    for (const dx of [-s, 0, s]) for (const dy of [-s, 0, s]) {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- Maanpinnat ----------

const grass = () => makeTex(512, 1, 0.95, (ctx, s, r) => {
  ctx.fillStyle = '#4d6b2c';
  ctx.fillRect(0, 0, s, s);
  blotches(ctx, s, r, 20, '#6b8a3a', 120, 0.35);
  blotches(ctx, s, r, 14, '#34501d', 90, 0.35);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 9000; i++) {
    const x = r() * s;
    const y = r() * s;
    const l = 4 + r() * 8;
    const g = 70 + r() * 70;
    ctx.strokeStyle = `rgba(${g * 0.6},${g},${g * 0.35},0.55)`;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.5) * 4, y - l);
    ctx.stroke();
  }
});

const asphalt = () => makeTex(512, 2, 0.9, (ctx, s, r, rough) => {
  ctx.fillStyle = '#3b3c3e';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, r, 26000, ['#2a2b2d', '#4a4b4d', '#55565a', '#333436'], 1, 2.5);
  blotches(ctx, s, r, 10, '#2b2c2e', 140, 0.4);
  blotches(ctx, s, r, 6, '#4b4c4f', 100, 0.25);
  blotches(rough, s, r, 6, '#a0a0a0', 120, 0.5);
});

/** Jalkakäytävän betonilaatat, tekstuuri = 2 x 2 m. */
const pavers = () => makeTex(512, 3, 0.85, (ctx, s, r) => {
  ctx.fillStyle = '#9a9890';
  ctx.fillRect(0, 0, s, s);
  const n = 4;
  const t = s / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 140 + r() * 30;
    ctx.fillStyle = `rgb(${v},${v - 2},${v - 8})`;
    ctx.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
  }
  speckle(ctx, s, r, 9000, ['#7d7b74', '#b3b1a9', '#8a887f'], 1, 2, 0.6);
  blotches(ctx, s, r, 8, '#6f6d66', 80, 0.25);
});

const gravel = () => makeTex(512, 4, 0.95, (ctx, s, r) => {
  ctx.fillStyle = '#a49680';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 7000; i++) {
    const v = 110 + r() * 90;
    ctx.fillStyle = `rgb(${v},${v * 0.92},${v * 0.8})`;
    ctx.beginPath();
    ctx.ellipse(r() * s, r() * s, 1 + r() * 3, 1 + r() * 2.5, r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
});

const roofTex = () => makeTex(512, 5, 0.95, (ctx, s, r) => {
  ctx.fillStyle = '#3a3a3c';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, r, 30000, ['#2c2c2e', '#4a4a4c', '#56524c', '#303032'], 1, 3);
  blotches(ctx, s, r, 8, '#26272a', 120, 0.4);
  ctx.strokeStyle = 'rgba(20,20,20,0.5)';
  ctx.lineWidth = 3;
  for (let y = 0; y < s; y += s / 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(s, y);
    ctx.stroke();
  }
});

// ---------- Luonto ----------

const bark = () => makeTex(256, 6, 0.95, (ctx, s, r) => {
  ctx.fillStyle = '#4a3a2c';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 400; i++) {
    const x = r() * s;
    const v = 40 + r() * 50;
    ctx.strokeStyle = `rgba(${v + 20},${v + 8},${v},0.8)`;
    ctx.lineWidth = 1 + r() * 4;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= s; y += 16) {
      xx += (r() - 0.5) * 5;
      ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
});

const leaves = () => makeTex(256, 7, 0.85, (ctx, s, r) => {
  ctx.fillStyle = '#2f4a1e';
  ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const g = 60 + r() * 90;
    ctx.fillStyle = `rgb(${g * 0.5},${g},${g * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(r() * s, r() * s, 2 + r() * 4, 1 + r() * 2, r() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  blotches(ctx, s, r, 10, '#1b2c12', 50, 0.5);
});

// ---------- Puu ja rakennusmateriaalit ----------

function planks(ctx: Ctx, s: number, r: () => number, vertical: boolean, base: [number, number, number], count: number) {
  const t = s / count;
  for (let i = 0; i < count; i++) {
    const k = 0.85 + r() * 0.3;
    ctx.fillStyle = `rgb(${base[0] * k},${base[1] * k},${base[2] * k})`;
    if (vertical) ctx.fillRect(i * t, 0, t, s);
    else ctx.fillRect(0, i * t, s, t);
    for (let g = 0; g < 26; g++) {
      ctx.strokeStyle = `rgba(30,18,8,${0.05 + r() * 0.12})`;
      ctx.lineWidth = 0.6 + r() * 1.4;
      ctx.beginPath();
      const o = i * t + r() * t;
      if (vertical) {
        ctx.moveTo(o, 0);
        ctx.bezierCurveTo(o + (r() - 0.5) * 6, s / 3, o + (r() - 0.5) * 6, (2 * s) / 3, o, s);
      } else {
        ctx.moveTo(0, o);
        ctx.bezierCurveTo(s / 3, o + (r() - 0.5) * 6, (2 * s) / 3, o + (r() - 0.5) * 6, s, o);
      }
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(20,12,5,0.55)';
    if (vertical) ctx.fillRect(i * t, 0, 2, s);
    else ctx.fillRect(0, i * t, s, 2);
  }
}

const wood = () => makeTex(512, 8, 0.75, (ctx, s, r) => planks(ctx, s, r, false, [150, 105, 65], 6));
const fenceWood = () => makeTex(512, 9, 0.85, (ctx, s, r) => planks(ctx, s, r, true, [120, 95, 70], 8));
const parquet = () => makeTex(512, 10, 0.45, (ctx, s, r) => {
  const w = s / 8;
  const l = s / 2;
  for (let row = 0; row < 8; row++) {
    const off = (row % 2) * (l / 2);
    for (let x = -l; x < s + l; x += l) {
      const k = 0.85 + r() * 0.3;
      ctx.fillStyle = `rgb(${175 * k},${125 * k},${78 * k})`;
      ctx.fillRect(x + off, row * w, l, w);
      for (let g = 0; g < 10; g++) {
        ctx.strokeStyle = `rgba(70,40,15,${0.06 + r() * 0.1})`;
        ctx.beginPath();
        const yy = row * w + r() * w;
        ctx.moveTo(x + off, yy);
        ctx.lineTo(x + off + l, yy + (r() - 0.5) * 3);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(40,20,5,0.5)';
      ctx.fillRect(x + off, row * w, 1.5, w);
    }
    ctx.fillRect(0, row * w, s, 1.5);
  }
});

const plasterTex = (color: string, seed: number) => makeTex(256, seed, 0.9, (ctx, s, r) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, r, 6000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.1)'], 1, 2);
  blotches(ctx, s, r, 8, 'rgba(0,0,0,0.6)', 70, 0.06);
});

const concrete = () => makeTex(256, 11, 0.9, (ctx, s, r) => {
  ctx.fillStyle = '#8f8d88';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, r, 8000, ['#7a7873', '#a3a19b', '#85837d'], 1, 2);
  blotches(ctx, s, r, 6, '#6c6a65', 60, 0.25);
});

// ---------- Julkisivut (yksi tekstuuri = yksi ikkunaväli x yksi kerros) ----------

function windowPane(ctx: Ctx, rough: Ctx, x: number, y: number, w: number, h: number, frame: string, r: () => number, mullions = 1) {
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - 4, y - 4, w + 8, h + 10);
  ctx.fillStyle = frame;
  ctx.fillRect(x - 6, y - 6, w + 12, h + 12);
  const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
  g.addColorStop(0, '#5d7896');
  g.addColorStop(0.5, '#22303f');
  g.addColorStop(1, '#141c25');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Verhot osassa ikkunoista.
  if (r() < 0.4) {
    const c = ['#d9cfb8', '#b8c4cc', '#c9a98a', '#e0e0d8'][Math.floor(r() * 4)];
    ctx.fillStyle = c;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(x, y, w * 0.18, h);
    ctx.fillRect(x + w * 0.82, y, w * 0.18, h);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h);
  ctx.lineTo(x + w * 0.45, y);
  ctx.lineTo(x + w * 0.6, y);
  ctx.lineTo(x + w * 0.25, y + h);
  ctx.fill();
  ctx.fillStyle = frame;
  for (let m = 1; m <= mullions; m++) ctx.fillRect(x + (w * m) / (mullions + 1) - 3, y, 6, h);
  ctx.fillRect(x, y + h * 0.3, w, 5);
  // Ikkunalauta
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x - 10, y + h + 6, w + 20, 8);
  rough.fillStyle = '#141414';
  rough.fillRect(x, y, w, h);
}

const sidingFacade = (color: [number, number, number], seed: number) => makeTex(512, seed, 0.8, (ctx, s, r, rough) => {
  const boards = 22;
  const t = s / boards;
  for (let i = 0; i < boards; i++) {
    const k = 0.94 + r() * 0.08;
    ctx.fillStyle = `rgb(${color[0] * k},${color[1] * k},${color[2] * k})`;
    ctx.fillRect(0, i * t, s, t);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, i * t + t - 2, s, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, i * t, s, 1.5);
  }
  // Nurkkalaudat
  ctx.fillStyle = '#ece9e2';
  ctx.fillRect(0, 0, 8, s);
  ctx.fillRect(s - 8, 0, 8, s);
  windowPane(ctx, rough, s * 0.3, s * 0.18, s * 0.4, s * 0.48, '#f2f0ea', r);
});

const plasterFacade = (color: string, seed: number, balcony: boolean) => makeTex(512, seed, 0.85, (ctx, s, r, rough) => {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, r, 8000, ['rgba(0,0,0,0.07)', 'rgba(255,255,255,0.08)'], 1, 2);
  blotches(ctx, s, r, 4, 'rgba(60,50,40,1)', 140, 0.06);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(0, s - 6, s, 6);
  windowPane(ctx, rough, s * 0.16, s * 0.2, s * 0.3, s * 0.42, '#e8e6e0', r, 0);
  windowPane(ctx, rough, s * 0.56, s * 0.2, s * 0.3, s * 0.42, '#e8e6e0', r, 0);
  if (balcony) {
    const by = s * 0.62;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(s * 0.08, by + 4, s * 0.84, s * 0.3);
    ctx.fillStyle = '#c9c6bf';
    ctx.fillRect(s * 0.08, by, s * 0.84, s * 0.28);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = s * 0.1; x < s * 0.9; x += 18) ctx.fillRect(x, by, 3, s * 0.28);
  }
});

const brickFacade = (seed: number) => makeTex(512, seed, 0.9, (ctx, s, r, rough) => {
  ctx.fillStyle = '#b8b0a2';
  ctx.fillRect(0, 0, s, s);
  const rows = 36;
  const bh = s / rows;
  const bw = s / 8;
  for (let row = 0; row < rows; row++) {
    const off = (row % 2) * (bw / 2);
    for (let x = -bw; x < s + bw; x += bw) {
      const k = 0.8 + r() * 0.35;
      ctx.fillStyle = `rgb(${140 * k},${62 * k},${45 * k})`;
      ctx.fillRect(x + off + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
  }
  speckle(ctx, s, r, 5000, ['rgba(0,0,0,0.15)', 'rgba(255,220,200,0.08)'], 1, 2);
  windowPane(ctx, rough, s * 0.12, s * 0.16, s * 0.76, s * 0.5, '#d8d4cc', r, 2);
  ctx.fillStyle = '#c8c2b6';
  ctx.fillRect(s * 0.08, s * 0.16 + s * 0.5 + 8, s * 0.84, 12);
});

const storefrontFacade = (seed: number) => makeTex(512, seed, 0.8, (ctx, s, r, rough) => {
  ctx.fillStyle = '#4a4e52';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, r, 3000, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.06)'], 1, 2);
  const x = s * 0.06;
  const y = s * 0.12;
  const w = s * 0.88;
  const h = s * 0.8;
  ctx.fillStyle = '#2c2f33';
  ctx.fillRect(x - 10, y - 10, w + 20, h + 10);
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#7f97ad');
  g.addColorStop(0.45, '#2b3946');
  g.addColorStop(1, '#3d4a55');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  // Hyllyjä lasin takana
  for (let i = 0; i < 3; i++) {
    const yy = y + h * (0.35 + i * 0.2);
    ctx.fillStyle = 'rgba(230,220,190,0.25)';
    ctx.fillRect(x + 10, yy, w - 20, 6);
    for (let j = 0; j < 14; j++) {
      ctx.fillStyle = ['rgba(200,60,50,0.35)', 'rgba(240,200,80,0.35)', 'rgba(80,140,200,0.35)', 'rgba(240,240,240,0.3)'][Math.floor(r() * 4)];
      ctx.fillRect(x + 14 + j * ((w - 28) / 14), yy - 20 - r() * 12, (w - 28) / 16, 20);
    }
  }
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y + h);
  ctx.lineTo(x + w * 0.35, y);
  ctx.lineTo(x + w * 0.45, y);
  ctx.lineTo(x + w * 0.2, y + h);
  ctx.fill();
  ctx.fillStyle = '#2c2f33';
  ctx.fillRect(x + w / 2 - 4, y, 8, h);
  rough.fillStyle = '#101010';
  rough.fillRect(x, y, w, h);
});

// ---------- Materiaalit ----------

function std(t: Tex, extra: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.roughness, roughness: 1, metalness: 0, ...extra });
}

export interface Materials {
  grass: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  pavers: THREE.MeshStandardMaterial;
  gravel: THREE.MeshStandardMaterial;
  roof: THREE.MeshStandardMaterial;
  bark: THREE.MeshStandardMaterial;
  leaves: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  fence: THREE.MeshStandardMaterial;
  concrete: THREE.MeshStandardMaterial;
  parquet: THREE.MeshStandardMaterial;
  wallPlaster: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  siding: THREE.MeshStandardMaterial[];
  apartment: THREE.MeshStandardMaterial[];
  brick: THREE.MeshStandardMaterial;
  storefront: THREE.MeshStandardMaterial;
  shopUpper: THREE.MeshStandardMaterial;
  plainWall: THREE.MeshStandardMaterial[];
  /** Väritys tulee verteksiväreistä (aidat, penkit, roskikset...). */
  painted: THREE.MeshStandardMaterial;
  carPaint: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rubber: THREE.MeshStandardMaterial;
  white: THREE.MeshStandardMaterial;
}

let cached: Materials | null = null;

export function materials(): Materials {
  if (cached) return cached;
  const leavesMat = std(leaves(), { side: THREE.DoubleSide });
  cached = {
    grass: std(grass()),
    asphalt: std(asphalt()),
    pavers: std(pavers()),
    gravel: std(gravel()),
    roof: std(roofTex()),
    bark: std(bark()),
    leaves: leavesMat,
    wood: std(wood()),
    fence: std(fenceWood()),
    concrete: std(concrete()),
    parquet: std(parquet()),
    wallPlaster: std(plasterTex('#e6e0d4', 12)),
    ceiling: std(plasterTex('#f2f0ea', 13)),
    siding: [
      std(sidingFacade([142, 43, 32], 20)),   // punamulta
      std(sidingFacade([214, 178, 94], 21)),  // keltainen
      std(sidingFacade([232, 230, 223], 22)), // valkoinen
      std(sidingFacade([150, 172, 186], 23)), // siniharmaa
      std(sidingFacade([128, 145, 112], 24)), // vihreänharmaa
    ],
    apartment: [
      std(plasterFacade('#d9d2c3', 30, true)),
      std(plasterFacade('#c9b49a', 31, true)),
      std(plasterFacade('#b9c2c4', 32, true)),
    ],
    brick: std(brickFacade(40)),
    storefront: std(storefrontFacade(41)),
    shopUpper: std(plasterFacade('#e2dccf', 42, false)),
    plainWall: [std(plasterTex('#d9d2c3', 50)), std(plasterTex('#b7aa98', 51)), std(plasterTex('#9e5444', 52))],
    painted: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }),
    carPaint: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1b2530, roughness: 0.05, metalness: 0.2 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.4, metalness: 0.8 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9, metalness: 0 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf0f0ea, roughness: 0.6 }),
  };
  return cached;
}
