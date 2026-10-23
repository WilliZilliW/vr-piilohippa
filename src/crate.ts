import * as THREE from 'three';
import type { Actor } from './ai';
import { sfx } from './audio';
import type { Spot } from './vision';

/** Aarrelaatikosta saatavat apuvälineet piiloutujille. */
export type PowerKind = 'ghost' | 'speed' | 'decoy' | 'radar';

export const POWERS: Record<PowerKind, { name: string; info: string; seconds: number }> = {
  ghost: { name: 'NÄKYMÄTTÖMYYS', info: 'Etsijä ei näe eikä kuule sinua', seconds: 12 },
  speed: { name: 'PIKAJUOKSU', info: 'Juokset paljon tavallista nopeammin', seconds: 15 },
  decoy: { name: 'HÄMÄYSÄÄNI', info: 'Etsijä lähtee tutkimaan ääntä kaukana sinusta', seconds: 0 },
  radar: { name: 'ETSIJÄTUTKA', info: 'Näet, missä etsijä on', seconds: 10 },
};

/** Uusi laatikko ilmestyy näin monta sekuntia edellisen avaamisen jälkeen. */
const RESPAWN_TIME = 25;
const PICKUP_RANGE = 1.2;
const CHIME_EVERY = 4;

/**
 * Aarrelaatikko: ilmestyy satunnaiseen paikkaan kaupungissa. Piiloutuja,
 * joka kävelee laatikon luo, saa siitä satunnaisen apuvälineen.
 * Kerrallaan maailmassa on yksi laatikko.
 */
export class LootCrates {
  /** Laatikon paikka, tai null, jos laatikkoa ei juuri nyt ole. */
  pos: THREE.Vector3 | null = null;

  private readonly group = new THREE.Group();
  private readonly box: THREE.Group;
  private readonly materials: THREE.Material[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private respawnT = 0;
  private chimeT = 0;
  private time = 0;
  private active = false;

  constructor(scene: THREE.Scene, private readonly spots: Spot[], private readonly base: THREE.Vector3) {
    this.box = this.buildBox();
    this.group.add(this.box);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Etsintä alkaa: ensimmäinen laatikko maailmaan. */
  start(avoid: THREE.Vector3[]): void {
    this.active = true;
    this.spawn(avoid);
  }

  update(dt: number, avoid: THREE.Vector3[]): void {
    if (!this.active) return;
    this.time += dt;
    if (this.pos) {
      this.box.position.y = 0.45 + Math.sin(this.time * 2.2) * 0.08;
      this.box.rotation.y += dt * 1.2;
      this.chimeT -= dt;
      if (this.chimeT <= 0) {
        this.chimeT = CHIME_EVERY;
        sfx.crateChime(this.pos);
      }
    } else {
      this.respawnT -= dt;
      if (this.respawnT <= 0) this.spawn(avoid);
    }
  }

  /** Avaako joku piiloutujista laatikon? Palauttaa avaajan. */
  tryPickup(hiders: Actor[]): Actor | null {
    const p = this.pos;
    if (!p) return null;
    for (const h of hiders) {
      if (h.caught) continue;
      if (Math.hypot(h.pos.x - p.x, h.pos.z - p.z) < PICKUP_RANGE && Math.abs(h.pos.y - p.y) < 1.5) {
        this.pos = null;
        this.group.visible = false;
        this.respawnT = RESPAWN_TIME;
        return h;
      }
    }
    return null;
  }

  stop(): void {
    this.active = false;
    this.pos = null;
    this.group.visible = false;
  }

  dispose(): void {
    this.group.removeFromParent();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }

  /** Paikka seinän tai aidan vierestä maan tasolla, kaukana pesästä ja hahmoista. */
  private spawn(avoid: THREE.Vector3[]): void {
    const far = (s: Spot) => avoid.every((a) => Math.hypot(a.x - s.pos.x, a.z - s.pos.z) > 12);
    const ok = this.spots.filter((s) => s.kind === 'wall' && s.pos.y < 1 && s.pos.distanceTo(this.base) > 15 && far(s));
    const list = ok.length ? ok : this.spots.filter((s) => s.kind === 'wall');
    if (!list.length) return;
    const s = list[Math.floor(Math.random() * list.length)];
    this.pos = s.pos.clone();
    this.group.position.copy(this.pos);
    this.group.visible = true;
    this.chimeT = CHIME_EVERY;
    sfx.crateSpawn(this.pos);
  }

  private buildBox(): THREE.Group {
    const g = new THREE.Group();
    const geo = <T extends THREE.BufferGeometry>(x: T) => (this.geometries.push(x), x);
    const mat = <T extends THREE.Material>(x: T) => (this.materials.push(x), x);

    const wood = mat(new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: 0.8 }));
    const gold = mat(new THREE.MeshStandardMaterial({ color: 0xffc935, emissive: 0xffa200, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.35 }));
    g.add(new THREE.Mesh(geo(new THREE.BoxGeometry(0.6, 0.5, 0.6)), wood));
    // Kultaiset kulmavahvikkeet ja kansi
    const band = geo(new THREE.BoxGeometry(0.64, 0.07, 0.64));
    for (const y of [-0.2, 0.2]) {
      const m = new THREE.Mesh(band, gold);
      m.position.y = y;
      g.add(m);
    }
    const post = geo(new THREE.BoxGeometry(0.07, 0.5, 0.07));
    for (const x of [-0.29, 0.29]) for (const z of [-0.29, 0.29]) {
      const m = new THREE.Mesh(post, gold);
      m.position.set(x, 0, z);
      g.add(m);
    }
    // Kysymysmerkki joka kyljessä
    const q = mat(new THREE.MeshBasicMaterial({ map: questionTexture(), transparent: true }));
    const plane = geo(new THREE.PlaneGeometry(0.38, 0.38));
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(plane, q);
      const a = (i * Math.PI) / 2;
      m.position.set(Math.sin(a) * 0.305, 0, Math.cos(a) * 0.305);
      m.rotation.y = a;
      g.add(m);
    }
    // Valokeila, jonka näkee kauempaa
    const beamMat = mat(new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    const beam = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.12, 0.3, 9, 12, 1, true)), beamMat);
    beam.position.y = 4.5;
    this.group.add(beam);
    return g;
  }
}

function questionTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffd84a';
  ctx.font = '700 110px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
