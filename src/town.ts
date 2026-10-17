import * as THREE from 'three';
import { at, Batcher, boxGeo, floorGeo, wallGeo } from './batch';
import { Outdoor } from './environment';
import { World } from './physics';
import type { Player } from './player';
import {
  bench, bush, CAR_COLORS, crate, dumpster, hedge, ladder, parkedCar, sign, spruce, streetLight, tree,
} from './props';
import type { GameScene, Role } from './scene';
import type { Quality } from './settings';
import { materials, rng } from './textures';
import { Traffic } from './traffic';

/**
 * Kaupunki: 3 x 3 korttelia katujen välissä.
 *
 *   omakotitaloja | koulu       | omakotitaloja
 *   kauppoja      | puisto+pesä | kauppoja
 *   omakotitaloja | kerrostalot | omakotitaloja
 */

export const BLOCK_CENTERS = [-48, 0, 48];
export const ROAD_LINES = [-72, -24, 24, 72];
const HALF_INNER = 18; // korttelin sisäosa (ilman jalkakäytävää)
const HALF_BLOCK = 20; // korttelin reuna jalkakäytävineen
const TOWN_EDGE = 76;
const B = 0.15; // korttelin pinnan korkeus (jalkakäytävän reuna)

type Dir = '+x' | '-x' | '+z' | '-z';

interface BuildingOpts {
  x: number;
  z: number;
  w: number; // X-suunnassa
  d: number; // Z-suunnassa
  h: number;
  y?: number;
  wall: THREE.Material;
  bay?: [number, number];
  front?: { dir: Dir; mat: THREE.Material; height: number; bay: [number, number]; upper?: THREE.Material; upperBay?: [number, number] };
  roofDetails?: boolean;
}

export class Town implements GameScene {
  readonly scene = new THREE.Scene();
  readonly world = new World();
  readonly spawn: { x: number; y: number; z: number; yaw: number };

  private readonly outdoor: Outdoor;
  private readonly traffic: Traffic;
  private readonly b = new Batcher();
  private readonly r = rng(2024);

  constructor(renderer: THREE.WebGLRenderer, readonly role: Role) {
    this.outdoor = new Outdoor(this.scene, renderer);
    this.spawn = role === 'seeker' ? { x: 0, y: B, z: 2.2, yaw: 0 } : { x: 0, y: B, z: 3.2, yaw: Math.PI };

    this.buildGround();
    this.buildHouses(-48, -48);
    this.buildHouses(48, -48);
    this.buildHouses(-48, 48);
    this.buildHouses(48, 48);
    this.buildSchool(0, -48);
    this.buildShops(-48, 0, ['KAUPPA', 'LEIPOMO', 'KAHVILA']);
    this.buildShops(48, 0, ['APTEEKKI', 'KUKKAKAUPPA', 'KIOSKI']);
    this.buildPark(0, 0);
    this.buildApartments(0, 48);
    this.buildForest();

    const m = materials();
    this.b.build(this.scene, { noShadow: [m.asphalt, m.grass, m.pavers, m.gravel, m.white] });

    this.traffic = new Traffic(this.scene, this.world, ROAD_LINES, TOWN_EDGE);
  }

  update(dt: number, player: Player): void {
    this.traffic.update(dt, player.pos);
    this.outdoor.follow(player.pos);
  }

  applyQuality(q: Quality): void {
    this.outdoor.applyQuality(q);
  }

  dispose(): void {
    this.outdoor.dispose();
  }

  private rand(min: number, max: number): number {
    return min + this.r() * (max - min);
  }

  private pick<T>(list: T[]): T {
    return list[Math.floor(this.r() * list.length)];
  }

  // ---------- Maa, kadut, jalkakäytävät ----------

  private buildGround(): void {
    const m = materials();
    const b = this.b;
    b.add(floorGeo(400, 400, 3), m.grass, at(0, 0, 0));
    const size = TOWN_EDGE * 2;
    b.add(floorGeo(size, size, 6), m.asphalt, at(0, 0.003, 0));

    // Ulkoreunan jalkakäytävä
    for (const s of [-1, 1]) {
      this.slab(0, s * (TOWN_EDGE + 1), size + 4, 2);
      this.slab(s * (TOWN_EDGE + 1), 0, 2, size);
    }

    // Korttelit
    for (const cx of BLOCK_CENTERS) for (const cz of BLOCK_CENTERS) {
      this.slab(cx, cz, HALF_BLOCK * 2, HALF_BLOCK * 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        streetLight(b, this.world, cx + sx * (HALF_BLOCK - 0.6), cz + sz * (HALF_BLOCK - 0.6), sx > 0 ? 0 : Math.PI);
      }
    }

    // Tiemerkinnät
    const dash = new THREE.PlaneGeometry(0.15, 3).rotateX(-Math.PI / 2);
    const nearCrossing = (v: number) => ROAD_LINES.some((r) => Math.abs(v - r) < 7);
    for (const line of ROAD_LINES) {
      for (let t = -TOWN_EDGE + 1.5; t < TOWN_EDGE; t += 6) {
        if (nearCrossing(t)) continue;
        b.add(dash, m.white, at(line, 0.01, t));
        b.add(dash, m.white, at(t, 0.01, line, Math.PI / 2));
      }
    }
    // Suojatiet risteysten ympärillä
    const stripe = new THREE.PlaneGeometry(0.5, 3).rotateX(-Math.PI / 2);
    for (const rx of ROAD_LINES) for (const rz of ROAD_LINES) {
      for (let i = -3; i <= 3; i++) {
        const o = i * 1.1;
        for (const s of [-1, 1]) {
          b.add(stripe, m.white, at(rx + o, 0.011, rz + s * 5.5, Math.PI / 2));
          b.add(stripe, m.white, at(rx + s * 5.5, 0.011, rz + o));
        }
      }
    }

    // Näkymättömät reunat kaupungin ja metsän ympärillä
    const E = 97;
    this.world.addSolid(-E - 2, 0, -E - 2, E + 2, 20, -E);
    this.world.addSolid(-E - 2, 0, E, E + 2, 20, E + 2);
    this.world.addSolid(-E - 2, 0, -E, -E, 20, E);
    this.world.addSolid(E, 0, -E, E + 2, 20, E);
  }

  private slab(x: number, z: number, w: number, d: number): void {
    const m = materials();
    this.b.add(boxGeo(w, B, d, 2), m.pavers, at(x, B / 2, z));
    this.world.addBox(x, 0, z, w, B, d);
  }

  private surface(cx: number, cz: number, w: number, d: number, mat: THREE.Material, y = B + 0.002): void {
    this.b.add(floorGeo(w, d, mat === materials().asphalt ? 6 : 3), mat, at(cx, y, cz));
  }

  // ---------- Rakennus ----------

  private building(o: BuildingOpts): void {
    const m = materials();
    const b = this.b;
    const y = o.y ?? B;
    const [bw, bh] = o.bay ?? [3, 3];
    const sides: { dir: Dir; len: number; ry: number; nx: number; nz: number }[] = [
      { dir: '+z', len: o.w, ry: 0, nx: 0, nz: 1 },
      { dir: '-z', len: o.w, ry: Math.PI, nx: 0, nz: -1 },
      { dir: '+x', len: o.d, ry: Math.PI / 2, nx: 1, nz: 0 },
      { dir: '-x', len: o.d, ry: -Math.PI / 2, nx: -1, nz: 0 },
    ];
    for (const s of sides) {
      const fx = o.x + s.nx * (o.w / 2);
      const fz = o.z + s.nz * (o.d / 2);
      if (o.front && o.front.dir === s.dir) {
        const f = o.front;
        b.add(wallGeo(s.len, f.height, f.bay[0], f.bay[1]), f.mat, at(fx, y + f.height / 2, fz, s.ry));
        const upH = o.h - f.height;
        if (upH > 0.01) {
          const ub = f.upperBay ?? [bw, bh];
          b.add(wallGeo(s.len, upH, ub[0], ub[1]), f.upper ?? o.wall, at(fx, y + f.height + upH / 2, fz, s.ry));
        }
      } else {
        b.add(wallGeo(s.len, o.h, bw, bh), o.wall, at(fx, y + o.h / 2, fz, s.ry));
      }
    }
    // Sokkeli, katto ja räystäs
    b.add(boxGeo(o.w + 0.08, 0.35, o.d + 0.08, 1), m.concrete, at(o.x, y + 0.175, o.z));
    b.add(floorGeo(o.w, o.d, 4), m.roof, at(o.x, y + o.h, o.z));
    const t = 0.25;
    const ph = 0.4;
    const top = y + o.h;
    b.add(boxGeo(o.w + t, ph, t, 1), m.concrete, at(o.x, top + ph / 2, o.z + o.d / 2));
    b.add(boxGeo(o.w + t, ph, t, 1), m.concrete, at(o.x, top + ph / 2, o.z - o.d / 2));
    b.add(boxGeo(t, ph, o.d, 1), m.concrete, at(o.x + o.w / 2, top + ph / 2, o.z));
    b.add(boxGeo(t, ph, o.d, 1), m.concrete, at(o.x - o.w / 2, top + ph / 2, o.z));
    this.world.addBox(o.x, y, o.z, o.w, o.h, o.d);

    if (o.roofDetails !== false && o.w * o.d > 60) {
      const n = 1 + Math.floor(this.r() * 3);
      for (let i = 0; i < n; i++) {
        const ax = o.x + this.rand(-o.w / 2 + 2, o.w / 2 - 2);
        const az = o.z + this.rand(-o.d / 2 + 2, o.d / 2 - 2);
        // Ilmastointikone – hyvä piilo katolla
        b.add(boxGeo(1.4, 1.1, 1.2, 1), m.painted, at(ax, top + 0.55, az), 0x9a9c9e);
        b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 16), m.painted, at(ax, top + 1.12, az), 0x2a2a2a);
        this.world.addBox(ax, top, az, 1.4, 1.1, 1.2);
      }
      const vx = o.x + this.rand(-o.w / 2 + 1, o.w / 2 - 1);
      const vz = o.z + this.rand(-o.d / 2 + 1, o.d / 2 - 1);
      b.add(new THREE.CylinderGeometry(0.15, 0.15, 0.9, 10), m.metal, at(vx, top + 0.45, vz));
    }
  }

  // ---------- Omakotitalot ----------

  private buildHouses(cx: number, cz: number): void {
    const m = materials();
    const b = this.b;
    this.surface(cx, cz, HALF_INNER * 2, HALF_INNER * 2, m.grass);

    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = cx + sx * 9;
      const lz = cz + sz * 9;
      const w = this.pick([9, 12]);
      const floors = this.r() < 0.5 ? 1 : 2;
      const h = floors * 3;
      const hx = lx + sx * 1.5;
      const hz = lz + sz * 1.5;
      this.building({ x: hx, z: hz, w, d: 9, h, wall: this.pick(m.siding), roofDetails: false });
      // Savupiippu
      b.add(boxGeo(0.6, 1.2, 0.6, 1), m.brick, at(hx - sx * 1.5, B + h + 0.6, hz));
      this.world.addBox(hx - sx * 1.5, B + h, hz, 0.6, 1.2, 0.6);
      // Tikkaat talon sisäpihan puolelle
      ladder(b, this.world, hx - sx * (w / 2), B, hz, -sx, 0, B + h);

      // Varasto ja sen vieressä halkopino (sen avulla pääsee varaston katolle)
      const shx = lx - sx * 5.5;
      const shz = lz - sz * 6;
      this.building({ x: shx, z: shz, w: 3, d: 4.5, h: 2.7, wall: m.fence, bay: [2, 2.7], roofDetails: false });
      const wpX = shx - sx * 2.1;
      b.add(boxGeo(0.8, 1.0, 1.6, 0.5), m.wood, at(wpX, B + 0.5, shz));
      this.world.addBox(wpX, B, shz, 0.8, 1.0, 1.6);

      // Auto pihatiellä
      if (this.r() < 0.75) parkedCar(b, this.world, lx - sx * 6.5, B, lz + sz * 5.5, false, this.pick(CAR_COLORS), sz < 0);

      // Pensasaidat kadun puolella, aukot pihatielle ja portille
      const ez = lz + sz * 8.4;
      const gap = lx - sx * 6.5;
      this.hedgeRow(lx - 9, lx + 9, ez, true, gap, 1.9);
      const ex = lx + sx * 8.4;
      this.hedgeRow(lz - 9, lz + 9, ex, false, lz, 1.1);

      // Puut ja pensaat
      tree(b, this.world, lx - sx * 1.5, lz - sz * 6.5, Math.floor(this.r() * 100), this.rand(0.9, 1.3));
      if (this.r() < 0.6) spruce(b, this.world, lx + sx * 6.5, lz - sz * 6.5, this.rand(0.8, 1.1));
      for (let i = 0; i < 3; i++) {
        bush(b, hx + this.rand(-w / 2, w / 2), B, hz - sz * 5.3, Math.floor(this.r() * 100), this.rand(0.7, 1.1));
      }
      if (this.r() < 0.5) crate(b, this.world, lx - sx * 2, B, lz - sz * 8, 0.9);
    }

    // Lauta-aidat tonttien välissä
    for (const [a0, a1] of [[-HALF_INNER + 0.3, -1.6], [1.6, HALF_INNER - 0.3]]) {
      const len = a1 - a0;
      const mid = (a0 + a1) / 2;
      b.add(boxGeo(0.08, 1.2, len, 2), m.fence, at(cx, B + 0.6, cz + mid));
      this.world.addBox(cx, B, cz + mid, 0.1, 1.2, len);
      b.add(boxGeo(len, 1.2, 0.08, 2), m.fence, at(cx + mid, B + 0.6, cz));
      this.world.addBox(cx + mid, B, cz, len, 1.2, 0.1);
    }
  }

  private hedgeRow(from: number, to: number, at2: number, alongX: boolean, gapCenter: number, gapHalf: number): void {
    const segs: [number, number][] = [[from, gapCenter - gapHalf], [gapCenter + gapHalf, to]];
    for (const [a, c] of segs) {
      if (c - a < 0.5) continue;
      const mid = (a + c) / 2;
      if (alongX) hedge(this.b, this.world, mid, at2, c - a, 0.8, 1.3, B);
      else hedge(this.b, this.world, at2, mid, 0.8, c - a, 1.3, B);
    }
  }

  // ---------- Koulu ----------

  private buildSchool(cx: number, cz: number): void {
    const m = materials();
    const b = this.b;
    this.surface(cx, cz, HALF_INNER * 2, HALF_INNER * 2, m.asphalt);

    this.building({ x: cx, z: cz - 9, w: 30, d: 12, h: 9, wall: m.brick });
    this.building({ x: cx + 11, z: cz + 4.5, w: 12, d: 15, h: 6, wall: m.brick });
    // Konehuone siiven katolla: siitä pääsee päärakennuksen katolle
    b.add(boxGeo(3, 1.6, 3, 1), m.concrete, at(cx + 8, B + 6 + 0.8, cz - 1.5));
    this.world.addBox(cx + 8, B + 6, cz - 1.5, 3, 1.6, 3);

    const s = sign('KOULU', 4.5, 1.1, '#1d3f73', '#ffffff');
    s.position.set(cx - 6, B + 7.6, cz - 3 + 0.05);
    this.scene.add(s);
    // Sisäänkäynti
    b.add(boxGeo(2.4, 2.4, 0.1, 1), m.glass, at(cx - 6, B + 1.2, cz - 2.98));
    b.add(boxGeo(4, 0.2, 2.2, 1), m.concrete, at(cx - 6, B + 3, cz - 1.9));
    for (const px of [-1.8, 1.8]) {
      b.add(new THREE.CylinderGeometry(0.08, 0.08, 3, 8), m.metal, at(cx - 6 + px, B + 1.5, cz - 1));
      this.world.addBox(cx - 6 + px, B, cz - 1, 0.16, 3, 0.16);
    }
    this.world.addBox(cx - 6, B + 2.9, cz - 1.9, 4, 0.2, 2.2);

    ladder(b, this.world, cx - 15, B, cz - 9, -1, 0, B + 9);
    ladder(b, this.world, cx + 17, B, cz + 7, 1, 0, B + 6);

    // Koripallokori
    b.add(new THREE.CylinderGeometry(0.08, 0.08, 3.05, 8), m.metal, at(cx - 10, B + 1.5, cz + 15));
    b.add(boxGeo(1.8, 1.05, 0.05, 1), m.white, at(cx - 10, B + 3.4, cz + 14.9));
    b.add(new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2), m.painted, at(cx - 10, B + 3.05, cz + 14.6), 0xd2541f);
    this.world.addBox(cx - 10, B, cz + 15, 0.2, 3, 0.2);

    // Jalkapallomaalit
    for (const gx of [-16, 2]) {
      for (const gz of [-1.5, 1.5]) {
        b.add(new THREE.CylinderGeometry(0.05, 0.05, 2, 8), m.white, at(cx + gx, B + 1, cz + 5 + gz));
        this.world.addBox(cx + gx, B, cz + 5 + gz, 0.1, 2, 0.1);
      }
      b.add(new THREE.CylinderGeometry(0.05, 0.05, 3, 8).rotateX(Math.PI / 2), m.white, at(cx + gx, B + 2, cz + 5));
    }

    // Kiipeilyteline
    this.climbingFrame(cx - 9, cz + 9);
    for (let i = 0; i < 3; i++) bench(b, this.world, cx - 14 + i * 4, B, cz - 1.5, 0);
    for (const tx of [-16, -4, 3]) tree(b, this.world, cx + tx, cz + 16.5, Math.floor(this.r() * 100), 1.1);
    for (let i = 0; i < 5; i++) bush(b, cx + this.rand(-16, 4), B, cz - 2.4, Math.floor(this.r() * 100), 0.7);
  }

  private climbingFrame(x: number, z: number): void {
    const m = materials();
    const b = this.b;
    for (const ox of [-1.5, 1.5]) for (const oz of [-1, 1]) {
      b.add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), m.painted, at(x + ox, B + 1.1, z + oz), 0xc0392b);
      this.world.addBox(x + ox, B, z + oz, 0.1, 2.2, 0.1);
    }
    b.add(boxGeo(3, 0.08, 2, 1), m.wood, at(x, B + 1.9, z));
    this.world.addBox(x, B + 1.86, z, 3, 0.08, 2);
    for (let i = 0; i < 4; i++) {
      b.add(new THREE.CylinderGeometry(0.03, 0.03, 2, 6).rotateX(Math.PI / 2), m.painted, at(x - 1.5, B + 0.4 + i * 0.4, z), 0xe0b02a);
    }
  }

  // ---------- Kaupat ----------

  private buildShops(cx: number, cz: number, names: string[]): void {
    const m = materials();
    const b = this.b;
    const f = cx < 0 ? 1 : -1; // julkisivu puistoon päin
    this.surface(cx, cz, HALF_INNER * 2, HALF_INNER * 2, m.asphalt);
    const colors = [['#c62828', '#ffffff'], ['#f2c14e', '#3b2a14'], ['#2e5e3e', '#ffffff'], ['#1f6e43', '#ffffff'], ['#8e3a8a', '#ffffff'], ['#1d4f91', '#ffd84a']];

    names.forEach((name, i) => {
      const z = cz - 12 + i * 12;
      const x = cx + f * 9.5;
      const floors = this.r() < 0.5 ? 1 : 2;
      const h = floors === 1 ? 4.8 : 7.8;
      this.building({
        x, z, w: 15, d: 12, h,
        wall: this.pick(m.plainWall),
        front: {
          dir: f > 0 ? '+x' : '-x', mat: m.storefront, height: 4, bay: [4, 4],
          upper: floors === 2 ? m.shopUpper : undefined, upperBay: floors === 2 ? [3, 3.8] : undefined,
        },
      });
      const [bg, fg] = colors[(i + (cx > 0 ? 3 : 0)) % colors.length];
      const s = sign(name, 6, 0.8, bg, fg);
      s.position.set(x + f * 7.55, B + 4.4, z);
      s.rotation.y = f * Math.PI / 2;
      this.scene.add(s);
      // Markiisi
      b.add(boxGeo(1.2, 0.08, 10, 1), m.painted, at(x + f * 8.1, B + 3.6, z), new THREE.Color(bg).multiplyScalar(0.8));
      this.world.addBox(x + f * 8.1, B + 3.56, z, 1.2, 0.08, 10);

      // Takapihalla tikkaat ja roskakatos
      ladder(b, this.world, x - f * 7.5, B, z + 3, -f, 0, B + h);
      dumpster(b, this.world, x - f * 8.4, B, z - 3, false, i % 2 ? 0x2e5d3a : 0x3b4f6b);
    });

    // Parkkipaikka
    const lineGeo = new THREE.PlaneGeometry(0.12, 4.6).rotateX(-Math.PI / 2);
    for (const rowX of [cx - f * 5, cx - f * 14]) {
      for (let i = 0; i < 12; i++) {
        const z = cz - 15.4 + i * 2.8;
        b.add(lineGeo, m.white, at(rowX, B + 0.006, z - 1.4, Math.PI / 2));
        if (this.r() < 0.6) parkedCar(b, this.world, rowX, B, z, true, this.pick(CAR_COLORS), this.r() < 0.5);
      }
    }
    for (let i = 0; i < 4; i++) bush(b, cx - f * 9.5, B, cz - 15 + i * 10, Math.floor(this.r() * 100), 0.8);
  }

  // ---------- Puisto ja pesä ----------

  private buildPark(cx: number, cz: number): void {
    const m = materials();
    const b = this.b;
    this.surface(cx, cz, HALF_INNER * 2, HALF_INNER * 2, m.grass);
    this.surface(cx, cz, HALF_INNER * 2, 3, m.gravel, B + 0.004);
    this.surface(cx, cz, 3, HALF_INNER * 2, m.gravel, B + 0.005);
    const circle = new THREE.CircleGeometry(4, 32).rotateX(-Math.PI / 2);
    b.add(circle, m.gravel, at(cx, B + 0.006, cz));

    // Pesäpuu
    tree(b, this.world, cx, cz, 7, 1.8);
    const s = sign('PESÄ', 1.2, 0.5, '#f5e6c8', '#6b2a12');
    s.position.set(cx, B + 1.8, cz + 0.46);
    this.scene.add(s);

    for (const [x, z, ry] of [[-6, 2.2, Math.PI], [6, -2.2, 0], [2.2, 7, -Math.PI / 2], [-2.2, -7, Math.PI / 2]] as const) {
      bench(b, this.world, cx + x, B, cz + z, ry);
    }

    // Suihkulähde
    const fx = cx - 10;
    const fz = cz - 10;
    b.add(new THREE.CylinderGeometry(2, 2.1, 0.55, 28), m.concrete, at(fx, B + 0.275, fz));
    b.add(new THREE.CylinderGeometry(1.8, 1.8, 0.02, 28), new THREE.MeshStandardMaterial({ color: 0x3e6f8a, roughness: 0.05, metalness: 0.3 }), at(fx, B + 0.5, fz));
    b.add(new THREE.CylinderGeometry(0.25, 0.3, 1.4, 12), m.concrete, at(fx, B + 0.7, fz));
    this.world.addBox(fx, B, fz, 4, 0.55, 4);

    // Leikkimökki
    this.building({ x: cx + 10, z: cz + 10, w: 2.5, d: 2.5, h: 2.1, wall: m.siding[0], bay: [2.5, 2.1], roofDetails: false });

    for (const [x, z] of [[-12, 6], [12, -6], [-14, -14], [14, 14], [-6, 13], [7, -13], [-15, 2], [15, -2]]) {
      if (this.r() < 0.5) spruce(b, this.world, cx + x, cz + z, this.rand(0.9, 1.2));
      else tree(b, this.world, cx + x, cz + z, Math.floor(this.r() * 100), this.rand(1, 1.4));
    }
    for (let i = 0; i < 18; i++) {
      const qx = this.r() < 0.5 ? -1 : 1;
      const qz = this.r() < 0.5 ? -1 : 1;
      bush(b, cx + qx * this.rand(3.5, 16), B, cz + qz * this.rand(3.5, 16), i * 7, this.rand(0.8, 1.3));
    }
  }

  // ---------- Kerrostalot ----------

  private buildApartments(cx: number, cz: number): void {
    const m = materials();
    const b = this.b;
    this.surface(cx, cz, HALF_INNER * 2, HALF_INNER * 2, m.grass);
    this.building({ x: cx, z: cz - 10, w: 27, d: 12, h: 12, wall: m.apartment[0] });
    this.building({ x: cx, z: cz + 10, w: 27, d: 12, h: 12, wall: m.apartment[1] });
    ladder(b, this.world, cx - 13.5, B, cz - 10, -1, 0, B + 12);
    ladder(b, this.world, cx + 13.5, B, cz + 10, 1, 0, B + 12);

    // Sisäpiha: leikkipaikka ja pyöräkatos
    this.surface(cx, cz, 27, 8, m.gravel, B + 0.004);
    this.climbingFrame(cx - 6, cz);
    b.add(boxGeo(3, 0.3, 3, 1), m.wood, at(cx - 1, B + 0.15, cz));
    this.world.addBox(cx - 1, B, cz, 3, 0.3, 3);
    for (const px of [-2.4, 2.4]) for (const pz of [-0.9, 0.9]) {
      b.add(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 8), m.metal, at(cx + 8 + px, B + 1.1, cz + pz));
      this.world.addBox(cx + 8 + px, B, cz + pz, 0.1, 2.2, 0.1);
    }
    b.add(boxGeo(5.2, 0.12, 2.4, 1), m.metal, at(cx + 8, B + 2.26, cz));
    this.world.addBox(cx + 8, B + 2.2, cz, 5.2, 0.12, 2.4);
    bench(b, this.world, cx + 2.5, B, cz + 2.8, Math.PI);

    for (const side of [-1, 1]) {
      for (let i = 0; i < 6; i++) {
        if (this.r() < 0.7) parkedCar(b, this.world, cx + side * 15.8, B, cz - 13.5 + i * 5.4, false, this.pick(CAR_COLORS), this.r() < 0.5);
      }
    }
    for (const [x, z] of [[-11, 2.5], [11, -2.5]]) tree(b, this.world, cx + x, cz + z, Math.floor(this.r() * 100), 1);
    for (let i = 0; i < 6; i++) bush(b, cx + this.rand(-12, 12), B, cz + (i % 2 ? 3.4 : -3.4), i * 13, 0.7);
  }

  // ---------- Metsä kaupungin ympärillä ----------

  private buildForest(): void {
    const b = this.b;
    for (let i = 0; i < 170; i++) {
      const side = Math.floor(this.r() * 4);
      const along = this.rand(-96, 96);
      const depth = this.rand(81, 96);
      const [x, z] = side === 0 ? [along, -depth] : side === 1 ? [along, depth] : side === 2 ? [-depth, along] : [depth, along];
      if (this.r() < 0.7) spruce(b, this.world, x, z, this.rand(1, 1.7));
      else tree(b, this.world, x, z, i, this.rand(1.1, 1.6));
    }
  }
}
