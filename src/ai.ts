import * as THREE from 'three';
import { MotionSounds, type StepKind } from './audio';
import { Body, emptyCommand } from './body';
import { Character, type Outfit } from './character';
import type { NavGrid } from './nav';
import type { World } from './physics';
import type { Difficulty } from './settings';
import type { LadderInfo, Spot, Vision } from './vision';

/** Mikä tahansa pelissä oleva hahmo: pelaaja tai tietokone. */
export interface Actor {
  readonly name: string;
  readonly pos: THREE.Vector3;
  readonly height: number;
  readonly crouching: boolean;
  readonly running: boolean;
  readonly isPlayer: boolean;
  caught: boolean;
}

/** Etsijän näkökulma piiloutujan kannalta. */
export interface SeekerView {
  readonly pos: THREE.Vector3;
  readonly eye: THREE.Vector3;
  readonly facing: THREE.Vector3;
  /** Ketä etsijä juuri nyt jahtaa (tietokoneen etsijä), muuten null. */
  readonly chasing: Actor | null;
}

export interface AiWorld {
  world: World;
  nav: NavGrid;
  vision: Vision;
  spots: Spot[];
  ladders: LadderInfo[];
  base: THREE.Vector3;
}

const dist2 = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const yawTo = (dx: number, dz: number) => Math.atan2(-dx, -dz);

// ---------------------------------------------------------------------------
// Tietokoneen ohjaama hahmo
// ---------------------------------------------------------------------------

export class Agent implements Actor {
  readonly body = new Body();
  readonly cmd = emptyCommand();
  readonly char: Character;
  readonly nav: Navigator;
  readonly isPlayer = false;
  caught = false;
  yaw = 0;
  wantYaw = 0;
  private readonly _eye = new THREE.Vector3();
  private readonly _facing = new THREE.Vector3();

  private readonly sounds: MotionSounds;

  constructor(readonly name: string, outfit: Outfit, ai: AiWorld, scene: THREE.Scene, kind: StepKind) {
    this.sounds = new MotionSounds(kind);
    this.char = new Character(outfit);
    this.nav = new Navigator(ai);
    scene.add(this.char.root);
  }

  get pos(): THREE.Vector3 {
    return this.body.pos;
  }
  get height(): number {
    return this.body.height;
  }
  get crouching(): boolean {
    return this.body.crouching;
  }
  get running(): boolean {
    return this.body.running;
  }
  get eye(): THREE.Vector3 {
    return this._eye.set(this.pos.x, this.pos.y + this.height - 0.1, this.pos.z);
  }
  get facing(): THREE.Vector3 {
    return this._facing.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  place(x: number, y: number, z: number, yaw: number): void {
    this.body.reset(x, y, z);
    this.yaw = this.wantYaw = yaw;
  }

  update(dt: number, world: World): void {
    this.nav.steer(this, dt);
    this.body.step(dt, world, this.cmd);
    this.sounds.update(dt, this.body);
    this.cmd.jump = false;
    this.yaw += wrap(this.wantYaw - this.yaw) * (1 - Math.exp(-8 * dt));
    this.char.root.position.copy(this.body.pos);
    this.char.root.rotation.y = this.yaw;
    this.char.animate(dt, this.body.speed, this.body.crouching, this.body.onLadder);
  }

  dispose(): void {
    this.char.root.removeFromParent();
  }
}

// ---------------------------------------------------------------------------
// Reitin seuraaminen: maan tasolla reitinhaku, katoille tikkaita pitkin
// ---------------------------------------------------------------------------

type Stage =
  | { kind: 'path'; pts: THREE.Vector3[]; i: number }
  | { kind: 'climb'; ladder: LadderInfo }
  | { kind: 'direct'; target: THREE.Vector3; replan: boolean };

export class Navigator {
  goal: THREE.Vector3 | null = null;
  private stages: Stage[] = [];
  private stuckT = 0;
  private stuckTotal = 0;

  constructor(private readonly ai: AiWorld) {}

  get done(): boolean {
    return this.stages.length === 0;
  }

  stop(): void {
    this.stages = [];
    this.goal = null;
  }

  private ladderFor(p: THREE.Vector3): LadderInfo | undefined {
    return this.ai.ladders.find((l) => l.roof && Math.abs(l.top - p.y) < 0.5
      && p.x > l.roof.minX && p.x < l.roof.maxX && p.z > l.roof.minZ && p.z < l.roof.maxZ);
  }

  /** Suunnittele reitti. Katolle mennään tikkaita pitkin, katolta alas kävellään reunan yli. */
  go(from: THREE.Vector3, goal: THREE.Vector3): void {
    this.goal = goal.clone();
    this.stuckTotal = 0;
    const selfHigh = from.y > 1.0;
    const goalHigh = goal.y > 1.0;
    if (goalHigh) {
      const ladder = this.ladderFor(goal);
      if (selfHigh && Math.abs(from.y - goal.y) < 0.6) {
        this.stages = [{ kind: 'direct', target: goal.clone(), replan: false }];
      } else if (selfHigh) {
        this.stages = [{ kind: 'direct', target: (ladder?.base ?? goal).clone(), replan: true }];
      } else if (ladder) {
        const path = this.ai.nav.findPath(from, ladder.base);
        this.stages = [
          ...(path ? [{ kind: 'path', pts: path, i: 0 } as Stage] : []),
          { kind: 'climb', ladder },
          { kind: 'direct', target: goal.clone(), replan: false },
        ];
      } else {
        const path = this.ai.nav.findPath(from, goal);
        this.stages = path ? [{ kind: 'path', pts: path, i: 0 }] : [];
      }
    } else if (selfHigh) {
      this.stages = [{ kind: 'direct', target: goal.clone(), replan: true }];
    } else {
      const path = this.ai.nav.findPath(from, goal);
      this.stages = path ? [{ kind: 'path', pts: path, i: 0 }] : [{ kind: 'direct', target: goal.clone(), replan: false }];
    }
  }

  steer(a: Agent, dt: number): void {
    const c = a.cmd;
    c.moveX = c.moveZ = 0;
    c.climb = 0;
    c.holdLadder = false;
    const st = this.stages[0];
    if (!st) return;
    const p = a.body.pos;
    let tx = 0;
    let tz = 0;
    let faceYaw: number | null = null;

    if (st.kind === 'path') {
      const t = st.pts[st.i];
      const last = st.i === st.pts.length - 1;
      if (dist2(p, t) < (last ? 0.45 : 0.55)) {
        st.i++;
        if (st.i >= st.pts.length) this.stages.shift();
        return;
      }
      tx = t.x - p.x;
      tz = t.z - p.z;
    } else if (st.kind === 'direct') {
      if (st.replan && a.body.grounded && p.y < 0.8 && this.goal) {
        this.go(p, this.goal);
        return;
      }
      if (dist2(p, st.target) < 0.5 && Math.abs(p.y - st.target.y) < 0.8) {
        this.stages.shift();
        return;
      }
      tx = st.target.x - p.x;
      tz = st.target.z - p.z;
    } else {
      const l = st.ladder;
      if (p.y >= l.top - 0.05 && a.body.grounded && !a.body.onLadder) {
        this.stages.shift();
        return;
      }
      if (p.y < 0.6 && !a.body.onLadder && dist2(p, l.base) > 0.35) {
        tx = l.base.x - p.x;
        tz = l.base.z - p.z;
      } else {
        // Kohti seinää ja ylös; pieni korjaus tikkaiden keskilinjalle.
        const lat = l.nx !== 0 ? l.z - p.z : l.x - p.x;
        tx = -l.nx + (l.nx === 0 ? lat : 0);
        tz = -l.nz + (l.nz === 0 ? lat : 0);
        c.climb = 1;
        faceYaw = yawTo(-l.nx, -l.nz);
      }
    }

    const len = Math.hypot(tx, tz);
    if (len > 1e-4) {
      c.moveX = tx / len;
      c.moveZ = tz / len;
      c.facingX = c.moveX;
      c.facingZ = c.moveZ;
      a.wantYaw = faceYaw ?? yawTo(c.moveX, c.moveZ);
    }

    // Jumissa? Kokeillaan kiivetä esteen yli, ja jos ei auta, haetaan uusi reitti.
    const wantsMove = c.moveX !== 0 || c.moveZ !== 0;
    if (wantsMove && a.body.actualSpeed < 0.35 && !a.body.onLadder && !a.body.climbingLedge && c.climb === 0) {
      this.stuckT += dt;
      if (this.stuckT > 0.7) {
        c.jump = true;
        this.stuckT = 0;
        this.stuckTotal += 0.7;
        if (this.stuckTotal > 3 && this.goal) {
          // Uusi reitti, tai joskus luovutetaan – aivot valitsevat silloin uuden kohteen.
          if (Math.random() < 0.4) this.stop();
          else this.go(p, this.goal);
        }
      }
    } else {
      this.stuckT = 0;
      this.stuckTotal = Math.max(0, this.stuckTotal - dt * 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
// Vaikeustaso
// ---------------------------------------------------------------------------

export interface SeekerParams {
  range: number;
  fovCos: number;
  reaction: number;
  hear: number;
  speed: number;
  hunch: number;
}

export const SEEKER_PARAMS: Record<Difficulty, SeekerParams> = {
  easy: { range: 14, fovCos: 0.45, reaction: 0.9, hear: 7, speed: 0.82, hunch: 0.2 },
  normal: { range: 20, fovCos: 0.4, reaction: 0.5, hear: 11, speed: 0.92, hunch: 0.35 },
  hard: { range: 27, fovCos: 0.33, reaction: 0.25, hear: 15, speed: 1.0, hunch: 0.5 },
};

// ---------------------------------------------------------------------------
// Tietokoneen etsijä
// ---------------------------------------------------------------------------

export type SeekerState = 'count' | 'patrol' | 'look' | 'investigate' | 'chase';

export class SeekerBrain implements SeekerView {
  state: SeekerState = 'count';
  target: Actor | null = null;
  private readonly seen = new Map<Actor, number>();
  private readonly searched = new Map<Spot, number>();
  /** Milloin kullakin 16 x 16 m alueella on viimeksi käyty. */
  private readonly visited = new Map<number, number>();
  private readonly lastSeen = new THREE.Vector3();
  private lostT = 0;
  private repathT = 0;
  private visionT = 0;
  private lookT = 0;
  private hearT = 0;
  private time = 0;

  constructor(
    readonly agent: Agent,
    private readonly ai: AiWorld,
    private readonly p: SeekerParams,
    private readonly onCatch: (t: Actor) => void,
  ) {}

  get pos(): THREE.Vector3 {
    return this.agent.pos;
  }
  get eye(): THREE.Vector3 {
    return this.agent.eye;
  }
  get facing(): THREE.Vector3 {
    return this.agent.facing;
  }
  get chasing(): Actor | null {
    return this.state === 'chase' ? this.target : null;
  }

  startSeeking(): void {
    this.state = 'patrol';
    this.pickPatrol([]);
  }

  update(dt: number, targets: Actor[]): void {
    this.time += dt;
    const a = this.agent;
    const c = a.cmd;
    c.speedScale = this.p.speed;
    c.crouch = false;
    if (this.state === 'count') {
      a.nav.stop();
      a.wantYaw = 0; // kasvot pesäpuuta kohti
      c.run = false;
      return;
    }
    const free = targets.filter((t) => !t.caught);
    this.visited.set(this.regionKey(a.pos), this.time);

    // Näkö
    this.visionT -= dt;
    if (this.visionT <= 0) {
      this.visionT = 0.1;
      for (const t of free) {
        const vis = this.ai.vision.canSee(a.eye, a.facing, t, this.p.range, this.p.fovCos);
        let s = this.seen.get(t) ?? 0;
        s = vis ? s + 0.1 : Math.max(0, s - 0.05);
        this.seen.set(t, s);
        if (vis && t === this.target) {
          this.lastSeen.copy(t.pos);
          this.lostT = 0;
        }
        if (this.state !== 'chase' && s >= this.p.reaction) this.startChase(t);
      }
    }

    // Kuulo: juokseminen kuuluu.
    this.hearT -= dt;
    if (this.state !== 'chase' && this.hearT <= 0) {
      for (const t of free) {
        if (t.running && dist2(t.pos, a.pos) < this.p.hear) {
          this.hearT = 2.5;
          this.investigate(t.pos);
          break;
        }
      }
    }

    switch (this.state) {
      case 'chase': {
        const t = this.target;
        if (!t || t.caught) {
          this.target = null;
          this.toLook(1.5);
          break;
        }
        c.run = true;
        this.lostT += dt;
        this.repathT -= dt;
        if (this.repathT <= 0) {
          this.repathT = 0.5;
          a.nav.go(a.pos, this.lostT < 0.3 ? t.pos : this.lastSeen);
        }
        if (dist2(a.pos, t.pos) < 1.15 && Math.abs(a.pos.y - t.pos.y) < 1.2) {
          this.onCatch(t);
          this.target = null;
          this.toLook(2);
        } else if (this.lostT > 3) {
          this.investigate(this.lastSeen);
        }
        break;
      }
      case 'investigate':
        c.run = true;
        if (a.nav.done) this.toLook(2.5);
        break;
      case 'patrol':
        c.run = false;
        if (a.nav.done) this.toLook(1.8);
        break;
      case 'look':
        c.run = false;
        this.lookT -= dt;
        a.wantYaw += dt * 2.6;
        if (this.lookT <= 0) {
          this.state = 'patrol';
          this.pickPatrol(free);
        }
        break;
    }
  }

  private toLook(seconds: number): void {
    this.state = 'look';
    this.lookT = seconds;
    this.agent.nav.stop();
  }

  private startChase(t: Actor): void {
    this.state = 'chase';
    this.target = t;
    this.lostT = 0;
    this.repathT = 0;
    this.lastSeen.copy(t.pos);
  }

  /** Etsijä saa tietää piiloutujien sijainnit ja lähtee lähimmän luo (ellei jo jahtaa). */
  reveal(targets: Actor[]): void {
    if (this.state === 'count' || this.state === 'chase') return;
    let best: Actor | null = null;
    for (const t of targets) {
      if (t.caught) continue;
      if (!best || dist2(t.pos, this.pos) < dist2(best.pos, this.pos)) best = t;
    }
    if (best) this.investigate(best.pos);
  }

  private investigate(p: THREE.Vector3): void {
    this.state = 'investigate';
    this.agent.nav.go(this.agent.pos, p);
  }

  private regionKey(p: THREE.Vector3): number {
    return Math.floor((p.x + 100) / 16) * 100 + Math.floor((p.z + 100) / 16);
  }

  /** Valitse seuraava tarkistettava piilopaikka. */
  private pickPatrol(free: Actor[]): void {
    const a = this.agent;
    const spots = this.ai.spots;
    const recently = (s: Spot) => {
      const at = this.searched.get(s);
      return at !== undefined && this.time - at < 45;
    };
    let chosen: Spot | null = null;

    if (free.length && Math.random() < this.p.hunch) {
      // Aavistus: suunnataan jonkun piiloutujan lähistölle (ei suoraan kohdalle).
      const t = free[Math.floor(Math.random() * free.length)];
      const ang = Math.random() * Math.PI * 2;
      const off = 4 + Math.random() * 8;
      const aimX = t.pos.x + Math.sin(ang) * off;
      const aimZ = t.pos.z + Math.cos(ang) * off;
      let bestD = Infinity;
      for (const s of spots) {
        if (recently(s)) continue;
        const d = Math.hypot(s.pos.x - aimX, s.pos.z - aimZ);
        if (d < bestD) {
          bestD = d;
          chosen = s;
        }
      }
    } else {
      // Muuten suositaan alueita, joilla ei ole vähään aikaan käyty.
      let best = -Infinity;
      for (let k = 0; k < 80; k++) {
        const s = spots[Math.floor(Math.random() * spots.length)];
        if (recently(s)) continue;
        const stale = Math.min(this.time - (this.visited.get(this.regionKey(s.pos)) ?? -200), 150);
        let score = stale * 0.12 - dist2(a.pos, s.pos) * 0.08 + Math.random() * 4;
        if (s.kind === 'bush') score += 2;
        if (s.kind === 'roof') score -= 3;
        if (score > best) {
          best = score;
          chosen = s;
        }
      }
    }
    if (!chosen) return;
    this.searched.set(chosen, this.time);
    a.nav.go(a.pos, chosen.pos);
  }
}

// ---------------------------------------------------------------------------
// Tietokoneen piiloutuja
// ---------------------------------------------------------------------------

export type HiderState = 'go' | 'hidden' | 'flee' | 'caught' | 'jail';

export class HiderBrain {
  state: HiderState = 'go';
  spot: Spot | null = null;
  private checkT = Math.random() * 0.3;
  private lookT = 0;

  constructor(
    readonly agent: Agent,
    private readonly ai: AiWorld,
    private readonly taken: Set<Spot>,
    private readonly jail: THREE.Vector3,
  ) {}

  /** Laskennan alkaessa: valitse piilopaikka ja juokse sinne. */
  start(): void {
    const base = this.ai.base;
    const baseEye = new THREE.Vector3(base.x, base.y + 1.7, base.z + 1.8);
    let best: { s: Spot; score: number } | null = null;
    for (let k = 0; k < 70; k++) {
      const s = this.ai.spots[Math.floor(Math.random() * this.ai.spots.length)];
      if (this.taken.has(s)) continue;
      const dB = dist2(s.pos, base);
      if (dB < 14 || dB > 62) continue;
      let tooClose = false;
      for (const o of this.taken) if (dist2(o.pos, s.pos) < 6) tooClose = true;
      if (tooClose) continue;
      let score = (s.kind === 'bush' ? 4 : s.kind === 'roof' ? 3 : 2) + Math.random() * 6 - Math.abs(dB - 35) * 0.08;
      const head = s.pos.clone();
      head.y += 1.0;
      if (this.ai.vision.clear(baseEye, head)) score -= 6;
      if (!best || score > best.score) best = { s, score };
    }
    if (best) this.takeSpot(best.s);
    this.state = 'go';
  }

  private takeSpot(s: Spot): void {
    if (this.spot) this.taken.delete(this.spot);
    this.spot = s;
    this.taken.add(s);
    this.agent.nav.go(this.agent.pos, s.pos);
  }

  update(dt: number, seeker: SeekerView, counting: boolean): void {
    const a = this.agent;
    const c = a.cmd;
    c.speedScale = 0.9;

    if (a.caught && this.state !== 'caught' && this.state !== 'jail') {
      this.state = 'caught';
      if (this.spot) this.taken.delete(this.spot);
      this.spot = null;
      a.nav.go(a.pos, this.jail);
    }

    switch (this.state) {
      case 'caught':
        c.run = false;
        c.crouch = false;
        if (a.nav.done) this.state = 'jail';
        return;
      case 'jail':
        c.crouch = false;
        a.wantYaw = yawTo(this.ai.base.x - a.pos.x, this.ai.base.z - a.pos.z);
        return;
      case 'go':
        c.run = true;
        c.crouch = false;
        if (a.nav.done) this.state = 'hidden';
        break;
      case 'hidden':
        c.run = false;
        c.crouch = true;
        this.lookT -= dt;
        if (this.lookT <= 0) {
          this.lookT = 2 + Math.random() * 3;
          a.wantYaw = yawTo(seeker.pos.x - a.pos.x, seeker.pos.z - a.pos.z) + (Math.random() - 0.5) * 1.2;
        }
        // Jos piilopaikkaan ei päästy, valitaan uusi.
        if (this.spot && dist2(a.pos, this.spot.pos) > 3 && a.nav.done) this.start();
        break;
      case 'flee':
        c.run = true;
        c.crouch = false;
        if (a.nav.done) {
          if (dist2(a.pos, seeker.pos) > 12 && seeker.chasing !== a) this.state = 'hidden';
          else this.flee(seeker);
        }
        break;
    }

    if (counting) return;

    // Vaarantunne: näkeekö etsijä minut tai jahtaako se minua?
    this.checkT -= dt;
    if (this.checkT <= 0 && this.state !== 'flee') {
      this.checkT = 0.25;
      const d = dist2(a.pos, seeker.pos);
      const chased = seeker.chasing === a;
      const seen = d < 11 && this.ai.vision.canSee(seeker.eye, seeker.facing, a, 18, 0.5);
      if (chased || seen || d < 2.2) this.flee(seeker);
    }
  }

  private flee(seeker: SeekerView): void {
    const a = this.agent;
    const away = new THREE.Vector3(a.pos.x - seeker.pos.x, 0, a.pos.z - seeker.pos.z).normalize();
    let best: { s: Spot; score: number } | null = null;
    for (let k = 0; k < 80; k++) {
      const s = this.ai.spots[Math.floor(Math.random() * this.ai.spots.length)];
      if (this.taken.has(s) || s.kind === 'roof') continue;
      const dm = dist2(s.pos, a.pos);
      if (dm < 8 || dm > 45) continue;
      const ds = dist2(s.pos, seeker.pos);
      const dir = ((s.pos.x - a.pos.x) * away.x + (s.pos.z - a.pos.z) * away.z) / dm;
      const score = ds - dm * 0.5 + dir * 12 + Math.random() * 5;
      if (!best || score > best.score) best = { s, score };
    }
    this.state = 'flee';
    if (best) this.takeSpot(best.s);
    else a.nav.go(a.pos, a.pos.clone().addScaledVector(away, 15));
  }
}
