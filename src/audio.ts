import * as THREE from 'three';

/**
 * Äänet. Kaikki äänet syntetisoidaan Web Audio -rajapinnalla, joten
 * tiedostoja ei ladata. Jokaisella tapahtumalla on oma selvästi erottuva
 * sävynsä. Hahmojen ja autojen äänet ovat 3D-ääniä (HRTF): kuulokkeilla
 * kuulee, mistä suunnasta etsijän askeleet tulevat.
 *
 * Kaikki metodit ovat turvallisia kutsua ennen init()-kutsua – silloin ne
 * eivät tee mitään.
 */

type Wave = OscillatorType;

interface ToneOpts {
  f: number;
  /** Liu'uta taajuus tähän äänen aikana. */
  f2?: number;
  dur: number;
  type?: Wave;
  vol?: number;
  /** Viive sekunteina. */
  at?: number;
  attack?: number;
  pos?: THREE.Vector3;
  ref?: number;
}

interface NoiseOpts {
  dur: number;
  freq: number;
  f2?: number;
  q?: number;
  filter?: BiquadFilterType;
  vol?: number;
  at?: number;
  attack?: number;
  pos?: THREE.Vector3;
  ref?: number;
}

export type StepKind = 'player' | 'seeker' | 'hider';

/** Moottorin ääni yhdelle autolle. */
export interface EngineVoice {
  update(pos: THREE.Vector3, speed: number): void;
  stop(): void;
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI-numero → Hz

class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private bus!: GainNode;
  private ambient!: GainNode;
  private noiseBuf!: AudioBuffer;
  private volume = 0.8;
  private birdsTimer = 0;
  private outdoor = false;
  private readonly listenerPos = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly fwd = new THREE.Vector3();
  private readonly up = new THREE.Vector3();

  /** Käynnistä äänet. Kutsuttava käyttäjän painalluksesta (selaimen vaatimus). */
  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    this.bus = ctx.createGain();
    this.bus.connect(this.master);
    this.ambient = ctx.createGain();
    this.ambient.gain.value = 0;
    this.ambient.connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    this.startWind();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void ctx.resume();
    });
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  /** Ulkona tuuli ja linnut, sisällä hiljaista. */
  setOutdoor(on: boolean): void {
    this.outdoor = on;
    if (this.ctx) this.ambient.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.8);
  }

  /** Kuuntelija seuraa kameraa (pään asentoa). */
  updateListener(camera: THREE.Camera, dt: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    camera.getWorldPosition(this.listenerPos);
    camera.getWorldQuaternion(this.tmpQ);
    this.fwd.set(0, 0, -1).applyQuaternion(this.tmpQ);
    this.up.set(0, 1, 0).applyQuaternion(this.tmpQ);
    const l = ctx.listener;
    const p = this.listenerPos;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(this.fwd.x, t);
      l.forwardY.setValueAtTime(this.fwd.y, t);
      l.forwardZ.setValueAtTime(this.fwd.z, t);
      l.upX.setValueAtTime(this.up.x, t);
      l.upY.setValueAtTime(this.up.y, t);
      l.upZ.setValueAtTime(this.up.z, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(this.fwd.x, this.fwd.y, this.fwd.z, this.up.x, this.up.y, this.up.z);
    }

    // Linnut laulavat satunnaisesti puiden suunnalla.
    if (this.outdoor) {
      this.birdsTimer -= dt;
      if (this.birdsTimer <= 0) {
        this.birdsTimer = 3 + Math.random() * 6;
        const a = Math.random() * Math.PI * 2;
        const r = 12 + Math.random() * 20;
        this.bird(new THREE.Vector3(p.x + Math.cos(a) * r, 6 + Math.random() * 4, p.z + Math.sin(a) * r));
      }
    }
  }

  // ---------- perusrakennuspalat ----------

  private out(pos: THREE.Vector3 | undefined, ref = 3, bus?: AudioNode): AudioNode {
    const ctx = this.ctx!;
    const target = bus ?? this.bus;
    if (!pos) return target;
    const p = new PannerNode(ctx, {
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      refDistance: ref,
      maxDistance: 120,
      rolloffFactor: 1.3,
      positionX: pos.x,
      positionY: pos.y,
      positionZ: pos.z,
    });
    p.connect(target);
    return p;
  }

  private env(g: GainNode, t: number, vol: number, attack: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  private tone(o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    const g = ctx.createGain();
    this.env(g, t, o.vol ?? 0.2, o.attack ?? 0.005, o.dur);
    osc.connect(g).connect(this.out(o.pos, o.ref));
    osc.start(t);
    osc.stop(t + o.dur + 0.05);
  }

  private noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime + (o.at ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter ?? 'bandpass';
    f.frequency.setValueAtTime(o.freq, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    f.Q.value = o.q ?? 1;
    const g = ctx.createGain();
    this.env(g, t, o.vol ?? 0.2, o.attack ?? 0.003, o.dur);
    src.connect(f).connect(g).connect(this.out(o.pos, o.ref));
    src.start(t, Math.random() * 1.5);
    src.stop(t + o.dur + 0.05);
  }

  private startWind(): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    // Hidas puuskittelu
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.13;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(g.gain);
    src.connect(f).connect(g).connect(this.ambient);
    src.start();
    lfo.start();
  }

  private bird(pos: THREE.Vector3): void {
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      this.tone({ f: base, f2: base * 1.35, dur: 0.08, vol: 0.06, at: i * 0.13, pos, ref: 6, type: 'sine' });
    }
  }

  // ---------- Valikko ja aula ----------

  /** Valikossa liikkuminen: lyhyt naksahdus. */
  uiMove(): void {
    this.tone({ f: 1050, dur: 0.035, type: 'square', vol: 0.06 });
  }
  /** Asetuksen arvon muutos: pieni nouseva piipaus. */
  uiChange(up: boolean): void {
    this.tone({ f: up ? 700 : 900, f2: up ? 1000 : 600, dur: 0.07, type: 'triangle', vol: 0.12 });
  }
  /** Valinta: kaksi nousevaa nuottia. */
  uiSelect(): void {
    this.tone({ f: NOTE(76), dur: 0.08, type: 'triangle', vol: 0.16 });
    this.tone({ f: NOTE(83), dur: 0.12, type: 'triangle', vol: 0.16, at: 0.07 });
  }
  /** Valikko auki / kiinni: suhahdus ylös tai alas. */
  uiOpen(open: boolean): void {
    this.noise({ dur: 0.18, freq: open ? 500 : 2500, f2: open ? 2500 : 500, q: 2, vol: 0.12 });
  }
  /** Katse osuu porttiin: kirkas kilahdus. */
  gateHover(): void {
    this.tone({ f: NOTE(91), dur: 0.25, vol: 0.06 });
  }
  /** Rooli valittu: kimalteleva arpeggio ja humahdus. */
  gateEnter(seeker: boolean): void {
    const notes = seeker ? [60, 63, 67, 72] : [60, 64, 67, 72];
    notes.forEach((n, i) => this.tone({ f: NOTE(n + 12), dur: 0.35, type: 'triangle', vol: 0.16, at: i * 0.08 }));
    this.noise({ dur: 0.8, freq: 300, f2: 3000, q: 0.8, vol: 0.12, attack: 0.3 });
  }

  // ---------- Kierros ----------

  /** Laskennan sekuntipiippaus; viimeiset sekunnit korkeammalla. */
  countBeep(final: boolean): void {
    this.tone({ f: final ? 880 : 520, dur: final ? 0.18 : 0.1, type: 'sine', vol: final ? 0.22 : 0.12 });
  }
  /** "Valmiit tai ei, täältä tullaan!" – torvimainen sointu. */
  go(): void {
    for (const n of [57, 61, 64, 69]) {
      this.tone({ f: NOTE(n), dur: 0.9, type: 'sawtooth', vol: 0.07, attack: 0.03 });
    }
    this.noise({ dur: 0.5, freq: 900, q: 0.7, vol: 0.06, attack: 0.02 });
  }
  /** 30 sekuntia jäljellä: tik-tak. */
  timeWarning(): void {
    this.tone({ f: 1500, dur: 0.04, type: 'square', vol: 0.12 });
    this.tone({ f: 1100, dur: 0.04, type: 'square', vol: 0.12, at: 0.35 });
    this.tone({ f: 1500, dur: 0.04, type: 'square', vol: 0.12, at: 0.7 });
    this.tone({ f: 1100, dur: 0.04, type: 'square', vol: 0.12, at: 1.05 });
  }
  /** Pelaaja löysi piiloutujan: kirkas nouseva fanfaari. */
  foundHider(pos?: THREE.Vector3): void {
    [72, 76, 79, 84].forEach((n, i) => this.tone({ f: NOTE(n), dur: 0.16, type: 'square', vol: 0.09, at: i * 0.07 }));
    if (pos) this.tone({ f: 500, f2: 260, dur: 0.3, type: 'triangle', vol: 0.4, at: 0.05, pos, ref: 3 }); // piiloutujan "voi ei"
  }
  /** Tietokoneen etsijä sai jonkun toisen kiinni: kaksi laskevaa matalaa nuottia. */
  otherCaught(pos?: THREE.Vector3): void {
    this.tone({ f: NOTE(67), dur: 0.25, type: 'triangle', vol: 0.18 });
    this.tone({ f: NOTE(63), dur: 0.45, type: 'triangle', vol: 0.18, at: 0.22 });
    if (pos) this.tone({ f: 500, f2: 260, dur: 0.3, type: 'triangle', vol: 0.4, pos, ref: 3 });
  }
  /** Pelaaja jäi kiinni: laskeva "vaa-vaa". */
  playerCaught(): void {
    this.tone({ f: 330, f2: 220, dur: 0.45, type: 'sawtooth', vol: 0.12 });
    this.tone({ f: 260, f2: 110, dur: 0.9, type: 'sawtooth', vol: 0.12, at: 0.45 });
  }
  /** Etsijä näki sinut: kaksisävyinen hälytys – kuuluu selvästi kaiken yli. */
  spotted(): void {
    for (let i = 0; i < 3; i++) {
      this.tone({ f: 880, dur: 0.12, type: 'square', vol: 0.13, at: i * 0.26 });
      this.tone({ f: 1175, dur: 0.12, type: 'square', vol: 0.13, at: i * 0.26 + 0.13 });
    }
  }
  /** Etsijä kuuli jotain: nouseva "hm?" etsijän suunnalta. */
  heard(pos: THREE.Vector3): void {
    this.tone({ f: 220, f2: 330, dur: 0.35, type: 'sawtooth', vol: 0.25, pos, ref: 4, attack: 0.04 });
  }
  /** Etsijä sai tietää sijaintisi: kaikuluotaimen "ping" ja matala jälkikaiku. */
  revealed(): void {
    this.tone({ f: 1400, f2: 1300, dur: 0.6, type: 'sine', vol: 0.18 });
    this.tone({ f: 700, f2: 650, dur: 0.9, type: 'sine', vol: 0.08, at: 0.25 });
  }
  /** Voitto: duurifanfaari. */
  win(): void {
    const seq = [[60, 0], [64, 0.15], [67, 0.3], [72, 0.45], [67, 0.65], [72, 0.8]] as const;
    for (const [n, t] of seq) this.tone({ f: NOTE(n + 12), dur: 0.3, type: 'square', vol: 0.09, at: t });
    for (const n of [60, 64, 67, 72]) this.tone({ f: NOTE(n), dur: 1.4, type: 'triangle', vol: 0.08, at: 0.8 });
  }
  /** Häviö: laskeva molliaihe. */
  lose(): void {
    const seq = [[67, 0], [66, 0.3], [65, 0.6], [64, 0.9]] as const;
    for (const [n, t] of seq) this.tone({ f: NOTE(n), dur: t === 0.9 ? 1.2 : 0.3, type: 'sawtooth', vol: 0.08, at: t });
  }

  // ---------- Liikkuminen ----------

  /**
   * Askel. Pelaajan omat askeleet ovat hiljaisia; etsijän askeleet ovat
   * raskaita ja matalia, piiloutujien kevyitä – ne erottaa toisistaan.
   */
  step(kind: StepKind, pos?: THREE.Vector3, running = false): void {
    const k = running ? 1.5 : 1;
    if (kind === 'player') {
      this.noise({ dur: 0.07, freq: 500, q: 0.8, filter: 'lowpass', vol: 0.05 * k });
    } else if (kind === 'seeker') {
      this.noise({ dur: 0.1, freq: 260, q: 1, filter: 'lowpass', vol: 0.5 * k, pos, ref: 2.5 });
      this.tone({ f: 85, f2: 55, dur: 0.1, vol: 0.4 * k, pos, ref: 2.5 });
    } else {
      this.noise({ dur: 0.05, freq: 1800, q: 1.2, vol: 0.18 * k, pos, ref: 2 });
    }
  }
  /** Hyppy: nouseva vihellys. */
  jump(): void {
    this.tone({ f: 280, f2: 560, dur: 0.14, type: 'triangle', vol: 0.12 });
  }
  /** Alastulo: tömähdys, voimakkuus pudotuksen mukaan. */
  land(impact: number): void {
    const v = Math.min(1, impact / 12);
    this.noise({ dur: 0.12 + v * 0.1, freq: 220, filter: 'lowpass', vol: 0.12 + v * 0.3 });
    this.tone({ f: 70, f2: 40, dur: 0.15 + v * 0.1, vol: 0.15 + v * 0.3 });
  }
  /** Tikkaiden askelma: metallinen kilahdus. */
  ladder(pos?: THREE.Vector3): void {
    this.tone({ f: 1250, dur: 0.07, type: 'square', vol: 0.05, pos, ref: 3 });
    this.tone({ f: 1870, dur: 0.05, type: 'sine', vol: 0.05, pos, ref: 3 });
  }
  /** Reunalle kiipeäminen: raapaisu. */
  climb(): void {
    this.noise({ dur: 0.3, freq: 900, f2: 300, q: 1.5, vol: 0.14 });
  }

  // ---------- Autot ----------

  /** Tööttäys: kaksi samanaikaista säveltä auton suunnalta. */
  horn(pos: THREE.Vector3): void {
    this.tone({ f: 415, dur: 0.45, type: 'square', vol: 0.12, pos, ref: 6, attack: 0.01 });
    this.tone({ f: 523, dur: 0.45, type: 'square', vol: 0.12, pos, ref: 6, attack: 0.01 });
  }

  /** Jatkuva moottorin hurina, joka seuraa autoa. */
  engine(): EngineVoice | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 45;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    const g = ctx.createGain();
    g.gain.value = 0;
    const panner = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 4, maxDistance: 120, rolloffFactor: 1.6 });
    osc.connect(f).connect(g).connect(panner).connect(this.ambient);
    osc.start();
    return {
      update: (pos, speed) => {
        const t = ctx.currentTime;
        panner.positionX.setValueAtTime(pos.x, t);
        panner.positionY.setValueAtTime(0.6, t);
        panner.positionZ.setValueAtTime(pos.z, t);
        osc.frequency.setTargetAtTime(38 + speed * 5, t, 0.2);
        g.gain.setTargetAtTime(0.06 + speed * 0.012, t, 0.2);
      },
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        osc.stop(ctx.currentTime + 0.5);
      },
    };
  }
}

export const sfx = new Sfx();

/** Mitä liikeäänet tarvitsevat hahmosta (Body täyttää tämän). */
interface Moving {
  readonly pos: THREE.Vector3;
  readonly grounded: boolean;
  readonly onLadder: boolean;
  readonly running: boolean;
  readonly crouching: boolean;
  readonly climbingLedge: boolean;
  readonly actualSpeed: number;
  readonly vy: number;
}

/**
 * Askeleet, hyppy, alastulo, tikkaat ja reunalle kiipeäminen yhdelle hahmolle.
 * Kyykyssä hiivitään äänettömästi.
 */
export class MotionSounds {
  private stepAcc = 0;
  private ladderAcc = 0;
  private fall = 0;
  private wasGrounded = true;
  private wasLedge = false;

  constructor(private readonly kind: StepKind) {}

  update(dt: number, b: Moving): void {
    const pos = this.kind === 'player' ? undefined : b.pos;
    const me = this.kind === 'player';

    if (b.grounded && !b.onLadder && !b.crouching) {
      this.stepAcc += b.actualSpeed * dt;
      const stride = b.running ? 0.95 : 0.7;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        sfx.step(this.kind, pos, b.running);
      }
    }

    if (!b.grounded && !b.onLadder) this.fall = Math.max(this.fall, -b.vy);
    if (b.grounded && !this.wasGrounded) {
      if (me && this.fall > 3) sfx.land(this.fall);
      else if (!me && this.fall > 3) sfx.step(this.kind, pos, true);
    }
    if (b.grounded || b.onLadder) this.fall = 0;
    if (me && this.wasGrounded && !b.grounded && b.vy > 4) sfx.jump();

    if (b.onLadder) {
      this.ladderAcc += Math.abs(b.vy) * dt;
      if (this.ladderAcc > 0.3) {
        this.ladderAcc = 0;
        sfx.ladder(pos);
      }
    }
    if (me && b.climbingLedge && !this.wasLedge) sfx.climb();

    this.wasGrounded = b.grounded;
    this.wasLedge = b.climbingLedge;
  }
}
