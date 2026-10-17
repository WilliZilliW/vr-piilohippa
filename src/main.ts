import * as THREE from 'three';
import { HeadTracker } from './head';
import { Input } from './input';
import { Lobby } from './lobby';
import { Menu } from './menu';
import { Player } from './player';
import type { GameScene, Role } from './scene';
import { loadSettings, saveSettings } from './settings';
import { TextPanel, type TextLine } from './text';
import { Town } from './town';
import { View } from './view';

const startScreen = document.getElementById('start')!;
document.getElementById('btn-vr')!.addEventListener('click', () => start(true));
document.getElementById('btn-flat')!.addEventListener('click', () => start(false));

async function enterVrMode(): Promise<void> {
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
  } catch { /* ei koko näyttöä */ }
  try {
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch { /* lukitus ei tuettu */ }
  const requestWakeLock = async () => {
    try {
      await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<unknown> } }).wakeLock?.request('screen');
    } catch { /* ei haittaa */ }
  };
  await requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
}

function start(vr: boolean): void {
  startScreen.style.display = 'none';
  if (vr) void enterVrMode();

  const settings = loadSettings(vr);
  const view = new View(vr);
  const input = new Input();
  const head = new HeadTracker(vr ? 'sensor' : 'mouse', view.renderer.domElement);
  const player = new Player(view, head, input);

  // Ilmoitukset katseen edessä
  const hud = new TextPanel({ width: 1.3, height: 0.42, overlay: true, pxPerMeter: 500 });
  hud.mesh.position.set(0, -0.25, -1.5);
  hud.mesh.visible = false;
  view.camera.add(hud.mesh);
  let hudTimer = 0;
  const showHud = (lines: TextLine[], seconds: number) => {
    hud.setText(lines);
    hud.mesh.visible = true;
    hudTimer = seconds;
  };

  let current: GameScene;
  let pending: (() => GameScene) | null = null;
  let inLevel = false;

  const applySettings = () => {
    view.applySettings(settings);
    current?.applyQuality(settings.quality);
    saveSettings(vr, settings);
  };

  const enter = (scene: GameScene) => {
    if (current) {
      current.scene.remove(view.rig);
      current.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      current.dispose();
    }
    current = scene;
    current.scene.add(view.rig);
    current.applyQuality(settings.quality);
    player.spawn(scene.spawn.x, scene.spawn.y, scene.spawn.z, scene.spawn.yaw);
    view.fadeIn();
  };

  const goTo = (factory: () => GameScene) => {
    pending = factory;
    view.fadeOut();
  };

  const makeLobby = (): GameScene => {
    inLevel = false;
    view.setReticleVisible(true);
    return new Lobby(view.renderer, view.camera, input, (role) => goTo(() => makeTown(role)));
  };

  const makeTown = (role: Role): GameScene => {
    inLevel = true;
    view.setReticleVisible(false);
    const town = new Town(view.renderer, role);
    showHud([
      { text: role === 'seeker' ? 'Olet ETSIJÄ' : 'Olet PIILOUTUJA', size: 80, bold: true, color: role === 'seeker' ? '#ff8a5c' : '#7dffa8' },
      { text: 'Tikkailla ja Y-napilla pääset katoille', size: 36 },
      { text: 'Tietokoneen pelaajat tulevat seuraavaksi', size: 30, color: '#b8c2d0' },
    ], 7);
    return town;
  };

  const menu = new Menu(view.camera, input, settings, vr, {
    onChange: applySettings,
    recenter: () => head.recenter(),
    backToLobby: () => goTo(makeLobby),
    inLevel: () => inLevel,
  });

  applySettings();
  enter(makeLobby());

  if (vr) {
    setTimeout(() => {
      if (!head.hasSensor) {
        showHud([
          { text: 'Asentoanturi ei vastaa', size: 60, bold: true, color: '#ffb35c' },
          { text: 'Avaa peli HTTPS-osoitteesta Chromella', size: 36 },
        ], 8);
      }
    }, 2500);
  }

  const timer = new THREE.Timer();
  timer.connect(document);
  const frame = (dt: number) => {
    input.update();
    head.update();

    if (pending && view.fadeDone) {
      const factory = pending;
      pending = null;
      enter(factory());
    }

    const menuOpen = menu.update();
    player.update(dt, current.world, settings, !menuOpen && !pending);
    current.update(dt, player);

    if (hudTimer > 0) {
      hudTimer -= dt;
      if (hudTimer <= 0) hud.mesh.visible = false;
    }

    view.render(current.scene, dt);
  };
  view.renderer.setAnimationLoop((t) => {
    timer.update(t);
    frame(Math.min(timer.getDelta(), 0.05));
  });
  // Kehitystilassa testit voivat ajaa pelin ruutu kerrallaan.
  if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { player, view, input, frame };
}
