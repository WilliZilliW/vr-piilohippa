import * as THREE from 'three';
import { Agent, HiderBrain, SEEKER_PARAMS, SeekerBrain, type Actor, type AiWorld, type SeekerView } from './ai';
import type { Outfit } from './character';
import { sfx } from './audio';
import { LootCrates, POWERS, type PowerKind } from './crate';
import type { Hud } from './hud';
import { padLine } from './text';
import type { Input } from './input';
import type { Player } from './player';
import type { Role } from './scene';
import type { Settings } from './settings';
import type { Town } from './town';
import type { View } from './view';

export interface RoundContext {
  view: View;
  input: Input;
  settings: Settings;
  hud: Hud;
  player: Player;
  /** Takaisin aulaan. */
  exit: () => void;
}

const COUNT_TIME = 20;
const SEEK_TIME = 240;
/** Näin usein etsijä saa tietää, missä kaikki piiloutujat ovat. */
const REVEAL_INTERVAL = 30;
/** Kuinka kauan sijaintimerkit näkyvät pelaajalle etsijänä. */
const REVEAL_SHOW = 5;
const NAMES = ['Aino', 'Eetu', 'Liisa', 'Onni', 'Venla', 'Veeti'];
const SHIRTS = [0x2e86de, 0xf1c40f, 0x27ae60, 0x8e44ad, 0xe67e22, 0x16a085];
const PANTS = [0x2c3e50, 0x34495e, 0x5d4037, 0x1b2631];
const SKINS = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const HAIRS = [0x3b2a1a, 0x6d4c2f, 0xd9b26b, 0x111111, 0xa0522d];

function hiderOutfit(i: number): Outfit {
  return { shirt: SHIRTS[i % SHIRTS.length], pants: PANTS[i % PANTS.length], skin: SKINS[(i * 2) % SKINS.length], hair: HAIRS[(i * 3) % HAIRS.length] };
}

/** Etsijän tunnistaa punaisesta paidasta ja lippiksestä. */
const seekerOutfit = (o: Outfit): Outfit => ({ ...o, shirt: 0xc0392b, cap: 0xb03024 });

/** Tietokoneen hahmo: nimi ja vaatteet pysyvät, rooli vaihtuu kiinniotoissa. */
interface Person {
  name: string;
  outfit: Outfit;
  agent: Agent | null;
}

/** Seinien läpi näkyvä valopylväs hahmon kohdalla. */
function revealMarker(color = 0xff5a3c): THREE.Mesh {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthTest: false, depthWrite: false });
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 30, 10, 1, true), mat);
  m.renderOrder = 999;
  m.frustumCulled = false;
  return m;
}

function fmt(t: number): string {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Pelaaja Actor- ja SeekerView-muodossa, jotta tekoäly kohtelee sitä kuin muitakin. */
class PlayerActor implements Actor, SeekerView {
  readonly name = 'Sinä';
  readonly isPlayer = true;
  readonly chasing = null;
  caught = false;
  invisible = false;
  private readonly _eye = new THREE.Vector3();

  constructor(private readonly player: Player, private readonly view: View) {}

  get pos(): THREE.Vector3 {
    return this.player.pos;
  }
  get height(): number {
    return this.player.body.height;
  }
  get crouching(): boolean {
    return this.player.crouching;
  }
  get running(): boolean {
    return this.player.running;
  }
  get eye(): THREE.Vector3 {
    return this.view.camera.getWorldPosition(this._eye);
  }
  get facing(): THREE.Vector3 {
    return this.player.forward;
  }
}

/**
 * Yksi piilohippakierros. Aina kun etsijä saa jonkun kiinni, kiinni jäänyt
 * muuttuu etsijäksi ja entisestä etsijästä tulee piiloutuja. Uusi etsijä
 * laskee pesällä, muut piiloutuvat, ja etsintä jatkuu jäljellä olevalla
 * ajalla. Kierros päättyy, kun aika loppuu.
 */
export class Round {
  phase: 'count' | 'seek' | 'end' = 'count';
  private t = COUNT_TIME;
  private readonly ai: AiWorld;
  private readonly people: Person[];
  private readonly hiders: HiderBrain[] = [];
  private seeker: SeekerBrain | null = null;
  /** Etsintäaikaa jäljellä, kun laskenta alkaa kesken kierroksen (roolinvaihto). */
  private seekLeft: number | null = null;
  /** Kiinni jäänyt: hänestä tulee etsijä tekoälyn päivityksen jälkeen. */
  private nextSeeker: Actor | null = null;
  private myCatches = 0;
  private timesCaught = 0;
  private readonly me: PlayerActor;
  private readonly positions: THREE.Vector3[] = [];
  private lastSec = 0;
  private wasChased = false;
  private revealT = REVEAL_INTERVAL;
  /** Seinien läpi näkyvät pylväät ja niiden jäljellä oleva aika. */
  private readonly markers = new Map<Agent, { mesh: THREE.Mesh; t: number }>();
  private loot!: LootCrates;
  /** Voimassa olevat apuvälineet. */
  private effects: { actor: Actor; kind: PowerKind; t: number }[] = [];

  constructor(private readonly ctx: RoundContext, private readonly town: Town, private role: Role) {
    this.ai = {
      world: town.world, nav: town.nav, vision: town.vision, spots: town.spots, ladders: town.ladders, base: town.base,
    };
    this.me = new PlayerActor(ctx.player, ctx.view);
    this.people = NAMES.slice(0, 4).map((name, i) => ({ name, outfit: hiderOutfit(i), agent: null }));
    this.assignRoles(role === 'hider' ? this.people[3] : null, true);

    if (role === 'hider') {
      ctx.hud.show([
        { text: 'Olet PIILOUTUJA', size: 80, bold: true, color: '#7dffa8' },
        { text: 'Juokse piiloon ennen kuin etsijä lopettaa laskemisen', size: 32 },
        { text: 'B = juoksu · X = kyykky · Y = kiipeä · tikkailla katolle', size: 28, color: '#cfd6e0' },
        { text: `Etsijä näkee ${REVEAL_INTERVAL} sekunnin välein, missä kaikki ovat – vaihda piilopaikkaa!`, size: 28, color: '#ffb08a' },
        { text: 'Jos jäät kiinni, sinusta tulee etsijä', size: 28, color: '#cfd6e0' },
        padLine(['run', 'crouch', 'jump'], 110),
      ], 6);
    }
  }

  private get agents(): Agent[] {
    return this.people.map((p) => p.agent!);
  }

  /**
   * Jaa roolit ja aloita laskenta.
   * @param seeker tietokoneen etsijä, tai null, kun pelaaja on etsijä
   * @param first kierroksen alku: hahmot asetetaan pesän ympärille
   */
  private assignRoles(seeker: Person | null, first: boolean): void {
    const base = this.town.base;
    const taken = new Set<import('./vision').Spot>();
    const jail = (i: number) => new THREE.Vector3(base.x + Math.sin(i * 1.3 + 2) * 4.6, base.y, base.z + Math.cos(i * 1.3 + 2) * 4.6);
    const hiders = this.people.filter((p) => p !== seeker);
    this.role = seeker ? 'hider' : 'seeker';
    this.seeker = null;
    this.hiders.length = 0;

    for (const p of this.people) {
      const isSeeker = p === seeker;
      const kind = isSeeker ? 'seeker' : 'hider';
      // Rooli vaihtui: uusi hahmo (vaatteet ja askelten ääni) samaan paikkaan.
      if (!p.agent || p.agent.kind !== kind) {
        const old = p.agent;
        p.agent = new Agent(p.name, isSeeker ? seekerOutfit(p.outfit) : p.outfit, this.ai, this.town.scene, kind);
        if (old) {
          p.agent.place(old.pos.x, old.pos.y, old.pos.z, old.yaw);
          old.dispose();
        }
      }
      const a = p.agent;
      a.caught = false;
      a.nav.stop();
      if (isSeeker) {
        a.place(base.x, base.y, base.z + 1.8, 0);
        this.seeker = new SeekerBrain(a, this.ai, SEEKER_PARAMS[this.ctx.settings.difficulty], (t) => this.onCaught(t));
      } else {
        const k = hiders.indexOf(p);
        if (first) {
          const ang = Math.PI / 4 + (k / hiders.length) * Math.PI * 2;
          a.place(base.x + Math.sin(ang) * 2.6, base.y, base.z + Math.cos(ang) * 2.6, ang);
        }
        const brain = new HiderBrain(a, this.ai, taken, jail(k));
        brain.start();
        this.hiders.push(brain);
      }
    }

    this.me.caught = false;
    this.wasChased = false;
    this.revealT = REVEAL_INTERVAL;
    // Etsijä ei näe aarrelaatikkoa.
    this.loot?.dispose();
    this.loot = new LootCrates(this.town.scene, this.town.spots, base, this.role === 'hider');

    this.phase = 'count';
    this.t = COUNT_TIME;
    this.lastSec = 0;
    if (this.role === 'seeker') {
      if (!first) this.ctx.player.spawn(base.x, base.y, base.z + 2.2, 0);
      this.ctx.player.locked = true;
    } else {
      this.ctx.player.locked = false;
      this.ctx.view.fadeTo(0);
    }
  }

  /** Kaikkien hahmojen sijainnit (autot väistävät niitä). */
  actorPositions(): THREE.Vector3[] {
    this.positions.length = 0;
    this.positions.push(this.ctx.player.pos);
    for (const a of this.agents) this.positions.push(a.pos);
    return this.positions;
  }

  private get seekerView(): SeekerView {
    return this.seeker ?? this.me;
  }

  update(dt: number): void {
    const { hud, input } = this.ctx;
    const counting = this.phase === 'count';

    if (this.phase === 'count') {
      this.t -= dt;
      const sec = Math.ceil(this.t);
      if (sec !== this.lastSec && sec > 0) {
        this.lastSec = sec;
        sfx.countBeep(sec <= 3);
      }
      if (this.role === 'seeker') {
        this.ctx.view.fadeTo(0.94);
        hud.show([
          ...(this.seekLeft !== null ? [{ text: 'Jäit kiinni – nyt sinä olet etsijä!', size: 44, bold: true, color: '#ff8a5c' }] : []),
          { text: 'Lasket silmät kiinni', size: 46, color: '#cfd6e0' },
          { text: String(Math.max(1, Math.ceil(this.t))), size: 140, bold: true, color: '#ffd84a' },
        ], Infinity);
        hud.setStatus(null);
      } else {
        hud.setStatus(`${this.seeker?.agent.name} laskee: ${Math.max(1, Math.ceil(this.t))} – piiloudu!`, '#7dffa8');
      }
      if (this.t <= 0) this.startSeeking();
    } else if (this.phase === 'seek') {
      const before = this.t;
      this.t -= dt;
      if (before > 30 && this.t <= 30) sfx.timeWarning();
      this.revealT -= dt;
      if (this.revealT <= 0) {
        this.revealT = REVEAL_INTERVAL;
        this.reveal();
      }
      this.updateStatus();
      if (this.role === 'seeker' && input.justPressed('action')) this.tryCatch();
      if (this.t <= 0) this.end();
    } else if (input.justPressed('action')) {
      this.ctx.exit();
    }

    // Tekoäly
    const targets: Actor[] = [...this.hiders.map((h) => h.agent), ...(this.role === 'hider' ? [this.me] : [])];
    const prevState = this.seeker?.state;
    this.seeker?.update(dt, targets);
    if (this.seeker) {
      // Etsijä kuuli jotain tai menettää kohteen: "hm?" sen suunnalta.
      if (this.seeker.state === 'investigate' && prevState !== 'investigate') sfx.heard(this.seeker.eye);
      // Etsijä huomasi pelaajan: hälytys.
      const chasingMe = this.seeker.chasing === this.me;
      if (chasingMe && !this.wasChased) sfx.spotted();
      this.wasChased = chasingMe;
    }
    const sv = this.seekerView;
    for (const h of this.hiders) h.update(dt, sv, counting, this.loot.targetFor(h.agent.pos));
    for (const a of this.agents) a.update(dt, this.ai.world);
    this.updateMarkers(dt);
    if (this.phase === 'seek') this.updateLoot(dt);

    // Kiinni jäänyt muuttuu etsijäksi, entinen etsijä piiloutujaksi.
    if (this.nextSeeker && this.phase === 'seek') {
      const caught = this.nextSeeker;
      this.nextSeeker = null;
      this.seekLeft = this.t;
      this.clearPowers();
      for (const [a, m] of this.markers) this.removeMarker(a, m.mesh);
      this.assignRoles(caught.isPlayer ? null : this.people.find((p) => p.agent === caught)!, false);
    }
  }

  private startSeeking(): void {
    this.phase = 'seek';
    this.t = this.seekLeft ?? SEEK_TIME;
    this.ctx.player.locked = false;
    this.ctx.view.fadeTo(0);
    this.seeker?.startSeeking();
    this.loot.start(this.actorPositions());
    sfx.go();
    this.ctx.hud.show([
      { text: 'Valmiit tai ei,', size: 50, color: '#cfd6e0' },
      { text: 'täältä tullaan!', size: 80, bold: true, color: '#ffd84a' },
      ...(this.role === 'seeker' ? [{ text: 'Katso piiloutujaa läheltä ja paina A', size: 34 }, padLine(['action'], 110)] : []),
    ], 3.5);
  }

  /** Etsijä saa tietää kaikkien vapaiden piiloutujien sijainnit. */
  private reveal(): void {
    const free = this.hiders.map((h) => h.agent).filter((a) => !a.caught);
    // Samalla piiloutujat saavat tietää aarrelaatikon paikan.
    const crate = this.loot.reveal(this.role === 'hider' && !this.me.caught ? REVEAL_SHOW : 0);
    if (this.seeker) {
      if (this.me.caught) return;
      this.seeker.reveal([...free, this.me]);
      sfx.revealed();
      this.ctx.hud.show([
        { text: 'Etsijä tietää, missä kaikki ovat!', size: 56, bold: true, color: '#ff8a5c' },
        ...(crate ? [{ text: 'Sinä näet aarrelaatikon – kultainen pylväs!', size: 40, bold: true, color: '#ffd84a' }] : []),
      ], 3);
    } else if (free.length) {
      for (const a of free) this.addMarker(a, REVEAL_SHOW);
      sfx.revealed();
      this.ctx.hud.show([{ text: 'Näet nyt, missä kaikki ovat!', size: 56, bold: true, color: '#ffd84a' }], 2.5);
    }
  }

  private addMarker(a: Agent, seconds: number, color?: number): void {
    const old = this.markers.get(a);
    if (old) this.removeMarker(a, old.mesh);
    const mesh = revealMarker(color);
    this.town.scene.add(mesh);
    this.markers.set(a, { mesh, t: seconds });
  }

  private updateMarkers(dt: number): void {
    for (const [a, m] of this.markers) {
      m.t -= dt;
      if (m.t <= 0 || a.caught || this.phase === 'end') {
        this.removeMarker(a, m.mesh);
        continue;
      }
      m.mesh.position.set(a.pos.x, a.pos.y + 15, a.pos.z);
      (m.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * Math.min(1, m.t);
    }
  }

  private removeMarker(a: Agent, m: THREE.Mesh): void {
    m.removeFromParent();
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
    this.markers.delete(a);
  }

  // ---------- Aarrelaatikko ja apuvälineet ----------

  private updateLoot(dt: number): void {
    this.loot.update(dt, this.actorPositions());
    const hiders: Actor[] = [...this.hiders.map((h) => h.agent), ...(this.role === 'hider' ? [this.me] : [])];
    const finder = this.loot.tryPickup(hiders);
    if (finder) this.givePower(finder);

    this.effects = this.effects.filter((e) => {
      e.t -= dt;
      if (e.t > 0 && !e.actor.caught) return true;
      this.endPower(e.actor, e.kind);
      return false;
    });
  }

  private givePower(actor: Actor): void {
    // Tutka hyödyttää vain pelaajaa piiloutujana.
    const kinds: PowerKind[] = actor.isPlayer ? ['ghost', 'speed', 'decoy', 'radar'] : ['ghost', 'speed', 'decoy'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const power = POWERS[kind];
    const agent = actor.isPlayer ? null : (actor as Agent);
    const body = agent ? agent.body : this.ctx.player.body;

    // Sama apuväline uudelleen: aika alkaa alusta.
    const same = this.effects.find((e) => e.actor === actor && e.kind === kind);
    if (same) same.t = power.seconds;
    else if (power.seconds > 0) this.effects.push({ actor, kind, t: power.seconds });

    if (kind === 'ghost') {
      actor.invisible = true;
      agent?.char.setGhost(true);
    } else if (kind === 'speed') {
      body.speedMul = 1.6;
    } else if (kind === 'decoy') {
      this.decoy(actor);
    } else if (kind === 'radar' && this.seeker) {
      this.addMarker(this.seeker.agent, power.seconds, 0xffb02e);
    }

    if (actor.isPlayer) {
      sfx.crateOpen();
      this.ctx.hud.show([
        { text: 'Löysit aarrelaatikon!', size: 46, color: '#cfd6e0' },
        { text: power.name, size: 80, bold: true, color: '#ffd84a' },
        { text: power.info + (power.seconds ? ` (${power.seconds} s)` : ''), size: 34 },
      ], 3.5);
    } else {
      sfx.crateOpen();
      this.ctx.hud.show([{ text: `${actor.name} avasi aarrelaatikon!`, size: 52, bold: true, color: '#ffd84a' }], 2.5);
    }
  }

  /** Kierros päättyy: laatikko pois ja apuvälineet pois päältä. */
  private clearPowers(): void {
    this.loot.stop();
    for (const e of this.effects) this.endPower(e.actor, e.kind, true);
    this.effects = [];
  }

  private endPower(actor: Actor, kind: PowerKind, quiet = false): void {
    const agent = actor.isPlayer ? null : (actor as Agent);
    if (kind === 'ghost') {
      actor.invisible = false;
      agent?.char.setGhost(false);
    } else if (kind === 'speed') {
      (agent ? agent.body : this.ctx.player.body).speedMul = 1;
    }
    if (actor.isPlayer && !actor.caught && !quiet) sfx.powerEnd();
  }

  /** Hämäysääni kauas löytäjästä: tietokoneen etsijä lähtee sinne, pelaaja-etsijä kuulee sen. */
  private decoy(from: Actor): void {
    const far = this.town.spots.filter((s) => {
      const d = Math.hypot(s.pos.x - from.pos.x, s.pos.z - from.pos.z);
      return s.pos.y < 1 && d > 30 && d < 70;
    });
    const spot = far[Math.floor(Math.random() * far.length)];
    if (!spot) return;
    sfx.decoy(spot.pos);
    this.seeker?.distract(spot.pos);
  }

  /** Pelaajan voimassa olevat apuvälineet tilariville. */
  private myPowers(): string {
    return this.effects
      .filter((e) => e.actor === this.me)
      .map((e) => `${POWERS[e.kind].name} ${Math.ceil(e.t)} s`)
      .join('  ·  ');
  }

  private updateStatus(): void {
    const { hud } = this.ctx;
    const who = this.role === 'seeker' ? 'Olet ETSIJÄ' : `Etsijä: ${this.seeker?.agent.name}`;
    const powers = this.myPowers();
    if (this.role === 'hider' && this.seeker?.chasing === this.me) {
      hud.setStatus(`${fmt(this.t)}  ·  ETSIJÄ JAHTAA SINUA!`, '#ff6b5c');
    } else if (powers) {
      hud.setStatus(`${fmt(this.t)}  ·  ${powers}`, '#ffd84a');
    } else {
      hud.setStatus(`${fmt(this.t)}  ·  ${who}`);
    }
  }

  /** Pelaaja etsijänä: ota kiinni läheltä katsottu piiloutuja. */
  private tryCatch(): void {
    const p = this.ctx.player.pos;
    const fwd = this.ctx.player.forward;
    let best: Agent | null = null;
    let bestD = Infinity;
    for (const h of this.hiders) {
      const a = h.agent;
      if (a.caught) continue;
      const dx = a.pos.x - p.x;
      const dz = a.pos.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.2 || Math.abs(a.pos.y - p.y) > 1.6) continue;
      if (d > 0.6 && (dx * fwd.x + dz * fwd.z) / d < 0.5) continue;
      if (d < bestD) {
        bestD = d;
        best = a;
      }
    }
    if (best) this.onCaught(best);
  }

  private onCaught(t: Actor): void {
    if (t.caught || this.phase !== 'seek' || this.nextSeeker) return;
    t.caught = true;
    this.nextSeeker = t;
    const { hud } = this.ctx;
    if (t.isPlayer) {
      sfx.playerCaught();
      this.timesCaught++;
    } else if (this.role === 'seeker') {
      sfx.foundHider(t.pos);
      this.myCatches++;
      hud.show([
        { text: `Löysit: ${t.name}!`, size: 64, bold: true, color: '#ffd84a' },
        { text: `Nyt ${t.name} on etsijä – juokse piiloon!`, size: 40, bold: true, color: '#7dffa8' },
      ], 3.5);
    } else {
      sfx.otherCaught(t.pos);
      hud.show([
        { text: `${t.name} jäi kiinni!`, size: 64, bold: true, color: '#ffd84a' },
        { text: `Nyt ${t.name} on etsijä – pysy piilossa!`, size: 40, color: '#cfd6e0' },
      ], 3.5);
    }
  }

  /** Aika loppui: se, joka on lopussa etsijä, häviää. */
  private end(): void {
    this.phase = 'end';
    this.clearPowers();
    const { hud } = this.ctx;
    this.ctx.player.locked = true;
    hud.setStatus(null);
    const stats = `Sait kiinni ${this.myCatches} · jäit kiinni ${this.timesCaught}`;
    let title: string;
    let sub: string;
    let color: string;
    if (this.role === 'seeker') {
      title = 'AIKA LOPPUI';
      sfx.lose();
      sub = `Jäit etsijäksi · ${stats}`;
      color = '#ffd84a';
    } else {
      title = 'SELVISIT!';
      sfx.win();
      sub = `Olit lopussa piilossa · ${stats}`;
      color = '#7dffa8';
    }
    hud.show([
      { text: title, size: 96, bold: true, color },
      { text: sub, size: 40 },
      { text: 'Paina A palataksesi aulaan', size: 34, color: '#cfd6e0' },
      padLine(['action'], 110),
    ], Infinity);
  }

  dispose(): void {
    for (const [a, m] of this.markers) this.removeMarker(a, m.mesh);
    this.clearPowers();
    this.loot.dispose();
    for (const a of this.agents) a.dispose();
    this.ctx.player.locked = false;
    this.ctx.view.fadeTo(0);
    this.ctx.hud.hide();
    this.ctx.hud.setStatus(null);
  }
}
