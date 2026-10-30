/**
 * Trailerin kuvausmoottori. Ajaa pelin oikeaa kaupunkia ja tekoälyä,
 * liikuttaa kameraa käsikirjoituksen (shots.ts) mukaan biisin tahdissa
 * ja tallentaa kuvan ja äänen videoksi (MediaRecorder → .webm).
 *
 * Simulaatio etenee kiinteällä 1/60 s askeleella ja satunnaisluvut on
 * siemennetty, joten sama hetki näyttää aina samalta: esikatselun voi
 * aloittaa mistä kohdasta tahansa.
 */
import * as THREE from 'three';
import { HeadTracker } from '../src/head';
import { Hud } from '../src/hud';
import { Input } from '../src/input';
import { Lobby } from '../src/lobby';
import { Player } from '../src/player';
import { defaultSettings } from '../src/settings';
import { rng } from '../src/textures';
import { Town } from '../src/town';
import { View } from '../src/view';
import { drawCaptions, SHOTS, SONG_LENGTH, type Shot, type World } from './shots';

const W = 1920;
const H = 1080;
const STEP = 1 / 60;
/** Kierros (laskenta) alkaa tästä hetkestä, jotta etsintä alkaa kertosäkeen kohdalla. */
const ROUND_START = 13.0;

const out = document.getElementById('out') as HTMLCanvasElement;
const ctx2d = out.getContext('2d')!;
const panel = document.getElementById('panel')!;
const status = document.getElementById('status')!;
const params = new URLSearchParams(location.search);
const scale = Number(params.get('scale') ?? 1);
out.width = W * scale;
out.height = H * scale;

// ---------- Peli ilman omaa silmukkaa ----------

let world: World;
let simTime = 0;
let shotIndex = -1;
const cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 600);
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let view: View;

function setup(): void {
  // Siemennetty satunnaisuus: tekoäly toimii joka kerta samoin.
  Math.random = rng(4242);
  simTime = 0;
  shotIndex = -1;
  view?.renderer.dispose();
  view = new View(false);
  view.renderer.domElement.style.display = 'none';
  const settings = defaultSettings('flat');
  settings.quality = 'high';
  view.applySettings(settings);
  view.renderer.setPixelRatio(1);
  view.renderer.setSize(out.width, out.height);
  const input = new Input();
  const head = new HeadTracker('mouse', view.renderer.domElement);
  const player = new Player(view, head, input);
  const hud = new Hud(view.camera);
  const town = new Town(view.renderer, 'hider', { view, input, settings, hud, player, exit: () => {} });
  town.scene.add(view.rig);
  const lobby = new Lobby(view.renderer, cam, input, () => {});
  const round = (town as any).round;
  // Pelaaja ei ole kuvassa: syrjään ja etsijälle näkymättömäksi.
  player.spawn(-94, 0, -94, 0);
  round.me.invisible = true;
  world = { town, lobby, round, player, time: 0, started: false };
}

/** Simuloi seuraavaan hetkeen. Otosten valmistelut ajetaan oikealla hetkellä. */
function simulateTo(t: number): void {
  while (simTime + STEP <= t) {
    simTime += STEP;
    world.time = simTime;
    const i = shotAt(simTime);
    if (i !== shotIndex) {
      for (let k = shotIndex + 1; k <= i; k++) SHOTS[k].setup?.(world);
      shotIndex = i;
    }
    if (simTime >= ROUND_START) {
      world.started = true;
      world.town.update(STEP, world.player);
    } else {
      world.town.traffic.update(STEP, world.round.actorPositions());
    }
    if (SHOTS[i]?.scene === 'lobby') world.lobby.update(STEP, world.player);
    SHOTS[i]?.tick?.(world, STEP);
  }
}

function shotAt(t: number): number {
  let i = 0;
  while (i + 1 < SHOTS.length && SHOTS[i + 1].start <= t) i++;
  return i;
}

let lastShot = -1;
function render(t: number): void {
  const i = shotAt(t);
  const shot: Shot = SHOTS[i];
  const u = THREE.MathUtils.clamp((t - shot.start) / (shot.end - shot.start), 0, 1);
  const c = shot.cam(u, world, t - shot.start);
  // Seurantaotoksissa pehmennys; leikkauksessa kamera hyppää suoraan.
  if (i !== lastShot || !shot.smooth) {
    camPos.copy(c.pos);
    camLook.copy(c.look);
  } else {
    const k = 1 - Math.exp(-shot.smooth / 60);
    camPos.lerp(c.pos, k);
    camLook.lerp(c.look, k);
  }
  lastShot = i;
  cam.fov = c.fov ?? 50;
  cam.aspect = W / H;
  cam.updateProjectionMatrix();
  cam.position.copy(camPos);
  cam.up.set(Math.sin(c.roll ?? 0), Math.cos(c.roll ?? 0), 0);
  cam.lookAt(camLook);

  const scene = shot.scene === 'lobby' ? world.lobby.scene : world.town.scene;
  if (shot.scene !== 'lobby') (world.town as any).outdoor.follow(camLook);
  const r = view.renderer;
  // View muuttaa kokoa ikkunan mukana; trailerissa koko on kiinteä.
  if (r.domElement.width !== out.width || r.domElement.height !== out.height) r.setSize(out.width, out.height);
  r.shadowMap.needsUpdate = true;
  r.render(scene, cam);

  ctx2d.drawImage(r.domElement, 0, 0, out.width, out.height);
  ctx2d.save();
  ctx2d.scale(scale, scale);
  drawCaptions(ctx2d, t, W, H);
  ctx2d.restore();
}

// ---------- Toisto ja tallennus ----------

let audioBuf: AudioBuffer | null = null;
const actx = new AudioContext();
let running = false;

// Biisi ladataan repon kansiosta; tiedostovalitsimella voi vaihtaa toiseen.
void (async () => {
  try {
    const res = await fetch('./Piilo-piilo-piilohippa.mp3');
    if (!res.ok) throw new Error(String(res.status));
    audioBuf = await actx.decodeAudioData(await res.arrayBuffer());
    status.textContent = `Biisi valmis (${audioBuf.duration.toFixed(1)} s).`;
  } catch {
    status.textContent = 'Valitse biisi.';
  }
})();

(document.getElementById('song') as HTMLInputElement).addEventListener('change', async (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  status.textContent = 'Luetaan biisiä…';
  audioBuf = await actx.decodeAudioData(await f.arrayBuffer());
  status.textContent = `Biisi valmis (${audioBuf.duration.toFixed(1)} s).`;
});

async function run(record: boolean): Promise<void> {
  if (!audioBuf) {
    status.textContent = 'Valitse ensin biisi.';
    return;
  }
  const from = record ? 0 : Number((document.getElementById('from') as HTMLInputElement).value) || 0;
  status.textContent = 'Valmistellaan…';
  await new Promise((r) => setTimeout(r, 30));
  setup();
  simulateTo(from);
  render(from);

  await actx.resume();
  const src = actx.createBufferSource();
  src.buffer = audioBuf;
  src.connect(actx.destination);
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  if (record) {
    const dest = actx.createMediaStreamDestination();
    src.connect(dest);
    const stream = new MediaStream([...out.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
    const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m))!;
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16_000_000 });
    recorder.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    recorder.start(1000);
  }
  const t0 = actx.currentTime + 0.1;
  src.start(t0, from);
  running = true;
  panel.classList.add('hidden');

  const end = Math.min(SONG_LENGTH, audioBuf.duration);
  await new Promise<void>((done) => {
    const frame = () => {
      const t = from + actx.currentTime - t0;
      if (!running || t >= end) return done();
      if (t >= from) {
        simulateTo(t);
        render(t);
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  running = false;
  src.stop();
  panel.classList.remove('hidden');
  if (recorder) {
    await new Promise((r) => {
      recorder!.onstop = r;
      recorder!.stop();
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    a.download = 'piilohippa-traileri.webm';
    a.click();
    status.textContent = 'Valmis: piilohippa-traileri.webm ladattiin.';
  } else {
    status.textContent = 'Esikatselu päättyi.';
  }
}

document.getElementById('play')!.addEventListener('click', () => void run(false));
document.getElementById('rec')!.addEventListener('click', () => void run(true));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') running = false;
});

// Testejä varten: piirrä yksittäinen hetki ilman ääntä (esim. headless-selaimessa).
(window as any).trailer = {
  frameAt(t: number): string {
    if (!world || t < simTime) setup();
    simulateTo(t);
    render(t);
    return out.toDataURL('image/jpeg', 0.85);
  },
  shots: SHOTS,
  world: () => world,
};
