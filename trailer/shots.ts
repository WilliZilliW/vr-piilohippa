/**
 * Trailerin käsikirjoitus: otokset, kamera-ajot ja tekstit biisin
 * "Piilo-piilo-piilohippa" tahtiin (n. 148 BPM, tahti 1,625 s).
 *
 * Biisin rakenne (sekunteina, tahtien rajoilla):
 *   0–6.9    intro, laskenta "yks kaks kolme hei"
 *   6.9–33   säkeistö 1 + "valmiit tai ei – täältä tullaan"
 *   33–46    kertosäe 1
 *   46–73.5  säkeistö 2 (aarrelaatikko)
 *   73.5–85  kertosäe
 *   85–99.5  kertosäe
 *   99.5–112.5 silta "tik-tak"
 *   112.5–125.5 kertosäe
 *   125.5–143.4 rauhallinen välisoitto
 *   143.4–156.4 viimeinen (voimakkain) kertosäe
 *   156.4–168.7 outro "löysin sut – nyt sä etsit"
 *
 * Jokaisella otoksella on kamera (u = 0…1 otoksen sisällä), valinnainen
 * valmistelu (setup: hahmojen siirrot ja tapahtumat otoksen alussa) ja
 * valinnainen tick (joka simulaatioaskel).
 */
import * as THREE from 'three';
import type { Lobby } from '../src/lobby';
import type { Player } from '../src/player';
import type { Town } from '../src/town';

export const SONG_LENGTH = 168.7;
const BEAT0 = 0.383;
const BAR = 1.625;
/** Tahdin k alkuhetki sekunteina. */
export const bar = (k: number) => BEAT0 + BAR * k;

export interface World {
  town: Town;
  lobby: Lobby;
  /** Round-olio (yksityiset kentät käytössä, siksi any). */
  round: any;
  player: Player;
  time: number;
  started: boolean;
}

export interface CamState {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov?: number;
  roll?: number;
}

export interface Shot {
  start: number;
  end: number;
  scene: 'lobby' | 'town';
  cam: (u: number, w: World, s: number) => CamState;
  setup?: (w: World) => void;
  tick?: (w: World, dt: number) => void;
  /** Kameran pehmennys (suurempi = jäykempi); 0 = ei pehmennystä. */
  smooth?: number;
}

// ---------- Apufunktiot ----------

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const ease = (u: number) => u * u * (3 - 2 * u);
const easeOut = (u: number) => 1 - (1 - u) * (1 - u);
const lerpV = (a: THREE.Vector3, b: THREE.Vector3, u: number) => a.clone().lerp(b, u);

/** Tietokonehahmo nimen perusteella (hahmo vaihtuu, kun rooli vaihtuu). */
function agent(w: World, name: string): any {
  return w.round.people.find((p: any) => p.name === name).agent;
}
function seeker(w: World): any {
  return w.round.seeker?.agent ?? agent(w, 'Onni');
}
function brainOf(w: World, name: string): any {
  return w.round.hiders.find((h: any) => h.agent.name === name);
}
/** Ensimmäinen piiloutuja (nimi), joka ei ole etsijä. */
function hiderName(w: World, prefer: string[]): string {
  const s = w.round.seeker?.agent.name;
  return prefer.find((n) => n !== s) ?? prefer[0];
}

function forward(a: any): THREE.Vector3 {
  return v(-Math.sin(a.yaw), 0, -Math.cos(a.yaw));
}

/** Kamera hahmon suhteen: side oikealle, up ylös, front eteenpäin (negatiivinen = takana). */
function follow(a: any, side: number, up: number, front: number, lookUp = 1.2, lookAhead = 2): CamState {
  const f = forward(a);
  const r = v(-f.z, 0, f.x);
  const p = a.pos as THREE.Vector3;
  return {
    pos: p.clone().addScaledVector(r, side).addScaledVector(f, front).add(v(0, up, 0)),
    look: p.clone().addScaledVector(f, lookAhead).add(v(0, lookUp, 0)),
  };
}

function orbit(center: THREE.Vector3, radius: number, height: number, a0: number, a1: number, u: number, lookUp = 1): CamState {
  const a = a0 + (a1 - a0) * u;
  return {
    pos: center.clone().add(v(Math.sin(a) * radius, height, Math.cos(a) * radius)),
    look: center.clone().add(v(0, lookUp, 0)),
  };
}

/** Lähin seinän tai aidan vieressä oleva maan tason piilopaikka. */
function spotNear(w: World, x: number, z: number, kind = 'wall'): THREE.Vector3 {
  let best: any = null;
  let bd = Infinity;
  for (const s of w.town.spots) {
    if (s.kind !== kind || s.pos.y > 1) continue;
    const d = Math.hypot(s.pos.x - x, s.pos.z - z);
    if (d < bd) {
      bd = d;
      best = s;
    }
  }
  return best.pos.clone();
}

/** Lähetä piiloutuja juoksemaan paikkaan (ja jäämään sinne piiloon). */
function sendHider(w: World, name: string, to: THREE.Vector3, from?: THREE.Vector3): void {
  const b = brainOf(w, name);
  if (!b) return;
  const a = b.agent;
  if (from) a.place(from.x, from.y + 0.05, from.z, Math.atan2(-(to.x - from.x), -(to.z - from.z)));
  b.spot = { pos: to.clone(), kind: 'wall' };
  b.state = 'go';
  a.nav.go(a.pos, to);
}

/** Etsijä jahtaamaan piiloutujaa (alkaa tarvittaessa tietystä paikasta). */
function startChase(w: World, name: string, from?: THREE.Vector3): void {
  const s = w.round.seeker;
  if (!s) return;
  const target = agent(w, name);
  if (from) s.agent.place(from.x, from.y + 0.05, from.z, 0);
  if (s.state === 'count') return;
  s.startChase(target);
  brainOf(w, name)?.flee(s);
}

/** Piiloutuja saa apuvälineen (pakotettu laji). */
function power(w: World, name: string, kind: 'ghost' | 'speed' | 'decoy' | 'radar'): void {
  const orig = Math.random;
  const idx = ['ghost', 'speed', 'decoy'].indexOf(kind);
  Math.random = () => (idx + 0.5) / 3;
  w.round.givePower(agent(w, name));
  Math.random = orig;
}

/** Aarrelaatikko pakotettuun paikkaan. */
function placeCrate(w: World, p: THREE.Vector3): void {
  const L = w.round.loot;
  L.active = true;
  L.pos = p.clone();
  L.group.position.copy(p);
  L.group.visible = true;
}

const BASE = v(0, 0.15, 0);

// ---------- Tekstit ----------

interface Caption {
  at: number;
  until: number;
  text: string;
  size?: number;
  color?: string;
  y?: number;
  sub?: string;
}

const CAPTIONS: Caption[] = [
  { at: bar(4), until: bar(8) - 0.1, text: 'PIILOHIPPA', size: 190, color: '#ffd84a', y: 0.5, sub: 'VR · KÄNNYKKÄ · SELAIN' },
  { at: bar(16), until: bar(18), text: 'PIILOUDU!', size: 150, color: '#7dffa8' },
  { at: bar(18.5), until: bar(19.6), text: 'VALMIIT TAI EI –', size: 110, color: '#ffffff' },
  { at: bar(20), until: bar(22), text: 'TÄÄLTÄ TULLAAN!', size: 150, color: '#ffd84a' },
  { at: bar(28.2), until: bar(31.8), text: 'AARRELAATIKKO', size: 130, color: '#ffd84a', sub: 'löydä apuvälineitä' },
  { at: bar(32.2), until: bar(35.8), text: 'NÄKYMÄTTÖMYYS', size: 120, color: '#c7e6ff' },
  { at: bar(36.2), until: bar(39.8), text: 'PIKAJUOKSU', size: 130, color: '#ffb02e' },
  { at: bar(40.2), until: bar(44.8), text: 'ETSIJÄ NÄKEE SEINIEN LÄPI', size: 100, color: '#ff8a5c', sub: '30 sekunnin välein' },
  { at: bar(50.6), until: bar(52.4), text: 'JÄIT KIINNI?', size: 140, color: '#ff8a5c' },
  { at: bar(52.4), until: bar(54.4), text: 'NYT SINÄ ETSIT!', size: 150, color: '#ffd84a' },
  { at: bar(61.2), until: bar(64), text: 'TIK-TAK…', size: 120, color: '#ffffff' },
  { at: bar(69), until: bar(71), text: 'KAUPUNKI', size: 140, color: '#ffffff' },
  { at: bar(71), until: bar(73), text: 'KATOT', size: 140, color: '#ffffff' },
  { at: bar(73), until: bar(75), text: 'METSÄ', size: 140, color: '#7dffa8' },
  { at: bar(88), until: bar(90), text: 'PIILO-', size: 170, color: '#ffd84a' },
  { at: bar(90), until: bar(92), text: 'PIILO-', size: 170, color: '#7dffa8' },
  { at: bar(92), until: bar(96), text: 'PIILOHIPPA!', size: 190, color: '#ffd84a' },
  { at: bar(97), until: bar(99.5), text: 'LÖYSIN SUT!', size: 150, color: '#ff8a5c' },
  { at: bar(100), until: SONG_LENGTH, text: 'PIILOHIPPA', size: 200, color: '#ffd84a', y: 0.42, sub: 'Pelaa nyt selaimessa: willizilliw.github.io/vr-piilohippa' },
];

export function drawCaptions(c: CanvasRenderingContext2D, t: number, W: number, H: number): void {
  // Ohut elokuvamainen kehys
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H * 0.06);
  c.fillRect(0, H * 0.94, W, H * 0.06);
  // Loppuhäivytys
  if (t > SONG_LENGTH - 2.5) {
    c.fillStyle = `rgba(0,0,0,${THREE.MathUtils.clamp((t - (SONG_LENGTH - 2.5)) / 2, 0, 1)})`;
    c.fillRect(0, 0, W, H);
  }
  for (const cap of CAPTIONS) {
    if (t < cap.at || t > cap.until) continue;
    const k = t - cap.at;
    const left = cap.until - t;
    const alpha = Math.min(1, k / 0.12, left / 0.2);
    const pop = 1 + 0.25 * Math.exp(-k * 9);
    const size = (cap.size ?? 130) * pop;
    const y = H * (cap.y ?? 0.8);
    c.save();
    c.globalAlpha = alpha;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
    c.lineJoin = 'round';
    c.lineWidth = size * 0.12;
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.strokeText(cap.text, W / 2, y);
    c.fillStyle = cap.color ?? '#fff';
    c.fillText(cap.text, W / 2, y);
    if (cap.sub) {
      const s = 44;
      c.font = `700 ${s}px system-ui, sans-serif`;
      c.lineWidth = 8;
      c.strokeText(cap.sub, W / 2, y + size * 0.62);
      c.fillStyle = '#ffffff';
      c.fillText(cap.sub, W / 2, y + size * 0.62);
    }
    c.restore();
  }
}

// ---------- Otokset ----------

const shots: Omit<Shot, 'end'>[] = [
  // --- Intro: aula ---
  {
    start: 0, scene: 'lobby',
    cam: (u) => ({ pos: lerpV(v(0, 1.9, 4.6), v(0, 1.6, -1.6), ease(u)), look: v(0, 2.2, -6), fov: 55 }),
  },
  {
    start: bar(2), scene: 'lobby',
    cam: (u) => ({ pos: lerpV(v(-6, 0.5, -3.2), v(6, 0.5, -3.2), ease(u)), look: lerpV(v(-4, 2.6, -5.5), v(4, 2.6, -5.5), ease(u)), fov: 45 }),
  },
  // --- Säkeistö 1: kaupunki ---
  {
    start: bar(4), scene: 'town',
    cam: (u) => ({ pos: lerpV(v(-120, 70, 110), v(-40, 48, 60), u), look: lerpV(v(0, 0, 0), v(10, 0, -10), u), fov: 50 }),
  },
  {
    start: bar(8), scene: 'town',
    // Nosturi alas pesäpuulle; kierros alkaa (laskenta 20 s).
    cam: (u) => {
      const o = orbit(BASE, 28 - 18 * ease(u), 30 - 26 * ease(u), -0.6, 0.9, u, 2);
      return { ...o, fov: 50 };
    },
  },
  {
    start: bar(12), scene: 'town', smooth: 5,
    setup: (w) => sendHider(w, 'Aino', spotNear(w, -14, 30), v(-2, 0.15, 3)),
    cam: (_u, w) => ({ ...follow(agent(w, 'Aino'), 1.6, 1.4, -4.2, 1.1, 3), fov: 60 }),
  },
  {
    start: bar(16), scene: 'town',
    cam: (u, w) => {
      const s = seeker(w).pos;
      return { pos: s.clone().add(v(1.4 - u * 0.8, 0.35, 2.4)), look: s.clone().add(v(0, 1.75, 0)), fov: 42, roll: 0.05 };
    },
  },
  {
    start: bar(18), scene: 'town',
    setup: (w) => sendHider(w, 'Eetu', spotNear(w, 9, 17, 'bush'), v(6, 0.15, 6)),
    cam: (u, w) => {
      const a = agent(w, 'Eetu').pos;
      return { pos: a.clone().add(v(3.4 - u * 1.4, 1.1, 2.6 - u * 0.8)), look: a.clone().add(v(0, 0.6, 0)), fov: 45 };
    },
  },
  // --- Kertosäe 1 (etsintä alkaa) ---
  {
    start: bar(20), scene: 'town', smooth: 6,
    cam: (_u, w) => ({ ...follow(seeker(w), 0.8, 1.7, -3.2, 1.3, 4), fov: 62 }),
  },
  {
    start: bar(22), scene: 'town',
    cam: (u, w) => {
      const s = seeker(w).pos;
      const a = u * 1.4;
      return { pos: s.clone().add(v(Math.sin(a) * 4, 26, Math.cos(a) * 4)), look: s.clone(), fov: 55, roll: a };
    },
  },
  {
    start: bar(24), scene: 'town', smooth: 6,
    cam: (_u, w) => ({ ...follow(seeker(w), 3.2, 1.0, 0.5, 1.3, 2), fov: 52 }),
  },
  {
    start: bar(26), scene: 'town',
    setup: (w) => {
      const roof = w.town.spots.find((s: any) => s.kind === 'roof' && Math.hypot(s.pos.x, s.pos.z) < 40);
      const b = brainOf(w, 'Liisa');
      if (roof && b) {
        b.agent.place(roof.pos.x, roof.pos.y + 0.05, roof.pos.z, 0);
        b.spot = roof;
        b.state = 'hidden';
      }
    },
    cam: (u, w) => {
      const a = agent(w, 'Liisa').pos;
      return { ...orbit(a, 7, 3, 0.4, 2.2, u, 0.5), fov: 48 };
    },
  },
  // --- Säkeistö 2: aarrelaatikko ---
  {
    start: bar(28), scene: 'town',
    setup: (w) => placeCrate(w, v(-24, 0.15, 10)),
    cam: (u) => ({ pos: v(-24 + 3.5, 1 + 3 * ease(u), 10 + 3.5 + 2 * u), look: v(-24, 0.4 + 3.5 * ease(u), 10), fov: 55 }),
  },
  {
    start: bar(32), scene: 'town',
    setup: (w) => sendHider(w, 'Eetu', v(-24, 0.15, 10), v(-24, 0.15, 24)),
    tick: (w) => {
      // Laatikon avaus antaa näkymättömyyden (pakotettu, jotta kuva on varma).
      const a = agent(w, 'Eetu');
      const L = w.round.loot;
      if (L.pos && Math.hypot(a.pos.x - L.pos.x, a.pos.z - L.pos.z) < 2) {
        L.pos = null;
        L.group.visible = false;
        L.respawnT = 999;
        power(w, 'Eetu', 'ghost');
      }
    },
    cam: (u, w) => ({ ...orbit(agent(w, 'Eetu').pos, 2.6, 0.9, 2.4, 3.4, u, 0.8), fov: 46 }),
    smooth: 6,
  },
  {
    start: bar(36), scene: 'town', smooth: 6,
    setup: (w) => {
      const n = hiderName(w, ['Aino', 'Liisa']);
      sendHider(w, n, v(24, 0.15, -40), v(24, 0.15, 30));
      power(w, n, 'speed');
    },
    cam: (_u, w) => ({ ...follow(agent(w, hiderName(w, ['Aino', 'Liisa'])), 2.4, 1.0, 3.5, 1.2, 0), fov: 62 }),
  },
  {
    start: bar(40), scene: 'town',
    setup: (w) => {
      for (const h of w.round.hiders) w.round.addMarker(h.agent, 8);
    },
    cam: (u) => ({ pos: lerpV(v(10, 30, 70), v(0, 85, 40), ease(u)), look: v(0, 0, 0), fov: 55 }),
  },
  // --- Kertosäe: jahti ja kiinniotto ---
  {
    start: bar(45), scene: 'town', smooth: 5,
    setup: (w) => {
      const p = spotNear(w, 22, 3);
      sendHider(w, 'Aino', p, p);
      startChase(w, 'Aino', v(p.x - 7, 0.15, p.z + 2));
    },
    cam: (_u, w) => {
      const s = seeker(w).pos;
      const a = agent(w, 'Aino').pos;
      const mid = s.clone().lerp(a, 0.5);
      return { pos: mid.clone().add(v(5, 2.2, 5)), look: mid.add(v(0, 1, 0)), fov: 55 };
    },
  },
  {
    start: bar(48), scene: 'town', smooth: 6,
    cam: (_u, w) => ({ ...follow(agent(w, 'Aino'), -0.6, 1.0, 3.6, 1.3, -2), fov: 55 }),
  },
  {
    start: bar(50.5), scene: 'town',
    tick: (w) => {
      // Kiinniotto viimeistään tahdilla 51.5.
      if (w.time >= bar(51.5) && w.round.seeker?.agent.name !== 'Aino' && w.round.phase === 'seek') {
        w.round.onCaught(agent(w, 'Aino'));
      }
    },
    cam: (u, w) => {
      const a = agent(w, 'Aino').pos;
      return { pos: a.clone().add(v(2.2, 1.0 + u * 0.6, 2.2)), look: a.clone().add(v(0, 1.2, 0)), fov: 40 - u * 8 };
    },
  },
  // --- Kertosäe: montaasi (uusi etsijä laskee, muut juoksevat) ---
  {
    start: bar(52.5), scene: 'town',
    cam: (u, w) => {
      const s = seeker(w).pos;
      return { ...orbit(s, 5 - u, 1.2, 2.5, 3.6, u, 1.5), fov: 45 };
    },
  },
  {
    start: bar(54.5), scene: 'town', smooth: 5,
    setup: (w) => sendHider(w, 'Onni', v(86, 0.05, 40), v(86, 0.05, 10)),
    cam: (_u, w) => ({ ...follow(agent(w, 'Onni'), 2.2, 1.2, -3.5, 1.2, 4), fov: 62 }),
  },
  {
    start: bar(56.5), scene: 'town',
    setup: (w) => sendHider(w, 'Liisa', v(-30, 0.15, 25), v(-30, 0.15, 20)),
    cam: (u) => ({ pos: v(-24 - u * 10, 0.4, 24.5), look: v(-30 - u * 6, 1.0, 21), fov: 40 }),
  },
  {
    start: bar(58.5), scene: 'town',
    setup: (w) => {
      const l = w.town.ladders.find((x: any) => x.roof && Math.hypot(x.x, x.z) < 70);
      const b = brainOf(w, 'Eetu');
      if (!l || !b) return;
      const roof = w.town.spots.find((s: any) => s.kind === 'roof' && s.ladder === l);
      b.agent.place(l.base.x + l.nx * 2, 0.2, l.base.z + l.nz * 2, 0);
      b.spot = roof ?? null;
      b.state = 'go';
      b.agent.nav.go(b.agent.pos, roof?.pos ?? v(l.x - l.nx * 3, l.top, l.z - l.nz * 3));
      w.round.__ladder = l;
    },
    cam: (u, w) => {
      const l = w.round.__ladder;
      if (!l) return { pos: v(0, 40, 40), look: v(0, 0, 0) };
      const base = v(l.x, 0, l.z);
      return { pos: base.clone().add(v(l.nx * 6 + l.nz * 3, 1 + u * 5, l.nz * 6 + l.nx * 3)), look: base.add(v(0, 2 + u * 4, 0)), fov: 50 };
    },
  },
  // --- Silta: tik-tak ---
  {
    start: bar(61), scene: 'town',
    setup: (w) => sendHider(w, 'Liisa', spotNear(w, -40, -26), spotNear(w, -40, -26)),
    cam: (u, w) => ({ ...orbit(agent(w, 'Liisa').pos, 3.2, 0.9, -0.4, 0.6, u, 0.7), fov: 40 }),
  },
  {
    start: bar(65), scene: 'town',
    cam: (u, w) => ({ ...orbit(seeker(w).pos, 3.6 - u, 1.6, 0.3, 1.3, u, 1.6), fov: 40 }),
  },
  {
    start: bar(68), scene: 'town', smooth: 8,
    setup: (w) => sendHider(w, 'Liisa', spotNear(w, -40, -46)),
    cam: (_u, w) => ({ ...follow(agent(w, 'Liisa'), 0.8, 1.6, -2.6, 1.2, 3), fov: 70, roll: -0.08 }),
  },
  // --- Kertosäe: kaupunki, katot, metsä ---
  {
    start: bar(69), scene: 'town',
    cam: (u) => ({ pos: lerpV(v(-72, 2.2, -60), v(-72, 2.2, 40), u), look: lerpV(v(-60, 1.5, -40), v(-60, 1.5, 60), u), fov: 55 }),
  },
  {
    start: bar(71), scene: 'town',
    cam: (u) => ({ pos: lerpV(v(30, 22, 60), v(70, 18, 30), ease(u)), look: v(48, 6, 48), fov: 50 }),
  },
  {
    start: bar(73), scene: 'town', smooth: 5,
    setup: (w) => sendHider(w, 'Onni', v(-88, 0.05, 30), v(-88, 0.05, -20)),
    cam: (_u, w) => ({ ...follow(agent(w, 'Onni'), -2.5, 1.3, 2.5, 1.2, -2), fov: 60 }),
  },
  {
    start: bar(75), scene: 'town',
    cam: (u) => ({ ...orbit(BASE, 55, 38, 2, 3.2, u, 0), fov: 50 }),
  },
  // --- Välisoitto: rauhalliset ajot ---
  {
    start: bar(77), scene: 'town',
    cam: (u) => ({ pos: lerpV(v(84, 1.4, -70), v(84, 1.4, -20), u), look: lerpV(v(70, 2, -55), v(70, 2, -5), u), fov: 50 }),
  },
  {
    start: bar(81), scene: 'town',
    cam: (u) => ({ pos: lerpV(v(-40, 12, -92), v(12, 40, -96), ease(u)), look: v(0, 6, -48), fov: 48 }),
  },
  {
    start: bar(85), scene: 'town',
    cam: (u, w) => {
      const s = seeker(w).pos;
      return { pos: s.clone().add(v(0, 1.6, 0)).add(v(14 - 10 * ease(u), 0.2, 14 - 10 * ease(u))), look: s.clone().add(v(0, 1.5, 0)), fov: 45 - 10 * u };
    },
  },
  // --- Viimeinen kertosäe: nopeat leikkaukset ---
  {
    start: bar(88), scene: 'town', smooth: 6,
    setup: (w) => {
      const n = hiderName(w, ['Eetu', 'Liisa', 'Onni']);
      const p = spotNear(w, 4, -24);
      sendHider(w, n, v(30, 0.15, -24), p);
      startChase(w, n, v(p.x - 6, 0.15, p.z));
      w.round.__chased = n;
    },
    cam: (_u, w) => ({ ...follow(seeker(w), 1.0, 0.6, 3.6, 1.4, 0), fov: 60 }),
  },
  {
    start: bar(89), scene: 'town', smooth: 6,
    cam: (_u, w) => ({ ...follow(agent(w, w.round.__chased), -1.2, 1.2, 3, 1.2, -1), fov: 60 }),
  },
  {
    start: bar(90), scene: 'town',
    setup: (w) => placeCrate(w, v(24, 0.15, -12)),
    cam: (u) => ({ ...orbit(v(24, 0.15, -12), 3.5, 1 + u * 3, 0, 1.2, u, 0.6), fov: 50 }),
  },
  {
    start: bar(91), scene: 'town',
    cam: (u) => ({ pos: v(-24 + u * 4, 0.3, -30), look: v(-24 + u * 4, 1.2, -18), fov: 60 }),
  },
  {
    start: bar(92), scene: 'town', smooth: 6,
    cam: (_u, w) => ({ ...follow(seeker(w), 2.4, 1.6, -2.4, 1.3, 4), fov: 55 }),
  },
  {
    start: bar(93), scene: 'town',
    cam: (u, w) => {
      const s = seeker(w).pos;
      return { pos: s.clone().add(v(Math.sin(u * 3) * 6, 14 + u * 8, Math.cos(u * 3) * 6)), look: s.clone(), fov: 55, roll: u * 0.5 };
    },
  },
  {
    start: bar(94), scene: 'town', smooth: 6,
    cam: (_u, w) => ({ ...follow(agent(w, w.round.__chased), 1.4, 0.4, 2.6, 1.4, -1), fov: 64, roll: 0.06 }),
  },
  {
    start: bar(95), scene: 'town',
    cam: (u) => ({ ...orbit(BASE, 18, 6, 0, 2.2, u, 3), fov: 55 }),
  },
  // --- Outro: kiinniotto ja loppukuva ---
  {
    start: bar(96), scene: 'town',
    setup: (w) => {
      const n = w.round.__chased;
      const a = agent(w, n);
      if (w.round.seeker && w.round.phase === 'seek') {
        w.round.seeker.agent.place(a.pos.x - 7, a.pos.y + 0.05, a.pos.z, 0);
        w.round.seeker.startChase(a);
      }
    },
    tick: (w) => {
      const n = w.round.__chased;
      if (w.time >= bar(97.2) && w.round.seeker?.agent.name !== n && w.round.phase === 'seek') w.round.onCaught(agent(w, n));
    },
    cam: (u, w) => {
      const a = agent(w, w.round.__chased).pos;
      return { pos: a.clone().add(v(-2.6, 1.2, 2.6)), look: a.clone().add(v(0, 1.2, 0)), fov: 40 - u * 10 };
    },
  },
  {
    start: bar(99.5), scene: 'town',
    cam: (u) => ({ pos: lerpV(v(10, 4, 12), v(70, 70, 110), easeOut(u)), look: lerpV(v(0, 3, 0), v(0, 0, 0), u), fov: 50 }),
  },
];

export const SHOTS: Shot[] = shots.map((s, i) => ({ ...s, end: shots[i + 1]?.start ?? SONG_LENGTH }));
