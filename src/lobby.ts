import * as THREE from 'three';
import { at, Batcher, boxGeo, floorGeo, wallGeo } from './batch';
import { indoorEnvironment } from './environment';
import type { Input } from './input';
import { World } from './physics';
import type { Player } from './player';
import { bench, crate, plantPot } from './props';
import type { GameScene, Role } from './scene';
import type { Quality } from './settings';
import { padLine, TextPanel } from './text';
import { materials } from './textures';

const ROOM = { minX: -7, maxX: 7, minZ: -9, maxZ: 5, height: 4.5 };
const GATE_Z = -5.5;

interface Gate {
  role: Role;
  x: number;
  portal: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  sign: THREE.Mesh;
  ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

/** Aula: pelin alussa oleva huone, jossa valitaan rooli kävelemällä portista tai katsomalla porttia ja painamalla A. */
export class Lobby implements GameScene {
  readonly scene = new THREE.Scene();
  readonly world = new World();
  readonly spawn = { x: 0, y: 0, z: 2, yaw: 0 };

  private readonly gates: Gate[] = [];
  private readonly info: TextPanel;
  private readonly raycaster = new THREE.Raycaster();
  private readonly env: THREE.WebGLRenderTarget;
  private prevZ = this.spawn.z;
  private time = 0;
  private chosen = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    private readonly camera: THREE.Camera,
    private readonly input: Input,
    private readonly onChoose: (role: Role) => void,
  ) {
    this.env = indoorEnvironment(this.scene, renderer);
    this.scene.background = new THREE.Color(0x101010);
    this.buildRoom();
    this.buildGate('seeker', -3, 'ETSIJÄ', 'Etsi piiloutujat ja ota kiinni', 0xb5432f, '#ff8a5c');
    this.buildGate('hider', 3, 'PIILOUTUJA', 'Piiloudu ja vältä etsijää', 0x2f7a46, '#7dffa8');

    const title = new TextPanel({ width: 3.4, height: 1.0, background: 'rgba(20,24,32,0.9)' }, [
      { text: 'PIILOHIPPA', size: 150, bold: true, color: '#ffd84a' },
    ]);
    title.mesh.position.set(0, 3.05, ROOM.minZ + 0.02);
    this.scene.add(title.mesh);

    this.info = new TextPanel({ width: 4.2, height: 1.95, background: 'rgba(20,24,32,0.85)' });
    this.info.mesh.position.set(0, 1.45, ROOM.minZ + 0.02);
    this.scene.add(this.info.mesh);
  }

  private buildRoom(): void {
    const m = materials();
    const b = new Batcher();
    const w = ROOM.maxX - ROOM.minX;
    const d = ROOM.maxZ - ROOM.minZ;
    const cx = (ROOM.minX + ROOM.maxX) / 2;
    const cz = (ROOM.minZ + ROOM.maxZ) / 2;
    const H = ROOM.height;

    b.add(floorGeo(w, d, 4), m.parquet, at(cx, 0, cz));
    const ceil = floorGeo(w, d, 3);
    ceil.rotateX(Math.PI);
    b.add(ceil, m.ceiling, at(cx, H, cz));

    // Seinät (sisäpinnat) + jalkalistat + törmäykset
    const walls: [number, number, number, number][] = [
      [cx, ROOM.minZ, 0, w],
      [cx, ROOM.maxZ, Math.PI, w],
      [ROOM.minX, cz, Math.PI / 2, d],
      [ROOM.maxX, cz, -Math.PI / 2, d],
    ];
    for (const [x, z, ry, len] of walls) {
      b.add(wallGeo(len, H, 3, 3), m.wallPlaster, at(x, H / 2, z, ry));
      const n = new THREE.Vector3(0, 0, 0.02).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
      b.add(boxGeo(len, 0.15, 0.03, 1), m.wood, at(x + n.x, 0.075, z + n.z, ry));
    }
    this.world.addSolid(ROOM.minX - 1, 0, ROOM.minZ - 1, ROOM.maxX + 1, H, ROOM.minZ);
    this.world.addSolid(ROOM.minX - 1, 0, ROOM.maxZ, ROOM.maxX + 1, H, ROOM.maxZ + 1);
    this.world.addSolid(ROOM.minX - 1, 0, ROOM.minZ, ROOM.minX, H, ROOM.maxZ);
    this.world.addSolid(ROOM.maxX, 0, ROOM.minZ, ROOM.maxX + 1, H, ROOM.maxZ);

    // Matto
    b.add(new THREE.BoxGeometry(5, 0.012, 3.4), m.painted, at(0, 0.006, 0.8), 0x6e2a2a);
    b.add(new THREE.BoxGeometry(4.6, 0.014, 3.0), m.painted, at(0, 0.007, 0.8), 0x8a3b32);

    // Kalusteet
    plantPot(b, this.world, -6.3, 0, 4.3, 1);
    plantPot(b, this.world, 6.3, 0, 4.3, 2);
    plantPot(b, this.world, -6.3, 0, -8.3, 3);
    plantPot(b, this.world, 6.3, 0, -8.3, 4);
    bench(b, this.world, -6.5, 0, -1, Math.PI / 2);
    bench(b, this.world, 6.5, 0, -1, -Math.PI / 2);
    crate(b, this.world, 6.2, 0, 2.2, 0.9);
    crate(b, this.world, 6.2, 0.9, 2.2, 0.7);
    crate(b, this.world, 5.4, 0, 2.4, 0.7);

    // Ikkunat sivuseinillä (päivänvalo ulkoa)
    const outside = windowTexture();
    for (const side of [-1, 1]) {
      for (const z of [-3.5, 1.5]) {
        const x = side * (ROOM.maxX - 0.01);
        const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.7), new THREE.MeshBasicMaterial({ map: outside }));
        win.position.set(x, 2.2, z);
        win.rotation.y = -side * Math.PI / 2;
        this.scene.add(win);
        const ry = -side * Math.PI / 2;
        for (const [ox, oy, ww, hh] of [[0, 0.88, 2.36, 0.08], [0, -0.88, 2.36, 0.1], [-1.14, 0, 0.08, 1.8], [1.14, 0, 0.08, 1.8], [0, 0, 0.06, 1.7]] as const) {
          const off = new THREE.Vector3(ox, 0, 0).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ry);
          b.add(new THREE.BoxGeometry(ww, hh, 0.08), m.white, at(x + off.x, 2.2 + oy, z + off.z, ry));
        }
      }
    }

    // Kattovalaisimet
    for (const [x, z] of [[-3, -3], [3, -3], [0, 2]]) {
      const lamp = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.45, 0.06, 24),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3dd, emissiveIntensity: 2.5 }),
      );
      lamp.position.set(x, H - 0.03, z);
      this.scene.add(lamp);
      const light = new THREE.PointLight(0xffeedd, 9, 0, 2);
      light.position.set(x, H - 0.3, z);
      this.scene.add(light);
    }
    this.scene.add(new THREE.HemisphereLight(0xfff8f0, 0x6b5a48, 0.35));

    b.build(this.scene, { castShadow: false, receiveShadow: false });
  }

  private buildGate(role: Role, x: number, title: string, subtitle: string, color: number, glow: string): void {
    const m = materials();
    const b = new Batcher();
    const z = GATE_Z;
    for (const px of [x - 1.1, x + 1.1]) {
      b.add(boxGeo(0.3, 3.1, 0.3, 1), m.painted, at(px, 1.55, z), color);
      b.add(boxGeo(0.4, 0.2, 0.4, 1), m.painted, at(px, 0.1, z), 0x2a2a2a);
      this.world.addBox(px, 0, z, 0.3, 3.1, 0.3);
    }
    b.add(boxGeo(2.6, 0.3, 0.36, 1), m.painted, at(x, 3.2, z), color);
    b.build(this.scene, { castShadow: false, receiveShadow: false });

    const portal = new THREE.Mesh(
      new THREE.PlaneGeometry(1.9, 2.95),
      new THREE.MeshBasicMaterial({
        map: portalTexture(glow),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    portal.position.set(x, 1.5, z);
    this.scene.add(portal);

    const sign = new TextPanel({ width: 2.6, height: 0.9, background: 'rgba(15,18,24,0.92)' }, [
      { text: title, size: 120, bold: true, color: glow },
      { text: subtitle, size: 46, color: '#e8e8e8' },
    ]).mesh;
    sign.position.set(x, 3.85, z);
    this.scene.add(sign);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.75, 0.9, 48),
      new THREE.MeshBasicMaterial({ color: glow, transparent: true, opacity: 0.5 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.01, z + 1.2);
    this.scene.add(ring);

    this.gates.push({ role, x, portal, sign, ring });
  }

  update(dt: number, player: Player): void {
    this.time += dt;
    const pad = this.input.gamepadName;
    this.info.setText([
      { text: 'Valitse rooli: katso porttia ja paina A', size: 46, bold: true },
      padLine(['action'], 130),
      { text: 'tai kävele portista läpi', size: 38 },
      { text: 'Start = asetukset  ·  Select = nollaa katsesuunta', size: 32, color: '#cfd6e0' },
      padLine(['menu', 'recenter'], 72),
      pad
        ? { text: `Ohjain: ${shortName(pad)}`, size: 34, color: '#7dffa8' }
        : { text: 'Ohjainta ei löydy – paina jotain ohjaimen nappia', size: 34, color: '#ffb35c' },
    ]);

    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const hits = this.raycaster.intersectObjects(this.gates.map((g) => g.portal), false);
    const looked = hits.length && hits[0].distance < 12 ? this.gates.find((g) => g.portal === hits[0].object) : undefined;

    for (const g of this.gates) {
      const active = g === looked;
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 3 + g.x);
      g.portal.material.opacity = THREE.MathUtils.damp(g.portal.material.opacity, active ? 0.95 : 0.4 + pulse * 0.15, 8, dt);
      g.portal.material.map!.offset.y = (this.time * 0.15) % 1;
      const s = THREE.MathUtils.damp(g.sign.scale.x, active ? 1.1 : 1, 8, dt);
      g.sign.scale.setScalar(s);
      g.ring.material.opacity = 0.35 + pulse * 0.4;
    }

    if (!this.chosen) {
      if (looked && this.input.justPressed('action')) this.choose(looked.role);
      // Kävely portin läpi
      const z = player.pos.z;
      for (const g of this.gates) {
        if (Math.abs(player.pos.x - g.x) < 0.95 && this.prevZ >= GATE_Z && z < GATE_Z) this.choose(g.role);
      }
      this.prevZ = z;
    }
  }

  private choose(role: Role): void {
    this.chosen = true;
    this.onChoose(role);
  }

  applyQuality(_q: Quality): void {}

  dispose(): void {
    this.env.dispose();
  }
}

function shortName(id: string): string {
  return id.replace(/\(.*?\)/g, '').trim().slice(0, 40) || 'yhdistetty';
}

function portalTexture(glow: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, c.width, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.5, glow);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 2 + Math.random() * 6, 20 + Math.random() * 60);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 200;
  const ctx = c.getContext('2d')!;
  const sky = ctx.createLinearGradient(0, 0, 0, c.height);
  sky.addColorStop(0, '#9cc4ee');
  sky.addColorStop(0.6, '#dbe8f2');
  sky.addColorStop(1, '#e8eef0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * c.width + Math.random() * 8;
    const h = 50 + Math.random() * 60;
    ctx.fillStyle = `rgb(${50 + Math.random() * 30},${80 + Math.random() * 40},${45})`;
    ctx.beginPath();
    ctx.moveTo(x - 12, c.height * 0.85);
    ctx.lineTo(x, c.height * 0.85 - h);
    ctx.lineTo(x + 12, c.height * 0.85);
    ctx.fill();
  }
  ctx.fillStyle = '#6b8a3a';
  ctx.fillRect(0, c.height * 0.85, c.width, c.height * 0.15);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
