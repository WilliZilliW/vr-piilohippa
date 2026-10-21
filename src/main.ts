import * as THREE from 'three';
import { sfx } from './audio';
import { HeadTracker } from './head';
import { Input } from './input';
import { Lobby } from './lobby';
import { Menu } from './menu';
import { Player } from './player';
import type { GameScene, Role } from './scene';
import { loadSettings, saveSettings, type Mode } from './settings';
import { Hud } from './hud';
import { TouchControls } from './touch';
import { Town } from './town';
import { View } from './view';

const startScreen = document.getElementById('start')!;
document.getElementById('btn-vr')!.addEventListener('click', () => start('vr'));
document.getElementById('btn-touch')!.addEventListener('click', () => start('touch'));
document.getElementById('btn-flat')!.addEventListener('click', () => start('flat'));

/** Puhelimella: koko näyttö, vaakasuunta ja näyttö pysyy päällä. */
async function enterPhoneMode(): Promise<void> {
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

function start(mode: Mode): void {
  const vr = mode === 'vr';
  startScreen.style.display = 'none';
  sfx.init();
  if (mode !== 'flat') void enterPhoneMode();

  const settings = loadSettings(mode);
  const view = new View(vr);
  const input = new Input();
  const head = new HeadTracker(vr ? 'sensor' : mode === 'touch' ? 'touch' : 'mouse', view.renderer.domElement);
  const player = new Player(view, head, input);
  if (mode === 'touch') new TouchControls(input, head);

  const hud = new Hud(view.camera);

  let current: GameScene;
  let pending: (() => GameScene) | null = null;
  let inLevel = false;

  const applySettings = () => {
    view.applySettings(settings);
    sfx.setVolume(settings.volume / 100);
    current?.applyQuality(settings.quality);
    saveSettings(mode, settings);
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
    sfx.setOutdoor(false);
    view.setReticleVisible(true);
    return new Lobby(view.renderer, view.camera, input, (role) => goTo(() => makeTown(role)));
  };

  const makeTown = (role: Role): GameScene => {
    inLevel = true;
    sfx.setOutdoor(true);
    view.setReticleVisible(false);
    return new Town(view.renderer, role, { view, input, settings, hud, player, exit: () => goTo(makeLobby) });
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
        hud.show([
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
    // Valikon ollessa auki peli on tauolla.
    if (!menuOpen) current.update(dt, player);
    hud.update(dt);

    sfx.updateListener(view.camera, dt);
    view.render(current.scene, dt);
  };
  view.renderer.setAnimationLoop((t) => {
    timer.update(t);
    frame(Math.min(timer.getDelta(), 0.05));
  });
  // Kehitystilassa testit voivat ajaa pelin ruutu kerrallaan.
  if (import.meta.env.DEV) (window as unknown as { __game: unknown }).__game = { player, view, input, menu, frame, current: () => current };
}
